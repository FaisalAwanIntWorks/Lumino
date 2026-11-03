-- Create the ring-assets bucket (public for CDN access)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ring-assets',
  'ring-assets', 
  true,
  524288000,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'model/gltf-binary', 'model/obj', 'application/octet-stream']::text[]
);

-- RLS policy: Allow public read access (for displaying on ring builder)
CREATE POLICY "Public read access for ring-assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'ring-assets');

-- RLS policy: Allow authenticated users to upload (admins only)
CREATE POLICY "Authenticated users can upload ring-assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'ring-assets');

-- RLS policy: Allow authenticated users to delete
CREATE POLICY "Authenticated users can delete ring-assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'ring-assets');