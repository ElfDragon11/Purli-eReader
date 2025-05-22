import { FilterContent } from '../types/database';
import { supabase } from './supabase';
import { PostgrestError } from '@supabase/supabase-js';

const DEFAULT_FILTER: FilterContent = {
  words: ['damn', 'damned', 'damning', 'hell', 'fuck', 'fucking', 'fucked', 'fucks', 'shit', 'shitting', 'shitted', 'shits', 'ass', 'asses', 'asshole', 'bitch', 'penus', 'pussy', 'vagina', 'clit', 'motherfuck', 'motherfucker', 'motherfucking', 'motherfuckers', ],
  phrases: [],
  sections: [],
};

const emptyFilter: FilterContent = {
  words: [],
  phrases: [],
  sections: [],
};

const mergeFilters = (defaultFilter: FilterContent, customFilter: FilterContent): FilterContent => {
  return {
    // Merge and deduplicate words
    words: Array.from(new Set([...(defaultFilter.words || []), ...(customFilter.words || [])])),
    
    // Merge and deduplicate phrases
    phrases: Array.from(new Set([...(defaultFilter.phrases || []), ...(customFilter.phrases || [])])),
    
    // Merge sections (no deduplication needed as they're unique by nature)
    sections: [...(defaultFilter.sections || []), ...(customFilter.sections || [])],
  };
};

export const createFilter = async (book_id:any, filter:FilterContent) => {
      const { error: insertError } = await supabase
      .from('filters')
      .insert({
        book_id: book_id,
        content: filter
      });

      if (insertError) {
        console.error('Error creating empty filter:', insertError);
      }
      return insertError;

}

export const getBook = async (title: string, author: string, user_id:string): Promise<{data: {id:any}|null, error: PostgrestError|null}> => {
    // First, find the book ID using title and author
    const { data: books, error: bookError } = await supabase
      .from('books')
      .select('id')
      .eq('user_id', user_id)
      .eq('title', title)
      .eq('author', author)
      .limit(1)
      .single();

      if (bookError) {
        console.error('Error fetching book:', bookError);
        return { data: null, error: bookError };
      }
    
      if (!books) {
        console.warn('No book found with the given title and author.');
        return { data: null, error: null };
      }
  return {data: books, error: bookError};
}

export const getFilterForBook = async (title: string, author: string, user_id:string): Promise<FilterContent> => {
  try {
    // First, find the book ID using title and author
    const { data: books, error: bookError } = await getBook(title, author, user_id);
    
    /*const { data: books, error: bookError } = await supabase
      .from('books')
      .select('id')
      .eq('user_id', user_id)
      .eq('title', title)
      .eq('author', author)
      .limit(1)
      .single();
      */
    if (bookError) {
      console.log(`No book found for "${title}" by ${author}. Using default filter.`);
      return DEFAULT_FILTER;
    }

    // Get the filter file for this book
    const { data: filterFile, error: filterError } = await supabase
      .from('filters')
      .select('content')
      .eq('book_id', books!.id)
      .limit(1)
      .single();

    if (filterError) {
      console.log(`No filter found for "${title}" by ${author}. Creating filter.`);
      createFilter(books!.id, emptyFilter);
      return DEFAULT_FILTER;
    }

    // Validate the filter content structure
    const filterContent = filterFile.content as FilterContent;
    if (!isValidFilterContent(filterContent)) {
      console.log(JSON.stringify(filterFile.content, null, 2));
      console.log('Filter:', filterContent);
      console.error('Invalid filter content structure. Using default filter.');
      return DEFAULT_FILTER;
    }

    // Merge the default filter with the custom filter
    return mergeFilters(DEFAULT_FILTER, filterContent);
  } catch (error) {
    console.error('Error fetching filter:', error);
    return DEFAULT_FILTER;
  }
};

const isValidFilterContent = (content: any): content is FilterContent => {
  return (
    content &&
    Array.isArray(content.words) &&
    Array.isArray(content.phrases) &&
    Array.isArray(content.sections) &&
    content.sections.every((section: any) =>
      typeof section.start === 'string' &&
      typeof section.end === 'string' &&
      (section.replacement === null || typeof section.replacement === 'string')
    )
  );
};
