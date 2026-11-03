-- Fix lab diamond detection across all pool-path functions.

DROP FUNCTION IF EXISTS public.get_diamond_presets_filtered(uuid,text,text,text,text,text,integer,integer);

CREATE OR REPLACE FUNCTION public.get_diamond_presets_filtered(
  p_client_id   uuid,
  p_stone_type  text    DEFAULT NULL::text,
  p_shape_id    text    DEFAULT NULL::text,
  p_color       text    DEFAULT NULL::text,
  p_clarity     text    DEFAULT NULL::text,
  p_carat_range text    DEFAULT NULL::text,
  p_page_size   integer DEFAULT 50,
  p_offset      integer DEFAULT 0
)
RETURNS TABLE(
  id           uuid,
  stone_type   text,
  shape_id     text,
  carat_range  text,
  carat_value  numeric,
  color        text,
  clarity      text,
  base_price   numeric,
  custom_price numeric,
  is_enabled   boolean,
  total_count  bigint,
  pool_id      uuid,
  report_no    text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_filter_row public.client_diamond_catalog_filter%ROWTYPE;
  v_filter     jsonb;
  v_stone  text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts   text[]; v_pol    text[]; v_symm   text[]; v_flo  text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric;
  v_carat_ranges numeric[];
  v_len_min numeric; v_len_max numeric; v_canadian boolean;
  v_price_min_natural numeric; v_price_max_natural numeric;
  v_price_min_lab     numeric; v_price_max_lab     numeric;
BEGIN
  SELECT * INTO v_filter_row
  FROM public.client_diamond_catalog_filter
  WHERE client_id = p_client_id AND is_confirmed = true;

  IF NOT FOUND THEN
    RETURN QUERY
    WITH raw AS (
      SELECT
        cdp.id, cdp.stone_type, cdp.shape_id, cdp.carat_range, cdp.carat_value,
        cdp.color, cdp.clarity, cdp.base_price, cdp.custom_price, cdp.is_enabled,
        cdp.source_pool_id, cdp.report_no
      FROM public.client_diamond_presets cdp
      WHERE cdp.client_id = p_client_id
        AND cdp.is_enabled = true
        AND (p_stone_type  IS NULL OR cdp.stone_type        = LOWER(p_stone_type))
        AND (p_shape_id    IS NULL OR cdp.shape_id          = LOWER(p_shape_id))
        AND (p_color       IS NULL OR UPPER(cdp.color)      = UPPER(p_color))
        AND (p_clarity     IS NULL OR UPPER(cdp.clarity)    = UPPER(p_clarity))
        AND (p_carat_range IS NULL OR cdp.carat_range       = p_carat_range)
    ),
    deduped AS (
      SELECT DISTINCT ON (r.stone_type, r.shape_id, r.carat_range, r.color, r.clarity)
        r.*
      FROM raw r
      ORDER BY r.stone_type, r.shape_id, r.carat_range, r.color, r.clarity,
               COALESCE(r.custom_price, r.base_price) DESC,
               r.report_no NULLS LAST
    )
    SELECT
      d.id, d.stone_type, d.shape_id, d.carat_range, d.carat_value,
      d.color, d.clarity, d.base_price, d.custom_price, d.is_enabled,
      COUNT(*) OVER ()::bigint AS total_count,
      d.source_pool_id AS pool_id,
      d.report_no
    FROM deduped d
    ORDER BY d.stone_type, COALESCE(d.custom_price, d.base_price) DESC, d.color, d.clarity
    LIMIT p_page_size OFFSET p_offset;
    RETURN;
  END IF;

  v_filter := COALESCE(v_filter_row.filter, '{}'::jsonb);
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'shapes')))     INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'colors')))     INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'clarities')))  INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'cuts')))       INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'polish')))     INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'symmetry')))   INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'labs')))       INTO v_labs;
  v_carat_min         := NULLIF(v_filter->>'caratMin','')::numeric;
  v_carat_max         := NULLIF(v_filter->>'caratMax','')::numeric;
  SELECT ARRAY(SELECT (jsonb_array_elements_text(v_filter->'caratRanges'))::numeric) INTO v_carat_ranges;
  v_len_min           := NULLIF(v_filter->>'lengthMin','')::numeric;
  v_len_max           := NULLIF(v_filter->>'lengthMax','')::numeric;
  v_canadian          := COALESCE((v_filter->>'canadianOnly')::boolean, false);
  v_price_min_natural := NULLIF(v_filter->>'priceMinNatural','')::numeric;
  v_price_max_natural := NULLIF(v_filter->>'priceMaxNatural','')::numeric;
  v_price_min_lab     := NULLIF(v_filter->>'priceMinLab','')::numeric;
  v_price_max_lab     := NULLIF(v_filter->>'priceMaxLab','')::numeric;

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id,
      CASE WHEN LOWER(COALESCE(p.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END       AS diamond_stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1))     AS diamond_shape_id,
      p.carats                                                                          AS diamond_carat_value,
      UPPER(COALESCE(p.col,''))                                                         AS diamond_color,
      UPPER(COALESCE(p.clar,''))                                                        AS diamond_clarity,
      ROUND(
        COALESCE(p.price,0) *
        (1 + (CASE WHEN LOWER(COALESCE(p.lg,'')) = 'lab'
                   THEN v_filter_row.markup_lab
                   ELSE v_filter_row.markup_natural END) / 100.0)
      , 2)                                                                              AS diamond_base_price,
      FLOOR(COALESCE(p.carats,0) * 2) / 2                                              AS diamond_carat_bucket,
      p.report_no                                                                       AS diamond_report_no
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0)  = 0 OR (CASE WHEN LOWER(COALESCE(p.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,''))  = ANY(v_colors))
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
      AND (
        (LOWER(COALESCE(p.lg,'')) <> 'lab'
         AND (v_price_min_natural IS NULL OR COALESCE(p.price,0) >= v_price_min_natural)
         AND (v_price_max_natural IS NULL OR COALESCE(p.price,0) <= v_price_max_natural))
        OR
        (LOWER(COALESCE(p.lg,'')) = 'lab'
         AND (v_price_min_lab IS NULL OR COALESCE(p.price,0) >= v_price_min_lab)
         AND (v_price_max_lab IS NULL OR COALESCE(p.price,0) <= v_price_max_lab))
      )
  ),
  filtered AS (
    SELECT * FROM base b
    WHERE (p_stone_type IS NULL OR b.diamond_stone_type = LOWER(p_stone_type))
      AND (p_shape_id   IS NULL OR b.diamond_shape_id   = LOWER(p_shape_id))
      AND (p_color      IS NULL OR b.diamond_color       = UPPER(p_color))
      AND (p_clarity    IS NULL OR b.diamond_clarity     = UPPER(p_clarity))
  ),
  ranged AS (
    SELECT
      f.*,
      TRIM(TO_CHAR(f.diamond_carat_bucket, 'FM0.00')) || '-' || TRIM(TO_CHAR(f.diamond_carat_bucket + 0.49, 'FM0.00')) AS diamond_carat_range
    FROM filtered f
  ),
  deduped AS (
    SELECT DISTINCT ON (r.diamond_stone_type, r.diamond_shape_id, r.diamond_carat_range, r.diamond_color, r.diamond_clarity)
      r.id,
      r.diamond_stone_type,
      r.diamond_shape_id,
      r.diamond_carat_range,
      r.diamond_carat_value,
      r.diamond_color,
      r.diamond_clarity,
      r.diamond_base_price,
      r.diamond_report_no
    FROM ranged r
    WHERE (p_carat_range IS NULL OR r.diamond_carat_range = p_carat_range)
    ORDER BY r.diamond_stone_type, r.diamond_shape_id, r.diamond_carat_range,
             r.diamond_color, r.diamond_clarity,
             r.diamond_base_price DESC,
             r.diamond_report_no NULLS LAST
  )
  SELECT
    d.id,
    d.diamond_stone_type  AS stone_type,
    d.diamond_shape_id    AS shape_id,
    d.diamond_carat_range AS carat_range,
    d.diamond_carat_value AS carat_value,
    d.diamond_color       AS color,
    d.diamond_clarity     AS clarity,
    d.diamond_base_price  AS base_price,
    NULL::numeric         AS custom_price,
    true                  AS is_enabled,
    COUNT(*) OVER ()::bigint AS total_count,
    d.id                  AS pool_id,
    d.diamond_report_no   AS report_no
  FROM deduped d
  ORDER BY d.diamond_stone_type, d.diamond_base_price DESC, d.diamond_color, d.diamond_clarity
  LIMIT p_page_size OFFSET p_offset;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_diamond_pool_filter_count(p_filter jsonb)
RETURNS bigint
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
  v_price_min_natural numeric; v_price_max_natural numeric;
  v_price_min_lab     numeric; v_price_max_lab     numeric;
  v_count bigint;
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
  v_carat_min         := NULLIF(p_filter->>'caratMin','')::numeric;
  v_carat_max         := NULLIF(p_filter->>'caratMax','')::numeric;
  SELECT ARRAY(SELECT (jsonb_array_elements_text(p_filter->'caratRanges'))::numeric) INTO v_carat_ranges;
  v_len_min           := NULLIF(p_filter->>'lengthMin','')::numeric;
  v_len_max           := NULLIF(p_filter->>'lengthMax','')::numeric;
  v_canadian          := COALESCE((p_filter->>'canadianOnly')::boolean, false);
  v_price_min_natural := NULLIF(p_filter->>'priceMinNatural','')::numeric;
  v_price_max_natural := NULLIF(p_filter->>'priceMaxNatural','')::numeric;
  v_price_min_lab     := NULLIF(p_filter->>'priceMinLab','')::numeric;
  v_price_max_lab     := NULLIF(p_filter->>'priceMaxLab','')::numeric;

  SELECT COUNT(*) INTO v_count
  FROM public.diamond_inventory_pool p
  WHERE
    (COALESCE(array_length(v_stone,1),0)  = 0 OR (CASE WHEN LOWER(COALESCE(p.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
    AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
    AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,''))  = ANY(v_colors))
    AND (COALESCE(array_length(v_clar,1),0)   = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
    AND (COALESCE(array_length(v_cuts,1),0)   = 0 OR UPPER(COALESCE(p.cut,''))  = ANY(v_cuts))
    AND (COALESCE(array_length(v_pol,1),0)    = 0 OR UPPER(COALESCE(p.pol,''))  = ANY(v_pol))
    AND (COALESCE(array_length(v_symm,1),0)   = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
    AND (COALESCE(array_length(v_flo,1),0)    = 0 OR UPPER(COALESCE(p.flo,''))  = ANY(v_flo))
    AND (COALESCE(array_length(v_labs,1),0)   = 0 OR UPPER(COALESCE(p.lab,''))  = ANY(v_labs))
    AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
    AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
    AND (COALESCE(array_length(v_carat_ranges,1),0) = 0 OR (FLOOR(COALESCE(p.carats,0) * 2) / 2) = ANY(v_carat_ranges))
    AND (v_len_min   IS NULL OR COALESCE(p.length,0) >= v_len_min)
    AND (v_len_max   IS NULL OR COALESCE(p.length,0) <= v_len_max)
    AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
    AND (
      (LOWER(COALESCE(p.lg,'')) <> 'lab'
       AND (v_price_min_natural IS NULL OR COALESCE(p.price,0) >= v_price_min_natural)
       AND (v_price_max_natural IS NULL OR COALESCE(p.price,0) <= v_price_max_natural))
      OR
      (LOWER(COALESCE(p.lg,'')) = 'lab'
       AND (v_price_min_lab IS NULL OR COALESCE(p.price,0) >= v_price_min_lab)
       AND (v_price_max_lab IS NULL OR COALESCE(p.price,0) <= v_price_max_lab))
    );

  RETURN v_count;
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_diamond_pool_preview(
  p_filter jsonb,
  p_markup_natural numeric DEFAULT 0,
  p_markup_lab numeric DEFAULT 0,
  p_page_size integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, stone_type text, shape_id text, carat_range text, carat_value numeric,
  color text, clarity text, base_price numeric, custom_price numeric,
  is_enabled boolean, total_count bigint
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
  v_price_min_natural numeric; v_price_max_natural numeric;
  v_price_min_lab     numeric; v_price_max_lab     numeric;
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
  v_carat_min         := NULLIF(p_filter->>'caratMin','')::numeric;
  v_carat_max         := NULLIF(p_filter->>'caratMax','')::numeric;
  SELECT ARRAY(SELECT (jsonb_array_elements_text(p_filter->'caratRanges'))::numeric) INTO v_carat_ranges;
  v_len_min           := NULLIF(p_filter->>'lengthMin','')::numeric;
  v_len_max           := NULLIF(p_filter->>'lengthMax','')::numeric;
  v_canadian          := COALESCE((p_filter->>'canadianOnly')::boolean, false);
  v_price_min_natural := NULLIF(p_filter->>'priceMinNatural','')::numeric;
  v_price_max_natural := NULLIF(p_filter->>'priceMaxNatural','')::numeric;
  v_price_min_lab     := NULLIF(p_filter->>'priceMinLab','')::numeric;
  v_price_max_lab     := NULLIF(p_filter->>'priceMaxLab','')::numeric;

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
     AND NOT v_canadian
     AND v_price_min_natural IS NULL AND v_price_max_natural IS NULL
     AND v_price_min_lab IS NULL AND v_price_max_lab IS NULL;

  IF v_no_filter THEN
    SELECT COUNT(*)::bigint INTO v_total FROM public.diamond_inventory_pool;
    RETURN QUERY
    SELECT
      pg.id,
      (CASE WHEN LOWER(COALESCE(pg.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END)::text,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(pg.shape,''),'\s+',' ','g'),' ',1))::text,
      (TRIM(TO_CHAR(FLOOR(COALESCE(pg.carats,0) * 2) / 2, 'FM0.00')) || '-' ||
        TRIM(TO_CHAR(FLOOR(COALESCE(pg.carats,0) * 2) / 2 + 0.49, 'FM0.00')))::text,
      pg.carats,
      UPPER(COALESCE(pg.col,''))::text,
      UPPER(COALESCE(pg.clar,''))::text,
      ROUND(
        COALESCE(pg.price,0) *
        (1 + (CASE WHEN LOWER(COALESCE(pg.lg,'')) = 'lab' THEN p_markup_lab ELSE p_markup_natural END) / 100.0)
      , 2),
      NULL::numeric,
      true,
      v_total
    FROM public.diamond_inventory_pool pg
    ORDER BY pg.id
    LIMIT p_page_size OFFSET p_offset;
    RETURN;
  END IF;

  RETURN QUERY
  WITH filtered AS MATERIALIZED (
    SELECT p.id AS pid
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
      AND (
        (LOWER(COALESCE(p.lg,'')) <> 'lab'
         AND (v_price_min_natural IS NULL OR COALESCE(p.price,0) >= v_price_min_natural)
         AND (v_price_max_natural IS NULL OR COALESCE(p.price,0) <= v_price_max_natural))
        OR
        (LOWER(COALESCE(p.lg,'')) = 'lab'
         AND (v_price_min_lab IS NULL OR COALESCE(p.price,0) >= v_price_min_lab)
         AND (v_price_max_lab IS NULL OR COALESCE(p.price,0) <= v_price_max_lab))
      )
  ),
  cnt AS (SELECT COUNT(*)::bigint AS c FROM filtered),
  page AS (
    SELECT f.pid FROM filtered f ORDER BY f.pid LIMIT p_page_size OFFSET p_offset
  )
  SELECT
    d.id,
    (CASE WHEN LOWER(COALESCE(d.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END)::text,
    LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(d.shape,''),'\s+',' ','g'),' ',1))::text,
    (TRIM(TO_CHAR(FLOOR(COALESCE(d.carats,0) * 2) / 2, 'FM0.00')) || '-' ||
      TRIM(TO_CHAR(FLOOR(COALESCE(d.carats,0) * 2) / 2 + 0.49, 'FM0.00')))::text,
    d.carats,
    UPPER(COALESCE(d.col,''))::text,
    UPPER(COALESCE(d.clar,''))::text,
    ROUND(
      COALESCE(d.price,0) *
      (1 + (CASE WHEN LOWER(COALESCE(d.lg,'')) = 'lab' THEN p_markup_lab ELSE p_markup_natural END) / 100.0)
    , 2),
    NULL::numeric,
    true,
    (SELECT c FROM cnt)
  FROM page pg
  JOIN public.diamond_inventory_pool d ON d.id = pg.pid
  ORDER BY d.id;
END;
$function$;