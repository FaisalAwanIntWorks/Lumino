
-- Add CTA config column for configurable call-to-action buttons
ALTER TABLE public.client_metal_buying_config
ADD COLUMN IF NOT EXISTS cta_config jsonb NOT NULL DEFAULT '{"book_url": "", "call_number": "", "text_number": ""}'::jsonb;

-- Add spot price date to leads
ALTER TABLE public.metal_buying_leads
ADD COLUMN IF NOT EXISTS spot_price_date text;
