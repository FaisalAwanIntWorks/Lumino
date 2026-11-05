-- Point my_master_db_data ring asset URLs at this project's own storage
-- (old Lovable project xyrmsozhjtqxvrviykjf -> wcfxtsyhrpephimyrpbx). Same bucket and object paths.
DO $$
DECLARE
  old_p text := 'https://xyrmsozhjtqxvrviykjf.supabase.co/storage/v1/object/public/ring-assets';
  new_p text := 'https://wcfxtsyhrpephimyrpbx.supabase.co/storage/v1/object/public/ring-assets';
  n bigint;
BEGIN
  UPDATE public.my_master_db_data SET
    image_url_0       = replace(image_url_0, old_p, new_p),
    image_url_1       = replace(image_url_1, old_p, new_p),
    image_url_2       = replace(image_url_2, old_p, new_p),
    image_url_3       = replace(image_url_3, old_p, new_p),
    video_url         = replace(video_url, old_p, new_p),
    model_3d_url      = replace(model_3d_url, old_p, new_p),
    transparent_url_0 = replace(transparent_url_0, old_p, new_p),
    transparent_url_1 = replace(transparent_url_1, old_p, new_p),
    transparent_url_2 = replace(transparent_url_2, old_p, new_p),
    transparent_url_3 = replace(transparent_url_3, old_p, new_p),
    model_photo_url   = replace(model_photo_url, old_p, new_p)
  WHERE concat_ws(' ', image_url_0, image_url_1, image_url_2, image_url_3, video_url, model_3d_url,
                  transparent_url_0, transparent_url_1, transparent_url_2, transparent_url_3, model_photo_url) LIKE '%' || old_p || '%';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE LOG 'my_master_db_data rows updated: %', n;
END $$;
