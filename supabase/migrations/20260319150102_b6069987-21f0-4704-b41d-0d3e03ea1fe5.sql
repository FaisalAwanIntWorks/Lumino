
-- Table: client_wallets
CREATE TABLE public.client_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  balance numeric(10,4) NOT NULL DEFAULT 0,
  lifetime_credits numeric(10,4) NOT NULL DEFAULT 0,
  lifetime_debits numeric(10,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

-- Table: wallet_transactions
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  type text NOT NULL,
  amount numeric(10,4) NOT NULL,
  balance_after numeric(10,4) NOT NULL,
  description text NOT NULL DEFAULT '',
  reference_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS on client_wallets
ALTER TABLE public.client_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all wallets"
  ON public.client_wallets FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Clients can read own wallet"
  ON public.client_wallets FOR SELECT
  TO authenticated
  USING (client_id = public.get_user_client_id(auth.uid()));

-- RLS on wallet_transactions
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read all transactions"
  ON public.wallet_transactions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Clients can read own transactions"
  ON public.wallet_transactions FOR SELECT
  TO authenticated
  USING (client_id = public.get_user_client_id(auth.uid()));

-- Updated_at trigger for client_wallets
CREATE TRIGGER handle_client_wallets_updated_at
  BEFORE UPDATE ON public.client_wallets
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Index for wallet_transactions lookups
CREATE INDEX idx_wallet_transactions_client_id ON public.wallet_transactions(client_id);
CREATE INDEX idx_wallet_transactions_reference_id ON public.wallet_transactions(reference_id);
CREATE INDEX idx_wallet_transactions_created_at ON public.wallet_transactions(created_at);

-- Function: debit_wallet (atomic balance check + deduction)
CREATE OR REPLACE FUNCTION public.debit_wallet(
  p_client_id uuid,
  p_amount numeric,
  p_description text DEFAULT '',
  p_reference_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current_balance numeric;
  v_new_balance numeric;
BEGIN
  -- Lock the wallet row for update
  SELECT balance INTO v_current_balance
  FROM public.client_wallets
  WHERE client_id = p_client_id
  FOR UPDATE;

  -- No wallet found — create one with 0 balance (will fail the check)
  IF v_current_balance IS NULL THEN
    INSERT INTO public.client_wallets (client_id, balance)
    VALUES (p_client_id, 0)
    ON CONFLICT (client_id) DO NOTHING;
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'balance', 0);
  END IF;

  -- Check sufficient balance
  IF v_current_balance < p_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'balance', v_current_balance);
  END IF;

  v_new_balance := v_current_balance - p_amount;

  -- Deduct
  UPDATE public.client_wallets
  SET balance = v_new_balance, lifetime_debits = lifetime_debits + p_amount
  WHERE client_id = p_client_id;

  -- Log transaction
  INSERT INTO public.wallet_transactions (client_id, type, amount, balance_after, description, reference_id, metadata)
  VALUES (p_client_id, 'debit', -p_amount, v_new_balance, p_description, p_reference_id, p_metadata);

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance);
END;
$$;

-- Function: credit_wallet
CREATE OR REPLACE FUNCTION public.credit_wallet(
  p_client_id uuid,
  p_amount numeric,
  p_type text DEFAULT 'credit',
  p_description text DEFAULT '',
  p_reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  -- Upsert wallet
  INSERT INTO public.client_wallets (client_id, balance, lifetime_credits)
  VALUES (p_client_id, p_amount, p_amount)
  ON CONFLICT (client_id) DO UPDATE
  SET balance = client_wallets.balance + p_amount,
      lifetime_credits = client_wallets.lifetime_credits + p_amount;

  SELECT balance INTO v_new_balance FROM public.client_wallets WHERE client_id = p_client_id;

  -- Log transaction
  INSERT INTO public.wallet_transactions (client_id, type, amount, balance_after, description, reference_id)
  VALUES (p_client_id, p_type, p_amount, v_new_balance, p_description, p_reference_id);

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance);
END;
$$;
