
CREATE OR REPLACE FUNCTION public.notify_new_cad_resize()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid;
  v_client_name text;
BEGIN
  -- Get client company name
  SELECT company_name INTO v_client_name
  FROM public.clients WHERE id = NEW.client_id;

  -- Insert a notification for every agency_admin
  FOR v_admin_id IN
    SELECT ur.user_id FROM public.user_roles ur WHERE ur.role = 'agency_admin'
  LOOP
    INSERT INTO public.admin_notifications (user_id, category, title, message, metadata)
    VALUES (
      v_admin_id,
      'cad',
      'New CAD Resize Request',
      'Resize request from ' || COALESCE(v_client_name, 'a client') || ' — size ' || NEW.current_size || ' → ' || NEW.requested_size,
      jsonb_build_object('resize_request_id', NEW.id, 'client_id', NEW.client_id, 'order_id', NEW.order_id)
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_notify_new_cad_resize
  AFTER INSERT ON public.cad_resize_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_cad_resize();
