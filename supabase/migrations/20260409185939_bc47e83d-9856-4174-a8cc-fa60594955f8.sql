ALTER TABLE public.client_diamond_presets DROP COLUMN IF EXISTS shopify_product_id;
ALTER TABLE public.client_diamond_presets DROP COLUMN IF EXISTS shopify_variant_id;
ALTER TABLE public.client_diamond_presets DROP COLUMN IF EXISTS shopify_sync_status;