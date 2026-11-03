
-- ============================================================
-- Purchased credits 365-day expiry
-- ============================================================
-- New behavior:
-- • client_wallets gets a purchased_expires_at column
-- • Every time a client purchases/receives credits, purchased_expires_at
--   is refreshed to now() + 365 days (rolling window per top-up)
-- • Daily cron at 00:05 UTC zeros out wallets where purchased_expires_at < now()
-- • Free credits (client_free_credits) are unaffected — monthly reset unchanged
-- ============================================================

-- 1. Add purchased_expires_at column to client_wallets
--    NULL = no credits ever purchased yet
ALTER TABLE public.client_wallets
  ADD COLUMN IF NOT EXISTS purchased_expires_at timestamptz DEFAULT NULL;

-- 2. Update credit_wallet: refresh expiry to now() + 365 days on every top-up
--    (rolling window — new purchase extends the clock)
CREATE OR REPLACE FUNCTION public.credit_wallet(
  p_client_id    uuid,
  p_amount       numeric,
  p_type         text    DEFAULT 'credit',
  p_description  text    DEFAULT '',
  p_reference_id text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  -- Upsert wallet — refresh purchased_expires_at on every credit
  INSERT INTO public.client_wallets (client_id, balance, lifetime_credits, purchased_expires_at)
  VALUES (p_client_id, p_amount, p_amount, now() + interval '365 days')
  ON CONFLICT (client_id) DO UPDATE
  SET balance               = client_wallets.balance + p_amount,
      lifetime_credits      = client_wallets.lifetime_credits + p_amount,
      purchased_expires_at  = now() + interval '365 days';

  SELECT balance INTO v_new_balance FROM public.client_wallets WHERE client_id = p_client_id;

  -- Log transaction
  INSERT INTO public.wallet_transactions (client_id, type, amount, balance_after, description, reference_id)
  VALUES (p_client_id, p_type, p_amount, v_new_balance, p_description, p_reference_id);

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance);
END;
$$;

-- 3. New function: expire_purchased_credits
--    Runs daily — zeros out any wallet whose purchased_expires_at has passed
--    Logs an expiry transaction so the client can see what happened
CREATE OR REPLACE FUNCTION public.expire_purchased_credits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row    record;
  v_count  integer := 0;
BEGIN
  FOR v_row IN
    SELECT client_id, balance
    FROM public.client_wallets
    WHERE purchased_expires_at < now()
      AND balance > 0
  LOOP
    -- Zero out the balance
    UPDATE public.client_wallets
    SET balance              = 0,
        purchased_expires_at = NULL
    WHERE client_id = v_row.client_id;

    -- Log the expiry as a transaction so client sees it in activity feed
    INSERT INTO public.wallet_transactions (client_id, type, amount, balance_after, description)
    VALUES (v_row.client_id, 'debit', -v_row.balance, 0, 'Purchased credits expired (365-day limit)');

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- 4. Schedule expire_purchased_credits daily at 00:05 UTC
--    (5 minutes after grant_monthly_free_credits on the 1st to avoid race)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-purchased-credits') THEN
    PERFORM cron.unschedule('expire-purchased-credits');
  END IF;
END
$$;

SELECT cron.schedule(
  'expire-purchased-credits',
  '5 0 * * *',
  $$SELECT public.expire_purchased_credits()$$
);
