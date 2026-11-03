
-- Drop old client overrides table first (FK dependency)
DROP TABLE IF EXISTS public.client_diamond_form_options CASCADE;

-- Drop old unified table
DROP TABLE IF EXISTS public.diamond_form_options CASCADE;

-- ============================================================
-- 1. diamond_nature_options
-- ============================================================
CREATE TABLE public.diamond_nature_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  option_value TEXT NOT NULL UNIQUE,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.diamond_nature_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view diamond_nature_options" ON public.diamond_nature_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage diamond_nature_options" ON public.diamond_nature_options FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));

INSERT INTO public.diamond_nature_options (name, option_value, price, image_url, display_order) VALUES
  ('Natural Diamonds', 'natural', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_nature/Natural+Diamond.png', 1),
  ('Lab Diamonds', 'lab', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_nature/Lab+Diamond.png', 2);

-- ============================================================
-- 2. diamond_shape_options
-- ============================================================
CREATE TABLE public.diamond_shape_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  option_value TEXT NOT NULL UNIQUE,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.diamond_shape_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view diamond_shape_options" ON public.diamond_shape_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage diamond_shape_options" ON public.diamond_shape_options FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));

INSERT INTO public.diamond_shape_options (name, option_value, price, image_url, display_order) VALUES
  ('Round', 'round', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Round.png', 1),
  ('Oval', 'oval', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Oval.png', 2),
  ('Cushion', 'cushion', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Cushion.png', 3),
  ('Radiant', 'radiant', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Radiant.png', 4),
  ('Emerald', 'emerald', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Emerald.png', 5),
  ('Marquise', 'marquise', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Marquise.png', 6),
  ('Dutch Marquise', 'dutch-marquise', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Dutch+Marquise.png', 7),
  ('Old Mine', 'old-mine', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Old+Mine.png', 8),
  ('Moval', 'moval', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Moval.png', 9),
  ('Pear', 'pear', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Pear.png', 10),
  ('Colored Diamond', 'colored-diamond', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Colored+Diamond.png', 11),
  ('Portuguese Cut', 'portuguese-cut', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Portuguese+Cut.png', 12),
  ('Bowtie Free', 'bowtie-free', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Bowtie+Free.png', 13),
  ('Criss Cut', 'criss-cut', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Criss+Cut.png', 14),
  ('Step Cut', 'step-cut', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Step+Cut.png', 15),
  ('Ruby/Sapphire/Emerald', 'ruby-sapphire-emerald', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/ruby_sp_eme.png', 16);

-- ============================================================
-- 3. diamond_size_options
-- ============================================================
CREATE TABLE public.diamond_size_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  option_value TEXT NOT NULL UNIQUE,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.diamond_size_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view diamond_size_options" ON public.diamond_size_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage diamond_size_options" ON public.diamond_size_options FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));

INSERT INTO public.diamond_size_options (name, option_value, price, image_url, display_order) VALUES
  ('1CT', '1ct', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_size/1ct.png', 1),
  ('1.5CT', '1.5ct', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_size/1.5ct.png', 2),
  ('2CT', '2ct', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_size/2ct.png', 3),
  ('2.5CT', '2.5ct', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_size/2.5ct.png', 4),
  ('3CT', '3ct', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_size/3ct.png', 5),
  ('3.5CT', '3.5ct', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_size/3.5ct.png', 6),
  ('4CT', '4ct', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_size/4ct.png', 7),
  ('4.5CT', '4.5ct', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_size/4.5ct.png', 8),
  ('5CT+', '5ct+', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_size/5ct%2B.png', 9);

-- ============================================================
-- 4. diamond_quality_options
-- ============================================================
CREATE TABLE public.diamond_quality_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  option_value TEXT NOT NULL UNIQUE,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.diamond_quality_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view diamond_quality_options" ON public.diamond_quality_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage diamond_quality_options" ON public.diamond_quality_options FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));

INSERT INTO public.diamond_quality_options (name, option_value, price, image_url, display_order) VALUES
  ('F Colour, VS1 Clarity', 'f-vs1', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_quality/F+Colour+VS1+Clarity+(%2B%240).png', 1),
  ('E Colour, VVS2 Clarity', 'e-vvs2', 400, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_quality/E+Colour+VVS2+Clarity+(%2B%24400).png', 2),
  ('D Colour, VVS1 Clarity', 'd-vvs1', 1500, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_quality/D+Colour+VVS1+Clarity+(%2B%241500).png', 3);

-- ============================================================
-- 5. ring_setting_options
-- ============================================================
CREATE TABLE public.ring_setting_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  option_value TEXT NOT NULL UNIQUE,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ring_setting_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view ring_setting_options" ON public.ring_setting_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage ring_setting_options" ON public.ring_setting_options FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));

INSERT INTO public.ring_setting_options (name, option_value, price, image_url, display_order) VALUES
  ('Solitaire - Classic', 'solitaire-classic', 1000, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_setting/Solitaire+-+Classic+(%2B%241000).png', 1),
  ('Cathedral - Classic', 'cathedral-classic', 1000, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_setting/Cathedral+-+Classic+(%2B%241000).png', 2),
  ('Side Stones - Small', 'side-stones-small', 1300, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_setting/Side+Stones+-+Small+(%2B%241300).png', 3),
  ('Side Stones - Large', 'side-stones-large', 1800, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_setting/Side+Stones+-+Large+(%2B%241800).png', 4),
  ('Bypass Setting', 'bypass-setting', 1200, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_setting/Bypass+Setting+(%2B%241200).png', 5),
  ('East-West Setting', 'east-west-setting', 1000, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_setting/East-West+Setting+(%2B%241000).png', 6),
  ('Vintage / Art Deco', 'vintage-art-deco', 1400, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_setting/Vintage_Art+Deco+(%2B%241400).png', 7),
  ('Toi et Moi', 'toi-et-moi', 3000, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_setting/Toi+et+Moi+(%2B%243000).png', 8);

-- ============================================================
-- 6. diamond_holder_options
-- ============================================================
CREATE TABLE public.diamond_holder_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  option_value TEXT NOT NULL UNIQUE,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.diamond_holder_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view diamond_holder_options" ON public.diamond_holder_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage diamond_holder_options" ON public.diamond_holder_options FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));

INSERT INTO public.diamond_holder_options (name, option_value, price, image_url, display_order) VALUES
  ('Gallery Rail - Classic', 'gallery-rail-classic', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_held/Gallery+Rail+-+Classic+(%2B%240).png', 1),
  ('Hidden Halo', 'hidden-halo', 300, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_held/Hidden+Halo+(%2B%24300).png', 2),
  ('Curved Hidden Halo', 'curved-hidden-halo', 350, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_held/Curved+Hidden+Halo+(%2B%24350).png', 3),
  ('Outer Halo', 'outer-halo', 400, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_held/Outer+Halo+(%2B%24400).png', 4),
  ('Tulip Basket', 'tulip-basket', 200, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_held/Tulip+Basket+(%2B%24200).png', 5),
  ('Diamond Basket', 'diamond-basket', 400, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_held/Diamond+Basket+(%2B%24400).png', 6),
  ('Half Bezel', 'half-bezel', 150, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_held/Half+Bezel+(%2B%24150).png', 7),
  ('Full Bezel', 'full-bezel', 200, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_held/Full+Bezel+(%2B%24200).png', 8);

-- ============================================================
-- 7. band_type_options
-- ============================================================
CREATE TABLE public.band_type_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  option_value TEXT NOT NULL UNIQUE,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.band_type_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view band_type_options" ON public.band_type_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage band_type_options" ON public.band_type_options FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));

INSERT INTO public.band_type_options (name, option_value, price, image_url, display_order) VALUES
  ('Regular - Classic', 'regular-classic', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/type_of_band/Regular+-+Classic+(%2B%240).png', 1),
  ('Pave Diamonds', 'pave-diamonds', 300, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/type_of_band/Pave+Diamonds+(%2B%24300).png', 2),
  ('3 Sided Pave', '3-sided-pave', 500, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/type_of_band/3+Sided+Pave+(%2B%24500).png', 3),
  ('Hidden Pave', 'hidden-pave', 400, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/type_of_band/Hidden+Pave+(%2B%24400).png', 4),
  ('Channel Diamonds', 'channel-diamonds', 500, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/type_of_band/Channel+Diamonds+(%2B%24500).png', 5),
  ('Bubble Band', 'bubble-band', 500, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/type_of_band/Bubble+Band+(%2B%24500).png', 6),
  ('Split Shank', 'split-shank', 100, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/type_of_band/Split+Shank+(%2B%24100).png', 7),
  ('Band Engraving', 'band-engraving', 1500, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/type_of_band/Band+Engraving+(%2B%241500).png', 8);

-- ============================================================
-- 8. band_width_options
-- ============================================================
CREATE TABLE public.band_width_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  option_value TEXT NOT NULL UNIQUE,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.band_width_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view band_width_options" ON public.band_width_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage band_width_options" ON public.band_width_options FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));

INSERT INTO public.band_width_options (name, option_value, price, image_url, display_order) VALUES
  ('Thin 1.8mm', 'thin-1.8mm', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/band_width/mm1.png', 1),
  ('Classic 2mm', 'classic-2mm', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/band_width/mm2.png', 2),
  ('Medium 3mm', 'medium-3mm', 300, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/band_width/mm3.png', 3),
  ('Thick 4mm', 'thick-4mm', 400, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/band_width/mm4.png', 4);

-- ============================================================
-- 9. ring_metal_options
-- ============================================================
CREATE TABLE public.ring_metal_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  option_value TEXT NOT NULL UNIQUE,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ring_metal_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view ring_metal_options" ON public.ring_metal_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage ring_metal_options" ON public.ring_metal_options FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));

INSERT INTO public.ring_metal_options (name, option_value, price, image_url, display_order) VALUES
  ('14K Yellow Gold', '14k-yellow-gold', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_metal/14k+Yellow+Gold+(%2B%240).png', 1),
  ('14K White Gold', '14k-white-gold', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_metal/14k+White+Gold+(%2B%240).png', 2),
  ('18K Yellow Gold', '18k-yellow-gold', 400, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_metal/18k+Yellow+Gold+(%2B%24400).png', 3),
  ('18K White Gold', '18k-white-gold', 400, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_metal/18k+White+Gold+(%2B%24400).png', 4),
  ('14K Rose Gold', '14k-rose-gold', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_metal/14k+Rose+Gold+(%2B%240).png', 5),
  ('Platinum', 'platinum', 650, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_metal/Platinum+(%2B%24650).png', 6),
  ('Two Tone Ring', 'two-tone', 500, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_metal/Two+Tone+Ring+(%2B%24500).png', 7);

-- ============================================================
-- 10. personalization_options
-- ============================================================
CREATE TABLE public.personalization_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  option_value TEXT NOT NULL UNIQUE,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.personalization_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view personalization_options" ON public.personalization_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage personalization_options" ON public.personalization_options FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));

INSERT INTO public.personalization_options (name, option_value, price, image_url, display_order) VALUES
  ('Initials Engraving', 'initials-engraving', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/personalized_ring_features/Initials+Engraving+(%2B%240).png', 1),
  ('Hidden Gemstones', 'hidden-gemstones', 150, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/personalized_ring_features/Hidden+Gemstones+(%2B%24150).png', 2),
  ('Bridge Diamonds', 'bridge-diamonds', 300, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/personalized_ring_features/Bridge+Diamonds+(%2B%24300).png', 3),
  ('Bridge Engraving', 'bridge-engraving', 750, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/personalized_ring_features/Bridge+Engraving+(%2B%24750).png', 4),
  ('Euroshank Base', 'euroshank-base', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/personalized_ring_features/Euroshank+Base+(%2B%240).png', 5),
  ('Wedding Band Sit Flush', 'wedding-band-sit-flush', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/personalized_ring_features/Wedding+Band+Sit+Flush+(%2B%240).png', 6),
  ('Low Profile', 'low-profile', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/personalized_ring_features/Low+Profile+(%2B%240).png', 7),
  ('Double Prongs', 'double-prongs', 0, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/personalized_ring_features/Double+Prongs+(%2B%240).png', 8);

-- ============================================================
-- Client overrides table (unified for all 10 step tables)
-- ============================================================
CREATE TABLE public.client_diamond_step_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  step_type TEXT NOT NULL,
  option_id UUID NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  custom_price NUMERIC,
  custom_image_url TEXT,
  display_order INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, step_type, option_id)
);
ALTER TABLE public.client_diamond_step_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage all overrides" ON public.client_diamond_step_overrides FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can manage own overrides" ON public.client_diamond_step_overrides FOR ALL USING (client_id = public.get_user_client_id(auth.uid()));
CREATE POLICY "Public can view overrides" ON public.client_diamond_step_overrides FOR SELECT USING (true);

CREATE INDEX idx_client_diamond_step_overrides_client ON public.client_diamond_step_overrides(client_id, step_type);

-- ============================================================
-- Updated RPC: get_client_diamond_form_options (backward compatible)
-- Returns same shape as before using UNION ALL from all 10 tables
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_client_diamond_form_options(client_uuid uuid)
RETURNS TABLE(
  id uuid,
  step_type text,
  option_value text,
  name text,
  price numeric,
  image_url text,
  display_order integer,
  extra_data jsonb,
  is_enabled boolean,
  has_custom_price boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH all_options AS (
    SELECT o.id, 'nature'::text AS step_type, o.option_value, o.name, o.price, o.image_url, o.display_order FROM diamond_nature_options o
    UNION ALL
    SELECT o.id, 'shape'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM diamond_shape_options o
    UNION ALL
    SELECT o.id, 'size'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM diamond_size_options o
    UNION ALL
    SELECT o.id, 'quality'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM diamond_quality_options o
    UNION ALL
    SELECT o.id, 'setting'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM ring_setting_options o
    UNION ALL
    SELECT o.id, 'holder'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM diamond_holder_options o
    UNION ALL
    SELECT o.id, 'band'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM band_type_options o
    UNION ALL
    SELECT o.id, 'band_width'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM band_width_options o
    UNION ALL
    SELECT o.id, 'metal'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM ring_metal_options o
    UNION ALL
    SELECT o.id, 'personalization'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM personalization_options o
  )
  SELECT
    ao.id,
    ao.step_type,
    ao.option_value,
    ao.name,
    COALESCE(ov.custom_price, ao.price) AS price,
    COALESCE(ov.custom_image_url, ao.image_url) AS image_url,
    COALESCE(ov.display_order, ao.display_order) AS display_order,
    '{}'::jsonb AS extra_data,
    COALESCE(ov.is_enabled, true) AS is_enabled,
    (ov.custom_price IS NOT NULL) AS has_custom_price
  FROM all_options ao
  LEFT JOIN client_diamond_step_overrides ov
    ON ov.option_id = ao.id AND ov.step_type = ao.step_type AND ov.client_id = client_uuid
  ORDER BY ao.step_type, COALESCE(ov.display_order, ao.display_order);
$$;
