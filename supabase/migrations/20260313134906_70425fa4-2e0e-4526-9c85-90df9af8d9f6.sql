
ALTER TABLE public.grill_preview_images 
  ADD COLUMN IF NOT EXISTS feedback TEXT DEFAULT NULL;

-- Use a validation trigger instead of CHECK constraint
CREATE OR REPLACE FUNCTION public.validate_preview_feedback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.feedback IS NOT NULL AND NEW.feedback NOT IN ('liked', 'disliked') THEN
    RAISE EXCEPTION 'feedback must be liked, disliked, or null';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_preview_feedback_trigger
  BEFORE INSERT OR UPDATE ON public.grill_preview_images
  FOR EACH ROW EXECUTE FUNCTION public.validate_preview_feedback();

-- Allow anonymous updates for feedback
CREATE POLICY "Anyone can update feedback on preview images"
  ON public.grill_preview_images FOR UPDATE
  USING (true) WITH CHECK (true);
