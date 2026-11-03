
-- Create grill_form_leads table to store grillz builder submissions
CREATE TABLE public.grill_form_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  metal_type TEXT NOT NULL,
  metal_purity TEXT,
  top_teeth TEXT,
  bottom_teeth TEXT,
  question_answers JSONB DEFAULT '{}'::jsonb,
  additional_notes TEXT,
  customer_name TEXT,
  customer_email TEXT,
  customer_phone TEXT,
  logo_file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.grill_form_leads ENABLE ROW LEVEL SECURITY;

-- Public insert policy (anyone can submit via embed)
CREATE POLICY "Anyone can insert grill form leads"
  ON public.grill_form_leads
  FOR INSERT
  WITH CHECK (true);

-- Clients can view their own leads
CREATE POLICY "Clients can view their own grill leads"
  ON public.grill_form_leads
  FOR SELECT
  USING (
    client_id = public.get_user_client_id(auth.uid())
    OR public.has_role(auth.uid(), 'agency_admin')
    OR public.is_staff_of_client(auth.uid(), client_id)
  );

-- Clients can delete their own leads
CREATE POLICY "Clients can delete their own grill leads"
  ON public.grill_form_leads
  FOR DELETE
  USING (
    client_id = public.get_user_client_id(auth.uid())
    OR public.has_role(auth.uid(), 'agency_admin')
  );

-- Trigger for updated_at
CREATE TRIGGER update_grill_form_leads_updated_at
  BEFORE UPDATE ON public.grill_form_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
