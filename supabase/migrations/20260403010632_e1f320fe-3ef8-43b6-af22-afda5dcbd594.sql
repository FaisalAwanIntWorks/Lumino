
-- 1. client_metal_buying_config
CREATE TABLE public.client_metal_buying_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  submission_mode text NOT NULL DEFAULT 'contact',
  deposit_amount numeric DEFAULT 0,
  metals_config jsonb NOT NULL DEFAULT '{
    "gold": {
      "enabled": true,
      "karats": {
        "24K": { "buy_pct": 75, "competitor_pct": 50 },
        "22K": { "buy_pct": 70, "competitor_pct": 45 },
        "18K": { "buy_pct": 65, "competitor_pct": 40 },
        "14K": { "buy_pct": 60, "competitor_pct": 35 },
        "10K": { "buy_pct": 55, "competitor_pct": 30 }
      }
    },
    "silver": {
      "enabled": true,
      "karats": {
        "999": { "buy_pct": 85, "competitor_pct": 60 },
        "925": { "buy_pct": 75, "competitor_pct": 50 }
      }
    },
    "platinum": {
      "enabled": true,
      "karats": {
        "950": { "buy_pct": 80, "competitor_pct": 55 },
        "900": { "buy_pct": 75, "competitor_pct": 50 }
      }
    }
  }'::jsonb,
  refinery_sell_pct numeric NOT NULL DEFAULT 99,
  dont_know_enabled boolean NOT NULL DEFAULT true,
  step_order text[] DEFAULT ARRAY['metal','karat','weight','authenticity','photo','questions','estimate','contact'],
  step_labels jsonb DEFAULT '{}'::jsonb,
  required_contact_fields jsonb NOT NULL DEFAULT '{"name": true, "email": true, "phone": true}'::jsonb,
  form_colors jsonb DEFAULT '{}'::jsonb,
  onboarding_completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);

ALTER TABLE public.client_metal_buying_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owners can manage their metal buying config"
  ON public.client_metal_buying_config FOR ALL
  USING (client_id = public.get_user_client_id(auth.uid()))
  WITH CHECK (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Agency admins can manage all metal buying configs"
  ON public.client_metal_buying_config FOR ALL
  USING (public.has_role(auth.uid(), 'agency_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Staff can view their client metal buying config"
  ON public.client_metal_buying_config FOR SELECT
  USING (public.is_staff_of_client(auth.uid(), client_id));

CREATE POLICY "Public can read metal buying config for embed"
  ON public.client_metal_buying_config FOR SELECT
  USING (true);

CREATE TRIGGER update_client_metal_buying_config_updated_at
  BEFORE UPDATE ON public.client_metal_buying_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. client_metal_buying_questions
CREATE TABLE public.client_metal_buying_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  question_key text NOT NULL,
  question_type text NOT NULL DEFAULT 'text',
  options jsonb DEFAULT NULL,
  option_images jsonb DEFAULT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  is_required boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  has_text_followup boolean NOT NULL DEFAULT false,
  has_file_followup boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_metal_buying_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owners can manage their metal buying questions"
  ON public.client_metal_buying_questions FOR ALL
  USING (client_id = public.get_user_client_id(auth.uid()))
  WITH CHECK (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Agency admins can manage all metal buying questions"
  ON public.client_metal_buying_questions FOR ALL
  USING (public.has_role(auth.uid(), 'agency_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Staff can view their client metal buying questions"
  ON public.client_metal_buying_questions FOR SELECT
  USING (public.is_staff_of_client(auth.uid(), client_id));

CREATE POLICY "Public can read metal buying questions for embed"
  ON public.client_metal_buying_questions FOR SELECT
  USING (true);

CREATE TRIGGER update_client_metal_buying_questions_updated_at
  BEFORE UPDATE ON public.client_metal_buying_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. metal_buying_leads
CREATE TABLE public.metal_buying_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  customer_name text,
  customer_email text,
  customer_phone text,
  country_code text DEFAULT '+1',
  metal_type text NOT NULL,
  karat text,
  weight_grams numeric,
  condition text,
  is_authentic boolean,
  knows_karat boolean NOT NULL DEFAULT true,
  knows_weight boolean NOT NULL DEFAULT true,
  knows_authentic boolean NOT NULL DEFAULT true,
  spot_price_at_time numeric,
  buy_percentage numeric,
  estimated_offer numeric,
  competitor_offer numeric,
  estimated_profit numeric,
  photo_urls text[] DEFAULT '{}',
  custom_answers jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new',
  lead_score text NOT NULL DEFAULT 'warm',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.metal_buying_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert metal buying leads"
  ON public.metal_buying_leads FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Client owners can view their metal buying leads"
  ON public.metal_buying_leads FOR SELECT
  USING (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Client owners can update their metal buying leads"
  ON public.metal_buying_leads FOR UPDATE
  USING (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Client owners can delete their metal buying leads"
  ON public.metal_buying_leads FOR DELETE
  USING (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Agency admins can manage all metal buying leads"
  ON public.metal_buying_leads FOR ALL
  USING (public.has_role(auth.uid(), 'agency_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Staff can view their client metal buying leads"
  ON public.metal_buying_leads FOR SELECT
  USING (public.is_staff_of_client(auth.uid(), client_id));

CREATE POLICY "Staff can update their client metal buying leads"
  ON public.metal_buying_leads FOR UPDATE
  USING (public.is_staff_of_client(auth.uid(), client_id));

-- Enable realtime for leads
ALTER PUBLICATION supabase_realtime ADD TABLE public.metal_buying_leads;

-- Notification trigger on new leads
CREATE TRIGGER notify_new_metal_buying_lead
  AFTER INSERT ON public.metal_buying_leads
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_lead();

-- 4. Storage bucket for photo uploads
INSERT INTO storage.buckets (id, name, public) VALUES ('metal-buying-assets', 'metal-buying-assets', true);

CREATE POLICY "Anyone can upload metal buying photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'metal-buying-assets');

CREATE POLICY "Anyone can view metal buying photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'metal-buying-assets');
