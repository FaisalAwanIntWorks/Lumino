-- Remove unused Shopify columns from clients table
-- These are no longer needed as products are now created via catalog push

ALTER TABLE clients DROP COLUMN IF EXISTS shopify_custom_ring_variant_id;
ALTER TABLE clients DROP COLUMN IF EXISTS shopify_diamond_variant_id;
ALTER TABLE clients DROP COLUMN IF EXISTS shopify_access_token;