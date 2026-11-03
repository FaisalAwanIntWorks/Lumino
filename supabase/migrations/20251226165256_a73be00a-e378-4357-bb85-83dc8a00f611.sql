-- Add color_family column to lookup_metals to link metals to visual colors
ALTER TABLE public.lookup_metals 
ADD COLUMN IF NOT EXISTS color_family TEXT;

-- Update existing metals with their color family and correct prices matching hardcoded defaults
UPDATE public.lookup_metals SET color_family = 'yellow', base_price = 0 WHERE metal_id = '14k-yellow';
UPDATE public.lookup_metals SET color_family = 'rose', base_price = 0 WHERE metal_id = '14k-rose';
UPDATE public.lookup_metals SET color_family = 'yellow', base_price = 450 WHERE metal_id = '18k-yellow';
UPDATE public.lookup_metals SET color_family = 'white', base_price = 450 WHERE metal_id = '18k-white';
UPDATE public.lookup_metals SET color_family = 'white', base_price = 600 WHERE metal_id = 'platinum';

-- Insert 18K Rose Gold if not exists (matching hardcoded default)
INSERT INTO public.lookup_metals (metal_id, metal_name, color_hex, base_price, display_order, is_active, color_family)
VALUES ('18k-rose', '18K Rose Gold', '#E0BFB8', 450, 6, true, 'rose')
ON CONFLICT DO NOTHING;