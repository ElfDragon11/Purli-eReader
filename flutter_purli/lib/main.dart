import 'package:flutter/foundation.dart';
import 'package:uni_links/uni_links.dart';
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'authentication_page.dart';
import 'library_page.dart';
import 'email_verification_needed_page.dart';
import 'subscription_needed_page.dart';
import 'reader_page.dart';
import 'user_profile_page.dart';
import 'auth_state.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(
    url: 'YOUR_SUPABASE_URL', // Replace with your Supabase URL
    anonKey: 'YOUR_SUPABASE_ANON_KEY', // Replace with your Supabase anon key
  );
  runApp(
    ChangeNotifierProvider(
      create: (context) => AuthState(),
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
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initDeepLinks();
  }
  
  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  void _initDeepLinks() {
    getLinksStream().listen((String? link) {
      if (link != null) {
        final uri = Uri.parse(link);
        if (uri.path == '/return' || uri.path == '/library') {
          _handleAppResume();
        }
      }
    }, onError: (err) {
      if (kDebugMode) {
        print('Error in link stream: $err');
      }
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _handleAppResume();
    }
  }

  Future<void> _handleAppResume() async {
    final user = Supabase.instance.client.auth.currentUser;
    if (user != null) {
      final emailVerified = Supabase.instance.client.auth.currentUser?.emailVerified ?? false;
      final subscriptionResponse = await Supabase.instance.client
            .from('subscriptions') // Replace with your subscriptions table name if different
            .select()
            .eq('user_id', user.id)
            .single();
            final hasActiveSubscription = subscriptionResponse['status'] == 'active'; // Replace 'active' with your active status
      Provider.of<AuthState>(context, listen: false).setUser(user, isEmailVerified: emailVerified, hasActiveSubscription: hasActiveSubscription);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthState>(
      builder: (context, authState, child) {
          if (authState.user == null) {
            _handleAppResume();
          }
        return MaterialApp(
              title: 'Purli',
              theme: ThemeData(
                primarySwatch: Colors.blue,
                useMaterial3: true,
              ),
                home: authState.user == null
                    ? const AuthenticationPage()
                    : authState.isEmailVerified
                        ? authState.hasActiveSubscription
                            ? const LibraryPage()
                            : const SubscriptionNeededPage()
                        : const EmailVerificationNeededPage(),
              // Named routes
              routes: {
                '/auth': (context) => const AuthenticationPage(),
                '/library': (context) => const LibraryPage(),
                '/reader': (context) =>
                    const ReaderPage(bookTitle: 'Example Book'),
                '/profile': (context) => const UserProfilePage(),
              },
            );
          }
        },
      ); 
    }
  }
