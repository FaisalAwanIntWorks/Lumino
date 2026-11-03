DROP POLICY IF EXISTS "Client branding admin all" ON storage.objects;
CREATE POLICY "Client branding admin all"
ON storage.objects FOR ALL
TO authenticated
USING (
  bucket_id = 'client-branding'
  AND has_role(auth.uid(), 'agency_admin'::app_role)
)
WITH CHECK (
  bucket_id = 'client-branding'
  AND has_role(auth.uid(), 'agency_admin'::app_role)
);