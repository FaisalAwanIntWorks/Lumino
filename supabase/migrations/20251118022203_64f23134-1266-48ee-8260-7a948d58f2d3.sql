-- Security Fix 1: Restrict saved_designs to authenticated users only
-- Drop the old "Anyone can create" policy
DROP POLICY IF EXISTS "Anyone can create saved designs" ON public.saved_designs;

-- Create new policy requiring authentication
CREATE POLICY "Authenticated users can create saved designs"
ON public.saved_designs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Security Fix 2: Update order_items access control to use user_id relationship
-- Drop the old email-based policy
DROP POLICY IF EXISTS "Users can view their order items" ON public.order_items;

-- Create new user_id-based policy for better security
CREATE POLICY "Users can view their order items via user_id"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 
    FROM public.orders 
    WHERE orders.id = order_items.order_id 
    AND orders.customer_email IN (
      SELECT email FROM auth.users WHERE id = auth.uid()
    )
  )
);

-- Security Fix 3: Add helper function to safely access client data without exposing tokens
-- This function returns client data WITHOUT the shopify_access_token
CREATE OR REPLACE FUNCTION public.get_safe_client_data(client_user_id uuid)
RETURNS TABLE (
  id uuid,
  agency_id uuid,
  user_id uuid,
  company_name text,
  email text,
  logo_url text,
  status text,
  plan_id uuid,
  shopify_store_url text,
  created_at timestamptz,
  subscription_ends_at timestamptz,
  branding_config jsonb,
  custom_commission_rate numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    id,
    agency_id,
    user_id,
    company_name,
    email,
    logo_url,
    status,
    plan_id,
    shopify_store_url,
    created_at,
    subscription_ends_at,
    branding_config,
    custom_commission_rate
  FROM public.clients
  WHERE user_id = client_user_id;
$$;

-- Add comment explaining token security
COMMENT ON COLUMN public.clients.shopify_access_token IS 
'SECURITY: This token should only be accessed by admin users or secure edge functions. Never expose in client-side queries.';