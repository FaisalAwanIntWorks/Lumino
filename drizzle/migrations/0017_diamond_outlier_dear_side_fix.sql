-- ============================================================================
-- Diamond Outlier Engine: expensive-side fix (after the first shadow run, 25 Sep 2026)
-- ============================================================================

-- 1. Config: separate expensive-side rule
ALTER TABLE public.diamond_outlier_config
  ADD COLUMN IF NOT EXISTS dear_mode text NOT NULL DEFAULT 'agree';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diamond_outlier_config_dear_mode_check') THEN
    ALTER TABLE public.diamond_outlier_config
      ADD CONSTRAINT diamond_outlier_config_dear_mode_check
      CHECK (dear_mode IN ('union', 'agree', 'model_only', 'rap_only'));
  END IF;
END $$;

-- 2. Engine: expensive CASE reads dear_mode; rep-changes report uses the
--    fallback tier. Everything else identical to 20260925090000.
CREATE OR REPLACE FUNCTION public.score_diamond_pool(p_trigger text DEFAULT 'manual')
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET work_mem = '256MB' AS $$
DECLARE
  cfg        public.diamond_outlier_config%ROWTYPE;
  v_run      uuid := gen_random_uuid();
  v_t0       timestamptz := clock_timestamp();
  v_t        timestamptz;
  v_timings  jsonb := '{}'::jsonb;
  v_type     text;
  v_lvl      integer;
  v_key      text;
  v_need     integer;
  v_rung     integer;
  v_rap_keys text[];
  v_rap_mins integer[];
  v_n        integer;
  v_pool     integer;
  v_nat      integer := 0;
  v_lab      integer := 0;
BEGIN
  SELECT * INTO cfg FROM public.diamond_outlier_config WHERE id = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'diamond_outlier_config row 1 missing';
  END IF;

  INSERT INTO public.diamond_scoring_runs (id, started_at, status, trigger_source, shadow_mode, config_snapshot)
  VALUES (v_run, v_t0, 'running', p_trigger, cfg.shadow_mode, to_jsonb(cfg));

  DROP TABLE IF EXISTS t_base, t_m, t_fit, t_stat, t_res, t_model, t_rap, t_shelf, t_scores, t_off_c, t_off_q, t_shape_fit;
  CREATE TEMP TABLE t_base (
    pool_id uuid, stone_type text, shape_id text, rshape text, carats double precision, bucket double precision,
    color text, clarity text, lab text, cutq text, flq text, price double precision, ppc double precision,
    disc double precision, lnp double precision, lnc double precision, rband double precision, mband double precision,
    crank integer, qrank integer
  ) ON COMMIT DROP;
  CREATE TEMP TABLE t_m    (pool_id uuid, k text, y double precision, lnc double precision, keep boolean, r double precision) ON COMMIT DROP;
  CREATE TEMP TABLE t_fit  (k text, n_all integer, a double precision, b double precision) ON COMMIT DROP;
  CREATE TEMP TABLE t_stat (k text, rmed double precision, mad double precision, mad_lo double precision, mad_hi double precision) ON COMMIT DROP;
  CREATE TEMP TABLE t_res  (pool_id uuid, k text, dev double precision, mad double precision, mad_lo double precision,
                            mad_hi double precision, n integer, slope double precision, expv double precision) ON COMMIT DROP;
  CREATE TEMP TABLE t_model(pool_id uuid PRIMARY KEY, dev double precision, mad double precision, mad_lo double precision,
                            mad_hi double precision, n integer, lvl text, slope double precision, expv double precision) ON COMMIT DROP;
  CREATE TEMP TABLE t_rap  (pool_id uuid PRIMARY KEY, shape_id text, bucket double precision, color text, clarity text, lab text,
                            cutq text, rshape text, rband double precision, x double precision, dev double precision,
                            mad double precision, mad_lo double precision, mad_hi double precision, n integer,
                            med double precision, rung integer NOT NULL DEFAULT 0) ON COMMIT DROP;
  CREATE TEMP TABLE t_shelf(shape_id text, bucket double precision, color text, clarity text, shelf_n integer, shelf_med double precision) ON COMMIT DROP;
  CREATE TEMP TABLE t_scores (LIKE public.diamond_pool_scores INCLUDING DEFAULTS) ON COMMIT DROP;
  CREATE TEMP TABLE t_shape_fit (shape_id text, a double precision, b double precision) ON COMMIT DROP;
  CREATE TEMP TABLE t_off_c (shape_id text, color text, off double precision) ON COMMIT DROP;
  CREATE TEMP TABLE t_off_q (shape_id text, clarity text, off double precision) ON COMMIT DROP;
  CREATE INDEX ON t_base (shape_id, color, clarity);

  SELECT count(*) INTO v_pool FROM public.diamond_inventory_pool;

  FOREACH v_type IN ARRAY ARRAY['natural', 'lab'] LOOP
    v_t := clock_timestamp();
    TRUNCATE t_base, t_m, t_fit, t_stat, t_res, t_model, t_rap, t_shelf, t_shape_fit, t_off_c, t_off_q;

    INSERT INTO t_base
    SELECT p.id,
           v_type,
           LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)),
           CASE WHEN UPPER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = 'ROUND' THEN 'ROUND' ELSE 'FANCY' END,
           p.carats::double precision,
           FLOOR(p.carats::double precision * 2) / 2,
           UPPER(COALESCE(p.col,'')),
           UPPER(COALESCE(p.clar,'')),
           UPPER(COALESCE(p.lab,'')),
           CASE WHEN UPPER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = 'ROUND'
                THEN UPPER(COALESCE(p.cut,'')) ELSE 'NA' END,
           CASE WHEN UPPER(COALESCE(p.flo,'')) IN ('', 'NON', 'NONE', 'FNT', 'FAINT', 'VSL', 'VERY SLIGHT') THEN 'NF' ELSE 'MS' END,
           p.price::double precision,
           p.price::double precision / p.carats::double precision,
           p.discount::double precision,
           ln(p.price::double precision),
           ln(p.carats::double precision),
           public.diamond_rap_band(round(p.carats::numeric, 2)::double precision),
           public.diamond_magic_band(p.carats::double precision),
           public.diamond_color_rank(UPPER(COALESCE(p.col,''))),
           public.diamond_clarity_rank(UPPER(COALESCE(p.clar,'')))
    FROM public.diamond_inventory_pool p
    WHERE p.price IS NOT NULL AND p.price > 0
      AND p.carats IS NOT NULL AND p.carats > 0
      AND COALESCE(p.shape,'') <> '' AND COALESCE(p.col,'') <> '' AND COALESCE(p.clar,'') <> ''
      AND (CASE WHEN LOWER(COALESCE(p.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END) = v_type;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_type = 'natural' THEN v_nat := v_n; ELSE v_lab := v_n; END IF;
    v_timings := v_timings || jsonb_build_object(v_type || '_rows', v_n);
    IF v_n = 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO t_shelf
    SELECT shape_id, bucket, color, clarity, count(*), percentile_cont(0.5) WITHIN GROUP (ORDER BY ppc)
    FROM t_base GROUP BY 1, 2, 3, 4;
    v_timings := v_timings || jsonb_build_object(v_type || '_prep_s', round(extract(epoch FROM clock_timestamp() - v_t)::numeric, 1));

    v_t := clock_timestamp();
    FOR v_lvl IN 0..3 LOOP
      v_key := CASE v_lvl
        WHEN 0 THEN 'concat_ws(''|'', shape_id, color, clarity, mband::text)'
        WHEN 1 THEN 'concat_ws(''|'', shape_id, color, clarity, lab, mband::text)'
        WHEN 2 THEN 'concat_ws(''|'', shape_id, color, clarity, lab, cutq, mband::text)'
        ELSE        'concat_ws(''|'', shape_id, color, clarity, lab, cutq, flq, mband::text)' END;
      v_need := CASE WHEN v_lvl = 0 THEN cfg.n_min ELSE cfg.n_target END;
      TRUNCATE t_m;
      EXECUTE format(
        'INSERT INTO t_m (pool_id, k, y, lnc, keep)
           SELECT b.pool_id, kk.k, b.lnp, b.lnc, true
           FROM t_base b
           JOIN (SELECT %1$s AS k FROM t_base GROUP BY 1 HAVING count(*) >= %2$s) kk ON kk.k = %1$s',
        v_key, v_need);
      IF (SELECT count(*) FROM t_m) = 0 THEN
        CONTINUE;
      END IF;
      PERFORM public._diamond_fit_cohorts(cfg.trim_rounds, cfg.trim_sigma::double precision);
      INSERT INTO t_model (pool_id, dev, mad, mad_lo, mad_hi, n, lvl, slope, expv)
      SELECT r.pool_id, r.dev, r.mad, r.mad_lo, r.mad_hi, r.n,
             CASE v_lvl WHEN 0 THEN 'D shape+col+clar' WHEN 1 THEN 'C +lab' WHEN 2 THEN 'B +lab+cut' ELSE 'A +lab+cut+fluor' END,
             r.slope, r.expv
      FROM t_res r
      ON CONFLICT (pool_id) DO UPDATE
        SET dev = EXCLUDED.dev, mad = EXCLUDED.mad, mad_lo = EXCLUDED.mad_lo, mad_hi = EXCLUDED.mad_hi,
            n = EXCLUDED.n, lvl = EXCLUDED.lvl, slope = EXCLUDED.slope, expv = EXCLUDED.expv;
    END LOOP;

    INSERT INTO t_shape_fit
    SELECT s.shape_id, s.my - s.b * s.mx, s.b
    FROM (SELECT shape_id, avg(lnp) AS my, avg(lnc) AS mx,
                 LEAST(6::double precision, GREATEST(0::double precision, COALESCE(regr_slope(lnp, lnc), 0::double precision))) AS b
          FROM t_base GROUP BY shape_id) s;
    INSERT INTO t_off_c
    SELECT b.shape_id, b.color, percentile_cont(0.5) WITHIN GROUP (ORDER BY b.lnp - (f.a + f.b * b.lnc))
    FROM t_base b JOIN t_shape_fit f ON f.shape_id = b.shape_id GROUP BY b.shape_id, b.color;
    INSERT INTO t_off_q
    SELECT b.shape_id, b.clarity, percentile_cont(0.5) WITHIN GROUP (ORDER BY b.lnp - (f.a + f.b * b.lnc) - oc.off)
    FROM t_base b JOIN t_shape_fit f ON f.shape_id = b.shape_id
    JOIN t_off_c oc ON oc.shape_id = b.shape_id AND oc.color = b.color
    GROUP BY b.shape_id, b.clarity;

    TRUNCATE t_m;
    INSERT INTO t_m (pool_id, k, y, lnc, keep)
    SELECT nb.pool_id,
           concat_ws('|', tg.shape_id, tg.color, tg.clarity, tg.mband::text),
           nb.lnp - oc.off - oq.off, nb.lnc, true
    FROM (SELECT DISTINCT b.shape_id, b.color, b.clarity, b.mband, b.crank, b.qrank
          FROM t_base b LEFT JOIN t_model m ON m.pool_id = b.pool_id
          WHERE m.pool_id IS NULL AND b.crank IS NOT NULL AND b.qrank IS NOT NULL) tg
    JOIN t_base nb ON nb.shape_id = tg.shape_id AND nb.mband = tg.mband
                  AND nb.crank BETWEEN tg.crank - 1 AND tg.crank + 1
                  AND nb.qrank BETWEEN tg.qrank - 1 AND tg.qrank + 1
    JOIN t_off_c oc ON oc.shape_id = nb.shape_id AND oc.color = nb.color
    JOIN t_off_q oq ON oq.shape_id = nb.shape_id AND oq.clarity = nb.clarity;
    DELETE FROM t_m WHERE k IN (SELECT k FROM t_m GROUP BY k HAVING count(*) < cfg.n_min);
    IF (SELECT count(*) FROM t_m) > 0 THEN
      PERFORM public._diamond_fit_cohorts(cfg.trim_rounds, cfg.trim_sigma::double precision);
      INSERT INTO t_model (pool_id, dev, mad, mad_lo, mad_hi, n, lvl, slope, expv)
      SELECT r.pool_id, r.dev, r.mad, r.mad_lo, r.mad_hi, r.n, 'adjacent grades', r.slope,
             r.expv + oc.off + oq.off
      FROM t_res r
      JOIN t_base b ON b.pool_id = r.pool_id
      JOIN t_off_c oc ON oc.shape_id = b.shape_id AND oc.color = b.color
      JOIN t_off_q oq ON oq.shape_id = b.shape_id AND oq.clarity = b.clarity
      WHERE r.k = concat_ws('|', b.shape_id, b.color, b.clarity, b.mband::text)
        AND NOT EXISTS (SELECT 1 FROM t_model m WHERE m.pool_id = r.pool_id)
      ON CONFLICT (pool_id) DO NOTHING;
    END IF;
    v_timings := v_timings || jsonb_build_object(v_type || '_model_s', round(extract(epoch FROM clock_timestamp() - v_t)::numeric, 1));

    v_t := clock_timestamp();
    INSERT INTO t_rap (pool_id, shape_id, bucket, color, clarity, lab, cutq, rshape, rband, x)
    SELECT b.pool_id, b.shape_id, b.bucket, b.color, b.clarity, b.lab, b.cutq, b.rshape, b.rband,
           CASE WHEN rp.rap_ppc IS NOT NULL AND rp.rap_ppc > 0 THEN ln(b.ppc / rp.rap_ppc) END
    FROM t_base b
    LEFT JOIN (
      SELECT rshape, rband, color, clarity,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY ppc / (1 + disc / 100.0)) AS rap_ppc
      FROM t_base
      WHERE disc IS NOT NULL AND disc > -100
      GROUP BY 1, 2, 3, 4
    ) rp ON rp.rshape = b.rshape AND rp.rband = b.rband AND rp.color = b.color AND rp.clarity = b.clarity;

    v_rap_keys := ARRAY[
      'concat_ws(''|'', shape_id, bucket::text, color, clarity, lab, cutq)',
      'concat_ws(''|'', shape_id, bucket::text, color, clarity, lab)',
      'concat_ws(''|'', shape_id, bucket::text, color, clarity)',
      'concat_ws(''|'', shape_id, bucket::text, color)',
      'concat_ws(''|'', shape_id, bucket::text)',
      'concat_ws(''|'', shape_id, rband::text)',
      'concat_ws(''|'', rshape, rband::text)'];
    v_rap_mins := ARRAY[cfg.rap_min_lab_cut, cfg.rap_min_lab, cfg.rap_min_shelf,
                        cfg.rap_min_broad, cfg.rap_min_broad, cfg.rap_min_broad, cfg.rap_min_broad];
    FOR v_rung IN 1..7 LOOP
      EXIT WHEN NOT EXISTS (SELECT 1 FROM t_rap WHERE rung = 0 AND x IS NOT NULL);
      EXECUTE format($q$
        WITH g AS (
          SELECT %1$s AS k, percentile_cont(0.5) WITHIN GROUP (ORDER BY x) AS med, count(*) AS n
          FROM t_rap WHERE x IS NOT NULL GROUP BY 1
        ),
        d AS (
          SELECT t.pool_id, g.k, t.x - g.med AS dv, g.med, g.n
          FROM t_rap t JOIN g ON g.k = %1$s
          WHERE t.x IS NOT NULL
        ),
        s AS (
          SELECT k,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(dv))                      AS mad,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY -dv) FILTER (WHERE dv < 0)   AS mad_lo,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY dv)  FILTER (WHERE dv > 0)   AS mad_hi
          FROM d GROUP BY k
        )
        UPDATE t_rap t
           SET dev = d.dv, mad = s.mad, mad_lo = s.mad_lo, mad_hi = s.mad_hi, n = d.n, med = d.med, rung = %2$s
          FROM d JOIN s ON s.k = d.k
         WHERE d.pool_id = t.pool_id AND t.rung = 0 AND d.n >= %3$s
      $q$, v_rap_keys[v_rung], v_rung, v_rap_mins[v_rung]);
    END LOOP;
    v_timings := v_timings || jsonb_build_object(v_type || '_rap_s', round(extract(epoch FROM clock_timestamp() - v_t)::numeric, 1));

    v_t := clock_timestamp();
    INSERT INTO t_scores (pool_id, stone_type, shape_id, carat_bucket, color, clarity, carats, raw_price, ppc,
                          z_model, z_rap, expected_price, model_cohort_n, model_level, model_slope,
                          rap_rung, rap_group_n, rap_group_median_disc, shelf_n, shelf_median_ppc,
                          is_cheap, is_expensive, is_emergency, blocked, side, confidence, run_id, scored_at)
    SELECT z.pool_id, z.stone_type, z.shape_id, z.bucket, z.color, z.clarity, z.carats, z.price, z.ppc,
           z.zm::real, z.zr::real, CASE WHEN z.expv IS NOT NULL THEN round(exp(z.expv)::numeric, 2) END,
           z.model_n, COALESCE(z.lvl, 'none'), z.slope::real,
           z.rung::smallint, z.rap_n, CASE WHEN z.med IS NOT NULL THEN round(((exp(z.med) - 1) * 100)::numeric, 2) END,
           z.shelf_n, round(z.shelf_med::numeric, 2),
           z.cheap, z.expensive, z.emergency,
           (z.cheap OR z.expensive OR z.emergency),
           CASE WHEN z.cheap THEN 'cheap' WHEN z.expensive THEN 'expensive' WHEN z.emergency THEN 'emergency' END,
           CASE WHEN (z.cheap OR z.expensive OR z.emergency)
                THEN CASE WHEN z.fires >= 2 THEN 'high' WHEN z.fires = 1 THEN 'medium' ELSE 'review' END END,
           v_run, now()
    FROM (
      SELECT y.*,
             CASE cfg.mode
               WHEN 'union'      THEN (y.zm < cfg.cheap_z OR  y.zr < cfg.cheap_z)
               WHEN 'agree'      THEN (y.zm < cfg.cheap_z AND y.zr < cfg.cheap_z)
               WHEN 'model_only' THEN (y.zm < cfg.cheap_z)
               ELSE                   (y.zr < cfg.cheap_z) END AS cheap,
             CASE cfg.dear_mode
               WHEN 'union'      THEN (y.zm > cfg.dear_z OR  y.zr > cfg.dear_z)
               WHEN 'agree'      THEN (y.zm > cfg.dear_z AND y.zr > cfg.dear_z)
               WHEN 'model_only' THEN (y.zm > cfg.dear_z)
               ELSE                   (y.zr > cfg.dear_z) END AS expensive,
             (y.shelf_n >= cfg.emergency_min_group AND y.ppc > cfg.emergency_mult * y.shelf_med) AS emergency,
             ((y.zm < cfg.cheap_z OR y.zm > cfg.dear_z)::integer + (y.zr < cfg.cheap_z OR y.zr > cfg.dear_z)::integer) AS fires
      FROM (
        SELECT b.pool_id, b.stone_type, b.shape_id, b.bucket, b.color, b.clarity, b.carats, b.price, b.ppc,
               public.diamond_robust_z(m.dev, m.mad, m.mad_lo, m.mad_hi, cfg.spread_floor::double precision) AS zm,
               public.diamond_robust_z(r.dev, r.mad, r.mad_lo, r.mad_hi, cfg.spread_floor::double precision) AS zr,
               m.expv, m.n AS model_n, m.lvl, m.slope,
               r.rung, r.n AS rap_n, r.med,
               sh.shelf_n, sh.shelf_med
        FROM t_base b
        LEFT JOIN t_model m ON m.pool_id = b.pool_id
        LEFT JOIN t_rap   r ON r.pool_id = b.pool_id
        JOIN t_shelf sh ON sh.shape_id = b.shape_id AND sh.bucket = b.bucket AND sh.color = b.color AND sh.clarity = b.clarity
      ) y
    ) z;
    v_timings := v_timings || jsonb_build_object(v_type || '_decide_s', round(extract(epoch FROM clock_timestamp() - v_t)::numeric, 1));
  END LOOP;

  v_t := clock_timestamp();
  TRUNCATE public.diamond_pool_scores;
  INSERT INTO public.diamond_pool_scores SELECT * FROM t_scores;

  DELETE FROM public.diamond_pool_rep_changes;
  INSERT INTO public.diamond_pool_rep_changes
    (run_id, stone_type, shape_id, carat_bucket, color, clarity, shelf_n,
     old_pool_id, old_price, old_carats, old_z_model, old_z_rap, new_pool_id, new_price, new_carats, uplift_pct, shelf_hidden)
  SELECT v_run, o.stone_type, o.shape_id, o.carat_bucket, o.color, o.clarity, o.shelf_n,
         o.pool_id, o.raw_price, o.carats, o.z_model, o.z_rap,
         n.pool_id, n.raw_price, n.carats,
         CASE WHEN n.raw_price IS NOT NULL AND o.raw_price > 0 THEN round((n.raw_price / o.raw_price * 100 - 100)::numeric, 1) END,
         (n.pool_id IS NULL)
  FROM (
    SELECT DISTINCT ON (stone_type, shape_id, carat_bucket, color, clarity) *
    FROM t_scores WHERE NOT is_emergency
    ORDER BY stone_type, shape_id, carat_bucket, color, clarity, raw_price ASC
  ) o
  LEFT JOIN (
    SELECT DISTINCT ON (stone_type, shape_id, carat_bucket, color, clarity) *
    FROM t_scores WHERE NOT is_cheap AND NOT is_emergency
    ORDER BY stone_type, shape_id, carat_bucket, color, clarity, blocked ASC, raw_price ASC
  ) n ON n.stone_type = o.stone_type AND n.shape_id = o.shape_id AND n.carat_bucket = o.carat_bucket
     AND n.color = o.color AND n.clarity = o.clarity
  WHERE n.pool_id IS DISTINCT FROM o.pool_id;
  v_timings := v_timings || jsonb_build_object('publish_s', round(extract(epoch FROM clock_timestamp() - v_t)::numeric, 1),
                                               'total_s',   round(extract(epoch FROM clock_timestamp() - v_t0)::numeric, 1));

  UPDATE public.diamond_scoring_runs r SET
    finished_at = now(), status = 'done',
    pool_rows = v_pool, natural_rows = v_nat, lab_rows = v_lab,
    natural_cheap     = (SELECT count(*) FROM t_scores WHERE stone_type = 'natural' AND side = 'cheap'),
    natural_expensive = (SELECT count(*) FROM t_scores WHERE stone_type = 'natural' AND side = 'expensive'),
    natural_emergency = (SELECT count(*) FROM t_scores WHERE stone_type = 'natural' AND side = 'emergency'),
    natural_blocked   = (SELECT count(*) FROM t_scores WHERE stone_type = 'natural' AND blocked),
    lab_cheap         = (SELECT count(*) FROM t_scores WHERE stone_type = 'lab' AND side = 'cheap'),
    lab_expensive     = (SELECT count(*) FROM t_scores WHERE stone_type = 'lab' AND side = 'expensive'),
    lab_emergency     = (SELECT count(*) FROM t_scores WHERE stone_type = 'lab' AND side = 'emergency'),
    lab_blocked       = (SELECT count(*) FROM t_scores WHERE stone_type = 'lab' AND blocked),
    shelves_total     = (SELECT count(*) FROM (SELECT 1 FROM t_scores GROUP BY stone_type, shape_id, carat_bucket, color, clarity) q),
    shelves_fully_blocked = (SELECT count(*) FROM public.diamond_pool_rep_changes WHERE shelf_hidden),
    reps_changed      = (SELECT count(*) FROM public.diamond_pool_rep_changes),
    step_timings      = v_timings
  WHERE r.id = v_run;

  RETURN v_run;
END;
$$;

-- 3. Group representatives: cheap-only exclusion + fallback tier
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
cfgc AS (
  SELECT COALESCE((SELECT c.shadow_mode FROM public.diamond_outlier_config c WHERE c.id = 1), true) AS shadow
),
healthy AS (
  SELECT n.*,
         CASE WHEN c.shadow OR NOT COALESCE(sc.blocked, false) THEN 0 ELSE 1 END AS pick_tier
  FROM norm n
  CROSS JOIN cfgc c
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
    AND (c.shadow OR NOT COALESCE(sc.is_cheap, false))
)
SELECT DISTINCT ON (stone_type, shape_id, carat_bucket, color, clarity)
  id, stone_type, shape_id, carat_bucket, carat_value, color, clarity, raw_price, report_no
FROM healthy
ORDER BY stone_type, shape_id, carat_bucket, color, clarity,
         pick_tier ASC, raw_price ASC, report_no NULLS LAST;

CREATE UNIQUE INDEX IF NOT EXISTS idx_diamond_pool_group_reps_pk
  ON public.diamond_pool_group_reps (stone_type, shape_id, carat_bucket, color, clarity);

GRANT SELECT ON public.diamond_pool_group_reps TO anon, authenticated, service_role;

-- 4. Widget RPC live path: same cheap-only exclusion + fallback tier.
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
  v_price_sort        := COALESCE(v_filter->>'priceSort', 'high_to_low');
  v_sort_dir          := CASE WHEN v_price_sort = 'low_to_high' THEN 1 ELSE -1 END;
  v_limit_per_type    := NULLIF(v_filter->>'limitPerType','')::integer;
  IF v_limit_per_type IS NOT NULL AND v_limit_per_type <= 0 THEN
    v_limit_per_type := NULL;
  END IF;
  v_req_bucket        := NULLIF(SPLIT_PART(COALESCE(p_carat_range,''), '-', 1), '')::float8;
  v_shadow            := COALESCE((SELECT c.shadow_mode FROM public.diamond_outlier_config c WHERE c.id = 1), true);

  v_has_rare_filters :=
       COALESCE(array_length(v_cuts,1),0) > 0
    OR COALESCE(array_length(v_pol,1),0)  > 0
    OR COALESCE(array_length(v_symm,1),0) > 0
    OR COALESCE(array_length(v_flo,1),0)  > 0
    OR COALESCE(array_length(v_labs,1),0) > 0
    OR v_len_min IS NOT NULL OR v_len_max IS NOT NULL
    OR v_canadian;

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

-- 5. Admin RPCs: overview gains the two shelf counts; config accepts dear_mode
CREATE OR REPLACE FUNCTION public.get_diamond_outlier_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v jsonb;
BEGIN
  PERFORM public._diamond_outlier_require_admin(false);
  SELECT jsonb_build_object(
    'config',   (SELECT to_jsonb(c) FROM public.diamond_outlier_config c WHERE c.id = 1),
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
    'shelves_all_blocked', (SELECT count(*) FROM (
                              SELECT 1 FROM public.diamond_pool_scores
                              GROUP BY stone_type, shape_id, carat_bucket, color, clarity
                              HAVING bool_and(blocked)) q),
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
  IF p_patch ?| ARRAY['mode','dear_mode','cheap_z','dear_z','spread_floor','n_target','n_min','emergency_mult'] THEN
    UPDATE public.diamond_pipeline_state
       SET pending = true, last_pool_change_at = now() - interval '1 day', updated_at = now()
     WHERE id = 1;
  END IF;
  IF p_patch ? 'shadow_mode' AND NOT (p_patch ?| ARRAY['mode','dear_mode','cheap_z','dear_z','spread_floor','n_target','n_min','emergency_mult']) THEN
    BEGIN
      REFRESH MATERIALIZED VIEW CONCURRENTLY public.diamond_pool_group_reps;
    EXCEPTION WHEN OTHERS THEN
      REFRESH MATERIALIZED VIEW public.diamond_pool_group_reps;
    END;
  END IF;
  RETURN to_jsonb(c);
END;
$$;

-- 6. Re-score with the new rule on the next minute tick (shadow mode unchanged)
UPDATE public.diamond_pipeline_state
   SET pending = true, last_pool_change_at = now() - interval '1 day', updated_at = now()
 WHERE id = 1;