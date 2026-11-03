-- =====================================================================
-- Ring OS revenue: accurate, per-currency, per-client
--
-- The "RingOS Revenue" tile (client dashboard) and "Total Revenue" tile
-- (admin dashboard) were wrong for three reasons:
--
--   1. Source mismatch. The Ring OS widget tags its Shopify cart with
--      `_source = "JewelX Ring Builder"`, and shopify-order-webhook mapped
--      that to order_source = 'ring-builder' -- the value the rest of the
--      app uses for the CustomX Ring Builder *form deposit*. Every
--      dashboard reads Ring OS as 'jewlx-widget', so real Ring OS sales
--      never reached the RingOS tile and were shown as form "Deposits".
--      (The webhook mapping is fixed in the same change; this migration
--      re-tags the rows it already wrote.)
--   2. Amount. orders.total_amount is Shopify's total_price: tax, shipping
--      and any unrelated products in the same cart. Revenue here is the
--      price of the Ring OS line item(s) only (price x quantity), read
--      from the line items the webhook already stores in `configuration`.
--   3. Currency / status. Amounts in different store currencies were added
--      together as USD, and refunded / cancelled orders were still counted.
--
-- orders is not altered: everything needed is already in
-- orders.configuration. The only schema change is one additive flag on
-- clients (exclude_from_admin_revenue) for internal / test accounts.
-- =====================================================================

-- 1) Re-tag Ring OS orders that the webhook stored as 'ring-builder'.
--    Only rows that carry the Ring OS cart marker are touched; genuine
--    Ring Builder form deposits (marker "Ring-builder-jewlx") are not.
UPDATE public.orders
   SET order_source = 'jewlx-widget'
 WHERE order_source = 'ring-builder'
   AND configuration->>'_source' = 'JewelX Ring Builder';

-- 2) Internal / test accounts. Their orders are real rows but not customer
--    sales, so the PLATFORM (admin, all-clients) revenue must not include
--    them. Each of these accounts still sees its own revenue on its own
--    dashboard. Matched by email: company names are free text.
--    To flag another account later:
--      UPDATE public.clients SET exclude_from_admin_revenue = true WHERE lower(email) = lower('x@y.com');
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS exclude_from_admin_revenue boolean NOT NULL DEFAULT false;

UPDATE public.clients
   SET exclude_from_admin_revenue = true
 WHERE lower(email) IN (
   'creatives@wavesmvmnt.com',   -- WAVES MVMNT
   'gsk@crmmvmnt.com',           -- JewlX
   'faisal914awan@gmail.com',    -- fbe
   'vkonlinee@gmail.com'         -- VDK 7
 );

-- 3) Price of the Ring OS line item(s) of one order.
--    Falls back to total_amount for rows with no stored line items.
CREATE OR REPLACE FUNCTION public.ringos_order_amount(
  p_configuration jsonb,
  p_total_amount numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (
      SELECT SUM((li->>'price')::numeric * COALESCE(NULLIF(li->>'quantity', '')::numeric, 1))
        FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(p_configuration->'line_items') = 'array'
                    THEN p_configuration->'line_items'
                    ELSE '[]'::jsonb
               END
             ) AS li
       WHERE li->'properties'->>'_source' = 'JewelX Ring Builder'
         AND (li->>'price') ~ '^\d+(\.\d+)?$'
         AND COALESCE(li->>'quantity', '1') ~ '^\d+$'
    ),
    p_total_amount,
    0
  );
$$;

-- 4) Ring OS revenue grouped by client + currency.
--    Currency is the Shopify order currency, falling back to the client's
--    configured currency for rows that pre-date currency capture.
--    Refunded / cancelled orders are excluded.
--    p_exclude_internal = true drops accounts flagged
--    exclude_from_admin_revenue (used by the admin all-clients view only).
CREATE OR REPLACE FUNCTION public.get_ringos_revenue(
  p_client_id uuid DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_exclude_internal boolean DEFAULT false
)
RETURNS TABLE (
  client_id uuid,
  company_name text,
  currency text,
  order_count bigint,
  revenue numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    o.client_id,
    c.company_name,
    COALESCE(NULLIF(upper(o.configuration->>'currency'), ''), NULLIF(upper(c.currency), ''), 'USD') AS currency,
    COUNT(*) AS order_count,
    SUM(public.ringos_order_amount(o.configuration, o.total_amount)) AS revenue
  FROM orders o
  JOIN clients c ON c.id = o.client_id
  WHERE o.order_source = 'jewlx-widget'
    AND lower(COALESCE(o.status, 'pending')) NOT IN ('refunded', 'canceled', 'cancelled')
    AND (p_client_id IS NULL OR o.client_id = p_client_id)
    AND NOT (p_exclude_internal AND c.exclude_from_admin_revenue)
    AND (p_start IS NULL OR o.created_at >= p_start)
    AND (p_end IS NULL OR o.created_at <= p_end)
  GROUP BY 1, 2, 3
  ORDER BY revenue DESC;
$$;

REVOKE ALL ON FUNCTION public.get_ringos_revenue(uuid, timestamptz, timestamptz, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_ringos_revenue(uuid, timestamptz, timestamptz, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.get_ringos_revenue(uuid, timestamptz, timestamptz, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_ringos_revenue(uuid, timestamptz, timestamptz, boolean) TO service_role;
