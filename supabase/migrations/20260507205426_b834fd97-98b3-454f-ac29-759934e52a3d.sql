DROP POLICY IF EXISTS "Admins can update all preferences" ON public.client_onboarding_preferences;
CREATE POLICY "Admins can update all preferences"
  ON public.client_onboarding_preferences FOR UPDATE
  USING (has_role(auth.uid(), 'agency_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'agency_admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert preferences" ON public.client_onboarding_preferences;

CREATE POLICY "Admins can insert preferences"
  ON public.client_onboarding_preferences FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'agency_admin'::app_role));

DROP POLICY IF EXISTS "Staff with catalog_access can update onboarding preferences" ON public.client_onboarding_preferences;

CREATE POLICY "Staff with catalog_access can update onboarding preferences"
  ON public.client_onboarding_preferences FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = client_onboarding_preferences.client_id
      AND lower(sm.permissions->>'catalog_access') = ANY (ARRAY['true','edit'])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = client_onboarding_preferences.client_id
      AND lower(sm.permissions->>'catalog_access') = ANY (ARRAY['true','edit'])
  ));

DROP POLICY IF EXISTS "Staff with catalog_access can insert onboarding preferences" ON public.client_onboarding_preferences;

CREATE POLICY "Staff with catalog_access can insert onboarding preferences"
  ON public.client_onboarding_preferences FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = client_onboarding_preferences.client_id
      AND lower(sm.permissions->>'catalog_access') = ANY (ARRAY['true','edit'])
  ));