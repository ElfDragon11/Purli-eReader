import 'package:flutter/material.dart';
import 'package:file_picker/file_picker.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
// import 'package:epub/epub.dart' as epub; // Original import
import 'package:epub_parser/epub_parser.dart' as epub; // Changed to epub_parser
import 'package:http/http.dart' as http;
import 'dart:convert';
import 'reader_page.dart';
import 'package:path/path.dart' as p; // Added path import

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
    // Ensure widget is mounted before calling setState
    if (!mounted) return;
    setState(() {
      _isLoading = true;
      _errorMessage = null;
   });
    
    try {
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) {
         // Ensure widget is mounted before showing SnackBar or calling setState
        if (!mounted) return;
         ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('User is not authenticated')));
         setState(() {
           _errorMessage = 'User is not authenticated';
           _isLoading = false; // Also set loading to false here
         });
         return; // Return early if user is not authenticated
      }

      final response = await supabase.from('books').select('id, title, file_path, author, cover_path').eq('user_id', userId);
      
      // Initialize fetchedBooks as a new list for this fetch operation
      List<Book> fetchedBooks = [];
      for (var item in response) {
        fetchedBooks.add(Book(id: item['id'], 
                                title: item['title'], 
                                filePath: item['file_path'], 
                                author: item['author'], 
                                coverPath: item['cover_path']));
      }

      // Ensure widget is mounted before calling setState
      if (!mounted) return;
     setState(() {
        _books = fetchedBooks;
      });
    
    } on PostgrestException catch (error){
         // Ensure widget is mounted before showing SnackBar or calling setState
        if (!mounted) return;
         ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to load books: ${error.message}')));
         setState(() {
           _errorMessage = error.message;
         });
      } catch (e) {
        // Ensure widget is mounted before showing SnackBar or calling setState
        if (!mounted) return;
       ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('An unexpected error occurred')));
      setState(() {
        _errorMessage = 'An unexpected error occurred';
      });
    } finally {
      // Ensure widget is mounted before calling setState
      if (!mounted) return;
      setState(() {
        _isLoading = false;
      });
    }
  }
    
  Future<void> _uploadBook() async {
    // Ensure widget is mounted before proceeding
    if (!mounted) return;

    FilePickerResult? result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['epub'],
    );
    
    if (result != null && result.files.first.bytes != null) { // Added null check for bytes
      // Ensure widget is mounted before calling setState
      if (!mounted) return;
      setState(() {
        _isLoading = true;
        _errorMessage = null;
      }); // Moved setState call to be unconditional after result check

      try { // Moved try block to encompass the whole operation
        final userId = supabase.auth.currentUser?.id;
        if (userId == null) {
          // Ensure widget is mounted before showing SnackBar or calling setState
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('User is not authenticated')));
          setState(() {
            _errorMessage = 'User is not authenticated';
            _isLoading = false; // Set loading to false
          });
          return; // Return early
        }

        final fileBytes = result.files.first.bytes!;
        final originalEpubFileName = result.files.first.name;
        final epubBook = await epub.EpubReader.readBook(fileBytes);

        final bookTitle = epubBook.Title;    
        final title = bookTitle ?? originalEpubFileName; // Simplified null check
        final bookAuthor = epubBook.Author;   
        final author = bookAuthor ?? 'Unknown Author'; // Simplified null check

        // Call _uploadCoverImage with userId and originalEpubFileName
        final String? coverPath = await _uploadCoverImage(epubBook, originalEpubFileName, userId);

        // Construct the EPUB upload path using userId
        final String epubUploadPath = '$userId/$originalEpubFileName';
        await supabase.storage.from('books').uploadBinary(epubUploadPath, fileBytes);

        // Create signed URL from 'books' bucket with the correct path
        final signedUrl = await supabase.storage.from('books').createSignedUrl(epubUploadPath, 60); 

        if (signedUrl.isNotEmpty) { // Check if URL is not empty
            final cloudRunResponse = await http.post(
            Uri.parse('https://generate-filter-gemini-478949773026.us-central1.run.app/filter_epub_handler'),
            headers: <String, String>{
              'Content-Type': 'application/json; charset=UTF-8',
            },
            body: jsonEncode(<String, String>{'epub_url': signedUrl}), // Use jsonEncode
            );

            if (cloudRunResponse.statusCode == 200) {
              final jsonResponse = jsonDecode(cloudRunResponse.body);
              
              final bookResponse = await supabase.from('books').insert({
                'title': title,
                'author': author,
                'file_path': epubUploadPath, // Store the full path
                'cover_path': coverPath,    // Store the full path
                'user_id': userId,
              }).select().single();
              
              final bookId = bookResponse['id'];

              await supabase.from('filters').insert({
                'book_id': bookId,
                'content': jsonResponse, 
              });
              
              await _fetchBooks(); 
              // Ensure widget is mounted before showing SnackBar
              if (!mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Book uploaded successfully!'))); 
              
            } else {
              throw Exception('Cloud Run request failed with status: ${cloudRunResponse.statusCode}');
            }
          }else {
            throw Exception('Failed to create signed URL or URL is empty');
          }
       } on StorageException catch(error){
        // Ensure widget is mounted before showing SnackBar or calling setState
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Storage Error: ${error.message}')));
        setState(() {
          _errorMessage = 'Storage Error: ${error.message}';
        });
      } on PostgrestException catch(error){
        // Ensure widget is mounted before showing SnackBar or calling setState
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Database Error: ${error.message}')));
        setState(() {
          _errorMessage = 'Database Error: ${error.message}';
        });
      } catch (e) {
        // Ensure widget is mounted before showing SnackBar or calling setState
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to upload book: $e')));
        setState(() {
          _errorMessage = 'Failed to upload book: $e';
        });
      } finally {
        // Ensure widget is mounted before calling setState
        if (!mounted) return;
        setState(() {
          _isLoading = false;
        });
      }
    }else{
        // Ensure widget is mounted before showing SnackBar or calling setState
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('No file was selected or file is empty')));
        setState(() {
          _errorMessage = 'No file was selected or file is empty';
          _isLoading = false; // Also set loading to false here
        });
    }
  }

  Future<String?> _uploadCoverImage(epub.EpubBook epubBook, String originalEpubFileName, String userId) async {
    if (epubBook.CoverImage != null) { 
      try {
        final coverBytes = epubBook.CoverImage!;
        // Use p.basenameWithoutExtension to get filename without extension
        final coverFileName = '${p.basenameWithoutExtension(originalEpubFileName)}_cover.jpg'; 
        // Construct path with userId and 'covers' folder
        final String uploadPath = '$userId/covers/$coverFileName';
        
        await supabase.storage.from('books').uploadBinary(uploadPath, coverBytes);
        return uploadPath; // Return the full path
      } on StorageException catch (e) {
        // Ensure widget is mounted before showing SnackBar
        if (!mounted) return null;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error uploading cover image: ${e.message}')));
        // coverPath = \'\';
      } catch (e) {
        // Ensure widget is mounted before showing SnackBar
        if (!mounted) return null;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error extracting cover image: $e')));
        // coverPath = \'\';
      }
    }
    return null; // Return null if no cover or error
  }

  Future<void> _deleteBook(String bookId) async { 
    // Ensure widget is mounted before calling setState
    if (!mounted) return;
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    try {
      final userId = supabase.auth.currentUser?.id;
      if (userId == null) {
        throw Exception('User is not authenticated');
      }
      // Fetch the book by ID to get file_path and cover_path
      final bookDataResponse = await supabase
        .from('books')
        .select('file_path, cover_path')
        .eq('id', bookId) 
        .eq('user_id', userId)
        .single(); // Expect a single book

      // final bookData = bookDataResponse.first; // Not needed if using .single()
      final filePath = bookDataResponse['file_path'] as String?;
      final coverPath = bookDataResponse['cover_path'] as String?;


      // Delete the book file from Supabase Storage - use 'books' bucket
      if (filePath != null && filePath.isNotEmpty) {
        await supabase.storage.from('books').remove([filePath]);
      }
      // Delete the cover image from Supabase Storage - use 'books' bucket
      if (coverPath != null && coverPath.isNotEmpty) {
        await supabase.storage.from('books').remove([coverPath]);
      }

      // Delete the book from the database by ID
      await supabase.from('books').delete().eq('id', bookId).eq('user_id', userId);
      
      // Ensure widget is mounted before calling setState or showing SnackBar
      if (!mounted) return;
      setState(() {
          _books.removeWhere((book) => book.id == bookId); // Delete by ID
      });
       ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Book deleted successfully')));
    } on PostgrestException catch (error) {
          // Ensure widget is mounted before showing SnackBar or calling setState
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to delete book: ${error.message}')));
          setState(() {
            _errorMessage = error.message;
          });
      } catch (e) {
        // Ensure widget is mounted before showing SnackBar or calling setState
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed to delete book: $e')));
        setState(() {
          _errorMessage = 'Failed to delete book: $e';
        });
    } finally {
      // Ensure widget is mounted before calling setState
      if (!mounted) return;
      setState(() {
        _isLoading = false;
      });
    }
  }

  void _showDeleteConfirmationDialog(String bookId) { // Parameter changed to bookId
    // Ensure widget is mounted before showing Dialog
    if (!mounted) return;
    showDialog(
      context: context,
      builder: (BuildContext dialogContext) => AlertDialog( // Added BuildContext for clarity
        title: const Text('Confirm Deletion'),
        content: const Text('Are you sure you want to delete this book?'),
        actions: [
          TextButton(onPressed: () => Navigator.of(dialogContext).pop(), child: const Text('Cancel')), // Use dialogContext
          TextButton(onPressed: () { _deleteBook(bookId); Navigator.of(dialogContext).pop();}, child: const Text('Delete')), // Use dialogContext
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Library'),
        actions: [ // Added a refresh button for convenience
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _fetchBooks,
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _uploadBook,
        child: const Icon(Icons.add),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(child: Padding( // Added padding to error message
                  padding: const EdgeInsets.all(16.0),
                  child: Text(_errorMessage!, textAlign: TextAlign.center),
                ))
              : _books.isEmpty 
                  ? const Center(child: Text('No books available. Tap the + button to add one!')) // Improved empty state message
                  : ListView.builder(
                  itemCount: _books.length,
                  itemBuilder: (context, index) {                     
                    final book = _books[index]; 
                    // Construct full URL for cover image, handle null or empty coverPath
                    // Use 'books' bucket
                    final String? fullCoverUrl = book.coverPath != null && book.coverPath!.isNotEmpty
                        ? supabase.storage.from('books').getPublicUrl(book.coverPath!)
                        : null;
                    
                    print('Attempting to load cover from URL: $fullCoverUrl');

                     return Card(
                      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      child: ListTile(
                        leading: fullCoverUrl != null && fullCoverUrl.isNotEmpty
                            ? Image.network(
                                fullCoverUrl,
                                width: 50, // Specify width for consistency
                                fit: BoxFit.cover, // Ensure image covers the space
                                errorBuilder: (context, error, stackTrace) => const Icon(Icons.broken_image), // Handle image load errors
                              )
                            : const Icon(Icons.book, size: 50), // Default icon if no cover
                        title: Text(book.title),
                        subtitle: Text(book.author), // Display author
                         trailing: IconButton(
                          icon: const Icon(Icons.delete, color: Colors.red), // Added color to delete icon
                           onPressed: () {
                            _showDeleteConfirmationDialog(book.id); // Pass book.id
                          },
                        ),
                        onTap: () {
                          // Navigate to the Reader page and pass the book details
                          if (!mounted) return;
                          
                          print('Navigating to ReaderPage with bookId: ${book.id}, title: ${book.title}, filePath: ${book.filePath}'); // Added this line

                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => ReaderPage(
                                bookId: book.id, // Pass bookId
                                bookTitle: book.title,
                                filePath: book.filePath,
                              ),
                            ),
                          );
                        },
                      ),
                    );
                  },
             ),
    );
  }

  // void _handleBookTap(String bookTitle) { // This method seems to be replaced by direct navigation
  //   print(\'Tapped on: $bookTitle\');
  // }
}