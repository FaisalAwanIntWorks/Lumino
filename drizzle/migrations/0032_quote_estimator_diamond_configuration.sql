-- Quote Estimator diamond picker: own "Diamond Configuration" (Sandbox lab).
--
-- The picker no longer borrows a client's Ring OS catalogue. Every account
-- reads the complete JewlX diamond pool, narrowed by the Quote Estimator's own
-- filter saved in `form_content.diamondPicker` of the version's settings
-- record (V1 / V2 / V3 each keep their own), with their own Natural / Lab
-- markup. The filter uses the same JSON keys as the Ring OS catalogue filter
-- (shapes, colours, clarities, cut, polish, symmetry, fluorescence, labs,
-- carat, length, price bounds, price order), so the matcher is shared.
--
-- Nothing here touches Ring OS, client_diamond_catalog_filter, or the pool.

DROP FUNCTION IF EXISTS public.get_quote_estimator_diamonds(uuid, text, text, numeric, numeric, text[], text[], integer, numeric);

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
  v_stone     text[];
  v_ranges    numeric[];
  v_markup_n  numeric := 0;
  v_markup_l  numeric := 0;
  v_pmin_n    numeric; v_pmax_n numeric; v_pmin_l numeric; v_pmax_l numeric;
  v_sort_dir  integer := 1;
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

  -- Legacy keys from the first picker release (colour / clarity lists and a
  -- single markup) still work until the account saves the new configuration.
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