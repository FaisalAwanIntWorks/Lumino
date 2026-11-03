
-- Create client_ring_form_questions table
CREATE TABLE public.client_ring_form_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_key TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'yes_no',
  options JSONB DEFAULT NULL,
  option_images JSONB DEFAULT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  is_required BOOLEAN NOT NULL DEFAULT false,
  has_text_followup BOOLEAN NOT NULL DEFAULT false,
  has_file_followup BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.client_ring_form_questions ENABLE ROW LEVEL SECURITY;

-- Public read for embeds
CREATE POLICY "Allow public read ring form questions"
  ON public.client_ring_form_questions
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Authenticated users can insert/update/delete their own client's questions
CREATE POLICY "Clients manage own ring form questions"
  ON public.client_ring_form_questions
  FOR ALL
  TO authenticated
  USING (client_id = public.get_user_client_id(auth.uid()) OR public.has_role(auth.uid(), 'agency_admin'))
  WITH CHECK (client_id = public.get_user_client_id(auth.uid()) OR public.has_role(auth.uid(), 'agency_admin'));

-- Updated_at trigger
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.client_ring_form_questions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
