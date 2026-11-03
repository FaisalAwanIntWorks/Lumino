-- ============================================================================
-- Ring OS catalogue availability: refresh only on Confirm (and after scoring)
-- ============================================================================
-- Before: pg_cron job `refresh_stale_diamond_availability_5min` ran 288x/day
-- (it lived only in the live database; the repo file was reverted on
-- 2026-09-10). Its 24-hour rule rebuilt EVERY confirmed client's cache once a
-- day, and each rebuild called the per-row plpgsql matcher
-- diamond_pool_row_matches() on every pool row (no index use).
--
-- After:
--   * The 5-minute cron is unscheduled. Nothing polls.
--   * compute_client_diamond_catalog_availability() applies the same filter
--     rules as diamond_pool_row_matches() but as plain SQL predicates on the
--     pool columns, so it is one indexed set-based scan instead of 800k
--     function calls. Output JSON is unchanged.
--   * The Confirm Catalog button calls refresh_client_diamond_availability()
--     right after saving (frontend change); the diamond scoring job rebuilds
--     every confirmed client's cache as its last phase after a pool change.
--   * refresh_stale_diamond_availability() keeps its signature for manual use
--     but only touches caches that are actually marked stale.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh_stale_diamond_availability_5min') THEN
    PERFORM cron.unschedule('refresh_stale_diamond_availability_5min');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available or job absent: %', SQLERRM;
END $$;

-- ─── Filter values helper: jsonb array -> text[] (case-folded), tolerant ─────
CREATE OR REPLACE FUNCTION public.diamond_filter_values(p_filter jsonb, p_key text, p_upper boolean DEFAULT true)
RETURNS text[]
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $body$
  SELECT CASE
    WHEN p_filter IS NULL OR jsonb_typeof(p_filter -> p_key) <> 'array' THEN ARRAY[]::text[]
    ELSE ARRAY(SELECT CASE WHEN p_upper THEN UPPER(x) ELSE LOWER(x) END
               FROM jsonb_array_elements_text(p_filter -> p_key) AS x)
  END;
$body$;

-- ─── Set-based availability (same rules as diamond_pool_row_matches) ─────────
CREATE OR REPLACE FUNCTION public.compute_client_diamond_catalog_availability(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_filter_row public.client_diamond_catalog_filter%ROWTYPE;
  v_filter jsonb;
  v_stone text[]; v_shapes text[];
  v_carat_ranges numeric[];
  v_carat_min numeric; v_carat_max numeric;
  v_selected_shapes text[]; v_selected_stones text[]; v_selected_buckets numeric[];
  v_selected_shape_buckets jsonb;
  v_instock_shapes text[]; v_instock_stones text[]; v_instock_buckets numeric[];
  v_instock_shape_buckets jsonb;
  v_result jsonb;
  -- predicate arrays (mirroring diamond_pool_row_matches)
  v_f_colors text[]; v_f_clar text[]; v_f_cuts text[]; v_f_pol text[]; v_f_symm text[]; v_f_flo text[]; v_f_labs text[];
  v_canadian boolean;
  v_len_min numeric; v_len_max numeric;
  v_empty_filter boolean;
BEGIN
  SELECT * INTO v_filter_row
  FROM public.client_diamond_catalog_filter
  WHERE client_id = p_client_id AND is_confirmed = true;

  IF NOT FOUND THEN
    WITH rows AS (
      SELECT shape_id, stone_type, FLOOR(carat_value * 2) / 2 AS carat_bucket
      FROM public.client_diamond_presets
      WHERE client_id = p_client_id AND is_enabled = true
    ), shape_buckets AS (
      SELECT shape_id, jsonb_agg(carat_bucket ORDER BY carat_bucket) AS buckets
      FROM (SELECT DISTINCT shape_id, carat_bucket FROM rows) d
      GROUP BY shape_id
    )
    SELECT jsonb_build_object(
      'isConfirmed', false,
      'shapes', COALESCE((SELECT jsonb_agg(shape_id ORDER BY shape_id) FROM (SELECT DISTINCT shape_id FROM rows) s), '[]'::jsonb),
      'stoneTypes', COALESCE((SELECT jsonb_agg(stone_type ORDER BY stone_type) FROM (SELECT DISTINCT stone_type FROM rows) s), '[]'::jsonb),
      'caratBuckets', COALESCE((SELECT jsonb_agg(carat_bucket ORDER BY carat_bucket) FROM (SELECT DISTINCT carat_bucket FROM rows) c), '[]'::jsonb),
      'shapeCaratBuckets', COALESCE((SELECT jsonb_object_agg(shape_id, buckets) FROM shape_buckets), '{}'::jsonb),
      'inStockShapes', COALESCE((SELECT jsonb_agg(shape_id ORDER BY shape_id) FROM (SELECT DISTINCT shape_id FROM rows) s), '[]'::jsonb),
      'inStockStoneTypes', COALESCE((SELECT jsonb_agg(stone_type ORDER BY stone_type) FROM (SELECT DISTINCT stone_type FROM rows) s), '[]'::jsonb),
      'inStockCaratBuckets', COALESCE((SELECT jsonb_agg(carat_bucket ORDER BY carat_bucket) FROM (SELECT DISTINCT carat_bucket FROM rows) c), '[]'::jsonb),
      'inStockShapeCaratBuckets', COALESCE((SELECT jsonb_object_agg(shape_id, buckets) FROM shape_buckets), '{}'::jsonb)
    ) INTO v_result;
    RETURN v_result;
  END IF;

  v_filter := COALESCE(v_filter_row.filter, '{}'::jsonb);
  v_empty_filter := (v_filter = '{}'::jsonb);
  v_stone  := public.diamond_filter_values(v_filter, 'stoneTypes', false);
  v_shapes := public.diamond_filter_values(v_filter, 'shapes', false);
  v_carat_min := NULLIF(v_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(v_filter->>'caratMax','')::numeric;
  v_carat_ranges := CASE WHEN jsonb_typeof(v_filter->'caratRanges') = 'array'
                         THEN ARRAY(SELECT (jsonb_array_elements_text(v_filter->'caratRanges'))::numeric)
                         ELSE ARRAY[]::numeric[] END;
  v_f_colors := public.diamond_filter_values(v_filter, 'colors');
  v_f_clar   := public.diamond_filter_values(v_filter, 'clarities');
  v_f_cuts   := public.diamond_filter_values(v_filter, 'cuts');
  v_f_pol    := public.diamond_filter_values(v_filter, 'polish');
  v_f_symm   := public.diamond_filter_values(v_filter, 'symmetry');
  v_f_flo    := public.diamond_filter_values(v_filter, 'fluorescence');
  v_f_labs   := public.diamond_filter_values(v_filter, 'labs');
  v_canadian := COALESCE((v_filter->>'canadianOnly')::boolean, false);
  v_len_min  := NULLIF(v_filter->>'lengthMin','')::numeric;
  v_len_max  := NULLIF(v_filter->>'lengthMax','')::numeric;

  IF cardinality(v_stone) = 0 THEN
    v_selected_stones := ARRAY['natural','lab']::text[];
  ELSE
    v_selected_stones := v_stone;
  END IF;

  IF cardinality(v_shapes) = 0 THEN
    v_selected_shapes := ARRAY(
      SELECT DISTINCT LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shp
      FROM public.diamond_inventory_pool p
      WHERE COALESCE(p.shape,'') <> ''
    );
  ELSE
    v_selected_shapes := v_shapes;
  END IF;

  IF array_length(v_carat_ranges, 1) > 0 THEN
    v_selected_buckets := v_carat_ranges;
  ELSE
    v_selected_buckets := ARRAY(
      SELECT b FROM unnest(ARRAY[0.5,1.0,1.5,2.0,2.5,3.0,3.5,4.0,4.5,5.0,5.5,6.0,6.5,7.0,7.5,8.0]::numeric[]) AS b
      WHERE (v_carat_min IS NULL OR b >= floor(v_carat_min * 2)/2)
        AND (v_carat_max IS NULL OR b <= v_carat_max)
    );
  END IF;

  IF cardinality(v_selected_shapes) > 0 THEN
    SELECT jsonb_object_agg(shape, buckets) INTO v_selected_shape_buckets
      FROM (
        SELECT s AS shape,
               (SELECT jsonb_agg(b ORDER BY b) FROM unnest(v_selected_buckets) b) AS buckets
          FROM unnest(v_selected_shapes) s
      ) x;
  ELSE
    v_selected_shape_buckets := '{}'::jsonb;
  END IF;

  -- One set-based pass. Every rule below is the SQL form of the matching rule
  -- in diamond_pool_row_matches(); an empty filter matches everything.
  WITH pool_rows AS (
    SELECT
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' OR LOWER(COALESCE(p.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END AS stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
      FLOOR(COALESCE(p.carats,0) * 2) / 2 AS carat_bucket
    FROM public.diamond_inventory_pool p
    WHERE (v_empty_filter OR (
          (cardinality(v_stone) = 0
             OR (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' OR LOWER(COALESCE(p.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END) = ANY (v_stone))
      AND (cardinality(v_shapes) = 0
             OR LOWER(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g')) = ANY (v_shapes)
             OR SPLIT_PART(LOWER(COALESCE(p.shape,'')),' ',1) = ANY (v_shapes))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (cardinality(v_f_colors) = 0 OR UPPER(COALESCE(p.col,''))  = ANY (v_f_colors))
      AND (cardinality(v_f_clar)   = 0 OR UPPER(COALESCE(p.clar,'')) = ANY (v_f_clar))
      AND (cardinality(v_f_cuts)   = 0
             OR NOT (SPLIT_PART(LOWER(COALESCE(p.shape,'')),' ',1) = 'round'
                     OR COALESCE(NULLIF(TRIM(COALESCE(p.cut,'')),'-'),'') <> '')
             OR UPPER(COALESCE(p.cut,'')) = ANY (v_f_cuts))
      AND (cardinality(v_f_pol)    = 0 OR UPPER(COALESCE(p.pol,''))  = ANY (v_f_pol))
      AND (cardinality(v_f_symm)   = 0 OR UPPER(COALESCE(p.symm,'')) = ANY (v_f_symm))
      AND (cardinality(v_f_flo)    = 0 OR UPPER(COALESCE(p.flo,''))  = ANY (v_f_flo))
      AND (cardinality(v_f_labs)   = 0 OR UPPER(COALESCE(p.lab,''))  = ANY (v_f_labs))
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible, false))
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
    ))
    AND (array_length(v_carat_ranges,1) IS NULL
         OR (FLOOR(COALESCE(p.carats,0) * 2) / 2) = ANY (v_carat_ranges))
  ), distinct_rows AS (
    SELECT DISTINCT stone_type, shape_id, carat_bucket FROM pool_rows
  ), shape_buckets AS (
    SELECT shape_id, jsonb_agg(carat_bucket ORDER BY carat_bucket) AS buckets
    FROM (SELECT DISTINCT shape_id, carat_bucket FROM distinct_rows) d
    GROUP BY shape_id
  )
  SELECT
    COALESCE((SELECT array_agg(DISTINCT shape_id ORDER BY shape_id) FROM distinct_rows), ARRAY[]::text[]),
    COALESCE((SELECT array_agg(DISTINCT stone_type ORDER BY stone_type) FROM distinct_rows), ARRAY[]::text[]),
    COALESCE((SELECT array_agg(DISTINCT carat_bucket ORDER BY carat_bucket) FROM distinct_rows), ARRAY[]::numeric[]),
    COALESCE((SELECT jsonb_object_agg(shape_id, buckets) FROM shape_buckets), '{}'::jsonb)
    INTO v_instock_shapes, v_instock_stones, v_instock_buckets, v_instock_shape_buckets;

  v_result := jsonb_build_object(
    'isConfirmed', true,
    'shapes', COALESCE(to_jsonb(v_selected_shapes), '[]'::jsonb),
    'stoneTypes', COALESCE(to_jsonb(v_selected_stones), '[]'::jsonb),
    'caratBuckets', COALESCE(to_jsonb(v_selected_buckets), '[]'::jsonb),
    'shapeCaratBuckets', COALESCE(v_selected_shape_buckets, '{}'::jsonb),
    'inStockShapes', COALESCE(to_jsonb(v_instock_shapes), '[]'::jsonb),
    'inStockStoneTypes', COALESCE(to_jsonb(v_instock_stones), '[]'::jsonb),
    'inStockCaratBuckets', COALESCE(to_jsonb(v_instock_buckets), '[]'::jsonb),
    'inStockShapeCaratBuckets', COALESCE(v_instock_shape_buckets, '{}'::jsonb)
  );

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.compute_client_diamond_catalog_availability(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_client_diamond_catalog_availability(uuid) TO service_role, authenticated;

-- ─── Manual sweep: only caches that are really stale (no 24h re-check) ───────
CREATE OR REPLACE FUNCTION public.refresh_stale_diamond_availability(p_limit integer DEFAULT 5)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_client uuid;
  v_count integer := 0;
BEGIN
  FOR v_client IN
    SELECT f.client_id
    FROM public.client_diamond_catalog_filter f
    JOIN public.client_diamond_availability_cache c ON c.client_id = f.client_id
    WHERE f.is_confirmed = true
      AND c.is_stale = true
    ORDER BY c.updated_at NULLS FIRST
    LIMIT GREATEST(p_limit, 1)
  LOOP
    BEGIN
      PERFORM public.refresh_client_diamond_availability(v_client);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'availability refresh failed for %: %', v_client, SQLERRM;
    END;
  END LOOP;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.refresh_stale_diamond_availability(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_stale_diamond_availability(integer) TO service_role;

-- refresh_client_diamond_availability(uuid) is unchanged (already granted to
-- authenticated so the Confirm button can call it for the signed-in client).
