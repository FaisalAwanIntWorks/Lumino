
-- Add DELETE policy for design_requests (ring builder leads)
CREATE POLICY "Clients can delete their own design requests"
ON public.design_requests
FOR DELETE
USING (
  client_id = public.get_user_client_id(auth.uid())
  OR public.has_role(auth.uid(), 'agency_admin')
);

-- Add DELETE policy for custom_enquiry_leads
CREATE POLICY "Clients can delete their own custom enquiry leads"
ON public.custom_enquiry_leads
FOR DELETE
USING (
  client_id = public.get_user_client_id(auth.uid())
  OR public.has_role(auth.uid(), 'agency_admin')
);

-- Also add staff delete policies for both tables
CREATE POLICY "Staff can delete design requests"
ON public.design_requests
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM staff_members sm
    WHERE sm.user_id = auth.uid()
    AND sm.client_id = design_requests.client_id
    AND sm.status = 'active'
    AND (sm.permissions->>'leads_access')::boolean = true
  )
);

CREATE POLICY "Staff can delete custom enquiry leads"
ON public.custom_enquiry_leads
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM staff_members sm
    WHERE sm.user_id = auth.uid()
    AND sm.client_id = custom_enquiry_leads.client_id
    AND sm.status = 'active'
    AND (sm.permissions->>'leads_access')::boolean = true
  )
);
