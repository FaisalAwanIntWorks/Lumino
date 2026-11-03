-- Create a public bucket for transparent diamond form option images
INSERT INTO storage.buckets (id, name, public)
VALUES ('diamond-form-assets', 'diamond-form-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Public read access for diamond form assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'diamond-form-assets');

-- Allow authenticated users (admins) to upload/manage
CREATE POLICY "Authenticated users can upload diamond form assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'diamond-form-assets');

CREATE POLICY "Authenticated users can update diamond form assets"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'diamond-form-assets');

CREATE POLICY "Authenticated users can delete diamond form assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'diamond-form-assets');