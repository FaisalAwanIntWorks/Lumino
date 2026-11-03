-- ── Payment drift: widgets only go dark on a cancelled Stripe subscription ──
--
-- Rule: a client's customer-facing widgets are turned OFF only when the Stripe
-- subscription is cancelled (terminal state). Active, trialing, scheduled to
-- cancel (cancel_at_period_end), past_due, unpaid, incomplete and paused all
-- keep the widgets live. A manual billing override still keeps widgets live.
--
-- The triggers that feed `client_access_events` now record whether the widgets
-- were live BEFORE and AFTER each billing flip so the alert function can tell
-- super admins the moment widgets are deactivated or activated.

-- 1. Single source of truth for "does this billing status allow widgets?"
CREATE OR REPLACE FUNCTION public.subscription_status_allows_widgets(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  -- Stripe spells it "canceled"; accept the British spelling defensively.
  -- incomplete_expired is Stripe's terminal state for a subscription whose
  -- first payment never went through — it is a cancellation in all but name.
  SELECT COALESCE(p_status, 'none') NOT IN ('canceled', 'cancelled', 'incomplete_expired');
$function$;

REVOKE ALL ON FUNCTION public.subscription_status_allows_widgets(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscription_status_allows_widgets(text) TO anon, authenticated, service_role;

-- 2. The gate used by the embed, the client dashboard and the alert function.
CREATE OR REPLACE FUNCTION public.get_client_subscription_active(client_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    -- Manual admin override wins until it expires.
    COALESCE(
      (SELECT c.billing_override_until IS NOT NULL AND c.billing_override_until > now()
         FROM public.clients c WHERE c.id = client_uuid),
      FALSE
    )
    OR COALESCE(
      (SELECT public.subscription_status_allows_widgets(cs.status)
         FROM public.client_subscriptions cs
        WHERE cs.client_id = client_uuid
        ORDER BY cs.updated_at DESC NULLS LAST
        LIMIT 1),
      -- No subscription row at all (legacy / manually onboarded client): live.
      TRUE
    );
$function$;

-- 3. Billing trigger: record widgets_live before/after so flips are explicit.
CREATE OR REPLACE FUNCTION public.capture_client_subscription_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_override   boolean := false;
  v_live_old   boolean;
  v_live_new   boolean;
BEGIN
  IF COALESCE(OLD.status, '') IS DISTINCT FROM COALESCE(NEW.status, '')
     OR COALESCE(OLD.cancel_at_period_end, false) IS DISTINCT FROM COALESCE(NEW.cancel_at_period_end, false) THEN

    SELECT c.billing_override_until IS NOT NULL AND c.billing_override_until > now()
      INTO v_override
      FROM public.clients c
     WHERE c.id = NEW.client_id;
    v_override := COALESCE(v_override, false);

    v_live_old := v_override OR public.subscription_status_allows_widgets(OLD.status);
    v_live_new := v_override OR public.subscription_status_allows_widgets(NEW.status);

    INSERT INTO public.client_access_events
      (client_id, event_type, severity, source, actor, before_state, after_state)
    VALUES (
      NEW.client_id, 'subscription_status_changed',
      CASE
        -- Widgets just went dark: action needed.
        WHEN v_live_old AND NOT v_live_new THEN 'critical'
        -- Still live but the client scheduled a cancellation: heads-up.
        WHEN COALESCE(NEW.cancel_at_period_end, false)
             AND NOT COALESCE(OLD.cancel_at_period_end, false) THEN 'critical'
        ELSE 'info'
      END,
      current_user, auth.uid(),
      jsonb_build_object(
        'subscription_status', OLD.status,
        'cancel_at_period_end', COALESCE(OLD.cancel_at_period_end, false),
        'plan_name', OLD.plan_name,
        'current_period_end', OLD.current_period_end,
        'widgets_live', v_live_old
      ),
      jsonb_build_object(
        'subscription_status', NEW.status,
        'cancel_at_period_end', COALESCE(NEW.cancel_at_period_end, false),
        'plan_name', NEW.plan_name,
        'current_period_end', NEW.current_period_end,
        'widgets_live', v_live_new,
        'billing_override_active', v_override
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Clients trigger: also capture manual billing-override changes, which
--    can flip widgets live/dark on their own for a cancelled subscription.
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
  v_sub_status text;
  v_sub_allows boolean;
  v_live_old boolean;
  v_live_new boolean;
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

  IF OLD.billing_override_until IS DISTINCT FROM NEW.billing_override_until THEN
    SELECT cs.status INTO v_sub_status
      FROM public.client_subscriptions cs
     WHERE cs.client_id = NEW.id
     ORDER BY cs.updated_at DESC NULLS LAST
     LIMIT 1;
    -- No subscription row means the gate treats the client as live.
    v_sub_allows := (NOT FOUND) OR public.subscription_status_allows_widgets(v_sub_status);

    v_live_old := (OLD.billing_override_until IS NOT NULL AND OLD.billing_override_until > now()) OR v_sub_allows;
    v_live_new := (NEW.billing_override_until IS NOT NULL AND NEW.billing_override_until > now()) OR v_sub_allows;

    INSERT INTO public.client_access_events
      (client_id, event_type, severity, source, actor, before_state, after_state)
    VALUES (
      NEW.id, 'billing_override_changed',
      CASE WHEN v_live_old AND NOT v_live_new THEN 'critical' ELSE 'info' END,
      current_user, auth.uid(),
      jsonb_build_object(
        'billing_override_until', OLD.billing_override_until,
        'billing_override_reason', OLD.billing_override_reason,
        'subscription_status', v_sub_status,
        'widgets_live', v_live_old
      ),
      jsonb_build_object(
        'billing_override_until', NEW.billing_override_until,
        'billing_override_reason', NEW.billing_override_reason,
        'subscription_status', v_sub_status,
        'widgets_live', v_live_new
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capture_client_access_change ON public.clients;
CREATE TRIGGER trg_capture_client_access_change
  AFTER UPDATE OF enabled_features, status, plan_id, billing_override_until ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.capture_client_access_change();

-- 5. Retire the daily auto-pause. It switched every widget module off for
--    clients 7 days past a failed payment, which contradicts the new rule
--    (past_due keeps widgets live; only a cancellation turns them off).
DO $$
BEGIN
  PERFORM cron.unschedule('daily-subscription-grace-enforcement');
EXCEPTION WHEN OTHERS THEN
  -- pg_cron absent or job never scheduled: nothing to do.
  NULL;
END $$;