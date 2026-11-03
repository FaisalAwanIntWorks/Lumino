
-- Create notifications table for client dashboard
CREATE TABLE public.client_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  category text NOT NULL, -- 'lead', 'booking', 'order', 'staff', 'account', 'system'
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_client_notifications_client_id ON public.client_notifications(client_id);
CREATE INDEX idx_client_notifications_is_read ON public.client_notifications(client_id, is_read);
CREATE INDEX idx_client_notifications_created_at ON public.client_notifications(client_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.client_notifications ENABLE ROW LEVEL SECURITY;

-- Policy: clients can read their own notifications
CREATE POLICY "Clients can read own notifications"
  ON public.client_notifications FOR SELECT TO authenticated
  USING (
    client_id = public.get_user_client_id(auth.uid())
    OR public.is_staff_of_client(auth.uid(), client_id)
  );

-- Policy: clients can update (mark as read) their own notifications
CREATE POLICY "Clients can update own notifications"
  ON public.client_notifications FOR UPDATE TO authenticated
  USING (
    client_id = public.get_user_client_id(auth.uid())
    OR public.is_staff_of_client(auth.uid(), client_id)
  );

-- Policy: service role and triggers can insert
CREATE POLICY "Service role can insert notifications"
  ON public.client_notifications FOR INSERT
  WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.client_notifications;

-- Create trigger function to auto-generate notifications from activity logs
CREATE OR REPLACE FUNCTION public.generate_notification_from_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  notif_category text;
  notif_title text;
BEGIN
  -- Map action categories to notification categories
  CASE NEW.action_category
    WHEN 'catalog' THEN notif_category := 'system';
    WHEN 'staff_management' THEN notif_category := 'staff';
    WHEN 'settings' THEN notif_category := 'account';
    WHEN 'orders' THEN notif_category := 'order';
    WHEN 'design' THEN notif_category := 'lead';
    WHEN 'shopify' THEN notif_category := 'system';
    WHEN 'ai_configuration' THEN notif_category := 'system';
    WHEN 'authentication' THEN notif_category := 'account';
    ELSE notif_category := 'system';
  END CASE;

  -- Map action types to titles
  CASE NEW.action_type
    WHEN 'staff_create' THEN notif_title := 'New Staff Member Added';
    WHEN 'staff_delete' THEN notif_title := 'Staff Member Removed';
    WHEN 'staff_update' THEN notif_title := 'Staff Member Updated';
    WHEN 'order_create' THEN notif_title := 'New Order Received';
    WHEN 'order_status_change' THEN notif_title := 'Order Status Updated';
    WHEN 'design_save' THEN notif_title := 'New Lead Saved';
    WHEN 'design_request_create' THEN notif_title := 'New Design Request';
    WHEN 'settings_update' THEN notif_title := 'Settings Updated';
    WHEN 'branding_update' THEN notif_title := 'Branding Updated';
    WHEN 'profile_update' THEN notif_title := 'Profile Updated';
    WHEN 'catalog_generate' THEN notif_title := 'Catalog Generated';
    WHEN 'catalog_update' THEN notif_title := 'Catalog Updated';
    WHEN 'shopify_connect' THEN notif_title := 'Shopify Connected';
    WHEN 'shopify_disconnect' THEN notif_title := 'Shopify Disconnected';
    WHEN 'shopify_sync' THEN notif_title := 'Shopify Synced';
    ELSE notif_title := initcap(replace(NEW.action_type, '_', ' '));
  END CASE;

  INSERT INTO public.client_notifications (client_id, category, title, message, metadata)
  VALUES (
    NEW.client_id,
    notif_category,
    notif_title,
    NEW.description,
    jsonb_build_object(
      'action_type', NEW.action_type,
      'action_category', NEW.action_category,
      'user_email', NEW.user_email,
      'user_name', NEW.user_name
    )
  );

  RETURN NEW;
END;
$$;

-- Attach trigger to client_activity_logs
CREATE TRIGGER trg_generate_notification
  AFTER INSERT ON public.client_activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_notification_from_activity();

-- Also create a function to generate notifications for new leads (saved_designs, etc)
CREATE OR REPLACE FUNCTION public.notify_new_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.client_notifications (client_id, category, title, message, metadata)
  VALUES (
    NEW.client_id,
    'lead',
    'New Lead Received',
    COALESCE('New lead from ' || COALESCE(NEW.customer_name, NEW.customer_email, 'a customer'), 'New lead received'),
    jsonb_build_object('lead_id', NEW.id, 'table', TG_TABLE_NAME)
  );
  RETURN NEW;
END;
$$;

-- Trigger for saved_designs
CREATE TRIGGER trg_notify_saved_design
  AFTER INSERT ON public.saved_designs
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_lead();

-- Trigger for design_requests
CREATE TRIGGER trg_notify_design_request
  AFTER INSERT ON public.design_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_lead();

-- Trigger for diamond_form_leads
CREATE TRIGGER trg_notify_diamond_lead
  AFTER INSERT ON public.diamond_form_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_lead();

-- Trigger for grill_form_leads
CREATE TRIGGER trg_notify_grill_lead
  AFTER INSERT ON public.grill_form_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_lead();

-- Trigger for custom_enquiry_leads
CREATE TRIGGER trg_notify_custom_enquiry
  AFTER INSERT ON public.custom_enquiry_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_lead();

-- Trigger for appointment_bookings
CREATE OR REPLACE FUNCTION public.notify_new_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.client_notifications (client_id, category, title, message, metadata)
  VALUES (
    NEW.client_id,
    'booking',
    'New Booking Received',
    'New booking from ' || COALESCE(NEW.customer_name, NEW.customer_email, 'a customer'),
    jsonb_build_object('booking_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_booking
  AFTER INSERT ON public.appointment_bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_booking();

-- Trigger for orders
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
    'New order #' || COALESCE(NEW.shopify_order_number, NEW.id::text),
    jsonb_build_object('order_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_order
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_order();
