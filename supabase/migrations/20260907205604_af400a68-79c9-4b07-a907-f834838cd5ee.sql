-- CustomX forms (Ring Builder, Grillz Builder, Custom Enquiry): per-client
-- "How would you like your leads to contact you?" setting. Drives the button
-- shown on the thank-you screen after a lead is submitted.
-- Shape: { "method": "none" | "call" | "contact" | "schedule",
--          "phone": "+1 555 000 0000", "calendar_url": "https://..." }
ALTER TABLE public.client_ring_form_config
  ADD COLUMN IF NOT EXISTS thank_you_contact jsonb;

ALTER TABLE public.client_grill_config
  ADD COLUMN IF NOT EXISTS thank_you_contact jsonb;

ALTER TABLE public.client_custom_enquiry_config
  ADD COLUMN IF NOT EXISTS thank_you_contact jsonb;

COMMENT ON COLUMN public.client_ring_form_config.thank_you_contact IS
  'Thank-you screen contact button: { method: none|call|contact|schedule, phone, calendar_url }.';
COMMENT ON COLUMN public.client_grill_config.thank_you_contact IS
  'Thank-you screen contact button: { method: none|call|contact|schedule, phone, calendar_url }.';
COMMENT ON COLUMN public.client_custom_enquiry_config.thank_you_contact IS
  'Thank-you screen contact button: { method: none|call|contact|schedule, phone, calendar_url }.';