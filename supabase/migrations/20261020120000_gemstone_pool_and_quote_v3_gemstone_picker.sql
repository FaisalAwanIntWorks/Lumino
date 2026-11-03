-- Gemstone pool + Quote Estimator V3 gemstone picker.
--
-- 1. gemstone_inventory_pool (+ _staging): the weekly gemstone CSV (Nivoda
--    export: ID, ReportNo, gemType, carats, Color, Color Shade, Clarity, Cut,
--    Lab, Nivoda Stock Id, Treatment, Mine of Origin, length, width, price,
--    price_per_carat, video, image, markup_price, markup_currency, shape,
--    pdfUrl, ReturnDays). Same replace (staging + atomic swap) / append model
--    as the diamond pool, uploaded from Admin -> Gemstone Pool.
-- 2. swap_gemstone_inventory_pool(): the atomic swap (agency admins only).
-- 3. get_gemstone_pool_gem_types(): per-gemstone counts for the admin page and
--    the V3 Configure card (authenticated users).
-- 4. get_quote_estimator_gemstones(): anon-callable, paginated + sorted list of
--    the pool stones of one gemstone for the V3 "Pick your gemstone" path,
--    priced with the version's form_content.gemstonePicker markup.
-- 5. diamond_form_leads.selected_gemstone: the exact stone the customer picked
--    (mirrors selected_diamond), kept through the dedupe merge.
--
-- Nothing here touches the diamond pool, Ring OS, or V1 / V2.

-- ----------------------------------------------------------------------------
-- 1. Tables
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.gemstone_inventory_pool (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id      text,
  report_no        text,
  gem_type         text,
  carats           numeric,
  color            text,
  color_shade      text,
  clarity          text,
  cut              text,
  lab              text,
  stock_id         text,
  treatment        text,
  mine_of_origin   text,
  length           numeric,
  width            numeric,
  price            numeric,
  price_per_carat  numeric,
  video            text,
  image            text,
  markup_price     numeric,
  markup_currency  text,
  shape            text,
  pdf_url          text,
  return_days      integer,
  import_batch_id  uuid,
  imported_at      timestamptz NOT NULL DEFAULT now()
);
-- [bridge] ensure columns
ALTER TABLE public.gemstone_inventory_pool
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS report_no text,
  ADD COLUMN IF NOT EXISTS gem_type text,
  ADD COLUMN IF NOT EXISTS carats numeric,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS color_shade text,
  ADD COLUMN IF NOT EXISTS clarity text,
  ADD COLUMN IF NOT EXISTS cut text,
  ADD COLUMN IF NOT EXISTS lab text,
  ADD COLUMN IF NOT EXISTS stock_id text,
  ADD COLUMN IF NOT EXISTS treatment text,
  ADD COLUMN IF NOT EXISTS mine_of_origin text,
  ADD COLUMN IF NOT EXISTS length numeric,
  ADD COLUMN IF NOT EXISTS width numeric,
  ADD COLUMN IF NOT EXISTS price numeric,
  ADD COLUMN IF NOT EXISTS price_per_carat numeric,
  ADD COLUMN IF NOT EXISTS video text,
  ADD COLUMN IF NOT EXISTS image text,
  ADD COLUMN IF NOT EXISTS markup_price numeric,
  ADD COLUMN IF NOT EXISTS markup_currency text,
  ADD COLUMN IF NOT EXISTS shape text,
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS return_days integer,
  ADD COLUMN IF NOT EXISTS import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS imported_at timestamptz DEFAULT now();


CREATE TABLE IF NOT EXISTS public.gemstone_inventory_pool_staging (
  LIKE public.gemstone_inventory_pool INCLUDING DEFAULTS INCLUDING CONSTRAINTS
);

COMMENT ON TABLE public.gemstone_inventory_pool IS
  'Weekly gemstone inventory (Nivoda gemstone CSV). Read by the Quote Estimator V3 gemstone picker through get_quote_estimator_gemstones().';
COMMENT ON TABLE public.gemstone_inventory_pool_staging IS
  'Upload target for a "replace" import; swapped into gemstone_inventory_pool by swap_gemstone_inventory_pool().';

-- Normalised gemstone key ("LAPIS LAZULI" -> "lapis-lazuli") matches the V3
-- gemstone card values in src/lib/quote-v3-gemstones.ts.
CREATE OR REPLACE FUNCTION public.gemstone_type_key(p_gem_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT BTRIM(LOWER(REGEXP_REPLACE(COALESCE(p_gem_type, ''), '[^A-Za-z0-9]+', '-', 'g')), '-');
$function$;

CREATE INDEX IF NOT EXISTS gemstone_inventory_pool_gem_key_price_idx
  ON public.gemstone_inventory_pool (public.gemstone_type_key(gem_type), price);
CREATE INDEX IF NOT EXISTS gemstone_inventory_pool_imported_at_idx
  ON public.gemstone_inventory_pool (imported_at DESC);

ALTER TABLE public.gemstone_inventory_pool         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gemstone_inventory_pool_staging ENABLE ROW LEVEL SECURITY;

-- Agency admins manage both tables from the admin page; everyone else reads
-- the pool only through the SECURITY DEFINER RPCs below.
DROP POLICY IF EXISTS "Agency admins manage gemstone pool" ON public.gemstone_inventory_pool;
CREATE POLICY "Agency admins manage gemstone pool"
  ON public.gemstone_inventory_pool
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin'::app_role));

DROP POLICY IF EXISTS "Agency admins manage gemstone pool staging" ON public.gemstone_inventory_pool_staging;
CREATE POLICY "Agency admins manage gemstone pool staging"
  ON public.gemstone_inventory_pool_staging
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin'::app_role));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.gemstone_inventory_pool         TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gemstone_inventory_pool_staging TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Atomic swap (replace mode)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.swap_gemstone_inventory_pool(p_batch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '600s'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'agency_admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.gemstone_inventory_pool_staging;
  IF v_count < 1 THEN
    RAISE EXCEPTION 'staging_empty';
  END IF;

  TRUNCATE TABLE public.gemstone_inventory_pool;

  INSERT INTO public.gemstone_inventory_pool
  SELECT * FROM public.gemstone_inventory_pool_staging;

  UPDATE public.gemstone_inventory_pool SET import_batch_id = p_batch_id WHERE import_batch_id IS NULL;

  TRUNCATE TABLE public.gemstone_inventory_pool_staging;

  RETURN jsonb_build_object('success', true, 'row_count', v_count);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.swap_gemstone_inventory_pool(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. Per-gemstone counts (admin page + Configure card)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_gemstone_pool_gem_types()
RETURNS TABLE(gem_key text, gem_type text, stone_count bigint, min_price numeric, max_price numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.gemstone_type_key(p.gem_type)              AS gem_key,
    MAX(UPPER(BTRIM(COALESCE(p.gem_type, ''))))       AS gem_type,
    COUNT(*)                                          AS stone_count,
    MIN(p.price) FILTER (WHERE p.price > 0)           AS min_price,
    MAX(p.price) FILTER (WHERE p.price > 0)           AS max_price
  FROM public.gemstone_inventory_pool p
  WHERE COALESCE(BTRIM(p.gem_type), '') <> ''
  GROUP BY public.gemstone_type_key(p.gem_type)
  ORDER BY 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_gemstone_pool_gem_types() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. Quote Estimator V3: paginated, sorted stones of one gemstone
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_quote_estimator_gemstones(
  p_client_id uuid,
  p_gem_key   text,
  p_version   text    DEFAULT 'v3',
  p_sort      text    DEFAULT 'low_to_high',
  p_page_size integer DEFAULT 10,
  p_offset    integer DEFAULT 0
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
  ORDER BY p.price * v_sort_dir ASC, p.carats ASC, p.id ASC
  LIMIT v_page_size OFFSET v_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_quote_estimator_gemstones(uuid, text, text, text, integer, integer)
  TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. The picked gemstone on the lead
-- ----------------------------------------------------------------------------
ALTER TABLE public.diamond_form_leads
  ADD COLUMN IF NOT EXISTS selected_gemstone jsonb;
COMMENT ON COLUMN public.diamond_form_leads.selected_gemstone IS
  'Quote Estimator V3 gemstone picker: {poolId, gemKey, gemType, carat, color, colorShade, clarity, cut, shape, lab, treatment, origin, length, width, price, image, video, pdf, reportNo, stockId}. NULL when no exact gemstone was picked.';

-- The public form inserts with column-level grants, so the new column needs
-- the same grant as selected_diamond.
GRANT INSERT (selected_gemstone) ON public.diamond_form_leads TO anon, authenticated;

-- Keep the picked gemstone when a repeat submission inside the dedupe window is
-- merged into the existing lead. Body identical to 20261016090000, plus the
-- selected_gemstone line.
CREATE OR REPLACE FUNCTION public.dedupe_diamond_form_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  win integer;
  existing_id uuid;
BEGIN
  IF NEW.phone_number IS NULL OR btrim(NEW.phone_number) = '' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(dedupe_window_minutes, 0) INTO win
  FROM public.client_dtt_form_config
  WHERE client_id = NEW.client_id;

  IF win IS NULL OR win <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT id INTO existing_id
  FROM public.diamond_form_leads
  WHERE client_id = NEW.client_id
    AND regexp_replace(COALESCE(phone_number,''), '[^0-9]', '', 'g')
        = regexp_replace(NEW.phone_number, '[^0-9]', '', 'g')
    AND created_at > now() - (win || ' minutes')::interval
  ORDER BY created_at DESC
  LIMIT 1;

  IF existing_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.diamond_form_leads SET
    first_name = COALESCE(NEW.first_name, first_name),
    email = COALESCE(NEW.email, email),
    country_code = COALESCE(NEW.country_code, country_code),
    sms_consent = NEW.sms_consent,
    marketing_consent = NEW.marketing_consent,
    diamond_type = COALESCE(NEW.diamond_type, diamond_type),
    diamond_shape = COALESCE(NEW.diamond_shape, diamond_shape),
    diamond_size = COALESCE(NEW.diamond_size, diamond_size),
    diamond_quality = COALESCE(NEW.diamond_quality, diamond_quality),
    diamond_setting = COALESCE(NEW.diamond_setting, diamond_setting),
    diamond_holder = COALESCE(NEW.diamond_holder, diamond_holder),
    diamond_band = COALESCE(NEW.diamond_band, diamond_band),
    diamond_band_width = COALESCE(NEW.diamond_band_width, diamond_band_width),
    diamond_metal = COALESCE(NEW.diamond_metal, diamond_metal),
    diamond_personalization = COALESCE(NEW.diamond_personalization, diamond_personalization),
    ring_size = COALESCE(NEW.ring_size, ring_size),
    other_details = COALESCE(NEW.other_details, other_details),
    diamond_timeline = COALESCE(NEW.diamond_timeline, diamond_timeline),
    estimated_total = COALESCE(NEW.estimated_total, estimated_total),
    inspiration_image_urls = COALESCE(NEW.inspiration_image_urls, inspiration_image_urls),
    phone_quality = COALESCE(NEW.phone_quality, phone_quality),
    phone_quality_reasons = COALESCE(NEW.phone_quality_reasons, phone_quality_reasons),
    submission_ms = COALESCE(NEW.submission_ms, submission_ms),
    selected_diamond = COALESCE(NEW.selected_diamond, selected_diamond),
    selected_gemstone = COALESCE(NEW.selected_gemstone, selected_gemstone)
  WHERE id = existing_id;

  RETURN NULL;
END;
$$;
