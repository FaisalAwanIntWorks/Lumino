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
    AND created_at >= COALESCE(p_start_date, now() - interval '90 days')
    AND created_at <= COALESCE(p_end_date, now())
  GROUP BY 1
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.get_widget_view_daily(uuid, timestamptz, timestamptz, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_widget_view_daily(uuid, timestamptz, timestamptz, text) FROM anon;
REVOKE ALL ON FUNCTION public.get_widget_view_daily(uuid, timestamptz, timestamptz, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_widget_view_daily(uuid, timestamptz, timestamptz, text) TO service_role;