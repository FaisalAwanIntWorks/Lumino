-- Prevent any second 'topup' transaction for the same Stripe checkout session.
-- This closes a TOCTOU race where both the stripe-webhook (server-to-server)
-- and verify-credit-purchase (user-redirect) could each pass a non-atomic
-- "already credited?" check and double-credit the wallet.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wallet_tx_topup_reference
  ON public.wallet_transactions (reference_id)
  WHERE type = 'topup' AND reference_id IS NOT NULL;