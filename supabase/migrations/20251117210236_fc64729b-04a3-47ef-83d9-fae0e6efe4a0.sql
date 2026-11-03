-- Create design_requests table
CREATE TABLE IF NOT EXISTS public.design_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('new_design', 'modification', 'custom_engraving')),
  description TEXT NOT NULL,
  preferred_style TEXT,
  preferred_metal TEXT,
  preferred_stone TEXT,
  budget_range TEXT,
  timeline TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'in_progress', 'completed', 'cancelled')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  admin_notes TEXT,
  estimated_completion DATE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create saved_designs table (lead capture)
CREATE TABLE IF NOT EXISTS public.saved_designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  configuration JSON NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  notes TEXT,
  follow_up_status TEXT DEFAULT 'new' CHECK (follow_up_status IN ('new', 'contacted', 'quote_sent', 'converted', 'not_interested')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create design_comparisons table
CREATE TABLE IF NOT EXISTS public.design_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  configurations JSON[] NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.design_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_comparisons ENABLE ROW LEVEL SECURITY;

-- RLS Policies for design_requests
CREATE POLICY "Admins can view all design requests"
  ON public.design_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'agency_admin'
    )
  );

CREATE POLICY "Clients can view their own design requests"
  ON public.design_requests FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM public.clients WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Clients can create design requests"
  ON public.design_requests FOR INSERT
  WITH CHECK (
    client_id IN (
      SELECT id FROM public.clients WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can update design requests"
  ON public.design_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'agency_admin'
    )
  );

-- RLS Policies for saved_designs
CREATE POLICY "Admins can view all saved designs"
  ON public.saved_designs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'agency_admin'
    )
  );

CREATE POLICY "Clients can view their own saved designs"
  ON public.saved_designs FOR SELECT
  USING (
    client_id IN (
      SELECT id FROM public.clients WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can create saved designs"
  ON public.saved_designs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Clients can update their saved designs"
  ON public.saved_designs FOR UPDATE
  USING (
    client_id IN (
      SELECT id FROM public.clients WHERE user_id = auth.uid()
    )
  );

-- RLS Policies for design_comparisons
CREATE POLICY "Anyone can create comparisons"
  ON public.design_comparisons FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can view their own comparisons"
  ON public.design_comparisons FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);

-- Insert 5 jewelry products with complete data
INSERT INTO public.products (id, agency_id, name, description, category, base_cost, status, image_urls, model_3d_url)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    (SELECT id FROM public.agencies LIMIT 1),
    'Classic Solitaire Engagement Ring',
    'Timeless elegance with a single stunning diamond. Features a delicate band that showcases the center stone beautifully.',
    'Engagement Rings',
    1200,
    'active',
    ARRAY['/assets/rings/solitaire-default.png'],
    '/models/the_crowned_ring.obj'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    (SELECT id FROM public.agencies LIMIT 1),
    'Halo Diamond Engagement Ring',
    'A brilliant center stone surrounded by a halo of smaller diamonds for maximum sparkle and presence.',
    'Engagement Rings',
    1800,
    'active',
    ARRAY['/assets/rings/three-stone-default.jpg'],
    '/models/the_crowned_ring.obj'
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    (SELECT id FROM public.agencies LIMIT 1),
    'Three Stone Anniversary Ring',
    'Symbolizing past, present, and future. Three perfectly matched stones in a classic setting.',
    'Anniversary Rings',
    2200,
    'active',
    ARRAY['/assets/rings/three-stone-default.jpg'],
    '/models/the_crowned_ring.obj'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    (SELECT id FROM public.agencies LIMIT 1),
    'Vintage Art Deco Ring',
    'Inspired by 1920s glamour with intricate milgrain details and geometric patterns.',
    'Vintage Rings',
    1500,
    'active',
    ARRAY['/assets/rings/solitaire-default.png'],
    '/models/the_crowned_ring.obj'
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    (SELECT id FROM public.agencies LIMIT 1),
    'Modern Tension Set Ring',
    'Contemporary design where the diamond appears to float between two bands through tension.',
    'Modern Rings',
    1900,
    'active',
    ARRAY['/assets/rings/solitaire-default.png'],
    '/models/the_crowned_ring.obj'
  )
ON CONFLICT (id) DO NOTHING;

-- Insert product variations for each product
INSERT INTO public.product_variations (product_id, style, metal, shape, stone_type, carat, shank, additional_cost, is_active)
VALUES
  -- Solitaire variations
  ('11111111-1111-1111-1111-111111111111', 'solitaire', 'white-gold', 'round', 'natural', 1.0, 'classic', 0, true),
  ('11111111-1111-1111-1111-111111111111', 'solitaire', 'yellow-gold', 'round', 'natural', 1.0, 'classic', 100, true),
  ('11111111-1111-1111-1111-111111111111', 'solitaire', 'rose-gold', 'round', 'natural', 1.0, 'classic', 150, true),
  ('11111111-1111-1111-1111-111111111111', 'solitaire', 'platinum', 'round', 'natural', 1.0, 'classic', 500, true),
  ('11111111-1111-1111-1111-111111111111', 'solitaire', 'white-gold', 'princess', 'natural', 1.0, 'classic', 200, true),
  ('11111111-1111-1111-1111-111111111111', 'solitaire', 'white-gold', 'oval', 'natural', 1.0, 'classic', 250, true),
  ('11111111-1111-1111-1111-111111111111', 'solitaire', 'white-gold', 'round', 'lab', 1.0, 'classic', -300, true),
  ('11111111-1111-1111-1111-111111111111', 'solitaire', 'white-gold', 'round', 'natural', 1.5, 'classic', 800, true),
  ('11111111-1111-1111-1111-111111111111', 'solitaire', 'white-gold', 'round', 'natural', 2.0, 'classic', 1500, true),
  
  -- Halo variations
  ('22222222-2222-2222-2222-222222222222', 'halo', 'white-gold', 'round', 'natural', 1.0, 'pave', 300, true),
  ('22222222-2222-2222-2222-222222222222', 'halo', 'yellow-gold', 'round', 'natural', 1.0, 'pave', 400, true),
  ('22222222-2222-2222-2222-222222222222', 'halo', 'rose-gold', 'round', 'natural', 1.0, 'pave', 450, true),
  ('22222222-2222-2222-2222-222222222222', 'halo', 'platinum', 'round', 'natural', 1.0, 'pave', 700, true),
  ('22222222-2222-2222-2222-222222222222', 'halo', 'white-gold', 'cushion', 'natural', 1.0, 'pave', 400, true),
  ('22222222-2222-2222-2222-222222222222', 'halo', 'white-gold', 'round', 'lab', 1.0, 'pave', 0, true),
  ('22222222-2222-2222-2222-222222222222', 'halo', 'white-gold', 'round', 'natural', 1.5, 'pave', 1000, true),
  
  -- Three Stone variations
  ('33333333-3333-3333-3333-333333333333', 'three-stone', 'white-gold', 'round', 'natural', 1.0, 'classic', 500, true),
  ('33333333-3333-3333-3333-333333333333', 'three-stone', 'yellow-gold', 'round', 'natural', 1.0, 'classic', 600, true),
  ('33333333-3333-3333-3333-333333333333', 'three-stone', 'platinum', 'round', 'natural', 1.0, 'classic', 900, true),
  ('33333333-3333-3333-3333-333333333333', 'three-stone', 'white-gold', 'emerald', 'natural', 1.0, 'classic', 700, true),
  ('33333333-3333-3333-3333-333333333333', 'three-stone', 'white-gold', 'round', 'natural', 1.5, 'classic', 1200, true),
  
  -- Vintage variations
  ('44444444-4444-4444-4444-444444444444', 'vintage', 'white-gold', 'round', 'natural', 1.0, 'vintage', 200, true),
  ('44444444-4444-4444-4444-444444444444', 'vintage', 'yellow-gold', 'round', 'natural', 1.0, 'vintage', 300, true),
  ('44444444-4444-4444-4444-444444444444', 'vintage', 'rose-gold', 'round', 'natural', 1.0, 'vintage', 350, true),
  ('44444444-4444-4444-4444-444444444444', 'vintage', 'white-gold', 'asscher', 'natural', 1.0, 'vintage', 500, true),
  
  -- Modern variations
  ('55555555-5555-5555-5555-555555555555', 'modern', 'white-gold', 'round', 'natural', 1.0, 'tension', 300, true),
  ('55555555-5555-5555-5555-555555555555', 'modern', 'platinum', 'round', 'natural', 1.0, 'tension', 800, true),
  ('55555555-5555-5555-5555-555555555555', 'modern', 'white-gold', 'princess', 'natural', 1.0, 'tension', 400, true),
  ('55555555-5555-5555-5555-555555555555', 'modern', 'white-gold', 'round', 'lab', 1.0, 'tension', 0, true)
ON CONFLICT DO NOTHING;

-- Create additional demo users for clients
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_user_meta_data)
VALUES
  ('c1111111-1111-1111-1111-111111111111', 'brilliant@jewelers.com', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(), now(), '{"name": "Brilliant Jewelers"}'),
  ('c2222222-2222-2222-2222-222222222222', 'diamond@dreams.com', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(), now(), '{"name": "Diamond Dreams"}'),
  ('c3333333-3333-3333-3333-333333333333', 'luxury@gems.com', crypt(gen_random_uuid()::text, gen_salt('bf')), now(), now(), now(), '{"name": "Luxury Gems"}')
ON CONFLICT (id) DO NOTHING;

-- Insert user roles for new demo clients
INSERT INTO public.user_roles (user_id, role)
VALUES
  ('c1111111-1111-1111-1111-111111111111', 'client'),
  ('c2222222-2222-2222-2222-222222222222', 'client'),
  ('c3333333-3333-3333-3333-333333333333', 'client')
ON CONFLICT DO NOTHING;

-- Insert demo client companies
INSERT INTO public.clients (id, user_id, agency_id, company_name, email, status, plan_id)
VALUES
  (
    'd1111111-1111-1111-1111-111111111111',
    'c1111111-1111-1111-1111-111111111111',
    (SELECT id FROM public.agencies LIMIT 1),
    'Brilliant Jewelers',
    'brilliant@jewelers.com',
    'active',
    (SELECT id FROM public.subscription_plans WHERE name = 'Growth' LIMIT 1)
  ),
  (
    'd2222222-2222-2222-2222-222222222222',
    'c2222222-2222-2222-2222-222222222222',
    (SELECT id FROM public.agencies LIMIT 1),
    'Diamond Dreams Co',
    'diamond@dreams.com',
    'active',
    (SELECT id FROM public.subscription_plans WHERE name = 'Professional' LIMIT 1)
  ),
  (
    'd3333333-3333-3333-3333-333333333333',
    'c3333333-3333-3333-3333-333333333333',
    (SELECT id FROM public.agencies LIMIT 1),
    'Luxury Gems Inc',
    'luxury@gems.com',
    'trial',
    (SELECT id FROM public.subscription_plans WHERE name = 'Starter' LIMIT 1)
  )
ON CONFLICT (id) DO NOTHING;

-- Enable products for demo clients with custom pricing
INSERT INTO public.client_products (client_id, product_id, is_enabled, markup_percentage)
VALUES
  ('d1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', true, 150),
  ('d1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', true, 160),
  ('d1111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', true, 140),
  ('d2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', true, 180),
  ('d2222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', true, 175),
  ('d3333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', true, 200)
ON CONFLICT DO NOTHING;

-- Insert dummy orders with CORRECT status values (pending, fulfilled, refunded, canceled)
INSERT INTO public.orders (client_id, product_id, customer_name, customer_email, configuration, total_amount, status, created_at)
VALUES
  ('d1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Sarah Johnson', 'sarah.j@email.com', '{"style":"solitaire","metal":"white-gold","shape":"round","carat":1.5,"stone":"natural"}', 4200, 'fulfilled', now() - interval '45 days'),
  ('d1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Michael Chen', 'mchen@email.com', '{"style":"halo","metal":"platinum","shape":"round","carat":1.0}', 5800, 'fulfilled', now() - interval '15 days'),
  ('d1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Emily Davis', 'emily.d@email.com', '{"style":"solitaire","metal":"rose-gold","shape":"oval","carat":1.0}', 3200, 'pending', now() - interval '5 days'),
  ('d2222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 'James Wilson', 'jwilson@email.com', '{"style":"vintage","metal":"yellow-gold","shape":"round","carat":1.0}', 4500, 'fulfilled', now() - interval '30 days'),
  ('d2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Lisa Anderson', 'landerson@email.com', '{"style":"solitaire","metal":"platinum","shape":"princess","carat":1.5}', 5200, 'pending', now() - interval '2 days'),
  ('d3333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', 'Robert Martinez', 'rmartinez@email.com', '{"style":"modern","metal":"white-gold","shape":"round","carat":1.0}', 3800, 'fulfilled', now() - interval '20 days'),
  ('d1111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Patricia Moore', 'pmoore@email.com', '{"style":"three-stone","metal":"white-gold","shape":"round","carat":1.0}', 4800, 'fulfilled', now() - interval '60 days'),
  ('d2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Thomas Garcia', 'tgarcia@email.com', '{"style":"solitaire","metal":"white-gold","shape":"round","carat":2.0}', 6500, 'fulfilled', now() - interval '40 days'),
  ('d1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Nancy Clark', 'nclark@email.com', '{"style":"halo","metal":"rose-gold","shape":"cushion","carat":1.0}', 5100, 'pending', now() - interval '3 days'),
  ('d2222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 'Daniel Lee', 'dlee@email.com', '{"style":"vintage","metal":"white-gold","shape":"asscher","carat":1.0}', 4700, 'fulfilled', now() - interval '25 days')
ON CONFLICT DO NOTHING;

-- Insert dummy saved designs (leads)
INSERT INTO public.saved_designs (client_id, product_id, customer_name, customer_email, customer_phone, configuration, follow_up_status)
VALUES
  ('d1111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'Jennifer Lee', 'jlee@email.com', '555-0101', '{"style":"solitaire","metal":"white-gold","shape":"round","carat":2.0}', 'contacted'),
  ('d1111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'David Brown', 'dbrown@email.com', NULL, '{"style":"halo","metal":"rose-gold","shape":"cushion","carat":1.0}', 'quote_sent'),
  ('d2222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 'Amanda Taylor', 'ataylor@email.com', '555-0102', '{"style":"vintage","metal":"white-gold","shape":"asscher","carat":1.0}', 'new'),
  ('d2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Christopher White', 'cwhite@email.com', '555-0103', '{"style":"solitaire","metal":"yellow-gold","shape":"oval","carat":1.5}', 'new'),
  ('d1111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Michelle Rodriguez', 'mrodriguez@email.com', '555-0104', '{"style":"three-stone","metal":"platinum","shape":"round","carat":1.0}', 'contacted'),
  ('d3333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', 'Kevin Thompson', 'kthompson@email.com', NULL, '{"style":"modern","metal":"white-gold","shape":"princess","carat":1.0}', 'new')
ON CONFLICT DO NOTHING;

-- Insert dummy design requests
INSERT INTO public.design_requests (client_id, request_type, description, preferred_style, preferred_metal, budget_range, status, priority)
VALUES
  ('d1111111-1111-1111-1111-111111111111', 'new_design', 'Looking for a unique engagement ring with Art Nouveau floral motifs', 'vintage', 'rose-gold', '$3000-$5000', 'in_progress', 'high'),
  ('d2222222-2222-2222-2222-222222222222', 'modification', 'Want to add side stones to existing solitaire design', 'halo', 'white-gold', '$1000-$2000', 'under_review', 'normal'),
  ('d1111111-1111-1111-1111-111111111111', 'custom_engraving', 'Special inscription with date and initials in cursive font', NULL, NULL, 'Under $500', 'completed', 'low'),
  ('d2222222-2222-2222-2222-222222222222', 'new_design', 'Custom wedding band set to match unique engagement ring', 'modern', 'platinum', '$4000-$6000', 'submitted', 'normal'),
  ('d3333333-3333-3333-3333-333333333333', 'modification', 'Resize and add diamond accents to family heirloom ring', 'vintage', 'yellow-gold', '$1500-$2500', 'submitted', 'low')
ON CONFLICT DO NOTHING;