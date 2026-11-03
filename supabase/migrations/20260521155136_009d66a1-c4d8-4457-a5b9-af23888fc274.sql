DELETE FROM public.client_diamond_presets
WHERE client_id = '9d43af60-4e42-4b48-ac9a-b0fa9e608385'::uuid
  AND (carat_value < 1.50 OR carat_value > 1.99);

UPDATE public.client_carat_options
SET is_enabled = false
WHERE client_id = '9d43af60-4e42-4b48-ac9a-b0fa9e608385'::uuid
  AND (carat_value < 1.50 OR carat_value > 1.99);

UPDATE public.client_carat_options
SET is_enabled = EXISTS (
  SELECT 1
  FROM public.client_diamond_presets p
  WHERE p.client_id = client_carat_options.client_id
    AND p.carat_value = client_carat_options.carat_value
    AND p.is_enabled = true
)
WHERE client_id = '9d43af60-4e42-4b48-ac9a-b0fa9e608385'::uuid;