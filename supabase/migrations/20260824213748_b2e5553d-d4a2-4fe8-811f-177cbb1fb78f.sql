-- Zero-cost lead quality gate for the Quote Estimator
ALTER TABLE public.diamond_form_leads
  ADD COLUMN IF NOT EXISTS phone_quality text,
  ADD COLUMN IF NOT EXISTS phone_quality_reasons jsonb,
  ADD COLUMN IF NOT EXISTS submission_ms integer;

ALTER TABLE public.diamond_form_leads
  DROP CONSTRAINT IF EXISTS diamond_form_leads_phone_quality_check;
ALTER TABLE public.diamond_form_leads
  ADD CONSTRAINT diamond_form_leads_phone_quality_check
  CHECK (phone_quality IS NULL OR phone_quality IN ('high','medium','low'));

ALTER TABLE public.client_dtt_form_config
  ADD COLUMN IF NOT EXISTS enable_lead_quality_scoring boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS block_disposable_email boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dedupe_window_minutes integer NOT NULL DEFAULT 10;

GRANT INSERT (phone_quality, phone_quality_reasons, submission_ms)
  ON public.diamond_form_leads TO anon, authenticated;

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
    submission_ms = COALESCE(NEW.submission_ms, submission_ms)
  WHERE id = existing_id;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_dedupe_diamond_form_lead ON public.diamond_form_leads;
CREATE TRIGGER trg_dedupe_diamond_form_lead
  BEFORE INSERT ON public.diamond_form_leads
  FOR EACH ROW EXECUTE FUNCTION public.dedupe_diamond_form_lead();