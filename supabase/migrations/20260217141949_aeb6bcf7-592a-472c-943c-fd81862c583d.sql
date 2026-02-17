-- Create public bucket for assets (logo, etc.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('assets', 'assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to assets bucket
CREATE POLICY "Public read access for assets"
ON storage.objects
FOR SELECT
USING (bucket_id = 'assets');

-- Allow authenticated users to upload assets
CREATE POLICY "Authenticated users can upload assets"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'assets');
