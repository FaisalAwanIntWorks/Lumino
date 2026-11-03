
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS enabled_features JSONB NOT NULL DEFAULT '{"diamond_form": true, "embed_branding": true, "product_catalogue": true}'::jsonb;
