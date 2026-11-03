-- Security Fix: Explicitly deny anonymous access to clients table
-- Finding: clients_table_public_exposure
-- The table already has proper authenticated RLS policies, but we add an explicit
-- deny policy for the anon role to prevent any edge case access

-- First, revoke any direct table permissions from anon role
REVOKE ALL ON public.clients FROM anon;

-- Add explicit deny policy for anonymous users (belt and suspenders approach)
-- This ensures no anonymous user can ever access this table even if other policies exist
DROP POLICY IF EXISTS "Deny anonymous access to clients" ON public.clients;
CREATE POLICY "Deny anonymous access to clients"
  ON public.clients
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

-- Add comment explaining the security stance
COMMENT ON TABLE public.clients IS 'Client records with sensitive business data. RLS enforces: admins see all, clients see own record, staff see their client. Anonymous access is explicitly denied.';