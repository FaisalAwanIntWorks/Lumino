
-- Update default value for enabled_features to include jewlx_agent
ALTER TABLE public.clients
ALTER COLUMN enabled_features SET DEFAULT '{"diamond_form": true, "embed_branding": true, "product_catalogue": true, "jewlx_agent": true}'::jsonb;

-- Update existing clients to add jewlx_agent: true if not already present
UPDATE public.clients
SET enabled_features = enabled_features || '{"jewlx_agent": true}'::jsonb
WHERE NOT (enabled_features ? 'jewlx_agent');
