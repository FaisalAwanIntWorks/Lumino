-- ============================================================
-- Admin Revenue & Usage RPCs
-- ============================================================

-- 1. Per-client AI usage + credit revenue overview
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
    WHERE wt.type IN ('credit', 'purchase')
      AND wt.amount > 0
      AND wt.created_at BETWEEN p_start AND p_end
      AND (
        NOT p_resold_only
        OR wt.description ILIKE '%pack%'
        OR wt.description ILIKE '%purchase%'
        OR wt.description ILIKE '%top%up%'
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
      COUNT(*) FILTER (WHERE l.feature IN ('ring_chat','help_chat'))                                     AS chat_count,
      COUNT(*) FILTER (WHERE l.feature IN ('ring_preview','grillz_preview','enquiry_preview'))           AS image_count,
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

-- 2. Per-client subscription overview
CREATE OR REPLACE FUNCTION public.admin_get_subscription_overview(
  p_start timestamptz DEFAULT (now() - interval '90 days'),
  p_end   timestamptz DEFAULT now()
)
RETURNS TABLE (
  client_id            uuid,
  company_name         text,
  plan_name            text,
  plan_price_monthly   numeric,
  status               text,
  current_period_end   timestamptz,
  trial_end            timestamptz,
  cancel_at_period_end boolean,
  started_at           timestamptz,
  mrr                  numeric,
  lifetime_revenue     numeric
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
  SELECT
    c.id                                                AS client_id,
    c.company_name                                      AS company_name,
    COALESCE(sp.name, cs.plan_name, '—')                AS plan_name,
    COALESCE(sp.price_monthly, 0)::numeric              AS plan_price_monthly,
    COALESCE(cs.status, 'none')                         AS status,
    cs.current_period_end                               AS current_period_end,
    cs.trial_end                                        AS trial_end,
    COALESCE(cs.cancel_at_period_end, false)            AS cancel_at_period_end,
    cs.created_at                                       AS started_at,
    CASE WHEN cs.status = 'active' THEN COALESCE(sp.price_monthly, 0)::numeric ELSE 0 END AS mrr,
    CASE
      WHEN cs.created_at IS NULL OR sp.price_monthly IS NULL THEN 0
      ELSE ROUND(
        sp.price_monthly *
        GREATEST(1, EXTRACT(EPOCH FROM (LEAST(now(), p_end) - GREATEST(cs.created_at, p_start))) / (60*60*24*30))::numeric
      , 2)
    END                                                 AS lifetime_revenue
  FROM clients c
  LEFT JOIN client_subscriptions cs ON cs.client_id = c.id
  LEFT JOIN subscription_plans sp   ON sp.id = COALESCE(cs.plan_id, c.plan_id)
  ORDER BY (CASE WHEN cs.status = 'active' THEN COALESCE(sp.price_monthly,0) ELSE 0 END) DESC, c.company_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_usage_overview(timestamptz, timestamptz, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_subscription_overview(timestamptz, timestamptz) TO authenticated;