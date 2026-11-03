
-- Issue #6 Fix: lifetime_credits / lifetime_debits exclude free-credit flows
-- Add lifetime_free_credits and lifetime_free_debits to client_wallets so that
-- WalletCard "earned / used" shows the full picture (purchased + free).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add new columns
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.client_wallets
  ADD COLUMN IF NOT EXISTS lifetime_free_credits numeric(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_free_debits  numeric(10,4) NOT NULL DEFAULT 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Backfill lifetime_free_debits from existing wallet_transactions
--    Free-credit rows have descriptions ending in "(free credits)".
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.client_wallets cw
SET lifetime_free_debits = COALESCE((
  SELECT SUM(ABS(wt.amount))
  FROM public.wallet_transactions wt
  WHERE wt.client_id = cw.client_id
    AND wt.type = 'debit'
    AND wt.description LIKE '%(free credits)'
), 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Backfill lifetime_free_credits from existing client_free_credits grants
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.client_wallets cw
SET lifetime_free_credits = COALESCE((
  SELECT SUM(cfc.credits_granted)
  FROM public.client_free_credits cfc
  WHERE cfc.client_id = cw.client_id
), 0);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Update ensure_free_credits — increment lifetime_free_credits on new grant
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_free_credits(p_client_id uuid)
RETURNS public.client_free_credits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.client_free_credits;
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

  INSERT INTO public.client_free_credits (client_id, credits_granted, credits_remaining)
  VALUES (p_client_id, 2.5, 2.5)
  RETURNING * INTO v_row;

  -- Track the free grant in lifetime stats
  INSERT INTO public.client_wallets (client_id, balance, lifetime_free_credits)
  VALUES (p_client_id, 0, 2.5)
  ON CONFLICT (client_id) DO UPDATE
  SET lifetime_free_credits = client_wallets.lifetime_free_credits + 2.5;

  RETURN v_row;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Update grant_monthly_free_credits — increment lifetime_free_credits on grant
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.grant_monthly_free_credits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_granted integer := 0;
BEGIN
  -- Clean up expired free credit rows
  DELETE FROM public.client_free_credits
  WHERE expires_at < now();

  -- Grant fresh free credits to all clients who use AI and don't have an active grant,
  -- then bump lifetime_free_credits on their wallet in one CTE pass.
  WITH inserted AS (
    INSERT INTO public.client_free_credits (client_id, credits_granted, credits_remaining)
    SELECT DISTINCT aul.client_id, 2.5, 2.5
    FROM public.ai_usage_logs aul
    WHERE NOT EXISTS (
      SELECT 1 FROM public.client_free_credits cfc
      WHERE cfc.client_id = aul.client_id
        AND cfc.expires_at > now()
    )
    RETURNING client_id, credits_granted
  )
  UPDATE public.client_wallets cw
  SET lifetime_free_credits = cw.lifetime_free_credits + ins.credits_granted
  FROM inserted ins
  WHERE cw.client_id = ins.client_id;

  GET DIAGNOSTICS v_granted = ROW_COUNT;
  RETURN v_granted;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Update debit_wallet — increment lifetime_free_debits when free credits used
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.debit_wallet(
  p_client_id uuid,
  p_amount numeric,
  p_description text DEFAULT ''::text,
  p_reference_id text DEFAULT NULL::text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining_cost   numeric;
  v_total_free_used  numeric := 0;
  v_free_id          uuid;
  v_free_remaining   numeric;
  v_free_deduct      numeric;
  v_current_balance  numeric;
  v_new_balance      numeric;
BEGIN
  v_remaining_cost := p_amount;

  -- Consume free credits first (oldest-expiry first)
  FOR v_free_id, v_free_remaining IN
    SELECT id, credits_remaining
    FROM public.client_free_credits
    WHERE client_id = p_client_id
      AND expires_at > now()
      AND credits_remaining > 0
    ORDER BY expires_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining_cost <= 0;
    v_free_deduct := LEAST(v_free_remaining, v_remaining_cost);
    UPDATE public.client_free_credits
    SET credits_remaining = credits_remaining - v_free_deduct
    WHERE id = v_free_id;
    v_remaining_cost      := v_remaining_cost     - v_free_deduct;
    v_total_free_used     := v_total_free_used     + v_free_deduct;
  END LOOP;

  SELECT balance INTO v_current_balance
  FROM public.client_wallets
  WHERE client_id = p_client_id
  FOR UPDATE;
  v_current_balance := COALESCE(v_current_balance, 0);

  -- ── Fully covered by free credits ──────────────────────────────────────────
  IF v_remaining_cost <= 0 THEN
    -- Track free debit in lifetime stats
    UPDATE public.client_wallets
    SET lifetime_free_debits = lifetime_free_debits + v_total_free_used
    WHERE client_id = p_client_id;

    INSERT INTO public.wallet_transactions (client_id, type, amount, balance_after, description, reference_id, metadata)
    VALUES (p_client_id, 'debit', -p_amount, v_current_balance,
            p_description || ' (free credits)', p_reference_id,
            p_metadata || jsonb_build_object('free_credits_used', v_total_free_used, 'wallet_used', 0));

    RETURN jsonb_build_object('success', true, 'balance', v_current_balance, 'free_used', v_total_free_used);
  END IF;

  -- ── Need wallet funds for remainder ────────────────────────────────────────
  IF v_current_balance < v_remaining_cost THEN
    IF v_current_balance IS NULL THEN
      INSERT INTO public.client_wallets (client_id, balance)
      VALUES (p_client_id, 0)
      ON CONFLICT (client_id) DO NOTHING;
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'balance', COALESCE(v_current_balance, 0));
  END IF;

  v_new_balance := v_current_balance - v_remaining_cost;

  -- Update wallet balance + both lifetime counters in one write
  UPDATE public.client_wallets
  SET balance              = v_new_balance,
      lifetime_debits      = lifetime_debits      + v_remaining_cost,
      lifetime_free_debits = lifetime_free_debits + v_total_free_used
  WHERE client_id = p_client_id;

  -- Log split transactions for partial coverage
  IF v_total_free_used > 0 THEN
    INSERT INTO public.wallet_transactions (client_id, type, amount, balance_after, description, reference_id, metadata)
    VALUES (p_client_id, 'debit', -v_total_free_used, v_new_balance,
            p_description || ' (free credits)', p_reference_id,
            p_metadata || jsonb_build_object('free_credits_used', v_total_free_used));

    INSERT INTO public.wallet_transactions (client_id, type, amount, balance_after, description, reference_id, metadata)
    VALUES (p_client_id, 'debit', -v_remaining_cost, v_new_balance,
            p_description || ' (purchased)', p_reference_id,
            p_metadata || jsonb_build_object('wallet_used', v_remaining_cost));
  ELSE
    INSERT INTO public.wallet_transactions (client_id, type, amount, balance_after, description, reference_id, metadata)
    VALUES (p_client_id, 'debit', -p_amount, v_new_balance,
            p_description, p_reference_id, p_metadata);
  END IF;

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance, 'free_used', v_total_free_used);
END;
$function$;
