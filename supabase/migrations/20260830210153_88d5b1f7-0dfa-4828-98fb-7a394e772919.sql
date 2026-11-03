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
         -- Payment-failure states get a 7-day grace window past the period
         -- they already paid for. Deliberate cancellations do NOT: a cancelled
         -- account's widgets go off immediately.
         cs.status IN ('past_due','unpaid','incomplete')
         AND cs.current_period_end IS NOT NULL
         AND now() <= cs.current_period_end + interval '7 days'
       )
     FROM public.client_subscriptions cs
     WHERE cs.client_id = client_uuid
     LIMIT 1),
    TRUE
  );
$$;