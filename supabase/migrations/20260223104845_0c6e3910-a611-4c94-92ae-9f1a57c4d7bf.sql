
-- Add Shopify product/variant IDs for deposit products
ALTER TABLE public.client_grill_config 
  ADD COLUMN IF NOT EXISTS shopify_product_id TEXT,
  ADD COLUMN IF NOT EXISTS shopify_variant_id TEXT;

ALTER TABLE public.client_custom_enquiry_config 
  ADD COLUMN IF NOT EXISTS shopify_product_id TEXT,
  ADD COLUMN IF NOT EXISTS shopify_variant_id TEXT;
