-- Bridge: add columns that exist in the source project schema (docs/FULL_MIGRATION.sql, 2026-02-16)
-- but were created outside the migration history. Only touches tables that already exist; constraints omitted.

DO $b$ BEGIN
  IF to_regclass('public.agencies') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS name TEXT';
    EXECUTE 'ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS logo_url TEXT';
    EXECUTE 'ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT ''#6366F1''';
    EXECUTE 'ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT ''#E8B4B8''';
    EXECUTE 'ALTER TABLE public.agencies ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.subscription_plans') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS name TEXT';
    EXECUTE 'ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS description TEXT';
    EXECUTE 'ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS price_monthly NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS price_yearly NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS max_products INTEGER DEFAULT 10';
    EXECUTE 'ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS max_orders INTEGER DEFAULT 100';
    EXECUTE 'ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS max_storage_mb INTEGER DEFAULT 500';
    EXECUTE 'ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS max_staff INTEGER DEFAULT 3';
    EXECUTE 'ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS features JSONB DEFAULT ''{}''';
    EXECUTE 'ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT true';
    EXECUTE 'ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.user_roles') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS user_id UUID';
    EXECUTE 'ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS role app_role';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.account_lockouts') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.account_lockouts ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.account_lockouts ADD COLUMN IF NOT EXISTS email TEXT';
    EXECUTE 'ALTER TABLE public.account_lockouts ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ';
    EXECUTE 'ALTER TABLE public.account_lockouts ADD COLUMN IF NOT EXISTS requires_email_unlock BOOLEAN DEFAULT true';
    EXECUTE 'ALTER TABLE public.account_lockouts ADD COLUMN IF NOT EXISTS failed_attempts INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.account_lockouts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.account_lockouts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.rate_limits') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.rate_limits ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.rate_limits ADD COLUMN IF NOT EXISTS identifier TEXT';
    EXECUTE 'ALTER TABLE public.rate_limits ADD COLUMN IF NOT EXISTS endpoint TEXT';
    EXECUTE 'ALTER TABLE public.rate_limits ADD COLUMN IF NOT EXISTS request_count INTEGER DEFAULT 1';
    EXECUTE 'ALTER TABLE public.rate_limits ADD COLUMN IF NOT EXISTS window_start TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.rate_limits ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS "timestamp" TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_id UUID';
    EXECUTE 'ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_email TEXT';
    EXECUTE 'ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_role TEXT';
    EXECUTE 'ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS action_type TEXT';
    EXECUTE 'ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS resource_type TEXT';
    EXECUTE 'ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS resource_id UUID';
    EXECUTE 'ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS changes JSONB';
    EXECUTE 'ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS ip_address INET';
    EXECUTE 'ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT';
    EXECUTE 'ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT ''info''';
    EXECUTE 'ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS metadata JSONB';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.backup_logs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.backup_logs ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.backup_logs ADD COLUMN IF NOT EXISTS backup_date TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.backup_logs ADD COLUMN IF NOT EXISTS backup_type TEXT';
    EXECUTE 'ALTER TABLE public.backup_logs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT ''in_progress''';
    EXECUTE 'ALTER TABLE public.backup_logs ADD COLUMN IF NOT EXISTS file_path TEXT';
    EXECUTE 'ALTER TABLE public.backup_logs ADD COLUMN IF NOT EXISTS file_size_mb NUMERIC';
    EXECUTE 'ALTER TABLE public.backup_logs ADD COLUMN IF NOT EXISTS tables_backed_up TEXT[]';
    EXECUTE 'ALTER TABLE public.backup_logs ADD COLUMN IF NOT EXISTS error_message TEXT';
    EXECUTE 'ALTER TABLE public.backup_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT ''{}''';
    EXECUTE 'ALTER TABLE public.backup_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.password_reset_tokens') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.password_reset_tokens ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.password_reset_tokens ADD COLUMN IF NOT EXISTS user_id UUID';
    EXECUTE 'ALTER TABLE public.password_reset_tokens ADD COLUMN IF NOT EXISTS token TEXT';
    EXECUTE 'ALTER TABLE public.password_reset_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ';
    EXECUTE 'ALTER TABLE public.password_reset_tokens ADD COLUMN IF NOT EXISTS used BOOLEAN DEFAULT false';
    EXECUTE 'ALTER TABLE public.password_reset_tokens ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.email_verification_tokens') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.email_verification_tokens ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.email_verification_tokens ADD COLUMN IF NOT EXISTS user_id UUID';
    EXECUTE 'ALTER TABLE public.email_verification_tokens ADD COLUMN IF NOT EXISTS email TEXT';
    EXECUTE 'ALTER TABLE public.email_verification_tokens ADD COLUMN IF NOT EXISTS token TEXT';
    EXECUTE 'ALTER TABLE public.email_verification_tokens ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ';
    EXECUTE 'ALTER TABLE public.email_verification_tokens ADD COLUMN IF NOT EXISTS used BOOLEAN DEFAULT false';
    EXECUTE 'ALTER TABLE public.email_verification_tokens ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.failed_login_attempts') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.failed_login_attempts ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.failed_login_attempts ADD COLUMN IF NOT EXISTS email TEXT';
    EXECUTE 'ALTER TABLE public.failed_login_attempts ADD COLUMN IF NOT EXISTS ip_address TEXT';
    EXECUTE 'ALTER TABLE public.failed_login_attempts ADD COLUMN IF NOT EXISTS user_agent TEXT';
    EXECUTE 'ALTER TABLE public.failed_login_attempts ADD COLUMN IF NOT EXISTS attempted_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.failed_login_attempts ADD COLUMN IF NOT EXISTS reason TEXT';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.email_logs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS recipient_email TEXT';
    EXECUTE 'ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS template_name TEXT';
    EXECUTE 'ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS subject TEXT';
    EXECUTE 'ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT ''sent''';
    EXECUTE 'ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS error_message TEXT';
    EXECUTE 'ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT ''{}''';
    EXECUTE 'ALTER TABLE public.email_logs ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.lookup_styles') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.lookup_styles ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.lookup_styles ADD COLUMN IF NOT EXISTS style_id TEXT';
    EXECUTE 'ALTER TABLE public.lookup_styles ADD COLUMN IF NOT EXISTS style_name TEXT';
    EXECUTE 'ALTER TABLE public.lookup_styles ADD COLUMN IF NOT EXISTS description TEXT';
    EXECUTE 'ALTER TABLE public.lookup_styles ADD COLUMN IF NOT EXISTS base_price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.lookup_styles ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.lookup_styles ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true';
    EXECUTE 'ALTER TABLE public.lookup_styles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.lookup_shanks') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.lookup_shanks ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.lookup_shanks ADD COLUMN IF NOT EXISTS shank_id TEXT';
    EXECUTE 'ALTER TABLE public.lookup_shanks ADD COLUMN IF NOT EXISTS shank_name TEXT';
    EXECUTE 'ALTER TABLE public.lookup_shanks ADD COLUMN IF NOT EXISTS description TEXT';
    EXECUTE 'ALTER TABLE public.lookup_shanks ADD COLUMN IF NOT EXISTS base_price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.lookup_shanks ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.lookup_shanks ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true';
    EXECUTE 'ALTER TABLE public.lookup_shanks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.lookup_shapes') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.lookup_shapes ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.lookup_shapes ADD COLUMN IF NOT EXISTS shape_id TEXT';
    EXECUTE 'ALTER TABLE public.lookup_shapes ADD COLUMN IF NOT EXISTS shape_name TEXT';
    EXECUTE 'ALTER TABLE public.lookup_shapes ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.lookup_shapes ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true';
    EXECUTE 'ALTER TABLE public.lookup_shapes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.lookup_metals') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.lookup_metals ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.lookup_metals ADD COLUMN IF NOT EXISTS metal_id TEXT';
    EXECUTE 'ALTER TABLE public.lookup_metals ADD COLUMN IF NOT EXISTS metal_name TEXT';
    EXECUTE 'ALTER TABLE public.lookup_metals ADD COLUMN IF NOT EXISTS color_hex TEXT';
    EXECUTE 'ALTER TABLE public.lookup_metals ADD COLUMN IF NOT EXISTS base_price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.lookup_metals ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.lookup_metals ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true';
    EXECUTE 'ALTER TABLE public.lookup_metals ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.lookup_metals ADD COLUMN IF NOT EXISTS color_family TEXT';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.lookup_visual_colors') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.lookup_visual_colors ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.lookup_visual_colors ADD COLUMN IF NOT EXISTS color_id TEXT';
    EXECUTE 'ALTER TABLE public.lookup_visual_colors ADD COLUMN IF NOT EXISTS color_name TEXT';
    EXECUTE 'ALTER TABLE public.lookup_visual_colors ADD COLUMN IF NOT EXISTS color_hex TEXT';
    EXECUTE 'ALTER TABLE public.lookup_visual_colors ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.lookup_visual_colors ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true';
    EXECUTE 'ALTER TABLE public.lookup_visual_colors ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.diamond_nature_options') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.diamond_nature_options ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.diamond_nature_options ADD COLUMN IF NOT EXISTS name TEXT';
    EXECUTE 'ALTER TABLE public.diamond_nature_options ADD COLUMN IF NOT EXISTS option_value TEXT';
    EXECUTE 'ALTER TABLE public.diamond_nature_options ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.diamond_nature_options ADD COLUMN IF NOT EXISTS image_url TEXT';
    EXECUTE 'ALTER TABLE public.diamond_nature_options ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.diamond_nature_options ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.diamond_nature_options ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.diamond_shape_options') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.diamond_shape_options ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.diamond_shape_options ADD COLUMN IF NOT EXISTS name TEXT';
    EXECUTE 'ALTER TABLE public.diamond_shape_options ADD COLUMN IF NOT EXISTS option_value TEXT';
    EXECUTE 'ALTER TABLE public.diamond_shape_options ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.diamond_shape_options ADD COLUMN IF NOT EXISTS image_url TEXT';
    EXECUTE 'ALTER TABLE public.diamond_shape_options ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.diamond_shape_options ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.diamond_shape_options ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.diamond_size_options') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.diamond_size_options ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.diamond_size_options ADD COLUMN IF NOT EXISTS name TEXT';
    EXECUTE 'ALTER TABLE public.diamond_size_options ADD COLUMN IF NOT EXISTS option_value TEXT';
    EXECUTE 'ALTER TABLE public.diamond_size_options ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.diamond_size_options ADD COLUMN IF NOT EXISTS image_url TEXT';
    EXECUTE 'ALTER TABLE public.diamond_size_options ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.diamond_size_options ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.diamond_size_options ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.diamond_quality_options') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.diamond_quality_options ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.diamond_quality_options ADD COLUMN IF NOT EXISTS name TEXT';
    EXECUTE 'ALTER TABLE public.diamond_quality_options ADD COLUMN IF NOT EXISTS option_value TEXT';
    EXECUTE 'ALTER TABLE public.diamond_quality_options ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.diamond_quality_options ADD COLUMN IF NOT EXISTS image_url TEXT';
    EXECUTE 'ALTER TABLE public.diamond_quality_options ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.diamond_quality_options ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.diamond_quality_options ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.ring_setting_options') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.ring_setting_options ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.ring_setting_options ADD COLUMN IF NOT EXISTS name TEXT';
    EXECUTE 'ALTER TABLE public.ring_setting_options ADD COLUMN IF NOT EXISTS option_value TEXT';
    EXECUTE 'ALTER TABLE public.ring_setting_options ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.ring_setting_options ADD COLUMN IF NOT EXISTS image_url TEXT';
    EXECUTE 'ALTER TABLE public.ring_setting_options ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.ring_setting_options ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.ring_setting_options ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.diamond_holder_options') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.diamond_holder_options ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.diamond_holder_options ADD COLUMN IF NOT EXISTS name TEXT';
    EXECUTE 'ALTER TABLE public.diamond_holder_options ADD COLUMN IF NOT EXISTS option_value TEXT';
    EXECUTE 'ALTER TABLE public.diamond_holder_options ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.diamond_holder_options ADD COLUMN IF NOT EXISTS image_url TEXT';
    EXECUTE 'ALTER TABLE public.diamond_holder_options ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.diamond_holder_options ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.diamond_holder_options ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.band_type_options') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.band_type_options ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.band_type_options ADD COLUMN IF NOT EXISTS name TEXT';
    EXECUTE 'ALTER TABLE public.band_type_options ADD COLUMN IF NOT EXISTS option_value TEXT';
    EXECUTE 'ALTER TABLE public.band_type_options ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.band_type_options ADD COLUMN IF NOT EXISTS image_url TEXT';
    EXECUTE 'ALTER TABLE public.band_type_options ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.band_type_options ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.band_type_options ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.band_width_options') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.band_width_options ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.band_width_options ADD COLUMN IF NOT EXISTS name TEXT';
    EXECUTE 'ALTER TABLE public.band_width_options ADD COLUMN IF NOT EXISTS option_value TEXT';
    EXECUTE 'ALTER TABLE public.band_width_options ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.band_width_options ADD COLUMN IF NOT EXISTS image_url TEXT';
    EXECUTE 'ALTER TABLE public.band_width_options ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.band_width_options ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.band_width_options ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.ring_metal_options') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.ring_metal_options ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.ring_metal_options ADD COLUMN IF NOT EXISTS name TEXT';
    EXECUTE 'ALTER TABLE public.ring_metal_options ADD COLUMN IF NOT EXISTS option_value TEXT';
    EXECUTE 'ALTER TABLE public.ring_metal_options ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.ring_metal_options ADD COLUMN IF NOT EXISTS image_url TEXT';
    EXECUTE 'ALTER TABLE public.ring_metal_options ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.ring_metal_options ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.ring_metal_options ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.personalization_options') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.personalization_options ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.personalization_options ADD COLUMN IF NOT EXISTS name TEXT';
    EXECUTE 'ALTER TABLE public.personalization_options ADD COLUMN IF NOT EXISTS option_value TEXT';
    EXECUTE 'ALTER TABLE public.personalization_options ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.personalization_options ADD COLUMN IF NOT EXISTS image_url TEXT';
    EXECUTE 'ALTER TABLE public.personalization_options ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.personalization_options ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.personalization_options ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.admin_staff_members') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.admin_staff_members ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.admin_staff_members ADD COLUMN IF NOT EXISTS user_id UUID';
    EXECUTE 'ALTER TABLE public.admin_staff_members ADD COLUMN IF NOT EXISTS name TEXT';
    EXECUTE 'ALTER TABLE public.admin_staff_members ADD COLUMN IF NOT EXISTS email TEXT';
    EXECUTE 'ALTER TABLE public.admin_staff_members ADD COLUMN IF NOT EXISTS phone TEXT';
    EXECUTE 'ALTER TABLE public.admin_staff_members ADD COLUMN IF NOT EXISTS status TEXT DEFAULT ''active''';
    EXECUTE 'ALTER TABLE public.admin_staff_members ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.admin_staff_members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.admin_activity_logs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.admin_activity_logs ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.admin_activity_logs ADD COLUMN IF NOT EXISTS admin_user_id UUID';
    EXECUTE 'ALTER TABLE public.admin_activity_logs ADD COLUMN IF NOT EXISTS admin_email TEXT';
    EXECUTE 'ALTER TABLE public.admin_activity_logs ADD COLUMN IF NOT EXISTS admin_name TEXT';
    EXECUTE 'ALTER TABLE public.admin_activity_logs ADD COLUMN IF NOT EXISTS admin_type TEXT DEFAULT ''admin_staff''';
    EXECUTE 'ALTER TABLE public.admin_activity_logs ADD COLUMN IF NOT EXISTS action_type TEXT';
    EXECUTE 'ALTER TABLE public.admin_activity_logs ADD COLUMN IF NOT EXISTS action_category TEXT';
    EXECUTE 'ALTER TABLE public.admin_activity_logs ADD COLUMN IF NOT EXISTS description TEXT';
    EXECUTE 'ALTER TABLE public.admin_activity_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT ''{}''';
    EXECUTE 'ALTER TABLE public.admin_activity_logs ADD COLUMN IF NOT EXISTS ip_address TEXT';
    EXECUTE 'ALTER TABLE public.admin_activity_logs ADD COLUMN IF NOT EXISTS user_agent TEXT';
    EXECUTE 'ALTER TABLE public.admin_activity_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.products') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.products ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.products ADD COLUMN IF NOT EXISTS agency_id UUID';
    EXECUTE 'ALTER TABLE public.products ADD COLUMN IF NOT EXISTS name TEXT';
    EXECUTE 'ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description TEXT';
    EXECUTE 'ALTER TABLE public.products ADD COLUMN IF NOT EXISTS category TEXT DEFAULT ''ring''';
    EXECUTE 'ALTER TABLE public.products ADD COLUMN IF NOT EXISTS base_cost NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.products ADD COLUMN IF NOT EXISTS manufacturing_cost NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_urls TEXT[]';
    EXECUTE 'ALTER TABLE public.products ADD COLUMN IF NOT EXISTS model_3d_url TEXT';
    EXECUTE 'ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cad_file_url TEXT';
    EXECUTE 'ALTER TABLE public.products ADD COLUMN IF NOT EXISTS status TEXT DEFAULT ''active''';
    EXECUTE 'ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_by_admin_id UUID';
    EXECUTE 'ALTER TABLE public.products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.product_variations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS product_id UUID';
    EXECUTE 'ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS style TEXT';
    EXECUTE 'ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS metal TEXT';
    EXECUTE 'ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS stone_type TEXT';
    EXECUTE 'ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS shape TEXT';
    EXECUTE 'ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS carat NUMERIC';
    EXECUTE 'ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS shank TEXT';
    EXECUTE 'ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS image_url TEXT';
    EXECUTE 'ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS additional_cost NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true';
    EXECUTE 'ALTER TABLE public.product_variations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.my_master_db_data') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS unique_id TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS combination_id TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS style_name TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS shank_id TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS shank_name TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS visual_color TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS visual_color_name TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS shape_id TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS shape_name TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS folder_path TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS image_0_filename TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS image_0_status TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS image_1_filename TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS image_1_status TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS image_2_filename TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS image_2_status TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS image_3_filename TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS image_3_status TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS video_filename TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS video_status TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS glb_model_filename TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS glb_model_status TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS transparent_0_filename TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS transparent_0_status TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS transparent_1_filename TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS transparent_1_status TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS transparent_2_filename TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS transparent_2_status TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS transparent_3_filename TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS transparent_3_status TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS model_photo_filename TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS model_photo_status TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS manufacture_cad_filename TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS manufacture_cad_status TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS rendered_cad_filename TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS rendered_cad_status TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS files_uploaded INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS total_files INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS all_upload_complete BOOLEAN DEFAULT false';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS drive_link TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS notes TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS base_price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS product_name TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS style_id TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS image_url_0 TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS image_url_1 TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS image_url_2 TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS image_url_3 TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS video_url TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS model_3d_url TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS transparent_url_0 TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS transparent_url_1 TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS transparent_url_2 TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS transparent_url_3 TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS manufacture_cad_url TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS rendered_cad_url TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS model_photo_url TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS style TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS carotimages_folder_path TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS carot_image_0_filename TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS carot_image_1_filename TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS carot_image_2_filename TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS carot_image_3_filename TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS carot_image_4_filename TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS carot_image_5_filename TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS carot_image_6_filename TEXT';
    EXECUTE 'ALTER TABLE public.my_master_db_data ADD COLUMN IF NOT EXISTS carot_image_7_filename TEXT';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.master_ring_variants') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.master_ring_variants ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.master_ring_variants ADD COLUMN IF NOT EXISTS variant_name TEXT';
    EXECUTE 'ALTER TABLE public.master_ring_variants ADD COLUMN IF NOT EXISTS metal_id TEXT';
    EXECUTE 'ALTER TABLE public.master_ring_variants ADD COLUMN IF NOT EXISTS metal_name TEXT';
    EXECUTE 'ALTER TABLE public.master_ring_variants ADD COLUMN IF NOT EXISTS color_family TEXT';
    EXECUTE 'ALTER TABLE public.master_ring_variants ADD COLUMN IF NOT EXISTS base_price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.master_ring_variants ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.master_ring_variants ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true';
    EXECUTE 'ALTER TABLE public.master_ring_variants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.master_ring_variants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.clients') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS agency_id UUID';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS user_id UUID';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS company_name TEXT';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS email TEXT';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS logo_url TEXT';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS status TEXT DEFAULT ''trial''';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS plan_id UUID';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS shopify_store_url TEXT';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS shopify_access_token_encrypted BYTEA';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS shopify_admin_access_token_encrypted BYTEA';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS shopify_storefront_token_encrypted BYTEA';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS shopify_webhook_secret_encrypted BYTEA';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS branding_config JSONB';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS custom_commission_rate NUMERIC';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS allowed_domains TEXT[]';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS widget_theme TEXT';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS address_line1 TEXT';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS address_line2 TEXT';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS city TEXT';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS state TEXT';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS postal_code TEXT';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS country TEXT';
    EXECUTE 'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS enabled_features JSONB DEFAULT ''{"diamond_form": true, "embed_branding": true, "product_catalogue": true, "ai_agent": true, "orders": true}''';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.staff_members') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS user_id UUID';
    EXECUTE 'ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS name TEXT';
    EXECUTE 'ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS email TEXT';
    EXECUTE 'ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS phone TEXT';
    EXECUTE 'ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS status TEXT DEFAULT ''active''';
    EXECUTE 'ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT ''{}''';
    EXECUTE 'ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.staff_members ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.admin_staff_client_access') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.admin_staff_client_access ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.admin_staff_client_access ADD COLUMN IF NOT EXISTS admin_staff_id UUID';
    EXECUTE 'ALTER TABLE public.admin_staff_client_access ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.admin_staff_client_access ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.admin_logging_information') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.admin_logging_information ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.admin_logging_information ADD COLUMN IF NOT EXISTS admin_user_id UUID';
    EXECUTE 'ALTER TABLE public.admin_logging_information ADD COLUMN IF NOT EXISTS admin_email TEXT';
    EXECUTE 'ALTER TABLE public.admin_logging_information ADD COLUMN IF NOT EXISTS admin_name TEXT';
    EXECUTE 'ALTER TABLE public.admin_logging_information ADD COLUMN IF NOT EXISTS action_category TEXT';
    EXECUTE 'ALTER TABLE public.admin_logging_information ADD COLUMN IF NOT EXISTS action_type TEXT';
    EXECUTE 'ALTER TABLE public.admin_logging_information ADD COLUMN IF NOT EXISTS description TEXT';
    EXECUTE 'ALTER TABLE public.admin_logging_information ADD COLUMN IF NOT EXISTS resource_type TEXT';
    EXECUTE 'ALTER TABLE public.admin_logging_information ADD COLUMN IF NOT EXISTS resource_id TEXT';
    EXECUTE 'ALTER TABLE public.admin_logging_information ADD COLUMN IF NOT EXISTS target_client_id UUID';
    EXECUTE 'ALTER TABLE public.admin_logging_information ADD COLUMN IF NOT EXISTS target_client_name TEXT';
    EXECUTE 'ALTER TABLE public.admin_logging_information ADD COLUMN IF NOT EXISTS ip_address TEXT';
    EXECUTE 'ALTER TABLE public.admin_logging_information ADD COLUMN IF NOT EXISTS user_agent TEXT';
    EXECUTE 'ALTER TABLE public.admin_logging_information ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT ''{}''';
    EXECUTE 'ALTER TABLE public.admin_logging_information ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.client_activity_logs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.client_activity_logs ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.client_activity_logs ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.client_activity_logs ADD COLUMN IF NOT EXISTS user_id UUID';
    EXECUTE 'ALTER TABLE public.client_activity_logs ADD COLUMN IF NOT EXISTS user_email TEXT';
    EXECUTE 'ALTER TABLE public.client_activity_logs ADD COLUMN IF NOT EXISTS user_name TEXT';
    EXECUTE 'ALTER TABLE public.client_activity_logs ADD COLUMN IF NOT EXISTS user_type TEXT';
    EXECUTE 'ALTER TABLE public.client_activity_logs ADD COLUMN IF NOT EXISTS action_type TEXT';
    EXECUTE 'ALTER TABLE public.client_activity_logs ADD COLUMN IF NOT EXISTS action_category TEXT';
    EXECUTE 'ALTER TABLE public.client_activity_logs ADD COLUMN IF NOT EXISTS description TEXT';
    EXECUTE 'ALTER TABLE public.client_activity_logs ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT ''{}''';
    EXECUTE 'ALTER TABLE public.client_activity_logs ADD COLUMN IF NOT EXISTS ip_address TEXT';
    EXECUTE 'ALTER TABLE public.client_activity_logs ADD COLUMN IF NOT EXISTS user_agent TEXT';
    EXECUTE 'ALTER TABLE public.client_activity_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.client_onboarding_preferences') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.client_onboarding_preferences ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.client_onboarding_preferences ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.client_onboarding_preferences ADD COLUMN IF NOT EXISTS selected_styles TEXT[] DEFAULT ''{}''';
    EXECUTE 'ALTER TABLE public.client_onboarding_preferences ADD COLUMN IF NOT EXISTS selected_shanks TEXT[] DEFAULT ''{}''';
    EXECUTE 'ALTER TABLE public.client_onboarding_preferences ADD COLUMN IF NOT EXISTS selected_shapes TEXT[] DEFAULT ''{}''';
    EXECUTE 'ALTER TABLE public.client_onboarding_preferences ADD COLUMN IF NOT EXISTS selected_metals TEXT[] DEFAULT ''{}''';
    EXECUTE 'ALTER TABLE public.client_onboarding_preferences ADD COLUMN IF NOT EXISTS selected_diamond_types TEXT[]';
    EXECUTE 'ALTER TABLE public.client_onboarding_preferences ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false';
    EXECUTE 'ALTER TABLE public.client_onboarding_preferences ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ';
    EXECUTE 'ALTER TABLE public.client_onboarding_preferences ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.client_onboarding_preferences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.client_metal_variants') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.client_metal_variants ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.client_metal_variants ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.client_metal_variants ADD COLUMN IF NOT EXISTS variant_name TEXT';
    EXECUTE 'ALTER TABLE public.client_metal_variants ADD COLUMN IF NOT EXISTS color_family TEXT';
    EXECUTE 'ALTER TABLE public.client_metal_variants ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.client_metal_variants ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.client_metal_variants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.client_metal_variants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.client_option_prices') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.client_option_prices ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.client_option_prices ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.client_option_prices ADD COLUMN IF NOT EXISTS option_id TEXT';
    EXECUTE 'ALTER TABLE public.client_option_prices ADD COLUMN IF NOT EXISTS option_type TEXT';
    EXECUTE 'ALTER TABLE public.client_option_prices ADD COLUMN IF NOT EXISTS price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.client_option_prices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.client_option_prices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.client_carat_options') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.client_carat_options ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.client_carat_options ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.client_carat_options ADD COLUMN IF NOT EXISTS carat_value NUMERIC';
    EXECUTE 'ALTER TABLE public.client_carat_options ADD COLUMN IF NOT EXISTS display_name TEXT';
    EXECUTE 'ALTER TABLE public.client_carat_options ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT true';
    EXECUTE 'ALTER TABLE public.client_carat_options ADD COLUMN IF NOT EXISTS price_adjustment NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.client_carat_options ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.client_carat_options ADD COLUMN IF NOT EXISTS image_filename_0 TEXT';
    EXECUTE 'ALTER TABLE public.client_carat_options ADD COLUMN IF NOT EXISTS image_filename_1 TEXT';
    EXECUTE 'ALTER TABLE public.client_carat_options ADD COLUMN IF NOT EXISTS image_filename_2 TEXT';
    EXECUTE 'ALTER TABLE public.client_carat_options ADD COLUMN IF NOT EXISTS image_filename_3 TEXT';
    EXECUTE 'ALTER TABLE public.client_carat_options ADD COLUMN IF NOT EXISTS image_filename_4 TEXT';
    EXECUTE 'ALTER TABLE public.client_carat_options ADD COLUMN IF NOT EXISTS image_filename_5 TEXT';
    EXECUTE 'ALTER TABLE public.client_carat_options ADD COLUMN IF NOT EXISTS image_filename_6 TEXT';
    EXECUTE 'ALTER TABLE public.client_carat_options ADD COLUMN IF NOT EXISTS image_filename_7 TEXT';
    EXECUTE 'ALTER TABLE public.client_carat_options ADD COLUMN IF NOT EXISTS images_filepath TEXT';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.client_size_options') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.client_size_options ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.client_size_options ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.client_size_options ADD COLUMN IF NOT EXISTS size_value TEXT';
    EXECUTE 'ALTER TABLE public.client_size_options ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT true';
    EXECUTE 'ALTER TABLE public.client_size_options ADD COLUMN IF NOT EXISTS price_adjustment NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.client_size_options ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.client_diamond_presets') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.client_diamond_presets ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.client_diamond_presets ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.client_diamond_presets ADD COLUMN IF NOT EXISTS stone_type TEXT';
    EXECUTE 'ALTER TABLE public.client_diamond_presets ADD COLUMN IF NOT EXISTS shape_id TEXT';
    EXECUTE 'ALTER TABLE public.client_diamond_presets ADD COLUMN IF NOT EXISTS carat_range TEXT';
    EXECUTE 'ALTER TABLE public.client_diamond_presets ADD COLUMN IF NOT EXISTS carat_value NUMERIC';
    EXECUTE 'ALTER TABLE public.client_diamond_presets ADD COLUMN IF NOT EXISTS color TEXT';
    EXECUTE 'ALTER TABLE public.client_diamond_presets ADD COLUMN IF NOT EXISTS clarity TEXT';
    EXECUTE 'ALTER TABLE public.client_diamond_presets ADD COLUMN IF NOT EXISTS base_price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.client_diamond_presets ADD COLUMN IF NOT EXISTS custom_price NUMERIC';
    EXECUTE 'ALTER TABLE public.client_diamond_presets ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT true';
    EXECUTE 'ALTER TABLE public.client_diamond_presets ADD COLUMN IF NOT EXISTS shopify_product_id TEXT';
    EXECUTE 'ALTER TABLE public.client_diamond_presets ADD COLUMN IF NOT EXISTS shopify_variant_id TEXT';
    EXECUTE 'ALTER TABLE public.client_diamond_presets ADD COLUMN IF NOT EXISTS shopify_sync_status TEXT';
    EXECUTE 'ALTER TABLE public.client_diamond_presets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.client_diamond_presets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.client_products') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.client_products ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.client_products ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.client_products ADD COLUMN IF NOT EXISTS product_id UUID';
    EXECUTE 'ALTER TABLE public.client_products ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT true';
    EXECUTE 'ALTER TABLE public.client_products ADD COLUMN IF NOT EXISTS markup_percentage NUMERIC DEFAULT 100';
    EXECUTE 'ALTER TABLE public.client_products ADD COLUMN IF NOT EXISTS custom_retail_price NUMERIC';
    EXECUTE 'ALTER TABLE public.client_products ADD COLUMN IF NOT EXISTS allow_jewelx_manufacturing BOOLEAN DEFAULT true';
    EXECUTE 'ALTER TABLE public.client_products ADD COLUMN IF NOT EXISTS allow_self_manufacturing BOOLEAN DEFAULT false';
    EXECUTE 'ALTER TABLE public.client_products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.client_ring_catalog') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.client_ring_catalog ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.client_ring_catalog ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.client_ring_catalog ADD COLUMN IF NOT EXISTS master_db_id UUID';
    EXECUTE 'ALTER TABLE public.client_ring_catalog ADD COLUMN IF NOT EXISTS master_variant_id UUID';
    EXECUTE 'ALTER TABLE public.client_ring_catalog ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT true';
    EXECUTE 'ALTER TABLE public.client_ring_catalog ADD COLUMN IF NOT EXISTS markup_percentage NUMERIC';
    EXECUTE 'ALTER TABLE public.client_ring_catalog ADD COLUMN IF NOT EXISTS custom_price NUMERIC';
    EXECUTE 'ALTER TABLE public.client_ring_catalog ADD COLUMN IF NOT EXISTS shopify_product_id TEXT';
    EXECUTE 'ALTER TABLE public.client_ring_catalog ADD COLUMN IF NOT EXISTS shopify_variant_id TEXT';
    EXECUTE 'ALTER TABLE public.client_ring_catalog ADD COLUMN IF NOT EXISTS shopify_sync_status TEXT';
    EXECUTE 'ALTER TABLE public.client_ring_catalog ADD COLUMN IF NOT EXISTS shopify_synced_at TIMESTAMPTZ';
    EXECUTE 'ALTER TABLE public.client_ring_catalog ADD COLUMN IF NOT EXISTS shopify_variants_map JSONB';
    EXECUTE 'ALTER TABLE public.client_ring_catalog ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.client_ring_catalog ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.client_notification_preferences') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.client_notification_preferences ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.client_notification_preferences ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.client_notification_preferences ADD COLUMN IF NOT EXISTS notification_type TEXT';
    EXECUTE 'ALTER TABLE public.client_notification_preferences ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT true';
    EXECUTE 'ALTER TABLE public.client_notification_preferences ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.client_notification_preferences ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.orders') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS product_id UUID';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS variation_id UUID';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS configuration JSONB';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_email TEXT';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_name TEXT';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_phone TEXT';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS customer_shipping JSONB';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS commission_deducted NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS commission_collected BOOLEAN DEFAULT false';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status TEXT DEFAULT ''pending''';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS manufacturing_status TEXT DEFAULT ''new_request''';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS manufacturing_cad_files TEXT[]';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS manufacturing_notes TEXT';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shopify_order_id TEXT';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_number TEXT';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS shipping_carrier TEXT';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS estimated_delivery_date DATE';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.order_items') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS order_id UUID';
    EXECUTE 'ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS product_id UUID';
    EXECUTE 'ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS variation_id UUID';
    EXECUTE 'ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1';
    EXECUTE 'ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS total_price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS configuration JSONB';
    EXECUTE 'ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.saved_designs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.saved_designs ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.saved_designs ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.saved_designs ADD COLUMN IF NOT EXISTS product_id UUID';
    EXECUTE 'ALTER TABLE public.saved_designs ADD COLUMN IF NOT EXISTS configuration JSONB';
    EXECUTE 'ALTER TABLE public.saved_designs ADD COLUMN IF NOT EXISTS customer_name TEXT';
    EXECUTE 'ALTER TABLE public.saved_designs ADD COLUMN IF NOT EXISTS customer_email TEXT';
    EXECUTE 'ALTER TABLE public.saved_designs ADD COLUMN IF NOT EXISTS customer_phone TEXT';
    EXECUTE 'ALTER TABLE public.saved_designs ADD COLUMN IF NOT EXISTS notes TEXT';
    EXECUTE 'ALTER TABLE public.saved_designs ADD COLUMN IF NOT EXISTS follow_up_status TEXT DEFAULT ''new''';
    EXECUTE 'ALTER TABLE public.saved_designs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.saved_designs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.diamond_form_leads') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.diamond_form_leads ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.diamond_form_leads ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.diamond_form_leads ADD COLUMN IF NOT EXISTS customer_name TEXT';
    EXECUTE 'ALTER TABLE public.diamond_form_leads ADD COLUMN IF NOT EXISTS customer_email TEXT';
    EXECUTE 'ALTER TABLE public.diamond_form_leads ADD COLUMN IF NOT EXISTS customer_phone TEXT';
    EXECUTE 'ALTER TABLE public.diamond_form_leads ADD COLUMN IF NOT EXISTS form_data JSONB DEFAULT ''{}''';
    EXECUTE 'ALTER TABLE public.diamond_form_leads ADD COLUMN IF NOT EXISTS estimated_price NUMERIC';
    EXECUTE 'ALTER TABLE public.diamond_form_leads ADD COLUMN IF NOT EXISTS status TEXT DEFAULT ''new''';
    EXECUTE 'ALTER TABLE public.diamond_form_leads ADD COLUMN IF NOT EXISTS notes TEXT';
    EXECUTE 'ALTER TABLE public.diamond_form_leads ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.diamond_form_leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.design_requests') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS request_type TEXT';
    EXECUTE 'ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS description TEXT';
    EXECUTE 'ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS preferred_style TEXT';
    EXECUTE 'ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS preferred_metal TEXT';
    EXECUTE 'ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS preferred_stone TEXT';
    EXECUTE 'ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS budget_range TEXT';
    EXECUTE 'ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS timeline TEXT';
    EXECUTE 'ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT ''submitted''';
    EXECUTE 'ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT ''normal''';
    EXECUTE 'ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS admin_notes TEXT';
    EXECUTE 'ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS estimated_completion DATE';
    EXECUTE 'ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ';
    EXECUTE 'ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS reference_images TEXT[]';
    EXECUTE 'ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS metal_preference TEXT';
    EXECUTE 'ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS stone_preference TEXT';
    EXECUTE 'ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS size TEXT';
    EXECUTE 'ALTER TABLE public.design_requests ADD COLUMN IF NOT EXISTS special_requirements TEXT';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.design_comparisons') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.design_comparisons ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.design_comparisons ADD COLUMN IF NOT EXISTS user_id UUID';
    EXECUTE 'ALTER TABLE public.design_comparisons ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.design_comparisons ADD COLUMN IF NOT EXISTS configurations JSONB[]';
    EXECUTE 'ALTER TABLE public.design_comparisons ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.analytics_events') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS event_type TEXT';
    EXECUTE 'ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS product_id UUID';
    EXECUTE 'ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS variation_id UUID';
    EXECUTE 'ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT ''{}''';
    EXECUTE 'ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.ai_chat_sessions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.ai_chat_sessions ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.ai_chat_sessions ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.ai_chat_sessions ADD COLUMN IF NOT EXISTS session_id TEXT';
    EXECUTE 'ALTER TABLE public.ai_chat_sessions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.ai_chat_sessions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ';
    EXECUTE 'ALTER TABLE public.ai_chat_sessions ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.ai_chat_sessions ADD COLUMN IF NOT EXISTS configuration_applied BOOLEAN DEFAULT false';
    EXECUTE 'ALTER TABLE public.ai_chat_sessions ADD COLUMN IF NOT EXISTS design_saved BOOLEAN DEFAULT false';
    EXECUTE 'ALTER TABLE public.ai_chat_sessions ADD COLUMN IF NOT EXISTS configuration_data JSONB';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.ai_chat_messages') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.ai_chat_messages ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.ai_chat_messages ADD COLUMN IF NOT EXISTS session_id UUID';
    EXECUTE 'ALTER TABLE public.ai_chat_messages ADD COLUMN IF NOT EXISTS role TEXT';
    EXECUTE 'ALTER TABLE public.ai_chat_messages ADD COLUMN IF NOT EXISTS content TEXT';
    EXECUTE 'ALTER TABLE public.ai_chat_messages ADD COLUMN IF NOT EXISTS intent TEXT';
    EXECUTE 'ALTER TABLE public.ai_chat_messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.ai_training_examples') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.ai_training_examples ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.ai_training_examples ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.ai_training_examples ADD COLUMN IF NOT EXISTS question TEXT';
    EXECUTE 'ALTER TABLE public.ai_training_examples ADD COLUMN IF NOT EXISTS answer TEXT';
    EXECUTE 'ALTER TABLE public.ai_training_examples ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.crm_integrations') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.crm_integrations ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.crm_integrations ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.crm_integrations ADD COLUMN IF NOT EXISTS provider TEXT';
    EXECUTE 'ALTER TABLE public.crm_integrations ADD COLUMN IF NOT EXISTS webhook_url TEXT';
    EXECUTE 'ALTER TABLE public.crm_integrations ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false';
    EXECUTE 'ALTER TABLE public.crm_integrations ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ';
    EXECUTE 'ALTER TABLE public.crm_integrations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.crm_integrations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.crm_integrations ADD COLUMN IF NOT EXISTS api_key_encrypted BYTEA';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.impersonation_sessions') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.impersonation_sessions ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.impersonation_sessions ADD COLUMN IF NOT EXISTS admin_user_id UUID';
    EXECUTE 'ALTER TABLE public.impersonation_sessions ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.impersonation_sessions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.impersonation_sessions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ';
    EXECUTE 'ALTER TABLE public.impersonation_sessions ADD COLUMN IF NOT EXISTS reason TEXT';
    EXECUTE 'ALTER TABLE public.impersonation_sessions ADD COLUMN IF NOT EXISTS actions_performed JSONB DEFAULT ''[]''';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.retention_policies') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.retention_policies ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.retention_policies ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.retention_policies ADD COLUMN IF NOT EXISTS table_name TEXT';
    EXECUTE 'ALTER TABLE public.retention_policies ADD COLUMN IF NOT EXISTS retention_days INTEGER DEFAULT 90';
    EXECUTE 'ALTER TABLE public.retention_policies ADD COLUMN IF NOT EXISTS auto_cleanup BOOLEAN DEFAULT true';
    EXECUTE 'ALTER TABLE public.retention_policies ADD COLUMN IF NOT EXISTS last_cleanup_at TIMESTAMPTZ';
    EXECUTE 'ALTER TABLE public.retention_policies ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.retention_policies ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.data_cleanup_logs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.data_cleanup_logs ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.data_cleanup_logs ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.data_cleanup_logs ADD COLUMN IF NOT EXISTS table_name TEXT';
    EXECUTE 'ALTER TABLE public.data_cleanup_logs ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.data_cleanup_logs ADD COLUMN IF NOT EXISTS records_deleted INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.data_cleanup_logs ADD COLUMN IF NOT EXISTS retention_days INTEGER';
    EXECUTE 'ALTER TABLE public.data_cleanup_logs ADD COLUMN IF NOT EXISTS execution_time_ms INTEGER';
    EXECUTE 'ALTER TABLE public.data_cleanup_logs ADD COLUMN IF NOT EXISTS status TEXT DEFAULT ''completed''';
    EXECUTE 'ALTER TABLE public.data_cleanup_logs ADD COLUMN IF NOT EXISTS error_message TEXT';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.usage_snapshots') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.usage_snapshots ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.usage_snapshots ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.usage_snapshots ADD COLUMN IF NOT EXISTS snapshot_date DATE';
    EXECUTE 'ALTER TABLE public.usage_snapshots ADD COLUMN IF NOT EXISTS storage_size_mb NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.usage_snapshots ADD COLUMN IF NOT EXISTS storage_files_count INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.usage_snapshots ADD COLUMN IF NOT EXISTS database_size_mb NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.usage_snapshots ADD COLUMN IF NOT EXISTS database_rows INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.usage_snapshots ADD COLUMN IF NOT EXISTS bandwidth_mb NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.usage_snapshots ADD COLUMN IF NOT EXISTS function_invocations INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.usage_snapshots ADD COLUMN IF NOT EXISTS ai_tokens_used INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.usage_snapshots ADD COLUMN IF NOT EXISTS analytics_events_count INTEGER DEFAULT 0';
    EXECUTE 'ALTER TABLE public.usage_snapshots ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.ring_configured_by_client') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS session_id TEXT';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS style_id TEXT';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS style_name TEXT';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS style_price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS shank_id TEXT';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS shank_name TEXT';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS shank_price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS visual_color_id TEXT';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS visual_color_name TEXT';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS visual_color_price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS shape_id TEXT';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS shape_name TEXT';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS shape_price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS metal_id TEXT';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS metal_name TEXT';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS metal_price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS carat_value TEXT';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS carat_price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS size TEXT';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS size_price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS engraving_text TEXT';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS engraving_price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS stone_type TEXT';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS stone_name TEXT';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS stone_price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS total_price NUMERIC DEFAULT 0';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS customer_name TEXT';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS customer_email TEXT';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS customer_phone TEXT';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS customer_notes TEXT';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS master_db_id UUID';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS image_url TEXT';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS status TEXT DEFAULT ''configured''';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.ring_configured_by_client ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.system_errors') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.system_errors ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.system_errors ADD COLUMN IF NOT EXISTS error_type TEXT';
    EXECUTE 'ALTER TABLE public.system_errors ADD COLUMN IF NOT EXISTS error_message TEXT';
    EXECUTE 'ALTER TABLE public.system_errors ADD COLUMN IF NOT EXISTS error_stack TEXT';
    EXECUTE 'ALTER TABLE public.system_errors ADD COLUMN IF NOT EXISTS source TEXT';
    EXECUTE 'ALTER TABLE public.system_errors ADD COLUMN IF NOT EXISTS endpoint TEXT';
    EXECUTE 'ALTER TABLE public.system_errors ADD COLUMN IF NOT EXISTS client_id UUID';
    EXECUTE 'ALTER TABLE public.system_errors ADD COLUMN IF NOT EXISTS user_id UUID';
    EXECUTE 'ALTER TABLE public.system_errors ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT ''{}''';
    EXECUTE 'ALTER TABLE public.system_errors ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT ''error''';
    EXECUTE 'ALTER TABLE public.system_errors ADD COLUMN IF NOT EXISTS resolved BOOLEAN DEFAULT false';
    EXECUTE 'ALTER TABLE public.system_errors ADD COLUMN IF NOT EXISTS resolved_by UUID';
    EXECUTE 'ALTER TABLE public.system_errors ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ';
    EXECUTE 'ALTER TABLE public.system_errors ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.system_error_alerts') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.system_error_alerts ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.system_error_alerts ADD COLUMN IF NOT EXISTS name TEXT';
    EXECUTE 'ALTER TABLE public.system_error_alerts ADD COLUMN IF NOT EXISTS error_type_pattern TEXT';
    EXECUTE 'ALTER TABLE public.system_error_alerts ADD COLUMN IF NOT EXISTS threshold INTEGER DEFAULT 5';
    EXECUTE 'ALTER TABLE public.system_error_alerts ADD COLUMN IF NOT EXISTS time_window_minutes INTEGER DEFAULT 60';
    EXECUTE 'ALTER TABLE public.system_error_alerts ADD COLUMN IF NOT EXISTS notification_emails TEXT[]';
    EXECUTE 'ALTER TABLE public.system_error_alerts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true';
    EXECUTE 'ALTER TABLE public.system_error_alerts ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMPTZ';
    EXECUTE 'ALTER TABLE public.system_error_alerts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
    EXECUTE 'ALTER TABLE public.system_error_alerts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;

DO $b$ BEGIN
  IF to_regclass('public.wishlist_items') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.wishlist_items ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid()';
    EXECUTE 'ALTER TABLE public.wishlist_items ADD COLUMN IF NOT EXISTS user_id UUID';
    EXECUTE 'ALTER TABLE public.wishlist_items ADD COLUMN IF NOT EXISTS product_id UUID';
    EXECUTE 'ALTER TABLE public.wishlist_items ADD COLUMN IF NOT EXISTS configuration JSONB';
    EXECUTE 'ALTER TABLE public.wishlist_items ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now()';
  END IF;
END $b$;
