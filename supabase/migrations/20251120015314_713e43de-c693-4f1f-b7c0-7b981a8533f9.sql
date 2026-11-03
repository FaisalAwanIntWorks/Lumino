-- Fix function search path security issue
DROP TRIGGER IF EXISTS trigger_update_custom_alert_rules_updated_at ON public.custom_alert_rules;
DROP FUNCTION IF EXISTS update_custom_alert_rules_updated_at();

CREATE OR REPLACE FUNCTION update_custom_alert_rules_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_custom_alert_rules_updated_at
  BEFORE UPDATE ON public.custom_alert_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_custom_alert_rules_updated_at();