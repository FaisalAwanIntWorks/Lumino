-- =====================================================================
-- Admin dashboard: aggregate leads in SQL instead of fetching rows
--
-- admin-dashboard-stats used to SELECT up to 500 rows per lead table
-- (1000 for saved_designs) with no ORDER BY, then group them in JS to
-- build "Top Clients — Leads", the Lead Activity chart and the Lead
-- Status pie. Any table with more rows than the cap inside the selected
-- range returned an arbitrary subset, so those three sections silently
-- under-reported (diamond_form_leads alone is >1100 rows in the default
-- 30-day view). The KPI tile was fine because it used count: 'exact'.
--
-- This RPC does every grouping in one round-trip:
--   totals            per-table exact counts (+ combined total)
--   daily             leads per UTC day (chart)
--   per_client        leads per client, all 7 sources
--   per_client_metal  Metal IQ leads per client
--   ai_per_client     AI preview generations per client (ai_usage_logs
--                     had the same .limit(5000) problem)
--   lead_status       coalesce(follow_up_status,'new') across the 6
--                     non-booking sources
--   booking_status    appointment_bookings.status
--
-- SECURITY DEFINER + service_role-only: called exclusively from the
-- admin edge function, which already verifies the agency_admin role.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_admin_lead_aggregates(
  p_client_id uuid DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH leads AS (
    SELECT 'saved_designs'::text AS source, client_id, created_at, follow_up_status, NULL::text AS booking_status
      FROM saved_designs
    UNION ALL
    SELECT 'diamond_form_leads', client_id, created_at, follow_up_status, NULL
      FROM diamond_form_leads
    UNION ALL
    SELECT 'grill_form_leads', client_id, created_at, follow_up_status, NULL
      FROM grill_form_leads
    UNION ALL
    SELECT 'custom_enquiry_leads', client_id, created_at, follow_up_status, NULL
      FROM custom_enquiry_leads
    UNION ALL
    SELECT 'design_requests', client_id, created_at, follow_up_status, NULL
      FROM design_requests
    UNION ALL
    SELECT 'appointment_bookings', client_id, created_at, follow_up_status, status
      FROM appointment_bookings
    UNION ALL
    SELECT 'metal_buying_leads', client_id, created_at, follow_up_status, NULL
      FROM metal_buying_leads
  ),
  filtered AS (
    SELECT *
    FROM leads
    WHERE (p_client_id IS NULL OR client_id = p_client_id)
      AND (p_start IS NULL OR created_at >= p_start)
      AND (p_end IS NULL OR created_at <= p_end)
  ),
  totals AS (
    SELECT COALESCE(jsonb_object_agg(source, cnt), '{}'::jsonb) AS by_source,
           COALESCE(SUM(cnt), 0) AS all_leads
    FROM (SELECT source, COUNT(*) AS cnt FROM filtered GROUP BY source) t
  ),
  daily AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('day', day, 'count', cnt) ORDER BY day), '[]'::jsonb) AS rows
    FROM (
      SELECT (created_at AT TIME ZONE 'UTC')::date AS day, COUNT(*) AS cnt
      FROM filtered
      WHERE created_at IS NOT NULL
      GROUP BY 1
    ) d
  ),
  per_client AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('client_id', client_id, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT client_id, COUNT(*) AS cnt
      FROM filtered
      WHERE client_id IS NOT NULL
      GROUP BY client_id
    ) c
  ),
  per_client_metal AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('client_id', client_id, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT client_id, COUNT(*) AS cnt
      FROM filtered
      WHERE source = 'metal_buying_leads' AND client_id IS NOT NULL
      GROUP BY client_id
    ) m
  ),
  ai_per_client AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('client_id', client_id, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb) AS rows
    FROM (
      SELECT client_id, COUNT(*) AS cnt
      FROM ai_usage_logs
      WHERE feature IN ('ring_preview', 'grillz_preview', 'enquiry_preview')
        AND client_id IS NOT NULL
        AND (p_client_id IS NULL OR client_id = p_client_id)
        AND (p_start IS NULL OR created_at >= p_start)
        AND (p_end IS NULL OR created_at <= p_end)
      GROUP BY client_id
    ) a
  ),
  lead_status AS (
    SELECT COALESCE(jsonb_object_agg(st, cnt), '{}'::jsonb) AS counts
    FROM (
      SELECT COALESCE(follow_up_status, 'new') AS st, COUNT(*) AS cnt
      FROM filtered
      WHERE source <> 'appointment_bookings'
      GROUP BY 1
    ) s
  ),
  booking_status AS (
    SELECT COALESCE(jsonb_object_agg(st, cnt), '{}'::jsonb) AS counts
    FROM (
      SELECT COALESCE(booking_status, 'unknown') AS st, COUNT(*) AS cnt
      FROM filtered
      WHERE source = 'appointment_bookings'
      GROUP BY 1
    ) b
  )
  SELECT jsonb_build_object(
    'totals',           totals.by_source,
    'total_leads',      totals.all_leads,
    'daily',            daily.rows,
    'per_client',       per_client.rows,
    'per_client_metal', per_client_metal.rows,
    'ai_per_client',    ai_per_client.rows,
    'lead_status',      lead_status.counts,
    'booking_status',   booking_status.counts
  )
  FROM totals, daily, per_client, per_client_metal, ai_per_client, lead_status, booking_status;
$$;

REVOKE ALL ON FUNCTION public.get_admin_lead_aggregates(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_admin_lead_aggregates(uuid, timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.get_admin_lead_aggregates(uuid, timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_lead_aggregates(uuid, timestamptz, timestamptz) TO service_role;