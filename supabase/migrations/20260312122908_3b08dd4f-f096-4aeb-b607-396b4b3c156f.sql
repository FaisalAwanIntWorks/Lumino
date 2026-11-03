
-- Add is_required column to client_grill_questions
ALTER TABLE public.client_grill_questions ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT false;

-- Add is_required column to client_custom_enquiry_questions
ALTER TABLE public.client_custom_enquiry_questions ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT false;

-- Add required_contact_fields to client_grill_config (stores which contact fields are required)
ALTER TABLE public.client_grill_config ADD COLUMN IF NOT EXISTS required_contact_fields jsonb NOT NULL DEFAULT '{"name": true, "email": true, "phone": true}'::jsonb;

-- Add required_contact_fields to client_custom_enquiry_config
ALTER TABLE public.client_custom_enquiry_config ADD COLUMN IF NOT EXISTS required_contact_fields jsonb NOT NULL DEFAULT '{"name": true, "email": true, "phone": true}'::jsonb;

-- Add required_contact_fields to client_ring_form_config
ALTER TABLE public.client_ring_form_config ADD COLUMN IF NOT EXISTS required_contact_fields jsonb NOT NULL DEFAULT '{"name": true, "email": true, "phone": true}'::jsonb;
