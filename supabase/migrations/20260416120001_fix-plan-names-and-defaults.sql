
-- ============================================================
-- Fix: Rename subscription plans to match frontend expectations
-- Old: Starter / Growth / Enterprise
-- New: Custom X / RingOS / JewelX Suite / Elite
-- Also seeds correct plan_ai_defaults for all 4 plans
-- ============================================================

-- Step 1: Rename existing plans and update prices
UPDATE public.subscription_plans
SET
  name = 'Custom X',
  price_monthly = 497.00,
  commission_rate = 15.00,
  max_products = 10,
  max_orders_per_month = 50,
  features = '["Basic catalog access", "Email support", "Shopify integration", "AI Chat (3,000/mo)", "AI Image Previews (200/mo)"]'
WHERE name = 'Starter';

UPDATE public.subscription_plans
SET
  name = 'RingOS',
  price_monthly = 897.00,
  commission_rate = 12.00,
  max_products = 50,
  max_orders_per_month = 200,
  features = '["Full catalog access", "Priority support", "Shopify integration", "Custom branding", "Analytics dashboard", "AI Chat (8,000/mo)", "AI Image Previews (400/mo)"]'
WHERE name = 'Growth';

UPDATE public.subscription_plans
SET
  name = 'JewelX Suite',
  price_monthly = 1297.00,
  commission_rate = 10.00,
  max_products = NULL,
  max_orders_per_month = NULL,
  features = '["Unlimited products", "24/7 support", "Shopify integration", "Custom branding", "Advanced analytics", "Dedicated account manager", "API access", "AI Chat (50,000/mo)", "AI Image Previews (1,000/mo)"]'
WHERE name = 'Enterprise';

-- Step 2: Insert Elite plan (new)
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

-- Step 3: Update plan_ai_defaults for renamed plans (UUID-based FK, so name match via subquery)
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

-- Step 4: Insert plan_ai_defaults for Elite plan
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
