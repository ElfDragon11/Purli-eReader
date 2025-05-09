import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class EmailVerificationNeededPage extends StatelessWidget {
  const EmailVerificationNeededPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Email Verification Needed'),
      ),      
       body: Center(
        child: Padding(
            padding: EdgeInsets.all(16),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                Text(
                  'Please verify your email address to continue.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 18.0),
                ),
                SizedBox(height: 20.0),
                // Button for resending verification email
                ElevatedButton(
                  onPressed: () async {
                     try {
                      // Added email for resend function
                      final email = Supabase.instance.client.auth.currentUser?.email;
                      if (email != null) {
                        await Supabase.instance.client.auth.resend(type: OtpType.signup, email: email);
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Verification email resent. Check your inbox!'),
                          ),
                        );
                      } else {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Could not resend email. User email not found.'),
                          ),
                        );
                      }
                    } catch (e) {
                       ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text('Failed to send email: $e'),
                        ),
                      );
                    }
                  },
                  child: Text('Resend Verification Email'),
                ),
              ],
            ),
        ),
      ),
    );
  }
}