
CREATE TABLE public.cad_resize_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  requested_by UUID NOT NULL,
  current_size TEXT NOT NULL DEFAULT '6',
  requested_size TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.cad_resize_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can view own resize requests"
  ON public.cad_resize_requests FOR SELECT TO authenticated
  USING (client_id = public.get_user_client_id(auth.uid()) 
    OR public.is_staff_of_client(auth.uid(), client_id)
    OR public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Clients can insert resize requests"
  ON public.cad_resize_requests FOR INSERT TO authenticated
  WITH CHECK (client_id = public.get_user_client_id(auth.uid()) 
    OR public.is_staff_of_client(auth.uid(), client_id));

CREATE POLICY "Admins can update resize requests"
  ON public.cad_resize_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE TRIGGER handle_cad_resize_updated_at BEFORE UPDATE ON public.cad_resize_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
