-- Fix the existing view by dropping and recreating it
DROP VIEW IF EXISTS public.client_branding;

CREATE VIEW public.client_branding AS
SELECT 
  id,
  company_name,
  logo_url,
  branding_config,
  allowed_domains,
  shopify_store_url
FROM public.clients;

-- Grant select on the view to authenticated users
GRANT SELECT ON public.client_branding TO authenticated;
GRANT SELECT ON public.client_branding TO anon;