ALTER TABLE public.client_onboarding_preferences
  ADD COLUMN IF NOT EXISTS widget_shopify_product_id text,
  ADD COLUMN IF NOT EXISTS widget_shopify_variant_id text;