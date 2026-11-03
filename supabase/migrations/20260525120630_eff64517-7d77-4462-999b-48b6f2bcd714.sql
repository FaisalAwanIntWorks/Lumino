CREATE OR REPLACE FUNCTION public.get_diamond_presets_filtered(
  p_client_id uuid,
  p_stone_type text DEFAULT NULL,
  p_shape_id text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_clarity text DEFAULT NULL,
  p_carat_range text DEFAULT NULL,
  p_page_size integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  stone_type text,
  shape_id text,
  carat_range text,
  carat_value numeric,
  color text,
  clarity text,
  base_price numeric,
  custom_price numeric,
  is_enabled boolean,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filter_row public.client_diamond_catalog_filter%ROWTYPE;
  v_filter jsonb;
  v_stone text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts text[]; v_pol text[]; v_symm text[]; v_flo text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric; v_len_min numeric; v_len_max numeric;
  v_canadian boolean;
BEGIN
  SELECT * INTO v_filter_row
  FROM public.client_diamond_catalog_filter
  WHERE client_id = p_client_id AND is_confirmed = true;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      cdp.id, cdp.stone_type, cdp.shape_id, cdp.carat_range, cdp.carat_value,
      cdp.color, cdp.clarity, cdp.base_price, cdp.custom_price, cdp.is_enabled,
      COUNT(*) OVER ()::bigint AS total_count
    FROM public.client_diamond_presets cdp
    WHERE cdp.client_id = p_client_id
      AND cdp.is_enabled = true
      AND (p_stone_type  IS NULL OR cdp.stone_type  = LOWER(p_stone_type))
      AND (p_shape_id    IS NULL OR cdp.shape_id    = LOWER(p_shape_id))
      AND (p_color       IS NULL OR UPPER(cdp.color) = UPPER(p_color))
      AND (p_clarity     IS NULL OR UPPER(cdp.clarity) = UPPER(p_clarity))
      AND (p_carat_range IS NULL OR cdp.carat_range = p_carat_range)
    ORDER BY cdp.stone_type, cdp.shape_id, cdp.carat_value, cdp.color, cdp.clarity
    LIMIT p_page_size OFFSET p_offset;
    RETURN;
  END IF;

  v_filter := COALESCE(v_filter_row.filter, '{}'::jsonb);
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'shapes'))) INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'colors'))) INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'clarities'))) INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'cuts'))) INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'polish'))) INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'symmetry'))) INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'labs'))) INTO v_labs;
  v_carat_min := NULLIF(v_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(v_filter->>'caratMax','')::numeric;
  v_len_min := NULLIF(v_filter->>'lengthMin','')::numeric;
  v_len_max := NULLIF(v_filter->>'lengthMax','')::numeric;
  v_canadian := COALESCE((v_filter->>'canadianOnly')::boolean, false);

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id,
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END AS stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
      p.carats AS carat_value,
      UPPER(COALESCE(p.col,'')) AS color,
      UPPER(COALESCE(p.clar,'')) AS clarity,
      ROUND(
        COALESCE(p.price,0) *
        (1 + (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN v_filter_row.markup_lab ELSE v_filter_row.markup_natural END) / 100.0)
      , 2) AS base_price,
      FLOOR(COALESCE(p.carats,0) * 2) / 2 AS carat_bucket
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0) = 0 OR (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,'')) = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0) = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0) = 0 OR UPPER(COALESCE(p.cut,'')) = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0) = 0 OR UPPER(COALESCE(p.pol,'')) = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0) = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0) = 0 OR UPPER(COALESCE(p.flo,'')) = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0) = 0 OR UPPER(COALESCE(p.lab,'')) = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
  ), filtered AS (
    SELECT * FROM base
    WHERE (p_stone_type IS NULL OR stone_type = LOWER(p_stone_type))
      AND (p_shape_id IS NULL OR shape_id = LOWER(p_shape_id))
      AND (p_color IS NULL OR color = UPPER(p_color))
      AND (p_clarity IS NULL OR clarity = UPPER(p_clarity))
  ), ranged AS (
    SELECT *, TRIM(TO_CHAR(carat_bucket, 'FM0.00')) || '-' || TRIM(TO_CHAR(carat_bucket + 0.49, 'FM0.00')) AS carat_range_str
    FROM filtered
  )
  SELECT
    r.id, r.stone_type, r.shape_id, r.carat_range_str AS carat_range,
    r.carat_value, r.color, r.clarity, r.base_price,
    NULL::numeric AS custom_price,
    true AS is_enabled,
    COUNT(*) OVER ()::bigint AS total_count
  FROM ranged r
  WHERE (p_carat_range IS NULL OR r.carat_range_str = p_carat_range)
  ORDER BY r.stone_type, r.shape_id, r.carat_value, r.color, r.clarity
  LIMIT p_page_size OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_diamond_catalog_availability(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filter_row public.client_diamond_catalog_filter%ROWTYPE;
  v_filter jsonb;
  v_stone text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts text[]; v_pol text[]; v_symm text[]; v_flo text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric; v_len_min numeric; v_len_max numeric;
  v_canadian boolean;
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
      'shapeCaratBuckets', COALESCE((SELECT jsonb_object_agg(shape_id, buckets) FROM shape_buckets), '{}'::jsonb)
    ) INTO v_result;
    RETURN v_result;
  END IF;

  v_filter := COALESCE(v_filter_row.filter, '{}'::jsonb);
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'shapes'))) INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'colors'))) INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'clarities'))) INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'cuts'))) INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'polish'))) INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'symmetry'))) INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'labs'))) INTO v_labs;
  v_carat_min := NULLIF(v_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(v_filter->>'caratMax','')::numeric;
  v_len_min := NULLIF(v_filter->>'lengthMin','')::numeric;
  v_len_max := NULLIF(v_filter->>'lengthMax','')::numeric;
  v_canadian := COALESCE((v_filter->>'canadianOnly')::boolean, false);

  WITH rows AS (
    SELECT
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END AS stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
      FLOOR(COALESCE(p.carats,0) * 2) / 2 AS carat_bucket
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0) = 0 OR (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,'')) = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0) = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0) = 0 OR UPPER(COALESCE(p.cut,'')) = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0) = 0 OR UPPER(COALESCE(p.pol,'')) = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0) = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0) = 0 OR UPPER(COALESCE(p.flo,'')) = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0) = 0 OR UPPER(COALESCE(p.lab,'')) = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
  ), shape_buckets AS (
    SELECT shape_id, jsonb_agg(carat_bucket ORDER BY carat_bucket) AS buckets
    FROM (SELECT DISTINCT shape_id, carat_bucket FROM rows) d
    GROUP BY shape_id
  )
  SELECT jsonb_build_object(
    'isConfirmed', true,
    'shapes', COALESCE((SELECT jsonb_agg(shape_id ORDER BY shape_id) FROM (SELECT DISTINCT shape_id FROM rows) s), '[]'::jsonb),
    'stoneTypes', COALESCE((SELECT jsonb_agg(stone_type ORDER BY stone_type) FROM (SELECT DISTINCT stone_type FROM rows) s), '[]'::jsonb),
    'caratBuckets', COALESCE((SELECT jsonb_agg(carat_bucket ORDER BY carat_bucket) FROM (SELECT DISTINCT carat_bucket FROM rows) c), '[]'::jsonb),
    'shapeCaratBuckets', COALESCE((SELECT jsonb_object_agg(shape_id, buckets) FROM shape_buckets), '{}'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_diamond_presets_filtered(uuid, text, text, text, text, text, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_diamond_catalog_availability(uuid) TO anon, authenticated, service_role;