-- Bridge: objects present in the source database (src/integrations/supabase/types.ts)
-- that no migration creates. Columns / views / helper functions only; no data.

-- 1. Columns
ALTER TABLE public.client_diamond_catalog_filter
  ADD COLUMN IF NOT EXISTS applied_at timestamptz,
  ADD COLUMN IF NOT EXISTS catalog_version text;
ALTER TABLE public.client_diamond_presets
  ADD COLUMN IF NOT EXISTS catalog_version text;
ALTER TABLE public.client_subscriptions
  ADD COLUMN IF NOT EXISTS scheduled_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_schedule_id text;
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS custom_commission_rate numeric;
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS commission_rate numeric;
-- (diamond_pool_grade_stats / group_reps / group_reps_engine are materialized views; their live
--  `currency` column came from source-only Sandbox currency functions and is not reproduced.)

-- 2. Lab/natural classification of a pool row's `lg` value
--    (same rule the preset functions use inline: 'lab' or Y/yes => lab, else natural).
CREATE OR REPLACE FUNCTION public.diamond_pool_stone_type(p_lg text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN lower(btrim(coalesce(p_lg, ''))) LIKE 'lab%'
      OR lower(btrim(coalesce(p_lg, ''))) IN ('y', 'yes', 'true', 'lg')
    THEN 'lab' ELSE 'natural' END;
$$;

-- 3. Refresh the distinct-values cache (called, when present, at the end of a scoring run)
CREATE OR REPLACE FUNCTION public.refresh_diamond_pool_distinct_values()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.diamond_pool_distinct_values_cache (id, "values", pool_rows, refreshed_at)
  VALUES (1, public.get_diamond_pool_distinct_values(),
          (SELECT count(*) FROM public.diamond_inventory_pool), now())
  ON CONFLICT (id) DO UPDATE
    SET "values" = EXCLUDED."values", pool_rows = EXCLUDED.pool_rows, refreshed_at = EXCLUDED.refreshed_at;
END;
$$;
REVOKE ALL ON FUNCTION public.refresh_diamond_pool_distinct_values() FROM PUBLIC, anon, authenticated;

-- 4. CDN helper (points at this project's storage)
CREATE OR REPLACE FUNCTION public.get_asset_cdn_url(p_folder_path text, p_filename text, p_bucket text DEFAULT 'ring-assets')
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_folder_path IS NULL OR p_filename IS NULL THEN NULL
    ELSE 'https://wcfxtsyhrpephimyrpbx.supabase.co/storage/v1/object/public/' ||
         p_bucket || '/' || ltrim(p_folder_path, '/') || '/' || p_filename
  END;
$$;

-- 5. CRM integrations without secrets
CREATE OR REPLACE FUNCTION public.get_client_crm_integrations(p_client_id uuid)
RETURNS TABLE(id uuid, client_id uuid, provider text, webhook_url text, is_active boolean, last_synced_at timestamptz, created_at timestamptz, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ci.id, ci.client_id, ci.provider, ci.webhook_url, ci.is_active, ci.last_synced_at, ci.created_at, ci.updated_at
  FROM public.crm_integrations ci
  WHERE ci.client_id = p_client_id
    AND (p_client_id = public.get_user_client_id(auth.uid()) OR public.has_role(auth.uid(), 'agency_admin'));
$$;

-- security_invoker: the view applies the caller's RLS instead of the owner's.
CREATE OR REPLACE VIEW public.crm_integrations_safe WITH (security_invoker = true) AS
SELECT id, client_id, provider, webhook_url, is_active, last_synced_at, created_at, updated_at
FROM public.crm_integrations;

-- 6. Master products with CDN URLs
DO $v$
BEGIN
  EXECUTE $sql$
  CREATE OR REPLACE VIEW public.master_products_with_urls WITH (security_invoker = true) AS
  SELECT
    m.*,
    public.get_asset_cdn_url(folder_path, image_0_filename) AS cdn_image_url_0,
    public.get_asset_cdn_url(folder_path, image_1_filename) AS cdn_image_url_1,
    public.get_asset_cdn_url(folder_path, image_2_filename) AS cdn_image_url_2,
    public.get_asset_cdn_url(folder_path, image_3_filename) AS cdn_image_url_3,
    public.get_asset_cdn_url(folder_path, video_filename) AS cdn_video_url,
    public.get_asset_cdn_url(folder_path, glb_model_filename) AS cdn_model_url,
    public.get_asset_cdn_url(folder_path, transparent_0_filename) AS cdn_transparent_url_0,
    public.get_asset_cdn_url(folder_path, transparent_1_filename) AS cdn_transparent_url_1,
    public.get_asset_cdn_url(folder_path, transparent_2_filename) AS cdn_transparent_url_2,
    public.get_asset_cdn_url(folder_path, transparent_3_filename) AS cdn_transparent_url_3,
    public.get_asset_cdn_url(folder_path, model_photo_filename) AS cdn_model_photo_url,
    public.get_asset_cdn_url(carotimages_folder_path, carot_image_0_filename) AS cdn_carat_image_url_0,
    public.get_asset_cdn_url(carotimages_folder_path, carot_image_1_filename) AS cdn_carat_image_url_1,
    public.get_asset_cdn_url(carotimages_folder_path, carot_image_2_filename) AS cdn_carat_image_url_2,
    public.get_asset_cdn_url(carotimages_folder_path, carot_image_3_filename) AS cdn_carat_image_url_3,
    public.get_asset_cdn_url(carotimages_folder_path, carot_image_4_filename) AS cdn_carat_image_url_4,
    public.get_asset_cdn_url(carotimages_folder_path, carot_image_5_filename) AS cdn_carat_image_url_5,
    public.get_asset_cdn_url(carotimages_folder_path, carot_image_6_filename) AS cdn_carat_image_url_6,
    public.get_asset_cdn_url(carotimages_folder_path, carot_image_7_filename) AS cdn_carat_image_url_7
  FROM public.my_master_db_data m
  $sql$;
EXCEPTION WHEN undefined_column OR undefined_table THEN
  RAISE WARNING 'master_products_with_urls not created: %', SQLERRM;
END $v$;
