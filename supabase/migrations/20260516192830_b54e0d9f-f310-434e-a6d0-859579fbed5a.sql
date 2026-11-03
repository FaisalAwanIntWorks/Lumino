DROP POLICY IF EXISTS "Clients can update their own orders" ON public.orders;
CREATE POLICY "Clients can update their own orders"
  ON public.orders FOR UPDATE TO authenticated
  USING      (client_id = public.get_user_client_id(auth.uid()))
  WITH CHECK (client_id = public.get_user_client_id(auth.uid()));

DROP POLICY IF EXISTS "Staff can update client orders" ON public.orders;

CREATE POLICY "Staff can update client orders"
  ON public.orders FOR UPDATE TO authenticated
  USING      (public.is_staff_of_client(auth.uid(), client_id))
  WITH CHECK (public.is_staff_of_client(auth.uid(), client_id));