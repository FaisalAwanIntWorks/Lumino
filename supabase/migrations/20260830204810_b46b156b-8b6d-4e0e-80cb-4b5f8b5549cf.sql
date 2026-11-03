-- 1. Subscription-active semantics: a cancelled subscription that is still
--    inside the period the client already paid for must NOT kill their widgets.
--    (Asteri Diamonds: status 'canceled', period end in the future, widgets dead.)
CREATE OR REPLACE FUNCTION public.get_client_subscription_active(client_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT
       cs.status IN ('active','trialing','none')
       OR (
         cs.status IN ('past_due','unpaid','incomplete','canceled','cancelled')
         AND cs.current_period_end IS NOT NULL
         AND now() <= cs.current_period_end + interval '7 days'
       )
     FROM public.client_subscriptions cs
     WHERE cs.client_id = client_uuid
     LIMIT 1),
    TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.get_client_branding(client_uuid uuid)
RETURNS TABLE (
  id uuid,
  company_name text,
  logo_url text,
  branding_config jsonb,
  allowed_domains text[],
  widget_theme text,
  currency text,
  meta_pixel_id text,
  enabled_features jsonb,
  subscription_active boolean,
  google_ads_conversion_id text,
  google_ads_conversion_labels jsonb,
  gtm_container_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
    c.google_ads_conversion_id,
    COALESCE(c.google_ads_conversion_labels, '{}'::jsonb),
    c.gtm_container_id
  FROM public.clients c
  WHERE c.id = client_uuid;
$$;

-- 2. Audit trail for every change to a client's enabled modules.
CREATE TABLE IF NOT EXISTS public.client_feature_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  old_features jsonb,
  new_features jsonb,
  changed_keys text[],
  db_role text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- [bridge] ensure columns
ALTER TABLE public.client_feature_change_log
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS old_features jsonb,
  ADD COLUMN IF NOT EXISTS new_features jsonb,
  ADD COLUMN IF NOT EXISTS changed_keys text[],
  ADD COLUMN IF NOT EXISTS db_role text,
  ADD COLUMN IF NOT EXISTS changed_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();


GRANT SELECT ON public.client_feature_change_log TO authenticated;
GRANT ALL ON public.client_feature_change_log TO service_role;

ALTER TABLE public.client_feature_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read feature change log" ON public.client_feature_change_log;

CREATE POLICY "Admins can read feature change log"
  ON public.client_feature_change_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE INDEX IF NOT EXISTS idx_feature_change_log_client
  ON public.client_feature_change_log (client_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_client_feature_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed text[];
BEGIN
  IF COALESCE(OLD.enabled_features, '{}'::jsonb) IS DISTINCT FROM COALESCE(NEW.enabled_features, '{}'::jsonb) THEN
    SELECT array_agg(k) INTO changed
    FROM (
      SELECT key AS k FROM jsonb_each(COALESCE(NEW.enabled_features, '{}'::jsonb))
      WHERE COALESCE(OLD.enabled_features, '{}'::jsonb) -> key IS DISTINCT FROM value
      UNION
      SELECT key FROM jsonb_each(COALESCE(OLD.enabled_features, '{}'::jsonb))
      WHERE COALESCE(NEW.enabled_features, '{}'::jsonb) -> key IS NULL
    ) d;

    INSERT INTO public.client_feature_change_log
      (client_id, old_features, new_features, changed_keys, db_role, changed_by)
    VALUES
      (NEW.id, OLD.enabled_features, NEW.enabled_features, changed, current_user, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_client_feature_change ON public.clients;
CREATE TRIGGER trg_log_client_feature_change
  AFTER UPDATE OF enabled_features ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.log_client_feature_change();