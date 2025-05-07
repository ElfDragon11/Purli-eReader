import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:epub/epub.dart' as epub;
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'reader_page.dart';

final supabase = Supabase.instance.client;

class LibraryPage extends StatefulWidget {
  const LibraryPage({Key? key}) : super(key: key);
  
    @override
    State<LibraryPage> createState() => _LibraryPageState();
  }

    class Book {
      final String id;
      final String title; 
      final String filePath;
      final String author;
      final String? coverPath;
      Book({required this.id, 
            required this.title, 
            required this.filePath,
            required this.author, required this.coverPath});
    }

    class _LibraryPageState extends State<LibraryPage> {
  List<Book> _books = [];

  bool _isLoading = true;
  String? _errorMessage;

    @override
  void initState() {
    super.initState();
    _fetchBooks();
  }

  Future<void> _fetchBooks() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
   });
    
    try {
        final userId = supabase.auth.currentUser?.id; // Get the current user ID
      if (userId == null) {
         ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('User is not authenticated')));
         setState(() {
           _errorMessage = 'User is not authenticated';
         });
      }

      final response = await supabase.from('books').select('id, title, file_path, author, cover_path').eq('user_id', userId);
      for (var item in response) {
        // TODO: Adjust the fields here based on your book data structure
        fetchedBooks.add(Book(id: item['id'], 
                                title: item['title'], 
                                filePath: item['file_path'], 
                                author: item['author'], 
                                coverPath: item['cover_path']));
      } // Assuming 'title' and 'id' and 'file_path' columns exists

     setState(() {
        _books = fetchedBooks;
      });
    
    } on PostgrestException catch (error){
         ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to load books: ${error.message}')));
         _errorMessage = error.message;
      } catch (e) {
       ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('An unexpected error occurred')));
      _errorMessage = 'An unexpected error occurred';
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }
    
    Future<void> _uploadBook() async {
    FilePickerResult? result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['epub'],
    );
    
    if (result != null) {
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      try {

        final userId = supabase.auth.currentUser?.id;
        if (userId == null) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('User is not authenticated')));
          setState(() {
            _errorMessage = 'User is not authenticated';
          });
        }

        final fileBytes = result.files.first.bytes!;
        final fileName = result.files.first.name;
        //parse epub for metadata
        final epubBook = await epub.EpubReader.readBook(fileBytes);

        //Extract metadata, handle null values
        final bookTitle = epubBook.Title;    
        final title = bookTitle == null ? fileName : bookTitle; 
        final bookAuthor = epubBook.Author;   
        //Handle no author data
        final author = bookAuthor == null ? 'Unknown Author' : bookAuthor;

        // Handle cover image
        final coverPath = await _uploadCoverImage(epubBook, fileName);

        // Upload to Supabase Storage
        await supabase.storage.from('book_uploads').uploadBinary(fileName, fileBytes);

        // Create signed URL
        final signedUrlResponse = await supabase.storage.from('book_uploads').createSignedUrl(fileName, 60);
        final signedUrl = signedUrlResponse.signedUrl;

        // Make HTTP POST request to Cloud Run
        if (signedUrl != null) {
            final cloudRunResponse = await http.post(
            Uri.parse('https://generate-filter-gemini-478949773026.us-central1.run.app/filter_epub_handler'),
            headers: <String, String>{
              'Content-Type': 'application/json; charset=UTF-8',
            },
            body: '{"epub_url": "$signedUrl"}',
            );

            if (cloudRunResponse.statusCode == 200) {
              // Parse the JSON response
              final jsonResponse = jsonDecode(cloudRunResponse.body);
              
              // Insert book metadata into the 'books' table
              final bookResponse = await supabase.from('books').insert({
                'title': title,
                'author': author,
                'file_path': fileName,
                'cover_path': coverPath,
                'user_id': userId,
              }).select();
              // Get the book ID from the response
              final bookId = bookResponse.first['id'];

              // Insert filter data into the 'filters' table
              await supabase.from('filters').insert({
                'book_id': bookId,
                'content': jsonResponse,
              });
              
              await _fetchBooks(); //refresh the state with the newly added book
              
            } else {
              // Handle error
              throw Exception('Cloud Run request failed with status: ${cloudRunResponse.statusCode}');
            }
          }else {
            throw Exception('Failed to create signed URL');
          }
       } on StorageException catch(error){
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to upload book: ${error.message}')));
        _errorMessage = 'Failed to upload book: ${error.message}';

      } on PostgrestException catch(error){
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to insert data in table: ${error.message}')));
        _errorMessage = 'Failed to insert book data in table: ${error.message}';
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to upload book: $e')));
        _errorMessage = 'Failed to upload book: $e';
      } finally {
        setState(() {
          _isLoading = false;
        });
      }
    }else{
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No file was selected')));
        setState(() {
          _errorMessage = 'No file was selected';
        });
    }
  }
    Future<String> _uploadCoverImage(epub.EpubBook epubBook, String fileName) async {
    String coverPath = '';
    if (epubBook.CoverImage != null) {
      try {
        final coverBytes = epubBook.CoverImage!.Content!;
        final coverName = '${fileName}_cover.jpg'; 
        
        // Upload cover image to Supabase Storage
        await supabase.storage.from('book_covers').uploadBinary(coverName, coverBytes);
        coverPath = coverName;
      } on StorageException catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error uploading cover image: ${e.message}')));
        coverPath = '';
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error extracting cover image: $e')));
        coverPath = '';
      }
    }
    return coverPath;
  }


  Future<void> _deleteBook(String bookTitle) async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      // First, fetch the book data to get the file path
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) {
        throw Exception('User is not authenticated');
      }
      final List<dynamic> response = await supabase
        .from('books')
       .select('''
          *, user_id:auth.users!inner(*)
        ''')
          .eq('user_id', userId)
          .eq('title', bookTitle);

      if (response.isEmpty) {
        throw Exception('Book not found');
      }

      final bookData = response.first;
      // TODO: Replace 'file_path' with the actual column name for the file path in your database
      final filePath = bookData['file_path'];

      // Delete the file from Supabase Storage
      if (filePath != null) {
        // TODO: Replace 'book_uploads' with your actual Supabase Storage bucket name
        await supabase.storage.from('book_uploads').remove([filePath]);
      }

      // Then, delete the book from the database
      // TODO: adjust the query if you don't have a title and id column in the book table
      await supabase.from('books').delete().eq('title', bookTitle);
      
      // Remove the deleted book from the local list
      setState(() {
          _books.removeWhere((book) => book.title == bookTitle);
          });
       ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Book deleted successfully')));
    } on PostgrestException catch (error) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to delete book: ${error.message}')));
          _errorMessage = error.message;
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to delete book: $e')));
        _errorMessage = 'Failed to delete book: $e';
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  void _showDeleteConfirmationDialog(String bookId) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Confirm Deletion'),
        content: const Text('Are you sure you want to delete this book?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
          TextButton(onPressed: () { _deleteBook(bookId); Navigator.of(context).pop();}, child: const Text('Delete')),
        ],
      ),
    );
  }
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Library'),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _uploadBook,
        child: const Icon(Icons.add),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(child: Text(_errorMessage!))
              : _books.isEmpty ? const Center(child: Text('No books available.')): ListView.builder(
                  itemCount: _books.length,
                  itemBuilder: (context, index) {                     
                    final bookTitle = _books[index].title;
                     return Card(
                      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      child: ListTile(
                        title: Text(bookTitle),
                         // TODO: Update the ListTile to display other book information
                        // Example: Add subtitle with book author
                         trailing: IconButton(
                          icon: const Icon(Icons.delete),
                           onPressed: () {
                            _showDeleteConfirmationDialog(_books[index].id);
                          },
                        ),
                        
                         // Add a cover image
                        onTap: () {
                          // Navigate to the Reader page and pass the book title
                          _handleBookTap(bookTitle);
                        },
                      ),
                    );

                  },
             ),
    );
  }

  void _handleBookTap(String bookTitle) {
    print('Tapped on: $bookTitle');
  }
}
          } else {
            // Handle error
            print('Cloud Run request failed with status: ${cloudRunResponse.statusCode}');
          }
        }
         ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Book uploaded successfully!')));
       } on StorageException catch(error){
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to upload book: ${error.message}')));
        _errorMessage = 'Failed to upload book: ${error.message}';

      }catch (e) {
         ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to upload book: $e')));
        _errorMessage = 'Failed to upload book: $e';
      } finally {
        setState(() {
          _isLoading = false;
        });
      }
    }else{
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No file was selected')));
        setState(() {
          _errorMessage = 'No file was selected';
        });
    }
  }

  Future<void> _deleteBook(String bookTitle) async {
      setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      // First, fetch the book data to get the file path
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) {
        throw Exception('User is not authenticated');
      }
      final List<dynamic> response = await supabase
        .from('books')
       .select('''
          *, user_id:auth.users!inner(*)
        ''')
          .eq('user_id', userId)
          .eq('title', bookTitle);

      if (response.isEmpty) {
        throw Exception('Book not found');
      }

      final bookData = response.first;
      // TODO: Replace 'file_path' with the actual column name for the file path in your database
      final filePath = bookData['file_path'];

      // Delete the file from Supabase Storage
      if (filePath != null) {
        // TODO: Replace 'book_uploads' with your actual Supabase Storage bucket name
        await supabase.storage.from('book_uploads').remove([filePath]);
      }

      // Then, delete the book from the database
      // TODO: adjust the query if you don't have a title and id column in the book table
      await supabase.from('books').delete().eq('title', bookTitle);
      
      // Remove the deleted book from the local list
      setState(() {
          _books.removeWhere((book) => book.title == bookTitle);
          });
       ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Book deleted successfully')));
    } on PostgrestException catch (error) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to delete book: ${error.message}')));
          _errorMessage = error.message;
      } catch (e) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to delete book: $e')));
        _errorMessage = 'Failed to delete book: $e';
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
  }

  void _showDeleteConfirmationDialog(String bookId) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Confirm Deletion'),
        content: const Text('Are you sure you want to delete this book?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
          TextButton(onPressed: () { _deleteBook(bookId); Navigator.of(context).pop();}, child: const Text('Delete')),
        ],
      ),
    );
  }
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Library'),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _uploadBook,
        child: const Icon(Icons.add),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(child: Text(_errorMessage!))
              : _books.isEmpty ? const Center(child: Text('No books available.')): ListView.builder(
                  itemCount: _books.length,
                  itemBuilder: (context, index) {                     
                    final book = _books[index];
                    final fullCoverUrl = book.coverPath != null && book.coverPath!.isNotEmpty
                    ? '${supabase.storageUrl}/object/public/book_covers/${book.coverPath}'
                    : null;
                     return Card(
                      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      child: ListTile(
                        leading: fullCoverUrl != null
                            ? Image.network(fullCoverUrl)
                            : const Icon(Icons.book),
                        title: Text(book.title),
                        subtitle: Text(book.author),
                         trailing: IconButton(
                          icon: const Icon(Icons.delete),
                          onPressed: () {
                            _showDeleteConfirmationDialog(book.id);

                          },
                        ),
                        
                         // Add a cover image
                        onTap: () {
                          // Navigate to the Reader page and pass the book title
                          _handleBookTap(bookTitle);
                          },
                      ),
                    );

                  },
             ),
    );
  }

  void _handleBookTap(String bookTitle) {
    print('Tapped on: $bookTitle');
  }
}y