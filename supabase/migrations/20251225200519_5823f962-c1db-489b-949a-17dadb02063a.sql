-- Create lookup table for styles
CREATE TABLE public.lookup_styles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  style_id TEXT NOT NULL UNIQUE,
  style_name TEXT NOT NULL,
  description TEXT,
  base_price NUMERIC DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create lookup table for shanks
CREATE TABLE public.lookup_shanks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shank_id TEXT NOT NULL UNIQUE,
  shank_name TEXT NOT NULL,
  description TEXT,
  base_price NUMERIC DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create lookup table for metals
CREATE TABLE public.lookup_metals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  metal_id TEXT NOT NULL UNIQUE,
  metal_name TEXT NOT NULL,
  color_hex TEXT,
  base_price NUMERIC DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create lookup table for visual colors
CREATE TABLE public.lookup_visual_colors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  color_id TEXT NOT NULL UNIQUE,
  color_name TEXT NOT NULL,
  color_hex TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create lookup table for shapes
CREATE TABLE public.lookup_shapes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shape_id TEXT NOT NULL UNIQUE,
  shape_name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert styles with prices from hardcoded data
INSERT INTO public.lookup_styles (style_id, style_name, description, base_price, display_order) VALUES
  ('solitaire', 'Solitaire', 'Classic single stone setting', 1500, 1),
  ('three-stone', 'Three Stone', 'Past, present, and future', 2400, 2),
  ('halo', 'Halo', 'Center stone surrounded by smaller diamonds', 2200, 3),
  ('pave-rail', 'Pavé Rail', 'Diamonds set along the band', 1800, 4);

-- Insert shanks with prices from hardcoded data
INSERT INTO public.lookup_shanks (shank_id, shank_name, description, base_price, display_order) VALUES
  ('high-polish', 'High Polish', 'Smooth, reflective finish', 0, 1),
  ('castel-pave', 'Castel Pavé', 'Castle-style pavé setting', 1000, 2),
  ('3-row-pave', '3 Row Pavé', 'Three rows of pavé diamonds', 2500, 3),
  ('unknown-1', 'Unknown 1', NULL, 0, 4),
  ('unknown-2', 'Unknown 2', NULL, 0, 5),
  ('unknown-3', 'Unknown 3', NULL, 0, 6);

-- Insert metals with prices from hardcoded data
INSERT INTO public.lookup_metals (metal_id, metal_name, color_hex, base_price, display_order) VALUES
  ('14k-yellow', '14K Yellow Gold', '#FFD700', 200, 1),
  ('14k-rose', '14K Rose Gold', '#E0BFB8', 250, 2),
  ('18k-yellow', '18K Yellow Gold', '#FFDF00', 350, 3),
  ('18k-white', '18K White Gold', '#E8E8E8', 300, 4),
  ('platinum', 'Platinum', '#C0C0C0', 500, 5);

-- Insert visual colors from my_master_db_data
INSERT INTO public.lookup_visual_colors (color_id, color_name, color_hex, display_order) VALUES
  ('yellow', 'Yellow Gold', '#FFD700', 1),
  ('rose', 'Rose Gold', '#E0BFB8', 2),
  ('white', 'White Gold / Platinum', '#E8E8E8', 3);

-- Insert shapes from my_master_db_data
INSERT INTO public.lookup_shapes (shape_id, shape_name, display_order) VALUES
  ('round', 'Round', 1),
  ('oval', 'Oval', 2),
  ('princess', 'Princess', 3),
  ('radiant', 'Radiant', 4),
  ('emerald', 'Emerald', 5),
  ('cushion', 'Cushion', 6),
  ('pear', 'Pear', 7),
  ('marquise', 'Marquise', 8);

-- Enable RLS on all lookup tables
ALTER TABLE public.lookup_styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lookup_shanks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lookup_metals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lookup_visual_colors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lookup_shapes ENABLE ROW LEVEL SECURITY;

-- Create read-only policies for all users (lookup tables are public reference data)
CREATE POLICY "Allow public read access to styles" ON public.lookup_styles FOR SELECT USING (true);
CREATE POLICY "Allow public read access to shanks" ON public.lookup_shanks FOR SELECT USING (true);
CREATE POLICY "Allow public read access to metals" ON public.lookup_metals FOR SELECT USING (true);
CREATE POLICY "Allow public read access to visual_colors" ON public.lookup_visual_colors FOR SELECT USING (true);
CREATE POLICY "Allow public read access to shapes" ON public.lookup_shapes FOR SELECT USING (true);

-- Create admin-only policies for modifications using agency_admin role
CREATE POLICY "Allow admin insert to styles" ON public.lookup_styles FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow admin update to styles" ON public.lookup_styles FOR UPDATE USING (public.has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow admin delete to styles" ON public.lookup_styles FOR DELETE USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Allow admin insert to shanks" ON public.lookup_shanks FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow admin update to shanks" ON public.lookup_shanks FOR UPDATE USING (public.has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow admin delete to shanks" ON public.lookup_shanks FOR DELETE USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Allow admin insert to metals" ON public.lookup_metals FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow admin update to metals" ON public.lookup_metals FOR UPDATE USING (public.has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow admin delete to metals" ON public.lookup_metals FOR DELETE USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Allow admin insert to visual_colors" ON public.lookup_visual_colors FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow admin update to visual_colors" ON public.lookup_visual_colors FOR UPDATE USING (public.has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow admin delete to visual_colors" ON public.lookup_visual_colors FOR DELETE USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Allow admin insert to shapes" ON public.lookup_shapes FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow admin update to shapes" ON public.lookup_shapes FOR UPDATE USING (public.has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow admin delete to shapes" ON public.lookup_shapes FOR DELETE USING (public.has_role(auth.uid(), 'agency_admin'));