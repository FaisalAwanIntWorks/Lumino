CREATE OR REPLACE FUNCTION public.get_widget_view_stats(
  p_client_id uuid,
  p_start_date timestamptz DEFAULT NULL,
  p_end_date timestamptz DEFAULT NULL
)
RETURNS TABLE(source text, total_count bigint, unique_sessions bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT 
    (metadata->>'source')::text as source,
    COUNT(*) as total_count,
    COUNT(DISTINCT metadata->>'session_id') as unique_sessions
  FROM analytics_events
  WHERE client_id = p_client_id
    AND event_type = 'widget_view'
    AND (p_start_date IS NULL OR created_at >= p_start_date)
    AND (p_end_date IS NULL OR created_at <= p_end_date)
  GROUP BY metadata->>'source';
$$;