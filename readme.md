# Purli Web App – MVP

## Overview

**Purli** is a subscription-based web app that allows users to upload their own eBooks and read them through a custom reader that visually filters out profanity and explicit content in real time. Instead of modifying book files, Purli uses a pre-generated JSON file per title to determine what content to hide while reading.

## Core Objective

To create a clean reading experience for users who want mainstream literature without explicit content. Users will subscribe to the service for $5/month and upload their own `.epub` or `.mobi` files. The app will attempt to find a matching filter file to display a clean version of the book in the web-based reader.

---

## Features

### 1. User Authentication & Subscription
- Users can sign up, log in, and manage their account.
- Access is gated behind a **$5/month** subscription via **Stripe**.
- Include subscription management (pause, cancel, resume).

### 2. eBook Upload & Book Matching
- Accept `.epub` and `.mobi` file formats.
- Extract metadata (title and author) on upload.
- Match metadata with a pre-generated `.json` filter file on the server.
  - If a match is found: use that filter file.
  - If no match:
    - Use a **default filter file** with basic filtering rules.
    - Notify the user: “A custom clean reading experience for this book isn’t available yet, but it’s on our list.”
    - Add the book title/author to a queue (or email the admin) so a custom filter file can be created later.

### 3. Reader Experience
- In-browser book reader with:
  - Visual filtering based on JSON instructions.
  - Bookmarks.
- No toggling of filter visibility needed at this stage.
- Filtering JSON may define:
  - Words/phrases to hide.
  - Sections/pages to hide.
  - Optional: replacement text to restore meaning when context is removed (not required for MVP).

### 4. Admin Notifications
- If no filter file is found, send an email to the admin with the book's title and author to track new filter file needs.

---

## Tech Notes

### Suggested Stack
- **Frontend**: React, EPUB.js (or equivalent), Stripe integration.
- **Backend**: Node.js or Python Flask API.
- **Storage**: AWS S3 or similar (for eBooks and filter files).
- **Database**: PostgreSQL or Firebase.
- **Email Service**: SendGrid (or similar) for
