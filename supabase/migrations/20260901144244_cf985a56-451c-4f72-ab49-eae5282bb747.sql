ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS billing_override_until timestamptz,
  ADD COLUMN IF NOT EXISTS billing_override_reason text,
  ADD COLUMN IF NOT EXISTS billing_override_by uuid;

CREATE OR REPLACE FUNCTION public.get_client_subscription_active(client_uuid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    -- Manual admin override wins: keeps widgets live regardless of the cached
    -- Stripe status, until it expires.
    COALESCE(
      (SELECT c.billing_override_until IS NOT NULL AND c.billing_override_until > now()
         FROM public.clients c WHERE c.id = client_uuid),
      FALSE
    )
    OR COALESCE(
      (SELECT
         cs.status IN ('active','trialing','none')
         OR (
           -- Payment-failure states get a 7-day grace window past the period
           -- they already paid for. Deliberate cancellations do NOT.
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