-- Add base_price column to my_master_db_data
ALTER TABLE public.my_master_db_data
ADD COLUMN base_price numeric DEFAULT 0;

-- Create function to calculate base_price from lookup tables
CREATE OR REPLACE FUNCTION public.calculate_ring_base_price()
RETURNS TRIGGER AS $$
DECLARE
  style_price numeric := 0;
  shank_price numeric := 0;
  color_price numeric := 0;
  shape_price numeric := 0;
BEGIN
  -- Get style price (matching by style_name)
  SELECT COALESCE(base_price, 0) INTO style_price
  FROM public.lookup_styles
  WHERE style_name = NEW.style_name
  LIMIT 1;

  -- Get shank price (matching by shank_name)
  SELECT COALESCE(base_price, 0) INTO shank_price
  FROM public.lookup_shanks
  WHERE shank_name = NEW.shank_name
  LIMIT 1;

  -- Get color price (visual_color has no price, so we use metals based on visual_color_name)
  -- Note: lookup_visual_colors doesn't have base_price, so we skip this or use 0
  -- If you want to add price to colors later, you can modify this
  color_price := 0;

  -- Get shape price (shapes don't have base_price in current schema, so 0)
  shape_price := 0;

  -- Calculate total base_price
  NEW.base_price := style_price + shank_price + color_price + shape_price;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on INSERT and UPDATE
CREATE TRIGGER calculate_base_price_trigger
BEFORE INSERT OR UPDATE OF style_name, shank_name, visual_color_name, shape_name
ON public.my_master_db_data
FOR EACH ROW
EXECUTE FUNCTION public.calculate_ring_base_price();

-- Update all existing rows to calculate their base_price
UPDATE public.my_master_db_data m
SET base_price = (
  SELECT COALESCE(s.base_price, 0) + COALESCE(sh.base_price, 0)
  FROM (SELECT 1) dummy
  LEFT JOIN public.lookup_styles s ON s.style_name = m.style_name
  LEFT JOIN public.lookup_shanks sh ON sh.shank_name = m.shank_name
);