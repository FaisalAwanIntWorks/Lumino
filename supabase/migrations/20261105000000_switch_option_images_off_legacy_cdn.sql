-- Stop loading option images from the original owner's CloudFront hosts.
-- Same folder hierarchy, now under our public `cdn-assets` storage bucket
-- (matches src/lib/asset-cdn.ts keys: diamond-catalog, quote-v3).

INSERT INTO storage.buckets (id, name, public)
VALUES ('cdn-assets', 'cdn-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
DECLARE
  base text := 'https://wcfxtsyhrpephimyrpbx.supabase.co/storage/v1/object/public/cdn-assets';
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'diamond_nature_options', 'diamond_shape_options', 'diamond_size_options', 'diamond_quality_options',
    'ring_setting_options', 'diamond_holder_options', 'band_type_options', 'band_width_options', 'personalization_options'
  ] LOOP
    EXECUTE format(
      'UPDATE public.%I SET image_url = replace(replace(image_url, %L, %L), %L, %L)
        WHERE image_url LIKE %L OR image_url LIKE %L',
      t,
      'https://d3hry6a3ciae6y.cloudfront.net', base || '/diamond-catalog',
      'https://d1cekhbdtlmikd.cloudfront.net', base || '/quote-v3',
      '%d3hry6a3ciae6y.cloudfront.net%', '%d1cekhbdtlmikd.cloudfront.net%');
  END LOOP;
END $$;
