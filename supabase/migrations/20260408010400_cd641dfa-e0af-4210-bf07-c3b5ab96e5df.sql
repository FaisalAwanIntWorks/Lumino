-- Trigger function: notify admins on new CAD design request
CREATE OR REPLACE FUNCTION public.notify_new_cad_design_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin_id uuid;
  v_client_name text;
BEGIN
  SELECT company_name INTO v_client_name
  FROM public.clients WHERE id = NEW.client_id;

  FOR v_admin_id IN
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'agency_admin'
  LOOP
    INSERT INTO public.admin_notifications (user_id, category, title, message, metadata)
    VALUES (
      v_admin_id,
      'cad',
      'New CAD Design Request',
      'CAD request from ' || COALESCE(v_client_name, 'a client') || ' — ' || COALESCE(NEW.ring_product_name, NEW.jewelry_type, 'Custom Request'),
      jsonb_build_object('cad_request_id', NEW.id, 'client_id', NEW.client_id, 'source', NEW.source)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_new_cad_design_request
  AFTER INSERT ON public.cad_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_cad_design_request();