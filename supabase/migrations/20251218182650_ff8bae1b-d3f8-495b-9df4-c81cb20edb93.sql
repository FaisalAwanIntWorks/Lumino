-- Create client_metal_variants table for dynamic metal configuration
CREATE TABLE public.client_metal_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  color_family TEXT NOT NULL CHECK (color_family IN ('yellow', 'rose', 'white')),
  variant_name TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_id, variant_name)
);

-- Enable RLS
ALTER TABLE public.client_metal_variants ENABLE ROW LEVEL SECURITY;

-- Clients can view their own metal variants
CREATE POLICY "Clients can view their own metal variants"
ON public.client_metal_variants
FOR SELECT
USING (client_id = get_user_client_id(auth.uid()));

-- Clients can manage their own metal variants
CREATE POLICY "Clients can manage their own metal variants"
ON public.client_metal_variants
FOR ALL
USING (client_id = get_user_client_id(auth.uid()));

-- Admins can view all metal variants
CREATE POLICY "Admins can view all metal variants"
ON public.client_metal_variants
FOR SELECT
USING (has_role(auth.uid(), 'agency_admin'::app_role));

-- Admins can manage all metal variants
CREATE POLICY "Admins can manage all metal variants"
ON public.client_metal_variants
FOR ALL
USING (has_role(auth.uid(), 'agency_admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_client_metal_variants_updated_at
BEFORE UPDATE ON public.client_metal_variants
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();