-- ============================================================
-- 1. Add Stripe price ID columns to subscription_plans
-- ============================================================
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_license_price_id TEXT,
  ADD COLUMN IF NOT EXISTS include_license BOOLEAN NOT NULL DEFAULT false;

UPDATE public.subscription_plans
SET stripe_price_id = 'price_1TI8owELyIQnr0qGdXZTBCkh', include_license = false
WHERE name = 'Custom X';

UPDATE public.subscription_plans
SET stripe_price_id = 'price_1TI8qBELyIQnr0qGDMh7TVvw',
    include_license = true,
    stripe_license_price_id = 'price_1TBHCOELyIQnr0qGITtUsNcD'
WHERE name = 'RingOS';

UPDATE public.subscription_plans
SET stripe_price_id = 'price_1TI8qnELyIQnr0qGgFQhx5Iz',
    include_license = true,
    stripe_license_price_id = 'price_1TBHCOELyIQnr0qGITtUsNcD'
WHERE name = 'JewelX Suite';

UPDATE public.subscription_plans
SET stripe_price_id = NULL, include_license = false
WHERE name = 'Metal IQ';

UPDATE public.subscription_plans
SET stripe_price_id = NULL, include_license = false
WHERE name = 'Elite';

-- ============================================================
-- 2. Remove unused commission remnant columns
-- ============================================================
ALTER TABLE public.orders
  DROP COLUMN IF EXISTS commission_deducted,
  DROP COLUMN IF EXISTS commission_collected;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name = 'commission_total'
  ) THEN
    ALTER TABLE public.invoices DROP COLUMN commission_total;
  END IF;
END $$;

-- ============================================================
-- 3. Add display-only columns for PlanSelection page
-- ============================================================
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS tagline       TEXT,
  ADD COLUMN IF NOT EXISTS price_note    TEXT,
  ADD COLUMN IF NOT EXISTS cta_text      TEXT,
  ADD COLUMN IF NOT EXISTS is_highlighted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS display_order  INTEGER NOT NULL DEFAULT 0;

UPDATE public.subscription_plans SET
  tagline       = 'Best for custom jewelry stores',
  price_note    = '/month · 30-day free trial',
  cta_text      = 'Get Custom X',
  is_highlighted = false,
  display_order  = 1,
  features       = '["Custom jewelry form builder","AI image previews","Shopify integration","Email support","Analytics dashboard","Custom branding"]'
WHERE name = 'Custom X';

UPDATE public.subscription_plans SET
  tagline       = 'Live metal prices & analytics',
  price_note    = '/month · 30-day free trial',
  cta_text      = 'Get Metal IQ',
  is_highlighted = false,
  display_order  = 2,
  features       = '["Metal IQ access","Live gold / silver / platinum prices","Email support","Analytics dashboard","Shopify integration"]'
WHERE name = 'Metal IQ';

UPDATE public.subscription_plans SET
  tagline       = 'Best for engagement ring retailers',
  price_note    = '/month + $4,999 license · 30-day free trial',
  cta_text      = 'Get RingOS',
  is_highlighted = false,
  display_order  = 3,
  features       = '["Ring builder OS","AI chat assistant","3D ring previews","Shopify integration","Priority support","Custom branding","Analytics dashboard","CAD request system"]'
WHERE name = 'RingOS';

UPDATE public.subscription_plans SET
  tagline       = 'Best for full-service jewelers',
  price_note    = '/month + $4,999 license · 30-day free trial',
  cta_text      = 'Get the Suite',
  is_highlighted = true,
  display_order  = 4,
  features       = '["Everything in RingOS","Grillz form builder","Custom enquiry forms","Metal buying forms","Advanced analytics","Dedicated account manager","API access","Priority CAD queue"]'
WHERE name = 'JewelX Suite';

UPDATE public.subscription_plans SET
  tagline       = 'For enterprise jewelers',
  price_note    = '/month + custom onboarding from $19,000',
  cta_text      = 'Request a Call',
  is_highlighted = false,
  display_order  = 5,
  features       = '["Everything in JewelX Suite","White-glove onboarding","Custom integrations","Dedicated success manager","SLA guarantees","Custom AI model training","Unlimited CAD requests"]'
WHERE name = 'Elite';