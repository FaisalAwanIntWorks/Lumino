-- ============================================================
-- 1. Add Stripe price ID columns to subscription_plans
--    so create-checkout reads from DB instead of hardcoded values
-- ============================================================
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_license_price_id TEXT,
  ADD COLUMN IF NOT EXISTS include_license BOOLEAN NOT NULL DEFAULT false;

-- Populate with the current Stripe price IDs
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

-- Metal IQ plan (if present)
UPDATE public.subscription_plans
SET stripe_price_id = NULL, include_license = false
WHERE name = 'Metal IQ';

-- Elite: no Stripe price ID (contact sales flow)
UPDATE public.subscription_plans
SET stripe_price_id = NULL, include_license = false
WHERE name = 'Elite';

-- ============================================================
-- 2. Remove unused commission remnant columns
--    (commission_rate already dropped by 20260417100000;
--     these order/invoice columns were never used in app code)
-- ============================================================
ALTER TABLE public.orders
  DROP COLUMN IF EXISTS commission_deducted,
  DROP COLUMN IF EXISTS commission_collected;

-- Drop invoices commission column if that table exists
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
