GRANT INSERT ON public.diamond_form_leads TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.diamond_form_leads TO authenticated;
GRANT ALL ON public.diamond_form_leads TO service_role;

GRANT SELECT ON public.client_ghl_integrations TO authenticated;
GRANT ALL ON public.client_ghl_integrations TO service_role;

GRANT SELECT ON public.client_ghl_field_mappings TO authenticated;
GRANT ALL ON public.client_ghl_field_mappings TO service_role;

GRANT SELECT ON public.ghl_sync_logs TO authenticated;
GRANT ALL ON public.ghl_sync_logs TO service_role;

CREATE OR REPLACE FUNCTION public.trigger_dtt_ghl_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  dtt_client_id constant uuid := 'aeec6491-bd1f-4787-97f9-6a47a2ddc8af';
BEGIN
  IF NEW.client_id = dtt_client_id THEN
    PERFORM net.http_post(
      url := 'https://wcfxtsyhrpephimyrpbx.supabase.co/functions/v1/sync-dtt-ghl-lead',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer REMOVED_OLD_PROJECT_KEY'
      ),
      body := jsonb_build_object(
        'client_id', NEW.client_id,
        'lead_id', NEW.id
      ),
      timeout_milliseconds := 5000
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_dtt_ghl_sync_after_diamond_form_insert ON public.diamond_form_leads;
CREATE TRIGGER trg_dtt_ghl_sync_after_diamond_form_insert
AFTER INSERT ON public.diamond_form_leads
FOR EACH ROW
EXECUTE FUNCTION public.trigger_dtt_ghl_sync();