
DROP POLICY IF EXISTS "Authenticated users can view preview images" ON grill_preview_images;
CREATE POLICY "Authenticated users can view preview images"
ON grill_preview_images FOR SELECT TO authenticated
USING (
  lead_id IN (SELECT id FROM grill_form_leads WHERE client_id = get_user_client_id(auth.uid()))
  OR has_role(auth.uid(), 'agency_admin')
  OR lead_id IN (SELECT id FROM grill_form_leads WHERE is_staff_of_client(auth.uid(), client_id))
);
