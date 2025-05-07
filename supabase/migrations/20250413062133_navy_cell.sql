/*
  # Add Storage Bucket for Books

  1. Storage
    - Create 'books' storage bucket for storing uploaded book files
    - Set public access policy for authenticated users
*/

-- Enable storage if not already enabled
CREATE EXTENSION IF NOT EXISTS "storage" SCHEMA "extensions";

-- Create the storage bucket if it doesn't exist
INSERT INTO storage.buckets (id, name)
VALUES ('books', 'books')
ON CONFLICT (id) DO NOTHING;

-- Set up storage policy for authenticated users
CREATE POLICY "Authenticated users can upload books"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'books' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can read their own books"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'books' AND auth.uid()::text = (storage.foldername(name))[1]);