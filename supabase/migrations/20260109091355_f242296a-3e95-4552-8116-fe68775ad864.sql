-- Add column to store all Shopify variant IDs as a map
ALTER TABLE client_ring_catalog
ADD COLUMN IF NOT EXISTS shopify_variants_map jsonb DEFAULT '{}';

COMMENT ON COLUMN client_ring_catalog.shopify_variants_map IS 
  'Maps metal variant names to their Shopify variant GIDs, e.g., {"14K Yellow Gold": "gid://shopify/ProductVariant/123"}';