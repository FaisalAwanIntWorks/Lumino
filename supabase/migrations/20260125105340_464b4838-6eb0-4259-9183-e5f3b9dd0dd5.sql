-- Fix clients table public exposure
-- 1. Add Staff SELECT policy so staff can view their client's record
CREATE POLICY "Staff can view their client record"
ON public.clients
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff_members sm
    WHERE sm.user_id = auth.uid()
      AND sm.client_id = clients.id
  )
);

-- 2. Recreate client_branding view with ONLY non-sensitive public branding fields
-- Remove shopify_store_url as it's business-sensitive information
DROP VIEW IF EXISTS public.client_branding;

CREATE VIEW public.client_branding 
WITH (security_invoker = true)
AS
SELECT 
  id,
  company_name,
  logo_url,
  branding_config,
  allowed_domains
FROM public.clients;

-- 3. For anon users to access the view, we need a special policy
-- But with security_invoker=true, we can't grant anon access to clients table
-- Solution: Create a SECURITY DEFINER function that returns only branding data
CREATE OR REPLACE FUNCTION public.get_client_branding(client_uuid UUID)
RETURNS TABLE (
  id UUID,
  company_name TEXT,
  logo_url TEXT,
  branding_config JSONB,
  allowed_domains TEXT[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    c.id,
    c.company_name,
    c.logo_url,
    c.branding_config,
    c.allowed_domains
  FROM public.clients c
  WHERE c.id = client_uuid;
$$;

-- Grant execute on the function to anon for embed access
GRANT EXECUTE ON FUNCTION public.get_client_branding(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_client_branding(UUID) TO authenticated;

-- Revoke direct SELECT on client_branding view from anon
-- Authenticated users can still use it if they pass RLS
REVOKE SELECT ON public.client_branding FROM anon;