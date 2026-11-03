-- Quote Estimator V3 gemstone picker: carat window.
--
-- The gemstone path now asks for the carat size (the same size cards as the
-- diamond path) before listing stones, and the list shows only the pool stones
-- inside that carat window — like the diamond picker does with
-- get_quote_estimator_diamonds. get_quote_estimator_gemstones gains two
-- optional bounds, p_carat_min / p_carat_max (inclusive); NULL keeps the old
-- behaviour (every carat). The old six-argument signature is dropped so the
-- RPC name resolves to exactly one function.
--
-- Nothing here touches the diamond pool, Ring OS, or V1 / V2.

DROP FUNCTION IF EXISTS public.get_quote_estimator_gemstones(uuid, text, text, text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_quote_estimator_gemstones(
  p_client_id uuid,
  p_gem_key   text,
  p_version   text    DEFAULT 'v3',
  p_sort      text    DEFAULT 'low_to_high',
  p_page_size integer DEFAULT 10,
  p_offset    integer DEFAULT 0,
  p_carat_min numeric DEFAULT NULL,
  p_carat_max numeric DEFAULT NULL
)
RETURNS TABLE(
  pool_id         uuid,
  gem_key         text,
  gem_type        text,
  carats          numeric,
  color           text,
  color_shade     text,
  clarity         text,
  cut             text,
  shape           text,
  lab             text,
  treatment       text,
  mine_of_origin  text,
  length          numeric,
  width           numeric,
  price           numeric,
  price_per_carat numeric,
  image           text,
  video           text,
  pdf_url         text,
  report_no       text,
  stock_id        text,
  total_count     bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_content   jsonb;
  v_picker    jsonb;
  v_markup    numeric := 0;
  v_sort_dir  integer := 1;
  v_key       text := public.gemstone_type_key(p_gem_key);
  v_page_size integer := LEAST(GREATEST(COALESCE(p_page_size, 10), 1), 100);
  v_offset    integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF v_key = '' THEN
    RETURN;
  END IF;

  -- Settings record of the requested version (mirrors the app's storage map).
  IF p_version = 'v1' THEN
    SELECT c.form_content INTO v_content FROM public.sandbox_quote_v1_config c WHERE c.client_id = p_client_id;
  ELSIF p_version = 'v3' THEN
    SELECT c.form_content INTO v_content FROM public.sandbox_quote_v3_config c WHERE c.client_id = p_client_id;
  ELSE
    SELECT c.form_content INTO v_content FROM public.client_dtt_form_config c WHERE c.client_id = p_client_id;
  END IF;

  v_picker := COALESCE(v_content -> 'gemstonePicker', '{}'::jsonb);
  IF jsonb_typeof(v_picker) <> 'object' THEN v_picker := '{}'::jsonb; END IF;
  v_markup := GREATEST(COALESCE(NULLIF(v_picker ->> 'markupPercent', '')::numeric, 0), 0);
  IF p_sort = 'high_to_low' THEN v_sort_dir := -1; END IF;

  RETURN QUERY
  SELECT
    p.id,
    public.gemstone_type_key(p.gem_type),
    UPPER(BTRIM(COALESCE(p.gem_type, ''))),
    p.carats,
    NULLIF(BTRIM(COALESCE(p.color, '')), ''),
    NULLIF(BTRIM(COALESCE(p.color_shade, '')), ''),
    NULLIF(BTRIM(COALESCE(p.clarity, '')), ''),
    NULLIF(BTRIM(COALESCE(p.cut, '')), ''),
    NULLIF(BTRIM(COALESCE(p.shape, '')), ''),
    NULLIF(BTRIM(COALESCE(p.lab, '')), ''),
    NULLIF(BTRIM(COALESCE(p.treatment, '')), ''),
    NULLIF(BTRIM(COALESCE(p.mine_of_origin, '')), ''),
    p.length,
    p.width,
    ROUND(p.price * (1 + v_markup / 100.0), 2),
    CASE WHEN p.carats > 0 THEN ROUND(p.price * (1 + v_markup / 100.0) / p.carats, 2) ELSE NULL END,
    NULLIF(BTRIM(COALESCE(p.image, '')), ''),
    NULLIF(BTRIM(COALESCE(p.video, '')), ''),
    NULLIF(BTRIM(COALESCE(p.pdf_url, '')), ''),
    NULLIF(BTRIM(COALESCE(p.report_no, '')), ''),
    NULLIF(BTRIM(COALESCE(p.stock_id, '')), ''),
    COUNT(*) OVER ()
  FROM public.gemstone_inventory_pool p
  WHERE public.gemstone_type_key(p.gem_type) = v_key
    AND p.price > 0
    -- Carat window of the size card the customer picked (same half-carat buckets as the diamond picker).
    AND (p_carat_min IS NULL OR p.carats >= p_carat_min)
    AND (p_carat_max IS NULL OR p.carats <= p_carat_max)
  ORDER BY p.price * v_sort_dir ASC, p.carats ASC, p.id ASC
  LIMIT v_page_size OFFSET v_offset;
END;
$function$;

COMMENT ON FUNCTION public.get_quote_estimator_gemstones(uuid, text, text, text, integer, integer, numeric, numeric) IS
  'Quote Estimator V3 gemstone picker: one sorted, paged page of the gemstone pool for one gemstone, optionally limited to a carat window, priced with the version''s gemstonePicker markup.';

GRANT EXECUTE ON FUNCTION public.get_quote_estimator_gemstones(uuid, text, text, text, integer, integer, numeric, numeric)
  TO anon, authenticated, service_role;
