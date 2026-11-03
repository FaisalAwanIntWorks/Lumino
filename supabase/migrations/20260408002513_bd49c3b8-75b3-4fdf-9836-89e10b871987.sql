
ALTER TABLE public.saved_designs ADD COLUMN IF NOT EXISTS edit_history jsonb[] DEFAULT '{}';
ALTER TABLE public.diamond_form_leads ADD COLUMN IF NOT EXISTS edit_history jsonb[] DEFAULT '{}';
ALTER TABLE public.grill_form_leads ADD COLUMN IF NOT EXISTS edit_history jsonb[] DEFAULT '{}';
ALTER TABLE public.custom_enquiry_leads ADD COLUMN IF NOT EXISTS edit_history jsonb[] DEFAULT '{}';
