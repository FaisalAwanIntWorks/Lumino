-- Copied from drizzle/migrations/0033_quote_estimator_diamond_picker_v3_only_configuration.sql (applied directly to the source database, missing from supabase/migrations).
-- Quote Estimator diamond picker: the full "Diamond Configuration" is V3-only.
--
-- V1 / V2 (and every non-lab account) keep the first-release picker: stones
-- from the account's Ring OS catalogue when one is configured, otherwise the
-- pool representatives, restricted by the colour / clarity lists and the
-- single pool markup saved in form_content.diamondPicker.
-- V3 (Sandbox lab) uses its own Diamond Configuration: always the complete
-- pool, narrowed by the saved filter (same keys as the Ring OS catalogue
-- filter) and priced with separate Natural / Lab markups.
--
-- Same signature as 20261017090000 (CREATE OR REPLACE), so this applies
-- cleanly whether or not that migration already ran.

CREATE OR REPLACE FUNCTION public.get_quote_estimator_diamonds(
  p_client_id  uuid,
  p_version    text    DEFAULT 'v2',
  p_stone_type text    DEFAULT NULL,
  p_shape_id   text    DEFAULT NULL,
  p_carat_min  numeric DEFAULT NULL,
  p_carat_max  numeric DEFAULT NULL,
  p_limit      integer DEFAULT 300
)
RETURNS TABLE(
  pool_id     uuid,
  stone_type  text,
  shape_id    text,
  carat_value numeric,
  color       text,
  clarity     text,
  price       numeric,
  report_no   text,
  lab         text,
  pdf         text,
  source      text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_content     jsonb;
  v_picker      jsonb;
  v_filter      jsonb;
  v_stone       text[];
  v_ranges      numeric[];
  v_colors      text[];
  v_clarities   text[];
  v_has_catalog boolean := false;
  v_markup      numeric := 0;
  v_markup_n    numeric := 0;
  v_markup_l    numeric := 0;
  v_pmin_n      numeric; v_pmax_n numeric; v_pmin_l numeric; v_pmax_l numeric;
  v_sort_dir    integer := 1;
  v_limit       integer := LEAST(GREATEST(COALESCE(p_limit, 300), 1), 1000);
BEGIN
  -- Settings record of the requested version (mirrors the app's storage map).
  IF p_version = 'v1' THEN
    SELECT c.form_content INTO v_content FROM public.sandbox_quote_v1_config c WHERE c.client_id = p_client_id;
  ELSIF p_version = 'v3' THEN
    SELECT c.form_content INTO v_content FROM public.sandbox_quote_v3_config c WHERE c.client_id = p_client_id;
  ELSE
    SELECT c.form_content INTO v_content FROM public.client_dtt_form_config c WHERE c.client_id = p_client_id;
  END IF;
  v_picker := COALESCE(v_content -> 'diamondPicker', '{}'::jsonb);

  -- ══════════════════════════════════════════════════════════════════════
  -- V1 / V2: first-release picker (Ring OS catalogue if configured, else pool).
  -- ══════════════════════════════════════════════════════════════════════
  IF COALESCE(p_version, 'v2') <> 'v3' THEN
    SELECT ARRAY(SELECT DISTINCT UPPER(TRIM(c)) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_picker -> 'colors') = 'array' THEN v_picker -> 'colors' ELSE '[]'::jsonb END) c WHERE TRIM(c) <> '')
      INTO v_colors;
    SELECT ARRAY(SELECT DISTINCT UPPER(TRIM(c)) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_picker -> 'clarities') = 'array' THEN v_picker -> 'clarities' ELSE '[]'::jsonb END) c WHERE TRIM(c) <> '')
      INTO v_clarities;
    v_markup := GREATEST(COALESCE(NULLIF(v_picker ->> 'markupPercent', '')::numeric, 0), 0);

    -- Same test Ring OS uses: a confirmed catalogue filter, or legacy presets.
    SELECT EXISTS (
             SELECT 1 FROM public.client_diamond_catalog_filter f
             WHERE f.client_id = p_client_id AND f.is_confirmed = true
            )
        OR EXISTS (
             SELECT 1 FROM public.client_diamond_presets cdp
             WHERE cdp.client_id = p_client_id AND cdp.is_enabled = true
           )
      INTO v_has_catalog;

    IF v_has_catalog THEN
      -- Ring OS stones and prices, untouched (markup already applied there).
      RETURN QUERY
      SELECT
        d.pool_id,
        d.stone_type,
        d.shape_id,
        d.carat_value,
        UPPER(d.color)   AS color,
        UPPER(d.clarity) AS clarity,
        COALESCE(d.custom_price, d.base_price) AS price,
        COALESCE(d.report_no, ip.report_no)    AS report_no,
        ip.lab,
        ip.pdf,
        'catalog'::text AS source
      FROM public.get_diamond_presets_filtered(
             p_client_id, p_stone_type, p_shape_id, NULL, NULL, NULL, 5000, 0
           ) d
      LEFT JOIN public.diamond_inventory_pool ip ON ip.id = d.pool_id
      WHERE COALESCE(d.is_enabled, true)
        AND COALESCE(d.custom_price, d.base_price) > 0
        AND (p_carat_min IS NULL OR d.carat_value >= p_carat_min)
        AND (p_carat_max IS NULL OR d.carat_value <= p_carat_max)
        AND (COALESCE(array_length(v_colors, 1), 0)    = 0 OR UPPER(d.color)   = ANY(v_colors))
        AND (COALESCE(array_length(v_clarities, 1), 0) = 0 OR UPPER(d.clarity) = ANY(v_clarities))
      ORDER BY COALESCE(d.custom_price, d.base_price) ASC, d.carat_value ASC
      LIMIT v_limit;
      RETURN;
    END IF;

    -- No catalogue configured: the complete pool (one healthy representative
    -- per type / shape / half-carat bucket / colour / clarity).
    RETURN QUERY
    SELECT
      g.id            AS pool_id,
      g.stone_type,
      g.shape_id,
      g.carat_value,
      g.color,
      g.clarity,
      ROUND(g.raw_price * (1 + v_markup / 100.0), 2) AS price,
      COALESCE(g.report_no, ip.report_no) AS report_no,
      ip.lab,
      ip.pdf,
      'pool'::text AS source
    FROM public.diamond_pool_group_reps g
    LEFT JOIN public.diamond_inventory_pool ip ON ip.id = g.id
    WHERE g.raw_price > 0
      AND (p_stone_type IS NULL OR g.stone_type = LOWER(p_stone_type))
      AND (p_shape_id   IS NULL OR g.shape_id   = LOWER(p_shape_id))
      AND (p_carat_min  IS NULL OR g.carat_value >= p_carat_min)
      AND (p_carat_max  IS NULL OR g.carat_value <= p_carat_max)
      AND (COALESCE(array_length(v_colors, 1), 0)    = 0 OR g.color   = ANY(v_colors))
      AND (COALESCE(array_length(v_clarities, 1), 0) = 0 OR g.clarity = ANY(v_clarities))
    ORDER BY ROUND(g.raw_price * (1 + v_markup / 100.0), 2) ASC, g.carat_value ASC
    LIMIT v_limit;
    RETURN;
  END IF;

  -- ══════════════════════════════════════════════════════════════════════
  -- V3: own Diamond Configuration — the complete pool narrowed by the filter.
  -- ══════════════════════════════════════════════════════════════════════
  v_filter := COALESCE(v_picker -> 'filter', '{}'::jsonb);
  IF jsonb_typeof(v_filter) <> 'object' THEN v_filter := '{}'::jsonb; END IF;

  v_markup_n := GREATEST(COALESCE(NULLIF(v_picker ->> 'markupNatural', '')::numeric, 0), 0);
  v_markup_l := GREATEST(COALESCE(NULLIF(v_picker ->> 'markupLab', '')::numeric, 0), 0);

  v_stone  := ARRAY(SELECT LOWER(jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_filter -> 'stoneTypes') = 'array' THEN v_filter -> 'stoneTypes' ELSE '[]'::jsonb END)));
  v_ranges := ARRAY(SELECT (jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_filter -> 'caratRanges') = 'array' THEN v_filter -> 'caratRanges' ELSE '[]'::jsonb END))::numeric);
  v_pmin_n := NULLIF(v_filter ->> 'priceMinNatural', '')::numeric;
  v_pmax_n := NULLIF(v_filter ->> 'priceMaxNatural', '')::numeric;
  v_pmin_l := NULLIF(v_filter ->> 'priceMinLab', '')::numeric;
  v_pmax_l := NULLIF(v_filter ->> 'priceMaxLab', '')::numeric;
  IF (v_filter ->> 'priceSort') = 'high_to_low' THEN v_sort_dir := -1; END IF;

  -- Stone type is decided here (lg = 'lab'), not by the shared matcher, which
  -- still looks for the old 'Y' flag. Everything else goes through the matcher.
  v_filter := v_filter - 'stoneTypes';

  RETURN QUERY
  WITH cand AS (
    SELECT
      ip.id,
      CASE WHEN LOWER(COALESCE(ip.lg, '')) = 'lab' THEN 'lab' ELSE 'natural' END          AS stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(ip.shape, ''), '\s+', ' ', 'g'), ' ', 1)) AS shape_id,
      FLOOR(COALESCE(ip.carats, 0)::float8 * 2) / 2                                       AS carat_bucket,
      ip.carats                                                                           AS carat_value,
      UPPER(COALESCE(ip.col, ''))                                                         AS color,
      UPPER(COALESCE(ip.clar, ''))                                                        AS clarity,
      ip.price                                                                            AS raw_price,
      ip.report_no,
      ip.lab,
      ip.pdf,
      COALESCE(ip.price, 0)::float8 / NULLIF(ip.carats, 0)::float8                        AS ppc
    FROM public.diamond_inventory_pool ip
    WHERE ip.price > 0 AND ip.carats > 0
      AND public.diamond_pool_row_matches(ip, v_filter)
  ),
  scoped AS (
    SELECT c.*
    FROM cand c
    WHERE (COALESCE(array_length(v_stone, 1), 0) = 0 OR c.stone_type = ANY(v_stone))
      AND (p_stone_type IS NULL OR c.stone_type = LOWER(p_stone_type))
      AND (p_shape_id   IS NULL OR c.shape_id   = LOWER(p_shape_id))
      AND (p_carat_min  IS NULL OR c.carat_value >= p_carat_min)
      AND (p_carat_max  IS NULL OR c.carat_value <= p_carat_max)
      AND (COALESCE(array_length(v_ranges, 1), 0) = 0 OR c.carat_bucket::numeric = ANY(v_ranges))
      AND (
        (c.stone_type <> 'lab'
         AND (v_pmin_n IS NULL OR c.raw_price >= v_pmin_n)
         AND (v_pmax_n IS NULL OR c.raw_price <= v_pmax_n))
        OR
        (c.stone_type = 'lab'
         AND (v_pmin_l IS NULL OR c.raw_price >= v_pmin_l)
         AND (v_pmax_l IS NULL OR c.raw_price <= v_pmax_l))
      )
  ),
  -- Same price-per-carat sanity rule as the Ring OS representative view.
  healthy AS (
    SELECT s.*
    FROM scoped s
    LEFT JOIN public.diamond_pool_grade_stats st
      ON  st.stone_type = s.stone_type
      AND st.shape_id   = s.shape_id
      AND st.carat_bucket::float8 = s.carat_bucket
      AND st.color      = s.color
      AND st.clarity    = s.clarity
    WHERE (st.median_ppc IS NULL OR st.group_size < 4 OR s.ppc IS NULL OR s.ppc <= st.median_ppc * 3)
  ),
  -- One stone per type / shape / half-carat bucket / colour / clarity (cheapest).
  reps AS (
    SELECT DISTINCT ON (h.stone_type, h.shape_id, h.carat_bucket, h.color, h.clarity)
      h.*
    FROM healthy h
    ORDER BY h.stone_type, h.shape_id, h.carat_bucket, h.color, h.clarity, h.raw_price ASC, h.report_no NULLS LAST
  ),
  priced AS (
    SELECT
      r.id AS pool_id,
      r.stone_type,
      r.shape_id,
      r.carat_value,
      r.color,
      r.clarity,
      ROUND(r.raw_price * (1 + (CASE WHEN r.stone_type = 'lab' THEN v_markup_l ELSE v_markup_n END) / 100.0), 2) AS price,
      r.report_no,
      r.lab,
      r.pdf
    FROM reps r
  )
  SELECT
    p.pool_id, p.stone_type, p.shape_id, p.carat_value, p.color, p.clarity, p.price, p.report_no, p.lab, p.pdf,
    'pool'::text AS source
  FROM priced p
  ORDER BY p.price * v_sort_dir ASC, p.carat_value ASC
  LIMIT v_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_quote_estimator_diamonds(uuid, text, text, text, numeric, numeric, integer)
  TO anon, authenticated, service_role;