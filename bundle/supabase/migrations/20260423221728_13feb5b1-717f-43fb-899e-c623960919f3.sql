-- Add legacy_stripe_price_ids column for backward-compatible price → plan resolution
ALTER TABLE public.subscription_plans
ADD COLUMN IF NOT EXISTS legacy_stripe_price_ids text[] DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_subscription_plans_legacy_prices
  ON public.subscription_plans USING GIN(legacy_stripe_price_ids);

-- Backfill known legacy Ring OS price
UPDATE public.subscription_plans
SET legacy_stripe_price_ids = ARRAY['price_1TI8qBELyIQnr0qGDMh7TVvw']
WHERE name = 'Ring OS'
  AND NOT ('price_1TI8qBELyIQnr0qGDMh7TVvw' = ANY(COALESCE(legacy_stripe_price_ids, '{}')));

-- Canonicalize plan_name in cache via plan_id join
UPDATE public.client_subscriptions cs
SET plan_name = sp.name,
    updated_at = now()
FROM public.subscription_plans sp
WHERE cs.plan_id = sp.id
  AND cs.plan_name IS DISTINCT FROM sp.name;

-- Force re-fetch from Stripe for any rows missing current_period_end
-- by setting updated_at far in the past (cache TTL is 15 min)
UPDATE public.client_subscriptions
SET updated_at = '2000-01-01'::timestamptz
WHERE current_period_end IS NULL
  AND status IN ('active', 'trialing');