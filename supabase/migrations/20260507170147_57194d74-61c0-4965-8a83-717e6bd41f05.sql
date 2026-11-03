-- Drop the old check constraint that only allowed yellow/rose/white
ALTER TABLE public.client_metal_variants
  DROP CONSTRAINT IF EXISTS client_metal_variants_color_family_check;

ALTER TABLE public.client_metal_variants
  ADD CONSTRAINT client_metal_variants_color_family_check
  CHECK (color_family IN ('yellow', 'rose', 'white', 'platinum', 'silver'));

-- Now migrate platinum-named variants out of 'white'
UPDATE public.client_metal_variants
SET color_family = 'platinum'
WHERE color_family = 'white'
  AND variant_name ILIKE '%platinum%';