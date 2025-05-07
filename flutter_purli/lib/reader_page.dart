import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_html/flutter_html.dart';
import 'package:epub/epub.dart' as epub; // Import dart-epub package
import 'package:path_provider/path_provider.dart';
import 'dart:convert';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

class ReaderPage extends StatefulWidget {
  final String bookTitle;
  final String filePath;//remove?
  final String bookId;  

  const ReaderPage({Key? key, required this.bookTitle, required this.filePath})
      : super(key: key);

  @override
  _ReaderPageState createState() => _ReaderPageState();
}

class _ReaderPageState extends State<ReaderPage> {
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
  List<epub.EpubNavigationBase>? _tableOfContents;


    static const Map<String, dynamic> _defaultFilter = {
        "words": [
          'damn', 'damned', 'damning', 
          'hell', 
          'fuck', 'fucking', 'fucked', 'fucks', 
          'shit', 'shitting', 'shitted', 'shits', 
          'ass', 'asses', 'asshole', 
          'bitch', 'cock', 'penus', 'cunt', 
          'motherfuck', 'motherfucker', 'motherfucking', 'motherfuckers',
        ],
        "phrases": [],
        "sections": [] /*{
        "start": "This is an example of what could be filtered.",
        "end": "This section should be removed entirely.",
        "replacement": "[Section Removed Due to Content]"
      }*/]};
  

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
      final fileBytes = await supabase.storage.from('books').download(widget.filePath);
      
      //set error message if file is not found
      if(fileBytes.isEmpty){
        throw "Failed to load book content. The file seems to be empty, please try again.";
      }
      
      // Get a temporary directory on the device
      final directory = await getTemporaryDirectory();
      if(directory.path.isEmpty){
        throw "Failed to load book content. Cannot access directory, please try again.";
      }
      // Create a File instance to save the downloaded file
      final file = File('${directory.path}/book.epub');
      await file.writeAsBytes(fileBytes, flush: true);

      // Parse the EPUB file using dart-epub
      final epubBytes = await file.readAsBytes();
      _epubBook = await epub.EpubReader.readBook(epubBytes);
      //add epub table of content
      _tableOfContents = _epubBook!.TableOfContents.Items;

      // Fetch the filter for this book
      try{
        final fetchedFilter = await supabase.from('filters')
            .select('content')
            .eq('book_id', widget.bookId)
            .single()
            .catchError((error) {
              print(error);
              setState(() => _filterError = true);
            });
        
        // If filter not found, _bookFilter will remain null
        setState(() {
          _bookFilter = fetchedFilter == null ? null : fetchedFilter['content'];
        });
      }catch(e){
        if(mounted){
          print(e);
          setState(() => _filterError = true);
        }
      });
      
      //delete file after read
      file.delete();
      
      if (_epubBook == null) {
          throw "Failed to load book content. Unable to parse the book.";
      }
      // Display the first chapter initially
      _saveReadingProgress(_currentChapterIndex, 0);
      _displayChapter(0);

    } catch (e) {
        print("Error in _downloadAndFilterEpub(): ${e.toString()}");
        if (mounted) {
          setState(() => _errorMessage = "Failed to load book content. Please check your internet connection or try again later.");
        }
    } finally {
        if (mounted) {setState(() => _isLoading = false);}
    }
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
      try {
        // Fetch the content of the chapter
        final chapter = _epubBook!.Chapters[_currentChapterIndex];
        final String chapterContent = _extractChapterText(chapter);
        // Apply filter
        final filteredContent = _applyFilter(chapterContent, _bookFilter ?? _defaultFilter);

        // Update the state with the filtered chapter content
        if (mounted) {
          setState(() {
            _currentChapterContent = filteredContent;
             // Set filtering as active if content is filtered
             
             //add listener to scroll changes to calculate reading progress
            _scrollController.addListener(_calculateReadingProgress);
            
             // Set filtering as active if content is filtered
            if (filteredContent.isNotEmpty && filteredContent != chapterContent) {
              _isFilteringActive = true;
            } else {
              _isFilteringActive = false;
            }
            _saveReadingProgress(_currentChapterIndex, 0); //save reading progress on new chapter
            
            
          } );
        }
      } catch (e) {
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
    String _extractChapterText(epub.EpubChapter chapter) {
      // In a real implementation, you would need to properly extract the
      // text content from the HTML. Here, we are returning the raw content.\n
      if (chapter.Content != null && chapter.Content!.isNotEmpty) {\n
        return chapter.Content!;\n
      } else {
        return "Chapter content not available.";
      }
    }
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
    if (_currentChapterIndex > 0) {
      _saveReadingProgress(_currentChapterIndex-1, 0); //save new chapter progress
      _displayChapter(_currentChapterIndex - 1);
    }
  }

  // Navigate to the next chapter
  void _goToNextChapter() {
    if (_currentChapterIndex < _epubBook!.Chapters.length - 1) {
      _saveReadingProgress(_currentChapterIndex+1, 0);//save new chapter progress
      _displayChapter(_currentChapterIndex + 1);
    }
  }
   void _navigateToChapter(epub.EpubNavigationBase item) {
        // Find the chapter index based on the item's content href.
        int newChapterIndex = _epubBook!.Chapters.indexWhere((chapter) {
          final String chapterHref = chapter.ContentFileName!; // Assuming ContentFileName contains the chapter's file name
          return chapterHref.endsWith(item.Content?.Href ?? "");
        });

        if (newChapterIndex != -1) {
          _displayChapter(newChapterIndex);
        }
         Navigator.of(context).pop(); // Close the drawer after navigation
    }
     void _navigateToChapter(epub.EpubNavigationBase item) {
        // Find the chapter index based on the item's content href.
        int newChapterIndex = _epubBook!.Chapters.indexWhere((chapter) {
          final String chapterHref = chapter.ContentFileName!; // Assuming ContentFileName contains the chapter's file name
          return chapterHref.endsWith(item.Content?.Href ?? "");
        if (newChapterIndex != -1) {
          _displayChapter(newChapterIndex);
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
        children: _tableOfContents?.map((item) {
          return ListTile(
            title: Text(item.Title ?? ''),
            onTap: () => _navigateToChapter(item),
          );
        }).toList() ?? [],
      ),
    );
  }
  @override
  Widget build(BuildContext context) {
     return Scaffold(
        appBar: AppBar(
          title: Row(
            children: [
              Text(widget.bookTitle),
              if (_isFilteringActive) const Padding(padding: EdgeInsets.only(left: 8), child: Text("Profanity Filtering On", style: TextStyle(fontSize: 12))), // Filtering indicator
            ],
          leading: IconButton(
            icon: const Icon(Icons.arrow_back),
            onPressed: () => Navigator.of(context).pop(),
          ),
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
              // Display the current chapter's content using a Text widget
               
                Center(
                  child: Column(
                      children: [
                         _buildFontSizeControls(), // Add font size controls
                        Expanded(
                          child: NotificationListener<ScrollNotification>(
                              onNotification: (scrollNotification) {
                                if (scrollNotification.metrics.atEdge) {
                                  _saveReadingProgress(_currentChapterIndex, _scrollController.offset);
                                }
                                return true;},\n
                          child: ListView(controller: _scrollController, children: [Html(\n+                            data: _currentChapterContent,\n+                             style: {\n+                               \"body\": Style(\n+                                fontSize: FontSize(_currentFontSize),\n+                               ),// Apply font size here\n+                             },\n+                              )],)),), \n
                         _buildNavigationButtons()
                      ]
                    )
                ) ,        
            if (_isLoading)
              const Center(child: CircularProgressIndicator()), // Show loading indicator while loading
            if (_errorMessage != null)
              Center(
                
                // Display error message when _errorMessage is not null and not loading
                child: Text(
                  _errorMessage!,
                  style: const TextStyle(color: Colors.red),
                  textAlign: TextAlign.center,
                ),
              )
            ,
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