import 'dart:io'; // Import dart:io for File
import 'package:flutter/foundation.dart'; // For kDebugMode
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_html/flutter_html.dart';
import 'package:epub_parser/epub_parser.dart' as epub;
import 'package:path_provider/path_provider.dart';
import 'dart:convert';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

// Define supabase client here if it's not passed or available via Provider
final supabase = Supabase.instance.client;

class ReaderPage extends StatefulWidget {
  static const String route = '/reader'; // Added route
  final String bookTitle;
  final String filePath;
  final String bookId;  

  const ReaderPage({
    Key? key, 
    required this.bookTitle, 
    required this.filePath,
    required this.bookId, // Added bookId to constructor
  }) : super(key: key);

  @override
  _ReaderPageState createState() => _ReaderPageState();
}

class _ReaderPageState extends State<ReaderPage> {
  // Class member declarations
  bool _isLoading = false;
  String? _errorMessage;
  epub.EpubBook? _epubBook;
  String _currentChapterContent = ""; // Content of the current chapter after profanity filtering
  int _currentChapterIndex = 0; // Current chapter index
  bool _isFilteringActive = false; // State to track if filtering is active
  final ScrollController _scrollController = ScrollController(); // Controller for the scroll position
  double _readingProgress = 0.0; // Reading progress within the current chapter
  double _currentFontSize = 16.0;// Default font size
  Map<String, dynamic>? _bookFilter; //variable to store the fetched book filter
  bool _filterError = false;//add boolean to see if filter fetching failed
  // Instead of using EpubNavigationPoint directly, we can use a more general type
  // List<epub.EpubNavigationPoint>? _tableOfContents; // Corrected type for epub_parser
  List<dynamic>? _tableOfContents; // Use dynamic to avoid type issues
  static const Map<String, dynamic> _defaultFilter = {
      "words": [
        'damn', 'damned', 'damning', 
        'hell', 
        'fuck', 'fucking', 'fucked', 'fucks', 
        'shit', 'shitting', 'shitted', 'shits', 
        'ass', 'asses', 'asshole', 
        'bitch', 'cock', 'penis', 'cunt', // Corrected 'penus' to 'penis'
        'motherfuck', 'motherfucker', 'motherfucking', 'motherfuckers',
      ],
      "phrases": [],
      // Ensure this section is correctly formatted and terminated
      "sections": [] 
  }; // Ensure this semicolon is correctly placed and no stray characters follow.
  

  @override
  void initState() {
    super.initState();
    // Initialize and load the ePub file
    _loadEpub();
    _loadReadingProgress();
    _loadFontSize();
  }

  Future<void> _loadEpub() async {
    try {
       await _downloadAndFilterEpub();
    
    } catch (e) {
      print(e.toString());
      if(mounted){
        setState(() => _errorMessage = "Failed to load book content, please try again.");
      }
    }finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _downloadAndFilterEpub() async {
    // Sets _isLoading to true to display the loading indicator.
    if (mounted) {
      setState(() { _isLoading = true; _errorMessage=null; });
    }    
    try {
      //download file
      // final fileBytes = await supabase.storage.from('book_uploads').download(widget.filePath);
      final fileBytes = await supabase.storage.from('books').download(widget.filePath); // Changed to 'books'
      
      if(fileBytes.isEmpty){ // fileBytes from download is Uint8List, check length
        throw "Failed to load book content. The file seems to be empty, please try again.";
      }
      
      final directory = await getTemporaryDirectory();
      // if(directory.path.isEmpty){ // path is non-nullable
      //   throw "Failed to load book content. Cannot access directory, please try again.";
      // }
      final file = File('${directory.path}/${widget.filePath.split('/').last}'); // Use a unique name or the actual filename
      await file.writeAsBytes(fileBytes, flush: true);

      final epubBytes = await file.readAsBytes();
      _epubBook = await epub.EpubReader.readBook(epubBytes);
      
      if (_epubBook == null) { // Check immediately after parsing
          throw "Failed to load book content. Unable to parse the book.";
      }
      //add epub table of content
      // _tableOfContents = _epubBook!.TableOfContents.Items; // Old getter
      // _tableOfContents = _epubBook!.Navigation?.Points; // Incorrect field
      _tableOfContents = _epubBook!.Schema?.Navigation?.NavMap?.Points; // Corrected path to navigation points

      try{
        final fetchedFilterResponse = await supabase.from('filters')
            .select('content')
            .eq('book_id', widget.bookId)
            .maybeSingle(); // Use maybeSingle to handle null gracefully
            // .catchError((error) { // catchError here might be problematic with maybeSingle
            //   print(error);
            //   if(mounted) {
            //     setState(() => _filterError = true);
            //   }
            //   return null; // Ensure catchError returns a compatible type or rethrows
            // });
        
        if (fetchedFilterResponse != null && fetchedFilterResponse['content'] != null) {
          setState(() {
            _bookFilter = fetchedFilterResponse['content'];
          });
        } else {
          // Filter not found or content is null, _bookFilter remains null (or default will be used)
           if (kDebugMode) {
             print('No specific filter found for book ${widget.bookId} or content was null. Using default.');
           }
        }
      } catch(e) { // Catching potential errors from the Supabase query itself
        if(mounted){
          print('Error fetching filter: $e');
          setState(() => _filterError = true);
        }
      }
      
      await file.delete(); // Changed to await
      
      _saveReadingProgress(_currentChapterIndex, 0);
      _displayChapter(0);

    } catch (e) {
        if (kDebugMode) {
          print("Error in _downloadAndFilterEpub(): ${e.toString()}");
        }
        if (mounted) {
          setState(() => _errorMessage = "Failed to load book content. Please check your internet connection or try again later.");
        }
    } finally {
        if (mounted) {setState(() => _isLoading = false);}}
  }
      
  void _displayChapter(int chapterIndex) {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });
    _currentChapterIndex = chapterIndex;
    _loadChapter();
  }


  Future<void> _loadChapter() async {
    if (_epubBook == null) { // Guard against null _epubBook
      if (mounted) {
        setState(() {
          _errorMessage = "Book data is not loaded.";
          _isLoading = false;
        });
      }
      return;
    }
    try {
      final chapter = _epubBook!.Chapters![_currentChapterIndex]; // Added null assertion for Chapters
      // final String chapterContent = _extractChapterText(chapter); // Old call
      String chapterContent = chapter.HtmlContent ?? ""; // Use HtmlContent and provide default
      
      final Map<String, dynamic> filterToUse = _bookFilter ?? _defaultFilter;
      final filteredContent = _applyFilter(chapterContent, filterToUse);

      if (mounted) {
        setState(() {
          _currentChapterContent = filteredContent;
          _scrollController.addListener(_calculateReadingProgress);
          if (filteredContent.isNotEmpty && filteredContent != chapterContent) {
            _isFilteringActive = true;
          } else {
            _isFilteringActive = false;
          }
          _saveReadingProgress(_currentChapterIndex, 0);
        } );
      }
    } catch (e) {
      if (kDebugMode) {
        print('Error loading chapter: $e');
      }
      if (mounted) {
        setState(() => _errorMessage = "Failed to load chapter. Please try again.");
      }
    } finally {
        if (mounted) {setState(() => _isLoading = false);}
    }
  }
  
  String _applyFilter(String content, Map<String, dynamic> filter) {
    // Get words, phrases, and sections from the filter
    final List<String> words = filter["words"] != null ? List<String>.from(filter["words"] ?? []) : [];
    final List<String> phrases = filter["phrases"] != null ? List<String>.from(filter["phrases"] ?? []) : [];
    final List<Map<String, String>> sections = filter["sections"] != null ? List<Map<String, String>>.from(filter["sections"] ?? []) : [];

    //sort phrases by length to avoid replacing parts of phrases
    phrases.sort((a, b) {
      if(a.length > b.length){
        return -1;
      }else{
        return 1;
      }
    });

    // Replace words and phrases with "***"
    String filteredContent = content;
    for (String phrase in phrases) {
        filteredContent = filteredContent.replaceAll(phrase, "***");
    }
    for (String word in words) {
        filteredContent = filteredContent.replaceAll(word, "***");
    }

    // Replace sections with replacement text
    for (Map<String, String> section in sections) {
      final String start = section["start"]!;
      final String end = section["end"]!;
      final String replacement = section["replacement"]!;

      // Use regex to match the section
      final RegExp regex = RegExp(
        '$start[\\s\\S]*?$end', // Match across multiple lines
        multiLine: true, // Enable multiline matching
      );
      filteredContent = filteredContent.replaceAllMapped(regex, (match) => replacement);
      }
    return filteredContent;
  }
    // Method to extract chapter content as text
    // String _extractChapterText(epub.EpubChapter chapter) { // This method is no longer needed as we use chapter.HtmlContent directly
    //   if (chapter.HtmlContent != null && chapter.HtmlContent!.isNotEmpty) {
    //     return chapter.HtmlContent!;
    //   } else {
    //     return "Chapter content not available.";
    //   }
    // }
   // Calculate and update the reading progress
    void _calculateReadingProgress() {
      if (_scrollController.hasClients) {
        final maxScroll = _scrollController.position.maxScrollExtent;
        final currentScroll = _scrollController.offset;
        if (maxScroll > 0) {
          setState(() {
            _readingProgress = (currentScroll / maxScroll).clamp(0.0, 1.0);
          });
        } else {
          setState(() {
            _readingProgress = 0.0;
          });
        }
      }
    }
      // Method to save the reading progress
    Future<void> _saveReadingProgress(int chapterIndex, double scrollOffset) async {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt('chapterIndex', chapterIndex);
      await prefs.setDouble('scrollOffset', scrollOffset);
    }

    // Method to load the reading progress
    Future<void> _loadReadingProgress() async {
      final prefs = await SharedPreferences.getInstance();
      final savedChapterIndex = prefs.getInt('chapterIndex');
      final savedScrollOffset = prefs.getDouble('scrollOffset');

      if (savedChapterIndex != null) {
        setState(() {
          _currentChapterIndex = savedChapterIndex;
        });
      }

      if (savedScrollOffset != null) {
        //wait until list view is build
         WidgetsBinding.instance.addPostFrameCallback((_) => _scrollController.jumpTo(savedScrollOffset));
      }
    }
  Future<void> _saveFontSize() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble('fontSize', _currentFontSize);
  }
  Future<void> _loadFontSize() async {
    final prefs = await SharedPreferences.getInstance();
    final savedFontSize = prefs.getDouble('fontSize');
    if (savedFontSize != null) {
      setState(() {
        _currentFontSize = savedFontSize;
      });
    }

  }
  void _increaseFontSize() {
    setState(() {
      _currentFontSize += 2.0; // Increase font size by 2
      _saveFontSize();
    });
  }

  // Decrease the font size
  void _decreaseFontSize() {
     
    setState(() {
      _currentFontSize -= 2.0; // Decrease font size by 2
      _saveFontSize();
      if (_currentFontSize < 10.0) _currentFontSize = 10.0; // Minimum font size
    });
  }

  
   // Navigate to the previous chapter
  void _goToPreviousChapter() {
    if (_epubBook == null || _epubBook!.Chapters == null) return; // Guard
    if (_currentChapterIndex > 0) {
      _saveReadingProgress(_currentChapterIndex-1, 0);
      _displayChapter(_currentChapterIndex - 1);
    }
  }

  // Navigate to the next chapter
  void _goToNextChapter() {
    if (_epubBook == null || _epubBook!.Chapters == null) return; // Guard
    if (_currentChapterIndex < _epubBook!.Chapters!.length - 1) { // Added null assertion
      _saveReadingProgress(_currentChapterIndex+1, 0);
      _displayChapter(_currentChapterIndex + 1);
    }
  }
  //  void _navigateToChapter(epub.EpubNavigationBase item) { // Old definition with EpubNavigationBase
  //       // Find the chapter index based on the item\'s content href.
  //       int newChapterIndex = _epubBook!.Chapters.indexWhere((chapter) {
  //         final String chapterHref = chapter.ContentFileName!; 
  //         return chapterHref.endsWith(item.Content?.Href ?? "");
  //       });

  //       if (newChapterIndex != -1) {
  //         _displayChapter(newChapterIndex);
  //       }
  //        Navigator.of(context).pop(); 
  //   }
  //    void _navigateToChapter(epub.EpubNavigationBase item) { // This is a duplicate and incomplete
  //       // Find the chapter index based on the item\'s content href.
  //       int newChapterIndex = _epubBook!.Chapters.indexWhere((chapter) {
  //         final String chapterHref = chapter.ContentFileName!; 
  //         return chapterHref.endsWith(item.Content?.Href ?? "");
  //       if (newChapterIndex != -1) { // Syntax error here, missing closing brace for indexWhere
  //         _displayChapter(newChapterIndex);
  //       }
  //   }

  // Corrected _navigateToChapter
  void _navigateToChapter(dynamic item) { // Use dynamic instead of a specific type
    if (_epubBook == null || _epubBook!.Chapters == null) return;
    
    // The logic to map navigation point to a chapter index can be complex.
    // Access the content href in a safe way regardless of type
    final targetHref = item.Content?.Href;
    if (targetHref == null) return;

    int newChapterIndex = -1;
    for (int i = 0; i < _epubBook!.Chapters!.length; i++) {
        // Comparing ContentFileName (e.g., "chapter1.html") with the Href from navigation point
        if (_epubBook!.Chapters![i].ContentFileName == targetHref) {
            newChapterIndex = i;
            break;
        }
    }

    if (newChapterIndex != -1) {
      _displayChapter(newChapterIndex);
    } else {
      if (kDebugMode) {
        print("Could not find chapter for navigation point: ${item.Title}");
      }
      // Optionally show a message to the user
    }
    if (mounted) { // Ensure mounted before popping
      Navigator.of(context).pop(); // Close the drawer after navigation
    }
  }


  Widget _buildNavigationButtons() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceAround,
      children: [
        IconButton(icon: const Icon(Icons.arrow_back), onPressed: _goToPreviousChapter),
        IconButton(icon: const Icon(Icons.arrow_forward), onPressed: _goToNextChapter),
      ],
    );
  }
    Widget _buildFontSizeControls() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        IconButton(icon: const Icon(Icons.remove), onPressed: _decreaseFontSize),
        const Text("Font Size"),
        IconButton(icon: const Icon(Icons.add), onPressed: _increaseFontSize),
      ],
    );
  }
  Widget _buildTableOfContentsDrawer() {
    return Drawer(
      child: ListView(
        // children: _tableOfContents?.map((item) { // _tableOfContents can be null
        children: (_tableOfContents ?? []).map((item) { // Handle null _tableOfContents
          return ListTile(
            title: Text(item.Title ?? ''),
            onTap: () => _navigateToChapter(item),
          );
        }).toList(),
      ),
    );
  }
  @override
  Widget build(BuildContext context) {
     return Scaffold(
        appBar: AppBar(
          // title: Row( // title expects a single Widget, not a Row directly if you also have leading
          //   children: [
          //     Text(widget.bookTitle),
          //     if (_isFilteringActive) const Padding(padding: EdgeInsets.only(left: 8), child: Text("Profanity Filtering On", style: TextStyle(fontSize: 12))),
          //   ],
          // ),
          title: Text(widget.bookTitle), // Simpler title
          actions: [ // Place filtering indicator in actions for better layout
            if (_isFilteringActive) 
              Padding(
                padding: const EdgeInsets.only(right: 16.0),
                child: Center(child: Text("Filter On", style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onPrimary))),
              ),
          ],
          // leading: IconButton( // leading is automatically handled by Drawer or can be overridden
          //   icon: const Icon(Icons.arrow_back),
          //   onPressed: () => Navigator.of(context).pop(),
          // ),
        ),
        drawer: _buildTableOfContentsDrawer(),
        body: Stack(
        children: [
          if(_epubBook != null)
             Align(
                alignment: Alignment.topCenter,
                child: Padding(
                  padding: const EdgeInsets.all(8.0),
                  child: Text(
                      "Reading Progress: ${(_readingProgress * 100).toStringAsFixed(0)}%"), // Display progress as a percentage
                ),
              ),
            if (_currentChapterContent.isNotEmpty)
                Center(
                  child: Column(
                      children: [
                         _buildFontSizeControls(), 
                        Expanded(
                          child: NotificationListener<ScrollNotification>(
                              onNotification: (scrollNotification) {
                                if (scrollNotification.metrics.atEdge) {
                                  if(scrollNotification.metrics.pixels != 0) { // Only save if not at the very top initially
                                     _saveReadingProgress(_currentChapterIndex, _scrollController.offset);
                                  }
                                }
                                return true;
                              }, // Removed extra comma and newline issues from original
                          child: ListView(
                            controller: _scrollController, 
                            children: [
                              Padding( // Added padding around HTML content
                                padding: const EdgeInsets.all(12.0),
                                child: Html(
                                  data: _currentChapterContent,
                                  style: {
                                   "body": Style(
                                    fontSize: FontSize(_currentFontSize),
                                   ),
                                  },
                                ),
                              )
                            ]
                          )),
                        ), 
                         _buildNavigationButtons()
                      ]
                    )
                ) ,        
            if (_isLoading)
              const Center(child: CircularProgressIndicator()), 
            if (_errorMessage != null)
              Center(
                child: Text(
                  _errorMessage!,
                  style: const TextStyle(color: Colors.red),
                  textAlign: TextAlign.center,
                ),
              ),
            if (_filterError)
              const Center(
                child: Text(
                  "Failed to load filter for this book.\nUsing default filter.",
                  style: TextStyle(color: Colors.red, fontSize: 18),
                  textAlign: TextAlign.center,
                ),
              )

          ],
        ),
      );
  }
  }