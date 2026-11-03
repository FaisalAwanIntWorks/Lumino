
CREATE TABLE IF NOT EXISTS public.client_availability_schedule (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'UTC',
  slot_duration_minutes integer NOT NULL DEFAULT 30 CHECK (slot_duration_minutes IN (15,20,30,45,60,90,120)),
  weekly_hours jsonb NOT NULL DEFAULT '{
    "monday":   {"enabled":true,"intervals":[{"start":"09:00","end":"17:00"}]},
    "tuesday":  {"enabled":true,"intervals":[{"start":"09:00","end":"17:00"}]},
    "wednesday":{"enabled":true,"intervals":[{"start":"09:00","end":"17:00"}]},
    "thursday": {"enabled":true,"intervals":[{"start":"09:00","end":"17:00"}]},
    "friday":   {"enabled":true,"intervals":[{"start":"09:00","end":"17:00"}]},
    "saturday": {"enabled":false,"intervals":[]},
    "sunday":   {"enabled":false,"intervals":[]}
  }'::jsonb,
  date_overrides jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
-- [bridge] ensure columns
ALTER TABLE public.client_availability_schedule
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS slot_duration_minutes integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS weekly_hours jsonb DEFAULT '{ "monday": {"enabled":true,"intervals":[{"start":"09:00","end":"17:00"}]}, "tuesday": {"enabled":true,"intervals":[{"start":"09:00","end":"17:00"}]}, "wednesday":{"enabled":true,"intervals":[{"start":"09:00","end":"17:00"}]}, "thursday": {"enabled":true,"intervals":[{"start":"09:00","end":"17:00"}]}, "friday": {"enabled":true,"intervals":[{"start":"09:00","end":"17:00"}]}, "saturday": {"enabled":false,"intervals":[]}, "sunday": {"enabled":false,"intervals":[]} }'::jsonb,
  ADD COLUMN IF NOT EXISTS date_overrides jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();


GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_availability_schedule TO authenticated;
GRANT ALL ON public.client_availability_schedule TO service_role;

ALTER TABLE public.client_availability_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Client owners manage own availability" ON public.client_availability_schedule;

CREATE POLICY "Client owners manage own availability"
  ON public.client_availability_schedule
  FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_availability_schedule.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = client_availability_schedule.client_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS "Agency admins manage all availability" ON public.client_availability_schedule;

CREATE POLICY "Agency admins manage all availability"
  ON public.client_availability_schedule
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin'::public.app_role));

DROP POLICY IF EXISTS "Staff manage assigned client availability" ON public.client_availability_schedule;

CREATE POLICY "Staff manage assigned client availability"
  ON public.client_availability_schedule
  FOR ALL
  TO authenticated
  USING (public.is_staff_of_client(auth.uid(), client_availability_schedule.client_id))
  WITH CHECK (public.is_staff_of_client(auth.uid(), client_availability_schedule.client_id));

CREATE OR REPLACE FUNCTION public.touch_client_availability_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_client_availability_updated_at ON public.client_availability_schedule;
CREATE TRIGGER trg_client_availability_updated_at
  BEFORE UPDATE ON public.client_availability_schedule
  FOR EACH ROW EXECUTE FUNCTION public.touch_client_availability_updated_at();

CREATE OR REPLACE FUNCTION public.get_client_availability(client_uuid uuid)
RETURNS TABLE (
  timezone text,
  slot_duration_minutes integer,
  weekly_hours jsonb,
  date_overrides jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT timezone, slot_duration_minutes, weekly_hours, date_overrides
  FROM public.client_availability_schedule
  WHERE client_id = client_uuid
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_availability(uuid) TO anon, authenticated;
