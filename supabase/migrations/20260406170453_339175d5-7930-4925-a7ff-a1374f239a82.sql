
-- ============================================================
-- 1. Staff write policies for client_custom_enquiry_config
-- ============================================================

-- Helper function to check staff custom_x edit permission
CREATE OR REPLACE FUNCTION public.staff_has_custom_x_edit(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_members
    WHERE user_id = _user_id
      AND client_id = _client_id
      AND status = 'active'
      AND (permissions->>'custom_x_access') = 'edit'
  )
$$;

-- Custom Enquiry Config: staff INSERT
CREATE POLICY "Staff can insert custom enquiry config"
ON public.client_custom_enquiry_config
FOR INSERT TO authenticated
WITH CHECK (
  public.staff_has_custom_x_edit(auth.uid(), client_id)
);

-- Custom Enquiry Config: staff UPDATE
CREATE POLICY "Staff can update custom enquiry config"
ON public.client_custom_enquiry_config
FOR UPDATE TO authenticated
USING (public.staff_has_custom_x_edit(auth.uid(), client_id))
WITH CHECK (public.staff_has_custom_x_edit(auth.uid(), client_id));

-- Custom Enquiry Config: staff DELETE
CREATE POLICY "Staff can delete custom enquiry config"
ON public.client_custom_enquiry_config
FOR DELETE TO authenticated
USING (public.staff_has_custom_x_edit(auth.uid(), client_id));

-- ============================================================
-- 2. Staff write policies for client_custom_enquiry_questions
-- ============================================================

CREATE POLICY "Staff can insert custom enquiry questions"
ON public.client_custom_enquiry_questions
FOR INSERT TO authenticated
WITH CHECK (
  public.staff_has_custom_x_edit(auth.uid(), client_id)
);

CREATE POLICY "Staff can update custom enquiry questions"
ON public.client_custom_enquiry_questions
FOR UPDATE TO authenticated
USING (public.staff_has_custom_x_edit(auth.uid(), client_id))
WITH CHECK (public.staff_has_custom_x_edit(auth.uid(), client_id));

CREATE POLICY "Staff can delete custom enquiry questions"
ON public.client_custom_enquiry_questions
FOR DELETE TO authenticated
USING (public.staff_has_custom_x_edit(auth.uid(), client_id));

-- ============================================================
-- 3. Staff write policies for client_grill_config
-- ============================================================

CREATE POLICY "Staff can view own client grill config"
ON public.client_grill_config
FOR SELECT TO authenticated
USING (public.is_staff_of_client(auth.uid(), client_id));

CREATE POLICY "Staff can insert grill config"
ON public.client_grill_config
FOR INSERT TO authenticated
WITH CHECK (public.staff_has_custom_x_edit(auth.uid(), client_id));

CREATE POLICY "Staff can update grill config"
ON public.client_grill_config
FOR UPDATE TO authenticated
USING (public.staff_has_custom_x_edit(auth.uid(), client_id))
WITH CHECK (public.staff_has_custom_x_edit(auth.uid(), client_id));

CREATE POLICY "Staff can delete grill config"
ON public.client_grill_config
FOR DELETE TO authenticated
USING (public.staff_has_custom_x_edit(auth.uid(), client_id));

-- ============================================================
-- 4. Staff write policies for client_grill_questions
-- ============================================================

CREATE POLICY "Staff can view own client grill questions"
ON public.client_grill_questions
FOR SELECT TO authenticated
USING (public.is_staff_of_client(auth.uid(), client_id));

CREATE POLICY "Staff can insert grill questions"
ON public.client_grill_questions
FOR INSERT TO authenticated
WITH CHECK (public.staff_has_custom_x_edit(auth.uid(), client_id));

CREATE POLICY "Staff can update grill questions"
ON public.client_grill_questions
FOR UPDATE TO authenticated
USING (public.staff_has_custom_x_edit(auth.uid(), client_id))
WITH CHECK (public.staff_has_custom_x_edit(auth.uid(), client_id));

CREATE POLICY "Staff can delete grill questions"
ON public.client_grill_questions
FOR DELETE TO authenticated
USING (public.staff_has_custom_x_edit(auth.uid(), client_id));

-- ============================================================
-- 5. Recreate client_diamond_step_overrides table
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_diamond_step_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  step_type TEXT NOT NULL,
  option_id UUID NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  custom_price NUMERIC DEFAULT NULL,
  custom_image_url TEXT DEFAULT NULL,
  display_order INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, step_type, option_id)
);

ALTER TABLE public.client_diamond_step_overrides ENABLE ROW LEVEL SECURITY;

-- Indexes
CREATE INDEX idx_diamond_step_overrides_client ON public.client_diamond_step_overrides (client_id, step_type);

-- RLS Policies
CREATE POLICY "Admins can manage all overrides"
ON public.client_diamond_step_overrides
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'agency_admin'))
WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Clients can manage own overrides"
ON public.client_diamond_step_overrides
FOR ALL TO authenticated
USING (client_id = public.get_user_client_id(auth.uid()))
WITH CHECK (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Staff can manage own client overrides"
ON public.client_diamond_step_overrides
FOR ALL TO authenticated
USING (public.is_staff_of_client(auth.uid(), client_id))
WITH CHECK (public.is_staff_of_client(auth.uid(), client_id));

CREATE POLICY "Public can read overrides for widget"
ON public.client_diamond_step_overrides
FOR SELECT TO anon
USING (true);

-- Updated_at trigger
CREATE TRIGGER update_diamond_step_overrides_updated_at
BEFORE UPDATE ON public.client_diamond_step_overrides
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
