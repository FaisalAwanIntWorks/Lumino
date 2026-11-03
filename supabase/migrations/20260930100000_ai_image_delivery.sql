-- AI render delivery channel for CustomX Grillz Builder + Custom Enquiry.
--
-- The configurator asks "Do you want to show AI Generated Image on Email or
-- Thank You Page?". The customer receives the AI render through exactly one
-- channel:
--   'thank_you_page' -> shown on the thank-you screen, no render email
--   'email'          -> emailed to the customer, not shown on the thank-you screen

ALTER TABLE public.client_grill_config
  ADD COLUMN IF NOT EXISTS ai_image_delivery text NOT NULL DEFAULT 'thank_you_page';

ALTER TABLE public.client_custom_enquiry_config
  ADD COLUMN IF NOT EXISTS ai_image_delivery text NOT NULL DEFAULT 'thank_you_page';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_grill_config_ai_image_delivery_check'
  ) THEN
    ALTER TABLE public.client_grill_config
      ADD CONSTRAINT client_grill_config_ai_image_delivery_check
      CHECK (ai_image_delivery IN ('thank_you_page', 'email'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_custom_enquiry_config_ai_image_delivery_check'
  ) THEN
    ALTER TABLE public.client_custom_enquiry_config
      ADD CONSTRAINT client_custom_enquiry_config_ai_image_delivery_check
      CHECK (ai_image_delivery IN ('thank_you_page', 'email'));
  END IF;
END $$;

COMMENT ON COLUMN public.client_grill_config.ai_image_delivery IS
  'Where the customer receives the AI render: thank_you_page | email';
COMMENT ON COLUMN public.client_custom_enquiry_config.ai_image_delivery IS
  'Where the customer receives the AI render: thank_you_page | email';
