-- Harden the clients table with a RESTRICTIVE policy that blocks all anonymous access
-- First drop the existing permissive deny policy and replace with a proper restrictive one

-- Drop the existing permissive "deny" policy (which doesn't actually deny effectively)
DROP POLICY IF EXISTS "Deny anonymous access to clients" ON public.clients;

-- Create a RESTRICTIVE policy that blocks anon role entirely
-- A restrictive policy means ALL restrictive policies must pass, AND at least one permissive policy must pass
CREATE POLICY "Block all anonymous access to clients"
ON public.clients
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);

-- Also ensure the authenticated role SELECT policies are properly scoped
-- Drop and recreate the existing policies to ensure they only apply to authenticated role

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Admins can view all clients" ON public.clients;
DROP POLICY IF EXISTS "Clients can view their own record" ON public.clients;
DROP POLICY IF EXISTS "Staff can view their client record" ON public.clients;

-- Recreate with explicit authenticated role scope
CREATE POLICY "Admins can view all clients"
ON public.clients
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Clients can view their own record"
ON public.clients
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Staff can view their client record"
ON public.clients
FOR SELECT
TO authenticated
USING (public.is_staff_of_client(auth.uid(), id));

-- Also scope the update policy to authenticated
DROP POLICY IF EXISTS "Clients can update their own record" ON public.clients;

CREATE POLICY "Clients can update their own record"
ON public.clients
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Scope admin modify policy to authenticated
DROP POLICY IF EXISTS "Only admins can modify clients" ON public.clients;

CREATE POLICY "Only admins can modify clients"
ON public.clients
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'agency_admin'))
WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));

-- Revoke any remaining anon permissions as defense in depth
REVOKE ALL ON public.clients FROM anon;