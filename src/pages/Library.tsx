import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Upload, Book as BookIcon, AlertCircle, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { uploadBook, getBooks, extractEpubMetadata,supabase } from '../lib/supabase';
import type { Book as BookType } from '../types/database';
import { toast } from 'react-toastify'; 
import GetBooksButton from "../components/GetBooksButton";
import { createFilter, getBook } from '../lib/filters';

const Library = () => {
  const { user, loading } = useAuth();
  const [books, setBooks] = useState<BookType[]>([]);
  const [loadingProcess, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate()
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const from = params.get('from');

    if (from === 'checkout_session') {
      toast.success('Thank you for subscribing! You can manage your subscription in your profile.', {
        position: "top-right",
        autoClose: 5000, // Adjust as needed
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
      });
    }
  }, [location])

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
    loadBooks();
  }, [user, loading]);

  const loadBooks = async () => {
    try {
      if (!user) return;
      const books = await getBooks(user.id);
      setBooks(books);
    } catch (err) {
      setError('Failed to load books');
      console.error('Error loading books:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
  
    setUploading(true);
    setError(null);
  
    try {
      const metadata = await extractEpubMetadata(file);
      const { filePath, coverPath } = await uploadBook(file, user.id, metadata.cover);
  
      const { error: dbError } = await supabase
        .from('books')
        .insert({
          title: metadata.title,
          author: metadata.author,
          file_path: filePath,
          cover_path: coverPath,
          user_id: user.id
        });
      
        notifyAdminBookUpload(metadata.title, user.email ? user.email : `User id: ${user.id}`);
        
        // ─────── 2) Create signed URL (60 s) ───────
        const { data: signed, error: signErr } = await supabase
        .storage
        .from("books")
        .createSignedUrl(filePath, 60);

        if (signErr || !signed?.signedUrl) throw signErr;

        // ─────── 3) Call Cloud-Run filter service ───────
        const res = await fetch(
          "https://generate-filter-gemini-478949773026.us-central1.run.app/filter_epub_handler",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ epub_url: signed.signedUrl }),
          }
        );

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Filter service failed");
        }

        const json = await res.json()

        // ─────── 4) Store JSON in `filters` table ───────
        const { data: book, error: bookError } = await getBook( metadata.title, metadata.author, user.id);
        console.log("filter", json);
        const insertError = createFilter(book!.id, json);
        if(insertError) {
          console.error("Error inserting filter:", insertError);
          //throw insertError;
        }


      if (dbError) throw dbError;
      await loadBooks();
    } catch (err) {
      setError('Failed to upload book');
      console.error('Error uploading book:', err);
    } finally {
      setUploading(false);
    }
  };
  
  // JavaScript code to call the PHP script (example using fetch)
const notifyAdminBookUpload = async (bookTitle: string, uploaderEmail: string) => {
  const phpScriptUrl = 'https://purlibooks.com/notifyAdminBookUpload.php'; // Replace with your PHP script URL

  try {
    const response = await fetch(phpScriptUrl, {
      method: 'POST', // Or 'GET', depending on your preference
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded', // Required for POST requests
      },
      body: new URLSearchParams({
        bookTitle: encodeURIComponent(bookTitle), // URL-encode the parameters
        uploaderEmail: encodeURIComponent(uploaderEmail),
      }),
    });

    if (!response.ok) {
      console.error(`Error calling PHP script: ${response.status} ${response.statusText}`);
      return;
    }

    const responseText = await response.text();
    console.log('PHP script response:', responseText);
  } catch (error) {
    console.error('Error calling PHP script:', error);
  }
};

// Example usage (assuming you have bookTitle and uploaderEmail variables)


  const handleDeleteBook = async (bookId: string) => {
    setIsDeleting(true);
    try {
      const book = books.find(b => b.id === bookId);
      if (!book) return;

      // Delete book file
      if (book.file_path) {
        await supabase.storage
          .from('books')
          .remove([book.file_path]);
      }

      // Delete cover if exists
      if (book.cover_path) {
        await supabase.storage
          .from('books')
          .remove([book.cover_path]);
      }

      // Delete book record (this will cascade delete positions due to FK constraint)
      await supabase
        .from('books')
        .delete()
        .eq('id', bookId);

      setShowConfirmation(null);
      await loadBooks();
    } catch (err) {
      setError('Failed to delete book');
      console.error('Error deleting book:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  if (loadingProcess) {
    return (
      <div className="max-w-6xl mx-auto px-4">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="text-center py-8 text-gray-500">
            Loading your library...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900">My Library</h1>
        <div className="flex items-center space-x-4">
          <div className="relative group">
            <button
              className="text-deep-navy bg-white border border-deep-navy rounded-full w-6 h-6 flex items-center justify-center font-bold text-sm hover:bg-deep-navy hover:text-white transition"
              title="How Purli works"
            >
              ?
            </button>

            <div className="absolute top-full right-0 mt-2 w-72 bg-white border border-gray-200 rounded-md shadow-lg p-4 text-sm text-gray-700 z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
              <p className="mb-2 font-semibold text-deep-navy">How to use the Purli E-Reader</p>
                <p>Upload your book in ePub format using the Upload button</p>
                <p>Purli will scan the file and apply a content filter if one exists.</p>
                <p>Click a book in your library to start reading. Inapproriate content is visually hidden. The original file is unchanged.</p>
            </div>
          </div>

          {/* Your existing Upload button */}
          <label className={`cursor-pointer bg-deep-navy text-white px-4 py-2 rounded-lg hover:bg-lighter-navy transition-colors flex items-center space-x-2 ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <Upload className="h-5 w-5 " />
            <span>{uploading ? 'Uploading...' : 'Upload Book'}</span>
            <input
              type="file"
              accept=".epub"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md flex items-center gap-2 text-red-700">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md p-6">
        {books.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <p className="text-gray-600">You have no books yet.</p>
            <GetBooksButton />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {books.map((book) => (
              <div key={book.id} className="group relative">
                <Link
                  to={`/reader/${book.id}`}
                  className="flex flex-col items-center"
                >
                  <div className="w-32 h-48 relative shadow-md transition-transform group-hover:scale-105">
                    {book.cover_path ? (
                      <img
                        src={book.cover_url}
                        alt={book.title}
                        className="w-full h-full object-cover rounded"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.onerror = null;
                          target.parentElement!.innerHTML = `<div class="w-full h-full bg-gray-100 flex items-center justify-center rounded"><svg class="h-8 w-8 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"></path></svg></div>`;
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-100 flex items-center justify-center rounded">
                        <BookIcon className="h-8 w-8 text-gray-400" />
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        setShowConfirmation(book.id);
                      }}
                      className="absolute top-2 right-2 p-1.5 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Delete book"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 text-center">
                    <h3 className="text-sm font-medium text-gray-900 line-clamp-1">{book.title}</h3>
                    <p className="text-xs text-gray-500 line-clamp-1">{book.author}</p>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {showConfirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Delete Book</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this book? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setShowConfirmation(null)}
                className="px-4 py-2 text-gray-600 hover:text-gray-900"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteBook(showConfirmation)}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Library;