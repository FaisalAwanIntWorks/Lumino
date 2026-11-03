-- ── Widgets go dark on the FIRST failed subscription payment ──────────────
--
-- Replaces the 2026-09-08 rule (widgets only off on a cancelled subscription).
-- New rule: any unpaid Stripe state turns the client's widgets off right away,
-- and the next successful payment (invoice.paid -> status active) turns them
-- back on automatically.
--
--   active / trialing / scheduled ............ widgets ON
--   past_due  (first failed renewal) ......... widgets OFF
--   unpaid / incomplete / paused ............. widgets OFF
--   canceled / incomplete_expired ............ widgets OFF
--   no subscription row (manual / legacy) .... widgets ON (unchanged)
--   manual billing override (billing_override_until in the future) still
--   keeps widgets ON whatever the status (unchanged).
--
-- Only this helper changes: get_client_subscription_active, the billing
-- triggers and the super-admin "Widgets deactivated/activated" alerts all call
-- it, so they follow the new rule without further edits.

CREATE OR REPLACE FUNCTION public.subscription_status_allows_widgets(p_status text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(p_status, 'none') NOT IN (
    'past_due', 'unpaid', 'incomplete', 'paused',
    -- Stripe spells it "canceled"; accept the British spelling defensively.
    'canceled', 'cancelled', 'incomplete_expired'
  );
$function$;

REVOKE ALL ON FUNCTION public.subscription_status_allows_widgets(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscription_status_allows_widgets(text) TO anon, authenticated, service_role;
