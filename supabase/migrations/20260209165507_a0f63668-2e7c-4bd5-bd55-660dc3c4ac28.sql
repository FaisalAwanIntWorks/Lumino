
-- Add inspiration_image_urls column to diamond_form_leads
ALTER TABLE public.diamond_form_leads
ADD COLUMN IF NOT EXISTS inspiration_image_urls text[] DEFAULT '{}';

-- Create storage bucket for diamond form inspiration images
INSERT INTO storage.buckets (id, name, public)
VALUES ('diamond-inspiration', 'diamond-inspiration', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to upload to the bucket (form is public-facing)
CREATE POLICY "Anyone can upload diamond inspiration images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'diamond-inspiration');

-- Allow anyone to read diamond inspiration images
CREATE POLICY "Anyone can view diamond inspiration images"
ON storage.objects FOR SELECT
USING (bucket_id = 'diamond-inspiration');

-- Allow deletion by authenticated users
CREATE POLICY "Authenticated users can delete diamond inspiration images"
ON storage.objects FOR DELETE
USING (bucket_id = 'diamond-inspiration' AND auth.role() = 'authenticated');
