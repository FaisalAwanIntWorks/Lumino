
DROP FUNCTION IF EXISTS public.get_client_branding(uuid);

CREATE OR REPLACE FUNCTION public.get_client_branding(client_uuid uuid)
 RETURNS TABLE(id uuid, company_name text, logo_url text, branding_config jsonb, allowed_domains text[], widget_theme text, currency text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT 
    c.id,
    c.company_name,
    c.logo_url,
    c.branding_config,
    c.allowed_domains,
    c.widget_theme,
    c.currency
  FROM public.clients c
  WHERE c.id = client_uuid;
$$;
