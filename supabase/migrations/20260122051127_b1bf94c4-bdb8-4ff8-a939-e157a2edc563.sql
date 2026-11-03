-- Drop the overly permissive "service role" policy that allows public access
DROP POLICY IF EXISTS "Service role has full access to activity logs" ON public.client_activity_logs;

-- Create a proper policy for service role only (not public role)
-- Note: Service role bypasses RLS automatically, so we don't need an explicit policy for it

-- The existing SELECT policies are correct:
-- 1. Admins can view all (via has_role check)
-- 2. Client owners can view their own
-- 3. Staff members can view their client's logs

-- The INSERT policy needs to be more restrictive - only allow users to insert for their own client
DROP POLICY IF EXISTS "Authenticated users can insert activity logs" ON public.client_activity_logs;

CREATE POLICY "Users can insert activity logs for their client"
ON public.client_activity_logs
FOR INSERT
TO authenticated
WITH CHECK (
  -- User is inserting for their own client (as owner)
  client_id IN (SELECT id FROM clients WHERE user_id = auth.uid())
  OR
  -- User is inserting for their client (as staff)
  client_id IN (SELECT client_id FROM staff_members WHERE user_id = auth.uid())
  OR
  -- User is an admin (can insert for any client)
  has_role(auth.uid(), 'agency_admin'::app_role)
);

-- Add UPDATE policy for admins only
CREATE POLICY "Admins can update activity logs"
ON public.client_activity_logs
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'agency_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'agency_admin'::app_role));

-- Add DELETE policy for admins only (for GDPR compliance)
CREATE POLICY "Admins can delete activity logs"
ON public.client_activity_logs
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'agency_admin'::app_role));