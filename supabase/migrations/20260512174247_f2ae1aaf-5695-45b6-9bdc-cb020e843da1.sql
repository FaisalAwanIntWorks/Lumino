CREATE OR REPLACE FUNCTION public._carat_display_name(p_carat numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT to_char(p_carat, 'FM999990.00') || ' – ' || to_char(p_carat + 0.49, 'FM999990.00') || ' ct';
$$;

CREATE OR REPLACE FUNCTION public.sync_carat_options_from_presets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client uuid;
  v_carat  numeric;
  v_has_enabled boolean;
BEGIN
  -- Determine which (client_id, carat_value) pair was affected
  IF TG_OP = 'DELETE' THEN
    v_client := OLD.client_id;
    v_carat  := OLD.carat_value;
  ELSE
    v_client := NEW.client_id;
    v_carat  := NEW.carat_value;
  END IF;

  IF v_client IS NULL OR v_carat IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.client_diamond_presets
    WHERE client_id = v_client
      AND carat_value = v_carat
      AND is_enabled = true
  ) INTO v_has_enabled;

  IF v_has_enabled THEN
    INSERT INTO public.client_carat_options
      (client_id, carat_value, display_name, price_adjustment, is_enabled)
    VALUES
      (v_client, v_carat, public._carat_display_name(v_carat), 0, true)
    ON CONFLICT (client_id, carat_value)
    DO UPDATE SET is_enabled = true;
  ELSE
    UPDATE public.client_carat_options
    SET is_enabled = false
    WHERE client_id = v_client AND carat_value = v_carat;
  END IF;

  -- For UPDATE that changed the carat_value or client_id, also re-evaluate the OLD pair
  IF TG_OP = 'UPDATE' AND (OLD.client_id IS DISTINCT FROM NEW.client_id
                            OR OLD.carat_value IS DISTINCT FROM NEW.carat_value) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.client_diamond_presets
      WHERE client_id = OLD.client_id
        AND carat_value = OLD.carat_value
        AND is_enabled = true
    ) INTO v_has_enabled;

    IF NOT v_has_enabled THEN
      UPDATE public.client_carat_options
      SET is_enabled = false
      WHERE client_id = OLD.client_id AND carat_value = OLD.carat_value;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_carat_options ON public.client_diamond_presets;

CREATE TRIGGER trg_sync_carat_options
AFTER INSERT OR UPDATE OR DELETE ON public.client_diamond_presets
FOR EACH ROW EXECUTE FUNCTION public.sync_carat_options_from_presets();

-- One-time backfill
WITH desired AS (
  SELECT DISTINCT client_id, carat_value
  FROM public.client_diamond_presets
  WHERE is_enabled = true
)
INSERT INTO public.client_carat_options
  (client_id, carat_value, display_name, price_adjustment, is_enabled)
SELECT d.client_id, d.carat_value,
       public._carat_display_name(d.carat_value), 0, true
FROM desired d
ON CONFLICT (client_id, carat_value)
DO UPDATE SET is_enabled = true;
