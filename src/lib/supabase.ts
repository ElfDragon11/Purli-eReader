import { createClient } from '@supabase/supabase-js';
import ePub from 'epubjs';
import { extractCover } from './extractCover';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const extractEpubMetadata = async (file: File) => {
  return new Promise<{
    title: string;
    author: string;
    cover: Blob | null;
  }>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const book = ePub(arrayBuffer);
        await book.ready;

        const metadata = await book.loaded.metadata;
        const coverBlob = await extractCover(file);

        resolve({
          title: metadata.title || file.name.replace(/\.[^/.]+$/, ""),
          author: metadata.creator || 'Unknown',
          cover: coverBlob,
        });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};



export const uploadBook = async (
  file: File,
  userId: string,
  coverBlob: Blob | null
): Promise<{ filePath: string; coverPath: string | null }> => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
  const filePath = `${userId}/${fileName}`;

  // Upload book file
  const { error: bookUploadError } = await supabase.storage
    .from('books')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    });

  if (bookUploadError) throw bookUploadError;

  // Upload cover if available
  let coverPath: string | null = null;

  if (coverBlob) {
    const coverFileName = `${Math.random().toString(36).substring(2)}.jpg`;
    coverPath = `${userId}/covers/${coverFileName}`;

    const { error: coverUploadError } = await supabase.storage
      .from('books')
      .upload(coverPath, coverBlob, {
        cacheControl: '3600',
        upsert: true,
        contentType: 'image/jpeg',
      });

    if (coverUploadError) throw coverUploadError;
  }

  return { filePath, coverPath };
};


export const getBooks = async (userId: string) => {
  const { data, error } = await supabase
    .from('books')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const booksWithUrls = await Promise.all(
    data.map(async (book) => {
      if (!book.cover_path) return book;

      const { data: signedData } = await supabase.storage
        .from('books')
        .createSignedUrl(book.cover_path, 60 * 60);

      return {
        ...book,
        cover_url: signedData?.signedUrl ?? null
      };
    })
  );

  return booksWithUrls;
};