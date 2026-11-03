
-- Update default value for enabled_features to include orders
ALTER TABLE public.clients
ALTER COLUMN enabled_features SET DEFAULT '{"diamond_form": true, "embed_branding": true, "product_catalogue": true, "jewlx_agent": true, "orders": true}'::jsonb;

-- Update existing clients to add orders: true if not already present
UPDATE public.clients
SET enabled_features = enabled_features || '{"orders": true}'::jsonb
WHERE NOT (enabled_features ? 'orders');
