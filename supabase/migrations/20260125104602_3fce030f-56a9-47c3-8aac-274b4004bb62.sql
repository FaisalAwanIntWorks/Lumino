-- Fix Security Definer View issue by recreating client_branding with security_invoker
DROP VIEW IF EXISTS public.client_branding;

CREATE VIEW public.client_branding 
WITH (security_invoker = true)
AS
SELECT 
  id,
  company_name,
  logo_url,
  branding_config,
  allowed_domains,
  shopify_store_url
FROM public.clients;

-- Grant SELECT on the view to anon and authenticated roles
GRANT SELECT ON public.client_branding TO anon;
GRANT SELECT ON public.client_branding TO authenticated;