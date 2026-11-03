-- Allow clients and staff to upload to cad-deliveries bucket
CREATE POLICY "Clients and staff can upload to cad-deliveries"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'cad-deliveries'
    AND (
      public.get_user_client_id(auth.uid()) IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.staff_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );

-- Allow clients and staff to update their uploads in cad-deliveries
CREATE POLICY "Clients and staff can update cad-deliveries"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'cad-deliveries'
    AND (
      public.get_user_client_id(auth.uid()) IS NOT NULL
      OR public.has_role(auth.uid(), 'agency_admin')
      OR EXISTS (
        SELECT 1 FROM public.staff_members
        WHERE user_id = auth.uid() AND status = 'active'
      )
    )
  );