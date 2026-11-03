
-- diamond_form_leads: client owner, staff, admin
CREATE POLICY "Clients can update their diamond form leads"
ON public.diamond_form_leads FOR UPDATE TO authenticated
USING (client_id = public.get_user_client_id(auth.uid()))
WITH CHECK (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Staff can update diamond form leads"
ON public.diamond_form_leads FOR UPDATE TO authenticated
USING (public.is_staff_of_client(auth.uid(), client_id))
WITH CHECK (public.is_staff_of_client(auth.uid(), client_id));

CREATE POLICY "Admins can update diamond form leads"
ON public.diamond_form_leads FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'agency_admin'))
WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));

-- grill_form_leads: client owner, staff, admin
CREATE POLICY "Clients can update their grill form leads"
ON public.grill_form_leads FOR UPDATE TO authenticated
USING (client_id = public.get_user_client_id(auth.uid()))
WITH CHECK (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Staff can update grill form leads"
ON public.grill_form_leads FOR UPDATE TO authenticated
USING (public.is_staff_of_client(auth.uid(), client_id))
WITH CHECK (public.is_staff_of_client(auth.uid(), client_id));

CREATE POLICY "Admins can update grill form leads"
ON public.grill_form_leads FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'agency_admin'))
WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));

-- custom_enquiry_leads: client owner + staff (admin already has ALL)
CREATE POLICY "Clients can update their custom enquiry leads"
ON public.custom_enquiry_leads FOR UPDATE TO authenticated
USING (client_id = public.get_user_client_id(auth.uid()))
WITH CHECK (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Staff can update custom enquiry leads"
ON public.custom_enquiry_leads FOR UPDATE TO authenticated
USING (public.is_staff_of_client(auth.uid(), client_id))
WITH CHECK (public.is_staff_of_client(auth.uid(), client_id));

-- design_requests: client owner + staff (admin UPDATE already exists)
CREATE POLICY "Clients can update their design requests"
ON public.design_requests FOR UPDATE TO authenticated
USING (client_id = public.get_user_client_id(auth.uid()))
WITH CHECK (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Staff can update design requests"
ON public.design_requests FOR UPDATE TO authenticated
USING (public.is_staff_of_client(auth.uid(), client_id))
WITH CHECK (public.is_staff_of_client(auth.uid(), client_id));

-- appointment_bookings: client owner, staff, admin
CREATE POLICY "Clients can update their appointment bookings"
ON public.appointment_bookings FOR UPDATE TO authenticated
USING (client_id = public.get_user_client_id(auth.uid()))
WITH CHECK (client_id = public.get_user_client_id(auth.uid()));

CREATE POLICY "Staff can update appointment bookings"
ON public.appointment_bookings FOR UPDATE TO authenticated
USING (public.is_staff_of_client(auth.uid(), client_id))
WITH CHECK (public.is_staff_of_client(auth.uid(), client_id));

CREATE POLICY "Admins can update appointment bookings"
ON public.appointment_bookings FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'agency_admin'))
WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));

-- saved_designs: staff + admin (client owner already exists)
CREATE POLICY "Staff can update saved designs"
ON public.saved_designs FOR UPDATE TO authenticated
USING (public.is_staff_of_client(auth.uid(), client_id))
WITH CHECK (public.is_staff_of_client(auth.uid(), client_id));

CREATE POLICY "Admins can update saved designs"
ON public.saved_designs FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'agency_admin'))
WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));
