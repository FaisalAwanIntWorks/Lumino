ALTER TABLE public.client_ring_form_config ADD COLUMN IF NOT EXISTS step_labels JSONB DEFAULT NULL;
ALTER TABLE public.client_grill_config ADD COLUMN IF NOT EXISTS step_labels JSONB DEFAULT NULL;
ALTER TABLE public.client_custom_enquiry_config ADD COLUMN IF NOT EXISTS step_labels JSONB DEFAULT NULL;