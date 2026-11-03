-- Fix RLS policies that cast JSON permission strings like "edit" to boolean
-- This was causing: invalid input syntax for type boolean: "edit"

-- client_ring_catalog
DROP POLICY IF EXISTS "Staff with catalog_access can view client catalog" ON public.client_ring_catalog;
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
      AND lower(coalesce(sm.permissions->>'catalog_access', 'false')) IN ('true','view','edit')
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
      AND lower(coalesce(sm.permissions->>'catalog_access', 'false')) IN ('true','view','edit')
  )
);
