-- Extend diamond carat range buckets from 4.50-4.99 ct up to 7.50-7.99 ct.
--
-- The catalog filter UI and the Ring OS Carat step now offer 15 half-carat
-- buckets (0.50 .. 7.50). All carat bucketing in SQL is already generic
-- (FLOOR(carats*2)/2), so the only DB change needed is the hard-coded
-- fallback bucket list used when a confirmed catalog filter has no explicit
-- caratRanges selection. Both availability functions are re-created
-- verbatim from 20260730195243 with only that array extended.
--
-- Cached availability rows are marked stale so they recompute with the new
-- bucket list on the next background refresh.

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
  v_stone := ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'stoneTypes')));
  v_shapes := ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'shapes')));
  v_carat_min := NULLIF(v_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(v_filter->>'caratMax','')::numeric;
  v_carat_ranges := ARRAY(SELECT (jsonb_array_elements_text(v_filter->'caratRanges'))::numeric);

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

  IF v_carat_ranges IS NOT NULL AND array_length(v_carat_ranges, 1) > 0 THEN
    v_selected_buckets := v_carat_ranges;
  ELSE
    v_selected_buckets := ARRAY(
      SELECT b FROM unnest(ARRAY[0.5,1.0,1.5,2.0,2.5,3.0,3.5,4.0,4.5,5.0,5.5,6.0,6.5,7.0,7.5]::numeric[]) AS b
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

  WITH pool_rows AS (
    SELECT
      public.diamond_pool_stone_type(p.lg) AS stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
      FLOOR(COALESCE(p.carats,0) * 2) / 2 AS carat_bucket
    FROM public.diamond_inventory_pool p
    WHERE public.diamond_pool_row_matches(p, v_filter)
      AND (COALESCE(array_length(v_carat_ranges,1),0) = 0
        OR (FLOOR(COALESCE(p.carats,0) * 2) / 2) = ANY(v_carat_ranges))
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

CREATE OR REPLACE FUNCTION public.get_client_diamond_catalog_availability(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cached jsonb;
  v_filter_row public.client_diamond_catalog_filter%ROWTYPE;
  v_filter jsonb;
  v_stone text[]; v_shapes text[];
  v_carat_ranges numeric[];
  v_carat_min numeric; v_carat_max numeric;
  v_selected_shapes text[]; v_selected_stones text[]; v_selected_buckets numeric[];
  v_selected_shape_buckets jsonb;
BEGIN
  SELECT availability INTO v_cached
  FROM public.client_diamond_availability_cache
  WHERE client_id = p_client_id;

  IF v_cached IS NOT NULL AND v_cached <> '{}'::jsonb THEN
    RETURN v_cached;
  END IF;

  SELECT * INTO v_filter_row
  FROM public.client_diamond_catalog_filter
  WHERE client_id = p_client_id AND is_confirmed = true;

  IF NOT FOUND THEN
    -- cheap path: derive everything from the client's own presets
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
      'inStockShapeCaratBuckets', COALESCE((SELECT jsonb_object_agg(shape_id, buckets) FROM shape_buckets), '{}'::jsonb),
      'isFallback', true
    ) INTO v_cached;
    RETURN v_cached;
  END IF;

  -- fallback: serve the client's configured selection (no inventory scan)
  v_filter := COALESCE(v_filter_row.filter, '{}'::jsonb);
  v_stone := ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'stoneTypes')));
  v_shapes := ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'shapes')));
  v_carat_min := NULLIF(v_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(v_filter->>'caratMax','')::numeric;
  v_carat_ranges := ARRAY(SELECT (jsonb_array_elements_text(v_filter->'caratRanges'))::numeric);

  v_selected_stones := CASE WHEN cardinality(v_stone) = 0 THEN ARRAY['natural','lab']::text[] ELSE v_stone END;
  v_selected_shapes := CASE WHEN cardinality(v_shapes) = 0
    THEN ARRAY['round','oval','pear','emerald','radiant','princess','marquise','cushion','asscher','heart']::text[]
    ELSE v_shapes END;

  IF v_carat_ranges IS NOT NULL AND array_length(v_carat_ranges, 1) > 0 THEN
    v_selected_buckets := v_carat_ranges;
  ELSE
    v_selected_buckets := ARRAY(
      SELECT b FROM unnest(ARRAY[0.5,1.0,1.5,2.0,2.5,3.0,3.5,4.0,4.5,5.0,5.5,6.0,6.5,7.0,7.5]::numeric[]) AS b
      WHERE (v_carat_min IS NULL OR b >= floor(v_carat_min * 2)/2)
        AND (v_carat_max IS NULL OR b <= v_carat_max)
    );
  END IF;

  SELECT jsonb_object_agg(shape, buckets) INTO v_selected_shape_buckets
    FROM (
      SELECT s AS shape,
             (SELECT jsonb_agg(b ORDER BY b) FROM unnest(v_selected_buckets) b) AS buckets
        FROM unnest(v_selected_shapes) s
    ) x;

  RETURN jsonb_build_object(
    'isConfirmed', true,
    'shapes', COALESCE(to_jsonb(v_selected_shapes), '[]'::jsonb),
    'stoneTypes', COALESCE(to_jsonb(v_selected_stones), '[]'::jsonb),
    'caratBuckets', COALESCE(to_jsonb(v_selected_buckets), '[]'::jsonb),
    'shapeCaratBuckets', COALESCE(v_selected_shape_buckets, '{}'::jsonb),
    'inStockShapes', COALESCE(to_jsonb(v_selected_shapes), '[]'::jsonb),
    'inStockStoneTypes', COALESCE(to_jsonb(v_selected_stones), '[]'::jsonb),
    'inStockCaratBuckets', COALESCE(to_jsonb(v_selected_buckets), '[]'::jsonb),
    'inStockShapeCaratBuckets', COALESCE(v_selected_shape_buckets, '{}'::jsonb),
    'isFallback', true
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_client_diamond_catalog_availability(uuid) TO anon, authenticated, service_role;

-- Force recompute of cached availability with the extended bucket list.
UPDATE public.client_diamond_availability_cache SET is_stale = true;