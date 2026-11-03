-- Create SECURITY DEFINER function to check staff membership (breaks RLS recursion)
CREATE OR REPLACE FUNCTION public.is_staff_of_client(_user_id uuid, _client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_members
    WHERE user_id = _user_id AND client_id = _client_id
  )
$$;

-- Drop the problematic policy that causes infinite recursion
DROP POLICY IF EXISTS "Staff can view their client record" ON public.clients;

-- Recreate the policy using the SECURITY DEFINER function
CREATE POLICY "Staff can view their client record"
  ON public.clients FOR SELECT
  USING (public.is_staff_of_client(auth.uid(), id));