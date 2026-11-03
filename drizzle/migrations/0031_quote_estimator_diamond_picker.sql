-- Quote Estimator "mini Nivoda" diamond picker (Sandbox JewlX account first).
--
-- 1. diamond_form_leads.selected_diamond: the exact stone a customer picked on
--    the Quote Estimator (carat/colour/clarity/price + certificate number, lab
--    and certificate PDF), mirrored from Ring OS' report_no / lab / pdf fields.
-- 2. get_quote_estimator_diamonds(): one anon-callable RPC that returns the
--    stones the Quote Estimator may offer. Accounts that configured the Ring OS
--    diamond catalogue (confirmed client_diamond_catalog_filter, or legacy
--    client_diamond_presets rows) get exactly the same stones and prices as
--    their Ring OS widget, via get_diamond_presets_filtered(). Every other
--    account reads the complete JewlX diamond pool (healthy representatives,
--    one per type/shape/bucket/colour/clarity) with an optional markup.
--
-- Nothing here changes Ring OS, the catalogue, or any other widget.

ALTER TABLE public.diamond_form_leads
  ADD COLUMN IF NOT EXISTS selected_diamond jsonb;
COMMENT ON COLUMN public.diamond_form_leads.selected_diamond IS
  'Quote Estimator diamond picker: {poolId, stoneType, shapeId, carat, color, clarity, price, reportNo, lab, pdf, source}. NULL when the customer did not pick an exact stone.';

-- The public form inserts with column-level grants (see the lead quality gate
-- migration), so the new column needs the same grant.
GRANT INSERT (selected_diamond) ON public.diamond_form_leads TO anon, authenticated;

-- Keep the picked stone when a repeat submission inside the dedupe window is
-- merged into the existing lead (the merge uses an explicit column list).
-- Body identical to 20260824213748, plus the selected_diamond line.
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
    selected_diamond = COALESCE(NEW.selected_diamond, selected_diamond)
  WHERE id = existing_id;

  RETURN NULL;
END;
$$;

-- ----------------------------------------------------------------------------
-- Stones the Quote Estimator may offer for one (type, shape, carat window).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_quote_estimator_diamonds(
  p_client_id      uuid,
  p_stone_type     text    DEFAULT NULL,
  p_shape_id       text    DEFAULT NULL,
  p_carat_min      numeric DEFAULT NULL,
  p_carat_max      numeric DEFAULT NULL,
  p_colors         text[]  DEFAULT NULL,
  p_clarities      text[]  DEFAULT NULL,
  p_limit          integer DEFAULT 300,
  p_markup_percent numeric DEFAULT 0
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
  v_has_catalog boolean := false;
  v_colors      text[];
  v_clarities   text[];
  v_limit       integer := LEAST(GREATEST(COALESCE(p_limit, 300), 1), 1000);
  v_markup      numeric := GREATEST(COALESCE(p_markup_percent, 0), 0);
BEGIN
  -- Normalise the optional grade allow-lists (empty array = no restriction).
  SELECT ARRAY(SELECT DISTINCT UPPER(TRIM(c)) FROM unnest(COALESCE(p_colors, '{}'::text[])) c WHERE TRIM(c) <> '')
    INTO v_colors;
  SELECT ARRAY(SELECT DISTINCT UPPER(TRIM(c)) FROM unnest(COALESCE(p_clarities, '{}'::text[])) c WHERE TRIM(c) <> '')
    INTO v_clarities;

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

  -- No catalogue configured: the complete JewlX diamond pool (one healthy
  -- representative per type/shape/half-carat bucket/colour/clarity).
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
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_quote_estimator_diamonds(uuid, text, text, numeric, numeric, text[], text[], integer, numeric)
  TO anon, authenticated, service_role;