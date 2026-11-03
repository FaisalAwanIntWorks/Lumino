-- Fix admin_get_usage_overview:
-- 1. Revenue CTE now captures 'topup' and 'auto_recharge' types (previously only 'credit'/'purchase')
-- 2. p_resold_only filter uses wt.type instead of fragile ILIKE on description text

CREATE OR REPLACE FUNCTION public.admin_get_usage_overview(
  p_start          timestamptz DEFAULT (now() - interval '90 days'),
  p_end            timestamptz DEFAULT now(),
  p_resold_only    boolean     DEFAULT false
)
RETURNS TABLE (
  client_id              uuid,
  company_name           text,
  plan_name              text,
  wallet_balance         numeric,
  free_credits_remaining numeric,
  purchased_expires_at   timestamptz,
  revenue_dollars        numeric,
  cost_dollars           numeric,
  chat_count             bigint,
  image_count            bigint,
  estimate_count         bigint,
  profit_dollars         numeric,
  margin_pct             numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'agency_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH revenue AS (
    SELECT wt.client_id,
           COALESCE(SUM(wt.amount), 0)::numeric AS revenue_dollars
    FROM wallet_transactions wt
    WHERE wt.amount > 0
      AND wt.created_at BETWEEN p_start AND p_end
      AND (
        NOT p_resold_only
        OR wt.type IN ('topup', 'auto_recharge')
      )
    GROUP BY wt.client_id
  ),
  cost AS (
    SELECT wt.client_id,
           COALESCE(SUM(ABS(wt.amount)), 0)::numeric AS cost_dollars
    FROM wallet_transactions wt
    WHERE wt.type = 'debit'
      AND wt.created_at BETWEEN p_start AND p_end
    GROUP BY wt.client_id
  ),
  usage AS (
    SELECT l.client_id,
      COUNT(*) FILTER (WHERE l.feature IN ('ring_chat','help_chat'))                                                       AS chat_count,
      COUNT(*) FILTER (WHERE l.feature IN ('ring_preview','grillz_preview','enquiry_preview'))                             AS image_count,
      COUNT(*) FILTER (WHERE l.feature NOT IN ('ring_chat','help_chat','ring_preview','grillz_preview','enquiry_preview')) AS estimate_count
    FROM ai_usage_logs l
    WHERE l.created_at BETWEEN p_start AND p_end
    GROUP BY l.client_id
  ),
  free_left AS (
    SELECT fc.client_id,
           COALESCE(SUM(fc.dollars_remaining), 0)::numeric AS free_remaining
    FROM client_free_credits fc
    WHERE fc.expires_at > now()
    GROUP BY fc.client_id
  )
  SELECT
    c.id                                              AS client_id,
    c.company_name                                    AS company_name,
    COALESCE(sp.name, cs.plan_name, '—')              AS plan_name,
    COALESCE(cw.balance, 0)::numeric                  AS wallet_balance,
    COALESCE(fl.free_remaining, 0)::numeric           AS free_credits_remaining,
    cw.purchased_expires_at                           AS purchased_expires_at,
    COALESCE(r.revenue_dollars, 0)::numeric           AS revenue_dollars,
    COALESCE(co.cost_dollars, 0)::numeric             AS cost_dollars,
    COALESCE(u.chat_count, 0)::bigint                 AS chat_count,
    COALESCE(u.image_count, 0)::bigint                AS image_count,
    COALESCE(u.estimate_count, 0)::bigint             AS estimate_count,
    (COALESCE(r.revenue_dollars,0) - COALESCE(co.cost_dollars,0))::numeric AS profit_dollars,
    CASE WHEN COALESCE(r.revenue_dollars,0) = 0 THEN NULL
         ELSE ROUND(((COALESCE(r.revenue_dollars,0) - COALESCE(co.cost_dollars,0)) / r.revenue_dollars * 100)::numeric, 2)
    END                                               AS margin_pct
  FROM clients c
  LEFT JOIN client_wallets cw          ON cw.client_id = c.id
  LEFT JOIN client_subscriptions cs    ON cs.client_id = c.id
  LEFT JOIN subscription_plans sp      ON sp.id = COALESCE(cs.plan_id, c.plan_id)
  LEFT JOIN revenue r                  ON r.client_id = c.id
  LEFT JOIN cost co                    ON co.client_id = c.id
  LEFT JOIN usage u                    ON u.client_id = c.id
  LEFT JOIN free_left fl               ON fl.client_id = c.id
  ORDER BY COALESCE(r.revenue_dollars,0) DESC, c.company_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_usage_overview(timestamptz, timestamptz, boolean) TO authenticated;

-- ============================================================
-- Credit packs table: source of truth for Stripe price IDs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.credit_packs (
  id              serial        PRIMARY KEY,
  pack_key        text          NOT NULL UNIQUE,
  amount_usd      numeric       NOT NULL,
  bonus_usd       numeric       NOT NULL DEFAULT 0,
  credits         integer       NOT NULL,
  bonus_credits   integer       NOT NULL DEFAULT 0,
  label           text          NOT NULL,
  stripe_price_id text          NOT NULL,
  popular         boolean       NOT NULL DEFAULT false,
  active          boolean       NOT NULL DEFAULT true,
  sort_order      integer       NOT NULL DEFAULT 0,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now()
);
-- [bridge] ensure columns
ALTER TABLE public.credit_packs
  ADD COLUMN IF NOT EXISTS id serial,
  ADD COLUMN IF NOT EXISTS pack_key text,
  ADD COLUMN IF NOT EXISTS amount_usd numeric,
  ADD COLUMN IF NOT EXISTS bonus_usd numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits integer,
  ADD COLUMN IF NOT EXISTS bonus_credits integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS popular boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS credit_packs_pack_key_bridge_uniq ON public.credit_packs (pack_key);


INSERT INTO public.credit_packs
  (pack_key, amount_usd, bonus_usd, credits, bonus_credits, label, stripe_price_id, popular, sort_order)
VALUES
  ('credits_25',  25,   0,  50000,      0, '50,000',  'price_1TCi5WELyIQnr0qG6ap9IyNp', false, 1),
  ('credits_50',  50,   5, 110000,  10000, '110,000', 'price_1TCi5qELyIQnr0qG2auI4rUo', true,  2),
  ('credits_100', 100, 20, 240000,  40000, '240,000', 'price_1TCi6HELyIQnr0qGT7d2wO7n', false, 3)
ON CONFLICT (pack_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.trg_credit_packs_updated_at()
RETURNS trigger LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS set_credit_packs_updated_at ON public.credit_packs;
CREATE TRIGGER set_credit_packs_updated_at
  BEFORE UPDATE ON public.credit_packs
  FOR EACH ROW EXECUTE FUNCTION public.trg_credit_packs_updated_at();

ALTER TABLE public.credit_packs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated can read active credit packs" ON public.credit_packs;

CREATE POLICY "authenticated can read active credit packs"
  ON public.credit_packs FOR SELECT
  TO authenticated
  USING (active = true);

DROP POLICY IF EXISTS "agency_admin can manage credit packs" ON public.credit_packs;

CREATE POLICY "agency_admin can manage credit packs"
  ON public.credit_packs FOR ALL
  TO authenticated
  USING  (public.has_role(auth.uid(), 'agency_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin'::app_role));

GRANT SELECT ON public.credit_packs TO authenticated;