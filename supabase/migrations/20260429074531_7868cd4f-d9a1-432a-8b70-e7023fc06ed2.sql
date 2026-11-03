-- Allow ticket owners (client owner or staff who created it) and agency admins to delete their support tickets
DROP POLICY IF EXISTS "Tickets deletable by owner client or admin" ON public.support_tickets;
CREATE POLICY "Tickets deletable by owner client or admin"
ON public.support_tickets
FOR DELETE
USING (
  public.has_role(auth.uid(), 'agency_admin'::app_role)
  OR client_id = public.get_user_client_id(auth.uid())
  OR public.is_staff_of_client(auth.uid(), client_id)
);