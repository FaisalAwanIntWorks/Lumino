-- =====================================================================
-- Lead counts per form per device, for the dashboard "Total Leads" tooltips.
--
-- Device comes from device_info (20261101120000_lead_device_info.sql),
-- grouped into the five buckets the dashboards show:
--   iOS -> iphone, iPadOS -> ipad, Android -> android, macOS -> macbook,
--   any other desktop (Windows/Linux/ChromeOS) -> desktop,
--   no device_info (older leads) -> unknown.
-- Mirrors leadDeviceCategory() in src/lib/lead-device.ts.
--
-- Sources use the same keys as client-dashboard-stats leadSources:
--   widget, ring_builder, diamond_form, grill_form, custom_enquiry,
--   booking, metal_iq, metal_iq_bookings
--
-- Returns { "<source>": { "<device>": count, ... }, ... }.
--
-- Access: agency admins may pass NULL (all clients) or any client; a client
-- owner or their staff may only read their own client_id.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_lead_device_breakdown(
  p_client_id uuid DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_role(v_uid, 'agency_admin') THEN
    IF p_client_id IS NULL OR NOT (
      EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.user_id = v_uid)
      OR public.is_staff_of_client(v_uid, p_client_id)
    ) THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;

  WITH leads AS (
    SELECT 'widget'::text AS source, client_id, created_at, device_info FROM saved_designs
    UNION ALL
    SELECT 'ring_builder', client_id, created_at, device_info FROM design_requests
    UNION ALL
    SELECT 'diamond_form', client_id, created_at, device_info FROM diamond_form_leads
    UNION ALL
    SELECT 'grill_form', client_id, created_at, device_info FROM grill_form_leads
    UNION ALL
    SELECT 'custom_enquiry', client_id, created_at, device_info FROM custom_enquiry_leads
    UNION ALL
    SELECT CASE WHEN ring_configuration->>'source' = 'metal_iq' THEN 'metal_iq_bookings' ELSE 'booking' END,
           client_id, created_at, device_info
      FROM appointment_bookings
    UNION ALL
    SELECT 'metal_iq', client_id, created_at, device_info FROM metal_buying_leads
  ),
  categorized AS (
    SELECT source,
           CASE
             WHEN device_info IS NULL THEN 'unknown'
             WHEN device_info->>'os' = 'iOS' THEN 'iphone'
             WHEN device_info->>'os' = 'iPadOS' THEN 'ipad'
             WHEN device_info->>'os' = 'Android' THEN 'android'
             WHEN device_info->>'os' = 'macOS' THEN 'macbook'
             WHEN device_info->>'device_type' = 'desktop' THEN 'desktop'
             ELSE 'unknown'
           END AS device
    FROM leads
    WHERE (p_client_id IS NULL OR client_id = p_client_id)
      AND (p_start IS NULL OR created_at >= p_start)
      AND (p_end IS NULL OR created_at <= p_end)
  ),
  counted AS (
    SELECT source, device, COUNT(*) AS cnt FROM categorized GROUP BY source, device
  ),
  per_source AS (
    SELECT source, jsonb_object_agg(device, cnt) AS devices FROM counted GROUP BY source
  )
  SELECT COALESCE(jsonb_object_agg(source, devices), '{}'::jsonb) INTO v_result FROM per_source;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_lead_device_breakdown(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_lead_device_breakdown(uuid, timestamptz, timestamptz) TO authenticated;
