
ALTER TABLE public.client_ring_form_config
  ADD COLUMN IF NOT EXISTS option_image_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.client_grill_config
  ADD COLUMN IF NOT EXISTS option_image_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.client_custom_enquiry_config
  ADD COLUMN IF NOT EXISTS option_image_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
