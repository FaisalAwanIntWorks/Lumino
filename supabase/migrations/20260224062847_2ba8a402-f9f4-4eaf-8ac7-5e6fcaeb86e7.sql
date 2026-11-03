-- Add form_colors JSONB column to both form config tables
-- Stores: { background, tabBorder, fontColor, imageBg, submitButtonBg, submitButtonText }
ALTER TABLE public.client_grill_config
ADD COLUMN IF NOT EXISTS form_colors jsonb DEFAULT null;

ALTER TABLE public.client_custom_enquiry_config
ADD COLUMN IF NOT EXISTS form_colors jsonb DEFAULT null;