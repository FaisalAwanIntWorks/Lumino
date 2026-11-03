-- Copied from drizzle/migrations/0007_diamond_group_reps_cache_fast_rpc.sql (applied directly to the source database, missing from supabase/migrations).
-- Sub-second diamond presets: cache the cheapest healthy representative per
-- (stone_type, shape, carat bucket, color, clarity) group in a materialized
-- view, refreshed nightly after the grade stats. The RPC's common path reads
-- only this small table (~7k rows) and applies client markup/filters on the
-- fly. If a client ever uses the rare attribute filters (cut/polish/symmetry/
-- fluorescence/labs/length/canadian), the RPC falls back to the full live
-- computation so results stay correct.

CREATE MATERIALIZED VIEW IF NOT EXISTS public.diamond_pool_group_reps AS
WITH norm AS (
  SELECT
    p.id,
    CASE WHEN LOWER(COALESCE(p.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END   AS stone_type,
    LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
    FLOOR(COALESCE(p.carats,0)::float8 * 2) / 2                                 AS carat_bucket,
    UPPER(COALESCE(p.col,''))                                                   AS color,
    UPPER(COALESCE(p.clar,''))                                                  AS clarity,
    p.carats                                                                    AS carat_value,
    p.price                                                                     AS raw_price,
    p.report_no,
    COALESCE(p.price,0)::float8 / NULLIF(p.carats,0)::float8                    AS ppc
  FROM public.diamond_inventory_pool p
  WHERE p.price > 0 AND p.carats > 0
),
healthy AS (
  SELECT n.*
  FROM norm n
  LEFT JOIN public.diamond_pool_grade_stats s
    ON  s.stone_type   = n.stone_type
    AND s.shape_id     = n.shape_id
    AND s.carat_bucket::float8 = n.carat_bucket
    AND s.color        = n.color
    AND s.clarity      = n.clarity
  WHERE s.median_ppc IS NULL
     OR s.group_size < 4
     OR n.ppc IS NULL
     OR n.ppc <= s.median_ppc * 3
)
SELECT DISTINCT ON (stone_type, shape_id, carat_bucket, color, clarity)
  id, stone_type, shape_id, carat_bucket, carat_value, color, clarity, raw_price, report_no
FROM healthy
ORDER BY stone_type, shape_id, carat_bucket, color, clarity,
         raw_price ASC, report_no NULLS LAST;

CREATE UNIQUE INDEX IF NOT EXISTS idx_diamond_pool_group_reps_pk
  ON public.diamond_pool_group_reps (stone_type, shape_id, carat_bucket, color, clarity);

GRANT SELECT ON public.diamond_pool_group_reps TO anon, authenticated, service_role;

-- Nightly refresh, right after the grade stats refresh (03:15).
SELECT cron.schedule(
  'refresh-diamond-group-reps',
  '20 3 * * *',
  'REFRESH MATERIALIZED VIEW CONCURRENTLY public.diamond_pool_group_reps;'
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
  v_req_bucket float8;
  v_has_rare_filters boolean;
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

  -- ── Parse the client filter ───────────────────────────────────────────────
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
  -- Requested carat bucket parsed once (label format "3.00-3.49").
  v_req_bucket        := NULLIF(SPLIT_PART(COALESCE(p_carat_range,''), '-', 1), '')::float8;

  -- Rare attribute filters are not carried by the cached representatives —
  -- when any are in use, take the full live path below so results stay exact.
  v_has_rare_filters :=
       COALESCE(array_length(v_cuts,1),0) > 0
    OR COALESCE(array_length(v_pol,1),0)  > 0
    OR COALESCE(array_length(v_symm,1),0) > 0
    OR COALESCE(array_length(v_flo,1),0)  > 0
    OR COALESCE(array_length(v_labs,1),0) > 0
    OR v_len_min IS NOT NULL OR v_len_max IS NOT NULL
    OR v_canadian;

  -- ── Fast path: cached group representatives (~7k rows total) ──────────────
  IF NOT v_has_rare_filters THEN
    RETURN QUERY
    WITH cand AS (
      SELECT
        r.id,
        r.stone_type,
        r.shape_id,
        r.carat_bucket,
        TRIM(TO_CHAR(r.carat_bucket, 'FM0.00')) || '-' || TRIM(TO_CHAR(r.carat_bucket + 0.49, 'FM0.00')) AS carat_range_lbl,
        r.carat_value,
        r.color,
        r.clarity,
        ROUND(
          r.raw_price *
          (1 + (CASE WHEN r.stone_type = 'lab'
                     THEN v_filter_row.markup_lab
                     ELSE v_filter_row.markup_natural END) / 100.0)
        , 2) AS rep_price,
        r.report_no
      FROM public.diamond_pool_group_reps r
      WHERE (v_req_bucket IS NULL OR r.carat_bucket = v_req_bucket)
        AND (COALESCE(array_length(v_stone,1),0)  = 0 OR r.stone_type = ANY(v_stone))
        AND (COALESCE(array_length(v_shapes,1),0) = 0 OR r.shape_id   = ANY(v_shapes))
        AND (COALESCE(array_length(v_colors,1),0) = 0 OR r.color      = ANY(v_colors))
        AND (COALESCE(array_length(v_clar,1),0)   = 0 OR r.clarity    = ANY(v_clar))
        AND (v_carat_min IS NULL OR r.carat_value >= v_carat_min)
        AND (v_carat_max IS NULL OR r.carat_value <= v_carat_max)
        AND (COALESCE(array_length(v_carat_ranges,1),0) = 0 OR r.carat_bucket::numeric = ANY(v_carat_ranges))
        AND (
          (r.stone_type <> 'lab'
           AND (v_price_min_natural IS NULL OR r.raw_price >= v_price_min_natural)
           AND (v_price_max_natural IS NULL OR r.raw_price <= v_price_max_natural))
          OR
          (r.stone_type = 'lab'
           AND (v_price_min_lab IS NULL OR r.raw_price >= v_price_min_lab)
           AND (v_price_max_lab IS NULL OR r.raw_price <= v_price_max_lab))
        )
        AND (p_stone_type  IS NULL OR r.stone_type = LOWER(p_stone_type))
        AND (p_shape_id    IS NULL OR r.shape_id   = LOWER(p_shape_id))
        AND (p_color       IS NULL OR r.color      = UPPER(p_color))
        AND (p_clarity     IS NULL OR r.clarity    = UPPER(p_clarity))
    ),
    graded AS (
      SELECT
        c.*,
        CASE c.color
          WHEN 'D' THEN 1 WHEN '$q$ THEN 2 WHEN $q$F' THEN 3 WHEN 'G' THEN 4
          WHEN 'H' THEN 5 WHEN 'I' THEN 6 WHEN 'J' THEN 7 WHEN 'K' THEN 8
          WHEN 'L' THEN 9 WHEN 'M' THEN 10 WHEN 'N' THEN 11 WHEN 'O' THEN 12
          WHEN 'P' THEN 13 WHEN 'Q' THEN 14 WHEN 'R' THEN 15 WHEN 'S' THEN 16
          WHEN 'T' THEN 17 WHEN 'U' THEN 18 WHEN 'V' THEN 19 WHEN 'W' THEN 20
          WHEN 'X' THEN 21 WHEN 'Y' THEN 22 WHEN 'Z' THEN 23
          ELSE 90
        END AS color_rank,
        CASE c.clarity
          WHEN 'FL'  THEN 1 WHEN 'IF'  THEN 2
          WHEN 'VVS1' THEN 3 WHEN 'VVS2' THEN 4
          WHEN 'VS1'  THEN 5 WHEN 'VS2'  THEN 6
          WHEN 'SI1'  THEN 7 WHEN 'SI2'  THEN 8 WHEN 'SI3' THEN 9
          WHEN 'I1'   THEN 10 WHEN 'I2'  THEN 11 WHEN 'I3' THEN 12
          ELSE 90
        END AS clarity_rank
      FROM cand c
    ),
    -- Quality-coherence guard: within (colour, carat range), price must not
    -- drop as clarity improves.
    coherent AS (
      SELECT g.*
      FROM (
        SELECT
          g.*,
          MIN(g.rep_price) OVER (
            PARTITION BY g.stone_type, g.shape_id, g.carat_bucket, g.color
            ORDER BY g.clarity_rank
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ) AS lower_clarity_min_price
        FROM graded g
      ) g
      WHERE g.lower_clarity_min_price IS NULL
         OR g.rep_price >= g.lower_clarity_min_price
    ),
    -- Group-first limiting: cap (colour, clarity) groups per stone type,
    -- best grades first.
    capped AS (
      SELECT
        ch.*,
        ROW_NUMBER() OVER (
          PARTITION BY ch.stone_type
          ORDER BY ch.color_rank ASC, ch.clarity_rank ASC, ch.rep_price ASC
        ) AS type_rank
      FROM coherent ch
    )
    SELECT
      cp.id,
      cp.stone_type,
      cp.shape_id,
      cp.carat_range_lbl  AS carat_range,
      cp.carat_value,
      cp.color,
      cp.clarity,
      cp.rep_price        AS base_price,
      NULL::numeric       AS custom_price,
      true                AS is_enabled,
      COUNT(*) OVER ()::bigint AS total_count,
      cp.id               AS pool_id,
      cp.report_no
    FROM capped cp
    WHERE v_limit_per_type IS NULL OR cp.type_rank <= v_limit_per_type
    ORDER BY cp.stone_type, cp.rep_price * v_sort_dir ASC, cp.color_rank, cp.clarity_rank
    LIMIT p_page_size OFFSET p_offset;
    RETURN;
  END IF;

  -- ── Full live path (rare attribute filters in use) ────────────────────────
  RETURN QUERY
  WITH base AS MATERIALIZED (
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
      FLOOR(COALESCE(p.carats,0)::float8 * 2) / 2                                      AS diamond_carat_bucket,
      p.report_no                                                                       AS diamond_report_no,
      COALESCE(p.price,0)::float8 / NULLIF(p.carats,0)::float8                          AS price_per_carat
    FROM public.diamond_inventory_pool p
    WHERE
      (p_shape_id   IS NULL OR LOWER(COALESCE(p.shape,'')) LIKE LOWER(p_shape_id) || '%')
      AND (v_req_bucket IS NULL OR FLOOR(COALESCE(p.carats,0)::float8 * 2) / 2 = v_req_bucket)
      AND (COALESCE(array_length(v_stone,1),0)  = 0 OR (CASE WHEN LOWER(COALESCE(p.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
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
      AND (COALESCE(array_length(v_carat_ranges,1),0) = 0 OR (FLOOR(COALESCE(p.carats,0)::float8 * 2) / 2)::numeric = ANY(v_carat_ranges))
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
  narrowed AS (
    SELECT * FROM base b
    WHERE (p_stone_type  IS NULL OR b.diamond_stone_type = LOWER(p_stone_type))
      AND (p_shape_id    IS NULL OR b.diamond_shape_id   = LOWER(p_shape_id))
      AND (p_color       IS NULL OR b.diamond_color       = UPPER(p_color))
      AND (p_clarity     IS NULL OR b.diamond_clarity     = UPPER(p_clarity))
  ),
  healthy AS MATERIALIZED (
    SELECT n.*
    FROM narrowed n
    LEFT JOIN public.diamond_pool_grade_stats s
      ON  s.stone_type   = n.diamond_stone_type
      AND s.shape_id     = n.diamond_shape_id
      AND s.carat_bucket::float8 = n.diamond_carat_bucket
      AND s.color        = n.diamond_color
      AND s.clarity      = n.diamond_clarity
    WHERE s.median_ppc IS NULL
       OR s.group_size < 4
       OR n.price_per_carat IS NULL
       OR n.price_per_carat <= s.median_ppc * 3
  ),
  group_min AS (
    SELECT
      h.diamond_stone_type, h.diamond_shape_id, h.diamond_carat_bucket,
      h.diamond_color, h.diamond_clarity,
      MIN(h.diamond_base_price) AS min_price
    FROM healthy h
    GROUP BY 1, 2, 3, 4, 5
  ),
  deduped AS (
    SELECT DISTINCT ON (h.diamond_stone_type, h.diamond_shape_id, h.diamond_carat_bucket, h.diamond_color, h.diamond_clarity)
      h.id,
      h.diamond_stone_type,
      h.diamond_shape_id,
      h.diamond_carat_bucket,
      h.diamond_carat_value,
      h.diamond_color,
      h.diamond_clarity,
      h.diamond_base_price,
      h.diamond_report_no
    FROM healthy h
    JOIN group_min gm
      ON  gm.diamond_stone_type  = h.diamond_stone_type
      AND gm.diamond_shape_id    = h.diamond_shape_id
      AND gm.diamond_carat_bucket = h.diamond_carat_bucket
      AND gm.diamond_color       = h.diamond_color
      AND gm.diamond_clarity     = h.diamond_clarity
      AND h.diamond_base_price   = gm.min_price
    ORDER BY h.diamond_stone_type, h.diamond_shape_id, h.diamond_carat_bucket,
             h.diamond_color, h.diamond_clarity,
             h.diamond_report_no NULLS LAST
  ),
  graded AS (
    SELECT
      d.*,
      TRIM(TO_CHAR(d.diamond_carat_bucket, 'FM0.00')) || '-' || TRIM(TO_CHAR(d.diamond_carat_bucket + 0.49, 'FM0.00')) AS diamond_carat_range,
      CASE d.diamond_color
        WHEN 'D' THEN 1 WHEN '$q$ THEN 2 WHEN $q$F' THEN 3 WHEN 'G' THEN 4
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
  coherent AS (
    SELECT g.*
    FROM (
      SELECT
        g.*,
        MIN(g.diamond_base_price) OVER (
          PARTITION BY g.diamond_stone_type, g.diamond_shape_id,
                       g.diamond_carat_bucket, g.diamond_color
          ORDER BY g.clarity_rank
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS lower_clarity_min_price
      FROM graded g
    ) g
    WHERE g.lower_clarity_min_price IS NULL
       OR g.diamond_base_price >= g.lower_clarity_min_price
  ),
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

ALTER FUNCTION public.get_diamond_presets_filtered(uuid,text,text,text,text,text,integer,integer) SET work_mem = '256MB';

GRANT EXECUTE ON FUNCTION public.get_diamond_presets_filtered(uuid,text,text,text,text,text,integer,integer) TO anon, authenticated, service_role;