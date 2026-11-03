ALTER TABLE public.ring_preview_images ADD COLUMN IF NOT EXISTS custom_instruction text DEFAULT null;
ALTER TABLE public.grill_preview_images ADD COLUMN IF NOT EXISTS custom_instruction text DEFAULT null;
ALTER TABLE public.custom_enquiry_preview_images ADD COLUMN IF NOT EXISTS custom_instruction text DEFAULT null;