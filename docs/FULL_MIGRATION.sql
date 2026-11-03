-- ============================================================
-- JewelX Complete Database Migration Script
-- Generated: 2026-02-16
-- 
-- INSTRUCTIONS:
-- 1. Create a new Supabase project
-- 2. Enable the pgcrypto extension (usually enabled by default)
-- 3. Run this entire script in the SQL Editor
-- 4. After running, update get_asset_cdn_url() with your project URL
-- 5. Set app.settings.encryption_key via: ALTER DATABASE postgres SET "app.settings.encryption_key" = 'YOUR_SECRET_KEY';
-- ============================================================

-- ============================================================
-- SECTION 1: EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- SECTION 2: CUSTOM TYPES
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('agency_admin', 'client', 'staff');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- SECTION 3: TABLES (ordered by dependency)
-- ============================================================

-- 3.1 Independent tables (no foreign keys to other public tables)

CREATE TABLE IF NOT EXISTS public.agencies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#6366F1',
  secondary_color TEXT DEFAULT '#E8B4B8',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_monthly NUMERIC DEFAULT 0,
  price_yearly NUMERIC DEFAULT 0,
  max_products INTEGER DEFAULT 10,
  max_orders INTEGER DEFAULT 100,
  max_storage_mb INTEGER DEFAULT 500,
  max_staff INTEGER DEFAULT 3,
  features JSONB DEFAULT '{}',
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.account_lockouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  locked_until TIMESTAMPTZ NOT NULL,
  requires_email_unlock BOOLEAN DEFAULT true,
  failed_attempts INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "timestamp" TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  user_role TEXT,
  action_type TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  severity TEXT DEFAULT 'info',
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS public.backup_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  backup_date TIMESTAMPTZ DEFAULT now(),
  backup_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  file_path TEXT,
  file_size_mb NUMERIC,
  tables_backed_up TEXT[],
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.password_reset_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.failed_login_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  attempted_at TIMESTAMPTZ DEFAULT now(),
  reason TEXT
);

CREATE TABLE IF NOT EXISTS public.email_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_email TEXT NOT NULL,
  template_name TEXT NOT NULL,
  subject TEXT,
  status TEXT DEFAULT 'sent',
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  sent_at TIMESTAMPTZ DEFAULT now()
);

-- Lookup tables
CREATE TABLE IF NOT EXISTS public.lookup_styles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  style_id TEXT NOT NULL,
  style_name TEXT NOT NULL,
  description TEXT,
  base_price NUMERIC DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lookup_shanks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shank_id TEXT NOT NULL,
  shank_name TEXT NOT NULL,
  description TEXT,
  base_price NUMERIC DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lookup_shapes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shape_id TEXT NOT NULL,
  shape_name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lookup_metals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  metal_id TEXT NOT NULL,
  metal_name TEXT NOT NULL,
  color_hex TEXT,
  base_price NUMERIC DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  color_family TEXT
);

CREATE TABLE IF NOT EXISTS public.lookup_visual_colors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  color_id TEXT NOT NULL,
  color_name TEXT NOT NULL,
  color_hex TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Diamond form option tables
CREATE TABLE IF NOT EXISTS public.diamond_nature_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  option_value TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.diamond_shape_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  option_value TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.diamond_size_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  option_value TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.diamond_quality_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  option_value TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ring_setting_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  option_value TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.diamond_holder_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  option_value TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.band_type_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  option_value TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.band_width_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  option_value TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ring_metal_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  option_value TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.personalization_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  option_value TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Admin staff
CREATE TABLE IF NOT EXISTS public.admin_staff_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.admin_staff_members IS 'Admin staff records. Passwords are managed securely by Supabase Auth, not stored in this table.';

CREATE TABLE IF NOT EXISTS public.admin_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID NOT NULL,
  admin_email TEXT NOT NULL,
  admin_name TEXT,
  admin_type TEXT DEFAULT 'admin_staff',
  action_type TEXT NOT NULL,
  action_category TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3.2 Products (depends on agencies)

CREATE TABLE IF NOT EXISTS public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID REFERENCES public.agencies(id),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'ring',
  base_cost NUMERIC DEFAULT 0,
  manufacturing_cost NUMERIC DEFAULT 0,
  image_urls TEXT[],
  model_3d_url TEXT,
  cad_file_url TEXT,
  status TEXT DEFAULT 'active',
  created_by_admin_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.product_variations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  style TEXT,
  metal TEXT,
  stone_type TEXT,
  shape TEXT,
  carat NUMERIC,
  shank TEXT,
  image_url TEXT,
  additional_cost NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Master DB data
CREATE TABLE IF NOT EXISTS public.my_master_db_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  unique_id TEXT,
  combination_id TEXT,
  style_name TEXT,
  shank_id TEXT,
  shank_name TEXT,
  visual_color TEXT,
  visual_color_name TEXT,
  shape_id TEXT,
  shape_name TEXT,
  folder_path TEXT,
  image_0_filename TEXT,
  image_0_status TEXT,
  image_1_filename TEXT,
  image_1_status TEXT,
  image_2_filename TEXT,
  image_2_status TEXT,
  image_3_filename TEXT,
  image_3_status TEXT,
  video_filename TEXT,
  video_status TEXT,
  glb_model_filename TEXT,
  glb_model_status TEXT,
  transparent_0_filename TEXT,
  transparent_0_status TEXT,
  transparent_1_filename TEXT,
  transparent_1_status TEXT,
  transparent_2_filename TEXT,
  transparent_2_status TEXT,
  transparent_3_filename TEXT,
  transparent_3_status TEXT,
  model_photo_filename TEXT,
  model_photo_status TEXT,
  manufacture_cad_filename TEXT,
  manufacture_cad_status TEXT,
  rendered_cad_filename TEXT,
  rendered_cad_status TEXT,
  files_uploaded INTEGER DEFAULT 0,
  total_files INTEGER DEFAULT 0,
  all_upload_complete BOOLEAN DEFAULT false,
  drive_link TEXT,
  last_updated TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  base_price NUMERIC DEFAULT 0,
  product_name TEXT,
  style_id TEXT,
  image_url_0 TEXT,
  image_url_1 TEXT,
  image_url_2 TEXT,
  image_url_3 TEXT,
  video_url TEXT,
  model_3d_url TEXT,
  transparent_url_0 TEXT,
  transparent_url_1 TEXT,
  transparent_url_2 TEXT,
  transparent_url_3 TEXT,
  manufacture_cad_url TEXT,
  rendered_cad_url TEXT,
  model_photo_url TEXT,
  style TEXT,
  carotimages_folder_path TEXT,
  carot_image_0_filename TEXT,
  carot_image_1_filename TEXT,
  carot_image_2_filename TEXT,
  carot_image_3_filename TEXT,
  carot_image_4_filename TEXT,
  carot_image_5_filename TEXT,
  carot_image_6_filename TEXT,
  carot_image_7_filename TEXT
);

CREATE TABLE IF NOT EXISTS public.master_ring_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  variant_name TEXT NOT NULL,
  metal_id TEXT,
  metal_name TEXT,
  color_family TEXT,
  base_price NUMERIC DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3.3 Clients (depends on agencies, subscription_plans)

CREATE TABLE IF NOT EXISTS public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.agencies(id),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  email TEXT NOT NULL,
  logo_url TEXT,
  status TEXT DEFAULT 'trial',
  plan_id UUID REFERENCES public.subscription_plans(id),
  shopify_store_url TEXT,
  shopify_access_token_encrypted BYTEA,
  shopify_admin_access_token_encrypted BYTEA,
  shopify_storefront_token_encrypted BYTEA,
  shopify_webhook_secret_encrypted BYTEA,
  created_at TIMESTAMPTZ DEFAULT now(),
  subscription_ends_at TIMESTAMPTZ,
  branding_config JSONB,
  custom_commission_rate NUMERIC,
  allowed_domains TEXT[],
  widget_theme TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT,
  enabled_features JSONB NOT NULL DEFAULT '{"diamond_form": true, "embed_branding": true, "product_catalogue": true, "ai_agent": true, "orders": true}'
);
COMMENT ON TABLE public.clients IS 'Client records with sensitive business data. RLS enforces: admins see all, clients see own record, staff see their client. Anonymous access is explicitly denied.';

-- 3.4 Tables depending on clients

CREATE TABLE IF NOT EXISTS public.staff_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  status TEXT DEFAULT 'active',
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.staff_members IS 'Staff member records. Passwords are managed securely by Supabase Auth, not stored in this table.';

CREATE TABLE IF NOT EXISTS public.admin_staff_client_access (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_staff_id UUID NOT NULL REFERENCES public.admin_staff_members(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (admin_staff_id, client_id)
);

CREATE TABLE IF NOT EXISTS public.admin_logging_information (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID NOT NULL,
  admin_email TEXT NOT NULL,
  admin_name TEXT,
  action_category TEXT NOT NULL,
  action_type TEXT NOT NULL,
  description TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  target_client_id UUID REFERENCES public.clients(id),
  target_client_name TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.admin_logging_information IS 'Tracks all admin dashboard activities for monitoring and audit purposes';

CREATE TABLE IF NOT EXISTS public.client_activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  user_name TEXT,
  user_type TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action_category TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.client_activity_logs IS 'Tracks all activities performed by clients and their staff members';

CREATE TABLE IF NOT EXISTS public.client_onboarding_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE UNIQUE,
  selected_styles TEXT[] NOT NULL DEFAULT '{}',
  selected_shanks TEXT[] NOT NULL DEFAULT '{}',
  selected_shapes TEXT[] NOT NULL DEFAULT '{}',
  selected_metals TEXT[] NOT NULL DEFAULT '{}',
  selected_diamond_types TEXT[],
  onboarding_completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_metal_variants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  variant_name TEXT NOT NULL,
  color_family TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_option_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  option_id TEXT NOT NULL,
  option_type TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_carat_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  carat_value NUMERIC NOT NULL,
  display_name TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  price_adjustment NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  image_filename_0 TEXT,
  image_filename_1 TEXT,
  image_filename_2 TEXT,
  image_filename_3 TEXT,
  image_filename_4 TEXT,
  image_filename_5 TEXT,
  image_filename_6 TEXT,
  image_filename_7 TEXT,
  images_filepath TEXT
);

CREATE TABLE IF NOT EXISTS public.client_size_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  size_value TEXT NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  price_adjustment NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_diamond_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  stone_type TEXT NOT NULL,
  shape_id TEXT NOT NULL,
  carat_range TEXT NOT NULL,
  carat_value NUMERIC NOT NULL,
  color TEXT NOT NULL,
  clarity TEXT NOT NULL,
  base_price NUMERIC NOT NULL DEFAULT 0,
  custom_price NUMERIC,
  is_enabled BOOLEAN DEFAULT true,
  shopify_product_id TEXT,
  shopify_variant_id TEXT,
  shopify_sync_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT true,
  markup_percentage NUMERIC DEFAULT 100,
  custom_retail_price NUMERIC,
  allow_jewelx_manufacturing BOOLEAN DEFAULT true,
  allow_self_manufacturing BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_ring_catalog (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  master_db_id UUID REFERENCES public.my_master_db_data(id) ON DELETE CASCADE,
  master_variant_id UUID REFERENCES public.master_ring_variants(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT true,
  markup_percentage NUMERIC,
  custom_price NUMERIC,
  shopify_product_id TEXT,
  shopify_variant_id TEXT,
  shopify_sync_status TEXT,
  shopify_synced_at TIMESTAMPTZ,
  shopify_variants_map JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.client_notification_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id),
  product_id UUID REFERENCES public.products(id),
  variation_id UUID REFERENCES public.product_variations(id),
  configuration JSONB,
  customer_email TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_shipping JSONB,
  total_amount NUMERIC DEFAULT 0,
  commission_deducted NUMERIC DEFAULT 0,
  commission_collected BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'pending',
  manufacturing_status TEXT DEFAULT 'new_request',
  manufacturing_cad_files TEXT[],
  manufacturing_notes TEXT,
  shopify_order_id TEXT,
  tracking_number TEXT,
  shipping_carrier TEXT,
  estimated_delivery_date DATE,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  variation_id UUID REFERENCES public.product_variations(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0,
  configuration JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.saved_designs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  configuration JSONB,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  notes TEXT,
  follow_up_status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.diamond_form_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  form_data JSONB DEFAULT '{}',
  estimated_price NUMERIC,
  status TEXT DEFAULT 'new',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.design_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL,
  description TEXT NOT NULL,
  preferred_style TEXT,
  preferred_metal TEXT,
  preferred_stone TEXT,
  budget_range TEXT,
  timeline TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  priority TEXT DEFAULT 'normal',
  admin_notes TEXT,
  estimated_completion DATE,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  reference_images TEXT[],
  metal_preference TEXT,
  stone_preference TEXT,
  size TEXT,
  special_requirements TEXT
);

CREATE TABLE IF NOT EXISTS public.design_comparisons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  configurations JSONB[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  product_id UUID REFERENCES public.products(id),
  variation_id UUID REFERENCES public.product_variations(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_chat_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  configuration_applied BOOLEAN DEFAULT false,
  design_saved BOOLEAN DEFAULT false,
  configuration_data JSONB
);

CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.ai_chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  intent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_training_examples (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  webhook_url TEXT,
  is_active BOOLEAN DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  api_key_encrypted BYTEA
);

CREATE TABLE IF NOT EXISTS public.impersonation_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ DEFAULT now(),
  ended_at TIMESTAMPTZ,
  reason TEXT,
  actions_performed JSONB DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS public.retention_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  retention_days INTEGER NOT NULL DEFAULT 90,
  auto_cleanup BOOLEAN DEFAULT true,
  last_cleanup_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.data_cleanup_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  table_name TEXT NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  records_deleted INTEGER NOT NULL DEFAULT 0,
  retention_days INTEGER NOT NULL,
  execution_time_ms INTEGER,
  status TEXT DEFAULT 'completed',
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS public.usage_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  storage_size_mb NUMERIC DEFAULT 0,
  storage_files_count INTEGER DEFAULT 0,
  database_size_mb NUMERIC DEFAULT 0,
  database_rows INTEGER DEFAULT 0,
  bandwidth_mb NUMERIC DEFAULT 0,
  function_invocations INTEGER DEFAULT 0,
  ai_tokens_used INTEGER DEFAULT 0,
  analytics_events_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ring_configured_by_client (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id),
  session_id TEXT,
  style_id TEXT,
  style_name TEXT,
  style_price NUMERIC DEFAULT 0,
  shank_id TEXT,
  shank_name TEXT,
  shank_price NUMERIC DEFAULT 0,
  visual_color_id TEXT,
  visual_color_name TEXT,
  visual_color_price NUMERIC DEFAULT 0,
  shape_id TEXT,
  shape_name TEXT,
  shape_price NUMERIC DEFAULT 0,
  metal_id TEXT,
  metal_name TEXT,
  metal_price NUMERIC DEFAULT 0,
  carat_value TEXT,
  carat_price NUMERIC DEFAULT 0,
  size TEXT,
  size_price NUMERIC DEFAULT 0,
  engraving_text TEXT,
  engraving_price NUMERIC DEFAULT 0,
  stone_type TEXT,
  stone_name TEXT,
  stone_price NUMERIC DEFAULT 0,
  total_price NUMERIC DEFAULT 0,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  customer_notes TEXT,
  master_db_id UUID,
  image_url TEXT,
  status TEXT DEFAULT 'configured',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_errors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  error_type TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  source TEXT,
  endpoint TEXT,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  user_id UUID,
  metadata JSONB DEFAULT '{}',
  severity TEXT DEFAULT 'error',
  resolved BOOLEAN DEFAULT false,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_error_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  error_type_pattern TEXT NOT NULL,
  threshold INTEGER NOT NULL DEFAULT 5,
  time_window_minutes INTEGER NOT NULL DEFAULT 60,
  notification_emails TEXT[],
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wishlist_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  configuration JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, product_id)
);

-- ============================================================
-- SECTION 4: VIEWS
-- ============================================================

CREATE OR REPLACE VIEW public.client_branding AS
SELECT id, company_name, logo_url, branding_config, allowed_domains
FROM public.clients;

CREATE OR REPLACE VIEW public.crm_integrations_safe AS
SELECT id, client_id, provider, webhook_url, is_active, last_synced_at, created_at, updated_at
FROM public.crm_integrations;

-- NOTE: master_products_with_urls view depends on get_asset_cdn_url function (created in Section 5)
-- It will be created after the functions section.

-- ============================================================
-- SECTION 5: FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_client_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.clients WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_client_active(p_client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM clients WHERE id = p_client_id AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff_of_client(_user_id UUID, _client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_members
    WHERE user_id = _user_id AND client_id = _client_id
  )
$$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_custom_alert_rules_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_encryption_key()
RETURNS TEXT LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    current_setting('app.settings.encryption_key', true),
    'CHANGE_THIS_KEY_IN_PRODUCTION_VIA_SECRETS'
  );
$$;

CREATE OR REPLACE FUNCTION public.encrypt_shopify_token(client_user_id UUID, token TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  UPDATE clients
  SET shopify_access_token_encrypted = pgp_sym_encrypt(token, get_encryption_key())
  WHERE user_id = client_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_shopify_token(client_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE decrypted_token TEXT;
BEGIN
  SELECT pgp_sym_decrypt(shopify_access_token_encrypted, get_encryption_key())::TEXT
  INTO decrypted_token
  FROM clients WHERE user_id = client_user_id AND shopify_access_token_encrypted IS NOT NULL;
  RETURN decrypted_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.encrypt_storefront_token(client_user_id UUID, token TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  UPDATE clients
  SET shopify_storefront_token_encrypted = pgp_sym_encrypt(token, get_encryption_key())
  WHERE user_id = client_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_storefront_token(client_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE decrypted_token TEXT;
BEGIN
  SELECT pgp_sym_decrypt(shopify_storefront_token_encrypted, get_encryption_key())::TEXT
  INTO decrypted_token
  FROM clients WHERE user_id = client_user_id AND shopify_storefront_token_encrypted IS NOT NULL;
  RETURN decrypted_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.encrypt_webhook_secret(client_user_id UUID, secret TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  UPDATE clients
  SET shopify_webhook_secret_encrypted = pgp_sym_encrypt(secret, get_encryption_key())
  WHERE user_id = client_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_webhook_secret(client_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE decrypted_secret TEXT;
BEGIN
  SELECT pgp_sym_decrypt(shopify_webhook_secret_encrypted, get_encryption_key())::TEXT
  INTO decrypted_secret
  FROM clients WHERE user_id = client_user_id AND shopify_webhook_secret_encrypted IS NOT NULL;
  RETURN decrypted_secret;
END;
$$;

CREATE OR REPLACE FUNCTION public.encrypt_crm_api_key(integration_id UUID, key TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  UPDATE crm_integrations
  SET api_key_encrypted = pgp_sym_encrypt(key, get_encryption_key()), api_key = NULL
  WHERE id = integration_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_crm_api_key(integration_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE decrypted_key TEXT;
BEGIN
  SELECT pgp_sym_decrypt(api_key_encrypted, get_encryption_key())::TEXT
  INTO decrypted_key
  FROM crm_integrations WHERE id = integration_id AND api_key_encrypted IS NOT NULL;
  RETURN decrypted_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 hour';
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_tokens()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.password_reset_tokens WHERE expires_at < NOW();
  DELETE FROM public.email_verification_tokens WHERE expires_at < NOW();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_safe_client_data(client_user_id UUID)
RETURNS TABLE(id UUID, agency_id UUID, user_id UUID, company_name TEXT, email TEXT, logo_url TEXT, status TEXT, plan_id UUID, shopify_store_url TEXT, created_at TIMESTAMPTZ, subscription_ends_at TIMESTAMPTZ, branding_config JSONB, custom_commission_rate NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id, agency_id, user_id, company_name, email, logo_url, status, plan_id, shopify_store_url, created_at, subscription_ends_at, branding_config, custom_commission_rate
  FROM public.clients WHERE user_id = client_user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_client_branding(client_uuid UUID)
RETURNS TABLE(id UUID, company_name TEXT, logo_url TEXT, branding_config JSONB, allowed_domains TEXT[], widget_theme TEXT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.id, c.company_name, c.logo_url, c.branding_config, c.allowed_domains, c.widget_theme
  FROM public.clients c WHERE c.id = client_uuid;
$$;

CREATE OR REPLACE FUNCTION public.get_client_diamond_presets(client_uuid UUID)
RETURNS TABLE(id UUID, stone_type TEXT, shape_id TEXT, carat_range TEXT, carat_value NUMERIC, color TEXT, clarity TEXT, base_price NUMERIC, custom_price NUMERIC, is_enabled BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id, stone_type, shape_id, carat_range, carat_value, color, clarity, base_price, custom_price, is_enabled
  FROM public.client_diamond_presets
  WHERE client_id = client_uuid AND is_enabled = true;
$$;

CREATE OR REPLACE FUNCTION public.get_client_crm_integrations(p_client_id UUID)
RETURNS TABLE(id UUID, client_id UUID, provider TEXT, webhook_url TEXT, is_active BOOLEAN, last_synced_at TIMESTAMPTZ, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT ci.id, ci.client_id, ci.provider, ci.webhook_url, ci.is_active, ci.last_synced_at, ci.created_at, ci.updated_at
  FROM public.crm_integrations ci
  WHERE ci.client_id = p_client_id
    AND (p_client_id = public.get_user_client_id(auth.uid()) OR public.has_role(auth.uid(), 'agency_admin'));
$$;

CREATE OR REPLACE FUNCTION public.get_client_diamond_form_options(client_uuid UUID)
RETURNS TABLE(id UUID, step_type TEXT, option_value TEXT, name TEXT, price NUMERIC, image_url TEXT, display_order INTEGER, extra_data JSONB, is_enabled BOOLEAN, has_custom_price BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH all_options AS (
    SELECT o.id, 'nature'::text AS step_type, o.option_value, o.name, o.price, o.image_url, o.display_order FROM diamond_nature_options o
    UNION ALL SELECT o.id, 'shape'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM diamond_shape_options o
    UNION ALL SELECT o.id, 'size'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM diamond_size_options o
    UNION ALL SELECT o.id, 'quality'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM diamond_quality_options o
    UNION ALL SELECT o.id, 'setting'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM ring_setting_options o
    UNION ALL SELECT o.id, 'holder'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM diamond_holder_options o
    UNION ALL SELECT o.id, 'band'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM band_type_options o
    UNION ALL SELECT o.id, 'band_width'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM band_width_options o
    UNION ALL SELECT o.id, 'metal'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM ring_metal_options o
    UNION ALL SELECT o.id, 'personalization'::text, o.option_value, o.name, o.price, o.image_url, o.display_order FROM personalization_options o
  )
  SELECT
    ao.id, ao.step_type, ao.option_value, ao.name,
    COALESCE(ov.custom_price, ao.price) AS price,
    COALESCE(ov.custom_image_url, ao.image_url) AS image_url,
    COALESCE(ov.display_order, ao.display_order) AS display_order,
    '{}'::jsonb AS extra_data,
    COALESCE(ov.is_enabled, true) AS is_enabled,
    (ov.custom_price IS NOT NULL) AS has_custom_price
  FROM all_options ao
  LEFT JOIN client_diamond_step_overrides ov ON ov.option_id = ao.id AND ov.step_type = ao.step_type AND ov.client_id = client_uuid
  ORDER BY ao.step_type, COALESCE(ov.display_order, ao.display_order);
$$;

CREATE OR REPLACE FUNCTION public.calculate_ring_base_price()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  style_price numeric := 0;
  shank_price numeric := 0;
BEGIN
  SELECT COALESCE(base_price, 0) INTO style_price FROM public.lookup_styles WHERE style_name = NEW.style_name LIMIT 1;
  SELECT COALESCE(base_price, 0) INTO shank_price FROM public.lookup_shanks WHERE shank_name = NEW.shank_name LIMIT 1;
  NEW.base_price := style_price + shank_price;
  RETURN NEW;
END;
$$;

-- CDN URL helper function
-- *** IMPORTANT: Update the base URL below to match YOUR Supabase project URL ***
CREATE OR REPLACE FUNCTION public.get_asset_cdn_url(p_folder_path TEXT, p_filename TEXT, p_bucket TEXT DEFAULT 'ring-assets')
RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_folder_path IS NULL OR p_filename IS NULL THEN NULL
    ELSE 'https://YOUR_PROJECT_REF.supabase.co/storage/v1/object/public/' || 
         p_bucket || '/' || LTRIM(p_folder_path, '/') || '/' || p_filename
  END;
$$;

-- Vector matching (requires pgvector extension)
-- Uncomment if you use AI document embeddings:
-- CREATE OR REPLACE FUNCTION public.match_document_chunks(query_embedding extensions.vector, match_client_id UUID, match_threshold DOUBLE PRECISION DEFAULT 0.7, match_count INTEGER DEFAULT 5)
-- RETURNS TABLE(id UUID, document_id UUID, content TEXT, metadata JSONB, similarity DOUBLE PRECISION)
-- LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
-- AS $$
--   SELECT ai_document_chunks.id, ai_document_chunks.document_id, ai_document_chunks.content, ai_document_chunks.metadata,
--     1 - (ai_document_chunks.embedding <=> query_embedding) AS similarity
--   FROM ai_document_chunks
--   WHERE ai_document_chunks.client_id = match_client_id
--     AND 1 - (ai_document_chunks.embedding <=> query_embedding) > match_threshold
--   ORDER BY ai_document_chunks.embedding <=> query_embedding LIMIT match_count;
-- $$;

-- Now create the master_products_with_urls view (depends on get_asset_cdn_url)
CREATE OR REPLACE VIEW public.master_products_with_urls AS
SELECT
  m.*,
  get_asset_cdn_url(folder_path, image_0_filename) AS cdn_image_url_0,
  get_asset_cdn_url(folder_path, image_1_filename) AS cdn_image_url_1,
  get_asset_cdn_url(folder_path, image_2_filename) AS cdn_image_url_2,
  get_asset_cdn_url(folder_path, image_3_filename) AS cdn_image_url_3,
  get_asset_cdn_url(folder_path, video_filename) AS cdn_video_url,
  get_asset_cdn_url(folder_path, glb_model_filename) AS cdn_model_url,
  get_asset_cdn_url(folder_path, transparent_0_filename) AS cdn_transparent_url_0,
  get_asset_cdn_url(folder_path, transparent_1_filename) AS cdn_transparent_url_1,
  get_asset_cdn_url(folder_path, transparent_2_filename) AS cdn_transparent_url_2,
  get_asset_cdn_url(folder_path, transparent_3_filename) AS cdn_transparent_url_3,
  get_asset_cdn_url(folder_path, model_photo_filename) AS cdn_model_photo_url,
  get_asset_cdn_url(carotimages_folder_path, carot_image_0_filename) AS cdn_carat_image_url_0,
  get_asset_cdn_url(carotimages_folder_path, carot_image_1_filename) AS cdn_carat_image_url_1,
  get_asset_cdn_url(carotimages_folder_path, carot_image_2_filename) AS cdn_carat_image_url_2,
  get_asset_cdn_url(carotimages_folder_path, carot_image_3_filename) AS cdn_carat_image_url_3,
  get_asset_cdn_url(carotimages_folder_path, carot_image_4_filename) AS cdn_carat_image_url_4,
  get_asset_cdn_url(carotimages_folder_path, carot_image_5_filename) AS cdn_carat_image_url_5,
  get_asset_cdn_url(carotimages_folder_path, carot_image_6_filename) AS cdn_carat_image_url_6,
  get_asset_cdn_url(carotimages_folder_path, carot_image_7_filename) AS cdn_carat_image_url_7
FROM public.my_master_db_data m;

-- ============================================================
-- SECTION 6: ENABLE ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.account_lockouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logging_information ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_staff_client_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_training_examples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.band_type_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.band_width_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_carat_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_diamond_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_metal_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_onboarding_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_option_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_ring_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_size_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_cleanup_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diamond_form_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diamond_holder_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diamond_nature_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diamond_quality_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diamond_shape_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diamond_size_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.failed_login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lookup_metals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lookup_shanks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lookup_shapes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lookup_styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lookup_visual_colors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.master_ring_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.my_master_db_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personalization_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ring_configured_by_client ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ring_metal_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ring_setting_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_error_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- SECTION 7: RLS POLICIES
-- ============================================================

-- account_lockouts
CREATE POLICY "Service role only" ON public.account_lockouts FOR ALL USING (false);

-- admin_activity_logs
CREATE POLICY "Admin users can insert activity logs" ON public.admin_activity_logs FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Admin users can view admin activity logs" ON public.admin_activity_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'agency_admin'));

-- admin_logging_information
CREATE POLICY "Agency admins can view all admin logs" ON public.admin_logging_information FOR SELECT USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'agency_admin'));
CREATE POLICY "Authenticated admins can insert logs" ON public.admin_logging_information FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'agency_admin'));

-- admin_staff_client_access
CREATE POLICY "Agency admins can manage client access" ON public.admin_staff_client_access FOR ALL TO authenticated USING (has_role(auth.uid(), 'agency_admin')) WITH CHECK (has_role(auth.uid(), 'agency_admin'));

-- admin_staff_members
CREATE POLICY "Agency admins can view all admin staff" ON public.admin_staff_members FOR SELECT TO authenticated USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Agency admins can insert admin staff" ON public.admin_staff_members FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Agency admins can update admin staff" ON public.admin_staff_members FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Agency admins can delete admin staff" ON public.admin_staff_members FOR DELETE TO authenticated USING (has_role(auth.uid(), 'agency_admin'));

-- agencies
CREATE POLICY "Anyone can view agencies" ON public.agencies FOR SELECT USING (true);
CREATE POLICY "Only admins can modify agencies" ON public.agencies FOR ALL USING (has_role(auth.uid(), 'agency_admin'));

-- ai_chat_messages
CREATE POLICY "System can create chat messages" ON public.ai_chat_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Clients can view messages for their sessions" ON public.ai_chat_messages FOR SELECT USING (session_id IN (SELECT id FROM ai_chat_sessions WHERE client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())));

-- ai_chat_sessions
CREATE POLICY "System can create chat sessions" ON public.ai_chat_sessions FOR INSERT WITH CHECK (true);
CREATE POLICY "System can update chat sessions" ON public.ai_chat_sessions FOR UPDATE USING (true);
CREATE POLICY "Anon can read sessions for tracking" ON public.ai_chat_sessions FOR SELECT TO anon USING (true);
CREATE POLICY "Clients can view their own chat sessions" ON public.ai_chat_sessions FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Staff with catalog access can view AI chat sessions" ON public.ai_chat_sessions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM staff_members sm WHERE sm.user_id = auth.uid() AND sm.client_id = ai_chat_sessions.client_id AND ((sm.permissions->>'catalog_access' = 'true') OR (lower(sm.permissions->>'catalog_access') = 'edit'))));

-- ai_training_examples
CREATE POLICY "Admins can view all training examples" ON public.ai_training_examples FOR SELECT USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can manage their own training examples" ON public.ai_training_examples FOR ALL USING (client_id = get_user_client_id(auth.uid()));
CREATE POLICY "Staff with catalog access can view training examples" ON public.ai_training_examples FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM staff_members sm WHERE sm.user_id = auth.uid() AND sm.client_id = ai_training_examples.client_id AND ((sm.permissions->>'catalog_access' = 'true') OR (lower(sm.permissions->>'catalog_access') = 'edit'))));
CREATE POLICY "Staff with edit access can insert training examples" ON public.ai_training_examples FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM staff_members sm WHERE sm.user_id = auth.uid() AND sm.client_id = ai_training_examples.client_id AND lower(sm.permissions->>'catalog_access') = 'edit'));
CREATE POLICY "Staff with edit access can update training examples" ON public.ai_training_examples FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM staff_members sm WHERE sm.user_id = auth.uid() AND sm.client_id = ai_training_examples.client_id AND lower(sm.permissions->>'catalog_access') = 'edit')) WITH CHECK (EXISTS (SELECT 1 FROM staff_members sm WHERE sm.user_id = auth.uid() AND sm.client_id = ai_training_examples.client_id AND lower(sm.permissions->>'catalog_access') = 'edit'));
CREATE POLICY "Staff with edit access can delete training examples" ON public.ai_training_examples FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM staff_members sm WHERE sm.user_id = auth.uid() AND sm.client_id = ai_training_examples.client_id AND lower(sm.permissions->>'catalog_access') = 'edit'));

-- analytics_events
CREATE POLICY "Admins can view all analytics" ON public.analytics_events FOR SELECT USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Admins can delete analytics" ON public.analytics_events FOR DELETE USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can view their own analytics" ON public.analytics_events FOR SELECT USING (client_id = get_user_client_id(auth.uid()));
CREATE POLICY "System can create analytics events" ON public.analytics_events FOR INSERT WITH CHECK (true);

-- audit_logs
CREATE POLICY "Admins can view all audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "System can insert audit logs" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (true);

-- backup_logs
CREATE POLICY "Admins can view all backup logs" ON public.backup_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "System can create backup logs" ON public.backup_logs FOR INSERT TO authenticated WITH CHECK (true);

-- band_type_options / band_width_options / diamond form options (public read, admin manage)
CREATE POLICY "Public can view band_type_options" ON public.band_type_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage band_type_options" ON public.band_type_options FOR ALL USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Public can view band_width_options" ON public.band_width_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage band_width_options" ON public.band_width_options FOR ALL USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Public can view diamond_nature_options" ON public.diamond_nature_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage diamond_nature_options" ON public.diamond_nature_options FOR ALL USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Public can view diamond_shape_options" ON public.diamond_shape_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage diamond_shape_options" ON public.diamond_shape_options FOR ALL USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Public can view diamond_size_options" ON public.diamond_size_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage diamond_size_options" ON public.diamond_size_options FOR ALL USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Public can view diamond_quality_options" ON public.diamond_quality_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage diamond_quality_options" ON public.diamond_quality_options FOR ALL USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Public can view ring_setting_options" ON public.ring_setting_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage ring_setting_options" ON public.ring_setting_options FOR ALL USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Public can view diamond_holder_options" ON public.diamond_holder_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage diamond_holder_options" ON public.diamond_holder_options FOR ALL USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Public can view ring_metal_options" ON public.ring_metal_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage ring_metal_options" ON public.ring_metal_options FOR ALL USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Public can view personalization_options" ON public.personalization_options FOR SELECT USING (true);
CREATE POLICY "Admins can manage personalization_options" ON public.personalization_options FOR ALL USING (has_role(auth.uid(), 'agency_admin'));

-- client_activity_logs
CREATE POLICY "Admins can view all client activity logs" ON public.client_activity_logs FOR SELECT USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Admins can delete activity logs" ON public.client_activity_logs FOR DELETE TO authenticated USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Admins can update activity logs" ON public.client_activity_logs FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'agency_admin')) WITH CHECK (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Client owners can view their activity logs" ON public.client_activity_logs FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Staff members can view their client activity logs" ON public.client_activity_logs FOR SELECT USING (client_id IN (SELECT client_id FROM staff_members WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert activity logs for their client" ON public.client_activity_logs FOR INSERT TO authenticated WITH CHECK ((client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())) OR (client_id IN (SELECT client_id FROM staff_members WHERE user_id = auth.uid())) OR has_role(auth.uid(), 'agency_admin'));

-- client_carat_options
CREATE POLICY "Admins can view all carat options" ON public.client_carat_options FOR SELECT USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can manage their own carat options" ON public.client_carat_options FOR ALL USING (client_id = get_user_client_id(auth.uid()));
CREATE POLICY "Clients can view their own carat options" ON public.client_carat_options FOR SELECT USING (client_id = get_user_client_id(auth.uid()));
CREATE POLICY "Clients can delete their own carat options" ON public.client_carat_options FOR DELETE USING (client_id = get_user_client_id(auth.uid()));
CREATE POLICY "Public can view enabled carat options for embed" ON public.client_carat_options FOR SELECT USING (is_enabled = true);
CREATE POLICY "Staff with catalog_access can view carat options" ON public.client_carat_options FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM staff_members sm WHERE sm.user_id = auth.uid() AND sm.client_id = client_carat_options.client_id AND (sm.permissions->>'catalog_access' IS NOT NULL) AND lower(sm.permissions->>'catalog_access') = ANY(ARRAY['true','view','edit'])));

-- client_diamond_presets
CREATE POLICY "Agency admins can manage all diamond presets" ON public.client_diamond_presets FOR ALL USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Admin staff can manage all diamond presets" ON public.client_diamond_presets FOR ALL USING (EXISTS (SELECT 1 FROM admin_staff_members WHERE user_id = auth.uid() AND status = 'active'));
CREATE POLICY "Clients can view their own diamond presets" ON public.client_diamond_presets FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Clients can insert their own diamond presets" ON public.client_diamond_presets FOR INSERT WITH CHECK (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Clients can update their own diamond presets" ON public.client_diamond_presets FOR UPDATE USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Clients can delete their own diamond presets" ON public.client_diamond_presets FOR DELETE USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Staff with catalog access can view diamond presets" ON public.client_diamond_presets FOR SELECT USING (EXISTS (SELECT 1 FROM staff_members sm WHERE sm.user_id = auth.uid() AND sm.client_id = client_diamond_presets.client_id AND (sm.permissions->>'catalog_access' IS NOT NULL) AND lower(sm.permissions->>'catalog_access') = ANY(ARRAY['true','view','edit'])));

-- client_metal_variants
CREATE POLICY "Admins can manage all metal variants" ON public.client_metal_variants FOR ALL USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Admins can view all metal variants" ON public.client_metal_variants FOR SELECT USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can manage their own metal variants" ON public.client_metal_variants FOR ALL USING (client_id = get_user_client_id(auth.uid()));
CREATE POLICY "Clients can view their own metal variants" ON public.client_metal_variants FOR SELECT USING (client_id = get_user_client_id(auth.uid()));
CREATE POLICY "Allow public read of client metal variants by client_id" ON public.client_metal_variants FOR SELECT TO anon USING (true);
CREATE POLICY "Staff with catalog_access can view metal variants" ON public.client_metal_variants FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM staff_members sm WHERE sm.user_id = auth.uid() AND sm.client_id = client_metal_variants.client_id AND (sm.permissions->>'catalog_access' IS NOT NULL) AND lower(sm.permissions->>'catalog_access') = ANY(ARRAY['true','view','edit'])));

-- client_notification_preferences
CREATE POLICY "Agency admins can view all notification preferences" ON public.client_notification_preferences FOR SELECT USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'agency_admin'));
CREATE POLICY "Clients can view own notification preferences" ON public.client_notification_preferences FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Clients can insert own notification preferences" ON public.client_notification_preferences FOR INSERT WITH CHECK (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Clients can update own notification preferences" ON public.client_notification_preferences FOR UPDATE USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Staff can view client notification preferences" ON public.client_notification_preferences FOR SELECT USING (client_id IN (SELECT client_id FROM staff_members WHERE user_id = auth.uid() AND status = 'active'));

-- client_onboarding_preferences
CREATE POLICY "Admins can view all preferences" ON public.client_onboarding_preferences FOR SELECT USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can manage their own preferences" ON public.client_onboarding_preferences FOR ALL USING (client_id = get_user_client_id(auth.uid()));
CREATE POLICY "Clients can view their own preferences" ON public.client_onboarding_preferences FOR SELECT USING (client_id = get_user_client_id(auth.uid()));
CREATE POLICY "Allow public read of client preferences by client_id" ON public.client_onboarding_preferences FOR SELECT TO anon USING (true);
CREATE POLICY "Staff with catalog_access can view onboarding preferences" ON public.client_onboarding_preferences FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM staff_members sm WHERE sm.user_id = auth.uid() AND sm.client_id = client_onboarding_preferences.client_id AND (sm.permissions->>'catalog_access' IS NOT NULL) AND lower(sm.permissions->>'catalog_access') = ANY(ARRAY['true','view','edit'])));

-- client_option_prices
CREATE POLICY "Admins can view all option prices" ON public.client_option_prices FOR SELECT USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can manage their own option prices" ON public.client_option_prices FOR ALL USING (client_id = get_user_client_id(auth.uid()));
CREATE POLICY "Allow public read of client option prices by client_id" ON public.client_option_prices FOR SELECT TO anon USING (true);
CREATE POLICY "Staff with catalog_access can view option prices" ON public.client_option_prices FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM staff_members sm WHERE sm.user_id = auth.uid() AND sm.client_id = client_option_prices.client_id AND (sm.permissions->>'catalog_access' IS NOT NULL) AND lower(sm.permissions->>'catalog_access') = ANY(ARRAY['true','view','edit'])));

-- client_products
CREATE POLICY "Admins can manage all client products" ON public.client_products FOR ALL USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'agency_admin'));
CREATE POLICY "Admins can view all client products" ON public.client_products FOR SELECT USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can manage their own products" ON public.client_products FOR ALL USING (client_id = get_user_client_id(auth.uid()));
CREATE POLICY "Clients can view their own product access" ON public.client_products FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

-- client_ring_catalog
CREATE POLICY "Admins can manage all catalogs" ON public.client_ring_catalog FOR ALL USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Admins can view all catalogs" ON public.client_ring_catalog FOR SELECT USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can manage their own catalog" ON public.client_ring_catalog FOR ALL USING (client_id = get_user_client_id(auth.uid()));
CREATE POLICY "Clients can view their own catalog" ON public.client_ring_catalog FOR SELECT USING (client_id = get_user_client_id(auth.uid()));
CREATE POLICY "Clients can delete their own catalog" ON public.client_ring_catalog FOR DELETE USING (client_id = get_user_client_id(auth.uid()));
CREATE POLICY "Staff with catalog_access can view client catalog" ON public.client_ring_catalog FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM staff_members sm WHERE sm.user_id = auth.uid() AND sm.client_id = client_ring_catalog.client_id AND (sm.permissions->>'catalog_access' IS NOT NULL) AND lower(sm.permissions->>'catalog_access') = ANY(ARRAY['true','view','edit'])));

-- client_size_options
CREATE POLICY "Admins can view all size options" ON public.client_size_options FOR SELECT USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can manage their own size options" ON public.client_size_options FOR ALL USING (client_id = get_user_client_id(auth.uid()));
CREATE POLICY "Clients can view their own size options" ON public.client_size_options FOR SELECT USING (client_id = get_user_client_id(auth.uid()));
CREATE POLICY "Clients can delete their own size options" ON public.client_size_options FOR DELETE USING (client_id = get_user_client_id(auth.uid()));
CREATE POLICY "Staff with catalog_access can view size options" ON public.client_size_options FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM staff_members sm WHERE sm.user_id = auth.uid() AND sm.client_id = client_size_options.client_id AND (sm.permissions->>'catalog_access')::boolean = true));

-- clients
CREATE POLICY "Admins can view all clients" ON public.clients FOR SELECT TO authenticated USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Only admins can modify clients" ON public.clients FOR ALL TO authenticated USING (has_role(auth.uid(), 'agency_admin')) WITH CHECK (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can view their own record" ON public.clients FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Clients can update their own record" ON public.clients FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Staff can view their client record" ON public.clients FOR SELECT TO authenticated USING (is_staff_of_client(auth.uid(), id));
CREATE POLICY "Block all anonymous access to clients" ON public.clients AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false);

-- crm_integrations
CREATE POLICY "Deny direct SELECT on crm_integrations" ON public.crm_integrations FOR SELECT USING (false);
CREATE POLICY "Clients can insert own CRM integrations" ON public.crm_integrations FOR INSERT WITH CHECK (client_id = get_user_client_id(auth.uid()));
CREATE POLICY "Clients can update own CRM integrations" ON public.crm_integrations FOR UPDATE USING (client_id = get_user_client_id(auth.uid()));
CREATE POLICY "Clients can delete own CRM integrations" ON public.crm_integrations FOR DELETE USING (client_id = get_user_client_id(auth.uid()));

-- data_cleanup_logs
CREATE POLICY "Admins can view cleanup logs" ON public.data_cleanup_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "System can create cleanup logs" ON public.data_cleanup_logs FOR INSERT TO authenticated WITH CHECK (true);

-- design_comparisons
CREATE POLICY "Anyone can create comparisons" ON public.design_comparisons FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view their own comparisons" ON public.design_comparisons FOR SELECT USING ((user_id = auth.uid()) OR (user_id IS NULL));

-- design_requests
CREATE POLICY "Admins can view all design requests" ON public.design_requests FOR SELECT USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'agency_admin'));
CREATE POLICY "Admins can update design requests" ON public.design_requests FOR UPDATE USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'agency_admin'));
CREATE POLICY "Clients can create design requests" ON public.design_requests FOR INSERT WITH CHECK (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Clients can view their own design requests" ON public.design_requests FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));

-- diamond_form_leads
CREATE POLICY "Anyone can submit diamond form leads" ON public.diamond_form_leads FOR INSERT WITH CHECK (true);
CREATE POLICY "Client owners can view their diamond form leads" ON public.diamond_form_leads FOR SELECT TO authenticated USING ((client_id = get_user_client_id(auth.uid())) OR has_role(auth.uid(), 'agency_admin') OR is_staff_of_client(auth.uid(), client_id));
CREATE POLICY "Client owners can delete their diamond form leads" ON public.diamond_form_leads FOR DELETE TO authenticated USING ((client_id = get_user_client_id(auth.uid())) OR has_role(auth.uid(), 'agency_admin'));

-- email_logs
CREATE POLICY "Service role can manage email logs" ON public.email_logs FOR ALL USING (false);

-- failed_login_attempts
CREATE POLICY "Service role only for failed_login_attempts" ON public.failed_login_attempts FOR ALL USING (false);

-- impersonation_sessions
CREATE POLICY "Admins can manage impersonation sessions" ON public.impersonation_sessions FOR ALL TO authenticated USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Admins can view all impersonation sessions" ON public.impersonation_sessions FOR SELECT TO authenticated USING (has_role(auth.uid(), 'agency_admin'));

-- lookup tables (public read, admin manage)
CREATE POLICY "Allow public read access to metals" ON public.lookup_metals FOR SELECT USING (true);
CREATE POLICY "Allow admin insert to metals" ON public.lookup_metals FOR INSERT WITH CHECK (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow admin update to metals" ON public.lookup_metals FOR UPDATE USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow admin delete to metals" ON public.lookup_metals FOR DELETE USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow public read access to shanks" ON public.lookup_shanks FOR SELECT USING (true);
CREATE POLICY "Allow admin insert to shanks" ON public.lookup_shanks FOR INSERT WITH CHECK (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow admin update to shanks" ON public.lookup_shanks FOR UPDATE USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow admin delete to shanks" ON public.lookup_shanks FOR DELETE USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow public read access to shapes" ON public.lookup_shapes FOR SELECT USING (true);
CREATE POLICY "Allow admin insert to shapes" ON public.lookup_shapes FOR INSERT WITH CHECK (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow admin update to shapes" ON public.lookup_shapes FOR UPDATE USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow admin delete to shapes" ON public.lookup_shapes FOR DELETE USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow public read access to styles" ON public.lookup_styles FOR SELECT USING (true);
CREATE POLICY "Allow admin insert to styles" ON public.lookup_styles FOR INSERT WITH CHECK (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow admin update to styles" ON public.lookup_styles FOR UPDATE USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow admin delete to styles" ON public.lookup_styles FOR DELETE USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow public read access to visual_colors" ON public.lookup_visual_colors FOR SELECT USING (true);
CREATE POLICY "Allow admin insert to visual_colors" ON public.lookup_visual_colors FOR INSERT WITH CHECK (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow admin update to visual_colors" ON public.lookup_visual_colors FOR UPDATE USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Allow admin delete to visual_colors" ON public.lookup_visual_colors FOR DELETE USING (has_role(auth.uid(), 'agency_admin'));

-- master_ring_variants / my_master_db_data
CREATE POLICY "Anyone can view master variants" ON public.master_ring_variants FOR SELECT USING (true);
CREATE POLICY "Only admins can manage master variants" ON public.master_ring_variants FOR ALL USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Anyone can view my_master_db_data" ON public.my_master_db_data FOR SELECT USING (true);
CREATE POLICY "Only admins can manage my_master_db_data" ON public.my_master_db_data FOR ALL USING (has_role(auth.uid(), 'agency_admin'));

-- order_items
CREATE POLICY "Admins can view all order items" ON public.order_items FOR SELECT USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "System can create order items" ON public.order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view their order items via user_id" ON public.order_items FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM orders WHERE orders.id = order_items.order_id AND orders.customer_email IN (SELECT email FROM auth.users WHERE id = auth.uid())));

-- orders
CREATE POLICY "Admins can manage orders" ON public.orders FOR ALL USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Admins can view all orders" ON public.orders FOR SELECT USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can view their own orders" ON public.orders FOR SELECT USING (client_id = get_user_client_id(auth.uid()));
CREATE POLICY "System can create orders" ON public.orders FOR INSERT WITH CHECK (true);

-- personalization_options (already created above with diamond form options)

-- product_variations
CREATE POLICY "Admins can manage variations" ON public.product_variations FOR ALL USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can view active variations" ON public.product_variations FOR SELECT USING (is_active = true);
CREATE POLICY "Public can view variations" ON public.product_variations FOR SELECT USING (true);

-- products
CREATE POLICY "Admins can manage products" ON public.products FOR ALL USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can view active products" ON public.products FOR SELECT USING (status = 'active');
CREATE POLICY "Public can view products for configurator" ON public.products FOR SELECT USING (true);

-- rate_limits
CREATE POLICY "System can manage rate limits" ON public.rate_limits FOR ALL USING (true) WITH CHECK (true);

-- retention_policies
CREATE POLICY "Admins can manage all retention policies" ON public.retention_policies FOR ALL USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can manage their own retention policies" ON public.retention_policies FOR ALL USING (client_id = get_user_client_id(auth.uid()));

-- ring_configured_by_client
CREATE POLICY "Allow public read access" ON public.ring_configured_by_client FOR SELECT USING (true);
CREATE POLICY "Allow public insert access" ON public.ring_configured_by_client FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access" ON public.ring_configured_by_client FOR UPDATE USING (true);

-- saved_designs
CREATE POLICY "Admins can view all saved designs" ON public.saved_designs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Authenticated users can create saved designs" ON public.saved_designs FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Anon can insert leads for valid clients" ON public.saved_designs FOR INSERT TO anon WITH CHECK (is_client_active(client_id) AND customer_name IS NOT NULL AND customer_email IS NOT NULL AND length(customer_name) <= 200 AND length(customer_email) <= 255);
CREATE POLICY "Block anonymous select on saved_designs" ON public.saved_designs AS RESTRICTIVE FOR SELECT TO anon USING (false);
CREATE POLICY "Block anonymous update on saved_designs" ON public.saved_designs AS RESTRICTIVE FOR UPDATE TO anon USING (false) WITH CHECK (false);
CREATE POLICY "Block anonymous delete on saved_designs" ON public.saved_designs AS RESTRICTIVE FOR DELETE TO anon USING (false);
CREATE POLICY "Clients can view their own saved designs" ON public.saved_designs FOR SELECT TO authenticated USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Clients can update their saved designs" ON public.saved_designs FOR UPDATE TO authenticated USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())) WITH CHECK (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Clients can delete their own saved designs" ON public.saved_designs FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM clients c WHERE c.user_id = auth.uid() AND c.id = saved_designs.client_id));
CREATE POLICY "Staff with access can view saved designs" ON public.saved_designs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM staff_members sm WHERE sm.user_id = auth.uid() AND sm.client_id = saved_designs.client_id AND sm.status = 'active' AND ((sm.permissions->>'leads_access')::boolean = true OR (sm.permissions->>'catalog_access') = 'view' OR (sm.permissions->>'catalog_access') = 'edit')));
CREATE POLICY "Staff with edit access can delete saved designs" ON public.saved_designs FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM staff_members sm WHERE sm.user_id = auth.uid() AND sm.client_id = saved_designs.client_id AND sm.status = 'active' AND ((sm.permissions->>'leads_access')::boolean = true OR (sm.permissions->>'catalog_access') = 'edit')));

-- staff_members
CREATE POLICY "Admins can view all staff members" ON public.staff_members FOR SELECT USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can view their own staff" ON public.staff_members FOR SELECT USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Clients can insert their own staff" ON public.staff_members FOR INSERT WITH CHECK (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Clients can update their own staff" ON public.staff_members FOR UPDATE USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Clients can delete their own staff" ON public.staff_members FOR DELETE USING (client_id IN (SELECT id FROM clients WHERE user_id = auth.uid()));
CREATE POLICY "Staff can view their own record" ON public.staff_members FOR SELECT USING (auth.uid() = user_id);

-- subscription_plans
CREATE POLICY "Anyone can view plans" ON public.subscription_plans FOR SELECT USING (is_visible = true);
CREATE POLICY "Only admins can modify plans" ON public.subscription_plans FOR ALL USING (has_role(auth.uid(), 'agency_admin'));

-- system_error_alerts
CREATE POLICY "Agency admins can manage alert rules" ON public.system_error_alerts FOR ALL USING (has_role(auth.uid(), 'agency_admin'));

-- system_errors
CREATE POLICY "Agency admins can view all system errors" ON public.system_errors FOR SELECT USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Agency admins can update system errors" ON public.system_errors FOR UPDATE USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Service role can insert system errors" ON public.system_errors FOR INSERT WITH CHECK (true);

-- usage_snapshots
CREATE POLICY "Admins can view all usage snapshots" ON public.usage_snapshots FOR SELECT USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Clients can view their own usage snapshots" ON public.usage_snapshots FOR SELECT USING (client_id = get_user_client_id(auth.uid()));
CREATE POLICY "System can insert usage snapshots" ON public.usage_snapshots FOR INSERT WITH CHECK (true);

-- user_roles
CREATE POLICY "Only admins can manage roles" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'agency_admin'));
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (user_id = auth.uid());

-- wishlist_items
CREATE POLICY "Users can manage their wishlist" ON public.wishlist_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- SECTION 8: INDEXES
-- ============================================================

-- account_lockouts
CREATE INDEX IF NOT EXISTS idx_account_lockouts_email ON public.account_lockouts(email);
CREATE INDEX IF NOT EXISTS idx_account_lockouts_locked_until ON public.account_lockouts(locked_until);

-- admin_activity_logs
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_created_at ON public.admin_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_admin_user_id ON public.admin_activity_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_action_category ON public.admin_activity_logs(action_category);

-- admin_logging_information
CREATE INDEX IF NOT EXISTS idx_admin_logging_created_at ON public.admin_logging_information(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logging_admin_user_id ON public.admin_logging_information(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_logging_action_type ON public.admin_logging_information(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_logging_target_client ON public.admin_logging_information(target_client_id);

-- admin_staff_client_access
CREATE INDEX IF NOT EXISTS idx_admin_staff_client_access_admin ON public.admin_staff_client_access(admin_staff_id);
CREATE INDEX IF NOT EXISTS idx_admin_staff_client_access_client ON public.admin_staff_client_access(client_id);

-- analytics_events
CREATE INDEX IF NOT EXISTS idx_analytics_events_client_id ON public.analytics_events(client_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON public.analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_event_type ON public.analytics_events(event_type);

-- audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON public.audit_logs("timestamp" DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON public.audit_logs(action_type);

-- client_activity_logs
CREATE INDEX IF NOT EXISTS idx_client_activity_logs_client_id ON public.client_activity_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_client_activity_logs_created_at ON public.client_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_client_activity_logs_user_id ON public.client_activity_logs(user_id);

-- client_ring_catalog
CREATE INDEX IF NOT EXISTS idx_client_ring_catalog_client_id ON public.client_ring_catalog(client_id);
CREATE INDEX IF NOT EXISTS idx_client_ring_catalog_master_db_id ON public.client_ring_catalog(master_db_id);

-- diamond_form_leads
CREATE INDEX IF NOT EXISTS idx_diamond_form_leads_client_id ON public.diamond_form_leads(client_id);
CREATE INDEX IF NOT EXISTS idx_diamond_form_leads_created_at ON public.diamond_form_leads(created_at DESC);

-- orders
CREATE INDEX IF NOT EXISTS idx_orders_client_id ON public.orders(client_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- saved_designs
CREATE INDEX IF NOT EXISTS idx_saved_designs_client_id ON public.saved_designs(client_id);
CREATE INDEX IF NOT EXISTS idx_saved_designs_customer_email ON public.saved_designs(customer_email);

-- staff_members
CREATE INDEX IF NOT EXISTS idx_staff_members_client_id ON public.staff_members(client_id);
CREATE INDEX IF NOT EXISTS idx_staff_members_user_id ON public.staff_members(user_id);

-- system_errors
CREATE INDEX IF NOT EXISTS idx_system_errors_created_at ON public.system_errors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_errors_error_type ON public.system_errors(error_type);

-- usage_snapshots
CREATE INDEX IF NOT EXISTS idx_usage_snapshots_client_date ON public.usage_snapshots(client_id, snapshot_date DESC);

-- rate_limits
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier ON public.rate_limits(identifier, endpoint);

-- ring_configured_by_client
CREATE INDEX IF NOT EXISTS idx_ring_configured_client_id ON public.ring_configured_by_client(client_id);
CREATE INDEX IF NOT EXISTS idx_ring_configured_session_id ON public.ring_configured_by_client(session_id);

-- ============================================================
-- SECTION 9: STORAGE BUCKETS
-- ============================================================

INSERT INTO storage.buckets (id, name, public) VALUES ('product-assets', 'product-assets', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('ring-assets', 'ring-assets', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('ai-documents', 'ai-documents', false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('diamond-inspiration', 'diamond-inspiration', true) ON CONFLICT (id) DO NOTHING;

-- Public read access for public buckets
CREATE POLICY "Public read ring-assets" ON storage.objects FOR SELECT USING (bucket_id = 'ring-assets');
CREATE POLICY "Public read diamond-inspiration" ON storage.objects FOR SELECT USING (bucket_id = 'diamond-inspiration');

-- Authenticated upload policies
CREATE POLICY "Authenticated upload to product-assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-assets');
CREATE POLICY "Authenticated upload to ring-assets" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'ring-assets');
CREATE POLICY "Authenticated upload to ai-documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'ai-documents');
CREATE POLICY "Authenticated upload to diamond-inspiration" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'diamond-inspiration');

-- ============================================================
-- SECTION 10: REALTIME (enable for tables that need it)
-- ============================================================

-- Uncomment tables you need realtime for:
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_chat_sessions;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;

-- ============================================================
-- SECTION 11: SEED DATA (Production Data as of 2026-02-17)
-- ============================================================
-- NOTE: Large tables (my_master_db_data, master_ring_variants, client_ring_catalog,
-- client_diamond_presets) contain hundreds of rows each. A complete JSON backup of ALL
-- data is stored at: product-assets/backups/2026-02-17T04-54-10-723Z.json.gz
-- You can restore that via the backup-download edge function.
-- Below are the INSERT statements for ALL tables with data.
-- ============================================================

-- 11.1 Agency
INSERT INTO public.agencies (id, name, primary_color, secondary_color, created_at) VALUES
  ('2d88c3d6-554d-4e54-b840-75dd76d85133', 'Jewlx', '#6366F1', '#E8B4B8', '2025-11-17 20:20:22.599565+00')
ON CONFLICT (id) DO NOTHING;

-- 11.2 Subscription Plans
INSERT INTO public.subscription_plans (id, name, price_monthly, commission_rate, max_products, max_orders_per_month, features, is_visible, created_at) VALUES
  ('d2d18b38-703e-4ffa-ab4b-de813ea75e69', 'Starter', 99.00, 15.00, 10, 50, '["Basic catalog access","Email support","Shopify integration"]', true, '2025-11-17 20:20:22.599565+00'),
  ('8cc98abc-8daf-4ced-b168-30e754dcc17e', 'Growth', 299.00, 12.00, 50, 200, '["Full catalog access","Priority support","Shopify integration","Custom branding","Analytics dashboard"]', true, '2025-11-17 20:20:22.599565+00'),
  ('18ad1248-a1d3-4498-a2b6-588a3ea87864', 'Enterprise', 999.00, 10.00, NULL, NULL, '["Unlimited products","24/7 support","Shopify integration","Custom branding","Advanced analytics","Dedicated account manager","API access"]', true, '2025-11-17 20:20:22.599565+00')
ON CONFLICT (id) DO NOTHING;

-- 11.3 Lookup Styles
INSERT INTO public.lookup_styles (id, style_id, style_name, description, base_price, display_order, is_active, created_at) VALUES
  ('bf2c3794-46c6-425f-be45-95038c46ed81', 'solitaire', 'Solitaire', 'Classic single stone setting', 1500, 1, true, '2025-12-25 20:05:18.942585+00'),
  ('e6c50a43-0712-48d0-87f5-527114f6bd66', 'three-stone', 'Three Stone', 'Past, present, and future', 2400, 2, true, '2025-12-25 20:05:18.942585+00'),
  ('f82f65b4-8602-4642-b9c8-6ef5d5b1aafd', 'halo', 'Halo', 'Center stone surrounded by smaller diamonds', 2200, 3, true, '2025-12-25 20:05:18.942585+00'),
  ('d58041c9-453b-4373-8a1e-f49922b2470f', 'pave-rail', 'Pavé Rail', 'Diamonds set along the band', 1800, 4, true, '2025-12-25 20:05:18.942585+00')
ON CONFLICT (id) DO NOTHING;

-- 11.4 Lookup Shanks
INSERT INTO public.lookup_shanks (id, shank_id, shank_name, description, base_price, display_order, is_active, created_at) VALUES
  ('5c2e457a-c853-4e3b-8e6e-f07a23f772ba', 'high-polish', 'High Polish', 'Smooth, reflective finish', 0, 1, true, '2025-12-25 20:05:18.942585+00'),
  ('424343ad-4d39-4e88-9b23-c54263ba0a92', 'castel-pave', 'Castel Pavé', 'Castle-style pavé setting', 1000, 2, true, '2025-12-25 20:05:18.942585+00'),
  ('1ccdc5c1-4a8e-44e6-9ea9-201f50934054', '3-row-pave', '3 Row Pavé', 'Three rows of pavé diamonds', 2500, 3, true, '2025-12-25 20:05:18.942585+00'),
  ('02e5dd5b-1d1d-461e-be78-208b183a1e4c', 'unknown-1', 'Unknown 1', NULL, 0, 4, true, '2025-12-25 20:05:18.942585+00'),
  ('b603d04e-6335-4130-b3a3-8e91977280c0', 'unknown-2', 'Unknown 2', NULL, 0, 5, true, '2025-12-25 20:05:18.942585+00'),
  ('5a0edffc-81cc-4af5-9068-61719a856694', 'unknown-3', 'Unknown 3', NULL, 0, 6, true, '2025-12-25 20:05:18.942585+00')
ON CONFLICT (id) DO NOTHING;

-- 11.5 Lookup Shapes
INSERT INTO public.lookup_shapes (id, shape_id, shape_name, display_order, is_active, created_at) VALUES
  ('ccd8557a-545f-47a7-93e7-8899e5e1cf5d', 'round', 'Round', 1, true, '2025-12-25 20:05:18.942585+00'),
  ('5c7ebfbe-7c94-4660-b102-e6bac9921538', 'oval', 'Oval', 2, true, '2025-12-25 20:05:18.942585+00'),
  ('4e3b5122-9af3-4c2f-917d-abaa88233771', 'princess', 'Princess', 3, true, '2025-12-25 20:05:18.942585+00'),
  ('ffb645f2-8e79-4af1-a816-280e3a4acbab', 'radiant', 'Radiant', 4, true, '2025-12-25 20:05:18.942585+00'),
  ('59ce7374-896f-49c1-b4ba-b6a16a9a0c4a', 'emerald', 'Emerald', 5, true, '2025-12-25 20:05:18.942585+00'),
  ('1fdfc15f-0bcb-455c-92d9-669130462f47', 'cushion', 'Cushion', 6, true, '2025-12-25 20:05:18.942585+00'),
  ('1c91087a-c43f-4c81-af23-a16c77a8d13d', 'pear', 'Pear', 7, true, '2025-12-25 20:05:18.942585+00'),
  ('e0a13d50-ea53-447e-8725-ca06157c3a26', 'marquise', 'Marquise', 8, true, '2025-12-25 20:05:18.942585+00')
ON CONFLICT (id) DO NOTHING;

-- 11.6 Lookup Metals
INSERT INTO public.lookup_metals (id, metal_id, metal_name, color_hex, color_family, base_price, display_order, is_active, created_at) VALUES
  ('09a6121e-9d63-4f22-993e-d3c6c91f896f', '14k-yellow', '14K Yellow Gold', '#FFD700', 'yellow', 0, 1, true, '2025-12-25 20:05:18.942585+00'),
  ('dca3d8c5-054d-47bd-97de-3cd04f1ffe4b', '14k-rose', '14K Rose Gold', '#E0BFB8', 'rose', 0, 2, true, '2025-12-25 20:05:18.942585+00'),
  ('2bb72812-4c2a-4e7c-bf74-a30b1f73863e', '18k-yellow', '18K Yellow Gold', '#FFDF00', 'yellow', 450, 3, true, '2025-12-25 20:05:18.942585+00'),
  ('3774ec85-bd62-4809-91c5-17a4d2593b53', '18k-white', '18K White Gold', '#E8E8E8', 'white', 450, 4, true, '2025-12-25 20:05:18.942585+00'),
  ('4b83228d-41b2-44cb-84f5-c5a0ea2ac93c', 'platinum', 'Platinum', '#C0C0C0', 'white', 600, 5, true, '2025-12-25 20:05:18.942585+00'),
  ('ded82bf4-43a4-427d-ba1d-81007744ba57', '18k-rose', '18K Rose Gold', '#E0BFB8', 'rose', 450, 6, true, '2025-12-26 16:52:56.253981+00')
ON CONFLICT (id) DO NOTHING;

-- 11.7 Lookup Visual Colors
INSERT INTO public.lookup_visual_colors (id, color_id, color_name, color_hex, display_order, is_active, created_at) VALUES
  ('373e4cd6-7e20-4f69-8df9-c1625f1fa317', 'yellow', 'Yellow Gold', '#FFD700', 1, true, '2025-12-25 20:05:18.942585+00'),
  ('9c90ffae-dcef-459a-8e00-137bcf7c9dd8', 'rose', 'Rose Gold', '#E0BFB8', 2, true, '2025-12-25 20:05:18.942585+00'),
  ('a0806000-e8ab-4c06-a268-137914e3766e', 'white', 'White Gold / Platinum', '#E8E8E8', 3, true, '2025-12-25 20:05:18.942585+00')
ON CONFLICT (id) DO NOTHING;

-- 11.8 Diamond Nature Options
INSERT INTO public.diamond_nature_options (id, name, option_value, price, display_order, image_url, created_at, updated_at) VALUES
  ('cfccba4c-54b2-4ce3-8920-43e76ce03f88', 'Natural Diamonds', 'natural', 0, 1, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_nature/Natural+Diamond.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('f2aea242-6f66-42f2-abba-94e7c45c9e7d', 'Lab Diamonds', 'lab', 0, 2, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_nature/Lab+Diamond.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00')
ON CONFLICT (id) DO NOTHING;

-- 11.9 Diamond Shape Options
INSERT INTO public.diamond_shape_options (id, name, option_value, price, display_order, image_url, created_at, updated_at) VALUES
  ('69f95106-f74d-429b-bf94-82973c5f0b68', 'Round', 'round', 0, 1, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Round.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('926dbc8a-fa03-44f8-90c7-d8c92c55ee5c', 'Oval', 'oval', 0, 2, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Oval.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('6e69b995-81e0-4a7e-bc5f-c34b73f835f6', 'Cushion', 'cushion', 0, 3, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Cushion.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('bbd34805-3c37-4a8b-a2ff-86972718df73', 'Radiant', 'radiant', 0, 4, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Radiant.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('2907ef75-bde1-4217-b120-a94b9218cea1', 'Emerald', 'emerald', 0, 5, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Emerald.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('bcfe6198-1058-4a97-80fb-78bc3fa9c82c', 'Marquise', 'marquise', 0, 6, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Marquise.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('4a005ab5-a000-441a-9e16-022c1b01fb65', 'Dutch Marquise', 'dutch-marquise', 0, 7, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Dutch+Marquise.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('06e7d564-f3cc-446c-98fb-b43c481d3b5f', 'Old Mine', 'old-mine', 0, 8, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Old+Mine.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('ed5e99f5-4078-469b-be1b-89bf32f95f97', 'Moval', 'moval', 0, 9, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Moval.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('a84c64fe-cb3b-4a3a-993f-2566adff0bf8', 'Pear', 'pear', 0, 10, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Pear.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('21550b58-16ed-40b1-9f4f-ea339f7f49c3', 'Colored Diamond', 'colored-diamond', 0, 11, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Colored+Diamond.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('b309bf53-6058-4029-adf1-d7fd87f73dbf', 'Portuguese Cut', 'portuguese-cut', 0, 12, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Portuguese+Cut.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('2343d205-fc1d-4d1d-94b6-a346da21dc6e', 'Bowtie Free', 'bowtie-free', 0, 13, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Bowtie+Free.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('0728ad67-f21a-4f9e-8301-1761035fb7cc', 'Criss Cut', 'criss-cut', 0, 14, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Criss+Cut.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('9c8e64ce-140f-4f6a-bad9-fecbc5cbd58a', 'Step Cut', 'step-cut', 0, 15, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/Step+Cut.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('f3c4f50b-b863-4d12-a251-76695a186b31', 'Ruby/Sapphire/Emerald', 'ruby-sapphire-emerald', 0, 16, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_shape/ruby_sp_eme.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00')
ON CONFLICT (id) DO NOTHING;

-- 11.10 Diamond Size Options
INSERT INTO public.diamond_size_options (id, name, option_value, price, display_order, image_url, created_at, updated_at) VALUES
  ('eda0a856-4c39-4d29-a158-9f6da0bb112e', '1CT', '1ct', 600, 1, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_size/1ct.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('1683f32c-bf71-4ba2-93ac-9282d1b6e14b', '1.5CT', '1.5ct', 900, 2, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_size/1.5ct.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('46eda8ae-bbd8-47aa-99f6-439ea5bfe067', '2CT', '2ct', 1200, 3, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_size/2ct.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('5b9dfcb0-deb9-4d88-9e62-b3a1ee18ddb0', '2.5CT', '2.5ct', 1500, 4, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_size/2.5ct.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('3f72003c-7447-411b-a4a5-08e9883dcd78', '3CT', '3ct', 1800, 5, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_size/3ct.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('bf411880-59e5-48c9-b3b2-9ab387fc38bc', '3.5CT', '3.5ct', 2100, 6, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_size/3.5ct.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('eed91589-fa84-4e81-9dfb-a389d56aada2', '4CT', '4ct', 2400, 7, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_size/4ct.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('ed40d2c7-8d31-4236-9c8a-94f403287627', '4.5CT', '4.5ct', 2700, 8, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_size/4.5ct.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('75246036-7734-4f7f-bcb0-bc19047c728e', '5CT+', '5ct+', 3000, 9, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_size/5ct%2B.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00')
ON CONFLICT (id) DO NOTHING;

-- 11.11 Diamond Quality Options
INSERT INTO public.diamond_quality_options (id, name, option_value, price, display_order, image_url, created_at, updated_at) VALUES
  ('72e85674-d08c-411e-90fc-bac121ff24bd', 'E Colour, VVS2 Clarity', 'e-vvs2', 400, 2, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_quality/E+Colour+VVS2+Clarity+(%2B%24400).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('7508cdad-ec4f-474b-a83f-6825bb523d1a', 'D Colour, VVS1 Clarity', 'd-vvs1', 1500, 3, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_quality/D+Colour+VVS1+Clarity+(%2B%241500).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00')
ON CONFLICT (id) DO NOTHING;

-- 11.12 Ring Setting Options
INSERT INTO public.ring_setting_options (id, name, option_value, price, display_order, image_url, created_at, updated_at) VALUES
  ('c46b208b-cf59-4144-bdc0-fc81d0c5aea8', 'Solitaire - Classic', 'solitaire-classic', 1000, 1, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_setting/Solitaire+-+Classic+(%2B%241000).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('b132d780-2dd7-4918-8ef1-59ddb4900752', 'Cathedral - Classic', 'cathedral-classic', 1000, 2, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_setting/Cathedral+-+Classic+(%2B%241000).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('d340dd88-a1fc-4e7f-bde2-a44ff6730271', 'Side Stones - Small', 'side-stones-small', 1300, 3, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_setting/Side+Stones+-+Small+(%2B%241300).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('a0f70fc0-cf7e-4457-8b62-7244cf7f21a2', 'Side Stones - Large', 'side-stones-large', 1800, 4, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_setting/Side+Stones+-+Large+(%2B%241800).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('e912bb0a-8d64-470f-95a9-50de091f7832', 'Bypass Setting', 'bypass-setting', 1200, 5, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_setting/Bypass+Setting+(%2B%241200).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('e0c10554-3677-458e-ac42-880f2a3e8bd0', 'East-West Setting', 'east-west-setting', 1000, 6, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_setting/East-West+Setting+(%2B%241000).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('1bc49773-f213-45eb-bdfb-3d09c859821a', 'Vintage / Art Deco', 'vintage-art-deco', 1400, 7, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_setting/Vintage_Art+Deco+(%2B%241400).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('659d4876-3a40-4611-9a65-8c7f7681146f', 'Toi et Moi', 'toi-et-moi', 3000, 8, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_setting/Toi+et+Moi+(%2B%243000).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00')
ON CONFLICT (id) DO NOTHING;

-- 11.13 Diamond Holder Options
INSERT INTO public.diamond_holder_options (id, name, option_value, price, display_order, image_url, created_at, updated_at) VALUES
  ('f44fcbc5-dcf0-44b1-8874-99e92be431ca', 'Gallery Rail - Classic', 'gallery-rail-classic', 0, 1, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_held/Gallery+Rail+-+Classic+(%2B%240).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('a5314565-fea5-400a-a17f-ce47ebc4931c', 'Hidden Halo', 'hidden-halo', 300, 2, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_held/Hidden+Halo+(%2B%24300).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('21eca7ea-4cac-48eb-9f98-e5260b375d64', 'Curved Hidden Halo', 'curved-hidden-halo', 350, 3, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_held/Curved+Hidden+Halo+(%2B%24350).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('b2249119-1ef1-45d6-8a67-12386accf14b', 'Outer Halo', 'outer-halo', 400, 4, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_held/Outer+Halo+(%2B%24400).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('52a3c0ab-089c-40cf-9204-50fe22c4a9e9', 'Tulip Basket', 'tulip-basket', 200, 5, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_held/Tulip+Basket+(%2B%24200).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('c758f89e-b5a0-4236-a1df-3a92c4128df9', 'Diamond Basket', 'diamond-basket', 400, 6, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_held/Diamond+Basket+(%2B%24400).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('9903784c-4360-4371-a1a1-67fc8567eca6', 'Half Bezel', 'half-bezel', 150, 7, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_held/Half+Bezel+(%2B%24150).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('1980c4ff-193b-4240-9414-d57d3ce7cb68', 'Full Bezel', 'full-bezel', 200, 8, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/diamond_held/Full+Bezel+(%2B%24200).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00')
ON CONFLICT (id) DO NOTHING;

-- 11.14 Band Type Options
INSERT INTO public.band_type_options (id, name, option_value, price, display_order, image_url, created_at, updated_at) VALUES
  ('2373bf28-f02f-4e73-9939-5d639c856aa0', 'Regular - Classic', 'regular-classic', 0, 1, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/type_of_band/Regular+-+Classic+(%2B%240).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('7fc8604b-02a4-4639-9a58-f5526ad63f15', 'Pave Diamonds', 'pave-diamonds', 300, 2, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/type_of_band/Pave+Diamonds+(%2B%24300).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('25af6055-0853-4e58-82eb-21b8501adc08', '3 Sided Pave', '3-sided-pave', 500, 3, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/type_of_band/3+Sided+Pave+(%2B%24500).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('4178fcab-d89b-4912-b6b8-3801d826337a', 'Hidden Pave', 'hidden-pave', 400, 4, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/type_of_band/Hidden+Pave+(%2B%24400).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('511c0b86-249b-4441-adc1-62e30fa0e3ad', 'Channel Diamonds', 'channel-diamonds', 500, 5, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/type_of_band/Channel+Diamonds+(%2B%24500).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('9cfe388a-2b2b-463f-8bf9-77be3408c2b6', 'Bubble Band', 'bubble-band', 500, 6, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/type_of_band/Bubble+Band+(%2B%24500).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('4cb1df0c-6cd3-4539-b7b3-b1a53c0930e1', 'Split Shank', 'split-shank', 100, 7, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/type_of_band/Split+Shank+(%2B%24100).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('a9149211-bcd8-4ee6-8cc2-1b0fc88ce9f4', 'Band Engraving', 'band-engraving', 1500, 8, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/type_of_band/Band+Engraving+(%2B%241500).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00')
ON CONFLICT (id) DO NOTHING;

-- 11.15 Band Width Options
INSERT INTO public.band_width_options (id, name, option_value, price, display_order, image_url, created_at, updated_at) VALUES
  ('87d3ff62-bcf8-414f-9ae7-01a3903237c4', 'Thin 1.8mm', 'thin-1.8mm', 0, 1, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/band_width/mm1.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('7376ba8e-c710-460b-9554-3b8286d67366', 'Classic 2mm', 'classic-2mm', 0, 2, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/band_width/mm2.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('82276d5f-502b-4324-9e40-8f81abe6d0ae', 'Medium 3mm', 'medium-3mm', 300, 3, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/band_width/mm3.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('44e8e37c-968d-4640-839f-7a2a6f1bc956', 'Thick 4mm', 'thick-4mm', 400, 4, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/band_width/mm4.png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00')
ON CONFLICT (id) DO NOTHING;

-- 11.16 Ring Metal Options
INSERT INTO public.ring_metal_options (id, name, option_value, price, display_order, image_url, created_at, updated_at) VALUES
  ('e42817eb-5cbe-4da3-aa61-1db807f68278', '14K Yellow Gold', '14k-yellow-gold', 0, 1, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_metal/14k+Yellow+Gold+(%2B%240).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('c6a31a5a-32aa-4308-81a2-be979e6b0435', '14K White Gold', '14k-white-gold', 0, 2, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_metal/14k+White+Gold+(%2B%240).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('b88febca-035d-4674-ac74-7c3ad1bbe608', '18K Yellow Gold', '18k-yellow-gold', 400, 3, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_metal/18k+Yellow+Gold+(%2B%24400).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('acded1c8-f2fc-4af3-a567-8af045d783af', '18K White Gold', '18k-white-gold', 400, 4, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_metal/18k+White+Gold+(%2B%24400).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('c271cda6-559f-40c0-b940-5a9fd8f249e1', '14K Rose Gold', '14k-rose-gold', 0, 5, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_metal/14k+Rose+Gold+(%2B%240).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('b18b118e-afb6-44fd-9fed-9f4073c31913', 'Platinum', 'platinum', 650, 6, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_metal/Platinum+(%2B%24650).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('9b87d233-e5d8-431b-8546-2abedf232d38', 'Two Tone Ring', 'two-tone', 500, 7, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/ring_metal/Two+Tone+Ring+(%2B%24500).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00')
ON CONFLICT (id) DO NOTHING;

-- 11.17 Personalization Options
INSERT INTO public.personalization_options (id, name, option_value, price, display_order, image_url, created_at, updated_at) VALUES
  ('332c6a8f-78c0-4f81-b934-f343a4691248', 'Initials Engraving', 'initials-engraving', 0, 1, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/personalized_ring_features/Initials+Engraving+(%2B%240).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('cc75c5a4-fb9a-4dab-a8e5-bd7e00915aeb', 'Hidden Gemstones', 'hidden-gemstones', 150, 2, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/personalized_ring_features/Hidden+Gemstones+(%2B%24150).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('5c1a6036-3b42-47f3-82f7-e4c6ca600e9a', 'Bridge Diamonds', 'bridge-diamonds', 300, 3, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/personalized_ring_features/Bridge+Diamonds+(%2B%24300).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('0581e564-3e06-4a3b-801e-61f4ad38396e', 'Bridge Engraving', 'bridge-engraving', 750, 4, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/personalized_ring_features/Bridge+Engraving+(%2B%24750).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('c0c00755-d31d-419d-88d2-5d5721513a69', 'Euroshank Base', 'euroshank-base', 100, 5, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/personalized_ring_features/Euroshank+Base+(%2B%240).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('792bdb5b-8aca-4ee9-a408-75e9f7690861', 'Wedding Band Sit Flush', 'wedding-band-sit-flush', 0, 6, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/personalized_ring_features/Wedding+Band+Sit+Flush+(%2B%240).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('960b2639-ddcd-4faa-bfca-a7f6bd82bf2c', 'Low Profile', 'low-profile', 0, 7, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/personalized_ring_features/Low+Profile+(%2B%240).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00'),
  ('5962d9dd-b6c0-48a1-81ef-8d8c4dbc190c', 'Double Prongs', 'double-prongs', 0, 8, 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog/personalized_ring_features/Double+Prongs+(%2B%240).png', '2026-02-09 04:47:15.025687+00', '2026-02-09 04:47:15.025687+00')
ON CONFLICT (id) DO NOTHING;

-- 11.18 Products (Legacy ring builder products)
INSERT INTO public.products (id, agency_id, name, description, category, base_cost, manufacturing_cost, image_urls, model_3d_url, status, created_at) VALUES
  ('11111111-1111-1111-1111-111111111111', '2d88c3d6-554d-4e54-b840-75dd76d85133', 'Classic Solitaire Engagement Ring', 'Timeless elegance with a single stunning diamond. Features a delicate band that showcases the center stone beautifully.', 'Engagement Rings', 1200.00, 720.00, ARRAY['/images/rings/emerald-yellow-angle-0.png','/images/rings/emerald-yellow-angle-1.png','/images/rings/emerald-yellow-angle-2.png','/images/rings/emerald-yellow-angle-3.png'], '/models/the_crowned_ring.obj', 'active', '2025-11-17 21:02:35.561124+00'),
  ('22222222-2222-2222-2222-222222222222', '2d88c3d6-554d-4e54-b840-75dd76d85133', 'Halo Diamond Engagement Ring', 'A brilliant center stone surrounded by a halo of smaller diamonds for maximum sparkle and presence.', 'Engagement Rings', 1800.00, 1080.00, ARRAY['/images/rings/emerald-white-angle-0.png','/images/rings/emerald-white-angle-1.png','/images/rings/emerald-white-angle-2.png','/images/rings/emerald-white-angle-3.png'], '/models/the_crowned_ring.obj', 'active', '2025-11-17 21:02:35.561124+00'),
  ('33333333-3333-3333-3333-333333333333', '2d88c3d6-554d-4e54-b840-75dd76d85133', 'Three Stone Anniversary Ring', 'Symbolizing past, present, and future. Three perfectly matched stones in a classic setting.', 'Anniversary Rings', 2200.00, 1320.00, ARRAY['/images/rings/emerald-yellow-angle-0.png','/images/rings/emerald-yellow-angle-1.png','/images/rings/emerald-yellow-angle-2.png','/images/rings/emerald-yellow-angle-3.png'], '/models/the_crowned_ring.obj', 'active', '2025-11-17 21:02:35.561124+00'),
  ('44444444-4444-4444-4444-444444444444', '2d88c3d6-554d-4e54-b840-75dd76d85133', 'Vintage Art Deco Ring', 'Inspired by 1920s glamour with intricate milgrain details and geometric patterns.', 'Vintage Rings', 1500.00, 900.00, ARRAY['/images/rings/emerald-white-angle-0.png','/images/rings/emerald-white-angle-1.png','/images/rings/emerald-white-angle-2.png','/images/rings/emerald-white-angle-3.png'], '/models/the_crowned_ring.obj', 'active', '2025-11-17 21:02:35.561124+00'),
  ('55555555-5555-5555-5555-555555555555', '2d88c3d6-554d-4e54-b840-75dd76d85133', 'Modern Tension Set Ring', 'Contemporary design where the diamond appears to float between two bands through tension.', 'Modern Rings', 1900.00, 1140.00, ARRAY['/images/rings/emerald-yellow-angle-0.png','/images/rings/emerald-yellow-angle-1.png','/images/rings/emerald-yellow-angle-2.png','/images/rings/emerald-yellow-angle-3.png','/images/rings/emerald-white-angle-0.png','/images/rings/emerald-white-angle-1.png','/images/rings/emerald-white-angle-2.png','/images/rings/emerald-white-angle-3.png'], '/models/the_crowned_ring.obj', 'active', '2025-11-17 21:02:35.561124+00'),
  ('66666666-6666-6666-6666-666666666666', '2d88c3d6-554d-4e54-b840-75dd76d85133', 'Emerald Cut Engagement Ring', 'Stunning emerald-cut diamond engagement ring available in yellow gold and white metal.', 'Engagement Rings', 2800.00, 1680.00, ARRAY['/images/rings/emerald-yellow-angle-0.png','/images/rings/emerald-yellow-angle-1.png','/images/rings/emerald-yellow-angle-2.png','/images/rings/emerald-yellow-angle-3.png','/images/rings/emerald-white-angle-0.png','/images/rings/emerald-white-angle-1.png','/images/rings/emerald-white-angle-2.png','/images/rings/emerald-white-angle-3.png'], NULL, 'active', '2025-11-17 22:29:41.118638+00')
ON CONFLICT (id) DO NOTHING;

-- 11.19 Retention Policies
INSERT INTO public.retention_policies (id, client_id, table_name, retention_days, auto_cleanup, created_at) VALUES
  ('60885faa-af52-4685-84e8-a3b9186e86c3', 'd3333333-3333-3333-3333-333333333333', 'analytics_events', 90, true, '2025-11-20 01:36:39.878919+00'),
  ('5199917d-ba2b-4c4a-9abd-2921dbbbc062', 'e02e4bb7-30fa-4f45-967d-0bedbf980506', 'analytics_events', 90, true, '2025-11-20 01:36:39.878919+00'),
  ('0ec7703f-c9c4-4b76-8f34-a3b45bcdd511', 'd3333333-3333-3333-3333-333333333333', 'ai_chat_messages', 60, true, '2025-11-20 01:36:39.878919+00'),
  ('546a0b8c-b525-4752-b199-4223ab9679a8', 'e02e4bb7-30fa-4f45-967d-0bedbf980506', 'ai_chat_messages', 60, true, '2025-11-20 01:36:39.878919+00'),
  ('c8f933b2-d6ab-47c1-8b32-dc4537acfafa', 'd3333333-3333-3333-3333-333333333333', 'saved_designs', 180, false, '2025-11-20 01:36:39.878919+00'),
  ('a2449bb1-a310-441d-ae70-f8288653a880', 'e02e4bb7-30fa-4f45-967d-0bedbf980506', 'saved_designs', 180, false, '2025-11-20 01:36:39.878919+00')
ON CONFLICT (id) DO NOTHING;

-- 11.20 Design Requests
INSERT INTO public.design_requests (id, client_id, request_type, description, preferred_metal, preferred_style, budget_range, priority, status, created_at) VALUES
  ('e831aa34-8814-46a5-afac-843bdd6c8a1d', 'd3333333-3333-3333-3333-333333333333', 'modification', 'Resize and add diamond accents to family heirloom ring', 'yellow-gold', 'vintage', '$1500-$2500', 'low', 'submitted', '2025-11-17 21:02:35.561124+00')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SECTION 11.21: LARGE TABLE DATA
-- ============================================================
-- The following tables have 100s of rows each.
-- Their COMPLETE data is in the JSON backup at:
--   product-assets/backups/2026-02-17T04-54-10-723Z.json.gz
--
-- To restore these, use the backup-download edge function:
--   POST /backup-download { "filePath": "backups/2026-02-17T04-54-10-723Z.json.gz", "action": "view" }
--
-- Tables included in the backup:
--   - my_master_db_data (576 rows - ring product combinations)
--   - master_ring_variants (576 rows - variant permutations)
--   - client_ring_catalog (609 rows - per-client catalog entries)
--   - client_diamond_presets (474 rows - per-client diamond pricing)
--   - client_onboarding_preferences (5 rows)
--   - client_metal_variants (~21 rows)
--   - client_option_prices (~28 rows)
--   - client_carat_options (~45+ rows)
--   - client_size_options (~63+ rows)
--   - clients (5 rows - NOTE: encrypted Shopify tokens cannot be migrated via SQL)
--   - orders (20+ rows)
--   - saved_designs (12+ rows)
--   - product_variations (30+ rows)
--   - client_products (5 rows)
--   - ai_training_examples (22+ rows)
--   - diamond_form_leads (20+ rows)
--   - ring_configured_by_client (2 rows)
--   - staff_members (3 rows)
--   - admin_staff_members (7 rows)
--   - client_notification_preferences (2 rows)
--
-- For a full SQL import of these tables, use the CSV import tool
-- in the admin dashboard or restore from the JSON backup above.
-- ============================================================

-- ============================================================
-- POST-MIGRATION STEPS:
-- 
-- 1. Update get_asset_cdn_url() function:
--    Replace 'YOUR_PROJECT_REF' with your actual Supabase project reference
--
-- 2. Set encryption key:
--    ALTER DATABASE postgres SET "app.settings.encryption_key" = 'your-secure-key-here';
--
-- 3. Deploy Edge Functions from supabase/functions/ directory:
--    supabase functions deploy --all
--
-- 4. Set Edge Function secrets:
--    supabase secrets set RESEND_API_KEY=your-key
--    supabase secrets set LOVABLE_API_KEY=your-key
--
-- 5. Create your first agency_admin user and assign role:
--    INSERT INTO public.user_roles (user_id, role) VALUES ('your-user-uuid', 'agency_admin');
--
-- 6. Create your agency:
--    INSERT INTO public.agencies (name) VALUES ('Your Agency Name');
-- ============================================================
