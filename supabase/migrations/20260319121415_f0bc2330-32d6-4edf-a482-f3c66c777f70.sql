
-- Phase 4C: Database Performance Indexes + Archival

-- 1. Composite index for rate limit checks (client_id + feature + created_at DESC)
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_client_feature_created 
ON public.ai_usage_logs (client_id, feature, created_at DESC);

-- 2. Index for cache key lookups
CREATE INDEX IF NOT EXISTS idx_ai_response_cache_key 
ON public.ai_response_cache (cache_key);

-- 3. Index for cache expiry cleanup
CREATE INDEX IF NOT EXISTS idx_ai_response_cache_expires 
ON public.ai_response_cache (expires_at);

-- 4. Monthly summary table for archival
CREATE TABLE IF NOT EXISTS public.ai_usage_monthly_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  feature text NOT NULL,
  month date NOT NULL,
  total_requests integer NOT NULL DEFAULT 0,
  cached_requests integer NOT NULL DEFAULT 0,
  total_input_tokens bigint NOT NULL DEFAULT 0,
  total_output_tokens bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, feature, month)
);

-- RLS on summary table
ALTER TABLE public.ai_usage_monthly_summary ENABLE ROW LEVEL SECURITY;

-- 5. Archival function: summarizes logs older than 90 days into monthly summary, then deletes them
CREATE OR REPLACE FUNCTION public.archive_old_ai_usage_logs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cutoff_date timestamptz;
  archived_count integer;
BEGIN
  cutoff_date := now() - interval '90 days';
  
  -- Upsert monthly summaries from old logs
  INSERT INTO public.ai_usage_monthly_summary (client_id, feature, month, total_requests, cached_requests, total_input_tokens, total_output_tokens)
  SELECT 
    client_id,
    feature,
    date_trunc('month', created_at)::date AS month,
    COUNT(*)::integer AS total_requests,
    COUNT(*) FILTER (WHERE cached = true)::integer AS cached_requests,
    COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
    COALESCE(SUM(output_tokens), 0) AS total_output_tokens
  FROM public.ai_usage_logs
  WHERE created_at < cutoff_date
  GROUP BY client_id, feature, date_trunc('month', created_at)::date
  ON CONFLICT (client_id, feature, month) 
  DO UPDATE SET 
    total_requests = ai_usage_monthly_summary.total_requests + EXCLUDED.total_requests,
    cached_requests = ai_usage_monthly_summary.cached_requests + EXCLUDED.cached_requests,
    total_input_tokens = ai_usage_monthly_summary.total_input_tokens + EXCLUDED.total_input_tokens,
    total_output_tokens = ai_usage_monthly_summary.total_output_tokens + EXCLUDED.total_output_tokens;
  
  -- Delete archived logs
  DELETE FROM public.ai_usage_logs WHERE created_at < cutoff_date;
  GET DIAGNOSTICS archived_count = ROW_COUNT;
  
  RETURN archived_count;
END;
$$;
