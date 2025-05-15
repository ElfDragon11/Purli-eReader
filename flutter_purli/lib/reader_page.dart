import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:flutter_html/flutter_html.dart';
import 'package:epub_parser/epub_parser.dart' as epub;
import 'package:path_provider/path_provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

final supabase = Supabase.instance.client;

class ReaderPage extends StatefulWidget {
  static const String route = '/reader';
  final String bookTitle;
  final String filePath;
  final String bookId;  

  const ReaderPage({
    Key? key, 
    required this.bookTitle, 
    required this.filePath,
    required this.bookId,
  }) : super(key: key);

  @override
  _ReaderPageState createState() => _ReaderPageState();
}

class _ReaderPageState extends State<ReaderPage> with SingleTickerProviderStateMixin {
  bool _isLoading = false;
  String? _errorMessage;
  epub.EpubBook? _epubBook;
  int _currentChapterIndex = 0;
  bool _isFilteringActive = true;  // Set to true by default to enable filtering
  
  // Current chapter content
  String _currentChapterContent = '';
  
  // Reading position tracking
  int _currentPageIndex = 0;
  double _readingProgress = 0.0;
  
  // User preferences
  double _currentFontSize = 16.0;
  Map<String, dynamic>? _bookFilter;
  bool _filterError = false;
  List<dynamic>? _tableOfContents;
  Color _currentPageColor = Colors.white;
  
  // Page dimensions and controllers
  double _pageHeight = 0;
  final ScrollController _scrollController = ScrollController();
  late PageController _pageController;
  
  // Page transition animation
  late AnimationController _animationController;
  late Animation<Offset> _slideAnimation;
  Offset _currentSlideDirection = Offset.zero;
  
  // Track page count and content
  int _pageCount = 1;
  List<double> _pageBreakPositions = [];
  bool _isAnimating = false;

  static const Map<String, dynamic> _defaultFilter = {
      "words": [
        'damn', 'damned', 'damning', 
        'hell', 
        'fuck', 'fucking', 'fucked', 'fucks', 
        'shit', 'shitting', 'shitted', 'shits', 
        'ass', 'asses', 'asshole', 
        'bitch', 'cock', 'penis', 'cunt',
        'motherfuck', 'motherfucker', 'motherfucking', 'motherfuckers',
      ],
      "phrases": [],
      "sections": [] 
  };

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
    
    // Initialize animation controller for page transitions
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 300),
      vsync: this,
    );
    
    _slideAnimation = Tween<Offset>(
      begin: const Offset(0, 0),
      end: const Offset(-1.0, 0),
    ).animate(CurvedAnimation(
      parent: _animationController,
      curve: Curves.easeInOut,
    ));
    
    _animationController.addStatusListener(_handleAnimationStatus);
    
    // Add listener to measure page height after layout
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _measurePageDimensions();
    });
    
    _loadEpub();
    _loadFontSize();
  }

  @override
  void dispose() {
    _pageController.dispose();
    _scrollController.dispose();
    _animationController.dispose();
    super.dispose();
  }
  
  void _handleAnimationStatus(AnimationStatus status) {
    if (status == AnimationStatus.completed) {
      // Animation completed, update the actual scroll position
      if (_currentSlideDirection.dx < 0) {
        // Forward page turn completed
        _updateScrollPositionAfterAnimation(true);
      } else if (_currentSlideDirection.dx > 0) {
        // Backward page turn completed
        _updateScrollPositionAfterAnimation(false);
      }
      
      _animationController.reset();
      setState(() => _isAnimating = false);
    }
  }
  
  void _updateScrollPositionAfterAnimation(bool isForward) {
    if (!_scrollController.hasClients) return;
    
    final currentScroll = _scrollController.offset;
    double targetScroll;
    
    // Calculate a line height approximation based on font size
    // This ensures our pagination gap scales with the font size
    final lineHeightApprox = _currentFontSize * 1.5;
    
    if (isForward) {
      // Next page - use exact page height as offset to avoid line duplication
      targetScroll = currentScroll + _pageHeight;
      
      // Apply an offset based on current font size to ensure complete line clearance
      targetScroll += lineHeightApprox * 0.7;  // Use ~70% of line height for reliable clearance
      
      if (targetScroll > _scrollController.position.maxScrollExtent) {
        targetScroll = _scrollController.position.maxScrollExtent;
      }
      setState(() => _currentPageIndex++);
    } else {
      // Previous page
      targetScroll = currentScroll - _pageHeight;
      
      // Apply similar font-based offset for consistency
      targetScroll -= lineHeightApprox * 0.7;
      
      if (targetScroll < 0) targetScroll = 0;
      setState(() => _currentPageIndex--);
    }
    
    if (kDebugMode) {
      print("Page turn: lineHeight approx = $lineHeightApprox, offset applied: ${lineHeightApprox * 0.7}");
    }
    
    // Jump to the target scroll position without animation
    _scrollController.jumpTo(targetScroll);
    
    // Update page count and save progress
    _updatePageCount();
    _saveReadingProgress(_currentChapterIndex, targetScroll);
  }
  
  void _measurePageDimensions() {
    if (!mounted) return;
    
    final screenSize = MediaQuery.of(context).size;
    final appBarHeight = AppBar().preferredSize.height;
    final bottomPadding = MediaQuery.of(context).padding.bottom;
    final topPadding = MediaQuery.of(context).padding.top;
    
    // Account for navigation controls and progress indicator
    const navControlsHeight = 60.0;
    const progressIndicatorHeight = 4.0;
    
    // Reduce padding to allow more room for text
    // We're subtracting 44.0 instead of 32.0 to account for top and bottom padding separately
    final availableHeight = screenSize.height - 
                            appBarHeight - 
                            navControlsHeight - 
                            progressIndicatorHeight - 
                            bottomPadding - 
                            topPadding -
                            44.0; // padding inside content area (slightly increased)
    
    setState(() {
      _pageHeight = availableHeight;
    });
    
    if (kDebugMode) {
      print('Available page height: $_pageHeight');
    }
  }

  Future<void> _loadEpub() async {
    try {
      await _downloadAndFilterEpub();
    } catch (e) {
      print(e.toString());
      if(mounted){
        setState(() => _errorMessage = "Failed to load book content, please try again.");
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _downloadAndFilterEpub() async {
    if (mounted) {
      setState(() { _isLoading = true; _errorMessage=null; });
    }    
    try {
      final response = await http.get(Uri.parse(widget.filePath));
      
      if (response.statusCode != 200) {
        throw Exception('Failed to download book from signed URL: ${response.statusCode} ${response.reasonPhrase}');
      }
      final fileBytes = response.bodyBytes;
      
      if(fileBytes.isEmpty){
        throw "Failed to load book content. The file seems to be empty, please try again.";
      }
      
      final directory = await getTemporaryDirectory();
      final fileName = widget.filePath.split('/').last.split('?').first;
      final file = File('${directory.path}/$fileName');
      await file.writeAsBytes(fileBytes, flush: true);

      final epubBytes = await file.readAsBytes();
      _epubBook = await epub.EpubReader.readBook(epubBytes);
      
      if (_epubBook == null) {
          throw "Failed to load book content. Unable to parse the book.";
      }

      _tableOfContents = _epubBook!.Schema?.Navigation?.NavMap?.Points;

      try {
        final fetchedFilterResponse = await supabase.from('filters')
            .select('content')
            .eq('book_id', widget.bookId)
            .maybeSingle();
        
        if (kDebugMode) {
          print('Filter fetch response for book ${widget.bookId}: $fetchedFilterResponse');
        }
        
        if (fetchedFilterResponse != null && fetchedFilterResponse['content'] != null) {
          setState(() {
            _bookFilter = fetchedFilterResponse['content'];
            if (kDebugMode) {
              print('Custom filter loaded: $_bookFilter');
            }
          });
        } else {
           if (kDebugMode) {
             print('No specific filter found for book ${widget.bookId} or content was null. Using default.');
           }
        }
      } catch(e) {
        if(mounted){
          print('Error fetching filter: $e');
          setState(() => _filterError = true);
        }
      }
      
      await file.delete();
      
      await _loadReadingProgress();

    } catch (e) {
        if (kDebugMode) {
          print("Error in _downloadAndFilterEpub(): ${e.toString()}");
        }
        if (mounted) {
          setState(() => _errorMessage = "Failed to load book content. Please check your internet connection or try again later.");
        }
    }
  }
      
  void _displayChapter(int chapterIndex, {double initialScrollOffset = 0.0}) {
    if (_epubBook == null || _epubBook!.Chapters == null || chapterIndex < 0 || chapterIndex >= _epubBook!.Chapters!.length) {
      if (mounted) {
        setState(() {
          _errorMessage = "Invalid chapter index.";
          _isLoading = false;
        });
      }
      return;
    }
    setState(() {
      _isLoading = true;
      _errorMessage = null;
      _currentChapterIndex = chapterIndex;
      _currentPageIndex = 0;
    });
    _loadChapterContent(initialScrollOffset);
  }

  Future<void> _loadChapterContent(double initialScrollOffset) async {
    if (_epubBook == null || _epubBook!.Chapters == null) {
      if (mounted) {
        setState(() {
          _errorMessage = "Book data is not loaded.";
          _isLoading = false;
        });
      }
      return;
    }
    
    try {
      final chapter = _epubBook!.Chapters![_currentChapterIndex];
      String chapterContent = chapter.HtmlContent ?? "";
      
      final Map<String, dynamic> filterToUse = _bookFilter ?? _defaultFilter;
      final filteredContent = _applyFilter(chapterContent, filterToUse);
      
      setState(() {
        _currentChapterContent = filteredContent;
        _currentPageIndex = 0;
      });
      
      if (kDebugMode) {
        print("Chapter ${_currentChapterIndex + 1} loaded.");
      }
      
      // Reset scroll position
      Future.delayed(Duration.zero, () {
        if (_scrollController.hasClients) {
          _scrollController.jumpTo(initialScrollOffset);
        }
      });
      
    } catch (e) {
      if (kDebugMode) {
        print("Error loading chapter content: ${e.toString()}");
      }
      if (mounted) {
        setState(() {
          _errorMessage = "Failed to load chapter content.";
          _isLoading = false;
        });
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  String _applyFilter(String content, Map<String, dynamic> filter) {
    if (!_isFilteringActive) return content;
    
    if (kDebugMode) {
      print("Starting filter application. Is custom filter? ${filter != _defaultFilter}");
      print("Filter being used: $filter");
    }
    
    // Always apply the default filter
    String filteredContent = content;
    
    // First apply the default filter
    final List<String> defaultWords = (_defaultFilter['words'] as List<dynamic>?)?.cast<String>() ?? [];
    final List<String> defaultPhrases = (_defaultFilter['phrases'] as List<dynamic>?)?.cast<String>() ?? [];
    
    // Apply default words filter
    for (final word in defaultWords) {
      final RegExp wordPattern = RegExp(r'\b' + word + r'\b', caseSensitive: false);
      filteredContent = filteredContent.replaceAll(wordPattern, '*' * word.length);
    }
    
    // Apply default phrases filter
    for (final phrase in defaultPhrases) {
      if (phrase.isNotEmpty) {
        final RegExp phrasePattern = RegExp(phrase, caseSensitive: false);
        filteredContent = filteredContent.replaceAll(phrasePattern, '*' * phrase.length);
      }
    }
    
    // If there's a custom filter, apply it on top of the default filter
    if (filter != _defaultFilter) {
      if (kDebugMode) {
        print("Applying custom filter. Words: ${filter['words']}, Phrases: ${filter['phrases']}");
      }
      
      final List<String> customWords = (filter['words'] as List<dynamic>?)?.cast<String>() ?? [];
      final List<String> customPhrases = (filter['phrases'] as List<dynamic>?)?.cast<String>() ?? [];
      
      if (kDebugMode) {
        print("Custom words to filter: $customWords");
        print("Custom phrases to filter: $customPhrases");
      }
      
      // Apply custom words filter
      for (final word in customWords) {
        final RegExp wordPattern = RegExp(r'\b' + word + r'\b', caseSensitive: false);
        filteredContent = filteredContent.replaceAll(wordPattern, '*' * word.length);
      }
      
      // Apply custom phrases filter
      for (final phrase in customPhrases) {
        if (phrase.isNotEmpty) {
          final RegExp phrasePattern = RegExp(phrase, caseSensitive: false);
          filteredContent = filteredContent.replaceAll(phrasePattern, '*' * phrase.length);
        }
      }
      
      // Apply custom sections filter (this was missing)
      final List<Map<String, dynamic>> sections = 
          (filter['sections'] as List<dynamic>?)?.map((section) => section as Map<String, dynamic>).toList() ?? [];
      
      if (kDebugMode) {
        print("Custom sections to filter: ${sections.length}");
      }
      
      if (sections.isNotEmpty) {
        for (final section in sections) {
          final String start = section['start'] as String;
          final String end = section['end'] as String;
          final String replacement = section['replacement'] as String;
          
          // Find all text between start and end (including start and end)
          if (start.isNotEmpty && end.isNotEmpty) {
            try {
              // First, escape any regex special characters in the start/end strings
              final String escapedStart = RegExp.escape(start);
              final String escapedEnd = RegExp.escape(end);
              
              // Create regex pattern to match text from start to end, including start and end
              // Using dotAll (s) flag to allow . to match newlines
              final RegExp sectionPattern = RegExp(
                escapedStart + r'[\s\S]*?' + escapedEnd,
                dotAll: true,
              );
              
              // Replace the section with the provided replacement text
              filteredContent = filteredContent.replaceAll(sectionPattern, replacement);
              
              if (kDebugMode) {
                print("Applied section filter: '$start' to '$end'");
              }
            } catch (e) {
              if (kDebugMode) {
                print("Error applying section filter: $e");
              }
            }
          }
        }
      }
    } else {
      if (kDebugMode) {
        print("No custom filter applied, only using default filter");
      }
    }
    
    if (kDebugMode) {
      print("Filtering applied: Default + Book-specific filters");
    }
    
    return filteredContent;
  }

  Future<void> _loadFontSize() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      setState(() {
        _currentFontSize = prefs.getDouble('font_size') ?? 16.0;
      });
    } catch (e) {
      if (kDebugMode) {
        print("Error loading font size: $e");
      }
    }
  }

  Future<void> _saveFontSize(double size) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setDouble('font_size', size);
    } catch (e) {
      if (kDebugMode) {
        print("Error saving font size: $e");
      }
    }
  }

  Future<void> _loadReadingProgress() async {
    if (_epubBook == null) return;
    
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedChapterIndex = prefs.getInt('${widget.bookId}_chapter') ?? 0;
      final savedScrollOffset = prefs.getDouble('${widget.bookId}_scroll_offset') ?? 0.0;
      
      final int validChapterIndex = (_epubBook!.Chapters != null && 
                                    savedChapterIndex >= 0 && 
                                    savedChapterIndex < _epubBook!.Chapters!.length) 
                                    ? savedChapterIndex 
                                    : 0;
      
      if (mounted) {
        setState(() {
          _currentChapterIndex = validChapterIndex;
        });
        
        _displayChapter(validChapterIndex, initialScrollOffset: savedScrollOffset);
      }
    } catch (e) {
      if (kDebugMode) {
        print("Error loading reading progress: $e");
      }
      _displayChapter(0);
    }
  }

  Future<void> _saveReadingProgress(int chapterIndex, double scrollOffset) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setInt('${widget.bookId}_chapter', chapterIndex);
      await prefs.setDouble('${widget.bookId}_scroll_offset', scrollOffset);
      
      if (_epubBook?.Chapters != null && _epubBook!.Chapters!.isNotEmpty) {
        double progress = chapterIndex / _epubBook!.Chapters!.length;
        setState(() {
          _readingProgress = progress;
        });
      }
    } catch (e) {
      if (kDebugMode) {
        print("Error saving reading progress: $e");
      }
    }
  }

  void _nextPage() {
    if (_isAnimating) return;
    
    if (_scrollController.hasClients) {
      final maxScroll = _scrollController.position.maxScrollExtent;
      final currentScroll = _scrollController.offset;
      
      if (currentScroll < maxScroll) {
        // We still have content to scroll in this chapter
        setState(() => _isAnimating = true);
        
        // Set the animation to slide left (next page)
        _currentSlideDirection = const Offset(-1.0, 0);
        _slideAnimation = Tween<Offset>(
          begin: Offset.zero,
          end: _currentSlideDirection,
        ).animate(CurvedAnimation(
          parent: _animationController,
          curve: Curves.easeInOut,
        ));
        
        _animationController.forward();
      } else if (_currentChapterIndex < (_epubBook?.Chapters?.length ?? 0) - 1) {
        // Move to next chapter
        _displayChapter(_currentChapterIndex + 1);
      }
    }
  }

  void _previousPage() {
    if (_isAnimating) return;
    
    if (_scrollController.hasClients) {
      final currentScroll = _scrollController.offset;
      
      if (currentScroll > 0) {
        // We can scroll back in this chapter
        setState(() => _isAnimating = true);
        
        // Set the animation to slide right (previous page)
        _currentSlideDirection = const Offset(1.0, 0);
        _slideAnimation = Tween<Offset>(
          begin: Offset.zero,
          end: _currentSlideDirection,
        ).animate(CurvedAnimation(
          parent: _animationController,
          curve: Curves.easeInOut,
        ));
        
        _animationController.forward();
      } else if (_currentChapterIndex > 0) {
        // Go to previous chapter
        _displayChapter(_currentChapterIndex - 1);
      }
    }
  }

  void _changeFontSize(double newSize) {
    setState(() {
      _currentFontSize = newSize;
    });
    _saveFontSize(newSize);
    
    // Reload chapter with new font size
    _displayChapter(_currentChapterIndex);
  }

  void _toggleFiltering() {
    setState(() {
      _isFilteringActive = !_isFilteringActive;
    });
    _displayChapter(_currentChapterIndex);
  }

  // Calculate the current page and total pages
  void _updatePageCount() {
    if (_scrollController.hasClients) {
      final maxScroll = _scrollController.position.maxScrollExtent;
      final currentScroll = _scrollController.offset;
      
      if (_pageHeight > 0) {
        final totalPages = (maxScroll / _pageHeight).ceil() + 1;
        final currentPage = (currentScroll / _pageHeight).floor() + 1;
        
        if (mounted) {
          setState(() {
            _pageCount = totalPages;
            _currentPageIndex = currentPage - 1;
          });
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.bookTitle),
        actions: [
          // Enhanced filter button with better visual indication
          Stack(
            alignment: Alignment.center,
            children: [
              IconButton(
                icon: Icon(
                  _isFilteringActive ? Icons.filter_alt : Icons.filter_alt_outlined,
                  color: _isFilteringActive ? Theme.of(context).primaryColor : null,
                ),
                onPressed: _toggleFiltering,
                tooltip: _isFilteringActive ? 'Filter active (click to disable)' : 'Filter inactive (click to enable)',
              ),
              if (_isFilteringActive)
                Positioned(
                  right: 8,
                  top: 8,
                  child: Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: Colors.green,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
            ],
          ),
          IconButton(
            icon: const Icon(Icons.text_fields),
            onPressed: () {
              showModalBottomSheet(
                context: context,
                builder: (context) => Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('Font Size'),
                      Slider(
                        value: _currentFontSize,
                        min: 12.0,
                        max: 24.0,
                        divisions: 6,
                        label: _currentFontSize.round().toString(),
                        onChanged: (value) {
                          _changeFontSize(value);
                        },
                      ),
                    ],
                  ),
                ),
              );
            },
            tooltip: 'Adjust font size',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _errorMessage != null
              ? Center(child: Text(_errorMessage!))
              : Column(
                  children: [
                    LinearProgressIndicator(
                      value: _readingProgress,
                      backgroundColor: Colors.grey[200],
                      valueColor: AlwaysStoppedAnimation<Color>(Theme.of(context).primaryColor),
                    ),
                    
                    Expanded(
                      child: _currentChapterContent.isEmpty
                          ? const Center(child: Text('No content available'))
                          : GestureDetector(
                              onTap: () {
                                // Tap on the right side to go forward, left side to go back
                                final screenWidth = MediaQuery.of(context).size.width;
                                final tapPosition = context.findRenderObject() as RenderBox;
                                final tapLocalPosition = tapPosition.globalToLocal(Offset.zero);
                                
                                if (tapLocalPosition.dx > screenWidth / 2) {
                                  _nextPage();
                                } else {
                                  _previousPage();
                                }
                              },
                              child: ClipRect(
                                child: SlideTransition(
                                  position: _slideAnimation,
                                  child: Container(
                                    color: _currentPageColor,
                                    // Reduce vertical padding to allow more text to show
                                    padding: const EdgeInsets.fromLTRB(16.0, 8.0, 16.0, 8.0),
                                    height: _pageHeight,
                                    child: NotificationListener<ScrollNotification>(
                                      onNotification: (notification) {
                                        if (notification is ScrollUpdateNotification) {
                                          _updatePageCount();
                                          _saveReadingProgress(_currentChapterIndex, _scrollController.offset);
                                        }
                                        return true;
                                      },
                                      child: SingleChildScrollView(
                                        controller: _scrollController,
                                        physics: const NeverScrollableScrollPhysics(),
                                        child: Html(
                                          data: _currentChapterContent,
                                          style: {
                                            "body": Style(
                                              fontSize: FontSize(_currentFontSize),
                                              fontFamily: 'serif',
                                              // Use the correct padding type for flutter_html
                                              margin: Margins.zero,
                                              padding: HtmlPaddings.zero,
                                            ),
                                            "p": Style(
                                              // Reduce paragraph margin for more compact text
                                              margin: Margins(bottom: Margin(6)),
                                            ),
                                          },
                                        ),
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                            ),
                    ),
                    
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8.0, horizontal: 16.0),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          IconButton(
                            icon: const Icon(Icons.skip_previous),
                            onPressed: _currentChapterIndex > 0 && !_isAnimating
                                ? () => _displayChapter(_currentChapterIndex - 1)
                                : null,
                          ),
                          
                          Row(
                            children: [
                              IconButton(
                                icon: const Icon(Icons.arrow_back),
                                onPressed: !_isAnimating ? _previousPage : null,
                              ),
                              Text(
                                '${_currentPageIndex + 1}/${_pageCount}',
                                style: const TextStyle(fontWeight: FontWeight.bold),
                              ),
                              IconButton(
                                icon: const Icon(Icons.arrow_forward),
                                onPressed: !_isAnimating ? _nextPage : null,
                              ),
                            ],
                          ),
                          
                          IconButton(
                            icon: const Icon(Icons.skip_next),
                            onPressed: _currentChapterIndex < (_epubBook?.Chapters?.length ?? 0) - 1 && !_isAnimating
                                ? () => _displayChapter(_currentChapterIndex + 1)
                                : null,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
    );
  }
}