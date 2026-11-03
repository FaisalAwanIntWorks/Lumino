-- Fix: Client Business Data Publicly Readable
-- The current policy exposes all columns including sensitive data like emails and encrypted tokens
-- Solution: Create a restricted view for public embed access and tighten RLS

-- Step 1: Create a public view with only branding-related fields needed for embeds
CREATE OR REPLACE VIEW public.client_branding AS
SELECT 
  id,
  logo_url,
  branding_config,
  company_name
FROM public.clients;

-- Grant SELECT on the view to anon and authenticated roles
GRANT SELECT ON public.client_branding TO anon;
GRANT SELECT ON public.client_branding TO authenticated;

-- Step 2: Drop the overly permissive policy that exposes all client data
DROP POLICY IF EXISTS "Public can view client branding for embeds" ON public.clients;

-- Step 3: Create a new restrictive policy that only allows public access via the view
-- For direct table access, only admins and the client themselves can view
-- (The existing policies "Admins can view all clients" and "Clients can view their own record" 
-- already handle this, so we just need to remove the public access policy)