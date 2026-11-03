
-- ============================================================
-- 1. Remove commission columns (no longer needed)
-- ============================================================
ALTER TABLE public.subscription_plans DROP COLUMN IF EXISTS commission_rate;
ALTER TABLE public.clients DROP COLUMN IF EXISTS custom_commission_rate;

-- ============================================================
-- 2. Add monthly_free_credits_dollars to platform_ai_config
--    (admin can change how many free credits clients get monthly)
-- ============================================================
ALTER TABLE public.platform_ai_config
  ADD COLUMN IF NOT EXISTS monthly_free_credits_dollars numeric NOT NULL DEFAULT 1.25;
-- Default 1.25 = 2500 credits/month (current behaviour was 2.5 = 5000 but
-- the 2.5 in grant_monthly_free_credits was in dollar value; adjust as needed)

-- Set existing row to 2.5 (= 5000 credits) to keep current behaviour
UPDATE public.platform_ai_config SET monthly_free_credits_dollars = 2.5;

-- ============================================================
-- 3. Update grant_monthly_free_credits() to read from config
-- ============================================================
CREATE OR REPLACE FUNCTION public.grant_monthly_free_credits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_granted integer := 0;
  v_monthly_amount numeric;
BEGIN
  -- Read the configured monthly grant amount
  SELECT COALESCE(monthly_free_credits_dollars, 2.5)
  INTO v_monthly_amount
  FROM public.platform_ai_config
  LIMIT 1;

  IF v_monthly_amount IS NULL THEN
    v_monthly_amount := 2.5;
  END IF;

  -- Clean up expired free credit rows
  DELETE FROM public.client_free_credits
  WHERE expires_at < now();

  -- Grant fresh free credits to all AI-active clients without an active grant
  INSERT INTO public.client_free_credits (client_id, credits_granted, credits_remaining)
  SELECT DISTINCT aul.client_id, v_monthly_amount, v_monthly_amount
  FROM public.ai_usage_logs aul
  WHERE NOT EXISTS (
    SELECT 1 FROM public.client_free_credits cfc
    WHERE cfc.client_id = aul.client_id
      AND cfc.expires_at > now()
  );

  GET DIAGNOSTICS v_granted = ROW_COUNT;
  RETURN v_granted;
END;
$function$;
