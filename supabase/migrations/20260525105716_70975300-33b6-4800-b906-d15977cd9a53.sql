
CREATE TABLE IF NOT EXISTS public.client_diamond_catalog_filter (
  client_id      uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  filter         jsonb NOT NULL DEFAULT '{}'::jsonb,
  markup_natural numeric NOT NULL DEFAULT 0,
  markup_lab     numeric NOT NULL DEFAULT 0,
  is_confirmed   boolean NOT NULL DEFAULT false,
  confirmed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
-- [bridge] ensure columns
ALTER TABLE public.client_diamond_catalog_filter
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS filter jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS markup_natural numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS markup_lab numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_confirmed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();


ALTER TABLE public.client_diamond_catalog_filter ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cdcf_client_select" ON public.client_diamond_catalog_filter;
DROP POLICY IF EXISTS "cdcf_client_insert" ON public.client_diamond_catalog_filter;
DROP POLICY IF EXISTS "cdcf_client_update" ON public.client_diamond_catalog_filter;
DROP POLICY IF EXISTS "cdcf_client_delete" ON public.client_diamond_catalog_filter;
DROP POLICY IF EXISTS "cdcf_agency_admin_all" ON public.client_diamond_catalog_filter;
DROP POLICY IF EXISTS "cdcf_admin_staff_all"  ON public.client_diamond_catalog_filter;

DROP POLICY IF EXISTS "cdcf_client_select" ON public.client_diamond_catalog_filter;

CREATE POLICY "cdcf_client_select"
  ON public.client_diamond_catalog_filter FOR SELECT
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "cdcf_client_insert" ON public.client_diamond_catalog_filter;

CREATE POLICY "cdcf_client_insert"
  ON public.client_diamond_catalog_filter FOR INSERT
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "cdcf_client_update" ON public.client_diamond_catalog_filter;

CREATE POLICY "cdcf_client_update"
  ON public.client_diamond_catalog_filter FOR UPDATE
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "cdcf_client_delete" ON public.client_diamond_catalog_filter;

CREATE POLICY "cdcf_client_delete"
  ON public.client_diamond_catalog_filter FOR DELETE
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "cdcf_agency_admin_all" ON public.client_diamond_catalog_filter;

CREATE POLICY "cdcf_agency_admin_all"
  ON public.client_diamond_catalog_filter FOR ALL
  USING (public.has_role(auth.uid(), 'agency_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin'::public.app_role));

DROP POLICY IF EXISTS "cdcf_admin_staff_all" ON public.client_diamond_catalog_filter;

CREATE POLICY "cdcf_admin_staff_all"
  ON public.client_diamond_catalog_filter FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_staff_members
                 WHERE user_id = auth.uid() AND status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_staff_members
                      WHERE user_id = auth.uid() AND status = 'active'));

DROP TRIGGER IF EXISTS cdcf_set_updated_at ON public.client_diamond_catalog_filter;

CREATE TRIGGER cdcf_set_updated_at
  BEFORE UPDATE ON public.client_diamond_catalog_filter
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
CREATE OR REPLACE FUNCTION public.diamond_pool_row_matches(
  p_row public.diamond_inventory_pool,
  p_filter jsonb
) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_arr jsonb;
BEGIN
  IF p_filter IS NULL OR p_filter = '{}'::jsonb THEN RETURN true; END IF;

  v_arr := p_filter -> 'stoneTypes';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF (CASE WHEN COALESCE(p_row.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END)
       NOT IN (SELECT jsonb_array_elements_text(v_arr)) THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'shapes';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF LOWER(REGEXP_REPLACE(COALESCE(p_row.shape,''),'\s+',' ','g'))
       NOT IN (SELECT LOWER(jsonb_array_elements_text(v_arr))) THEN
      IF SPLIT_PART(LOWER(COALESCE(p_row.shape,'')),' ',1)
         NOT IN (SELECT LOWER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
    END IF;
  END IF;

  IF (p_filter ? 'caratMin') AND (p_filter->>'caratMin') <> '' THEN
    IF COALESCE(p_row.carats,0) < (p_filter->>'caratMin')::numeric THEN RETURN false; END IF;
  END IF;
  IF (p_filter ? 'caratMax') AND (p_filter->>'caratMax') <> '' THEN
    IF COALESCE(p_row.carats,0) > (p_filter->>'caratMax')::numeric THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'colors';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF UPPER(COALESCE(p_row.col,'')) NOT IN (SELECT UPPER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'clarities';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF UPPER(COALESCE(p_row.clar,'')) NOT IN (SELECT UPPER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'cuts';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF UPPER(COALESCE(p_row.cut,'')) NOT IN (SELECT UPPER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'polish';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF UPPER(COALESCE(p_row.pol,'')) NOT IN (SELECT UPPER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'symmetry';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF UPPER(COALESCE(p_row.symm,'')) NOT IN (SELECT UPPER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'fluorescence';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF UPPER(COALESCE(p_row.flo,'')) NOT IN (SELECT UPPER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'labs';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF UPPER(COALESCE(p_row.lab,'')) NOT IN (SELECT UPPER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
  END IF;

  IF COALESCE((p_filter->>'canadianOnly')::boolean, false) THEN
    IF NOT COALESCE(p_row.canada_mark_eligible, false) THEN RETURN false; END IF;
  END IF;

  IF (p_filter ? 'lengthMin') AND (p_filter->>'lengthMin') <> '' THEN
    IF COALESCE(p_row.length,0) < (p_filter->>'lengthMin')::numeric THEN RETURN false; END IF;
  END IF;
  IF (p_filter ? 'lengthMax') AND (p_filter->>'lengthMax') <> '' THEN
    IF COALESCE(p_row.length,0) > (p_filter->>'lengthMax')::numeric THEN RETURN false; END IF;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_diamond_presets_filtered(
  p_client_id uuid,
  p_stone_type text DEFAULT NULL,
  p_shape_id text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_clarity text DEFAULT NULL,
  p_carat_range text DEFAULT NULL,
  p_page_size integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  stone_type text,
  shape_id text,
  carat_range text,
  carat_value numeric,
  color text,
  clarity text,
  base_price numeric,
  custom_price numeric,
  is_enabled boolean,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filter_row public.client_diamond_catalog_filter%ROWTYPE;
BEGIN
  SELECT * INTO v_filter_row
  FROM public.client_diamond_catalog_filter
  WHERE client_id = p_client_id AND is_confirmed = true;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      cdp.id, cdp.stone_type, cdp.shape_id, cdp.carat_range, cdp.carat_value,
      cdp.color, cdp.clarity, cdp.base_price, cdp.custom_price, cdp.is_enabled,
      COUNT(*) OVER ()::bigint AS total_count
    FROM public.client_diamond_presets cdp
    WHERE cdp.client_id = p_client_id
      AND (p_stone_type  IS NULL OR cdp.stone_type  = p_stone_type)
      AND (p_shape_id    IS NULL OR cdp.shape_id    = p_shape_id)
      AND (p_color       IS NULL OR cdp.color       = p_color)
      AND (p_clarity     IS NULL OR cdp.clarity     = p_clarity)
      AND (p_carat_range IS NULL OR cdp.carat_range = p_carat_range)
    ORDER BY cdp.stone_type, cdp.shape_id, cdp.carat_value, cdp.color, cdp.clarity
    LIMIT p_page_size OFFSET p_offset;
    RETURN;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id,
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END AS stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
      p.carats AS carat_value,
      UPPER(COALESCE(p.col,'')) AS color,
      UPPER(COALESCE(p.clar,'')) AS clarity,
      ROUND(
        COALESCE(p.price,0) *
        (1 + (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN v_filter_row.markup_lab ELSE v_filter_row.markup_natural END) / 100.0)
      , 2) AS base_price
    FROM public.diamond_inventory_pool p
    WHERE public.diamond_pool_row_matches(p, v_filter_row.filter)
  ),
  filtered AS (
    SELECT *,
      FLOOR(carat_value * 2) / 2 AS carat_bucket
    FROM base
    WHERE (p_stone_type IS NULL OR stone_type = p_stone_type)
      AND (p_shape_id   IS NULL OR shape_id   = p_shape_id)
      AND (p_color      IS NULL OR color      = UPPER(p_color))
      AND (p_clarity    IS NULL OR clarity    = UPPER(p_clarity))
  ),
  ranged AS (
    SELECT *,
      TRIM(TO_CHAR(carat_bucket, 'FM0.00')) || '-' ||
      TRIM(TO_CHAR(carat_bucket + 0.49, 'FM0.00')) AS carat_range_str
    FROM filtered
  )
  SELECT
    r.id, r.stone_type, r.shape_id,
    r.carat_range_str AS carat_range,
    r.carat_value, r.color, r.clarity, r.base_price,
    NULL::numeric AS custom_price,
    true AS is_enabled,
    COUNT(*) OVER ()::bigint AS total_count
  FROM ranged r
  WHERE (p_carat_range IS NULL OR r.carat_range_str = p_carat_range)
  ORDER BY r.stone_type, r.shape_id, r.carat_value, r.color, r.clarity
  LIMIT p_page_size OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_diamond_pool_filter_count(
  p_filter jsonb
)
RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.diamond_inventory_pool p
  WHERE public.diamond_pool_row_matches(p, p_filter);
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.diamond_pool_row_matches(public.diamond_inventory_pool, jsonb) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_diamond_pool_filter_count(jsonb) TO authenticated, service_role;
