
-- Create client_ring_form_config table (mirrors client_grill_config pattern)
CREATE TABLE public.client_ring_form_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  onboarding_completed boolean NOT NULL DEFAULT false,
  submission_mode text NOT NULL DEFAULT 'contact',
  deposit_amount numeric NULL,
  form_colors jsonb NULL,
  budget_options jsonb NULL,
  enabled_steps jsonb NOT NULL DEFAULT '{
    "nature": true,
    "shape": true,
    "size": true,
    "quality": true,
    "setting": true,
    "holder": true,
    "band": true,
    "band_width": true,
    "metal": true,
    "personalization": true,
    "inspiration": true,
    "timeline": true,
    "budget": true
  }'::jsonb,
  step_options jsonb NULL,
  shopify_product_id text NULL,
  shopify_variant_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_ring_form_config ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Clients can view their own ring form config"
  ON public.client_ring_form_config FOR SELECT
  TO authenticated
  USING (
    client_id = public.get_user_client_id(auth.uid())
    OR public.has_role(auth.uid(), 'agency_admin')
  );

CREATE POLICY "Clients can insert their own ring form config"
  ON public.client_ring_form_config FOR INSERT
  TO authenticated
  WITH CHECK (
    client_id = public.get_user_client_id(auth.uid())
    OR public.has_role(auth.uid(), 'agency_admin')
  );

CREATE POLICY "Clients can update their own ring form config"
  ON public.client_ring_form_config FOR UPDATE
  TO authenticated
  USING (
    client_id = public.get_user_client_id(auth.uid())
    OR public.has_role(auth.uid(), 'agency_admin')
  );

-- Allow staff members to manage ring form config
CREATE POLICY "Staff can manage ring form config"
  ON public.client_ring_form_config FOR ALL
  TO authenticated
  USING (
    public.is_staff_of_client(auth.uid(), client_id)
  );

-- Auto-update updated_at
CREATE TRIGGER update_client_ring_form_config_updated_at
  BEFORE UPDATE ON public.client_ring_form_config
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Also allow public read for the embed widget (unauthenticated users viewing the form)
CREATE POLICY "Public can read ring form config"
  ON public.client_ring_form_config FOR SELECT
  TO anon
  USING (true);
