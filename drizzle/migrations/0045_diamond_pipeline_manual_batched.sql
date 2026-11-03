-- lovable-cron-fallback-reviewed: temporary per-minute step runner exists only while an admin-started scoring job is active and unschedules itself when done; no permanent polling
-- ============================================================================
-- Diamond pipeline: manual start, batched steps, no permanent cron
-- ============================================================================
-- Before: a pg_cron tick ran every minute, a nightly flag (03:05 UTC) forced a
-- full re-score every night, and every pool upload queued another full run.
-- One run read the whole pool 15-18 times inside a single statement that was
-- allowed to hold the database for up to an hour.
--
-- After:
--   * No permanent cron. `diamond-pipeline-tick` and `diamond-pipeline-nightly`
--     are unscheduled here and the tick function is retired.
--   * Scoring starts ONLY when an admin presses "Run Score Now"
--     (trigger_diamond_pipeline, unchanged name so the panel keeps working).
--     Uploads no longer start anything; they only set pipeline_state.pending
--     so the panel can say "new diamonds uploaded, not scored yet".
--   * One run is a job (diamond_pipeline_jobs) executed as ~25-40 short steps:
--     pool rows are prepared and scored in batches of `batch_rows` (default
--     100k), each regression level / Rap rung / matview refresh is its own
--     step, and the engine pauses `step_gap_minutes` (default 2) between
--     steps. Intermediate results live in UNLOGGED work tables instead of
--     session temp tables so the work can span many statements.
--   * While a job is active a temporary pg_cron entry `diamond-pipeline-job`
--     fires every minute and runs one step; the last step unschedules it.
--     Between runs cron.job has no diamond entry at all.
--   * The maths is unchanged: same normalisation, cohort fits, Rap ladder,
--     decision rules and publish/rep-change logic as score_diamond_pool().
--     Only the execution is sliced.
--   * The final steps refresh the catalogue filter cache (if that function
--     exists in this database) and every confirmed client's availability
--     cache, 5 clients per step, so widgets see the new pool.
-- ============================================================================

-- ─── 0. Retire the permanent crons ───────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'diamond-pipeline-tick') THEN
    PERFORM cron.unschedule('diamond-pipeline-tick');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'diamond-pipeline-nightly') THEN
    PERFORM cron.unschedule('diamond-pipeline-nightly');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'diamond-pipeline-job') THEN
    PERFORM cron.unschedule('diamond-pipeline-job');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available or jobs absent: %', SQLERRM;
END $$;

-- ─── 1. Config knobs ─────────────────────────────────────────────────────────
ALTER TABLE public.diamond_outlier_config
  ADD COLUMN IF NOT EXISTS batch_rows           integer NOT NULL DEFAULT 100000 CHECK (batch_rows >= 10000),
  ADD COLUMN IF NOT EXISTS step_gap_minutes     integer NOT NULL DEFAULT 2      CHECK (step_gap_minutes BETWEEN 0 AND 60),
  ADD COLUMN IF NOT EXISTS availability_per_step integer NOT NULL DEFAULT 5     CHECK (availability_per_step BETWEEN 1 AND 50);

-- ─── 2. Job table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.diamond_pipeline_jobs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status               text NOT NULL DEFAULT 'queued'
                       CHECK (status IN ('queued', 'running', 'done', 'error', 'cancelled')),
  trigger_source       text,
  requested_by         uuid,
  created_at           timestamptz NOT NULL DEFAULT now(),
  started_at           timestamptz,
  finished_at          timestamptz,
  -- where we are
  phase                text NOT NULL DEFAULT 'init',
  stone_type           text,                       -- natural | lab while scoring
  cursor_text          text,                       -- keyset cursor (uuid) inside a batched phase
  cursor_n             integer NOT NULL DEFAULT 0, -- level / rung / sub-step counter
  steps_done           integer NOT NULL DEFAULT 0,
  rows_done            bigint  NOT NULL DEFAULT 0, -- rows handled in the current batched phase
  next_step_not_before timestamptz,
  last_step_at         timestamptz,
  last_step_ms         integer,
  run_id               uuid,
  pool_rows            integer,
  natural_rows         integer,
  lab_rows             integer,
  timings              jsonb NOT NULL DEFAULT '{}'::jsonb,
  error                text,
  cancel_requested     boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_diamond_pipeline_jobs_created ON public.diamond_pipeline_jobs (created_at DESC);
-- at most one queued and one running job at any time (trigger_diamond_pipeline also checks)
CREATE UNIQUE INDEX IF NOT EXISTS uq_diamond_pipeline_jobs_active
  ON public.diamond_pipeline_jobs (status) WHERE status IN ('queued', 'running');
ALTER TABLE public.diamond_pipeline_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.diamond_pipeline_jobs FROM PUBLIC, anon, authenticated;

-- ─── 3. Work tables (UNLOGGED: cheap writes, no WAL, survive across steps) ───
CREATE UNLOGGED TABLE IF NOT EXISTS public.diamond_work_base (
  pool_id uuid PRIMARY KEY, stone_type text, shape_id text, rshape text, carats double precision, bucket double precision,
  color text, clarity text, lab text, cutq text, flq text, price double precision, ppc double precision,
  disc double precision, lnp double precision, lnc double precision, rband double precision, mband double precision,
  crank integer, qrank integer
);
CREATE INDEX IF NOT EXISTS idx_diamond_work_base_scc ON public.diamond_work_base (shape_id, color, clarity);
CREATE UNLOGGED TABLE IF NOT EXISTS public.diamond_work_m    (pool_id uuid, k text, y double precision, lnc double precision, keep boolean, r double precision);
CREATE INDEX IF NOT EXISTS idx_diamond_work_m_k ON public.diamond_work_m (k);
CREATE UNLOGGED TABLE IF NOT EXISTS public.diamond_work_fit  (k text, n_all integer, a double precision, b double precision);
CREATE UNLOGGED TABLE IF NOT EXISTS public.diamond_work_stat (k text, rmed double precision, mad double precision, mad_lo double precision, mad_hi double precision);
CREATE UNLOGGED TABLE IF NOT EXISTS public.diamond_work_res  (pool_id uuid, k text, dev double precision, mad double precision, mad_lo double precision,
                                                              mad_hi double precision, n integer, slope double precision, expv double precision);
CREATE UNLOGGED TABLE IF NOT EXISTS public.diamond_work_model(pool_id uuid PRIMARY KEY, dev double precision, mad double precision, mad_lo double precision,
                                                              mad_hi double precision, n integer, lvl text, slope double precision, expv double precision);
CREATE UNLOGGED TABLE IF NOT EXISTS public.diamond_work_rap  (pool_id uuid PRIMARY KEY, shape_id text, bucket double precision, color text, clarity text, lab text,
                                                              cutq text, rshape text, rband double precision, x double precision, dev double precision,
                                                              mad double precision, mad_lo double precision, mad_hi double precision, n integer,
                                                              med double precision, rung integer NOT NULL DEFAULT 0);
CREATE UNLOGGED TABLE IF NOT EXISTS public.diamond_work_shelf(shape_id text, bucket double precision, color text, clarity text, shelf_n integer, shelf_med double precision);
CREATE INDEX IF NOT EXISTS idx_diamond_work_shelf_key ON public.diamond_work_shelf (shape_id, bucket, color, clarity);
CREATE UNLOGGED TABLE IF NOT EXISTS public.diamond_work_scores (LIKE public.diamond_pool_scores INCLUDING DEFAULTS);
CREATE INDEX IF NOT EXISTS idx_diamond_work_scores_shelf ON public.diamond_work_scores (stone_type, shape_id, carat_bucket, color, clarity);
CREATE UNLOGGED TABLE IF NOT EXISTS public.diamond_work_shape_fit (shape_id text, a double precision, b double precision);
CREATE UNLOGGED TABLE IF NOT EXISTS public.diamond_work_off_c (shape_id text, color text, off double precision);
CREATE UNLOGGED TABLE IF NOT EXISTS public.diamond_work_off_q (shape_id text, clarity text, off double precision);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['diamond_work_base','diamond_work_m','diamond_work_fit','diamond_work_stat','diamond_work_res',
                           'diamond_work_model','diamond_work_rap','diamond_work_shelf','diamond_work_scores',
                           'diamond_work_shape_fit','diamond_work_off_c','diamond_work_off_q'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
  END LOOP;
END $$;

-- ─── 4. Cohort fitting on the work tables (same maths as _diamond_fit_cohorts)
CREATE OR REPLACE FUNCTION public._diamond_fit_cohorts_work(p_rounds integer, p_sigma double precision)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $body$
DECLARE
  i integer;
BEGIN
  UPDATE public.diamond_work_m SET keep = true, r = NULL;
  FOR i IN 0..p_rounds LOOP
    TRUNCATE public.diamond_work_fit;
    INSERT INTO public.diamond_work_fit (k, n_all, a, b)
    SELECT s.k, s.n_all, s.my - s.b * s.mx, s.b
    FROM (
      SELECT k, count(*) AS n_all,
             avg(y)   FILTER (WHERE keep) AS my,
             avg(lnc) FILTER (WHERE keep) AS mx,
             LEAST(6::double precision, GREATEST(0::double precision,
                   COALESCE(regr_slope(y, lnc) FILTER (WHERE keep), 0::double precision))) AS b
      FROM public.diamond_work_m GROUP BY k
    ) s;
    UPDATE public.diamond_work_m m SET r = m.y - (f.a + f.b * m.lnc) FROM public.diamond_work_fit f WHERE f.k = m.k;
    IF i < p_rounds THEN
      TRUNCATE public.diamond_work_stat;
      INSERT INTO public.diamond_work_stat (k, rmed)
      SELECT k, percentile_cont(0.5) WITHIN GROUP (ORDER BY r) FROM public.diamond_work_m GROUP BY k;
      UPDATE public.diamond_work_stat s SET mad = x.mad
      FROM (
        SELECT m.k, percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(m.r - s2.rmed)) AS mad
        FROM public.diamond_work_m m JOIN public.diamond_work_stat s2 ON s2.k = m.k GROUP BY m.k
      ) x WHERE x.k = s.k;
      UPDATE public.diamond_work_m m
         SET keep = (s.mad <= 0) OR (abs(m.r - s.rmed) <= p_sigma * 1.4826 * s.mad)
        FROM public.diamond_work_stat s WHERE s.k = m.k;
    END IF;
  END LOOP;

  TRUNCATE public.diamond_work_stat;
  INSERT INTO public.diamond_work_stat (k, rmed)
  SELECT k, percentile_cont(0.5) WITHIN GROUP (ORDER BY r) FROM public.diamond_work_m GROUP BY k;
  UPDATE public.diamond_work_stat s SET mad = x.mad, mad_lo = x.mad_lo, mad_hi = x.mad_hi
  FROM (
    SELECT m.k,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(m.r - s2.rmed))                          AS mad,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY (s2.rmed - m.r)) FILTER (WHERE m.r < s2.rmed) AS mad_lo,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY (m.r - s2.rmed)) FILTER (WHERE m.r > s2.rmed) AS mad_hi
    FROM public.diamond_work_m m JOIN public.diamond_work_stat s2 ON s2.k = m.k GROUP BY m.k
  ) x WHERE x.k = s.k;

  TRUNCATE public.diamond_work_res;
  INSERT INTO public.diamond_work_res (pool_id, k, dev, mad, mad_lo, mad_hi, n, slope, expv)
  SELECT m.pool_id, m.k, m.r - s.rmed, s.mad, s.mad_lo, s.mad_hi, f.n_all, f.b, f.a + f.b * m.lnc + s.rmed
  FROM public.diamond_work_m m JOIN public.diamond_work_stat s ON s.k = m.k JOIN public.diamond_work_fit f ON f.k = m.k;
END;
$body$;
REVOKE ALL ON FUNCTION public._diamond_fit_cohorts_work(integer, double precision) FROM PUBLIC;

-- ─── 5. Helpers: temporary cron entry, work-table cleanup ────────────────────
CREATE OR REPLACE FUNCTION public._diamond_pipeline_cron(p_on boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
BEGIN
  IF p_on THEN
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'diamond-pipeline-job') THEN
      -- 15 min hard cap per step; steps are designed to finish in 1-5 min.
      PERFORM cron.schedule('diamond-pipeline-job', '* * * * *',
        $job$ SET statement_timeout = '900000'; SELECT public.diamond_pipeline_step(); $job$);
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'diamond-pipeline-job') THEN
      PERFORM cron.unschedule('diamond-pipeline-job');
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'diamond pipeline cron toggle failed: %', SQLERRM;
END;
$body$;
REVOKE ALL ON FUNCTION public._diamond_pipeline_cron(boolean) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public._diamond_work_truncate(p_all boolean)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $body$
BEGIN
  TRUNCATE public.diamond_work_base, public.diamond_work_m, public.diamond_work_fit, public.diamond_work_stat,
           public.diamond_work_res, public.diamond_work_model, public.diamond_work_rap, public.diamond_work_shelf,
           public.diamond_work_shape_fit, public.diamond_work_off_c, public.diamond_work_off_q;
  IF p_all THEN
    TRUNCATE public.diamond_work_scores;
  END IF;
END;
$body$;
REVOKE ALL ON FUNCTION public._diamond_work_truncate(boolean) FROM PUBLIC;

-- ─── 6. Start a job (admin button) ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_diamond_pipeline()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
DECLARE
  v_job public.diamond_pipeline_jobs%ROWTYPE;
BEGIN
  PERFORM public._diamond_outlier_require_admin(true);

  SELECT * INTO v_job FROM public.diamond_pipeline_jobs WHERE status IN ('queued', 'running') LIMIT 1;
  IF FOUND THEN
    PERFORM public._diamond_pipeline_cron(true);
    RETURN jsonb_build_object('started', false, 'reason', 'already_running', 'job', to_jsonb(v_job));
  END IF;

  INSERT INTO public.diamond_pipeline_jobs (status, trigger_source, requested_by, phase, next_step_not_before)
  VALUES ('queued', 'manual', auth.uid(), 'init', now())
  RETURNING * INTO v_job;

  UPDATE public.diamond_pipeline_state
     SET status = 'running', last_error = NULL, updated_at = now()
   WHERE id = 1;

  PERFORM public._diamond_pipeline_cron(true);
  RETURN jsonb_build_object('started', true, 'job', to_jsonb(v_job));
END;
$body$;
REVOKE ALL ON FUNCTION public.trigger_diamond_pipeline() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.trigger_diamond_pipeline() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancel_diamond_pipeline()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $body$
DECLARE
  v_job public.diamond_pipeline_jobs%ROWTYPE;
BEGIN
  PERFORM public._diamond_outlier_require_admin(true);
  UPDATE public.diamond_pipeline_jobs SET cancel_requested = true
   WHERE status IN ('queued', 'running')
  RETURNING * INTO v_job;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('cancelled', false, 'reason', 'no_active_job');
  END IF;
  RETURN jsonb_build_object('cancelled', true, 'job', to_jsonb(v_job));
END;
$body$;
REVOKE ALL ON FUNCTION public.cancel_diamond_pipeline() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_diamond_pipeline() TO authenticated, service_role;

-- ─── 7. One step of the job ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.diamond_pipeline_step()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public SET work_mem = '256MB' AS $body$
DECLARE
  job        public.diamond_pipeline_jobs%ROWTYPE;
  cfg        public.diamond_outlier_config%ROWTYPE;
  v_t0       timestamptz := clock_timestamp();
  v_n        bigint := 0;
  v_last     uuid;
  v_key      text;
  v_need     integer;
  v_rap_keys text[];
  v_rap_mins integer[];
  v_note     text := '';
  v_phase    text;
  v_cursor   uuid;
  v_lvl      integer;
  v_mode     text;
  v_client   uuid;
  v_done     boolean := false;
  v_run      uuid;
  v_pool     integer;
  v_nat      integer;
  v_lab      integer;
  v_rung     integer;
BEGIN
  -- Exactly one active job; nothing to do otherwise (and make sure the temp cron is gone).
  SELECT * INTO job FROM public.diamond_pipeline_jobs WHERE status IN ('queued', 'running') ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN
    PERFORM public._diamond_pipeline_cron(false);
    RETURN 'idle';
  END IF;
  IF job.next_step_not_before IS NOT NULL AND job.next_step_not_before > now() THEN
    RETURN 'waiting';
  END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('diamond_pipeline_step')) THEN
    RETURN 'busy';
  END IF;

  SELECT * INTO cfg FROM public.diamond_outlier_config WHERE id = 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'diamond_outlier_config row 1 missing';
  END IF;

  IF job.cancel_requested THEN
    PERFORM public._diamond_work_truncate(true);
    UPDATE public.diamond_pipeline_jobs SET status = 'cancelled', finished_at = now(), phase = 'cancelled' WHERE id = job.id;
    UPDATE public.diamond_scoring_runs SET status = 'cancelled', finished_at = now(), error = 'cancelled by admin' WHERE id = job.run_id AND status = 'running';
    UPDATE public.diamond_pipeline_state SET status = 'idle', last_error = 'cancelled by admin', last_run_finished_at = now(), updated_at = now() WHERE id = 1;
    PERFORM public._diamond_pipeline_cron(false);
    RETURN 'cancelled';
  END IF;

  v_phase  := job.phase;
  v_cursor := NULLIF(job.cursor_text, '')::uuid;

  BEGIN
    IF job.status = 'queued' THEN
      UPDATE public.diamond_pipeline_jobs SET status = 'running', started_at = now() WHERE id = job.id;
    END IF;

    -- ================================================================ init
    IF v_phase = 'init' THEN
      PERFORM public._diamond_work_truncate(true);
      v_run := gen_random_uuid();
      INSERT INTO public.diamond_scoring_runs (id, started_at, status, trigger_source, shadow_mode, config_snapshot)
      VALUES (v_run, now(), 'running', 'manual-batched', cfg.shadow_mode, to_jsonb(cfg));
      SELECT count(*) INTO v_pool FROM public.diamond_inventory_pool;
      UPDATE public.diamond_pipeline_state SET status = 'running', last_run_started_at = now(), last_error = NULL, updated_at = now() WHERE id = 1;
      UPDATE public.diamond_pipeline_jobs
         SET run_id = v_run, pool_rows = v_pool, stone_type = 'natural',
             phase = 'prep', cursor_text = NULL, cursor_n = 0, rows_done = 0
       WHERE id = job.id;
      v_note := 'pool=' || v_pool;

    -- ================================================================ prep (batched)
    ELSIF v_phase = 'prep' THEN
      WITH src AS (
        SELECT p.*
        FROM public.diamond_inventory_pool p
        WHERE (v_cursor IS NULL OR p.id > v_cursor)
          AND p.price IS NOT NULL AND p.price > 0
          AND p.carats IS NOT NULL AND p.carats > 0
          AND COALESCE(p.shape,'') <> '' AND COALESCE(p.col,'') <> '' AND COALESCE(p.clar,'') <> ''
          AND (CASE WHEN LOWER(COALESCE(p.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END) = job.stone_type
        ORDER BY p.id
        LIMIT cfg.batch_rows
      ), ins AS (
        INSERT INTO public.diamond_work_base
          (pool_id, stone_type, shape_id, rshape, carats, bucket, color, clarity, lab, cutq, flq, price, ppc, disc, lnp, lnc, rband, mband, crank, qrank)
        SELECT p.id,
               job.stone_type,
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
        FROM src p
        ON CONFLICT (pool_id) DO NOTHING
        RETURNING pool_id
      )
      SELECT count(*), max(pool_id) INTO v_n, v_last FROM ins;

      IF v_n >= cfg.batch_rows THEN
        UPDATE public.diamond_pipeline_jobs SET cursor_text = v_last::text, rows_done = rows_done + v_n WHERE id = job.id;
        v_note := 'batch ' || v_n || ' rows (' || (job.rows_done + v_n) || ' so far)';
      ELSE
        -- type complete
        v_nat := job.natural_rows; v_lab := job.lab_rows;
        IF job.stone_type = 'natural' THEN v_nat := job.rows_done + v_n; ELSE v_lab := job.rows_done + v_n; END IF;
        IF job.rows_done + v_n = 0 THEN
          -- nothing of this type: skip straight to the next type / publish
          IF job.stone_type = 'natural' THEN
            UPDATE public.diamond_pipeline_jobs SET natural_rows = 0, stone_type = 'lab', phase = 'prep', cursor_text = NULL, cursor_n = 0, rows_done = 0 WHERE id = job.id;
          ELSE
            UPDATE public.diamond_pipeline_jobs SET lab_rows = 0, phase = 'publish', cursor_text = NULL, cursor_n = 0, rows_done = 0 WHERE id = job.id;
          END IF;
          v_note := job.stone_type || ': 0 rows, skipped';
        ELSE
          UPDATE public.diamond_pipeline_jobs
             SET natural_rows = v_nat, lab_rows = v_lab,
                 phase = 'shelf', cursor_text = NULL, cursor_n = 0, rows_done = rows_done + v_n
           WHERE id = job.id;
          v_note := job.stone_type || ' prepared: ' || (job.rows_done + v_n) || ' rows';
        END IF;
      END IF;

    -- ================================================================ shelf medians
    ELSIF v_phase = 'shelf' THEN
      TRUNCATE public.diamond_work_shelf;
      INSERT INTO public.diamond_work_shelf
      SELECT shape_id, bucket, color, clarity, count(*), percentile_cont(0.5) WITHIN GROUP (ORDER BY ppc)
      FROM public.diamond_work_base GROUP BY 1, 2, 3, 4;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      UPDATE public.diamond_pipeline_jobs SET phase = 'model', cursor_n = 0 WHERE id = job.id;
      v_note := v_n || ' shelves';

    -- ================================================================ Judge 1: carat model, one level per step
    ELSIF v_phase = 'model' THEN
      v_lvl := job.cursor_n;
      v_key := CASE v_lvl
        WHEN 0 THEN 'concat_ws(''|'', shape_id, color, clarity, mband::text)'
        WHEN 1 THEN 'concat_ws(''|'', shape_id, color, clarity, lab, mband::text)'
        WHEN 2 THEN 'concat_ws(''|'', shape_id, color, clarity, lab, cutq, mband::text)'
        ELSE        'concat_ws(''|'', shape_id, color, clarity, lab, cutq, flq, mband::text)' END;
      v_need := CASE WHEN v_lvl = 0 THEN cfg.n_min ELSE cfg.n_target END;
      TRUNCATE public.diamond_work_m;
      EXECUTE format(
        'INSERT INTO public.diamond_work_m (pool_id, k, y, lnc, keep)
           SELECT b.pool_id, kk.k, b.lnp, b.lnc, true
           FROM public.diamond_work_base b
           JOIN (SELECT %1$s AS k FROM public.diamond_work_base GROUP BY 1 HAVING count(*) >= %2$s) kk ON kk.k = %1$s',
        v_key, v_need);
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN
        PERFORM public._diamond_fit_cohorts_work(cfg.trim_rounds, cfg.trim_sigma::double precision);
        INSERT INTO public.diamond_work_model (pool_id, dev, mad, mad_lo, mad_hi, n, lvl, slope, expv)
        SELECT r.pool_id, r.dev, r.mad, r.mad_lo, r.mad_hi, r.n,
               CASE v_lvl WHEN 0 THEN 'D shape+col+clar' WHEN 1 THEN 'C +lab' WHEN 2 THEN 'B +lab+cut' ELSE 'A +lab+cut+fluor' END,
               r.slope, r.expv
        FROM public.diamond_work_res r
        ON CONFLICT (pool_id) DO UPDATE
          SET dev = EXCLUDED.dev, mad = EXCLUDED.mad, mad_lo = EXCLUDED.mad_lo, mad_hi = EXCLUDED.mad_hi,
              n = EXCLUDED.n, lvl = EXCLUDED.lvl, slope = EXCLUDED.slope, expv = EXCLUDED.expv;
      END IF;
      IF v_lvl >= 3 THEN
        UPDATE public.diamond_pipeline_jobs SET phase = 'fallback', cursor_n = 0 WHERE id = job.id;
      ELSE
        UPDATE public.diamond_pipeline_jobs SET cursor_n = v_lvl + 1 WHERE id = job.id;
      END IF;
      v_note := 'level ' || v_lvl || ': ' || v_n || ' cohort rows';

    -- ================================================================ adjacent-grade fallback
    ELSIF v_phase = 'fallback' THEN
      TRUNCATE public.diamond_work_shape_fit, public.diamond_work_off_c, public.diamond_work_off_q;
      INSERT INTO public.diamond_work_shape_fit
      SELECT s.shape_id, s.my - s.b * s.mx, s.b
      FROM (SELECT shape_id, avg(lnp) AS my, avg(lnc) AS mx,
                   LEAST(6::double precision, GREATEST(0::double precision, COALESCE(regr_slope(lnp, lnc), 0::double precision))) AS b
            FROM public.diamond_work_base GROUP BY shape_id) s;
      INSERT INTO public.diamond_work_off_c
      SELECT b.shape_id, b.color, percentile_cont(0.5) WITHIN GROUP (ORDER BY b.lnp - (f.a + f.b * b.lnc))
      FROM public.diamond_work_base b JOIN public.diamond_work_shape_fit f ON f.shape_id = b.shape_id GROUP BY b.shape_id, b.color;
      INSERT INTO public.diamond_work_off_q
      SELECT b.shape_id, b.clarity, percentile_cont(0.5) WITHIN GROUP (ORDER BY b.lnp - (f.a + f.b * b.lnc) - oc.off)
      FROM public.diamond_work_base b JOIN public.diamond_work_shape_fit f ON f.shape_id = b.shape_id
      JOIN public.diamond_work_off_c oc ON oc.shape_id = b.shape_id AND oc.color = b.color
      GROUP BY b.shape_id, b.clarity;

      TRUNCATE public.diamond_work_m;
      INSERT INTO public.diamond_work_m (pool_id, k, y, lnc, keep)
      SELECT nb.pool_id,
             concat_ws('|', tg.shape_id, tg.color, tg.clarity, tg.mband::text),
             nb.lnp - oc.off - oq.off, nb.lnc, true
      FROM (SELECT DISTINCT b.shape_id, b.color, b.clarity, b.mband, b.crank, b.qrank
            FROM public.diamond_work_base b LEFT JOIN public.diamond_work_model m ON m.pool_id = b.pool_id
            WHERE m.pool_id IS NULL AND b.crank IS NOT NULL AND b.qrank IS NOT NULL) tg
      JOIN public.diamond_work_base nb ON nb.shape_id = tg.shape_id AND nb.mband = tg.mband
                    AND nb.crank BETWEEN tg.crank - 1 AND tg.crank + 1
                    AND nb.qrank BETWEEN tg.qrank - 1 AND tg.qrank + 1
      JOIN public.diamond_work_off_c oc ON oc.shape_id = nb.shape_id AND oc.color = nb.color
      JOIN public.diamond_work_off_q oq ON oq.shape_id = nb.shape_id AND oq.clarity = nb.clarity;
      DELETE FROM public.diamond_work_m WHERE k IN (SELECT k FROM public.diamond_work_m GROUP BY k HAVING count(*) < cfg.n_min);
      SELECT count(*) INTO v_n FROM public.diamond_work_m;
      IF v_n > 0 THEN
        PERFORM public._diamond_fit_cohorts_work(cfg.trim_rounds, cfg.trim_sigma::double precision);
        INSERT INTO public.diamond_work_model (pool_id, dev, mad, mad_lo, mad_hi, n, lvl, slope, expv)
        SELECT r.pool_id, r.dev, r.mad, r.mad_lo, r.mad_hi, r.n, 'adjacent grades', r.slope,
               r.expv + oc.off + oq.off
        FROM public.diamond_work_res r
        JOIN public.diamond_work_base b ON b.pool_id = r.pool_id
        JOIN public.diamond_work_off_c oc ON oc.shape_id = b.shape_id AND oc.color = b.color
        JOIN public.diamond_work_off_q oq ON oq.shape_id = b.shape_id AND oq.clarity = b.clarity
        WHERE r.k = concat_ws('|', b.shape_id, b.color, b.clarity, b.mband::text)
          AND NOT EXISTS (SELECT 1 FROM public.diamond_work_model m WHERE m.pool_id = r.pool_id)
        ON CONFLICT (pool_id) DO NOTHING;
      END IF;
      UPDATE public.diamond_pipeline_jobs SET phase = 'rap', cursor_n = 0 WHERE id = job.id;
      v_note := v_n || ' fallback rows';

    -- ================================================================ Judge 2: Rap ladder (step 0 = ratios, 1..7 = rungs)
    ELSIF v_phase = 'rap' THEN
      IF job.cursor_n = 0 THEN
        TRUNCATE public.diamond_work_rap;
        INSERT INTO public.diamond_work_rap (pool_id, shape_id, bucket, color, clarity, lab, cutq, rshape, rband, x)
        SELECT b.pool_id, b.shape_id, b.bucket, b.color, b.clarity, b.lab, b.cutq, b.rshape, b.rband,
               CASE WHEN rp.rap_ppc IS NOT NULL AND rp.rap_ppc > 0 THEN ln(b.ppc / rp.rap_ppc) END
        FROM public.diamond_work_base b
        LEFT JOIN (
          SELECT rshape, rband, color, clarity,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY ppc / (1 + disc / 100.0)) AS rap_ppc
          FROM public.diamond_work_base
          WHERE disc IS NOT NULL AND disc > -100
          GROUP BY 1, 2, 3, 4
        ) rp ON rp.rshape = b.rshape AND rp.rband = b.rband AND rp.color = b.color AND rp.clarity = b.clarity;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        UPDATE public.diamond_pipeline_jobs SET cursor_n = 1 WHERE id = job.id;
        v_note := 'rap ratios for ' || v_n || ' rows';
      ELSE
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
        v_rung := job.cursor_n;
        IF EXISTS (SELECT 1 FROM public.diamond_work_rap WHERE rung = 0 AND x IS NOT NULL) THEN
          EXECUTE format($q$
            WITH g AS (
              SELECT %1$s AS k, percentile_cont(0.5) WITHIN GROUP (ORDER BY x) AS med, count(*) AS n
              FROM public.diamond_work_rap WHERE x IS NOT NULL GROUP BY 1
            ),
            d AS (
              SELECT t.pool_id, g.k, t.x - g.med AS dv, g.med, g.n
              FROM public.diamond_work_rap t JOIN g ON g.k = %1$s
              WHERE t.x IS NOT NULL
            ),
            s AS (
              SELECT k,
                     percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(dv))                      AS mad,
                     percentile_cont(0.5) WITHIN GROUP (ORDER BY -dv) FILTER (WHERE dv < 0)   AS mad_lo,
                     percentile_cont(0.5) WITHIN GROUP (ORDER BY dv)  FILTER (WHERE dv > 0)   AS mad_hi
              FROM d GROUP BY k
            )
            UPDATE public.diamond_work_rap t
               SET dev = d.dv, mad = s.mad, mad_lo = s.mad_lo, mad_hi = s.mad_hi, n = d.n, med = d.med, rung = %2$s
              FROM d JOIN s ON s.k = d.k
             WHERE d.pool_id = t.pool_id AND t.rung = 0 AND d.n >= %3$s
          $q$, v_rap_keys[job.cursor_n], job.cursor_n, v_rap_mins[job.cursor_n]);
          GET DIAGNOSTICS v_n = ROW_COUNT;
          v_note := 'rung ' || job.cursor_n || ': ' || v_n || ' rows';
        ELSE
          v_note := 'rung ' || job.cursor_n || ': nothing left';
          v_rung := 7;
        END IF;
        IF v_rung >= 7 THEN
          UPDATE public.diamond_pipeline_jobs SET phase = 'decide', cursor_text = NULL, cursor_n = 0, rows_done = 0 WHERE id = job.id;
        ELSE
          UPDATE public.diamond_pipeline_jobs SET cursor_n = job.cursor_n + 1 WHERE id = job.id;
        END IF;
      END IF;

    -- ================================================================ decision per stone (batched)
    ELSIF v_phase = 'decide' THEN
      WITH batch AS (
        SELECT b.* FROM public.diamond_work_base b
        WHERE (v_cursor IS NULL OR b.pool_id > v_cursor)
        ORDER BY b.pool_id LIMIT cfg.batch_rows
      ), ins AS (
        INSERT INTO public.diamond_work_scores (pool_id, stone_type, shape_id, carat_bucket, color, clarity, carats, raw_price, ppc,
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
               job.run_id, now()
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
            FROM batch b
            LEFT JOIN public.diamond_work_model m ON m.pool_id = b.pool_id
            LEFT JOIN public.diamond_work_rap   r ON r.pool_id = b.pool_id
            JOIN public.diamond_work_shelf sh ON sh.shape_id = b.shape_id AND sh.bucket = b.bucket AND sh.color = b.color AND sh.clarity = b.clarity
          ) y
        ) z
        RETURNING pool_id
      )
      SELECT count(*), max(pool_id) INTO v_n, v_last FROM ins;

      IF v_n >= cfg.batch_rows THEN
        UPDATE public.diamond_pipeline_jobs SET cursor_text = v_last::text, rows_done = rows_done + v_n WHERE id = job.id;
        v_note := 'scored batch ' || v_n || ' (' || (job.rows_done + v_n) || ' so far)';
      ELSIF job.stone_type = 'natural' THEN
        -- natural done: clear the per-type work tables (scores are kept) and start lab
        PERFORM public._diamond_work_truncate(false);
        UPDATE public.diamond_pipeline_jobs SET stone_type = 'lab', phase = 'prep', cursor_text = NULL, cursor_n = 0, rows_done = 0 WHERE id = job.id;
        v_note := 'natural scored (' || (job.rows_done + v_n) || '); starting lab';
      ELSE
        PERFORM public._diamond_work_truncate(false);
        UPDATE public.diamond_pipeline_jobs SET phase = 'publish', cursor_text = NULL, cursor_n = 0, rows_done = 0 WHERE id = job.id;
        v_note := 'lab scored (' || (job.rows_done + v_n) || ')';
      END IF;

    -- ================================================================ publish scores + representative changes
    ELSIF v_phase = 'publish' THEN
      TRUNCATE public.diamond_pool_scores;
      INSERT INTO public.diamond_pool_scores SELECT * FROM public.diamond_work_scores;
      GET DIAGNOSTICS v_n = ROW_COUNT;

      DELETE FROM public.diamond_pool_rep_changes;
      INSERT INTO public.diamond_pool_rep_changes
        (run_id, stone_type, shape_id, carat_bucket, color, clarity, shelf_n,
         old_pool_id, old_price, old_carats, old_z_model, old_z_rap, new_pool_id, new_price, new_carats, uplift_pct, shelf_hidden)
      SELECT job.run_id, o.stone_type, o.shape_id, o.carat_bucket, o.color, o.clarity, o.shelf_n,
             o.pool_id, o.raw_price, o.carats, o.z_model, o.z_rap,
             n.pool_id, n.raw_price, n.carats,
             CASE WHEN n.raw_price IS NOT NULL AND o.raw_price > 0 THEN round((n.raw_price / o.raw_price * 100 - 100)::numeric, 1) END,
             (n.pool_id IS NULL)
      FROM (
        SELECT DISTINCT ON (stone_type, shape_id, carat_bucket, color, clarity) *
        FROM public.diamond_work_scores WHERE NOT is_emergency
        ORDER BY stone_type, shape_id, carat_bucket, color, clarity, raw_price ASC
      ) o
      LEFT JOIN (
        SELECT DISTINCT ON (stone_type, shape_id, carat_bucket, color, clarity) *
        FROM public.diamond_work_scores WHERE NOT is_cheap AND NOT is_emergency
        ORDER BY stone_type, shape_id, carat_bucket, color, clarity, blocked ASC, raw_price ASC
      ) n ON n.stone_type = o.stone_type AND n.shape_id = o.shape_id AND n.carat_bucket = o.carat_bucket
         AND n.color = o.color AND n.clarity = o.clarity
      WHERE n.pool_id IS DISTINCT FROM o.pool_id;

      UPDATE public.diamond_scoring_runs r SET
        pool_rows = job.pool_rows, natural_rows = COALESCE(job.natural_rows, 0), lab_rows = COALESCE(job.lab_rows, 0),
        natural_cheap     = (SELECT count(*) FROM public.diamond_work_scores WHERE stone_type = 'natural' AND side = 'cheap'),
        natural_expensive = (SELECT count(*) FROM public.diamond_work_scores WHERE stone_type = 'natural' AND side = 'expensive'),
        natural_emergency = (SELECT count(*) FROM public.diamond_work_scores WHERE stone_type = 'natural' AND side = 'emergency'),
        natural_blocked   = (SELECT count(*) FROM public.diamond_work_scores WHERE stone_type = 'natural' AND blocked),
        lab_cheap         = (SELECT count(*) FROM public.diamond_work_scores WHERE stone_type = 'lab' AND side = 'cheap'),
        lab_expensive     = (SELECT count(*) FROM public.diamond_work_scores WHERE stone_type = 'lab' AND side = 'expensive'),
        lab_emergency     = (SELECT count(*) FROM public.diamond_work_scores WHERE stone_type = 'lab' AND side = 'emergency'),
        lab_blocked       = (SELECT count(*) FROM public.diamond_work_scores WHERE stone_type = 'lab' AND blocked),
        shelves_total     = (SELECT count(*) FROM (SELECT 1 FROM public.diamond_work_scores GROUP BY stone_type, shape_id, carat_bucket, color, clarity) q),
        shelves_fully_blocked = (SELECT count(*) FROM public.diamond_pool_rep_changes WHERE shelf_hidden),
        reps_changed      = (SELECT count(*) FROM public.diamond_pool_rep_changes)
      WHERE r.id = job.run_id;

      TRUNCATE public.diamond_work_scores;
      UPDATE public.diamond_pipeline_jobs SET phase = 'refresh_grade_stats', cursor_n = 0 WHERE id = job.id;
      v_note := v_n || ' scores published';

    -- ================================================================ materialized views, one per step
    ELSIF v_phase IN ('refresh_grade_stats', 'refresh_reps', 'refresh_reps_engine') THEN
      v_key := CASE v_phase WHEN 'refresh_grade_stats' THEN 'diamond_pool_grade_stats'
                            WHEN 'refresh_reps'        THEN 'diamond_pool_group_reps'
                            ELSE 'diamond_pool_group_reps_engine' END;
      IF to_regclass('public.' || v_key) IS NULL THEN
        v_note := v_key || ' absent, skipped';
      ELSE
        BEGIN
          EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY public.%I', v_key);
          v_mode := 'concurrent';
        EXCEPTION WHEN OTHERS THEN
          EXECUTE format('REFRESH MATERIALIZED VIEW public.%I', v_key);
          v_mode := 'plain: ' || SQLERRM;
        END;
        UPDATE public.diamond_scoring_runs SET refresh_mode = COALESCE(refresh_mode, v_mode) WHERE id = job.run_id;
        v_note := v_key || ' refreshed (' || v_mode || ')';
      END IF;
      UPDATE public.diamond_pipeline_jobs
         SET phase = CASE v_phase WHEN 'refresh_grade_stats' THEN 'refresh_reps'
                                  WHEN 'refresh_reps'        THEN 'refresh_reps_engine'
                                  ELSE 'distinct_values' END
       WHERE id = job.id;

    -- ================================================================ catalogue filter values cache (if present)
    ELSIF v_phase = 'distinct_values' THEN
      IF to_regproc('public.refresh_diamond_pool_distinct_values()') IS NOT NULL THEN
        EXECUTE 'SELECT public.refresh_diamond_pool_distinct_values()';
        v_note := 'filter values cache rebuilt';
      ELSE
        v_note := 'no filter values cache in this database';
      END IF;
      UPDATE public.diamond_pipeline_jobs SET phase = 'availability', cursor_n = 0, rows_done = 0 WHERE id = job.id;

    -- ================================================================ client availability caches, N clients per step
    ELSIF v_phase = 'availability' THEN
      IF job.cursor_n = 0 THEN
        -- pool changed: every confirmed client's "what is in stock" answer must be rebuilt
        INSERT INTO public.client_diamond_availability_cache (client_id, availability, is_stale)
        SELECT f.client_id, '{}'::jsonb, true
        FROM public.client_diamond_catalog_filter f WHERE f.is_confirmed = true
        ON CONFLICT (client_id) DO UPDATE SET is_stale = true, updated_at = now();
        GET DIAGNOSTICS v_n = ROW_COUNT;
        UPDATE public.diamond_pipeline_jobs SET cursor_n = 1 WHERE id = job.id;
        v_note := v_n || ' client caches marked for refresh';
      ELSE
        v_n := 0;
        FOR v_client IN
          SELECT c.client_id
          FROM public.client_diamond_availability_cache c
          JOIN public.client_diamond_catalog_filter f ON f.client_id = c.client_id AND f.is_confirmed = true
          WHERE c.is_stale = true
          ORDER BY c.updated_at
          LIMIT cfg.availability_per_step
        LOOP
          BEGIN
            PERFORM public.refresh_client_diamond_availability(v_client);
          EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'availability refresh failed for %: %', v_client, SQLERRM;
            UPDATE public.client_diamond_availability_cache SET is_stale = false, updated_at = now() WHERE client_id = v_client;
          END;
          v_n := v_n + 1;
        END LOOP;
        IF v_n = 0 THEN
          UPDATE public.diamond_pipeline_jobs SET phase = 'finalize' WHERE id = job.id;
          v_note := 'all client caches fresh';
        ELSE
          UPDATE public.diamond_pipeline_jobs SET rows_done = rows_done + v_n WHERE id = job.id;
          v_note := v_n || ' client caches refreshed (' || (job.rows_done + v_n) || ' so far)';
        END IF;
      END IF;

    -- ================================================================ finalize
    ELSIF v_phase = 'finalize' THEN
      PERFORM public._diamond_work_truncate(true);
      UPDATE public.diamond_scoring_runs r SET
        finished_at = now(), status = 'done',
        step_timings = job.timings || jsonb_build_object(
          'total_s', round(extract(epoch FROM (now() - job.started_at))::numeric, 1),
          'steps',   job.steps_done + 1)
      WHERE r.id = job.run_id;
      UPDATE public.diamond_pipeline_state
         SET status = 'idle', pending = false, last_run_finished_at = now(), last_run_id = job.run_id, last_error = NULL, updated_at = now()
       WHERE id = 1;
      UPDATE public.diamond_pipeline_jobs SET phase = 'done', status = 'done', finished_at = now() WHERE id = job.id;
      PERFORM public._diamond_pipeline_cron(false);
      v_done := true;
      v_note := 'done';
    ELSE
      RAISE EXCEPTION 'unknown pipeline phase %', v_phase;
    END IF;

    -- step bookkeeping: timings per phase, gap before the next step
    UPDATE public.diamond_pipeline_jobs j
       SET steps_done = j.steps_done + 1,
           last_step_at = now(),
           last_step_ms = (extract(epoch FROM (clock_timestamp() - v_t0)) * 1000)::integer,
           timings = j.timings || jsonb_build_object(
             COALESCE(job.stone_type || '_', '') || v_phase || '_s',
             round((COALESCE((j.timings ->> (COALESCE(job.stone_type || '_', '') || v_phase || '_s'))::numeric, 0)
                    + extract(epoch FROM (clock_timestamp() - v_t0)))::numeric, 1)),
           next_step_not_before = CASE WHEN v_done THEN NULL ELSE now() + make_interval(mins => GREATEST(cfg.step_gap_minutes, 0)) END
     WHERE j.id = job.id;

    RETURN v_phase || ': ' || v_note;

  EXCEPTION WHEN OTHERS THEN
    PERFORM public._diamond_work_truncate(true);
    UPDATE public.diamond_pipeline_jobs SET status = 'error', error = SQLERRM, finished_at = now() WHERE id = job.id;
    UPDATE public.diamond_scoring_runs SET status = 'error', error = SQLERRM, finished_at = now() WHERE id = job.run_id AND status = 'running';
    UPDATE public.diamond_pipeline_state
       SET status = 'error', last_error = SQLERRM, last_run_finished_at = now(), updated_at = now()
     WHERE id = 1;
    PERFORM public._diamond_pipeline_cron(false);
    RETURN 'error at ' || v_phase || ': ' || SQLERRM;
  END;
END;
$body$;
REVOKE ALL ON FUNCTION public.diamond_pipeline_step() FROM PUBLIC;

-- ─── 8. Retire the old tick (kept as a no-op so nothing referencing it breaks)
CREATE OR REPLACE FUNCTION public.diamond_pipeline_tick()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $body$
  SELECT 'retired: scoring runs only from the admin Run Score Now button (diamond_pipeline_step)'::text;
$body$;
REVOKE ALL ON FUNCTION public.diamond_pipeline_tick() FROM PUBLIC;

-- ─── 9. Admin overview now reports the job instead of pg_stat_activity ───────
CREATE OR REPLACE FUNCTION public.get_diamond_outlier_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $body$
DECLARE
  v jsonb;
BEGIN
  PERFORM public._diamond_outlier_require_admin(false);
  SELECT jsonb_build_object(
    'config',   (SELECT to_jsonb(c) FROM public.diamond_outlier_config c WHERE c.id = 1),
    'live_clients', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', cl.id, 'company_name', cl.company_name)
                                               ORDER BY cl.company_name), '[]'::jsonb)
                     FROM public.clients cl
                     WHERE cl.id = ANY (COALESCE((SELECT c.live_client_ids FROM public.diamond_outlier_config c WHERE c.id = 1),
                                                 ARRAY[]::uuid[]))),
    'state',    (SELECT to_jsonb(s) FROM public.diamond_pipeline_state s WHERE s.id = 1),
    'job',      (SELECT to_jsonb(j) FROM public.diamond_pipeline_jobs j ORDER BY j.created_at DESC LIMIT 1),
    'running',  EXISTS (SELECT 1 FROM public.diamond_pipeline_jobs j WHERE j.status IN ('queued', 'running')),
    'cron_scheduled', EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'diamond-pipeline-job'),
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
EXCEPTION WHEN undefined_table OR insufficient_privilege THEN
  -- cron schema not readable here: report without the cron flag
  SELECT jsonb_build_object(
    'config',   (SELECT to_jsonb(c) FROM public.diamond_outlier_config c WHERE c.id = 1),
    'state',    (SELECT to_jsonb(s) FROM public.diamond_pipeline_state s WHERE s.id = 1),
    'job',      (SELECT to_jsonb(j) FROM public.diamond_pipeline_jobs j ORDER BY j.created_at DESC LIMIT 1),
    'running',  EXISTS (SELECT 1 FROM public.diamond_pipeline_jobs j WHERE j.status IN ('queued', 'running')),
    'last_run', (SELECT to_jsonb(r) FROM public.diamond_scoring_runs r ORDER BY r.started_at DESC LIMIT 1),
    'runs',     '[]'::jsonb,
    'pool_rows', (SELECT count(*) FROM public.diamond_inventory_pool),
    'scored_rows', (SELECT count(*) FROM public.diamond_pool_scores),
    'blocked_by_type', '{}'::jsonb, 'rep_changes', 0, 'shelves_hidden', 0
  ) INTO v;
  RETURN v;
END;
$body$;
GRANT EXECUTE ON FUNCTION public.get_diamond_outlier_overview() TO authenticated, service_role;

-- ─── 10. Mark the pool "changed, not yet scored" so the panel can say so ─────
-- The upload trigger (trg_diamond_pool_mark_dirty) still sets pipeline_state.pending = true;
-- nothing consumes it automatically any more. It is cleared when a run finishes.
UPDATE public.diamond_pipeline_state SET status = 'idle', updated_at = now() WHERE id = 1 AND status = 'running';

-- ─── 11. Admins may read the pipeline state row directly (Run Score Now card) ─
DROP POLICY IF EXISTS "admins_read_diamond_pipeline_state" ON public.diamond_pipeline_state;
CREATE POLICY "admins_read_diamond_pipeline_state"
  ON public.diamond_pipeline_state FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'agency_admin'));
GRANT SELECT ON public.diamond_pipeline_state TO authenticated;
