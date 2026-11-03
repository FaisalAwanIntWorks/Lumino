
-- AI Usage Logs: tracks every AI call per client
CREATE TABLE public.ai_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  feature TEXT NOT NULL, -- ring_chat, help_chat, ring_preview, grillz_preview, enquiry_preview, cost_estimate
  model TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cached BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for monthly quota lookups
CREATE INDEX idx_ai_usage_logs_client_feature_month 
  ON public.ai_usage_logs (client_id, feature, created_at);

-- AI Response Cache: caches chat responses and image configs
CREATE TABLE public.ai_response_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  response_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX idx_ai_response_cache_key ON public.ai_response_cache (cache_key);
CREATE INDEX idx_ai_response_cache_expiry ON public.ai_response_cache (expires_at);

-- RLS for ai_usage_logs
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Admins can read all
CREATE POLICY "Admins can read all ai usage logs"
  ON public.ai_usage_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'));

-- Clients can read their own
CREATE POLICY "Clients can read own ai usage logs"
  ON public.ai_usage_logs FOR SELECT
  TO authenticated
  USING (client_id = public.get_user_client_id(auth.uid()));

-- Service role inserts (edge functions use service role, no insert policy needed for authenticated)

-- RLS for ai_response_cache
ALTER TABLE public.ai_response_cache ENABLE ROW LEVEL SECURITY;

-- Only service role writes/reads cache (edge functions), no authenticated policies needed
