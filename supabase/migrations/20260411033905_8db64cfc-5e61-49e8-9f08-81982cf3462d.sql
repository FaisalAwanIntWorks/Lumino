CREATE POLICY "Admins can view all custom enquiry leads"
ON public.custom_enquiry_leads FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Admins can view all metal buying leads"
ON public.metal_buying_leads FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'agency_admin'));