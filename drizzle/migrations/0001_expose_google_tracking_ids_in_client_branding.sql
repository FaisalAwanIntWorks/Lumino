-- Widgets need the client's Google Ads / GTM ids to fire the in-widget
-- conversion; these are public tag identifiers (already visible on the
-- retailer's own site), same exposure level as meta_pixel_id.
DROP FUNCTION IF EXISTS public.get_client_branding(uuid);

CREATE FUNCTION public.get_client_branding(client_uuid uuid)
RETURNS TABLE(
  id uuid, company_name text, logo_url text, branding_config jsonb,
  allowed_domains text[], widget_theme text, currency text, meta_pixel_id text,
  enabled_features jsonb, subscription_active boolean, terms_url text, privacy_url text,
  google_ads_conversion_id text, google_ads_conversion_labels jsonb, gtm_container_id text
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
    c.enabled_features,
    public.get_client_subscription_active(c.id) AS subscription_active,
    c.terms_url,
    c.privacy_url,
    c.google_ads_conversion_id,
    c.google_ads_conversion_labels,
    c.gtm_container_id
  FROM public.clients c
  WHERE c.id = client_uuid;
$function$;

GRANT EXECUTE ON FUNCTION public.get_client_branding(uuid) TO anon, authenticated, service_role;