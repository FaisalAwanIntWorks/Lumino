-- ── Client access change alerting ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.client_access_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  event_type    text NOT NULL,
  severity      text NOT NULL DEFAULT 'info',
  source        text,
  actor         uuid,
  before_state  jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state   jsonb NOT NULL DEFAULT '{}'::jsonb,
  revoked_keys  text[] NOT NULL DEFAULT '{}',
  granted_keys  text[] NOT NULL DEFAULT '{}',
  notified_at   timestamptz,
  notify_error  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- [bridge] ensure columns
ALTER TABLE public.client_access_events
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS severity text DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS actor uuid,
  ADD COLUMN IF NOT EXISTS before_state jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS after_state jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS revoked_keys text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS granted_keys text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS notify_error text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();


GRANT SELECT ON public.client_access_events TO authenticated;
GRANT ALL ON public.client_access_events TO service_role;

ALTER TABLE public.client_access_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read client access events" ON public.client_access_events;
CREATE POLICY "Admins read client access events"
  ON public.client_access_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE INDEX IF NOT EXISTS idx_client_access_events_recent
  ON public.client_access_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_access_events_client
  ON public.client_access_events (client_id, created_at DESC);

-- ── Capture: clients row (modules / status / plan) ────────────────────────
CREATE OR REPLACE FUNCTION public.capture_client_access_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb := COALESCE(OLD.enabled_features, '{}'::jsonb);
  v_new jsonb := COALESCE(NEW.enabled_features, '{}'::jsonb);
  v_revoked text[];
  v_granted text[];
  v_old_plan text;
  v_new_plan text;
BEGIN
  IF v_old IS DISTINCT FROM v_new THEN
    SELECT COALESCE(array_agg(key ORDER BY key), '{}')
      INTO v_revoked
      FROM jsonb_each(v_old)
     WHERE value = 'true'::jsonb
       AND COALESCE(v_new -> key, 'false'::jsonb) IS DISTINCT FROM 'true'::jsonb;

    SELECT COALESCE(array_agg(key ORDER BY key), '{}')
      INTO v_granted
      FROM jsonb_each(v_new)
     WHERE value = 'true'::jsonb
       AND COALESCE(v_old -> key, 'false'::jsonb) IS DISTINCT FROM 'true'::jsonb;

    IF COALESCE(array_length(v_revoked, 1), 0) > 0
       OR COALESCE(array_length(v_granted, 1), 0) > 0 THEN
      INSERT INTO public.client_access_events
        (client_id, event_type, severity, source, actor,
         before_state, after_state, revoked_keys, granted_keys)
      VALUES (
        NEW.id, 'features_changed',
        CASE WHEN COALESCE(array_length(v_revoked, 1), 0) > 0 THEN 'critical' ELSE 'info' END,
        current_user, auth.uid(),
        jsonb_build_object('enabled_features', v_old),
        jsonb_build_object('enabled_features', v_new),
        COALESCE(v_revoked, '{}'), COALESCE(v_granted, '{}')
      );
    END IF;
  END IF;

  IF COALESCE(OLD.status, '') IS DISTINCT FROM COALESCE(NEW.status, '') THEN
    INSERT INTO public.client_access_events
      (client_id, event_type, severity, source, actor, before_state, after_state)
    VALUES (
      NEW.id, 'client_status_changed',
      CASE WHEN COALESCE(NEW.status, '') IN ('active', 'none', 'crm_active') THEN 'info' ELSE 'critical' END,
      current_user, auth.uid(),
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );
  END IF;

  IF COALESCE(OLD.plan_id::text, '') IS DISTINCT FROM COALESCE(NEW.plan_id::text, '') THEN
    SELECT name INTO v_old_plan FROM public.subscription_plans WHERE id = OLD.plan_id;
    SELECT name INTO v_new_plan FROM public.subscription_plans WHERE id = NEW.plan_id;

    INSERT INTO public.client_access_events
      (client_id, event_type, severity, source, actor, before_state, after_state)
    VALUES (
      NEW.id, 'plan_changed',
      CASE WHEN NEW.plan_id IS NULL THEN 'critical' ELSE 'info' END,
      current_user, auth.uid(),
      jsonb_build_object('plan_id', OLD.plan_id, 'plan_name', v_old_plan),
      jsonb_build_object('plan_id', NEW.plan_id, 'plan_name', v_new_plan)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_client_access_change ON public.clients;
CREATE TRIGGER trg_capture_client_access_change
  AFTER UPDATE OF enabled_features, status, plan_id ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.capture_client_access_change();

-- ── Capture: billing subscription state ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.capture_client_subscription_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocking text[] := ARRAY['canceled', 'unpaid', 'incomplete_expired', 'paused'];
BEGIN
  IF COALESCE(OLD.status, '') IS DISTINCT FROM COALESCE(NEW.status, '')
     OR COALESCE(OLD.cancel_at_period_end, false) IS DISTINCT FROM COALESCE(NEW.cancel_at_period_end, false) THEN
    INSERT INTO public.client_access_events
      (client_id, event_type, severity, source, actor, before_state, after_state)
    VALUES (
      NEW.client_id, 'subscription_status_changed',
      CASE
        WHEN COALESCE(NEW.status, '') = ANY (v_blocking) THEN 'critical'
        WHEN COALESCE(NEW.cancel_at_period_end, false) THEN 'critical'
        ELSE 'info'
      END,
      current_user, auth.uid(),
      jsonb_build_object(
        'subscription_status', OLD.status,
        'cancel_at_period_end', COALESCE(OLD.cancel_at_period_end, false),
        'plan_name', OLD.plan_name,
        'current_period_end', OLD.current_period_end
      ),
      jsonb_build_object(
        'subscription_status', NEW.status,
        'cancel_at_period_end', COALESCE(NEW.cancel_at_period_end, false),
        'plan_name', NEW.plan_name,
        'current_period_end', NEW.current_period_end
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_client_subscription_change ON public.client_subscriptions;
CREATE TRIGGER trg_capture_client_subscription_change
  AFTER UPDATE OF status, cancel_at_period_end ON public.client_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.capture_client_subscription_change();

-- ── Dispatch: one HTTP call per event ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dispatch_client_access_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  SELECT value INTO v_url FROM public.cron_config WHERE key = 'supabase_url';
  SELECT value INTO v_key FROM public.cron_config WHERE key = 'service_role_key';

  IF v_url IS NULL OR v_key IS NULL OR v_url LIKE '%YOUR_PROJECT%' THEN
    RAISE WARNING 'dispatch_client_access_alert: cron_config not configured — event % not alerted', NEW.id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := v_url || '/functions/v1/alert-access-change',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object('event_id', NEW.id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dispatch_client_access_alert ON public.client_access_events;
CREATE TRIGGER trg_dispatch_client_access_alert
  AFTER INSERT ON public.client_access_events
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_client_access_alert();