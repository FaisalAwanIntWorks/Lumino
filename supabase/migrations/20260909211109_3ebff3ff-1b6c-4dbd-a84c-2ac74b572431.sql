ALTER TABLE public.client_auto_recharge_settings
  ADD COLUMN IF NOT EXISTS last_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_failure_reason text;

DROP INDEX IF EXISTS public.uniq_wallet_tx_topup_reference;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_tx_topup_reference
  ON public.wallet_transactions (reference_id)
  WHERE (type IN ('topup', 'auto_recharge') AND reference_id IS NOT NULL);