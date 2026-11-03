CREATE OR REPLACE FUNCTION public.diamond_pool_row_matches(p_row public.diamond_inventory_pool, p_filter jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $fn$
DECLARE
  v_arr jsonb;
BEGIN
  IF p_filter IS NULL OR p_filter = '{}'::jsonb THEN RETURN true; END IF;

  v_arr := p_filter -> 'stoneTypes';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF (CASE WHEN COALESCE(p_row.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END)
       NOT IN (SELECT jsonb_array_elements_text(v_arr)) THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'shapes';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF LOWER(REGEXP_REPLACE(COALESCE(p_row.shape,''),'\s+',' ','g'))
       NOT IN (SELECT LOWER(jsonb_array_elements_text(v_arr))) THEN
      IF SPLIT_PART(LOWER(COALESCE(p_row.shape,'')),' ',1)
         NOT IN (SELECT LOWER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
    END IF;
  END IF;

  IF (p_filter ? 'caratMin') AND (p_filter->>'caratMin') <> '' THEN
    IF COALESCE(p_row.carats,0) < (p_filter->>'caratMin')::numeric THEN RETURN false; END IF;
  END IF;
  IF (p_filter ? 'caratMax') AND (p_filter->>'caratMax') <> '' THEN
    IF COALESCE(p_row.carats,0) > (p_filter->>'caratMax')::numeric THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'colors';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF UPPER(COALESCE(p_row.col,'')) NOT IN (SELECT UPPER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'clarities';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF UPPER(COALESCE(p_row.clar,'')) NOT IN (SELECT UPPER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
  END IF;

  -- Cut grade is only issued for round brilliants; fancy shapes carry '-' (or
  -- blank) in the feed. Applying a cut filter to them would exclude 100% of
  -- fancy inventory, so the rule applies only to rounds and to any row that
  -- actually carries a graded cut value.
  v_arr := p_filter -> 'cuts';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF SPLIT_PART(LOWER(COALESCE(p_row.shape,'')),' ',1) = 'round'
       OR COALESCE(NULLIF(TRIM(COALESCE(p_row.cut,'')),'-'),'') <> '' THEN
      IF UPPER(COALESCE(p_row.cut,'')) NOT IN (SELECT UPPER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
    END IF;
  END IF;

  v_arr := p_filter -> 'polish';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF UPPER(COALESCE(p_row.pol,'')) NOT IN (SELECT UPPER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'symmetry';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF UPPER(COALESCE(p_row.symm,'')) NOT IN (SELECT UPPER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'fluorescence';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF UPPER(COALESCE(p_row.flo,'')) NOT IN (SELECT UPPER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'labs';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF UPPER(COALESCE(p_row.lab,'')) NOT IN (SELECT UPPER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
  END IF;

  IF COALESCE((p_filter->>'canadianOnly')::boolean, false) THEN
    IF NOT COALESCE(p_row.canada_mark_eligible, false) THEN RETURN false; END IF;
  END IF;

  IF (p_filter ? 'lengthMin') AND (p_filter->>'lengthMin') <> '' THEN
    IF COALESCE(p_row.length,0) < (p_filter->>'lengthMin')::numeric THEN RETURN false; END IF;
  END IF;
  IF (p_filter ? 'lengthMax') AND (p_filter->>'lengthMax') <> '' THEN
    IF COALESCE(p_row.length,0) > (p_filter->>'lengthMax')::numeric THEN RETURN false; END IF;
  END IF;

  RETURN true;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_client_diamond_catalog_availability(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
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

  -- SELECTED layer (client intent)
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
      SELECT b FROM unnest(ARRAY[0.5,1.0,1.5,2.0,2.5,3.0,3.5,4.0,4.5,5.0]::numeric[]) AS b
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

  -- IN STOCK layer: reuse the exact same matcher the catalogue query uses, so
  -- grade filters (cut / polish / symmetry / fluorescence / lab) are honoured
  -- here too and the widget never offers a shape or carat with zero stones.
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
$fn$;