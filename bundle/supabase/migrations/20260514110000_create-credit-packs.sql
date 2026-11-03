-- Credit packs table: single source of truth for Stripe price IDs and pack config.
-- Replaces hardcoded CREDIT_PACKS constant in purchase-credits edge function and
-- frontend credit-utils.ts so packs can be updated without a code deploy.

CREATE TABLE IF NOT EXISTS public.credit_packs (
  id              serial        PRIMARY KEY,
  pack_key        text          NOT NULL UNIQUE,   -- e.g. 'credits_25'
  amount_usd      numeric       NOT NULL,           -- charged to Stripe (25, 50, 100)
  bonus_usd       numeric       NOT NULL DEFAULT 0, -- extra credited to wallet beyond Stripe charge
  credits         integer       NOT NULL,           -- total display credits (amount+bonus)/CREDIT_RATE
  bonus_credits   integer       NOT NULL DEFAULT 0, -- bonus_usd / CREDIT_RATE
  label           text          NOT NULL,           -- display string e.g. '50,000'
  stripe_price_id text          NOT NULL,
  popular         boolean       NOT NULL DEFAULT false,
  active          boolean       NOT NULL DEFAULT true,
  sort_order      integer       NOT NULL DEFAULT 0,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);

INSERT INTO public.credit_packs
  (pack_key, amount_usd, bonus_usd, credits, bonus_credits, label, stripe_price_id, popular, sort_order)
VALUES
  ('credits_25',  25,   0,  50000,      0, '50,000',  'price_1TCi5WELyIQnr0qG6ap9IyNp', false, 1),
  ('credits_50',  50,   5, 110000,  10000, '110,000', 'price_1TCi5qELyIQnr0qG2auI4rUo', true,  2),
  ('credits_100', 100, 20, 240000,  40000, '240,000', 'price_1TCi6HELyIQnr0qGT7d2wO7n', false, 3)
ON CONFLICT (pack_key) DO NOTHING;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.trg_credit_packs_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS set_credit_packs_updated_at ON public.credit_packs;
CREATE TRIGGER set_credit_packs_updated_at
  BEFORE UPDATE ON public.credit_packs
  FOR EACH ROW EXECUTE FUNCTION public.trg_credit_packs_updated_at();

-- RLS
ALTER TABLE public.credit_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated can read active credit packs"
  ON public.credit_packs FOR SELECT
  TO authenticated
  USING (active = true);

CREATE POLICY "agency_admin can manage credit packs"
  ON public.credit_packs FOR ALL
  TO authenticated
  USING  (public.has_role(auth.uid(), 'agency_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin'::app_role));

GRANT SELECT ON public.credit_packs TO authenticated;
