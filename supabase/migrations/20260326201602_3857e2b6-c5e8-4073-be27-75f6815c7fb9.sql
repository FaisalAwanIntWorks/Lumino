CREATE OR REPLACE FUNCTION public.notify_new_lead()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.client_notifications (client_id, category, title, message, metadata)
  VALUES (
    NEW.client_id,
    'lead',
    'New Lead Received',
    COALESCE(
      'New lead from ' || COALESCE(
        CASE WHEN TG_TABLE_NAME = 'diamond_form_leads' THEN NEW.first_name
             WHEN TG_TABLE_NAME = 'grill_form_leads' THEN NEW.customer_name
             WHEN TG_TABLE_NAME = 'custom_enquiry_leads' THEN NEW.customer_name
             ELSE NEW.customer_name
        END,
        CASE WHEN TG_TABLE_NAME = 'diamond_form_leads' THEN NEW.email
             ELSE NEW.customer_email
        END,
        'a customer'
      ),
      'New lead received'
    ),
    jsonb_build_object('lead_id', NEW.id, 'table', TG_TABLE_NAME)
  );
  RETURN NEW;
EXCEPTION WHEN undefined_column THEN
  -- Fallback if column doesn't exist on trigger table
  INSERT INTO public.client_notifications (client_id, category, title, message, metadata)
  VALUES (
    NEW.client_id,
    'lead',
    'New Lead Received',
    'New lead received',
    jsonb_build_object('lead_id', NEW.id, 'table', TG_TABLE_NAME)
  );
  RETURN NEW;
END;
$function$;