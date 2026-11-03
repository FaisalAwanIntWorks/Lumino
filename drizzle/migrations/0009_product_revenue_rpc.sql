-- =====================================================================
-- Revenue distribution across products (Ring OS + CustomX forms)
--
-- 20260917120000 made Ring OS revenue accurate. This extends the same
-- rules to every product that takes money through Shopify, so the
-- dashboards can show where revenue comes from:
--
--   ring_os         order_source 'jewlx-widget'
--   ring_builder    'ring-builder'   (+ stray 'ring_builder')
--   grillz_builder  'grillz-builder' (+ stray 'grillz', 'grillz_builder')
--   custom_enquiry  'custom-inquiry' (+ stray spellings)
--   metal_iq        'metal_buying'   -- Metal IQ has no checkout; this only
--                                       surfaces rows someone entered by hand
--   other           anything else
--
-- Same rules as Ring OS: line-item price x quantity (no tax / shipping),
-- refunded + cancelled orders excluded, grouped by Shopify order currency
-- (never summed across currencies), internal accounts optionally dropped.
--
-- Form deposit carts are created fresh with a single deposit line and
-- carry `_source` on the cart, not the line, so their amount is the sum
-- of all stored line items. Ring OS keeps ringos_order_amount(), which
-- counts only the Ring OS line(s) because that cart can hold other items.
--
-- get_ringos_revenue() is left in place: already-deployed edge functions
-- still call it.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.order_items_amount(
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
       WHERE (li->>'price') ~ '^\d+(\.\d+)?$'
         AND COALESCE(li->>'quantity', '1') ~ '^\d+$'
    ),
    p_total_amount,
    0
  );
$$;

CREATE OR REPLACE FUNCTION public.get_product_revenue(
  p_client_id uuid DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_exclude_internal boolean DEFAULT false
)
RETURNS TABLE (
  product text,
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
  WITH tagged AS (
    SELECT
      o.client_id,
      c.company_name,
      -- NULL source is rendered as Ring OS everywhere in the app.
      CASE
        WHEN COALESCE(o.order_source, 'jewlx-widget') = 'jewlx-widget' THEN 'ring_os'
        WHEN o.order_source IN ('ring-builder', 'ring_builder') THEN 'ring_builder'
        WHEN o.order_source IN ('grillz-builder', 'grillz_builder', 'grillz') THEN 'grillz_builder'
        WHEN o.order_source IN ('custom-inquiry', 'custom-enquiry', 'custom_inquiry', 'custom_enquiry') THEN 'custom_enquiry'
        WHEN o.order_source IN ('metal_buying', 'metal-buying', 'metal_iq') THEN 'metal_iq'
        ELSE 'other'
      END AS product,
      COALESCE(NULLIF(upper(o.configuration->>'currency'), ''), NULLIF(upper(c.currency), ''), 'USD') AS currency,
      o.configuration,
      o.total_amount
    FROM orders o
    JOIN clients c ON c.id = o.client_id
    WHERE lower(COALESCE(o.status, 'pending')) NOT IN ('refunded', 'canceled', 'cancelled')
      AND (p_client_id IS NULL OR o.client_id = p_client_id)
      AND NOT (p_exclude_internal AND c.exclude_from_admin_revenue)
      AND (p_start IS NULL OR o.created_at >= p_start)
      AND (p_end IS NULL OR o.created_at <= p_end)
  )
  SELECT
    t.product,
    t.client_id,
    t.company_name,
    t.currency,
    COUNT(*) AS order_count,
    SUM(
      CASE WHEN t.product = 'ring_os'
           THEN public.ringos_order_amount(t.configuration, t.total_amount)
           ELSE public.order_items_amount(t.configuration, t.total_amount)
      END
    ) AS revenue
  FROM tagged t
  GROUP BY 1, 2, 3, 4
  ORDER BY revenue DESC;
$$;

REVOKE ALL ON FUNCTION public.get_product_revenue(uuid, timestamptz, timestamptz, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_product_revenue(uuid, timestamptz, timestamptz, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.get_product_revenue(uuid, timestamptz, timestamptz, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_revenue(uuid, timestamptz, timestamptz, boolean) TO service_role;