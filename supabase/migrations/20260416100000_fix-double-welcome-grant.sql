
-- ============================================================
-- Fix: Double welcome grant + Monthly free credits for ALL clients
-- ============================================================
-- Problem: New clients were getting $5.00 (10,000 credits) instead of $2.50 (5,000 credits)
-- Root cause #1: trg_grant_new_client_credits trigger added $2.50 to client_wallets (purchased)
-- Root cause #2: ensure_free_credits() added another $2.50 to client_free_credits (free)
--
-- New behavior:
-- • Free credits (5,000) are issued to ALL clients every month on the 1st
-- • On 1st of month: previous free credits wiped (reset to 0), fresh 5,000 granted
-- • Unused free credits do NOT carry over — they expire at month end
-- • Purchased credits are never reset — they stay in client_wallets
-- • Amount is configurable by admin via platform_ai_config.monthly_free_credits_dollars
-- ============================================================

-- 1. Add configurable monthly free credits column to platform_ai_config
ALTER TABLE public.platform_ai_config
  ADD COLUMN IF NOT EXISTS monthly_free_credits_dollars numeric NOT NULL DEFAULT 2.5;

-- 2. Drop the duplicate trigger that incorrectly added welcome bonus to purchased wallet
DROP TRIGGER IF EXISTS trg_grant_new_client_credits ON public.clients;
DROP FUNCTION IF EXISTS public.grant_new_client_credits();

-- 3. Fix ensure_free_credits:
--    Called on every WalletCard load. Handles two cases:
--    a) Client has active free credits this month → return existing row (no-op)
--    b) Client has no active free credits (new client or missed cron) → issue monthly grant now
--    expires_at is always set to end of current calendar month so the cron resets correctly.
CREATE OR REPLACE FUNCTION public.ensure_free_credits(p_client_id uuid)
RETURNS public.client_free_credits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row        public.client_free_credits;
  v_amount     numeric;
  v_expires_at timestamptz;
BEGIN
  -- Return existing active row for this month if present
  SELECT * INTO v_row
  FROM public.client_free_credits
  WHERE client_id = p_client_id
    AND expires_at > now()
  ORDER BY expires_at DESC
  LIMIT 1;

  IF v_row.id IS NOT NULL THEN
    RETURN v_row;
  END IF;

  -- No active free credits — grant monthly amount now
  -- (covers new clients joining mid-month or clients who missed the cron)
  SELECT COALESCE(monthly_free_credits_dollars, 2.5)
  INTO v_amount
  FROM public.platform_ai_config
  LIMIT 1;

  IF v_amount IS NULL THEN
    v_amount := 2.5;
  END IF;

  -- expires_at = last second of current calendar month
  v_expires_at := date_trunc('month', now()) + interval '1 month' - interval '1 second';

  INSERT INTO public.client_free_credits (client_id, credits_granted, credits_remaining, expires_at)
  VALUES (p_client_id, v_amount, v_amount, v_expires_at)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- 4. Re-enable grant_monthly_free_credits with full reset behavior:
--    Step 1 — Delete ALL free credit rows for every client (wipes unused balance)
--    Step 2 — Insert fresh rows for ALL clients (5,000 credits, expire end of month)
--    This function is called by pg_cron on the 1st of every month at 00:00 UTC
CREATE OR REPLACE FUNCTION public.grant_monthly_free_credits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_amount     numeric;
  v_granted    integer;
  v_expires_at timestamptz;
BEGIN
  -- Read configurable monthly amount
  SELECT COALESCE(monthly_free_credits_dollars, 2.5)
  INTO v_amount
  FROM public.platform_ai_config
  LIMIT 1;

  IF v_amount IS NULL THEN v_amount := 2.5; END IF;

  -- expires_at = last second of current calendar month
  v_expires_at := date_trunc('month', now()) + interval '1 month' - interval '1 second';

  -- Step 1: Full reset — delete ALL existing free credit rows for all clients
  --         Unused balance is intentionally wiped (does not carry over)
  DELETE FROM public.client_free_credits;

  -- Step 2: Issue fresh monthly grant to every client
  INSERT INTO public.client_free_credits (client_id, credits_granted, credits_remaining, expires_at)
  SELECT id, v_amount, v_amount, v_expires_at
  FROM public.clients;

  GET DIAGNOSTICS v_granted = ROW_COUNT;
  RETURN v_granted;
END;
$$;

-- 5. Schedule grant_monthly_free_credits to run on 1st of every month at 00:00 UTC
--    Safely removes existing schedule first (if any) then re-creates
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'grant-monthly-free-credits') THEN
    PERFORM cron.unschedule('grant-monthly-free-credits');
  END IF;
END
$$;

SELECT cron.schedule(
  'grant-monthly-free-credits',
  '0 0 1 * *',
  $$SELECT public.grant_monthly_free_credits()$$
);
