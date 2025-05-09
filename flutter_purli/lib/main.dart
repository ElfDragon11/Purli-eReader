import 'package:flutter/foundation.dart';
import 'package:uni_links/uni_links.dart';
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
// import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState; // Hide Supabase's AuthState
import './authentication_page.dart'; // Use relative import
import './library_page.dart'; // Use relative import
import './email_verification_needed_page.dart'; // Use relative import
import './subscription_needed_page.dart'; // Use relative import
import './reader_page.dart'; // Use relative import
import './user_profile_page.dart'; // Use relative import
import './auth_state.dart'; // Use relative import
import 'dart:async'; // Import for StreamSubscription

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(
    url: 'https://fuigxuyatlhtscrwyrja.supabase.co', // Replace with your Supabase URL
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1aWd4dXlhdGxodHNjcnd5cmphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ1MjM4MTAsImV4cCI6MjA2MDA5OTgxMH0.3CNscbOi5ibPirHuLXnFLHYZ2erEVNlBWI6xB_9s8Tk', // Replace with your Supabase anon key
  );
  runApp(
    ChangeNotifierProvider(
      create: (context) => AuthState(), // This should be your local AuthState
      child: const App(),
    ),
  );
}

class App extends StatefulWidget {
  const App({super.key});

  @override
  AppState createState() => AppState();
}

class AppState extends State<App> with WidgetsBindingObserver {
  StreamSubscription? _linkSubscription; // Store the subscription

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initDeepLinks();
  }
  
  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _linkSubscription?.cancel(); // Cancel the subscription
    super.dispose();
  }

  Future<void> _initDeepLinks() async { // Made async
    try {
      // Get the initial link if the app was opened with one
      final initialLink = await getInitialLink();
      if (initialLink != null) {
        _handleDeepLink(initialLink);
      }
    } on PlatformException {
      // Handle exception: e.g., log an error
      if (kDebugMode) {
        print('Failed to get initial link.');
      }
    }

    // Listen to link changes
    // _linkSubscription = getLinksStream().listen((String? link) { // Deprecated: getLinksStream
    _linkSubscription = linkStream.listen((String? link) { // Corrected: use linkStream
      if (link != null) {
        _handleDeepLink(link);
      }
    }, onError: (err) {
      if (kDebugMode) {
        print('Error in link stream: $err');
      }
    });
  }

  void _handleDeepLink(String link) {
    final uri = Uri.parse(link);
    if (uri.path == '/return' || uri.path == '/library') {
      _handleAppResume();
    }
    // Add other deep link paths as needed
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _handleAppResume();
    }
  }

  Future<void> _handleAppResume() async {
    if (!mounted) return; // Check if widget is mounted
    final authState = Provider.of<AuthState>(context, listen: false); // Get AuthState
    final user = Supabase.instance.client.auth.currentUser;

    if (user != null) {
      bool emailVerified = user.emailConfirmedAt != null; // Corrected: Supabase uses emailConfirmedAt
      bool hasActiveSubscription = false;
      try {
        final subscriptionResponse = await Supabase.instance.client
              .from('subscriptions')
              .select('status') // Select only status
              .eq('user_id', user.id)
              .maybeSingle(); // Use maybeSingle to handle no subscription gracefully

        if (subscriptionResponse != null && subscriptionResponse['status'] == 'active') {
          hasActiveSubscription = true;
        }
      } catch (e) {
        if (kDebugMode) {
          print('Error fetching subscription status: $e');
        }
        // Optionally, show a generic error to the user or handle specific errors
      }
      if (!mounted) return; // Re-check mounted status before calling setUser
      authState.setUser(user, isEmailVerified: emailVerified, hasActiveSubscription: hasActiveSubscription);
    } else {
      if (!mounted) return; // Re-check mounted status before calling clearUser
      authState.clearUser(); // Clear user if not logged in
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthState>(
      builder: (context, authState, child) {
          // Removed _handleAppResume() call from here as it's handled by deep links and lifecycle states
        return MaterialApp(
              title: 'Purli',
              theme: ThemeData(
                primarySwatch: Colors.blue,
                useMaterial3: true,
              ),
                home: authState.user == null
                    ? const AuthPage() // Corrected: Use AuthPage (class name for authentication_page.dart)
                    : authState.isEmailVerified
                        ? authState.hasActiveSubscription
                            ? const LibraryPage()
                            : const SubscriptionNeededPage()
                        : const EmailVerificationNeededPage(),
              routes: {
                AuthPage.route: (context) => const AuthPage(), // Corrected: Use AuthPage.route and AuthPage()
                '/library': (context) => const LibraryPage(),
                // Corrected ReaderPage route - ensure ReaderPage takes these parameters or adjust as needed
                ReaderPage.route: (context) {
                  final args = ModalRoute.of(context)!.settings.arguments as Map<String, dynamic>?; // Example of getting args
                  return ReaderPage(
                    bookId: args?['bookId'] ?? '', // Provide default or handle null
                    bookTitle: args?['bookTitle'] ?? 'Example Book', // Provide default or handle null
                    filePath: args?['filePath'] ?? '', // Provide default or handle null
                  );
                },
                // '/profile': (context) => const UserProfilePage(), // UserProfilePage is not const
                '/profile': (context) => UserProfilePage(), // Corrected: Removed const
              },
            );
          }
        );
    }
  }
