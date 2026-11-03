
-- Issue #7 Fix: Rename credits_granted / credits_remaining → dollars_granted / dollars_remaining
--
-- Problem: client_free_credits columns were named "credits_*" but store USD values (2.5 = $2.50).
-- Any query treating these as credit-count units gets answers wrong by a factor of 2000.
-- Fix: rename to dollars_* so the unit is unambiguous at the schema level.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Rename the columns
ALTER TABLE public.client_free_credits
  RENAME COLUMN credits_granted   TO dollars_granted;

ALTER TABLE public.client_free_credits
  RENAME COLUMN credits_remaining TO dollars_remaining;

-- 2. Recreate ensure_free_credits (uses both columns)
--    Latest logic: one-time welcome grant only; amount from platform_ai_config.
CREATE OR REPLACE FUNCTION public.ensure_free_credits(p_client_id uuid)
RETURNS public.client_free_credits
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row    public.client_free_credits;
  v_amount numeric;
BEGIN
  -- Return existing active row if any
  SELECT * INTO v_row
  FROM public.client_free_credits
  WHERE client_id = p_client_id
    AND expires_at > now()
  ORDER BY expires_at DESC
  LIMIT 1;

  IF v_row.id IS NOT NULL THEN
    RETURN v_row;
  END IF;

  -- Client already received welcome grant once — do NOT re-issue
  IF EXISTS (
    SELECT 1 FROM public.client_free_credits
    WHERE client_id = p_client_id
  ) THEN
    RETURN NULL;
  END IF;

  -- Brand-new client: read configurable amount from platform_ai_config
  SELECT COALESCE(welcome_free_credits_dollars, 2.5)
  INTO v_amount
  FROM public.platform_ai_config
  LIMIT 1;

  IF v_amount IS NULL THEN
    v_amount := 2.5;
  END IF;

  INSERT INTO public.client_free_credits (client_id, dollars_granted, dollars_remaining)
  VALUES (p_client_id, v_amount, v_amount)
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- 3. Recreate grant_monthly_free_credits (references dollars_granted / dollars_remaining)
--    Latest logic: intentionally disabled (welcome-only benefit).
CREATE OR REPLACE FUNCTION public.grant_monthly_free_credits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_granted integer := 0;
BEGIN
  -- Clean up expired free credit rows
  DELETE FROM public.client_free_credits
  WHERE expires_at < now();

  -- Grant fresh credits to active AI users without a current grant,
  -- then bump lifetime_free_credits on their wallet in one CTE pass.
  WITH inserted AS (
    INSERT INTO public.client_free_credits (client_id, dollars_granted, dollars_remaining)
    SELECT DISTINCT aul.client_id, 2.5, 2.5
    FROM public.ai_usage_logs aul
    WHERE NOT EXISTS (
      SELECT 1 FROM public.client_free_credits cfc
      WHERE cfc.client_id = aul.client_id
        AND cfc.expires_at > now()
    )
    RETURNING client_id, dollars_granted
  )
  UPDATE public.client_wallets cw
  SET lifetime_free_credits = cw.lifetime_free_credits + ins.dollars_granted
  FROM inserted ins
  WHERE cw.client_id = ins.client_id;

  GET DIAGNOSTICS v_granted = ROW_COUNT;
  RETURN v_granted;
END;
$function$;

-- 4. Recreate debit_wallet (references dollars_remaining)
CREATE OR REPLACE FUNCTION public.debit_wallet(
  p_client_id   uuid,
  p_amount      numeric,
  p_description text    DEFAULT ''::text,
  p_reference_id text   DEFAULT NULL::text,
  p_metadata    jsonb   DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining_cost   numeric;
  v_total_free_used  numeric := 0;
  v_free_id          uuid;
  v_free_remaining   numeric;
  v_free_deduct      numeric;
  v_current_balance  numeric;
  v_new_balance      numeric;
BEGIN
  v_remaining_cost := p_amount;

  -- Consume free credits first (oldest-expiry first)
  FOR v_free_id, v_free_remaining IN
    SELECT id, dollars_remaining
    FROM public.client_free_credits
    WHERE client_id = p_client_id
      AND expires_at > now()
      AND dollars_remaining > 0
    ORDER BY expires_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining_cost <= 0;
    v_free_deduct    := LEAST(v_free_remaining, v_remaining_cost);
    UPDATE public.client_free_credits
    SET dollars_remaining = dollars_remaining - v_free_deduct
    WHERE id = v_free_id;
    v_remaining_cost  := v_remaining_cost  - v_free_deduct;
    v_total_free_used := v_total_free_used + v_free_deduct;
  END LOOP;

  SELECT balance INTO v_current_balance
  FROM public.client_wallets
  WHERE client_id = p_client_id
  FOR UPDATE;
  v_current_balance := COALESCE(v_current_balance, 0);

  -- Fully covered by free credits
  IF v_remaining_cost <= 0 THEN
    UPDATE public.client_wallets
    SET lifetime_free_debits = lifetime_free_debits + v_total_free_used
    WHERE client_id = p_client_id;

    INSERT INTO public.wallet_transactions (client_id, type, amount, balance_after, description, reference_id, metadata)
    VALUES (p_client_id, 'debit', -p_amount, v_current_balance,
            p_description || ' (free credits)', p_reference_id,
            p_metadata || jsonb_build_object('free_credits_used', v_total_free_used, 'wallet_used', 0));

    RETURN jsonb_build_object('success', true, 'balance', v_current_balance, 'free_used', v_total_free_used);
  END IF;

  -- Need wallet funds for remainder
  IF v_current_balance < v_remaining_cost THEN
    IF v_current_balance IS NULL THEN
      INSERT INTO public.client_wallets (client_id, balance)
      VALUES (p_client_id, 0)
      ON CONFLICT (client_id) DO NOTHING;
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_balance', 'balance', COALESCE(v_current_balance, 0));
  END IF;

  v_new_balance := v_current_balance - v_remaining_cost;

  UPDATE public.client_wallets
  SET balance              = v_new_balance,
      lifetime_debits      = lifetime_debits      + v_remaining_cost,
      lifetime_free_debits = lifetime_free_debits + v_total_free_used
  WHERE client_id = p_client_id;

  IF v_total_free_used > 0 THEN
    INSERT INTO public.wallet_transactions (client_id, type, amount, balance_after, description, reference_id, metadata)
    VALUES (p_client_id, 'debit', -v_total_free_used, v_new_balance,
            p_description || ' (free credits)', p_reference_id,
            p_metadata || jsonb_build_object('free_credits_used', v_total_free_used));

    INSERT INTO public.wallet_transactions (client_id, type, amount, balance_after, description, reference_id, metadata)
    VALUES (p_client_id, 'debit', -v_remaining_cost, v_new_balance,
            p_description || ' (purchased)', p_reference_id,
            p_metadata || jsonb_build_object('wallet_used', v_remaining_cost));
  ELSE
    INSERT INTO public.wallet_transactions (client_id, type, amount, balance_after, description, reference_id, metadata)
    VALUES (p_client_id, 'debit', -p_amount, v_new_balance,
            p_description, p_reference_id, p_metadata);
  END IF;

  RETURN jsonb_build_object('success', true, 'balance', v_new_balance, 'free_used', v_total_free_used);
END;
$function$;

-- 5. Recreate gate_ai_request (references dollars_remaining)
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
  -- Fetch effective costs from config (base × multiplier)
  SELECT
    COALESCE(image_base_cost * image_multiplier, 0.13),
    COALESCE(chat_base_cost  * chat_multiplier,  0.0005)
  INTO v_image_effective, v_chat_effective
  FROM platform_ai_config
  LIMIT 1;

  IF v_image_effective IS NULL THEN v_image_effective := 0.13;   END IF;
  IF v_chat_effective  IS NULL THEN v_chat_effective  := 0.0005; END IF;

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

  SELECT pad.chat_rpm, pad.image_rpm, pad.cost_estimate_rpm, pad.chat_quota, pad.image_quota
  INTO v_plan_chat_rpm, v_plan_image_rpm, v_plan_cost_estimate_rpm,
       v_plan_chat_quota, v_plan_image_quota
  FROM clients c
  JOIN plan_ai_defaults pad ON pad.plan_id = c.plan_id
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

  IF (v_balance + v_free_balance) < v_cost THEN
    RETURN jsonb_build_object(
      'allowed',      false,
      'block_reason', 'insufficient_balance',
      'balance',      v_balance,
      'free_balance', v_free_balance,
      'required',     v_cost
    );
  END IF;

  SELECT COUNT(*)::integer INTO v_quota_used
  FROM ai_usage_logs
  WHERE client_id = p_client_id
    AND feature = ANY(v_features_to_count)
    AND created_at >= v_month_start;

  IF v_quota_used >= v_quota_limit THEN
    RETURN jsonb_build_object(
      'allowed',      false,
      'block_reason', 'quota_exceeded',
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
    'quota_limit',  v_quota_limit
  );
END;
$function$;
