
ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS engraving_text text;
ALTER TABLE public.diamond_form_leads ADD COLUMN IF NOT EXISTS engraving_text text;
