
CREATE OR REPLACE FUNCTION public.get_diamond_pool_preview(
  p_filter jsonb,
  p_markup_natural numeric DEFAULT 0,
  p_markup_lab numeric DEFAULT 0,
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
SET search_path TO 'public'
AS $function$
DECLARE
  v_stone text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts text[]; v_pol text[]; v_symm text[]; v_flo text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric;
  v_carat_ranges numeric[];
  v_len_min numeric; v_len_max numeric; v_canadian boolean;
  v_total bigint;
  v_no_filter boolean;
BEGIN
  IF p_filter IS NULL THEN p_filter := '{}'::jsonb; END IF;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(p_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(p_filter->'shapes')))     INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'colors')))     INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'clarities')))  INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'cuts')))       INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'polish')))     INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'symmetry')))   INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'labs')))       INTO v_labs;
  v_carat_min := NULLIF(p_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(p_filter->>'caratMax','')::numeric;
  SELECT ARRAY(SELECT (jsonb_array_elements_text(p_filter->'caratRanges'))::numeric) INTO v_carat_ranges;
  v_len_min   := NULLIF(p_filter->>'lengthMin','')::numeric;
  v_len_max   := NULLIF(p_filter->>'lengthMax','')::numeric;
  v_canadian  := COALESCE((p_filter->>'canadianOnly')::boolean, false);

  v_no_filter := COALESCE(array_length(v_stone,1),0) = 0
     AND COALESCE(array_length(v_shapes,1),0) = 0
     AND COALESCE(array_length(v_colors,1),0) = 0
     AND COALESCE(array_length(v_clar,1),0) = 0
     AND COALESCE(array_length(v_cuts,1),0) = 0
     AND COALESCE(array_length(v_pol,1),0) = 0
     AND COALESCE(array_length(v_symm,1),0) = 0
     AND COALESCE(array_length(v_flo,1),0) = 0
     AND COALESCE(array_length(v_labs,1),0) = 0
     AND v_carat_min IS NULL AND v_carat_max IS NULL
     AND COALESCE(array_length(v_carat_ranges,1),0) = 0
     AND v_len_min IS NULL AND v_len_max IS NULL
     AND NOT v_canadian;

  IF v_no_filter THEN
    -- Fast path: no filters. Pull a page by primary key and use the
    -- table-wide count which is cheap (index-only scan, ~100ms).
    SELECT COUNT(*)::bigint INTO v_total FROM public.diamond_inventory_pool;

    RETURN QUERY
    SELECT
      pg.id,
      CASE WHEN LOWER(COALESCE(pg.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END AS stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(pg.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
      TRIM(TO_CHAR(FLOOR(COALESCE(pg.carats,0) * 2) / 2, 'FM0.00')) || '-' ||
        TRIM(TO_CHAR(FLOOR(COALESCE(pg.carats,0) * 2) / 2 + 0.49, 'FM0.00')) AS carat_range,
      pg.carats AS carat_value,
      UPPER(COALESCE(pg.col,'')) AS color,
      UPPER(COALESCE(pg.clar,'')) AS clarity,
      ROUND(
        COALESCE(pg.price,0) *
        (1 + (CASE WHEN LOWER(COALESCE(pg.lg,'')) = 'lab' THEN p_markup_lab ELSE p_markup_natural END) / 100.0)
      , 2) AS base_price,
      NULL::numeric AS custom_price,
      true          AS is_enabled,
      v_total       AS total_count
    FROM public.diamond_inventory_pool pg
    ORDER BY pg.id
    LIMIT p_page_size OFFSET p_offset;
    RETURN;
  END IF;

  -- Filtered path: a single CTE materialises the matching ids, then we
  -- compute the count and page rows from it. This avoids scanning the
  -- inventory twice.
  RETURN QUERY
  WITH filtered AS MATERIALIZED (
    SELECT p.id
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0) = 0 OR (CASE WHEN LOWER(COALESCE(p.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,'')) = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0)   = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0)   = 0 OR UPPER(COALESCE(p.cut,''))  = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0)    = 0 OR UPPER(COALESCE(p.pol,''))  = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0)   = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0)    = 0 OR UPPER(COALESCE(p.flo,''))  = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0)   = 0 OR UPPER(COALESCE(p.lab,''))  = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (COALESCE(array_length(v_carat_ranges,1),0) = 0 OR (FLOOR(COALESCE(p.carats,0) * 2) / 2) = ANY(v_carat_ranges))
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
  ),
  cnt AS (SELECT COUNT(*)::bigint AS c FROM filtered),
  page AS (
    SELECT id FROM filtered ORDER BY id LIMIT p_page_size OFFSET p_offset
  )
  SELECT
    pg.id,
    CASE WHEN LOWER(COALESCE(d.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END AS stone_type,
    LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(d.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
    TRIM(TO_CHAR(FLOOR(COALESCE(d.carats,0) * 2) / 2, 'FM0.00')) || '-' ||
      TRIM(TO_CHAR(FLOOR(COALESCE(d.carats,0) * 2) / 2 + 0.49, 'FM0.00')) AS carat_range,
    d.carats AS carat_value,
    UPPER(COALESCE(d.col,'')) AS color,
    UPPER(COALESCE(d.clar,'')) AS clarity,
    ROUND(
      COALESCE(d.price,0) *
      (1 + (CASE WHEN LOWER(COALESCE(d.lg,'')) = 'lab' THEN p_markup_lab ELSE p_markup_natural END) / 100.0)
    , 2) AS base_price,
    NULL::numeric AS custom_price,
    true          AS is_enabled,
    (SELECT c FROM cnt) AS total_count
  FROM page pg
  JOIN public.diamond_inventory_pool d ON d.id = pg.id
  ORDER BY pg.id;
END;
$function$;
