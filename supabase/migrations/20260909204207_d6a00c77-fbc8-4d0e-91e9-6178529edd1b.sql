CREATE OR REPLACE FUNCTION public.gate_ai_request(p_client_id uuid, p_feature text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_feature_category        text;
  v_features_to_count       text[];
  v_rpm_limit               integer;
  v_quota_limit             integer;
  v_rpm_current             integer;
  v_quota_used              integer;
  v_balance                 numeric;
  v_free_balance            numeric;
  v_cost                    numeric;
  v_global_rpm_limit        integer;
  v_global_rpm_current      integer;
  v_one_minute_ago          timestamptz;
  v_month_start             timestamptz;
  v_client_chat_rpm         integer;
  v_client_image_rpm        integer;
  v_client_cost_estimate_rpm integer;
  v_client_chat_quota       integer;
  v_client_image_quota      integer;
  v_plan_chat_rpm           integer;
  v_plan_image_rpm          integer;
  v_plan_cost_estimate_rpm  integer;
  v_plan_chat_quota         integer;
  v_plan_image_quota        integer;
  v_image_effective         numeric;
  v_chat_effective          numeric;
BEGIN
  -- Credit-only model: monthly plan allowances no longer block requests.
  -- Order of checks: per-client rate limit -> platform rate limit -> credit balance.
  -- Monthly counts are still returned for reporting/dashboards.
  SELECT
    COALESCE(image_base_cost * image_multiplier, 0.072),
    COALESCE(chat_base_cost  * chat_multiplier,  0.0009)
  INTO v_image_effective, v_chat_effective
  FROM platform_ai_config
  LIMIT 1;

  IF v_image_effective IS NULL THEN v_image_effective := 0.072;  END IF;
  IF v_chat_effective  IS NULL THEN v_chat_effective  := 0.0009; END IF;

  IF p_feature IN ('ring_chat', 'help_chat') THEN
    v_feature_category   := 'chat';
    v_features_to_count  := ARRAY['ring_chat', 'help_chat'];
    v_cost               := v_chat_effective;
  ELSIF p_feature IN ('ring_preview', 'grillz_preview', 'enquiry_preview') THEN
    v_feature_category   := 'image';
    v_features_to_count  := ARRAY['ring_preview', 'grillz_preview', 'enquiry_preview'];
    v_cost               := v_image_effective;
  ELSE
    v_feature_category   := 'cost_estimate';
    v_features_to_count  := ARRAY[p_feature];
    v_cost               := v_chat_effective;
  END IF;

  v_one_minute_ago := now() - interval '1 minute';
  v_month_start    := date_trunc('month', now());

  SELECT chat_rpm, image_rpm, cost_estimate_rpm, chat_quota, image_quota
  INTO v_client_chat_rpm, v_client_image_rpm, v_client_cost_estimate_rpm,
       v_client_chat_quota, v_client_image_quota
  FROM client_ai_quotas
  WHERE client_id = p_client_id;

  SELECT MAX(pad.chat_rpm), MAX(pad.image_rpm), MAX(pad.cost_estimate_rpm),
         MAX(pad.chat_quota), MAX(pad.image_quota)
  INTO v_plan_chat_rpm, v_plan_image_rpm, v_plan_cost_estimate_rpm,
       v_plan_chat_quota, v_plan_image_quota
  FROM clients c
  LEFT JOIN client_subscriptions cs
    ON cs.client_id = c.id AND cs.status IN ('active', 'trialing', 'past_due')
  JOIN plan_ai_defaults pad
    ON pad.plan_id = c.plan_id OR pad.plan_id = cs.plan_id
  WHERE c.id = p_client_id;

  IF v_feature_category = 'chat' THEN
    v_rpm_limit   := COALESCE(v_client_chat_rpm,  v_plan_chat_rpm,  32);
    v_quota_limit := COALESCE(v_client_chat_quota, v_plan_chat_quota, 500);
  ELSIF v_feature_category = 'image' THEN
    v_rpm_limit   := COALESCE(v_client_image_rpm,  v_plan_image_rpm,  7);
    v_quota_limit := COALESCE(v_client_image_quota, v_plan_image_quota, 100);
  ELSE
    v_rpm_limit   := COALESCE(v_client_cost_estimate_rpm, v_plan_cost_estimate_rpm, 10);
    v_quota_limit := COALESCE(v_client_chat_quota,         v_plan_chat_quota,         500);
  END IF;

  SELECT COUNT(*)::integer INTO v_rpm_current
  FROM ai_usage_logs
  WHERE client_id = p_client_id
    AND feature = ANY(v_features_to_count)
    AND created_at >= v_one_minute_ago;

  IF v_rpm_current >= v_rpm_limit THEN
    RETURN jsonb_build_object(
      'allowed',        false,
      'block_reason',   'rate_limit',
      'rpm_current',    v_rpm_current,
      'rpm_limit',      v_rpm_limit,
      'retry_after_ms', 10000
    );
  END IF;

  IF v_feature_category = 'chat' THEN
    SELECT global_chat_rpm         INTO v_global_rpm_limit FROM platform_ai_config LIMIT 1;
  ELSIF v_feature_category = 'image' THEN
    SELECT global_image_rpm        INTO v_global_rpm_limit FROM platform_ai_config LIMIT 1;
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
        'allowed',        false,
        'block_reason',   'platform_limit',
        'retry_after_ms', 15000
      );
    END IF;
  END IF;

  SELECT balance INTO v_balance
  FROM client_wallets
  WHERE client_id = p_client_id;
  v_balance := COALESCE(v_balance, 0);

  SELECT COALESCE(SUM(dollars_remaining), 0) INTO v_free_balance
  FROM client_free_credits
  WHERE client_id = p_client_id
    AND expires_at > now()
    AND dollars_remaining > 0;

  SELECT COUNT(*)::integer INTO v_quota_used
  FROM ai_usage_logs
  WHERE client_id = p_client_id
    AND feature = ANY(v_features_to_count)
    AND created_at >= v_month_start;

  IF (v_balance + v_free_balance) < v_cost THEN
    RETURN jsonb_build_object(
      'allowed',      false,
      'block_reason', 'insufficient_balance',
      'balance',      v_balance,
      'free_balance', v_free_balance,
      'required',     v_cost,
      'over_quota',   false,
      'quota_used',   v_quota_used,
      'quota_limit',  v_quota_limit
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed',      true,
    'block_reason', NULL,
    'balance',      v_balance,
    'free_balance', v_free_balance,
    'rpm_current',  v_rpm_current,
    'rpm_limit',    v_rpm_limit,
    'quota_used',   v_quota_used,
    'quota_limit',  v_quota_limit,
    'over_quota',   false
  );
END;
$function$;

ALTER TABLE public.platform_ai_config DROP COLUMN IF EXISTS welcome_free_credits_dollars;