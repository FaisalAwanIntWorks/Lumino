-- ============================================================
-- Lever 1: Trim supabase_realtime publication
-- ============================================================
DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'saved_designs',
    'grill_form_leads',
    'custom_enquiry_leads',
    'design_requests',
    'appointment_bookings',
    'metal_buying_leads',
    'diamond_form_leads',
    'ai_chat_sessions'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = v_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', v_table);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- Lever 4: Log retention function (90-day trim)
-- ============================================================
CREATE OR REPLACE FUNCTION public.trim_old_log_tables()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cutoff             timestamptz := now() - interval '90 days';
  v_analytics_deleted  bigint := 0;
  v_activity_deleted   bigint := 0;
BEGIN
  DELETE FROM public.analytics_events WHERE created_at < v_cutoff;
  GET DIAGNOSTICS v_analytics_deleted = ROW_COUNT;

  DELETE FROM public.client_activity_logs WHERE created_at < v_cutoff;
  GET DIAGNOSTICS v_activity_deleted = ROW_COUNT;

  RETURN jsonb_build_object(
    'analytics_events_deleted',     v_analytics_deleted,
    'client_activity_logs_deleted', v_activity_deleted,
    'cutoff',                       v_cutoff
  );
END;
$$;

-- ============================================================
-- Lever 2: Storage cleanup function for orphan AI previews
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_orphan_ai_previews()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'storage'
AS $$
DECLARE
  v_cutoff   timestamptz := now() - interval '60 days';
  v_deleted  bigint := 0;
  v_obj      record;
  v_url      text;
  v_referenced boolean;
BEGIN
  FOR v_obj IN
    SELECT id, name
    FROM storage.objects
    WHERE bucket_id = 'diamond-inspiration'
      AND created_at < v_cutoff
      AND (
        name LIKE 'ring-previews/%'
        OR name LIKE 'grillz-previews/%'
        OR name LIKE 'enquiry-previews/%'
      )
  LOOP
    v_url := '/storage/v1/object/public/diamond-inspiration/' || v_obj.name;

    SELECT EXISTS (
      SELECT 1 FROM public.saved_designs
        WHERE configuration::text LIKE '%' || v_obj.name || '%'
      UNION ALL
      SELECT 1 FROM public.grill_form_leads
        WHERE ai_preview_url LIKE '%' || v_obj.name || '%'
      UNION ALL
      SELECT 1 FROM public.custom_enquiry_leads
        WHERE ai_preview_url LIKE '%' || v_obj.name || '%'
      UNION ALL
      SELECT 1 FROM public.cad_requests
        WHERE EXISTS (
          SELECT 1 FROM unnest(COALESCE(reference_images, ARRAY[]::text[])) AS r
          WHERE r LIKE '%' || v_obj.name || '%'
        )
      LIMIT 1
    ) INTO v_referenced;

    IF NOT v_referenced THEN
      DELETE FROM storage.objects WHERE id = v_obj.id;
      v_deleted := v_deleted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('deleted', v_deleted, 'cutoff', v_cutoff);
END;
$$;