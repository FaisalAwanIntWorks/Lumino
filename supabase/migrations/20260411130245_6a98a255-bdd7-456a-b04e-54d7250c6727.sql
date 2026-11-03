ALTER TABLE public.grill_form_leads ADD COLUMN IF NOT EXISTS engraving_text text DEFAULT null;
ALTER TABLE public.custom_enquiry_leads ADD COLUMN IF NOT EXISTS engraving_text text DEFAULT null;