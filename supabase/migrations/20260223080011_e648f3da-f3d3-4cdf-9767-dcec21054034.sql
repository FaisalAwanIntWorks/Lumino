
-- Create diamond_catalog_config table to store the wizard configuration
CREATE TABLE public.diamond_catalog_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT false,
  product_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT diamond_catalog_config_client_id_unique UNIQUE (client_id)
);

-- Enable RLS
ALTER TABLE public.diamond_catalog_config ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Agency admins can manage all diamond configs"
  ON public.diamond_catalog_config FOR ALL
  USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Client owners can manage their diamond config"
  ON public.diamond_catalog_config FOR ALL
  USING (
    client_id = public.get_user_client_id(auth.uid())
  );

CREATE POLICY "Staff with catalog access can view diamond config"
  ON public.diamond_catalog_config FOR SELECT
  USING (
    public.is_staff_of_client(auth.uid(), client_id)
  );

-- Trigger for updated_at
CREATE TRIGGER update_diamond_catalog_config_updated_at
  BEFORE UPDATE ON public.diamond_catalog_config
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Add new columns to client_diamond_presets
ALTER TABLE public.client_diamond_presets
  ADD COLUMN IF NOT EXISTS cut_grade TEXT,
  ADD COLUMN IF NOT EXISTS polish TEXT,
  ADD COLUMN IF NOT EXISTS symmetry TEXT,
  ADD COLUMN IF NOT EXISTS fluorescence TEXT,
  ADD COLUMN IF NOT EXISTS certification TEXT,
  ADD COLUMN IF NOT EXISTS origin TEXT,
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS product_title TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS markup_percentage NUMERIC,
  ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC;
