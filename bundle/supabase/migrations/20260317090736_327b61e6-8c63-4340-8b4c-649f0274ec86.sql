
CREATE TABLE public.client_ai_quotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL UNIQUE,
  chat_quota integer NOT NULL DEFAULT 2000,
  image_quota integer NOT NULL DEFAULT 100,
  is_custom boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_ai_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can read all quotas"
  ON public.client_ai_quotas FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Admin can insert quotas"
  ON public.client_ai_quotas FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Admin can update quotas"
  ON public.client_ai_quotas FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Admin can delete quotas"
  ON public.client_ai_quotas FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE TRIGGER handle_client_ai_quotas_updated_at
  BEFORE UPDATE ON public.client_ai_quotas
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
