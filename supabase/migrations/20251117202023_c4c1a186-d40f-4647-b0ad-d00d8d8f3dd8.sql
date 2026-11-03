-- Create role enum
CREATE TYPE public.app_role AS ENUM ('agency_admin', 'client');

-- Agencies table (single row for Jewlx)
CREATE TABLE public.agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#6366F1',
  secondary_color TEXT DEFAULT '#E8B4B8',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Subscription plans table
CREATE TABLE public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price_monthly DECIMAL(10,2) NOT NULL,
  features JSONB DEFAULT '[]',
  max_products INTEGER,
  max_orders_per_month INTEGER,
  commission_rate DECIMAL(5,2) NOT NULL,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Clients table
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id) NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  email TEXT NOT NULL,
  logo_url TEXT,
  status TEXT DEFAULT 'trial' CHECK (status IN ('active', 'trial', 'suspended', 'canceled')),
  plan_id UUID REFERENCES public.subscription_plans(id),
  custom_commission_rate DECIMAL(5,2),
  shopify_store_url TEXT,
  shopify_access_token TEXT,
  branding_config JSONB DEFAULT '{}',
  subscription_ends_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Products table (agency-managed catalog)
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  base_cost DECIMAL(10,2) NOT NULL,
  image_urls TEXT[] DEFAULT '{}',
  model_3d_url TEXT,
  cad_file_url TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'draft')),
  created_by_admin_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Product variations table
CREATE TABLE public.product_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  style TEXT,
  shank TEXT,
  metal TEXT,
  shape TEXT,
  stone_type TEXT,
  carat DECIMAL(4,2),
  image_url TEXT,
  additional_cost DECIMAL(10,2) DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Client products (junction table - which products clients enabled)
CREATE TABLE public.client_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  is_enabled BOOLEAN DEFAULT false,
  markup_percentage DECIMAL(5,2) DEFAULT 100,
  custom_retail_price DECIMAL(10,2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(client_id, product_id)
);

-- Orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  variation_id UUID REFERENCES public.product_variations(id),
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  customer_shipping JSONB,
  configuration JSONB NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  commission_deducted DECIMAL(10,2) DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'refunded', 'canceled')),
  manufacture_files_sent_at TIMESTAMP WITH TIME ZONE,
  shopify_order_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Invoices table
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  commission_total DECIMAL(10,2) NOT NULL,
  stripe_invoice_id TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'canceled')),
  due_date DATE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- User roles table (CRITICAL for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, role)
);

-- Analytics events table
CREATE TABLE public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('configurator_load', 'add_to_cart', 'purchase', 'page_view')),
  product_id UUID REFERENCES public.products(id),
  variation_id UUID REFERENCES public.product_variations(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check user role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Create function to get user's client_id
CREATE OR REPLACE FUNCTION public.get_user_client_id(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.clients WHERE user_id = _user_id LIMIT 1
$$;

-- RLS Policies for agencies (admins can view, public can view for branding)
CREATE POLICY "Anyone can view agencies" ON public.agencies FOR SELECT USING (true);
CREATE POLICY "Only admins can modify agencies" ON public.agencies FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));

-- RLS Policies for subscription_plans (public can view, admins can modify)
CREATE POLICY "Anyone can view plans" ON public.subscription_plans FOR SELECT USING (is_visible = true);
CREATE POLICY "Only admins can modify plans" ON public.subscription_plans FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));

-- RLS Policies for clients (admins see all, clients see their own)
CREATE POLICY "Admins can view all clients" ON public.clients FOR SELECT USING (public.has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can view their own record" ON public.clients FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Only admins can modify clients" ON public.clients FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));

-- RLS Policies for products (admins manage, clients view)
CREATE POLICY "Admins can manage products" ON public.products FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can view active products" ON public.products FOR SELECT USING (status = 'active');
CREATE POLICY "Public can view products for configurator" ON public.products FOR SELECT USING (true);

-- RLS Policies for product_variations
CREATE POLICY "Admins can manage variations" ON public.product_variations FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can view active variations" ON public.product_variations FOR SELECT USING (is_active = true);
CREATE POLICY "Public can view variations" ON public.product_variations FOR SELECT USING (true);

-- RLS Policies for client_products
CREATE POLICY "Admins can view all client products" ON public.client_products FOR SELECT USING (public.has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can manage their own products" ON public.client_products FOR ALL USING (client_id = public.get_user_client_id(auth.uid()));

-- RLS Policies for orders
CREATE POLICY "Admins can view all orders" ON public.orders FOR SELECT USING (public.has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can view their own orders" ON public.orders FOR SELECT USING (client_id = public.get_user_client_id(auth.uid()));
CREATE POLICY "Admins can manage orders" ON public.orders FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "System can create orders" ON public.orders FOR INSERT WITH CHECK (true);

-- RLS Policies for invoices
CREATE POLICY "Admins can view all invoices" ON public.invoices FOR SELECT USING (public.has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can view their own invoices" ON public.invoices FOR SELECT USING (client_id = public.get_user_client_id(auth.uid()));
CREATE POLICY "Only admins can modify invoices" ON public.invoices FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Only admins can manage roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'agency_admin'));

-- RLS Policies for analytics_events
CREATE POLICY "Admins can view all analytics" ON public.analytics_events FOR SELECT USING (public.has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can view their own analytics" ON public.analytics_events FOR SELECT USING (client_id = public.get_user_client_id(auth.uid()));
CREATE POLICY "System can create analytics events" ON public.analytics_events FOR INSERT WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX idx_clients_user_id ON public.clients(user_id);
CREATE INDEX idx_clients_agency_id ON public.clients(agency_id);
CREATE INDEX idx_products_agency_id ON public.products(agency_id);
CREATE INDEX idx_product_variations_product_id ON public.product_variations(product_id);
CREATE INDEX idx_client_products_client_id ON public.client_products(client_id);
CREATE INDEX idx_client_products_product_id ON public.client_products(product_id);
CREATE INDEX idx_orders_client_id ON public.orders(client_id);
CREATE INDEX idx_orders_created_at ON public.orders(created_at);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_analytics_events_client_id ON public.analytics_events(client_id);
CREATE INDEX idx_analytics_events_created_at ON public.analytics_events(created_at);

-- Insert default agency (Jewlx)
INSERT INTO public.agencies (name, primary_color, secondary_color)
VALUES ('Jewlx', '#6366F1', '#E8B4B8');

-- Insert default subscription plans
INSERT INTO public.subscription_plans (name, price_monthly, commission_rate, max_products, max_orders_per_month, features)
VALUES 
  ('Starter', 99.00, 15.00, 10, 50, '["Basic catalog access", "Email support", "Shopify integration"]'),
  ('Growth', 299.00, 12.00, 50, 200, '["Full catalog access", "Priority support", "Shopify integration", "Custom branding", "Analytics dashboard"]'),
  ('Enterprise', 999.00, 10.00, NULL, NULL, '["Unlimited products", "24/7 support", "Shopify integration", "Custom branding", "Advanced analytics", "Dedicated account manager", "API access"]');

-- Create trigger function for updating updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to products table
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();