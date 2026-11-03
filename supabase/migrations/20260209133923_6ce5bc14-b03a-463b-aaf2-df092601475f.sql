
-- Table to store all Diamond Form submissions as leads
CREATE TABLE public.diamond_form_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  
  -- Contact info
  first_name TEXT NOT NULL,
  email TEXT NOT NULL,
  country_code TEXT,
  phone_number TEXT,
  sms_consent BOOLEAN DEFAULT false,
  marketing_consent BOOLEAN DEFAULT false,
  
  -- Diamond configuration
  diamond_type TEXT,
  diamond_shape TEXT,
  diamond_size TEXT,
  diamond_quality TEXT,
  diamond_setting TEXT,
  diamond_holder TEXT,
  diamond_band TEXT,
  diamond_band_width TEXT[],
  diamond_metal TEXT,
  diamond_personalization TEXT[],
  ring_size TEXT,
  other_details TEXT,
  diamond_timeline TEXT,
  
  -- Estimate
  estimated_total NUMERIC DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.diamond_form_leads ENABLE ROW LEVEL SECURITY;

-- Allow anonymous INSERT (public embed form, no auth required)
CREATE POLICY "Anyone can submit diamond form leads"
  ON public.diamond_form_leads FOR INSERT
  WITH CHECK (true);

-- Client owner can view their leads
CREATE POLICY "Client owners can view their diamond form leads"
  ON public.diamond_form_leads FOR SELECT
  TO authenticated
  USING (
    client_id = public.get_user_client_id(auth.uid())
    OR public.has_role(auth.uid(), 'agency_admin')
    OR public.is_staff_of_client(auth.uid(), client_id)
  );

-- Client owners and admins can delete
CREATE POLICY "Client owners can delete their diamond form leads"
  ON public.diamond_form_leads FOR DELETE
  TO authenticated
  USING (
    client_id = public.get_user_client_id(auth.uid())
    OR public.has_role(auth.uid(), 'agency_admin')
  );

-- Trigger for updated_at
CREATE TRIGGER update_diamond_form_leads_updated_at
  BEFORE UPDATE ON public.diamond_form_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.diamond_form_leads;
