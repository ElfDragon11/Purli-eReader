# Purli Flutter App Setup Guide

This guide will walk you through setting up the Purli Flutter application on your local machine.

## Prerequisites

*   Flutter SDK installed and configured.
*   A Supabase account and project.
*   Access to your Cloud Run endpoint for filtering.

## 1. Get the Code

Download or clone the application files to your local machine.

## 2. Set up Flutter

If you don't have Flutter installed, follow the official installation guide for your operating system: [https://flutter.dev/docs/get-started/install](https://flutter.dev/docs/get-started/install)

After installing Flutter, open your terminal or command prompt and navigate to the root directory of the `flutter_purli` project.

Run `flutter doctor` to check your environment and report any issues. Follow the instructions provided by `flutter doctor` to install any missing dependencies (e.g., Android Studio, Xcode).

## 3. Add Dependencies

The project uses several dependencies. Most should be handled by `pub get`, but we specifically added `flutter_html` manually.

Open the `pubspec.yaml` file in the root of the `flutter_purli` project.

Ensure the `flutter_html` dependency is present under the `dependencies:` section. If not, add it:
```
yaml
dependencies:
  flutter:
    sdk: flutter
  # ... other dependencies
  flutter_html: ^3.0.0-beta.2 # Use the latest version or the one specified in pubspec.yaml
  # ... other dependencies
```
Save the `pubspec.yaml` file.

In your terminal, navigate to the root of the `flutter_purli` project and run:
```
bash
flutter pub get
```
This command fetches all the dependencies listed in `pubspec.yaml`.

## 4. Set up Supabase

You need a Supabase project to store book information, user data, and filters.

1.  **Create a Supabase Project:** If you don't have one, create a new project in your Supabase dashboard.
2.  **Get Supabase URL and Anon Key:** Go to `Settings > API` in your Supabase project dashboard. You will find your project's URL and `anon` public key there.
3.  **Update Supabase Configuration:** Open the file where your Supabase client is initialized in the Flutter app (this is likely in your `main.dart` or a dedicated Supabase initialization file, look for `Supabase.initialize`). Update the `url` and `anonKey` parameters with your project's details.
```
dart
    await Supabase.initialize(
      url: 'YOUR_SUPABASE_URL',
      anonKey: 'YOUR_SUPABASE_ANON_KEY',
    );
    
```
4.  **Set up Storage Buckets:** In your Supabase dashboard, go to `Storage`. Create two new buckets:
    *   `book_uploads`: This bucket will store the uploaded EPUB files.
    *   `book_covers`: This bucket will store the extracted book cover images.
    *   Ensure that the security policies for these buckets allow your application to upload and download files as needed (e.g., allow authenticated users to upload and read).

5.  **Database Schema:** Ensure your Supabase database has the necessary tables (`books`, `filters`, and potentially `profiles` or user management tables) with the correct columns (`id`, `title`, `author`, `file_path`, `cover_path`, `user_id` in `books`; `book_id`, `content` in `filters`). You can find the schema used in the application code (`library_page.dart` and `reader_page.dart`) as a reference.

## 5. Configure Cloud Run Endpoint

The application triggers a Cloud Run endpoint (`https://generate-filter-gemini-478949773026.us-central1.run.app/filter_epub_handler`) for book filtering.

*   Ensure this Cloud Run service is deployed and accessible.
*   The Flutter app expects a JSON response from this endpoint containing the filter data.

## 6. Run the App

Once all the steps above are completed, you can run the application in your terminal from the project's root directory:
```
bash
flutter run
```
This will launch the app on a connected device or emulator.

This README provides the essential steps for setting up and running the Purli Flutter app. You may need to refer to the application's source code for more specific details on database schema or other configurations.