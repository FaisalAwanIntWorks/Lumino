-- Device the customer used when submitting a lead form (mobile/tablet/desktop,
-- OS, browser, model). Captured in the browser at submit time by
-- src/lib/lead-device.ts; NULL for older leads and server-created rows.
ALTER TABLE public.diamond_form_leads    ADD COLUMN IF NOT EXISTS device_info jsonb;
ALTER TABLE public.grill_form_leads      ADD COLUMN IF NOT EXISTS device_info jsonb;
ALTER TABLE public.custom_enquiry_leads  ADD COLUMN IF NOT EXISTS device_info jsonb;
ALTER TABLE public.design_requests       ADD COLUMN IF NOT EXISTS device_info jsonb;
ALTER TABLE public.metal_buying_leads    ADD COLUMN IF NOT EXISTS device_info jsonb;
ALTER TABLE public.appointment_bookings  ADD COLUMN IF NOT EXISTS device_info jsonb;
ALTER TABLE public.saved_designs         ADD COLUMN IF NOT EXISTS device_info jsonb;

COMMENT ON COLUMN public.diamond_form_leads.device_info IS 'Submitter device: {device_type, os, os_version, browser, browser_version, model, screen, touch, user_agent}';
