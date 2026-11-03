
CREATE TABLE public.ring_preview_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text NOT NULL,
  image_url text NOT NULL,
  generation_number integer NOT NULL DEFAULT 1,
  feedback text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ring_preview_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert on ring_preview_images"
  ON public.ring_preview_images FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public select on ring_preview_images"
  ON public.ring_preview_images FOR SELECT
  USING (true);

CREATE POLICY "Allow public update on ring_preview_images"
  ON public.ring_preview_images FOR UPDATE
  USING (true);

-- Add ai_preview_url to design_requests if not exists
ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS ai_preview_url text DEFAULT NULL;

-- Validate feedback
CREATE TRIGGER validate_ring_preview_feedback
  BEFORE INSERT OR UPDATE ON public.ring_preview_images
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_preview_feedback();
