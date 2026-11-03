
-- ============================================================
-- Migration 1: Fix double welcome grant + make free credits configurable
-- ============================================================

-- 1. Add configurable welcome credits column to platform_ai_config
ALTER TABLE public.platform_ai_config
  ADD COLUMN IF NOT EXISTS welcome_free_credits_dollars numeric NOT NULL DEFAULT 2.5;

-- 2. Drop the duplicate trigger that incorrectly added welcome bonus to purchased wallet
DROP TRIGGER IF EXISTS trg_grant_new_client_credits ON public.clients;
DROP FUNCTION IF EXISTS public.grant_new_client_credits();

-- 3. Fix ensure_free_credits: ONLY grant to brand-new clients
CREATE OR REPLACE FUNCTION public.ensure_free_credits(p_client_id uuid)
RETURNS public.client_free_credits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row    public.client_free_credits;
  v_amount numeric;
BEGIN
  -- Return existing active row if any
  SELECT * INTO v_row
  FROM public.client_free_credits
  WHERE client_id = p_client_id
    AND expires_at > now()
  ORDER BY expires_at DESC
  LIMIT 1;

  IF v_row.id IS NOT NULL THEN
    RETURN v_row;
  END IF;

  -- Client already received welcome grant once — do NOT re-issue
  IF EXISTS (
    SELECT 1 FROM public.client_free_credits
    WHERE client_id = p_client_id
  ) THEN
    RETURN NULL;
  END IF;

  -- Brand-new client: read configurable amount from platform_ai_config
  SELECT COALESCE(welcome_free_credits_dollars, 2.5)
  INTO v_amount
  FROM public.platform_ai_config
  LIMIT 1;

  IF v_amount IS NULL THEN
    v_amount := 2.5;
  END IF;

  INSERT INTO public.client_free_credits (client_id, credits_granted, credits_remaining)
  VALUES (p_client_id, v_amount, v_amount)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- 4. Disable monthly auto-renewal of free credits
CREATE OR REPLACE FUNCTION public.grant_monthly_free_credits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Free credits are a welcome-only benefit (first signup month).
  -- Monthly auto-renewal intentionally disabled.
  RETURN 0;
END;
$$;

-- ============================================================
-- Migration 2: Fix plan names and AI defaults
-- ============================================================

-- Rename Starter → Custom X
UPDATE public.subscription_plans
SET
  name = 'Custom X',
  price_monthly = 497.00,
  commission_rate = 15.00,
  max_products = 10,
  max_orders_per_month = 50,
  features = '["Basic catalog access", "Email support", "Shopify integration", "AI Chat (3,000/mo)", "AI Image Previews (200/mo)"]'
WHERE name = 'Starter';

-- Rename Growth → RingOS
UPDATE public.subscription_plans
SET
  name = 'RingOS',
  price_monthly = 897.00,
  commission_rate = 12.00,
  max_products = 50,
  max_orders_per_month = 200,
  features = '["Full catalog access", "Priority support", "Shopify integration", "Custom branding", "Analytics dashboard", "AI Chat (8,000/mo)", "AI Image Previews (400/mo)"]'
WHERE name = 'Growth';

-- Rename Enterprise → JewelX Suite
UPDATE public.subscription_plans
SET
  name = 'JewelX Suite',
  price_monthly = 1297.00,
  commission_rate = 10.00,
  max_products = NULL,
  max_orders_per_month = NULL,
  features = '["Unlimited products", "24/7 support", "Shopify integration", "Custom branding", "Advanced analytics", "Dedicated account manager", "API access", "AI Chat (50,000/mo)", "AI Image Previews (1,000/mo)"]'
WHERE name = 'Enterprise';

-- Insert Elite plan
INSERT INTO public.subscription_plans (name, price_monthly, commission_rate, max_products, max_orders_per_month, features)
VALUES (
  'Elite',
  1999.00,
  8.00,
  NULL,
  NULL,
  '["Everything in JewelX Suite", "White-glove onboarding", "Custom AI training", "AI Chat (100,000/mo)", "AI Image Previews (5,000/mo)", "Priority AI processing"]'
)
ON CONFLICT DO NOTHING;

-- Update plan_ai_defaults for Custom X
UPDATE public.plan_ai_defaults pad
SET
  chat_quota    = 3000,
  image_quota   = 200,
  chat_rpm      = 32,
  image_rpm     = 10,
  cost_estimate_rpm = 10,
  updated_at    = now()
FROM public.subscription_plans sp
WHERE pad.plan_id = sp.id
  AND sp.name = 'Custom X';

-- Update plan_ai_defaults for RingOS
UPDATE public.plan_ai_defaults pad
SET
  chat_quota    = 8000,
  image_quota   = 400,
  chat_rpm      = 48,
  image_rpm     = 12,
  cost_estimate_rpm = 10,
  updated_at    = now()
FROM public.subscription_plans sp
WHERE pad.plan_id = sp.id
  AND sp.name = 'RingOS';

-- Update plan_ai_defaults for JewelX Suite
UPDATE public.plan_ai_defaults pad
SET
  chat_quota    = 50000,
  image_quota   = 1000,
  chat_rpm      = 64,
  image_rpm     = 15,
  cost_estimate_rpm = 10,
  updated_at    = now()
FROM public.subscription_plans sp
WHERE pad.plan_id = sp.id
  AND sp.name = 'JewelX Suite';

-- Insert plan_ai_defaults for Elite plan
INSERT INTO public.plan_ai_defaults (plan_id, chat_quota, image_quota, chat_rpm, image_rpm, cost_estimate_rpm)
SELECT sp.id, 100000, 5000, 100, 30, 20
FROM public.subscription_plans sp
WHERE sp.name = 'Elite'
ON CONFLICT (plan_id) DO UPDATE SET
  chat_quota    = EXCLUDED.chat_quota,
  image_quota   = EXCLUDED.image_quota,
  chat_rpm      = EXCLUDED.chat_rpm,
  image_rpm     = EXCLUDED.image_rpm,
  cost_estimate_rpm = EXCLUDED.cost_estimate_rpm,
  updated_at    = now();
