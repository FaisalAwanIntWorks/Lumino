-- Create a SECURITY DEFINER function to check if a client is active
-- This allows the anon role to verify client status without direct table access
CREATE OR REPLACE FUNCTION public.is_client_active(p_client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM clients WHERE id = p_client_id AND status = 'active'
  );
$$;

-- Drop the old broken policy
DROP POLICY IF EXISTS "Anon can insert leads for valid clients" ON public.saved_designs;

-- Recreate with SECURITY DEFINER function instead of direct clients table access
CREATE POLICY "Anon can insert leads for valid clients"
ON public.saved_designs
FOR INSERT
TO anon
WITH CHECK (
  is_client_active(client_id)
  AND customer_name IS NOT NULL
  AND customer_email IS NOT NULL
  AND length(customer_name) <= 200
  AND length(customer_email) <= 255
);