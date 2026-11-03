-- AI render delivery channel for the CustomX Ring Builder.
--
-- Same setting the Grillz Builder + Custom Enquiry configs got in
-- 20260930100000_ai_image_delivery.sql. The configurator asks "Do you want to
-- show AI Generated Image on Email or Thank You Page?":
--   'thank_you_page' -> shown on the thank-you screen, no render email
--   'email'          -> emailed to the customer, not shown on the thank-you screen

ALTER TABLE public.client_ring_form_config
  ADD COLUMN IF NOT EXISTS ai_image_delivery text NOT NULL DEFAULT 'thank_you_page';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'client_ring_form_config_ai_image_delivery_check'
  ) THEN
    ALTER TABLE public.client_ring_form_config
      ADD CONSTRAINT client_ring_form_config_ai_image_delivery_check
      CHECK (ai_image_delivery IN ('thank_you_page', 'email'));
  END IF;
END $$;

COMMENT ON COLUMN public.client_ring_form_config.ai_image_delivery IS
  'Where the customer receives the AI render: thank_you_page | email';
