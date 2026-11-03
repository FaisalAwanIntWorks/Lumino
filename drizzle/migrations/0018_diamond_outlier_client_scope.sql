-- ============================================================================
-- Diamond Outlier Engine: per-client live scope (28 Sep 2026)
--
-- Why
--   Switching shadow mode off used to apply the engine to EVERY client account.
--   We want to go live on one account first: the admin "Sandbox" client
--   (JewlX, dcd952fc-783b-4a92-be7f-62751265c650). Every other client must keep
--   today's picks until we decide to roll out to all.
--
-- What changes
--   1. diamond_outlier_config gets
--        live_scope      'allowlist' (default) | 'all'
--        live_client_ids uuid[]   (default: the Sandbox client)
--      The engine is applied for a client only when
--        shadow_mode = false AND (live_scope = 'all' OR client in live_client_ids).
--      Helper: diamond_engine_live_for(client_id).
--   2. Two representative views, both always up to date:
--        diamond_pool_group_reps         today's pick (3x rule only, no engine)
--        diamond_pool_group_reps_engine  engine pick (cheap excluded, fallback tier)
--      Neither depends on shadow mode any more; the widget RPC chooses per client.
--   3. get_diamond_presets_filtered: v_shadow is now per client, and the fast
--      path reads the view that matches. The live path already used v_shadow.
--   4. diamond_pipeline_tick refreshes the third view too.
--   5. Admin RPCs: overview lists the in-scope clients by name; the config RPC
--      accepts live_scope / live_client_ids.
--   Scoring, thresholds, flags, rep-change report: untouched. No re-score needed.
--
-- Rolling out to everyone later is one statement:
--   UPDATE public.diamond_outlier_config SET live_scope = 'all' WHERE id = 1;
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Config: who the engine is live for
-- ----------------------------------------------------------------------------
ALTER TABLE public.diamond_outlier_config
  ADD COLUMN IF NOT EXISTS live_scope text NOT NULL DEFAULT 'allowlist',
  ADD COLUMN IF NOT EXISTS live_client_ids uuid[] NOT NULL
      DEFAULT ARRAY['dcd952fc-783b-4a92-be7f-62751265c650']::uuid[];
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diamond_outlier_config_live_scope_check') THEN
    ALTER TABLE public.diamond_outlier_config
      ADD CONSTRAINT diamond_outlier_config_live_scope_check
      CHECK (live_scope IN ('allowlist', 'all'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.diamond_engine_live_for(p_client_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT NOT c.shadow_mode
           AND (c.live_scope = 'all'
                OR (p_client_id IS NOT NULL AND p_client_id = ANY (c.live_client_ids)))
    FROM public.diamond_outlier_config c
    WHERE c.id = 1
  ), false)
$$;
REVOKE ALL ON FUNCTION public.diamond_engine_live_for(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.diamond_engine_live_for(uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- 2. Representative views
-- ----------------------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS public.diamond_pool_group_reps_engine;
DROP MATERIALIZED VIEW IF EXISTS public.diamond_pool_group_reps;

CREATE MATERIALIZED VIEW public.diamond_pool_group_reps AS
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
  -- Today's pick (3x rule only). The outlier engine is NOT consulted here:
  -- clients outside the engine's live scope always read this view.
  SELECT n.*
  FROM norm n
  LEFT JOIN public.diamond_pool_grade_stats s
    ON  s.stone_type   = n.stone_type
    AND s.shape_id     = n.shape_id
    AND s.carat_bucket::float8 = n.carat_bucket
    AND s.color        = n.color
    AND s.clarity      = n.clarity
  WHERE (s.median_ppc IS NULL
      OR s.group_size < 4
      OR n.ppc IS NULL
      OR n.ppc <= s.median_ppc * 3)
)
SELECT DISTINCT ON (stone_type, shape_id, carat_bucket, color, clarity)
  id, stone_type, shape_id, carat_bucket, carat_value, color, clarity, raw_price, report_no
FROM healthy
ORDER BY stone_type, shape_id, carat_bucket, color, clarity,
         raw_price ASC, report_no NULLS LAST;

CREATE UNIQUE INDEX IF NOT EXISTS idx_diamond_pool_group_reps_pk
  ON public.diamond_pool_group_reps (stone_type, shape_id, carat_bucket, color, clarity);
GRANT SELECT ON public.diamond_pool_group_reps TO anon, authenticated, service_role;

CREATE MATERIALIZED VIEW public.diamond_pool_group_reps_engine AS
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
  -- Engine pick. Cheap-flagged stones are excluded; stones blocked only as
  -- expensive stay as a fallback tier (picked only when nothing clean is left).
  -- No shadow / scope logic here: the RPC decides which client reads this view.
  SELECT n.*,
         CASE WHEN NOT COALESCE(sc.blocked, false) THEN 0 ELSE 1 END AS pick_tier
  FROM norm n
  LEFT JOIN public.diamond_pool_grade_stats s
    ON  s.stone_type   = n.stone_type
    AND s.shape_id     = n.shape_id
    AND s.carat_bucket::float8 = n.carat_bucket
    AND s.color        = n.color
    AND s.clarity      = n.clarity
  LEFT JOIN public.diamond_pool_scores sc
    ON  sc.pool_id = n.id
  WHERE (s.median_ppc IS NULL
      OR s.group_size < 4
      OR n.ppc IS NULL
      OR n.ppc <= s.median_ppc * 3)
    AND NOT COALESCE(sc.is_cheap, false)
)
SELECT DISTINCT ON (stone_type, shape_id, carat_bucket, color, clarity)
  id, stone_type, shape_id, carat_bucket, carat_value, color, clarity, raw_price, report_no
FROM healthy
ORDER BY stone_type, shape_id, carat_bucket, color, clarity,
         pick_tier ASC, raw_price ASC, report_no NULLS LAST;

CREATE UNIQUE INDEX IF NOT EXISTS idx_diamond_pool_group_reps_engine_pk
  ON public.diamond_pool_group_reps_engine (stone_type, shape_id, carat_bucket, color, clarity);
GRANT SELECT ON public.diamond_pool_group_reps_engine TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Pipeline tick: refresh all three views after each scoring run
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.diamond_pipeline_tick()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  st        public.diamond_pipeline_state%ROWTYPE;
  cfg       public.diamond_outlier_config%ROWTYPE;
  v_run     uuid;
  v_mode    text := 'concurrent';
BEGIN
  SELECT * INTO st  FROM public.diamond_pipeline_state WHERE id = 1;
  SELECT * INTO cfg FROM public.diamond_outlier_config WHERE id = 1;
  IF NOT FOUND OR st.id IS NULL THEN
    RETURN 'not-configured';
  END IF;
  IF NOT st.pending THEN
    RETURN 'idle';
  END IF;
  IF st.last_pool_change_at IS NOT NULL
     AND st.last_pool_change_at > now() - make_interval(mins => GREATEST(cfg.debounce_minutes, 0)) THEN
    RETURN 'debouncing';
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('diamond_pipeline_tick')) THEN
    RETURN 'busy';
  END IF;

  UPDATE public.diamond_pipeline_state
     SET status = 'running', pending = false, last_run_started_at = now(), last_error = NULL, updated_at = now()
   WHERE id = 1;

  BEGIN
    v_run := public.score_diamond_pool('pipeline');

    BEGIN
      REFRESH MATERIALIZED VIEW CONCURRENTLY public.diamond_pool_grade_stats;
      REFRESH MATERIALIZED VIEW CONCURRENTLY public.diamond_pool_group_reps;
      REFRESH MATERIALIZED VIEW CONCURRENTLY public.diamond_pool_group_reps_engine;
    EXCEPTION WHEN OTHERS THEN
      -- Fallback if CONCURRENTLY is refused in this context: plain refresh
      -- (short read lock on the small reps view).
      v_mode := 'plain: ' || SQLERRM;
      REFRESH MATERIALIZED VIEW public.diamond_pool_grade_stats;
      REFRESH MATERIALIZED VIEW public.diamond_pool_group_reps;
      REFRESH MATERIALIZED VIEW public.diamond_pool_group_reps_engine;
    END;

    UPDATE public.diamond_scoring_runs SET refresh_mode = v_mode WHERE id = v_run;
    UPDATE public.diamond_pipeline_state
       SET status = 'idle', last_run_finished_at = now(), last_run_id = v_run, updated_at = now()
     WHERE id = 1;
    RETURN 'ran:' || v_run::text;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.diamond_pipeline_state
       SET status = 'error', last_error = SQLERRM, last_run_finished_at = now(), updated_at = now()
     WHERE id = 1;
    UPDATE public.diamond_scoring_runs
       SET status = 'error', error = SQLERRM, finished_at = now()
     WHERE status = 'running';
    RETURN 'error:' || SQLERRM;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.diamond_pipeline_tick() FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- 4. Widget RPC: engine applied per client. Body otherwise identical to
--    20260925180000.
-- ----------------------------------------------------------------------------
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
  v_shadow boolean;
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
  -- Outlier engine: flags are applied only when shadow mode is off AND this
  -- client is inside the engine's live scope (allow-list, or 'all'). For every
  -- other client v_shadow stays true and the result is today's pick.
  v_shadow            := NOT public.diamond_engine_live_for(p_client_id);

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
      FROM (
        SELECT g.id, g.stone_type, g.shape_id, g.carat_bucket, g.carat_value, g.color, g.clarity, g.raw_price, g.report_no
        FROM public.diamond_pool_group_reps g
        WHERE v_shadow
        UNION ALL
        SELECT e.id, e.stone_type, e.shape_id, e.carat_bucket, e.carat_value, e.color, e.clarity, e.raw_price, e.report_no
        FROM public.diamond_pool_group_reps_engine e
        WHERE NOT v_shadow
      ) r
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
          WHEN 'D' THEN 1 WHEN 'E' THEN 2 WHEN 'F' THEN 3 WHEN 'G' THEN 4
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
    -- Cheap-flagged stones excluded (unless shadow mode); expensive-only blocked
    -- stones stay as a fallback tier (pick_tier 1), used only when nothing clean
    -- is left on the shelf. Mirrors diamond_pool_group_reps.
    SELECT n.*,
           CASE WHEN v_shadow OR NOT COALESCE(sc.blocked, false) THEN 0 ELSE 1 END AS pick_tier
    FROM narrowed n
    LEFT JOIN public.diamond_pool_grade_stats s
      ON  s.stone_type   = n.diamond_stone_type
      AND s.shape_id     = n.diamond_shape_id
      AND s.carat_bucket::float8 = n.diamond_carat_bucket
      AND s.color        = n.diamond_color
      AND s.clarity      = n.diamond_clarity
    LEFT JOIN public.diamond_pool_scores sc
      ON  sc.pool_id = n.id
    WHERE (s.median_ppc IS NULL
        OR s.group_size < 4
        OR n.price_per_carat IS NULL
        OR n.price_per_carat <= s.median_ppc * 3)
      AND (v_shadow OR NOT COALESCE(sc.is_cheap, false))
  ),
  group_min AS (
    SELECT DISTINCT ON (h.diamond_stone_type, h.diamond_shape_id, h.diamond_carat_bucket, h.diamond_color, h.diamond_clarity)
      h.diamond_stone_type, h.diamond_shape_id, h.diamond_carat_bucket,
      h.diamond_color, h.diamond_clarity,
      h.pick_tier          AS min_tier,
      h.diamond_base_price AS min_price
    FROM healthy h
    ORDER BY h.diamond_stone_type, h.diamond_shape_id, h.diamond_carat_bucket, h.diamond_color, h.diamond_clarity,
             h.pick_tier ASC, h.diamond_base_price ASC
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
      AND h.pick_tier            = gm.min_tier
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
        PARTITION BY ch.stone_type
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

-- ----------------------------------------------------------------------------
-- 5. Admin RPCs
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_diamond_outlier_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM public._diamond_outlier_require_admin(false);
  SELECT jsonb_build_object(
    'config',   (SELECT to_jsonb(c) FROM public.diamond_outlier_config c WHERE c.id = 1),
    -- Clients the engine is applied to once shadow mode is switched off
    -- (only meaningful while live_scope = 'allowlist').
    'live_clients', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', cl.id, 'company_name', cl.company_name)
                                               ORDER BY cl.company_name), '[]'::jsonb)
                     FROM public.clients cl
                     WHERE cl.id = ANY (COALESCE((SELECT c.live_client_ids FROM public.diamond_outlier_config c WHERE c.id = 1),
                                                 ARRAY[]::uuid[]))),
    'state',    (SELECT to_jsonb(s) FROM public.diamond_pipeline_state s WHERE s.id = 1),
    'running',  EXISTS (SELECT 1 FROM pg_stat_activity a
                        WHERE a.state = 'active' AND a.pid <> pg_backend_pid()
                          AND a.query ILIKE '%diamond_pipeline_tick%'),
    'last_run', (SELECT to_jsonb(r) FROM public.diamond_scoring_runs r ORDER BY r.started_at DESC LIMIT 1),
    'runs',     (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.started_at DESC), '[]'::jsonb)
                 FROM (SELECT * FROM public.diamond_scoring_runs ORDER BY started_at DESC LIMIT 10) r),
    'pool_rows', (SELECT count(*) FROM public.diamond_inventory_pool),
    'scored_rows', (SELECT count(*) FROM public.diamond_pool_scores),
    'blocked_by_type', (SELECT COALESCE(jsonb_object_agg(q.stone_type, q.cnt), '{}'::jsonb)
                        FROM (SELECT stone_type, count(*) AS cnt FROM public.diamond_pool_scores WHERE blocked GROUP BY stone_type) q),
    'rep_changes', (SELECT count(*) FROM public.diamond_pool_rep_changes),
    'shelves_hidden', (SELECT count(*) FROM public.diamond_pool_rep_changes WHERE shelf_hidden),
    -- Shelves where every stone is blocked for any reason. Under the old rule
    -- these were all hidden; now only the cheap ones are. The difference is
    -- what the expensive-side fallback keeps visible.
    'shelves_all_blocked', (SELECT count(*) FROM (
                              SELECT 1 FROM public.diamond_pool_scores
                              GROUP BY stone_type, shape_id, carat_bucket, color, clarity
                              HAVING bool_and(blocked)) q),
    -- Hidden shelves that carry no cheap flag at all. By construction this is
    -- 0 after the fix; it is exposed so the panel can prove it.
    'shelves_hidden_expensive_only', (SELECT count(*)
                              FROM public.diamond_pool_rep_changes r
                              WHERE r.shelf_hidden
                                AND NOT EXISTS (
                                  SELECT 1 FROM public.diamond_pool_scores s
                                  WHERE s.stone_type = r.stone_type AND s.shape_id = r.shape_id
                                    AND s.carat_bucket = r.carat_bucket AND s.color = r.color
                                    AND s.clarity = r.clarity AND s.is_cheap))
  ) INTO v;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_diamond_outlier_config(p_patch jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.diamond_outlier_config%ROWTYPE;
BEGIN
  PERFORM public._diamond_outlier_require_admin(true);
  UPDATE public.diamond_outlier_config SET
    shadow_mode      = COALESCE((p_patch->>'shadow_mode')::boolean, shadow_mode),
    mode             = COALESCE(p_patch->>'mode', mode),
    dear_mode        = COALESCE(p_patch->>'dear_mode', dear_mode),
    live_scope       = COALESCE(p_patch->>'live_scope', live_scope),
    live_client_ids  = CASE WHEN p_patch ? 'live_client_ids'
                            THEN ARRAY(SELECT jsonb_array_elements_text(p_patch->'live_client_ids'))::uuid[]
                            ELSE live_client_ids END,
    cheap_z          = COALESCE((p_patch->>'cheap_z')::numeric, cheap_z),
    dear_z           = COALESCE((p_patch->>'dear_z')::numeric, dear_z),
    spread_floor     = COALESCE((p_patch->>'spread_floor')::numeric, spread_floor),
    n_target         = COALESCE((p_patch->>'n_target')::integer, n_target),
    n_min            = COALESCE((p_patch->>'n_min')::integer, n_min),
    emergency_mult   = COALESCE((p_patch->>'emergency_mult')::numeric, emergency_mult),
    debounce_minutes = COALESCE((p_patch->>'debounce_minutes')::integer, debounce_minutes),
    updated_at = now(), updated_by = auth.uid()
  WHERE id = 1
  RETURNING * INTO c;
  -- Any change to the engine parameters is applied by a fresh run.
  IF p_patch ?| ARRAY['mode','dear_mode','cheap_z','dear_z','spread_floor','n_target','n_min','emergency_mult'] THEN
    UPDATE public.diamond_pipeline_state
       SET pending = true, last_pool_change_at = now() - interval '1 day', updated_at = now()
     WHERE id = 1;
  END IF;
  -- Flipping shadow mode or the live scope needs no refresh any more: both
  -- representative views are always kept up to date, and the widget RPC picks
  -- the right one per client at read time.
  RETURN to_jsonb(c);
END;
$$;