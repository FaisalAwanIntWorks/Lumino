-- Remove old faulty staff policies that still cast permission strings to boolean unsafely
-- These policies cause: "invalid input syntax for type boolean: 'edit'"

-- Drop all staff catalog_access policies on affected tables and re-create safe versions

-- client_ring_catalog: drop old version if any remains
DROP POLICY IF EXISTS "Staff with catalog_access can view client catalog" ON public.client_ring_catalog;

-- Recreate with safe check
CREATE POLICY "Staff with catalog_access can view client catalog"
ON public.client_ring_catalog
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = client_ring_catalog.client_id
      AND (
        (sm.permissions->>'catalog_access') IS NOT NULL
        AND lower(sm.permissions->>'catalog_access') IN ('true','view','edit')
      )
  )
);

-- client_option_prices
DROP POLICY IF EXISTS "Staff with catalog_access can view option prices" ON public.client_option_prices;

CREATE POLICY "Staff with catalog_access can view option prices"
ON public.client_option_prices
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = client_option_prices.client_id
      AND (
        (sm.permissions->>'catalog_access') IS NOT NULL
        AND lower(sm.permissions->>'catalog_access') IN ('true','view','edit')
      )
  )
);

-- client_carat_options
DROP POLICY IF EXISTS "Staff with catalog_access can view carat options" ON public.client_carat_options;

CREATE POLICY "Staff with catalog_access can view carat options"
ON public.client_carat_options
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = client_carat_options.client_id
      AND (
        (sm.permissions->>'catalog_access') IS NOT NULL
        AND lower(sm.permissions->>'catalog_access') IN ('true','view','edit')
      )
  )
);

-- client_onboarding_preferences
DROP POLICY IF EXISTS "Staff with catalog_access can view onboarding preferences" ON public.client_onboarding_preferences;

CREATE POLICY "Staff with catalog_access can view onboarding preferences"
ON public.client_onboarding_preferences
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = client_onboarding_preferences.client_id
      AND (
        (sm.permissions->>'catalog_access') IS NOT NULL
        AND lower(sm.permissions->>'catalog_access') IN ('true','view','edit')
      )
  )
);

-- client_metal_variants
DROP POLICY IF EXISTS "Staff with catalog_access can view metal variants" ON public.client_metal_variants;

CREATE POLICY "Staff with catalog_access can view metal variants"
ON public.client_metal_variants
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = client_metal_variants.client_id
      AND (
        (sm.permissions->>'catalog_access') IS NOT NULL
        AND lower(sm.permissions->>'catalog_access') IN ('true','view','edit')
      )
  )
);