ALTER TABLE public.client_grill_questions ADD COLUMN IF NOT EXISTS subtitle text DEFAULT null;
ALTER TABLE public.client_custom_enquiry_questions ADD COLUMN IF NOT EXISTS subtitle text DEFAULT null;