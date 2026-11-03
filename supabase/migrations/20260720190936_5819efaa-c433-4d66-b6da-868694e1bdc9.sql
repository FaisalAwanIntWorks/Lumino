
CREATE TABLE IF NOT EXISTS public.client_dtt_form_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  form_colors JSONB,
  enabled_steps JSONB,
  step_order JSONB,
  submission_mode TEXT NOT NULL DEFAULT 'contact' CHECK (submission_mode IN ('deposit','contact')),
  deposit_amount NUMERIC,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- [bridge] ensure columns
ALTER TABLE public.client_dtt_form_config
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS client_id UUID,
  ADD COLUMN IF NOT EXISTS form_colors JSONB,
  ADD COLUMN IF NOT EXISTS enabled_steps JSONB,
  ADD COLUMN IF NOT EXISTS step_order JSONB,
  ADD COLUMN IF NOT EXISTS submission_mode TEXT DEFAULT 'contact',
  ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS client_dtt_form_config_client_id_bridge_uniq ON public.client_dtt_form_config (client_id);


GRANT SELECT ON public.client_dtt_form_config TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_dtt_form_config TO authenticated;
GRANT ALL ON public.client_dtt_form_config TO service_role;

ALTER TABLE public.client_dtt_form_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read dtt form config" ON public.client_dtt_form_config;

CREATE POLICY "Public read dtt form config"
  ON public.client_dtt_form_config FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Owners manage dtt form config" ON public.client_dtt_form_config;

CREATE POLICY "Owners manage dtt form config"
  ON public.client_dtt_form_config FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'agency_admin'::app_role)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_id AND c.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'agency_admin'::app_role)
  );

DROP TRIGGER IF EXISTS trg_client_dtt_form_config_updated ON public.client_dtt_form_config;

CREATE TRIGGER trg_client_dtt_form_config_updated
BEFORE UPDATE ON public.client_dtt_form_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
