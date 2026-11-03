-- =====================================================================
-- Admin "Revenue & Usage" page: accuracy fixes for both RPCs.
--
-- Usage Products tab (admin_get_usage_overview)
--   1. "Cost" counted EVERY negative wallet row. Expired purchased
--      credits (365-day sweep), Stripe refund claw-backs and the admin
--      "reset to zero" / "pause wallet" rows all landed in Cost and
--      pulled Profit down. Cost is now AI-usage debits only, split by
--      product (chat / image / estimate) and by free-credit portion.
--      Non-usage debits are returned separately (other_debit_dollars).
--   2. Refund claw-backs now REDUCE revenue instead of inflating cost.
--   3. Admin-granted credits (type 'credit') are reported on their own
--      (admin_credit_dollars) so they can be told apart from paid money.
--   4. Chats / Images / Estimates were read from ai_usage_logs only, but
--      that table is archived into ai_usage_monthly_summary after 90
--      days. Ranges older than that showed 0 usage next to real cost.
--      The counts now union the monthly summary for archived months.
--   5. Internal / test accounts (clients.exclude_from_admin_revenue)
--      are left out by default, matching the admin dashboard revenue.
--
-- Subscription Products tab (admin_get_subscription_overview)
--   6. "Est. Lifetime Rev." was clipped to the page date range and kept
--      accruing for trialing / canceled / none rows. It is now a true
--      lifetime estimate: billing periods from the end of any trial to
--      now (or to the cancel date), for statuses that actually billed.
--      p_start / p_end are kept for call compatibility but unused.
--
-- The RETURNS shape changes, so the old functions are dropped first.
-- Nothing else on the platform calls these two functions.
-- =====================================================================

DROP FUNCTION IF EXISTS public.admin_get_usage_overview(timestamptz, timestamptz, boolean);

CREATE FUNCTION public.admin_get_usage_overview(
  p_start            timestamptz DEFAULT (now() - interval '90 days'),
  p_end              timestamptz DEFAULT now(),
  p_resold_only      boolean     DEFAULT false,
  p_include_internal boolean     DEFAULT false
)
RETURNS TABLE (
  client_id                uuid,
  company_name             text,
  plan_name                text,
  is_internal              boolean,
  wallet_balance           numeric,
  free_credits_remaining   numeric,
  purchased_expires_at     timestamptz,
  revenue_dollars          numeric,
  paid_dollars             numeric,
  admin_credit_dollars     numeric,
  refund_dollars           numeric,
  cost_dollars             numeric,
  chat_cost_dollars        numeric,
  image_cost_dollars       numeric,
  estimate_cost_dollars    numeric,
  free_credit_cost_dollars numeric,
  other_debit_dollars      numeric,
  chat_count               bigint,
  image_count              bigint,
  estimate_count          bigint,
  profit_dollars           numeric,
  margin_pct               numeric
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
  WITH tx AS (
    -- Every wallet row in range, classified once.
    SELECT
      wt.client_id,
      wt.type,
      wt.amount,
      CASE
        WHEN wt.metadata->>'type' = 'refund_clawback'
          OR wt.description ILIKE 'Refund clawback%'                               THEN 'refund'
        WHEN wt.amount > 0 AND wt.type IN ('topup', 'auto_recharge')               THEN 'paid'
        WHEN wt.amount > 0                                                          THEN 'granted'
        WHEN wt.type = 'debit'
         AND COALESCE(wt.metadata->>'feature', split_part(wt.description, ' ', 1))
             IN ('ring_chat', 'help_chat')                                          THEN 'chat'
        WHEN wt.type = 'debit'
         AND COALESCE(wt.metadata->>'feature', split_part(wt.description, ' ', 1))
             IN ('ring_preview', 'grillz_preview', 'enquiry_preview')               THEN 'image'
        WHEN wt.type = 'debit'
         AND COALESCE(wt.metadata->>'feature', split_part(wt.description, ' ', 1))
             = 'cost_estimate'                                                      THEN 'estimate'
        ELSE 'other'                                                                -- expiry sweep, admin reset/pause, unknown
      END AS bucket,
      (wt.description ILIKE '% (free credits)') AS is_free
    FROM wallet_transactions wt
    WHERE wt.created_at BETWEEN p_start AND p_end
  ),
  money AS (
    SELECT
      t.client_id,
      COALESCE(SUM(t.amount)      FILTER (WHERE t.bucket = 'paid'),     0)::numeric AS paid_dollars,
      COALESCE(SUM(t.amount)      FILTER (WHERE t.bucket = 'granted'),  0)::numeric AS admin_credit_dollars,
      COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.bucket = 'refund'),   0)::numeric AS refund_dollars,
      COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.bucket = 'chat'),     0)::numeric AS chat_cost,
      COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.bucket = 'image'),    0)::numeric AS image_cost,
      COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.bucket = 'estimate'), 0)::numeric AS estimate_cost,
      COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.bucket IN ('chat','image','estimate') AND t.is_free), 0)::numeric AS free_cost,
      COALESCE(SUM(ABS(t.amount)) FILTER (WHERE t.bucket = 'other' AND t.amount < 0), 0)::numeric AS other_debits
    FROM tx t
    GROUP BY t.client_id
  ),
  usage_rows AS (
    -- Live logs (last ~90 days) ...
    SELECT l.client_id, l.feature, COUNT(*)::bigint AS n
    FROM ai_usage_logs l
    WHERE l.created_at BETWEEN p_start AND p_end
    GROUP BY l.client_id, l.feature
    UNION ALL
    -- ... plus archived months. Month granularity: a month that straddles
    -- the range edge is counted whole.
    SELECT s.client_id, s.feature, s.total_requests::bigint
    FROM ai_usage_monthly_summary s
    WHERE s.month >= date_trunc('month', p_start)::date
      AND s.month <= p_end::date
  ),
  usage AS (
    SELECT
      u.client_id,
      COALESCE(SUM(u.n) FILTER (WHERE u.feature IN ('ring_chat','help_chat')), 0)::bigint                                AS chat_count,
      COALESCE(SUM(u.n) FILTER (WHERE u.feature IN ('ring_preview','grillz_preview','enquiry_preview')), 0)::bigint      AS image_count,
      COALESCE(SUM(u.n) FILTER (WHERE u.feature NOT IN ('ring_chat','help_chat','ring_preview','grillz_preview','enquiry_preview')), 0)::bigint AS estimate_count
    FROM usage_rows u
    GROUP BY u.client_id
  ),
  free_left AS (
    SELECT fc.client_id,
           COALESCE(SUM(fc.dollars_remaining), 0)::numeric AS free_remaining
    FROM client_free_credits fc
    WHERE fc.expires_at > now()
    GROUP BY fc.client_id
  ),
  calc AS (
    SELECT
      c.id                                                    AS client_id,
      c.company_name                                          AS company_name,
      COALESCE(sp.name, cs.plan_name, '—')                    AS plan_name,
      COALESCE(c.exclude_from_admin_revenue, false)           AS is_internal,
      COALESCE(cw.balance, 0)::numeric                        AS wallet_balance,
      COALESCE(fl.free_remaining, 0)::numeric                 AS free_credits_remaining,
      cw.purchased_expires_at                                 AS purchased_expires_at,
      -- Revenue = paid top-ups (+ admin-granted credits unless resold-only) − refunds
      (COALESCE(m.paid_dollars, 0)
         + CASE WHEN p_resold_only THEN 0 ELSE COALESCE(m.admin_credit_dollars, 0) END
         - COALESCE(m.refund_dollars, 0))::numeric            AS revenue_dollars,
      COALESCE(m.paid_dollars, 0)::numeric                    AS paid_dollars,
      COALESCE(m.admin_credit_dollars, 0)::numeric            AS admin_credit_dollars,
      COALESCE(m.refund_dollars, 0)::numeric                  AS refund_dollars,
      (COALESCE(m.chat_cost, 0) + COALESCE(m.image_cost, 0) + COALESCE(m.estimate_cost, 0))::numeric AS cost_dollars,
      COALESCE(m.chat_cost, 0)::numeric                       AS chat_cost_dollars,
      COALESCE(m.image_cost, 0)::numeric                      AS image_cost_dollars,
      COALESCE(m.estimate_cost, 0)::numeric                   AS estimate_cost_dollars,
      COALESCE(m.free_cost, 0)::numeric                       AS free_credit_cost_dollars,
      COALESCE(m.other_debits, 0)::numeric                    AS other_debit_dollars,
      COALESCE(u.chat_count, 0)::bigint                       AS chat_count,
      COALESCE(u.image_count, 0)::bigint                      AS image_count,
      COALESCE(u.estimate_count, 0)::bigint                   AS estimate_count
    FROM clients c
    LEFT JOIN client_wallets cw        ON cw.client_id = c.id
    LEFT JOIN client_subscriptions cs  ON cs.client_id = c.id
    LEFT JOIN subscription_plans sp    ON sp.id = COALESCE(cs.plan_id, c.plan_id)
    LEFT JOIN money m                  ON m.client_id = c.id
    LEFT JOIN usage u                  ON u.client_id = c.id
    LEFT JOIN free_left fl             ON fl.client_id = c.id
    WHERE p_include_internal OR NOT COALESCE(c.exclude_from_admin_revenue, false)
  )
  SELECT
    k.client_id, k.company_name, k.plan_name, k.is_internal,
    k.wallet_balance, k.free_credits_remaining, k.purchased_expires_at,
    k.revenue_dollars, k.paid_dollars, k.admin_credit_dollars, k.refund_dollars,
    k.cost_dollars, k.chat_cost_dollars, k.image_cost_dollars, k.estimate_cost_dollars,
    k.free_credit_cost_dollars, k.other_debit_dollars,
    k.chat_count, k.image_count, k.estimate_count,
    (k.revenue_dollars - k.cost_dollars)::numeric                                   AS profit_dollars,
    CASE WHEN k.revenue_dollars = 0 THEN NULL
         ELSE ROUND(((k.revenue_dollars - k.cost_dollars) / k.revenue_dollars * 100)::numeric, 2)
    END                                                                             AS margin_pct
  FROM calc k
  ORDER BY k.revenue_dollars DESC, k.company_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_usage_overview(timestamptz, timestamptz, boolean, boolean) TO authenticated;


-- ---------------------------------------------------------------------
-- Subscription overview
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_get_subscription_overview(timestamptz, timestamptz);

CREATE FUNCTION public.admin_get_subscription_overview(
  p_start            timestamptz DEFAULT NULL,   -- unused, kept for callers
  p_end              timestamptz DEFAULT NULL,   -- unused, kept for callers
  p_include_internal boolean     DEFAULT false
)
RETURNS TABLE (
  client_id            uuid,
  company_name         text,
  plan_name            text,
  is_internal          boolean,
  plan_price_monthly   numeric,
  status               text,
  current_period_end   timestamptz,
  trial_end            timestamptz,
  cancel_at_period_end boolean,
  started_at           timestamptz,
  paid_since           timestamptz,
  billed_periods       integer,
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
  WITH base AS (
    SELECT
      c.id                                              AS client_id,
      c.company_name,
      COALESCE(sp.name, cs.plan_name, '—')              AS plan_name,
      COALESCE(c.exclude_from_admin_revenue, false)     AS is_internal,
      COALESCE(sp.price_monthly, 0)::numeric            AS plan_price_monthly,
      COALESCE(cs.status, 'none')                       AS status,
      cs.current_period_end,
      cs.trial_end,
      COALESCE(cs.cancel_at_period_end, false)          AS cancel_at_period_end,
      cs.created_at                                     AS started_at,
      -- Billing starts when the trial ends (if there was one).
      CASE WHEN cs.trial_end IS NOT NULL AND cs.trial_end > cs.created_at
           THEN cs.trial_end ELSE cs.created_at END     AS paid_since,
      -- Billing stops at cancellation (updated_at is bumped when the webhook cancels).
      CASE WHEN COALESCE(cs.status, 'none') IN ('canceled', 'cancelled')
           THEN LEAST(cs.updated_at, now()) ELSE now() END AS paid_until,
      sp.price_monthly                                  AS raw_price
    FROM clients c
    LEFT JOIN client_subscriptions cs ON cs.client_id = c.id
    LEFT JOIN subscription_plans sp   ON sp.id = COALESCE(cs.plan_id, c.plan_id)
    WHERE p_include_internal OR NOT COALESCE(c.exclude_from_admin_revenue, false)
  ),
  calc AS (
    SELECT
      b.*,
      CASE
        WHEN b.status IN ('active', 'past_due', 'canceled', 'cancelled')
         AND b.raw_price IS NOT NULL
         AND b.paid_since IS NOT NULL
         AND b.paid_until > b.paid_since
        THEN CEIL(EXTRACT(EPOCH FROM (b.paid_until - b.paid_since)) / (60*60*24*30))::integer
        ELSE 0
      END AS billed_periods
    FROM base b
  )
  SELECT
    k.client_id, k.company_name, k.plan_name, k.is_internal,
    k.plan_price_monthly, k.status, k.current_period_end, k.trial_end,
    k.cancel_at_period_end, k.started_at, k.paid_since, k.billed_periods,
    CASE WHEN k.status = 'active' THEN k.plan_price_monthly ELSE 0 END::numeric AS mrr,
    ROUND((k.plan_price_monthly * k.billed_periods)::numeric, 2)                 AS lifetime_revenue
  FROM calc k
  ORDER BY (CASE WHEN k.status = 'active' THEN k.plan_price_monthly ELSE 0 END) DESC, k.company_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_subscription_overview(timestamptz, timestamptz, boolean) TO authenticated;