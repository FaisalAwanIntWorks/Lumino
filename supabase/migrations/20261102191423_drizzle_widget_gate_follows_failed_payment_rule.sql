-- Copied from drizzle/migrations/0060_widget_gate_follows_failed_payment_rule.sql (applied directly to the source database, missing from supabase/migrations).
-- ── The storefront gate itself now follows the failed-payment rule ────────
--
-- get_client_subscription_active is the check the embeds actually run
-- (get_client_branding -> subscription_active -> useEmbedBootstrap). Until now
-- it carried its own copy of the old rule: past_due / unpaid / incomplete were
-- still allowed for 7 days after the period end, so a failed payment left the
-- customer's storefront running for a week while the admin alerts said it was
-- dark.
--
-- It now defers to subscription_status_allows_widgets, the single rule the
-- billing triggers use: the first failed payment turns widgets off and the next
-- successful payment turns them back on, with no grace period.
--
-- Unchanged behaviour kept on purpose:
--   * no subscription row (manual / legacy account) -> widgets stay live;
--   * an unexpired manual billing override wins over the Stripe status. That
--     used to be only true in the alert triggers; the embeds honoured it here
--     too, so the override is checked explicitly.
-- The subscription row is picked deterministically (most recently updated) so
-- an account with more than one row cannot flip the answer at random.

CREATE OR REPLACE FUNCTION public.get_client_subscription_active(client_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    -- A manual billing override keeps widgets live whatever the Stripe status.
    WHEN EXISTS (
      SELECT 1
      FROM public.clients c
      WHERE c.id = client_uuid
        AND c.billing_override_until IS NOT NULL
        AND c.billing_override_until > now()
    ) THEN TRUE
    ELSE COALESCE(
      (SELECT public.subscription_status_allows_widgets(cs.status)
       FROM public.client_subscriptions cs
       WHERE cs.client_id = client_uuid
       ORDER BY cs.updated_at DESC NULLS LAST
       LIMIT 1),
      -- No subscription row means the gate treats the client as live.
      TRUE
    )
  END;
$function$;