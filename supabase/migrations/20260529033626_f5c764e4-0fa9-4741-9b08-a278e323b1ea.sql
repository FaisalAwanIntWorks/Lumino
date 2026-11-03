-- Harden sync_client_diamond_catalog_from_filter against DB wedging.
-- Changes vs current definition (identity-preserving):
--   1. statement_timeout lowered from 600s -> 45s. A single bad call can no longer
--      hold a connection for 10 minutes; it will fail fast and free the slot.
--   2. Per-client advisory transaction lock so concurrent saves for the same client
--      serialize instead of stacking up and pinning multiple connections.
--   3. On lock contention we return a clean { success:false, reason:'sync_in_progress' }
--      instead of piling on.
-- Body logic is byte-for-byte the same as the existing function below the guard;
-- RPC signature and return shape are unchanged.

CREATE OR REPLACE FUNCTION public.sync_client_diamond_catalog_from_filter(p_client_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '45s'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_filter jsonb;
  v_markup_natural numeric := 0;
  v_markup_lab numeric := 0;
  v_wizard jsonb;
  v_version uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_presets_count integer := 0;
  v_carat_ranges numeric[];
  v_stone_types text[];
  v_shapes text[];
  v_coverage numeric := 0;
  v_missing integer := 0;
  v_filter_hash text;
  v_got_lock boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT (
    public.has_role(v_actor, 'agency_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.user_id = v_actor)
    OR EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.user_id = v_actor AND sm.client_id = p_client_id AND sm.status = 'active'
        AND (sm.permissions ->> 'catalog_access' = 'edit' OR sm.permissions ->> 'catalog_access' = 'true')
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Per-client advisory lock (transaction-scoped). Prevents stacking saves
  -- for the same client from pinning multiple connections.
  v_got_lock := pg_try_advisory_xact_lock(
    hashtext('sync_client_diamond_catalog_from_filter'),
    hashtextextended(p_client_id::text, 0)
  );
  IF NOT v_got_lock THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'sync_in_progress',
      'message', 'Another catalog sync for this client is already running. Try again in a few seconds.'
    );
  END IF;

  SELECT filter, markup_natural, markup_lab
    INTO v_filter, v_markup_natural, v_markup_lab
    FROM public.client_diamond_catalog_filter
   WHERE client_id = p_client_id;

  IF v_filter IS NULL THEN
    RAISE EXCEPTION 'no_filter_to_sync';
  END IF;

  v_stone_types := COALESCE(ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter -> 'stoneTypes'))), ARRAY[]::text[]);
  v_shapes := COALESCE(ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter -> 'shapes'))), ARRAY[]::text[]);
  v_carat_ranges := COALESCE(ARRAY(SELECT (jsonb_array_elements_text(v_filter -> 'caratRanges'))::numeric), ARRAY[]::numeric[]);

  v_wizard := jsonb_build_object(
    'diamondType', jsonb_build_object(
      'naturalEnabled', 'natural' = ANY(v_stone_types),
      'labGrownEnabled', 'lab' = ANY(v_stone_types),
      'certifications', '["GIA"]'::jsonb
    ),
    'shapes', jsonb_build_object('selectedShapes', COALESCE(v_filter -> 'shapes', '[]'::jsonb)),
    'grading', jsonb_build_object(
      'colors', COALESCE(v_filter -> 'colors', '[]'::jsonb),
      'clarities', COALESCE(v_filter -> 'clarities', '[]'::jsonb),
      'cutGrades', COALESCE(v_filter -> 'cuts', '[]'::jsonb),
      'polish', COALESCE(v_filter -> 'polish', '[]'::jsonb),
      'symmetry', COALESCE(v_filter -> 'symmetry', '[]'::jsonb),
      'fluorescence', COALESCE(v_filter -> 'fluorescence', '[]'::jsonb),
      'labs', COALESCE(v_filter -> 'labs', '[]'::jsonb),
      'caratRange', jsonb_build_array(
        COALESCE(NULLIF(v_filter ->> 'caratMin','')::numeric, 0.50),
        COALESCE(NULLIF(v_filter ->> 'caratMax','')::numeric, 5.00)
      )
    ),
    'pricing', jsonb_build_object(
      'pricingMethod','percentage',
      'currency','USD',
      'naturalMarkupTiers', jsonb_build_array(jsonb_build_object('caratMin',0,'caratMax',999,'markup',v_markup_natural)),
      'labMarkupTiers', jsonb_build_array(jsonb_build_object('caratMin',0,'caratMax',999,'markup',v_markup_lab))
    ),
    'productSettings', '{}'::jsonb
  );

  BEGIN
    PERFORM public.generate_client_diamond_presets_db(p_client_id, v_wizard);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.client_catalog_health AS h
      (client_id, catalog_version, presets_count, last_error, last_refresh_at, updated_at)
    VALUES (p_client_id, v_version, 0, SQLERRM, v_now, v_now)
    ON CONFLICT (client_id) DO UPDATE SET
      catalog_version = v_version, presets_count = 0, last_error = SQLERRM,
      last_refresh_at = v_now, updated_at = v_now;
    RAISE;
  END;

  UPDATE public.client_diamond_presets
     SET catalog_version = v_version
   WHERE client_id = p_client_id;

  UPDATE public.client_diamond_catalog_filter
     SET catalog_version = v_version, applied_at = v_now, updated_at = v_now
   WHERE client_id = p_client_id;

  SELECT COUNT(*) INTO v_presets_count
    FROM public.client_diamond_presets WHERE client_id = p_client_id;

  DELETE FROM public.client_carat_options WHERE client_id = p_client_id;
  IF v_carat_ranges IS NULL OR cardinality(v_carat_ranges) = 0 THEN
    v_carat_ranges := ARRAY(
      SELECT b FROM unnest(ARRAY[0.5,1.0,1.5,2.0,2.5,3.0,3.5,4.0,4.5,5.0]::numeric[]) b
      WHERE (NULLIF(v_filter->>'caratMin','')::numeric IS NULL
             OR b >= floor((v_filter->>'caratMin')::numeric * 2)/2)
        AND (NULLIF(v_filter->>'caratMax','')::numeric IS NULL
             OR b <= (v_filter->>'caratMax')::numeric)
    );
  END IF;
  IF v_carat_ranges IS NOT NULL AND cardinality(v_carat_ranges) > 0 THEN
    INSERT INTO public.client_carat_options (client_id, carat_value, display_name, is_enabled, price_adjustment)
    SELECT p_client_id, bucket,
           trim(to_char(bucket, 'FM0.00')) || ' - ' || trim(to_char(bucket + 0.49, 'FM0.00')),
           true, 0
      FROM unnest(v_carat_ranges) bucket;
  END IF;

  IF cardinality(v_shapes) > 0 AND cardinality(v_stone_types) > 0 AND cardinality(v_carat_ranges) > 0 THEN
    WITH selected AS (
      SELECT s AS shape, st AS stone_type, c AS carat_bucket
        FROM unnest(v_shapes) s
        CROSS JOIN unnest(v_stone_types) st
        CROSS JOIN unnest(v_carat_ranges) c
    ), stocked AS (
      SELECT DISTINCT
        LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape,
        public.diamond_pool_stone_type(p.lg) AS stone_type,
        FLOOR(COALESCE(p.carats,0) * 2) / 2 AS carat_bucket
      FROM public.diamond_inventory_pool p
    )
    SELECT
      COALESCE(ROUND(100.0 * SUM(CASE WHEN st.shape IS NOT NULL THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 2), 0),
      COUNT(*) - SUM(CASE WHEN st.shape IS NOT NULL THEN 1 ELSE 0 END)
      INTO v_coverage, v_missing
    FROM selected sel
    LEFT JOIN stocked st
      ON st.shape = sel.shape AND st.stone_type = sel.stone_type AND st.carat_bucket = sel.carat_bucket;
  END IF;

  v_filter_hash := md5(v_filter::text);

  INSERT INTO public.client_catalog_health AS h
    (client_id, catalog_version, filter_hash, presets_count, pool_coverage_pct,
     missing_combinations, last_error, last_refresh_at, updated_at)
  VALUES (p_client_id, v_version, v_filter_hash, v_presets_count, COALESCE(v_coverage,0),
          COALESCE(v_missing,0), NULL, v_now, v_now)
  ON CONFLICT (client_id) DO UPDATE SET
    catalog_version = v_version, filter_hash = v_filter_hash,
    presets_count = v_presets_count, pool_coverage_pct = COALESCE(v_coverage,0),
    missing_combinations = COALESCE(v_missing,0), last_error = NULL,
    last_refresh_at = v_now, updated_at = v_now;

  RETURN jsonb_build_object(
    'success', true,
    'catalogVersion', v_version,
    'presetsCount', v_presets_count,
    'poolCoveragePct', COALESCE(v_coverage,0),
    'missingCombinations', COALESCE(v_missing,0)
  );
END;
$function$;