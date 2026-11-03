-- Create client_diamond_presets table for storing diamond pricing configurations
CREATE TABLE public.client_diamond_presets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  stone_type TEXT NOT NULL CHECK (stone_type IN ('natural', 'lab')),
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
  shopify_sync_status TEXT DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX idx_client_diamond_presets_client_id ON public.client_diamond_presets(client_id);
CREATE INDEX idx_client_diamond_presets_shape ON public.client_diamond_presets(client_id, shape_id);
CREATE INDEX idx_client_diamond_presets_stone_type ON public.client_diamond_presets(client_id, stone_type);

-- Enable RLS
ALTER TABLE public.client_diamond_presets ENABLE ROW LEVEL SECURITY;

-- RLS Policies for client_diamond_presets
CREATE POLICY "Clients can view their own diamond presets"
  ON public.client_diamond_presets
  FOR SELECT
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

CREATE POLICY "Clients can insert their own diamond presets"
  ON public.client_diamond_presets
  FOR INSERT
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

CREATE POLICY "Clients can update their own diamond presets"
  ON public.client_diamond_presets
  FOR UPDATE
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

CREATE POLICY "Clients can delete their own diamond presets"
  ON public.client_diamond_presets
  FOR DELETE
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

CREATE POLICY "Admin staff can manage all diamond presets"
  ON public.client_diamond_presets
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.admin_staff_members
    WHERE user_id = auth.uid() AND status = 'active'
  ));

CREATE POLICY "Agency admins can manage all diamond presets"
  ON public.client_diamond_presets
  FOR ALL
  USING (has_role(auth.uid(), 'agency_admin'::app_role));

CREATE POLICY "Staff with catalog access can view diamond presets"
  ON public.client_diamond_presets
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
    AND sm.client_id = client_diamond_presets.client_id
    AND ((sm.permissions->>'catalog_access') IS NOT NULL 
    AND lower(sm.permissions->>'catalog_access') = ANY(ARRAY['true', 'view', 'edit']))
  ));

-- Add selected_diamond_types column to client_onboarding_preferences
ALTER TABLE public.client_onboarding_preferences 
ADD COLUMN IF NOT EXISTS selected_diamond_types TEXT[] DEFAULT '{}'::TEXT[];

-- Create trigger for updated_at
CREATE TRIGGER update_client_diamond_presets_updated_at
  BEFORE UPDATE ON public.client_diamond_presets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();