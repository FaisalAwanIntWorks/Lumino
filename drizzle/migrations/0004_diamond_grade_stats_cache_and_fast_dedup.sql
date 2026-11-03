-- Performance overhaul for get_diamond_presets_filtered on un-narrowed calls
-- (the widget's useClientDiamondPresets fetches all shapes/buckets at once,
-- which timed out at ~12.7s).
--
-- 1) Materialized view diamond_pool_grade_stats caches the median
--    price-per-carat per (stone_type, shape, carat bucket, color, clarity)
--    grade group. Outlier rejection becomes a cheap lookup instead of a
--    per-request percentile_cont over ~760k rows. Refreshed nightly via
--    pg_cron; rows with no stats (brand-new imports) pass through.
-- 2) Dedup rewritten as hash-aggregate MIN + join-back instead of sorting
--    the entire healthy set in DISTINCT ON.

CREATE MATERIALIZED VIEW public.diamond_pool_grade_stats AS
SELECT
  CASE WHEN LOWER(COALESCE(p.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END   AS stone_type,
  LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
  FLOOR(COALESCE(p.carats,0) * 2) / 2                                        AS carat_bucket,
  UPPER(COALESCE(p.col,''))                                                  AS color,
  UPPER(COALESCE(p.clar,''))                                                 AS clarity,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY COALESCE(p.price,0) / NULLIF(p.carats,0)) AS median_ppc,
  COUNT(*)                                                                   AS group_size,
  now()                                                                      AS refreshed_at
FROM public.diamond_inventory_pool p
WHERE p.carats IS NOT NULL AND p.carats > 0 AND p.price IS NOT NULL AND p.price > 0
GROUP BY 1, 2, 3, 4, 5;

CREATE UNIQUE INDEX diamond_pool_grade_stats_pk
  ON public.diamond_pool_grade_stats (stone_type, shape_id, carat_bucket, color, clarity);

GRANT SELECT ON public.diamond_pool_grade_stats TO anon, authenticated, service_role;

-- Nightly refresh (03:15 UTC), alongside existing maintenance crons.
DO $$
BEGIN
  PERFORM cron.unschedule('refresh-diamond-grade-stats');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'refresh-diamond-grade-stats',
  '15 3 * * *',
  $$REFRESH MATERIALIZED VIEW CONCURRENTLY public.diamond_pool_grade_stats;$$
);

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
  v_price_sort text;
  v_sort_dir   integer;
  v_limit_per_type integer;
BEGIN
  SELECT * INTO v_filter_row
  FROM public.client_diamond_catalog_filter
  WHERE client_id = p_client_id AND is_confirmed = true;

  -- ── Legacy fallback (unchanged) ───────────────────────────────────────────
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

  -- ── Pool path ─────────────────────────────────────────────────────────────
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
  v_price_sort        := COALESCE(v_filter->>'priceSort', 'high_to_low');
  v_sort_dir          := CASE WHEN v_price_sort = 'low_to_high' THEN 1 ELSE -1 END;
  -- Optional per-stone-type display cap. NULL/absent/<=0 means no cap.
  v_limit_per_type    := NULLIF(v_filter->>'limitPerType','')::integer;
  IF v_limit_per_type IS NOT NULL AND v_limit_per_type <= 0 THEN
    v_limit_per_type := NULL;
  END IF;

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
      p.report_no                                                                       AS diamond_report_no,
      COALESCE(p.price,0) / NULLIF(p.carats,0)                                          AS price_per_carat
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
  ranged AS (
    SELECT
      b.*,
      TRIM(TO_CHAR(b.diamond_carat_bucket, 'FM0.00')) || '-' || TRIM(TO_CHAR(b.diamond_carat_bucket + 0.49, 'FM0.00')) AS diamond_carat_range
    FROM base b
  ),
  narrowed AS (
    SELECT * FROM ranged r
    WHERE (p_stone_type  IS NULL OR r.diamond_stone_type = LOWER(p_stone_type))
      AND (p_shape_id    IS NULL OR r.diamond_shape_id   = LOWER(p_shape_id))
      AND (p_color       IS NULL OR r.diamond_color       = UPPER(p_color))
      AND (p_clarity     IS NULL OR r.diamond_clarity     = UPPER(p_clarity))
      AND (p_carat_range IS NULL OR r.diamond_carat_range = p_carat_range)
  ),
  -- Outlier rejection via cached per-grade median (stone_type, shape, bucket,
  -- color, clarity). A listing beyond 3x its own grade's median price-per-
  -- carat is a rogue supplier listing and never reaches the widget. Grades
  -- with < 4 stones or no stats yet (fresh imports) pass through untouched.
  healthy AS (
    SELECT n.*
    FROM narrowed n
    LEFT JOIN public.diamond_pool_grade_stats s
      ON  s.stone_type   = n.diamond_stone_type
      AND s.shape_id     = n.diamond_shape_id
      AND s.carat_bucket = n.diamond_carat_bucket
      AND s.color        = n.diamond_color
      AND s.clarity      = n.diamond_clarity
    WHERE s.median_ppc IS NULL
       OR s.group_size < 4
       OR n.price_per_carat IS NULL
       OR n.price_per_carat <= s.median_ppc * 3
  ),
  -- Representative selection, fast path: hash-aggregate the minimum price
  -- per (colour, clarity) group, then join back only for the winning rows
  -- instead of sorting the entire healthy set.
  group_min AS (
    SELECT
      h.diamond_stone_type, h.diamond_shape_id, h.diamond_carat_range,
      h.diamond_color, h.diamond_clarity,
      MIN(h.diamond_base_price) AS min_price
    FROM healthy h
    GROUP BY 1, 2, 3, 4, 5
  ),
  deduped AS (
    SELECT DISTINCT ON (h.diamond_stone_type, h.diamond_shape_id, h.diamond_carat_range, h.diamond_color, h.diamond_clarity)
      h.id,
      h.diamond_stone_type,
      h.diamond_shape_id,
      h.diamond_carat_range,
      h.diamond_carat_value,
      h.diamond_color,
      h.diamond_clarity,
      h.diamond_base_price,
      h.diamond_report_no
    FROM healthy h
    JOIN group_min gm
      ON  gm.diamond_stone_type = h.diamond_stone_type
      AND gm.diamond_shape_id   = h.diamond_shape_id
      AND gm.diamond_carat_range = h.diamond_carat_range
      AND gm.diamond_color      = h.diamond_color
      AND gm.diamond_clarity    = h.diamond_clarity
      AND h.diamond_base_price  = gm.min_price
    ORDER BY h.diamond_stone_type, h.diamond_shape_id, h.diamond_carat_range,
             h.diamond_color, h.diamond_clarity,
             h.diamond_report_no NULLS LAST
  ),
  graded AS (
    SELECT
      d.*,
      CASE d.diamond_color
        WHEN 'D' THEN 1 WHEN 'E' THEN 2 WHEN 'F' THEN 3 WHEN 'G' THEN 4
        WHEN 'H' THEN 5 WHEN 'I' THEN 6 WHEN 'J' THEN 7 WHEN 'K' THEN 8
        WHEN 'L' THEN 9 WHEN 'M' THEN 10 WHEN 'N' THEN 11 WHEN 'O' THEN 12
        WHEN 'P' THEN 13 WHEN 'Q' THEN 14 WHEN 'R' THEN 15 WHEN 'S' THEN 16
        WHEN 'T' THEN 17 WHEN 'U' THEN 18 WHEN 'V' THEN 19 WHEN 'W' THEN 20
        WHEN 'X' THEN 21 WHEN 'Y' THEN 22 WHEN 'Z' THEN 23
        ELSE 90
      END AS color_rank,
      CASE d.diamond_clarity
        WHEN 'FL'  THEN 1 WHEN 'IF'  THEN 2
        WHEN 'VVS1' THEN 3 WHEN 'VVS2' THEN 4
        WHEN 'VS1'  THEN 5 WHEN 'VS2'  THEN 6
        WHEN 'SI1'  THEN 7 WHEN 'SI2'  THEN 8 WHEN 'SI3' THEN 9
        WHEN 'I1'   THEN 10 WHEN 'I2'  THEN 11 WHEN 'I3' THEN 12
        ELSE 90
      END AS clarity_rank
    FROM deduped d
  ),
  -- Quality-coherence guard: within (colour, carat range), price must not
  -- drop as clarity improves. A group priced below the cheapest lower
  -- clarity is suppressed rather than shown as a nonsense price.
  coherent AS (
    SELECT g.*
    FROM (
      SELECT
        g.*,
        MIN(g.diamond_base_price) OVER (
          PARTITION BY g.diamond_stone_type, g.diamond_shape_id,
                       g.diamond_carat_range, g.diamond_color
          ORDER BY g.clarity_rank
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS lower_clarity_min_price
      FROM graded g
    ) g
    WHERE g.lower_clarity_min_price IS NULL
       OR g.diamond_base_price >= g.lower_clarity_min_price
  ),
  -- Group-first limiting: cap the number of (colour, clarity) groups per
  -- stone type, best grades first — never a flat price-list row cap.
  capped AS (
    SELECT
      ch.*,
      ROW_NUMBER() OVER (
        PARTITION BY ch.diamond_stone_type
        ORDER BY ch.color_rank ASC, ch.clarity_rank ASC, ch.diamond_base_price ASC
      ) AS type_rank
    FROM coherent ch
  )
  SELECT
    c.id,
    c.diamond_stone_type  AS stone_type,
    c.diamond_shape_id    AS shape_id,
    c.diamond_carat_range AS carat_range,
    c.diamond_carat_value AS carat_value,
    c.diamond_color       AS color,
    c.diamond_clarity     AS clarity,
    c.diamond_base_price  AS base_price,
    NULL::numeric         AS custom_price,
    true                  AS is_enabled,
    COUNT(*) OVER ()::bigint AS total_count,
    c.id                  AS pool_id,
    c.diamond_report_no   AS report_no
  FROM capped c
  WHERE v_limit_per_type IS NULL OR c.type_rank <= v_limit_per_type
  ORDER BY c.diamond_stone_type, c.diamond_base_price * v_sort_dir ASC, c.color_rank, c.clarity_rank
  LIMIT p_page_size OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_diamond_presets_filtered(uuid,text,text,text,text,text,integer,integer) TO anon, authenticated, service_role;