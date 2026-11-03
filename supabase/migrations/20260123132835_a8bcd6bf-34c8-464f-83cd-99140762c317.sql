-- Drop the existing staff SELECT policy
DROP POLICY IF EXISTS "Staff with leads access can view saved designs" ON public.saved_designs;

-- Create new SELECT policy for staff with leads_access OR catalog_access (view/edit)
CREATE POLICY "Staff with access can view saved designs" 
ON public.saved_designs 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1
    FROM staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = saved_designs.client_id
      AND sm.status = 'active'
      AND (
        -- Legacy leads_access permission
        ((sm.permissions ->> 'leads_access')::boolean = true)
        -- OR catalog_access is 'view' or 'edit'
        OR (sm.permissions ->> 'catalog_access') = 'view'
        OR (sm.permissions ->> 'catalog_access') = 'edit'
      )
  )
);

-- Create DELETE policy for staff with edit access
CREATE POLICY "Staff with edit access can delete saved designs" 
ON public.saved_designs 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1
    FROM staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = saved_designs.client_id
      AND sm.status = 'active'
      AND (
        -- Legacy leads_access with edit capability
        ((sm.permissions ->> 'leads_access')::boolean = true)
        -- OR catalog_access is 'edit'
        OR (sm.permissions ->> 'catalog_access') = 'edit'
      )
  )
);