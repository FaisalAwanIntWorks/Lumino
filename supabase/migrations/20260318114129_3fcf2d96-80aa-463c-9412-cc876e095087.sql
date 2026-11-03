
-- Add ai_image_enabled to client_custom_enquiry_config
ALTER TABLE public.client_custom_enquiry_config 
ADD COLUMN IF NOT EXISTS ai_image_enabled boolean NOT NULL DEFAULT false;

-- Add ai_preview_url to custom_enquiry_leads
ALTER TABLE public.custom_enquiry_leads 
ADD COLUMN IF NOT EXISTS ai_preview_url text;

-- Create custom_enquiry_preview_images table
CREATE TABLE IF NOT EXISTS public.custom_enquiry_preview_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  image_url text NOT NULL,
  generation_number integer NOT NULL DEFAULT 1,
  feedback text CHECK (feedback IN ('liked', 'disliked')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.custom_enquiry_preview_images ENABLE ROW LEVEL SECURITY;

-- RLS: anyone can insert (public form)
CREATE POLICY "Anyone can insert enquiry preview images"
  ON public.custom_enquiry_preview_images
  FOR INSERT
  WITH CHECK (true);

-- RLS: anyone can update feedback
CREATE POLICY "Anyone can update enquiry preview feedback"
  ON public.custom_enquiry_preview_images
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- RLS: anyone can select
CREATE POLICY "Anyone can view enquiry preview images"
  ON public.custom_enquiry_preview_images
  FOR SELECT
  USING (true);
