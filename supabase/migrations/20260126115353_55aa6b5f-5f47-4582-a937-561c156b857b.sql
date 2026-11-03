-- Secure saved_designs table while preserving anonymous lead capture for embeds
-- The goal: anon can INSERT (lead capture) but NOT SELECT (data harvesting prevention)

-- 1. Drop the overly permissive public insert policy
DROP POLICY IF EXISTS "Public can insert saved designs from embed" ON public.saved_designs;

-- 2. Create a more restrictive anon INSERT policy that:
--    - Only allows insert (not select/update/delete)
--    - Requires a valid client_id that exists
--    - Ensures required fields are populated
CREATE POLICY "Anon can insert leads for valid clients"
ON public.saved_designs
FOR INSERT
TO anon
WITH CHECK (
  -- Verify client_id exists and is active
  EXISTS (
    SELECT 1 FROM public.clients c 
    WHERE c.id = client_id AND c.status = 'active'
  )
  -- Ensure customer info is provided (basic validation)
  AND customer_name IS NOT NULL 
  AND customer_email IS NOT NULL
  AND length(customer_name) <= 200
  AND length(customer_email) <= 255
);

-- 3. Block anonymous SELECT access with RESTRICTIVE policy
CREATE POLICY "Block anonymous select on saved_designs"
ON public.saved_designs
AS RESTRICTIVE
FOR SELECT
TO anon
USING (false);

-- 4. Block anonymous UPDATE access
CREATE POLICY "Block anonymous update on saved_designs"
ON public.saved_designs
AS RESTRICTIVE
FOR UPDATE
TO anon
USING (false)
WITH CHECK (false);

-- 5. Block anonymous DELETE access
CREATE POLICY "Block anonymous delete on saved_designs"
ON public.saved_designs
AS RESTRICTIVE
FOR DELETE
TO anon
USING (false);

-- 6. Scope existing SELECT policies to authenticated role only
DROP POLICY IF EXISTS "Admins can view all saved designs" ON public.saved_designs;
DROP POLICY IF EXISTS "Clients can view their own saved designs" ON public.saved_designs;
DROP POLICY IF EXISTS "Staff with access can view saved designs" ON public.saved_designs;

CREATE POLICY "Admins can view all saved designs"
ON public.saved_designs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Clients can view their own saved designs"
ON public.saved_designs
FOR SELECT
TO authenticated
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Staff with access can view saved designs"
ON public.saved_designs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = saved_designs.client_id
      AND sm.status = 'active'
      AND (
        (sm.permissions->>'leads_access')::boolean = true
        OR (sm.permissions->>'catalog_access') = 'view'
        OR (sm.permissions->>'catalog_access') = 'edit'
      )
  )
);

-- 7. Scope UPDATE/DELETE policies to authenticated role
DROP POLICY IF EXISTS "Clients can update their saved designs" ON public.saved_designs;
DROP POLICY IF EXISTS "Clients can delete their own saved designs" ON public.saved_designs;
DROP POLICY IF EXISTS "Staff with edit access can delete saved designs" ON public.saved_designs;

CREATE POLICY "Clients can update their saved designs"
ON public.saved_designs
FOR UPDATE
TO authenticated
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Clients can delete their own saved designs"
ON public.saved_designs
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.clients c
    WHERE c.user_id = auth.uid() AND c.id = saved_designs.client_id
  )
);

CREATE POLICY "Staff with edit access can delete saved designs"
ON public.saved_designs
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = saved_designs.client_id
      AND sm.status = 'active'
      AND (
        (sm.permissions->>'leads_access')::boolean = true
        OR (sm.permissions->>'catalog_access') = 'edit'
      )
  )
);

-- 8. Revoke SELECT, UPDATE, DELETE from anon (keep INSERT for lead capture)
REVOKE SELECT, UPDATE, DELETE ON public.saved_designs FROM anon;