
-- ============================================================
-- Fix: Double welcome grant + Monthly free credits for ALL clients
-- ============================================================

ALTER TABLE public.platform_ai_config
  ADD COLUMN IF NOT EXISTS monthly_free_credits_dollars numeric NOT NULL DEFAULT 2.5;

DROP TRIGGER IF EXISTS trg_grant_new_client_credits ON public.clients;
DROP FUNCTION IF EXISTS public.grant_new_client_credits();

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
  SELECT * INTO v_row
  FROM public.client_free_credits
  WHERE client_id = p_client_id
    AND expires_at > now()
  ORDER BY expires_at DESC
  LIMIT 1;

  IF v_row.id IS NOT NULL THEN
    RETURN v_row;
  END IF;

  SELECT COALESCE(monthly_free_credits_dollars, 2.5)
  INTO v_amount
  FROM public.platform_ai_config
  LIMIT 1;

  IF v_amount IS NULL THEN
    v_amount := 2.5;
  END IF;

  v_expires_at := date_trunc('month', now()) + interval '1 month' - interval '1 second';

  INSERT INTO public.client_free_credits (client_id, dollars_granted, dollars_remaining, expires_at)
  VALUES (p_client_id, v_amount, v_amount, v_expires_at)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

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
  SELECT COALESCE(monthly_free_credits_dollars, 2.5)
  INTO v_amount
  FROM public.platform_ai_config
  LIMIT 1;

  IF v_amount IS NULL THEN v_amount := 2.5; END IF;

  v_expires_at := date_trunc('month', now()) + interval '1 month' - interval '1 second';

  DELETE FROM public.client_free_credits;

  INSERT INTO public.client_free_credits (client_id, dollars_granted, dollars_remaining, expires_at)
  SELECT id, v_amount, v_amount, v_expires_at
  FROM public.clients;

  GET DIAGNOSTICS v_granted = ROW_COUNT;
  RETURN v_granted;
END;
$$;

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

-- ============================================================
-- Purchased credits 365-day expiry
-- ============================================================

ALTER TABLE public.client_wallets
  ADD COLUMN IF NOT EXISTS purchased_expires_at timestamptz DEFAULT NULL;

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
  INSERT INTO public.client_wallets (client_id, balance, lifetime_credits, purchased_expires_at)
  VALUES (p_client_id, p_amount, p_amount, now() + interval '365 days')
  ON CONFLICT (client_id) DO UPDATE
  SET balance               = client_wallets.balance + p_amount,
      lifetime_credits      = client_wallets.lifetime_credits + p_amount,
      purchased_expires_at  = now() + interval '365 days';

  SELECT balance INTO v_new_balance FROM public.client_wallets WHERE client_id = p_client_id;

  INSERT INTO public.wallet_transactions (client_id, type, amount, balance_after, description, reference_id)
  VALUES (p_client_id, p_type, p_amount, v_new_balance, p_description, p_reference_id);

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance);
END;
$$;

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
    UPDATE public.client_wallets
    SET balance              = 0,
        purchased_expires_at = NULL
    WHERE client_id = v_row.client_id;

    INSERT INTO public.wallet_transactions (client_id, type, amount, balance_after, description)
    VALUES (v_row.client_id, 'debit', -v_row.balance, 0, 'Purchased credits expired (365-day limit)');

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

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
