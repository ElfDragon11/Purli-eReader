import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
// import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart' hide AuthState; // Hide Supabase's AuthState
import 'package:provider/provider.dart';
import 'auth_state.dart';

class AuthPage extends StatefulWidget {
  static const String route = '/auth';
  const AuthPage({Key? key}) : super(key: key);

  @override
  _AuthPageState createState() => _AuthPageState();
}

class _AuthPageState extends State<AuthPage> {
  bool _isLogin = true;
  bool _agreeToTerms = false;
  bool _isLoading = false;

  final _formKey = GlobalKey<FormState>();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();

  void _toggleForm() {
      setState(() {
        _isLogin = !_isLogin;
      });
  }
  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _launchTermsUrl() async {
    const url = 'https://purli.co/terms';
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else {
      throw 'Could not launch $url';
    }
  }

  void _submitForm() {
    if (_formKey.currentState!.validate()) {
      setState(() {
        _isLoading = true;
      });

      Future<void> authAction;
      if (_isLogin) {
        authAction = Supabase.instance.client.auth.signInWithPassword(
          email: _emailController.text,
          password: _passwordController.text,
        ).then((res) {
          _handleAuthenticationSuccess(res.user);
        }).catchError((error) {
          if(error is AuthException) {
            _showErrorSnackBar(error.message);
          }
        });
      } else {
        if (!_agreeToTerms) {
          _showErrorSnackBar('Please agree to the terms and privacy policy');
           setState(() {
              _isLoading = false;
           });
          return;
        }

        authAction = Supabase.instance.client.auth.signUp(
          email: _emailController.text,
          password: _passwordController.text,
        ).then((res) {
          _handleAuthenticationSuccess(res.user);
        }).catchError((error) {
          setState(() => _isLoading = false);

           if(error is AuthException) {
            _showErrorSnackBar(error.message);
          }
        });
      }
       authAction.then((_) {
        if(mounted){
          if (_isLogin) {
          } else {
            // Redirect to web checkout after signup
            final checkoutUrl = Uri.parse('YOUR_WEB_APP_CHECKOUT_URL?return=your_flutter_app_scheme://return');
            launchUrl(checkoutUrl);
          }
        }
      }).catchError((error) {
           if (mounted) {
            setState(() {
              _isLoading = false;
            });
          }
      });
    }
  }
  Future<void> _handleAuthenticationSuccess(User? user) async {
    if(mounted){
      final authState = Provider.of<AuthState>(context, listen: false);
      if (user != null) {
        final userId = user.id; 
        bool isEmailVerified = user.emailConfirmedAt != null; 
        bool hasActiveSubscription = false;
        try{
          final subscriptionResponse = await Supabase.instance.client.from('subscriptions').select().eq('user_id', userId).single();
          // Check if subscriptionResponse contains 'status' and it's 'active'
          // The previous check 'subscriptionResponse != null' is redundant because .single() would throw if no record is found.
          if (subscriptionResponse['status'] == 'active') {
            hasActiveSubscription = true;
          }
        }catch(e){
          if (kDebugMode) {
            print('Error fetching subscription: $e');
          }
        }finally{
          authState.setUser(user, isEmailVerified: isEmailVerified, hasActiveSubscription: hasActiveSubscription);
        } // Corrected: Removed extra '});' from here
      } else {
        // Optionally handle the case where user is null after auth attempt
        authState.clearUser(); // Example: clear user from state
      } // Corrected: Removed extra '});' from here
    }
  }
  void _showErrorSnackBar(String message) {
    if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(message),
        backgroundColor: Colors.red,
        ));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_isLogin ? 'Login' : 'Sign Up' ),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Form(
              key: _formKey,
              child: SingleChildScrollView(
                physics: const BouncingScrollPhysics(),
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: <Widget>[
                      TextFormField(
                        controller: _emailController,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(
                            labelText: 'Email'
                        ),
                        validator: (value) {
                          if (value == null || value.isEmpty) {
                            return 'Please enter your email';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 12.0),
                      TextFormField(
                        controller: _passwordController,
                        obscureText: true,
                        decoration: const InputDecoration(labelText: 'Password'),
                        validator: (value) {
                          if (value == null || value.isEmpty) {
                            return 'Please enter your password';
                          }
                          return null;
                        },
                      ),
                      if (!_isLogin) ...[
                        const SizedBox(height: 12.0),
                        Row(
                          children: [
                            Checkbox(
                              value: _agreeToTerms,
                              onChanged: (bool? newValue) {
                                setState(() {
                                  _agreeToTerms = newValue!;
                                });
                              },
                            ),
                            GestureDetector(
                              onTap: _launchTermsUrl,
                              child: const Text(
                                'I agree to the Terms and Privacy Policy',
                                style: TextStyle(
                                  decoration: TextDecoration.underline,
                                  color: Colors.blue,
                                ),
                              ),
                            ),
                          ],
                        ), // Closes Row
                        // Removed extra parenthesis here: ), 
                      ],
                      const SizedBox(height: 16),
                      _isLoading ? const Center(child: CircularProgressIndicator()) :ElevatedButton(onPressed: _submitForm, child: Text(_isLogin ? 'Login' : 'Sign Up')),
                    ],
                  ),
                  ),
          ),
        ),
      ),
        bottomNavigationBar: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
            TextButton(onPressed: _toggleForm, child: Text(_isLogin ? 'Don\'t have an account? Sign Up' : 'Already have an account? Login'),),],
          ),
            ),
    );
  }
}
