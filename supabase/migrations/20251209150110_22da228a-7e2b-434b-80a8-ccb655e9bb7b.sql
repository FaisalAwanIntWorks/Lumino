
-- Master ring variants table (576 combinations - pre-populated reference)
CREATE TABLE public.master_ring_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  variant_code TEXT NOT NULL UNIQUE, -- R001-R576
  style TEXT NOT NULL, -- solitaire, three-stone, halo, pave-rail
  shank TEXT NOT NULL, -- high-polish, castel-pave, 3-row-pave, cathedral, twisted, knife-edge
  metal TEXT NOT NULL, -- 14k-yellow, 14k-rose, 18k-yellow, 18k-white, platinum
  visual_color TEXT NOT NULL, -- yellow, rose, white (for asset grouping)
  shape TEXT NOT NULL, -- round, oval, princess, radiant, emerald, cushion, pear, marquise
  product_name TEXT NOT NULL,
  base_price NUMERIC NOT NULL DEFAULT 500,
  image_angle_0 TEXT, -- CDN URL for angle 0
  image_angle_1 TEXT,
  image_angle_2 TEXT,
  image_angle_3 TEXT,
  video_url TEXT,
  model_3d_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Client onboarding preferences (stores questionnaire answers)
CREATE TABLE public.client_onboarding_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  selected_styles TEXT[] NOT NULL DEFAULT '{}',
  selected_shanks TEXT[] NOT NULL DEFAULT '{}',
  selected_metals TEXT[] NOT NULL DEFAULT '{}',
  selected_shapes TEXT[] NOT NULL DEFAULT '{}',
  onboarding_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(client_id)
);

-- Client ring catalog (personalized products based on selections)
CREATE TABLE public.client_ring_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  master_variant_id UUID NOT NULL REFERENCES public.master_ring_variants(id),
  is_enabled BOOLEAN DEFAULT true,
  markup_percentage NUMERIC DEFAULT 100, -- 100% = 2x base price
  custom_price NUMERIC, -- override price if set
  shopify_product_id TEXT, -- populated after Shopify sync
  shopify_variant_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(client_id, master_variant_id)
);

-- Client carat options
CREATE TABLE public.client_carat_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  carat_value NUMERIC NOT NULL, -- 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0
  display_name TEXT NOT NULL, -- "0.5 Carat", "1 Carat", etc.
  is_enabled BOOLEAN DEFAULT true,
  price_adjustment NUMERIC DEFAULT 0, -- additional cost for this carat
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(client_id, carat_value)
);

-- Client size options
CREATE TABLE public.client_size_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  size_value TEXT NOT NULL, -- "4", "4.5", "5", etc.
  is_enabled BOOLEAN DEFAULT true,
  price_adjustment NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(client_id, size_value)
);

-- Enable RLS on all tables
ALTER TABLE public.master_ring_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_onboarding_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_ring_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_carat_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_size_options ENABLE ROW LEVEL SECURITY;

-- RLS Policies for master_ring_variants (public read)
CREATE POLICY "Anyone can view master variants" ON public.master_ring_variants
  FOR SELECT USING (true);

CREATE POLICY "Only admins can manage master variants" ON public.master_ring_variants
  FOR ALL USING (has_role(auth.uid(), 'agency_admin'::app_role));

-- RLS Policies for client_onboarding_preferences
CREATE POLICY "Clients can view their own preferences" ON public.client_onboarding_preferences
  FOR SELECT USING (client_id = get_user_client_id(auth.uid()));

CREATE POLICY "Clients can manage their own preferences" ON public.client_onboarding_preferences
  FOR ALL USING (client_id = get_user_client_id(auth.uid()));

CREATE POLICY "Admins can view all preferences" ON public.client_onboarding_preferences
  FOR SELECT USING (has_role(auth.uid(), 'agency_admin'::app_role));

-- RLS Policies for client_ring_catalog
CREATE POLICY "Clients can view their own catalog" ON public.client_ring_catalog
  FOR SELECT USING (client_id = get_user_client_id(auth.uid()));

CREATE POLICY "Clients can manage their own catalog" ON public.client_ring_catalog
  FOR ALL USING (client_id = get_user_client_id(auth.uid()));

CREATE POLICY "Admins can view all catalogs" ON public.client_ring_catalog
  FOR SELECT USING (has_role(auth.uid(), 'agency_admin'::app_role));

CREATE POLICY "Admins can manage all catalogs" ON public.client_ring_catalog
  FOR ALL USING (has_role(auth.uid(), 'agency_admin'::app_role));

-- RLS Policies for client_carat_options
CREATE POLICY "Clients can view their own carat options" ON public.client_carat_options
  FOR SELECT USING (client_id = get_user_client_id(auth.uid()));

CREATE POLICY "Clients can manage their own carat options" ON public.client_carat_options
  FOR ALL USING (client_id = get_user_client_id(auth.uid()));

CREATE POLICY "Admins can view all carat options" ON public.client_carat_options
  FOR SELECT USING (has_role(auth.uid(), 'agency_admin'::app_role));

-- RLS Policies for client_size_options
CREATE POLICY "Clients can view their own size options" ON public.client_size_options
  FOR SELECT USING (client_id = get_user_client_id(auth.uid()));

CREATE POLICY "Clients can manage their own size options" ON public.client_size_options
  FOR ALL USING (client_id = get_user_client_id(auth.uid()));

CREATE POLICY "Admins can view all size options" ON public.client_size_options
  FOR SELECT USING (has_role(auth.uid(), 'agency_admin'::app_role));

-- Update triggers
CREATE TRIGGER update_client_onboarding_preferences_updated_at
  BEFORE UPDATE ON public.client_onboarding_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_client_ring_catalog_updated_at
  BEFORE UPDATE ON public.client_ring_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
