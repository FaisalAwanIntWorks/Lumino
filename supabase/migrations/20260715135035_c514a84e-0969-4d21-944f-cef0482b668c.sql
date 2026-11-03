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
  enabled_features jsonb,
  subscription_active boolean
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
    COALESCE(
      (SELECT
         cs.status IN ('active','trialing','none')
         OR (
           cs.status IN ('past_due','unpaid','incomplete')
           AND cs.current_period_end IS NOT NULL
           AND now() <= cs.current_period_end + interval '7 days'
         )
       FROM public.client_subscriptions cs
       WHERE cs.client_id = c.id
       LIMIT 1),
      TRUE
    ) AS subscription_active
  FROM public.clients c
  WHERE c.id = client_uuid;
$function$;

GRANT EXECUTE ON FUNCTION public.get_client_branding(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_client_subscription_active(client_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT
       cs.status IN ('active','trialing','none')
       OR (
         cs.status IN ('past_due','unpaid','incomplete')
         AND cs.current_period_end IS NOT NULL
         AND now() <= cs.current_period_end + interval '7 days'
       )
     FROM public.client_subscriptions cs
     WHERE cs.client_id = client_uuid
     LIMIT 1),
    TRUE
  );
$function$;

GRANT EXECUTE ON FUNCTION public.get_client_subscription_active(uuid) TO anon, authenticated;