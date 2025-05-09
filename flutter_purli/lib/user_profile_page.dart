import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState; // Hide Supabase's AuthState to resolve ambiguity
import 'auth_state.dart'; // Ensure our AuthState is imported
import 'package:url_launcher/url_launcher.dart';


class UserProfilePage extends StatefulWidget {
  @override
  _UserProfilePageState createState() => _UserProfilePageState();
}

class UserData {
  final String email;
  final String subscriptionStatus;

  UserData(this.email, this.subscriptionStatus);
}

class _UserProfilePageState extends State<UserProfilePage> {
  bool _isLoading = true;
  String _errorMessage = '';
  UserData? _userData;

  @override
  void initState() {
    super.initState();
    _fetchUserData();
  }

  Future<void> _fetchUserData() async {
    setState(() {
      _isLoading = true;
      _errorMessage = '';
    });

    try {
      final userId = Supabase.instance.client.auth.currentUser!.id;
      try {
        final userDataResponse = await Supabase.instance.client
            .from('users') // Replace with your users table name if different
            .select()
            .eq('id', userId)
            .single();
        final subscriptionResponse = await Supabase.instance.client
            .from('subscriptions') // Replace with your subscriptions table name if different
            .select()
            .eq('user_id', userId)
            .single(); // Assuming one subscription per user
        setState(() {
          _isLoading = false;
          _userData = UserData(
              userDataResponse['email'], subscriptionResponse['status']);
        });
      } on PostgrestException catch (e) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'Error fetching user data: ${e.message}';
        });
      } on Exception catch (e) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'An unknown error occurred: $e';
        });
      }
    } catch (e) {
      setState(() {
        _isLoading = false;
        _errorMessage = 'Error: $e';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error fetching user data: $_errorMessage')),
        );
      });
    }


  }

  Future<void> _launchSubscriptionUrl() async {
    final Uri url = Uri.parse('https://www.purli.co/subscription'); // Replace with your website's subscription URL
    if (!await launchUrl(url)) {
      setState(() {
       
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Could not launch subscription URL')),
        );
      });
      
    }
  }






  @override
  Widget build(BuildContext context) {
    return Scaffold(
        appBar: AppBar(
          title: const Text('User Profile & Subscription'),
        ),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _errorMessage.isNotEmpty
                    // Corrected ternary operator for error display
                    ? Center(
                        child: Text(
                          'Error: $_errorMessage',
                          style: const TextStyle(color: Colors.red),
                          textAlign: TextAlign.center,
                        ),
                      )
                    : SingleChildScrollView(
                      child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Card(
                              elevation: 4.0,
                              margin: const EdgeInsets.symmetric(vertical: 8.0),
                              child: Padding(
                                padding: const EdgeInsets.all(16.0),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      'User Profile',
                                      style: TextStyle(
                                          fontSize: 24.0,
                                          fontWeight: FontWeight.bold,
                                          color: Theme.of(context).primaryColor),
                                    ),
                                    const SizedBox(height: 10.0),
                                    Text('Email: ${_userData?.email}', style: const TextStyle(fontSize: 16.0)),
                                  ],
                                ),
                              ),
                            ),
                            Card(
                              elevation: 4.0,
                              margin: const EdgeInsets.symmetric(vertical: 8.0),
                              child: Padding(
                                padding: const EdgeInsets.all(16.0),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('Subscription Status', style: TextStyle(fontSize: 18.0, fontWeight: FontWeight.bold, color: Theme.of(context).primaryColor)),
                                    const SizedBox(height: 8.0),
                                    Text('${_userData?.subscriptionStatus}', style: const TextStyle(fontSize: 16.0)),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(height: 20.0),
                            ElevatedButton(
                              onPressed: _launchSubscriptionUrl,
                              child: const Text('Manage Subscription'),
                            ),
                            const SizedBox(height: 20.0), // Add some spacing
                            // Correctly implemented Sign Out button
                            ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.redAccent, // Example: different color for sign out
                              ),
                              onPressed: () {
                                final authState = Provider.of<AuthState>(context, listen: false);
                                authState.clearUser(); // Changed from signOut() to clearUser()
                                // After signing out, you might want to navigate the user to the login screen
                                // For example, if your authentication page is AuthPage:
                                // Navigator.of(context).pushAndRemoveUntil(
                                //   MaterialPageRoute(builder: (context) => AuthPage()), 
                                //   (Route<dynamic> route) => false,
                                // );
                              },
                              child: const Text('Sign Out'),
                            ),
                          ],
                        ),
                      ),
          ),
        ));
  }
}