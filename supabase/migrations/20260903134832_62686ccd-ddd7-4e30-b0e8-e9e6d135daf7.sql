-- =====================================================================
-- Widget-traffic analytics fixes
--
-- Scope: ONLY the widget_view / form-funnel telemetry pipeline that feeds
-- the "Traffic Activity" chart and the "Traffic Overview" tiles.
-- Nothing else in the schema is touched.
--
-- 1. The form-funnel event types emitted by useFormAnalytics
--    (form_started / form_step_advanced / form_abandoned) were never added
--    to the analytics_event_type enum, so every one of those inserts was
--    rejected by Postgres and silently dropped by the client.
-- 2. A daily-bucket aggregate RPC so the traffic chart no longer reads
--    analytics_events straight from the browser (which returns nothing for
--    staff users — they have no SELECT policy — and is capped at 5000
--    unordered rows).
-- 3. An all-clients variant of get_widget_view_stats so the admin
--    "All Clients" traffic tiles stop scanning the raw table with no date
--    filter and no limit.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Allow the form-funnel event types
--
-- Handles both possible states of the deployed schema: event_type may be
-- the analytics_event_type enum (after 20260420085752) or still TEXT with
-- a CHECK constraint (before it).
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regtype('public.analytics_event_type') IS NOT NULL THEN
    ALTER TYPE public.analytics_event_type ADD VALUE IF NOT EXISTS 'form_started';
    ALTER TYPE public.analytics_event_type ADD VALUE IF NOT EXISTS 'form_step_advanced';
    ALTER TYPE public.analytics_event_type ADD VALUE IF NOT EXISTS 'form_abandoned';
  ELSE
    ALTER TABLE public.analytics_events
      DROP CONSTRAINT IF EXISTS analytics_events_event_type_check;
    ALTER TABLE public.analytics_events
      ADD CONSTRAINT analytics_events_event_type_check CHECK (
        event_type IN (
          'configurator_load', 'add_to_cart', 'purchase', 'page_view',
          'embed_view', 'ring_view', 'config_started', 'config_completed',
          'design_saved', 'widget_view',
          'form_started', 'form_step_advanced', 'form_abandoned'
        )
      );
  END IF;
END
$$;


-- ---------------------------------------------------------------------
-- 2. Daily widget-view buckets, aggregated in SQL.
--
-- p_client_id NULL  -> platform-wide (admin "All Clients" chart)
-- p_timezone        -> day boundaries in the store's own timezone; falls
--                      back to UTC if the name isn't a valid IANA zone
--                      (the sub-select is uncorrelated, so it runs once).
--
-- SECURITY DEFINER + service_role-only: this is called exclusively from
-- the dashboard edge functions, never from an embed with the anon key.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_widget_view_daily(
  p_client_id uuid DEFAULT NULL,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL,
  p_timezone text DEFAULT 'UTC'
)
RETURNS TABLE(day date, total_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    (created_at AT TIME ZONE COALESCE(
      (SELECT p_timezone WHERE EXISTS (
         SELECT 1 FROM pg_timezone_names WHERE name = p_timezone
       )),
      'UTC'
    ))::date AS day,
    COUNT(*) AS total_count
  FROM analytics_events
  WHERE event_type = 'widget_view'
    AND (p_client_id IS NULL OR client_id = p_client_id)
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date)
  GROUP BY 1
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.get_widget_view_daily(uuid, timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_widget_view_daily(uuid, timestamptz, timestamptz, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_widget_view_daily(uuid, timestamptz, timestamptz, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_widget_view_daily(uuid, timestamptz, timestamptz, text) TO service_role;


-- ---------------------------------------------------------------------
-- 3. Platform-wide per-source totals (admin "All Clients" tiles).
--
-- Same shape as get_widget_view_stats but with no client filter. Kept as a
-- separate, service_role-only function rather than teaching the existing
-- anon-callable one to accept NULL, so anon can't pull platform totals.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_widget_view_stats_all(
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(source text, total_count bigint, unique_sessions bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    (metadata->>'source')::text AS source,
    COUNT(*) AS total_count,
    COUNT(DISTINCT metadata->>'session_id') AS unique_sessions
  FROM analytics_events
  WHERE event_type = 'widget_view'
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date)
  GROUP BY metadata->>'source';
$$;

REVOKE ALL ON FUNCTION public.get_widget_view_stats_all(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_widget_view_stats_all(timestamptz, timestamptz) FROM anon;
REVOKE ALL ON FUNCTION public.get_widget_view_stats_all(timestamptz, timestamptz) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_widget_view_stats_all(timestamptz, timestamptz) TO service_role;