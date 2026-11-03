DROP FUNCTION IF EXISTS public.get_client_branding(uuid);

CREATE OR REPLACE FUNCTION public.get_client_branding(client_uuid uuid)
RETURNS TABLE(
  id uuid,
  company_name text,
  logo_url text,
  branding_config jsonb,
  allowed_domains text[],
  widget_theme text,
  currency text,
  meta_pixel_id text,
  enabled_features jsonb
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    c.id,
    c.company_name,
    c.logo_url,
    c.branding_config,
    c.allowed_domains,
    c.widget_theme,
    c.currency,
    c.meta_pixel_id,
    c.enabled_features
  FROM public.clients c
  WHERE c.id = client_uuid;
$function$;

GRANT EXECUTE ON FUNCTION public.get_client_branding(uuid) TO anon, authenticated;