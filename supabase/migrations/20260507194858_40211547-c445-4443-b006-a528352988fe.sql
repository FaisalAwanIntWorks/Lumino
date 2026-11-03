
-- Function to invalidate AI chat cache for a specific client
CREATE OR REPLACE FUNCTION public.invalidate_client_ai_cache()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_client_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_client_id := OLD.client_id;
  ELSE
    target_client_id := NEW.client_id;
  END IF;

  IF target_client_id IS NOT NULL THEN
    DELETE FROM public.ai_response_cache WHERE client_id = target_client_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to all catalog-related tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'client_ring_catalog',
    'client_diamond_presets',
    'client_metal_variants',
    'client_option_prices',
    'client_carat_options',
    'client_size_options',
    'client_onboarding_preferences',
    'client_diamond_step_overrides'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_invalidate_ai_cache ON public.%I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_invalidate_ai_cache
         AFTER INSERT OR UPDATE OR DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.invalidate_client_ai_cache()',
        t
      );
    END IF;
  END LOOP;
END $$;
