-- Ring OS revenue: accurate, per-currency, per-client
-- 1) Re-tag Ring OS orders the webhook stored as 'ring-builder'.
UPDATE public.orders
   SET order_source = 'jewlx-widget'
 WHERE order_source = 'ring-builder'
   AND configuration->>'_source' = 'JewelX Ring Builder';

-- 2) Internal / test accounts flag (additive column + backfill).
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS exclude_from_admin_revenue boolean NOT NULL DEFAULT false;

UPDATE public.clients
   SET exclude_from_admin_revenue = true
 WHERE lower(email) IN (
   'creatives@wavesmvmnt.com',
   'gsk@crmmvmnt.com',
   'faisal914awan@gmail.com',
   'vkonlinee@gmail.com'
 );

-- 3) Price of the Ring OS line item(s) of one order.
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