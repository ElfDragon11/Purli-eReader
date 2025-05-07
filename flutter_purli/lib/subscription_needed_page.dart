import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

class SubscriptionNeededPage extends StatelessWidget {
  static const String route = '/subscription-needed';
  const SubscriptionNeededPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Subscription Required'),
        automaticallyImplyLeading: false,
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center, // Center the content
          children: [
             Padding(
                padding: const EdgeInsets.all(16.0),
                child: Text(
                  'A subscription is required to access the library and reader.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 18.0),
                ),
            ),
            ElevatedButton(
              onPressed: () async {
                const url = 'https://www.purli.co/subscription';


                if (await canLaunchUrl(Uri.parse(url))) {
                  await launchUrl(Uri.parse(url));
                } else {
                  throw 'Could not launch $url';
                }
              },
              child: Text('Subscribe Now'),
            ),
          ],
        ),
      ),
    );
  }
}