
-- 1. Helper: staff_has_catalog_edit
CREATE OR REPLACE FUNCTION public.staff_has_catalog_edit(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_members
    WHERE user_id = _user_id
      AND client_id = _client_id
      AND status = 'active'
      AND (permissions->>'catalog_access') = 'edit'
  )
$$;

-- 2. Helper: staff_has_metal_buying_edit
CREATE OR REPLACE FUNCTION public.staff_has_metal_buying_edit(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_members
    WHERE user_id = _user_id
      AND client_id = _client_id
      AND status = 'active'
      AND (permissions->>'metal_buying_access') = 'edit'
  )
$$;

-- 3. Staff write policies on client_ring_form_questions
CREATE POLICY "Staff with catalog edit can insert ring form questions"
ON public.client_ring_form_questions FOR INSERT
TO authenticated
WITH CHECK (public.staff_has_catalog_edit(auth.uid(), client_id));

CREATE POLICY "Staff with catalog edit can update ring form questions"
ON public.client_ring_form_questions FOR UPDATE
TO authenticated
USING (public.staff_has_catalog_edit(auth.uid(), client_id));

CREATE POLICY "Staff with catalog edit can delete ring form questions"
ON public.client_ring_form_questions FOR DELETE
TO authenticated
USING (public.staff_has_catalog_edit(auth.uid(), client_id));

-- 4. Staff write policies on client_metal_buying_config
CREATE POLICY "Staff with metal buying edit can insert metal buying config"
ON public.client_metal_buying_config FOR INSERT
TO authenticated
WITH CHECK (public.staff_has_metal_buying_edit(auth.uid(), client_id));

CREATE POLICY "Staff with metal buying edit can update metal buying config"
ON public.client_metal_buying_config FOR UPDATE
TO authenticated
USING (public.staff_has_metal_buying_edit(auth.uid(), client_id));

CREATE POLICY "Staff with metal buying edit can delete metal buying config"
ON public.client_metal_buying_config FOR DELETE
TO authenticated
USING (public.staff_has_metal_buying_edit(auth.uid(), client_id));

-- 5. Staff write policies on client_metal_buying_questions
CREATE POLICY "Staff with metal buying edit can insert metal buying questions"
ON public.client_metal_buying_questions FOR INSERT
TO authenticated
WITH CHECK (public.staff_has_metal_buying_edit(auth.uid(), client_id));

CREATE POLICY "Staff with metal buying edit can update metal buying questions"
ON public.client_metal_buying_questions FOR UPDATE
TO authenticated
USING (public.staff_has_metal_buying_edit(auth.uid(), client_id));

CREATE POLICY "Staff with metal buying edit can delete metal buying questions"
ON public.client_metal_buying_questions FOR DELETE
TO authenticated
USING (public.staff_has_metal_buying_edit(auth.uid(), client_id));

-- 6. Enable RLS on my_master_db_data_backup with agency_admin access
ALTER TABLE public.my_master_db_data_backup ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only agency admins can read backup data"
ON public.my_master_db_data_backup FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'agency_admin'));
