-- Quote Estimator diamond picker: representatives fast path (supersedes
-- 20261017120000 / drizzle 0034).
--
-- A Diamond Configuration with no (or only broad) restrictions made the
-- previous body scan tens of thousands of pool rows for a type + shape and
-- exceed the public role's 3 s statement timeout, so the form showed "no
-- diamonds". Like Ring OS, the RPC now has two paths:
--   * no "rare" filters (cut, polish, symmetry, fluorescence, lab, length,
--     Canadian-only): read the small pre-computed diamond_pool_group_reps
--     view (one healthy stone per type / shape / bucket / colour / clarity)
--     and join the pool only for the certificate PDF and lab;
--   * rare filters present: scan the pool with indexed predicates, narrowed
--     by the customer's type / shape / carat first (the previous body).
-- Behaviour is otherwise unchanged: pool-only for every version, filter and
-- Natural / Lab markups from form_content.diamondPicker of the version's
-- settings record, first-release keys still honoured.

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
  v_content   jsonb;
  v_picker    jsonb;
  v_filter    jsonb;
  v_stone     text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts      text[]; v_pol    text[]; v_symm   text[]; v_flo  text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric;
  v_ranges    numeric[];
  v_len_min   numeric; v_len_max numeric;
  v_canadian  boolean := false;
  v_pmin_n    numeric; v_pmax_n numeric; v_pmin_l numeric; v_pmax_l numeric;
  v_markup_n  numeric := 0;
  v_markup_l  numeric := 0;
  v_sort_dir  integer := 1;
  v_rare      boolean := false;
  v_req_type  text := NULLIF(LOWER(TRIM(COALESCE(p_stone_type, ''))), '');
  v_req_shape text := NULLIF(LOWER(TRIM(COALESCE(p_shape_id, ''))), '');
  v_limit     integer := LEAST(GREATEST(COALESCE(p_limit, 300), 1), 1000);
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
  v_filter := COALESCE(v_picker -> 'filter', '{}'::jsonb);
  IF jsonb_typeof(v_filter) <> 'object' THEN v_filter := '{}'::jsonb; END IF;
  IF v_filter = '{}'::jsonb THEN
    IF jsonb_typeof(v_picker -> 'colors') = 'array' AND jsonb_array_length(v_picker -> 'colors') > 0 THEN
      v_filter := v_filter || jsonb_build_object('colors', v_picker -> 'colors');
    END IF;
    IF jsonb_typeof(v_picker -> 'clarities') = 'array' AND jsonb_array_length(v_picker -> 'clarities') > 0 THEN
      v_filter := v_filter || jsonb_build_object('clarities', v_picker -> 'clarities');
    END IF;
  END IF;

  v_markup_n := GREATEST(COALESCE(NULLIF(v_picker ->> 'markupNatural', '')::numeric, NULLIF(v_picker ->> 'markupPercent', '')::numeric, 0), 0);
  v_markup_l := GREATEST(COALESCE(NULLIF(v_picker ->> 'markupLab', '')::numeric,     NULLIF(v_picker ->> 'markupPercent', '')::numeric, 0), 0);

  v_stone  := ARRAY(SELECT LOWER(TRIM(x)) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_filter -> 'stoneTypes')   = 'array' THEN v_filter -> 'stoneTypes'   ELSE '[]'::jsonb END) x);
  v_shapes := ARRAY(SELECT LOWER(TRIM(x)) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_filter -> 'shapes')       = 'array' THEN v_filter -> 'shapes'       ELSE '[]'::jsonb END) x);
  v_colors := ARRAY(SELECT UPPER(TRIM(x)) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_filter -> 'colors')       = 'array' THEN v_filter -> 'colors'       ELSE '[]'::jsonb END) x);
  v_clar   := ARRAY(SELECT UPPER(TRIM(x)) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_filter -> 'clarities')    = 'array' THEN v_filter -> 'clarities'    ELSE '[]'::jsonb END) x);
  v_cuts   := ARRAY(SELECT UPPER(TRIM(x)) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_filter -> 'cuts')         = 'array' THEN v_filter -> 'cuts'         ELSE '[]'::jsonb END) x);
  v_pol    := ARRAY(SELECT UPPER(TRIM(x)) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_filter -> 'polish')       = 'array' THEN v_filter -> 'polish'       ELSE '[]'::jsonb END) x);
  v_symm   := ARRAY(SELECT UPPER(TRIM(x)) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_filter -> 'symmetry')     = 'array' THEN v_filter -> 'symmetry'     ELSE '[]'::jsonb END) x);
  v_flo    := ARRAY(SELECT UPPER(TRIM(x)) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_filter -> 'fluorescence') = 'array' THEN v_filter -> 'fluorescence' ELSE '[]'::jsonb END) x);
  v_labs   := ARRAY(SELECT UPPER(TRIM(x)) FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_filter -> 'labs')         = 'array' THEN v_filter -> 'labs'         ELSE '[]'::jsonb END) x);
  v_ranges := ARRAY(SELECT x::numeric FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(v_filter -> 'caratRanges') = 'array' THEN v_filter -> 'caratRanges' ELSE '[]'::jsonb END) x WHERE x ~ '^[0-9]+(\.[0-9]+)?$');
  v_carat_min := NULLIF(v_filter ->> 'caratMin', '')::numeric;
  v_carat_max := NULLIF(v_filter ->> 'caratMax', '')::numeric;
  v_len_min   := NULLIF(v_filter ->> 'lengthMin', '')::numeric;
  v_len_max   := NULLIF(v_filter ->> 'lengthMax', '')::numeric;
  v_canadian  := COALESCE((v_filter ->> 'canadianOnly')::boolean, false);
  v_pmin_n := NULLIF(v_filter ->> 'priceMinNatural', '')::numeric;
  v_pmax_n := NULLIF(v_filter ->> 'priceMaxNatural', '')::numeric;
  v_pmin_l := NULLIF(v_filter ->> 'priceMinLab', '')::numeric;
  v_pmax_l := NULLIF(v_filter ->> 'priceMaxLab', '')::numeric;
  IF (v_filter ->> 'priceSort') = 'high_to_low' THEN v_sort_dir := -1; END IF;

  -- The customer's choice overrides the configured lists when both exist.
  IF v_req_type IS NOT NULL THEN v_stone := ARRAY[v_req_type]; END IF;
  IF p_carat_min IS NOT NULL THEN v_carat_min := GREATEST(COALESCE(v_carat_min, p_carat_min), p_carat_min); END IF;
  IF p_carat_max IS NOT NULL THEN v_carat_max := LEAST(COALESCE(v_carat_max, p_carat_max), p_carat_max); END IF;

  v_rare := COALESCE(array_length(v_cuts, 1), 0) > 0
         OR COALESCE(array_length(v_pol, 1), 0)  > 0
         OR COALESCE(array_length(v_symm, 1), 0) > 0
         OR COALESCE(array_length(v_flo, 1), 0)  > 0
         OR COALESCE(array_length(v_labs, 1), 0) > 0
         OR v_len_min IS NOT NULL OR v_len_max IS NOT NULL
         OR v_canadian;

  -- ── Fast path: pre-computed representatives (one healthy stone per group) ──
  IF NOT v_rare THEN
    RETURN QUERY
    WITH reps AS (
      SELECT g.id, g.stone_type, g.shape_id, g.carat_bucket, g.carat_value, g.color, g.clarity, g.raw_price, g.report_no
      FROM public.diamond_pool_group_reps g
      WHERE g.raw_price > 0
        AND (COALESCE(array_length(v_stone, 1), 0) = 0 OR g.stone_type = ANY(v_stone))
        AND (v_req_shape IS NULL OR g.shape_id = v_req_shape)
        AND (COALESCE(array_length(v_shapes, 1), 0) = 0 OR g.shape_id = ANY(v_shapes))
        AND (COALESCE(array_length(v_colors, 1), 0) = 0 OR g.color   = ANY(v_colors))
        AND (COALESCE(array_length(v_clar, 1), 0)   = 0 OR g.clarity = ANY(v_clar))
        AND (v_carat_min IS NULL OR g.carat_value >= v_carat_min)
        AND (v_carat_max IS NULL OR g.carat_value <= v_carat_max)
        AND (COALESCE(array_length(v_ranges, 1), 0) = 0 OR g.carat_bucket::numeric = ANY(v_ranges))
        AND (
          (g.stone_type <> 'lab'
           AND (v_pmin_n IS NULL OR g.raw_price >= v_pmin_n)
           AND (v_pmax_n IS NULL OR g.raw_price <= v_pmax_n))
          OR
          (g.stone_type = 'lab'
           AND (v_pmin_l IS NULL OR g.raw_price >= v_pmin_l)
           AND (v_pmax_l IS NULL OR g.raw_price <= v_pmax_l))
        )
    ),
    priced AS (
      SELECT
        r.id, r.stone_type, r.shape_id, r.carat_value, r.color, r.clarity,
        ROUND(r.raw_price * (1 + (CASE WHEN r.stone_type = 'lab' THEN v_markup_l ELSE v_markup_n END) / 100.0), 2) AS d_price,
        r.report_no
      FROM reps r
      ORDER BY ROUND(r.raw_price * (1 + (CASE WHEN r.stone_type = 'lab' THEN v_markup_l ELSE v_markup_n END) / 100.0), 2) * v_sort_dir ASC, r.carat_value ASC
      LIMIT v_limit
    )
    SELECT
      q.id, q.stone_type, q.shape_id, q.carat_value, q.color, q.clarity, q.d_price,
      COALESCE(q.report_no, ip.report_no), ip.lab, ip.pdf,
      'pool'::text AS source
    FROM priced q
    LEFT JOIN public.diamond_inventory_pool ip ON ip.id = q.id
    ORDER BY q.d_price * v_sort_dir ASC, q.carat_value ASC;
    RETURN;
  END IF;

  -- ── Rare filters: scan the pool, customer's choice first (indexed) ──
  RETURN QUERY
  WITH base AS MATERIALIZED (
    SELECT
      p.id,
      CASE WHEN LOWER(COALESCE(p.lg, '')) = 'lab' THEN 'lab' ELSE 'natural' END          AS d_stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape, ''), '\s+', ' ', 'g'), ' ', 1)) AS d_shape_id,
      FLOOR(COALESCE(p.carats, 0)::float8 * 2) / 2                                       AS d_bucket,
      p.carats                                                                           AS d_carat,
      UPPER(COALESCE(p.col, ''))                                                         AS d_color,
      UPPER(COALESCE(p.clar, ''))                                                        AS d_clarity,
      p.price                                                                            AS d_raw_price,
      p.report_no                                                                        AS d_report_no,
      p.lab                                                                              AS d_lab,
      p.pdf                                                                              AS d_pdf,
      COALESCE(p.price, 0)::float8 / NULLIF(p.carats, 0)::float8                         AS d_ppc
    FROM public.diamond_inventory_pool p
    WHERE p.price > 0 AND p.carats > 0
      AND (COALESCE(array_length(v_stone, 1), 0) = 0 OR (CASE WHEN LOWER(COALESCE(p.lg, '')) = 'lab' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (v_req_shape IS NULL OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape, ''), '\s+', ' ', 'g'), ' ', 1)) = v_req_shape)
      AND (v_carat_min IS NULL OR COALESCE(p.carats, 0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats, 0) <= v_carat_max)
      AND (COALESCE(array_length(v_shapes, 1), 0) = 0
           OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape, ''), '\s+', ' ', 'g'), ' ', 1)) = ANY(v_shapes)
           OR LOWER(REGEXP_REPLACE(COALESCE(p.shape, ''), '\s+', ' ', 'g')) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors, 1), 0) = 0 OR UPPER(COALESCE(p.col, ''))  = ANY(v_colors))
      AND (COALESCE(array_length(v_clar, 1), 0)   = 0 OR UPPER(COALESCE(p.clar, '')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts, 1), 0) = 0
           OR UPPER(COALESCE(p.cut, '')) = ANY(v_cuts)
           OR NOT (LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape, ''), '\s+', ' ', 'g'), ' ', 1)) = 'round'
                   OR COALESCE(NULLIF(TRIM(COALESCE(p.cut, '')), '-'), '') <> ''))
      AND (COALESCE(array_length(v_pol, 1), 0)  = 0 OR UPPER(COALESCE(p.pol, ''))  = ANY(v_pol))
      AND (COALESCE(array_length(v_symm, 1), 0) = 0 OR UPPER(COALESCE(p.symm, '')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo, 1), 0)  = 0 OR UPPER(COALESCE(p.flo, ''))  = ANY(v_flo))
      AND (COALESCE(array_length(v_labs, 1), 0) = 0 OR UPPER(COALESCE(p.lab, ''))  = ANY(v_labs))
      AND (COALESCE(array_length(v_ranges, 1), 0) = 0 OR (FLOOR(COALESCE(p.carats, 0)::float8 * 2) / 2)::numeric = ANY(v_ranges))
      AND (v_len_min IS NULL OR COALESCE(p.length, 0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length, 0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible, false))
      AND (
        (LOWER(COALESCE(p.lg, '')) <> 'lab'
         AND (v_pmin_n IS NULL OR p.price >= v_pmin_n)
         AND (v_pmax_n IS NULL OR p.price <= v_pmax_n))
        OR
        (LOWER(COALESCE(p.lg, '')) = 'lab'
         AND (v_pmin_l IS NULL OR p.price >= v_pmin_l)
         AND (v_pmax_l IS NULL OR p.price <= v_pmax_l))
      )
  ),
  healthy AS (
    SELECT b.*
    FROM base b
    LEFT JOIN public.diamond_pool_grade_stats st
      ON  st.stone_type = b.d_stone_type
      AND st.shape_id   = b.d_shape_id
      AND st.carat_bucket::float8 = b.d_bucket
      AND st.color      = b.d_color
      AND st.clarity    = b.d_clarity
    WHERE (st.median_ppc IS NULL OR st.group_size < 4 OR b.d_ppc IS NULL OR b.d_ppc <= st.median_ppc * 3)
  ),
  reps AS (
    SELECT DISTINCT ON (h.d_stone_type, h.d_shape_id, h.d_bucket, h.d_color, h.d_clarity)
      h.*
    FROM healthy h
    ORDER BY h.d_stone_type, h.d_shape_id, h.d_bucket, h.d_color, h.d_clarity, h.d_raw_price ASC, h.d_report_no NULLS LAST
  ),
  priced AS (
    SELECT
      r.id, r.d_stone_type, r.d_shape_id, r.d_carat, r.d_color, r.d_clarity,
      ROUND(r.d_raw_price * (1 + (CASE WHEN r.d_stone_type = 'lab' THEN v_markup_l ELSE v_markup_n END) / 100.0), 2) AS d_price,
      r.d_report_no, r.d_lab, r.d_pdf
    FROM reps r
  )
  SELECT
    q.id, q.d_stone_type, q.d_shape_id, q.d_carat, q.d_color, q.d_clarity, q.d_price, q.d_report_no, q.d_lab, q.d_pdf,
    'pool'::text AS source
  FROM priced q
  ORDER BY q.d_price * v_sort_dir ASC, q.d_carat ASC
  LIMIT v_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_quote_estimator_diamonds(uuid, text, text, text, numeric, numeric, integer)
  TO anon, authenticated, service_role;