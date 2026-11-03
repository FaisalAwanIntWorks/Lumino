
-- 1. Create client_free_credits table
CREATE TABLE public.client_free_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  credits_granted numeric NOT NULL DEFAULT 2.5,
  credits_remaining numeric NOT NULL DEFAULT 2.5,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_free_credits_client ON public.client_free_credits(client_id, expires_at DESC);

ALTER TABLE public.client_free_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own free credits"
ON public.client_free_credits
FOR SELECT
TO authenticated
USING (
  client_id = public.get_user_client_id(auth.uid())
  OR public.has_role(auth.uid(), 'agency_admin')
);

-- 2. Function to ensure a client has active free credits
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

  RETURN v_row;
END;
$$;

-- 3. Update debit_wallet to consume free credits first
CREATE OR REPLACE FUNCTION public.debit_wallet(p_client_id uuid, p_amount numeric, p_description text DEFAULT ''::text, p_reference_id text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_remaining_cost numeric;
  v_free_id uuid;
  v_free_remaining numeric;
  v_free_deduct numeric;
  v_current_balance numeric;
  v_new_balance numeric;
BEGIN
  v_remaining_cost := p_amount;

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
    v_remaining_cost := v_remaining_cost - v_free_deduct;
  END LOOP;

  IF v_remaining_cost <= 0 THEN
    SELECT balance INTO v_current_balance
    FROM public.client_wallets
    WHERE client_id = p_client_id;
    v_current_balance := COALESCE(v_current_balance, 0);

    INSERT INTO public.wallet_transactions (client_id, type, amount, balance_after, description, reference_id, metadata)
    VALUES (p_client_id, 'debit', -p_amount, v_current_balance, p_description || ' (free credits)', p_reference_id, p_metadata);

    RETURN jsonb_build_object('success', true, 'balance', v_current_balance);
  END IF;

  SELECT balance INTO v_current_balance
  FROM public.client_wallets
  WHERE client_id = p_client_id
  FOR UPDATE;

  IF v_current_balance IS NULL THEN
    INSERT INTO public.client_wallets (client_id, balance)
    VALUES (p_client_id, 0)
    ON CONFLICT (client_id) DO NOTHING;
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'balance', 0);
  END IF;

  IF v_current_balance < v_remaining_cost THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'balance', v_current_balance);
  END IF;

  v_new_balance := v_current_balance - v_remaining_cost;

  UPDATE public.client_wallets
  SET balance = v_new_balance, lifetime_debits = lifetime_debits + v_remaining_cost
  WHERE client_id = p_client_id;

  INSERT INTO public.wallet_transactions (client_id, type, amount, balance_after, description, reference_id, metadata)
  VALUES (p_client_id, 'debit', -p_amount, v_new_balance, p_description, p_reference_id, p_metadata);

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance);
END;
$$;
