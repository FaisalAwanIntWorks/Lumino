
CREATE OR REPLACE FUNCTION public.generate_notification_from_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  notif_category text;
  notif_title text;
  notif_message text;
BEGIN
  -- Skip low-value events — no notification needed
  IF NEW.action_type IN ('login', 'logout', 'password_change', 'view_page', 'export_data') THEN
    RETURN NEW;
  END IF;

  -- Map action categories to notification categories
  CASE NEW.action_category
    WHEN 'catalog' THEN notif_category := 'system';
    WHEN 'staff_management' THEN notif_category := 'staff';
    WHEN 'settings' THEN notif_category := 'account';
    WHEN 'orders' THEN notif_category := 'order';
    WHEN 'design' THEN notif_category := 'lead';
    WHEN 'shopify' THEN notif_category := 'system';
    WHEN 'ai_configuration' THEN notif_category := 'system';
    ELSE notif_category := 'system';
  END CASE;

  -- Map action types to titles with better business context
  CASE NEW.action_type
    WHEN 'staff_create' THEN notif_title := 'New Staff Member Added';
    WHEN 'staff_delete' THEN notif_title := 'Staff Member Removed';
    WHEN 'staff_update' THEN notif_title := 'Staff Member Updated';
    WHEN 'staff_permission_update' THEN notif_title := 'Staff Permissions Changed';
    WHEN 'order_create' THEN notif_title := 'New Order Received';
    WHEN 'order_update' THEN notif_title := 'Order Updated';
    WHEN 'order_status_change' THEN notif_title := 'Order Status Updated';
    WHEN 'design_save' THEN notif_title := 'New Lead Saved';
    WHEN 'design_delete' THEN notif_title := 'Design Removed';
    WHEN 'design_request_create' THEN notif_title := 'New Design Request';
    WHEN 'design_request_update' THEN notif_title := 'Design Request Updated';
    WHEN 'settings_update' THEN notif_title := 'Settings Updated';
    WHEN 'branding_update' THEN notif_title := 'Branding Updated';
    WHEN 'embed_update' THEN notif_title := 'Embed Settings Updated';
    WHEN 'profile_update' THEN notif_title := 'Profile Updated';
    WHEN 'catalog_generate' THEN notif_title := 'Catalog Generated';
    WHEN 'catalog_reset' THEN notif_title := 'Catalog Reset';
    WHEN 'catalog_update' THEN notif_title := 'Catalog Updated';
    WHEN 'catalog_item_enable' THEN notif_title := 'Catalog Item Enabled';
    WHEN 'catalog_item_disable' THEN notif_title := 'Catalog Item Disabled';
    WHEN 'catalog_price_update' THEN notif_title := 'Catalog Price Updated';
    WHEN 'shopify_connect' THEN notif_title := 'Shopify Connected';
    WHEN 'shopify_disconnect' THEN notif_title := 'Shopify Disconnected';
    WHEN 'shopify_sync' THEN notif_title := 'Shopify Synced';
    WHEN 'shopify_push' THEN notif_title := 'Products Pushed to Shopify';
    WHEN 'ai_config_update' THEN notif_title := 'AI Configuration Updated';
    WHEN 'ai_training_add' THEN notif_title := 'AI Training Data Added';
    WHEN 'ai_training_update' THEN notif_title := 'AI Training Data Updated';
    WHEN 'ai_training_delete' THEN notif_title := 'AI Training Data Removed';
    WHEN 'document_upload' THEN notif_title := 'Document Uploaded';
    WHEN 'document_delete' THEN notif_title := 'Document Removed';
    ELSE notif_title := initcap(replace(NEW.action_type, '_', ' '));
  END CASE;

  -- Use the activity description as the message
  notif_message := NEW.description;

  INSERT INTO public.client_notifications (client_id, category, title, message, metadata)
  VALUES (
    NEW.client_id,
    notif_category,
    notif_title,
    notif_message,
    jsonb_build_object(
      'action_type', NEW.action_type,
      'action_category', NEW.action_category,
      'user_email', NEW.user_email,
      'user_name', NEW.user_name
    )
  );

  RETURN NEW;
END;
$function$;
