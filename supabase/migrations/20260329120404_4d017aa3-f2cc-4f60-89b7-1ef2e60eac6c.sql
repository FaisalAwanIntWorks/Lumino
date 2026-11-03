
-- Step 1: Add RPM columns to client_ai_quotas
ALTER TABLE public.client_ai_quotas
  ADD COLUMN IF NOT EXISTS chat_rpm integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS image_rpm integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cost_estimate_rpm integer DEFAULT NULL;

-- Step 2: Create plan_ai_defaults table
CREATE TABLE IF NOT EXISTS public.plan_ai_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  chat_quota integer NOT NULL DEFAULT 2000,
  image_quota integer NOT NULL DEFAULT 100,
  chat_rpm integer NOT NULL DEFAULT 32,
  image_rpm integer NOT NULL DEFAULT 7,
  cost_estimate_rpm integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id)
);

ALTER TABLE public.plan_ai_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage plan_ai_defaults"
  ON public.plan_ai_defaults
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'));

-- Step 3: Create platform_ai_config single-row table
CREATE TABLE IF NOT EXISTS public.platform_ai_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  global_chat_rpm integer NOT NULL DEFAULT 500,
  global_image_rpm integer NOT NULL DEFAULT 200,
  global_cost_estimate_rpm integer NOT NULL DEFAULT 300,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_ai_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage platform_ai_config"
  ON public.platform_ai_config
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'));

-- Insert default row
INSERT INTO public.platform_ai_config (global_chat_rpm, global_image_rpm, global_cost_estimate_rpm)
VALUES (500, 200, 300);

-- Step 4: Seed plan_ai_defaults from existing subscription_plans
INSERT INTO public.plan_ai_defaults (plan_id, chat_quota, image_quota, chat_rpm, image_rpm, cost_estimate_rpm)
SELECT id, 
  CASE name WHEN 'Starter' THEN 2000 WHEN 'Growth' THEN 5000 WHEN 'Enterprise' THEN 50000 ELSE 2000 END,
  CASE name WHEN 'Starter' THEN 100 WHEN 'Growth' THEN 250 WHEN 'Enterprise' THEN 1000 ELSE 100 END,
  CASE name WHEN 'Enterprise' THEN 64 ELSE 32 END,
  CASE name WHEN 'Enterprise' THEN 15 ELSE 7 END,
  10
FROM public.subscription_plans
ON CONFLICT (plan_id) DO NOTHING;

-- Step 5: Composite index for fast COUNT queries
CREATE INDEX IF NOT EXISTS idx_ai_usage_client_feature_created
  ON public.ai_usage_logs (client_id, feature, created_at DESC);

-- Step 6: Create the unified gate_ai_request function
CREATE OR REPLACE FUNCTION public.gate_ai_request(
  p_client_id uuid,
  p_feature text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_feature_category text;
  v_features_to_count text[];
  v_rpm_limit integer;
  v_quota_limit integer;
  v_rpm_current integer;
  v_quota_used integer;
  v_balance numeric;
  v_cost numeric;
  v_global_rpm_limit integer;
  v_global_rpm_current integer;
  v_one_minute_ago timestamptz;
  v_month_start timestamptz;
  -- Lookup vars
  v_client_chat_rpm integer;
  v_client_image_rpm integer;
  v_client_cost_estimate_rpm integer;
  v_client_chat_quota integer;
  v_client_image_quota integer;
  v_plan_chat_rpm integer;
  v_plan_image_rpm integer;
  v_plan_cost_estimate_rpm integer;
  v_plan_chat_quota integer;
  v_plan_image_quota integer;
BEGIN
  -- Determine feature category
  IF p_feature IN ('ring_chat', 'help_chat') THEN
    v_feature_category := 'chat';
    v_features_to_count := ARRAY['ring_chat', 'help_chat'];
    v_cost := 0.0005;
  ELSIF p_feature IN ('ring_preview', 'grillz_preview', 'enquiry_preview') THEN
    v_feature_category := 'image';
    v_features_to_count := ARRAY['ring_preview', 'grillz_preview', 'enquiry_preview'];
    v_cost := 0.03;
  ELSE
    v_feature_category := 'cost_estimate';
    v_features_to_count := ARRAY[p_feature];
    v_cost := 0.0005;
  END IF;

  v_one_minute_ago := now() - interval '1 minute';
  v_month_start := date_trunc('month', now());

  -- Look up client-level overrides
  SELECT chat_rpm, image_rpm, cost_estimate_rpm, chat_quota, image_quota
  INTO v_client_chat_rpm, v_client_image_rpm, v_client_cost_estimate_rpm, v_client_chat_quota, v_client_image_quota
  FROM client_ai_quotas
  WHERE client_id = p_client_id;

  -- Look up plan-tier defaults via client -> subscription_plans -> plan_ai_defaults
  SELECT pad.chat_rpm, pad.image_rpm, pad.cost_estimate_rpm, pad.chat_quota, pad.image_quota
  INTO v_plan_chat_rpm, v_plan_image_rpm, v_plan_cost_estimate_rpm, v_plan_chat_quota, v_plan_image_quota
  FROM clients c
  JOIN plan_ai_defaults pad ON pad.plan_id = c.plan_id
  WHERE c.id = p_client_id;

  -- Resolve RPM limit: client override > plan default > system default
  IF v_feature_category = 'chat' THEN
    v_rpm_limit := COALESCE(v_client_chat_rpm, v_plan_chat_rpm, 32);
    v_quota_limit := COALESCE(v_client_chat_quota, v_plan_chat_quota, 500);
  ELSIF v_feature_category = 'image' THEN
    v_rpm_limit := COALESCE(v_client_image_rpm, v_plan_image_rpm, 7);
    v_quota_limit := COALESCE(v_client_image_quota, v_plan_image_quota, 100);
  ELSE
    v_rpm_limit := COALESCE(v_client_cost_estimate_rpm, v_plan_cost_estimate_rpm, 10);
    v_quota_limit := COALESCE(v_client_chat_quota, v_plan_chat_quota, 500);
  END IF;

  -- Check per-client RPM
  SELECT COUNT(*)::integer INTO v_rpm_current
  FROM ai_usage_logs
  WHERE client_id = p_client_id
    AND feature = ANY(v_features_to_count)
    AND created_at >= v_one_minute_ago;

  IF v_rpm_current >= v_rpm_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'block_reason', 'rate_limit',
      'rpm_current', v_rpm_current,
      'rpm_limit', v_rpm_limit,
      'retry_after_ms', 10000
    );
  END IF;

  -- Check global platform RPM
  IF v_feature_category = 'chat' THEN
    SELECT global_chat_rpm INTO v_global_rpm_limit FROM platform_ai_config LIMIT 1;
  ELSIF v_feature_category = 'image' THEN
    SELECT global_image_rpm INTO v_global_rpm_limit FROM platform_ai_config LIMIT 1;
  ELSE
    SELECT global_cost_estimate_rpm INTO v_global_rpm_limit FROM platform_ai_config LIMIT 1;
  END IF;

  IF v_global_rpm_limit IS NOT NULL THEN
    SELECT COUNT(*)::integer INTO v_global_rpm_current
    FROM ai_usage_logs
    WHERE feature = ANY(v_features_to_count)
      AND created_at >= v_one_minute_ago;

    IF v_global_rpm_current >= v_global_rpm_limit THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'block_reason', 'platform_limit',
        'retry_after_ms', 15000
      );
    END IF;
  END IF;

  -- Check wallet balance
  SELECT balance INTO v_balance
  FROM client_wallets
  WHERE client_id = p_client_id;

  IF v_balance IS NULL THEN
    v_balance := 0;
  END IF;

  IF v_balance < v_cost THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'block_reason', 'insufficient_balance',
      'balance', v_balance,
      'required', v_cost
    );
  END IF;

  -- Check monthly quota
  SELECT COUNT(*)::integer INTO v_quota_used
  FROM ai_usage_logs
  WHERE client_id = p_client_id
    AND feature = ANY(v_features_to_count)
    AND created_at >= v_month_start;

  IF v_quota_used >= v_quota_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'block_reason', 'quota_exceeded',
      'quota_used', v_quota_used,
      'quota_limit', v_quota_limit
    );
  END IF;

  -- All checks passed
  RETURN jsonb_build_object(
    'allowed', true,
    'block_reason', NULL,
    'balance', v_balance,
    'rpm_current', v_rpm_current,
    'rpm_limit', v_rpm_limit,
    'quota_used', v_quota_used,
    'quota_limit', v_quota_limit
  );
END;
$$;
