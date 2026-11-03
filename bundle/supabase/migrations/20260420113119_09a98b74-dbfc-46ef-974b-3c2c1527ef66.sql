-- Add new columns
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS payment_link_url text,
  ADD COLUMN IF NOT EXISTS feature_set jsonb;

-- Seed JewlX Suite (all 9 features)
UPDATE public.subscription_plans
SET payment_link_url = 'https://buy.stripe.com/3cI6oH5EyboubPJaGO9sk02',
    feature_set = jsonb_build_object(
      'diamond_form', true,
      'embed_branding', true,
      'product_catalogue', true,
      'jewlx_agent', true,
      'orders', true,
      'custom_enquiry', true,
      'grillz_builder', true,
      'experimental_ui', true,
      'metal_buying', true
    )
WHERE name ILIKE 'JewlX Suite' OR name ILIKE 'Jewlx Suite' OR name ILIKE 'jewelx suite';

-- Seed Custom X
UPDATE public.subscription_plans
SET payment_link_url = 'https://buy.stripe.com/3cI00j5Ey3W22f92ai9sk03',
    feature_set = jsonb_build_object(
      'diamond_form', false,
      'embed_branding', false,
      'product_catalogue', false,
      'jewlx_agent', false,
      'orders', false,
      'custom_enquiry', true,
      'grillz_builder', true,
      'experimental_ui', false,
      'metal_buying', false
    )
WHERE name ILIKE 'Custom X';

-- Seed RingOS
UPDATE public.subscription_plans
SET payment_link_url = 'https://buy.stripe.com/eVq8wP8QK2RYcTN2ai9sk04',
    feature_set = jsonb_build_object(
      'diamond_form', true,
      'embed_branding', true,
      'product_catalogue', true,
      'jewlx_agent', true,
      'orders', true,
      'custom_enquiry', false,
      'grillz_builder', false,
      'experimental_ui', false,
      'metal_buying', false
    )
WHERE name ILIKE 'RingOS' OR name ILIKE 'Ring OS';