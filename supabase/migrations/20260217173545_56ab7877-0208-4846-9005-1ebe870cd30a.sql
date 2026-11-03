
-- Grill Builder: per-client configuration
CREATE TABLE public.client_grill_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  enabled_metals JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- each entry: { "value": "gold", "label": "Gold", "purities": ["10k","14k","18k"] }
  top_teeth_options TEXT[] NOT NULL DEFAULT ARRAY['none','1','2','3','4','6','8','10'],
  bottom_teeth_options TEXT[] NOT NULL DEFAULT ARRAY['none','1','2','3','4','6','8','10'],
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_grill_config_client_unique UNIQUE (client_id)
);

-- Grill Builder: per-client questions (default + custom)
CREATE TABLE public.client_grill_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_key TEXT NOT NULL, -- e.g. 'engraving', 'iced_out', 'custom_1'
  question_type TEXT NOT NULL DEFAULT 'yes_no', -- 'yes_no', 'text', 'file'
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,
  has_text_followup BOOLEAN NOT NULL DEFAULT false, -- show text input when yes
  has_file_followup BOOLEAN NOT NULL DEFAULT false, -- show file input when yes
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_grill_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_grill_questions ENABLE ROW LEVEL SECURITY;

-- RLS: clients can view/manage their own config
CREATE POLICY "Clients can view own grill config"
  ON public.client_grill_config FOR SELECT
  USING (client_id = public.get_user_client_id(auth.uid()) OR public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Clients can insert own grill config"
  ON public.client_grill_config FOR INSERT
  WITH CHECK (client_id = public.get_user_client_id(auth.uid()) OR public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Clients can update own grill config"
  ON public.client_grill_config FOR UPDATE
  USING (client_id = public.get_user_client_id(auth.uid()) OR public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Clients can delete own grill config"
  ON public.client_grill_config FOR DELETE
  USING (client_id = public.get_user_client_id(auth.uid()) OR public.has_role(auth.uid(), 'agency_admin'));

-- RLS for questions
CREATE POLICY "Clients can view own grill questions"
  ON public.client_grill_questions FOR SELECT
  USING (client_id = public.get_user_client_id(auth.uid()) OR public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Clients can insert own grill questions"
  ON public.client_grill_questions FOR INSERT
  WITH CHECK (client_id = public.get_user_client_id(auth.uid()) OR public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Clients can update own grill questions"
  ON public.client_grill_questions FOR UPDATE
  USING (client_id = public.get_user_client_id(auth.uid()) OR public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Clients can delete own grill questions"
  ON public.client_grill_questions FOR DELETE
  USING (client_id = public.get_user_client_id(auth.uid()) OR public.has_role(auth.uid(), 'agency_admin'));

-- Public read for embed widget (anonymous users viewing the form)
CREATE POLICY "Public can read grill config for embed"
  ON public.client_grill_config FOR SELECT
  USING (true);

CREATE POLICY "Public can read grill questions for embed"
  ON public.client_grill_questions FOR SELECT
  USING (true);

-- Updated_at triggers
CREATE TRIGGER update_client_grill_config_updated_at
  BEFORE UPDATE ON public.client_grill_config
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER update_client_grill_questions_updated_at
  BEFORE UPDATE ON public.client_grill_questions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
