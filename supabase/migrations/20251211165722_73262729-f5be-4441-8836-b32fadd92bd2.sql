-- Fix the SECURITY DEFINER view warning by explicitly setting SECURITY INVOKER
-- This ensures the view uses the querying user's permissions, not the creator's

DROP VIEW IF EXISTS public.client_branding;

CREATE VIEW public.client_branding 
WITH (security_invoker = true)
AS
SELECT 
  id,
  logo_url,
  branding_config,
  company_name
FROM public.clients;

-- Re-grant SELECT permissions
GRANT SELECT ON public.client_branding TO anon;
GRANT SELECT ON public.client_branding TO authenticated;