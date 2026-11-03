-- Add SELECT policies for staff members with catalog_access permission on catalog-related tables

-- Policy for client_ring_catalog
CREATE POLICY "Staff with catalog_access can view client catalog"
ON public.client_ring_catalog
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = client_ring_catalog.client_id
      AND (sm.permissions->>'catalog_access')::boolean = true
  )
);

-- Policy for client_option_prices
CREATE POLICY "Staff with catalog_access can view option prices"
ON public.client_option_prices
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = client_option_prices.client_id
      AND (sm.permissions->>'catalog_access')::boolean = true
  )
);

-- Policy for client_metal_variants
CREATE POLICY "Staff with catalog_access can view metal variants"
ON public.client_metal_variants
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = client_metal_variants.client_id
      AND (sm.permissions->>'catalog_access')::boolean = true
  )
);

-- Policy for client_onboarding_preferences (needed to check if catalog exists)
CREATE POLICY "Staff with catalog_access can view onboarding preferences"
ON public.client_onboarding_preferences
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = client_onboarding_preferences.client_id
      AND (sm.permissions->>'catalog_access')::boolean = true
  )
);

-- Policy for client_carat_options
CREATE POLICY "Staff with catalog_access can view carat options"
ON public.client_carat_options
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = client_carat_options.client_id
      AND (sm.permissions->>'catalog_access')::boolean = true
  )
);

-- Policy for client_size_options
CREATE POLICY "Staff with catalog_access can view size options"
ON public.client_size_options
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = client_size_options.client_id
      AND (sm.permissions->>'catalog_access')::boolean = true
  )
);