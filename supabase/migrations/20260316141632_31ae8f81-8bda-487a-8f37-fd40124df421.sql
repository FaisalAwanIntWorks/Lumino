CREATE POLICY "Clients can delete their own orders"
ON public.orders
FOR DELETE
TO authenticated
USING (client_id = get_user_client_id(auth.uid()));