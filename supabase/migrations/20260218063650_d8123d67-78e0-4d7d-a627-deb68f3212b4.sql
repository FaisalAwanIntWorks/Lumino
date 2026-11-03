
-- Custom Enquiry Config (mirrors client_grill_config)
CREATE TABLE public.client_custom_enquiry_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  jewelry_types TEXT[] DEFAULT '{}',
  budget_options TEXT[] DEFAULT '{}',
  gold_colors JSONB DEFAULT '[]',
  karat_options TEXT[] DEFAULT '{}',
  diamond_qualities TEXT[] DEFAULT '{}',
  diamond_setup_options TEXT[] DEFAULT '{}',
  back_options TEXT[] DEFAULT '{}',
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_custom_enquiry_config_client_id_key UNIQUE (client_id)
);

ALTER TABLE public.client_custom_enquiry_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage custom enquiry config"
  ON public.client_custom_enquiry_config FOR ALL
  USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Clients can manage own custom enquiry config"
  ON public.client_custom_enquiry_config FOR ALL
  USING (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Staff can read own client custom enquiry config"
  ON public.client_custom_enquiry_config FOR SELECT
  USING (public.is_staff_of_client(auth.uid(), client_id));

CREATE POLICY "Public can read custom enquiry config"
  ON public.client_custom_enquiry_config FOR SELECT
  USING (true);

CREATE TRIGGER update_client_custom_enquiry_config_updated_at
  BEFORE UPDATE ON public.client_custom_enquiry_config
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Custom Enquiry Questions (mirrors client_grill_questions)
CREATE TABLE public.client_custom_enquiry_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_key TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'yes_no',
  is_default BOOLEAN DEFAULT true,
  is_enabled BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  has_text_followup BOOLEAN DEFAULT false,
  has_file_followup BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.client_custom_enquiry_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage custom enquiry questions"
  ON public.client_custom_enquiry_questions FOR ALL
  USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Clients can manage own custom enquiry questions"
  ON public.client_custom_enquiry_questions FOR ALL
  USING (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Staff can read own client custom enquiry questions"
  ON public.client_custom_enquiry_questions FOR SELECT
  USING (public.is_staff_of_client(auth.uid(), client_id));

CREATE POLICY "Public can read custom enquiry questions"
  ON public.client_custom_enquiry_questions FOR SELECT
  USING (true);

CREATE TRIGGER update_client_custom_enquiry_questions_updated_at
  BEFORE UPDATE ON public.client_custom_enquiry_questions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Custom Enquiry Leads (mirrors grill_form_leads)
CREATE TABLE public.custom_enquiry_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  jewelry_type TEXT,
  budget TEXT,
  gold_color TEXT,
  karat TEXT,
  diamond_quality TEXT,
  diamond_setup TEXT,
  back_option TEXT,
  desired_size TEXT,
  description TEXT,
  question_answers JSONB DEFAULT '{}',
  additional_notes TEXT,
  inspiration_image_url TEXT,
  customer_name TEXT DEFAULT 'Custom Enquiry Customer',
  customer_email TEXT DEFAULT '',
  customer_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_enquiry_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage custom enquiry leads"
  ON public.custom_enquiry_leads FOR ALL
  USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Clients can read own custom enquiry leads"
  ON public.custom_enquiry_leads FOR SELECT
  USING (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Staff can read own client custom enquiry leads"
  ON public.custom_enquiry_leads FOR SELECT
  USING (public.is_staff_of_client(auth.uid(), client_id));

CREATE POLICY "Anyone can insert custom enquiry leads"
  ON public.custom_enquiry_leads FOR INSERT
  WITH CHECK (true);

CREATE TRIGGER update_custom_enquiry_leads_updated_at
  BEFORE UPDATE ON public.custom_enquiry_leads
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
