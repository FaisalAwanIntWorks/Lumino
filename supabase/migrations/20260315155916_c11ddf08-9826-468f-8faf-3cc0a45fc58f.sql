CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.client_notifications (client_id, category, title, message, metadata)
  VALUES (
    NEW.client_id,
    'order',
    'New Order Received',
    'New order #' || COALESCE(NEW.shopify_order_id, NEW.id::text),
    jsonb_build_object('order_id', NEW.id)
  );
  RETURN NEW;
END;
$$;