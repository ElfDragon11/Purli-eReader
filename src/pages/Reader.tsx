import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Book, FilterContent } from '../types/database';
import { supabase } from '../lib/supabase';
import { getFilterForBook } from '../lib/filters';
import { useAuth } from '../contexts/AuthContext';
import ePub from 'epubjs';

const Reader = () => {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const filtersRef = useRef<FilterContent | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const touchStartX = useRef<number | null>(null);
  const positionUpdateTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('resize', handleResize);
      document.body.style.overflow = '';
    };
  }, []);

  const normalizeText = (text: string) => {
    return text
      .replace(/['']/g, "'")
      .replace(/[""]/g, '"')
      .replace(/['’]/g, "'") // Replace curly single quotes
      .replace(/["“”]/g, '"') // Replace curly double quotes
      .normalize('NFKC');
  };

  const applyFilters = (content: string, FilterObject: FilterContent | null) => {
    let contentFilters = FilterObject;
    if (!contentFilters) return content;
    //console.log(contentFilters);
    let filteredContent = normalizeText(content); // Normalize the content

    // Handle section filtering first
    if (contentFilters.sections) {
      contentFilters.sections.forEach(section => {
        const startNormalized = normalizeText(section.start);
        const endNormalized = normalizeText(section.end);
  
        /*console.log('Normalized Start:', startNormalized);
        console.log('Normalized End:', endNormalized);

        // Create regex for just the start and end
        const startRegex = new RegExp(escapeRegExp(startNormalized), 'gi');
        const endRegex = new RegExp(escapeRegExp(endNormalized), 'gi');

        // Test if the start and end match the content
        const startMatch = filteredContent.match(startRegex);
        const endMatch = filteredContent.match(endRegex);
        
        console.log('Start Match:', startMatch);
        console.log('End Match:', endMatch);*/

  
        // Create a regex that matches from start to end, including newlines
        const sectionRegex = new RegExp(
          `${escapeRegExp(startNormalized)}[\\s\\S]*?${escapeRegExp(endNormalized)}`,
          'gi'
        );
  
        //console.log('Regex:', sectionRegex);
  
        // Replace the section with the replacement text or empty string
        filteredContent = filteredContent.replace(
          sectionRegex,
          section.replacement || ''
        );
      });
    }

    // Then handle phrases (longer matches first)
    if (contentFilters.phrases) {
      contentFilters.phrases.forEach(phrase => {
        const regex = new RegExp(normalizeText(phrase), 'gi');
        filteredContent = filteredContent.replace(regex, '*'.repeat(phrase.length));
      });
    }

    // Then handle individual words
    if (contentFilters.words) {
      contentFilters.words.forEach(word => {
        const regex = new RegExp(`\\b${normalizeText(word)}\\b`, 'gi');
        filteredContent = filteredContent.replace(regex, '***');
      });
    }

    // Finally handle replacements
    if (contentFilters.replacements) {
      contentFilters.replacements.forEach(({ original, replacement }) => {
        const regex = new RegExp(`\\b${original}\\b`, 'gi');
        filteredContent = filteredContent.replace(regex, replacement);
      });
    }

    return filteredContent;
  };

  // Helper function to escape special regex characters
  const escapeRegExp = (string: string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  };

  const savePosition = async (position: string) => {
    if (!bookId || !user) return;

    try {
      const { data, error: fetchError } = await supabase
        .from('book_positions')
        .select('id')
        .eq('book_id', bookId)
        .eq('user_id', user.id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      if (data) {
        await supabase
          .from('book_positions')
          .update({ position })
          .eq('id', data.id);
      } else {
        await supabase
          .from('book_positions')
          .insert({
            book_id: bookId,
            user_id: user.id,
            position
          });
      }
    } catch (err) {
      console.error('Error saving position:', err);
    }
  };

  const loadSavedPosition = async () => {
    if (!bookId || !user || !renditionRef.current) return;

    try {
      const { data, error } = await supabase
        .from('book_positions')
        .select('position')
        .eq('book_id', bookId)
        .eq('user_id', user.id)
        .single();

      if (error) {
        if (error.code !== 'PGRST116') {
          //throw error;
        }
        return;
      }

      if (data?.position) {
        await renditionRef.current.display(data.position);
      }
    } catch (err) {
      //console.error('Error loading saved position:', err);
    }
  };

  useEffect(() => {
    const fetchBook = async () => {
      try {
        if (!bookId) return;
  
        const { data, error: dbError } = await supabase
          .from('books')
          .select('*')
          .eq('id', bookId)
          .single();
  
        if (dbError) throw dbError;
        if (!data) throw new Error('Book not found');
  
        setBook(data);
  
        const bookFilters = await getFilterForBook(data.title, data.author, user?.id || '');
        if (!bookFilters) throw new Error('Failed to load filters');
        filtersRef.current = bookFilters;
        
        const { data: bookData, error: downloadError } = await supabase
          .storage
          .from('books')
          .download(data.file_path);
  
        if (downloadError) throw downloadError;
        if (viewerRef.current && bookData) {
          const arrayBuffer = await bookData.arrayBuffer();
          const book = ePub(arrayBuffer);

          await book.ready;
          const rendition = book.renderTo(viewerRef.current, {
            width: '100%',
            height: '100%',
            spread: 'none',
          });

              
          renditionRef.current = rendition;
          renditionRef.current.hooks.content.register((contents: any) => {
            const body = contents.document.querySelector('body');
            if (body) {
              body.style.backgroundColor = 'white'; // or '#ffffff'
              body.innerHTML = applyFilters(body.innerHTML, filtersRef.current);

              if (isMobile) {
                let startX: number | null = null;
          
                body.addEventListener('touchstart', (e: TouchEvent) => {
                  startX = e.touches[0].clientX;
                }, { passive: false });
          
                body.addEventListener('touchend', (e: TouchEvent) => {
                  if (startX === null) return;
                  const endX = e.changedTouches[0].clientX;
                  const diff = startX - endX;
          
                  if (Math.abs(diff) > 50) {
                    if (diff > 0) {
                      handleNextPage();
                    } else {
                      handlePrevPage();
                    }
                  }
          
                  startX = null;
                  /*body.addEventListener('click', (e: MouseEvent) => {
                    const x = e.clientX;
                    const width = window.innerWidth;
                
                    if (x < width / 3) {
                      handlePrevPage();
                    } else if (x > (width * 2) / 3) {
                      handleNextPage();
                    } else {
                      // Optional: open menu or do nothing
                    }
                  });*/
                },{ passive: false });
              } else {
                contents.document.addEventListener('keydown', (e: KeyboardEvent) => {
                  if (e.key === 'ArrowRight') {
                    handleNextPage();
                  } else if (e.key === 'ArrowLeft') {
                    handlePrevPage();
                  }
                });
              
                // Ensure the iframe body stays focusable
                contents.document.body.setAttribute('tabindex', '0');
                contents.document.body.focus();
                const iframeDocument = contents.document;
                if (iframeDocument) {
                  iframeDocument.body.style.margin = '0';
                  iframeDocument.body.style.padding = '0';
                  iframeDocument.documentElement.style.height = '100%';
                  iframeDocument.body.style.height = '100%';
                  iframeDocument.body.style.overflow = 'hidden';
                }
              }
          }
          
          return contents;
          });
  
          rendition.on('relocated', (location: any) => {
            setCurrentPage(location.start.displayed.page);
            //console.log('Page:', currentPage, 'of', totalPages)
            setTotalPages(location.total);

            // Save position with debounce
            if (positionUpdateTimeoutRef.current) {
              clearTimeout(positionUpdateTimeoutRef.current);
            }
            positionUpdateTimeoutRef.current = setTimeout(() => {
              savePosition(location.start.cfi);
            }, 1000);
          });

            rendition.display();
            loadSavedPosition();
              

        }
      } catch (err) {
        console.error('Error loading book:', err);
        setError(err instanceof Error ? err.message : 'Failed to load book');
      } finally {
        setLoading(false);
      }
    };
  
    fetchBook();
  
    return () => {
      if (renditionRef.current) {
        renditionRef.current.destroy();
      }
      if (positionUpdateTimeoutRef.current) {
        clearTimeout(positionUpdateTimeoutRef.current);
      }
    };
  }, [bookId, user, loading]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handlePrevPage();
      } else if (e.key === 'ArrowRight') {
        handleNextPage();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;

    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;

    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        handleNextPage();
      } else {
        handlePrevPage();
      }
    }

    touchStartX.current = null;
  };

  const handlePrevPage = () => {
    renditionRef.current?.prev();
  };

  const handleNextPage = () => {
    renditionRef.current?.next();
  };

  if (loading || !filtersRef.current) {
    return (
      <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-8">
        <div className="flex items-center justify-center h-[80vh] text-gray-500">
          Loading book...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gray-100">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-100">
      <div className="bg-white shadow-sm">
        <div className={`${isMobile ? 'px-4' : 'container mx-auto px-4'} h-16 flex items-center`}>
          <button
            onClick={() => navigate('/library')}
            className="text-gray-600 hover:text-gray-900 mr-4"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>
          {book && (
            <div className="flex-1">
              <h1 className="text-lg font-semibold text-gray-900 line-clamp-1">{book.title}</h1>
              <p className="text-sm text-gray-600">{book.author}</p>
            </div>
          )}
          {totalPages > 0 && (
            <div className="text-sm text-gray-500">
              Page {currentPage} of {totalPages}
            </div>
            
          )}
        </div>
      </div>

      <div className="flex-1 flex justify-center overflow-hidden">
        <div 
          className={`bg-white shadow-md ${isMobile ? 'w-full' : 'w-[724px]'} h-full`}
          onTouchStart={isMobile ? handleTouchStart : undefined}
          onTouchEnd={isMobile ? handleTouchEnd : undefined}
        >
          <div ref={viewerRef} id="epub-viewer" className={`h-full ${isMobile ? '' : 'touch-pan-y'} overflow-hidden touch-none`}   />
        </div>
      </div>
    </div>
  );
};

export default Reader;