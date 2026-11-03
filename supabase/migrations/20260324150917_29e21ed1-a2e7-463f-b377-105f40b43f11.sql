CREATE POLICY "Clients can delete own notifications"
ON public.client_notifications
FOR DELETE
TO authenticated
USING (
  client_id = public.get_user_client_id(auth.uid())
  OR public.is_staff_of_client(auth.uid(), client_id)
);