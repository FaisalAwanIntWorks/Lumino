
ALTER TABLE public.client_grill_questions ADD COLUMN IF NOT EXISTS option_images JSONB DEFAULT NULL;
ALTER TABLE public.client_custom_enquiry_questions ADD COLUMN IF NOT EXISTS option_images JSONB DEFAULT NULL;
