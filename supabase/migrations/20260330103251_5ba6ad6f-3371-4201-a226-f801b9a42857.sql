
-- Create cad_requests table
CREATE TABLE public.cad_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  requested_by UUID NOT NULL,
  
  source TEXT NOT NULL DEFAULT 'custom',
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  lead_id UUID,
  lead_table TEXT,
  
  ring_combination_id TEXT,
  ring_product_name TEXT,
  is_custom_ring BOOLEAN DEFAULT false,
  
  metal_type TEXT,
  style TEXT,
  shape TEXT,
  ring_size TEXT,
  carat_size TEXT,
  custom_description TEXT,
  reference_images TEXT[],
  
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT DEFAULT 'normal',
  admin_notes TEXT,
  
  cad_file_urls TEXT[],
  delivered_at TIMESTAMPTZ,
  
  customer_name TEXT,
  customer_email TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add updated_at trigger
CREATE TRIGGER update_cad_requests_updated_at
  BEFORE UPDATE ON public.cad_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.cad_requests ENABLE ROW LEVEL SECURITY;

-- Clients can view their own requests
CREATE POLICY "Clients can view own cad_requests"
  ON public.cad_requests FOR SELECT
  TO authenticated
  USING (
    client_id = public.get_user_client_id(auth.uid())
    OR public.has_role(auth.uid(), 'agency_admin')
    OR public.is_staff_of_client(auth.uid(), client_id)
  );

-- Clients can insert their own requests
CREATE POLICY "Clients can insert own cad_requests"
  ON public.cad_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    client_id = public.get_user_client_id(auth.uid())
    OR public.has_role(auth.uid(), 'agency_admin')
    OR public.is_staff_of_client(auth.uid(), client_id)
  );

-- Admins can update any request (status, notes, file uploads)
CREATE POLICY "Admins can update cad_requests"
  ON public.cad_requests FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'agency_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));

-- Clients can delete own requests
CREATE POLICY "Clients can delete own cad_requests"
  ON public.cad_requests FOR DELETE
  TO authenticated
  USING (
    client_id = public.get_user_client_id(auth.uid())
    OR public.has_role(auth.uid(), 'agency_admin')
  );

-- Create cad-deliveries storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('cad-deliveries', 'cad-deliveries', false);

-- Admin can upload to cad-deliveries
CREATE POLICY "Admins can upload cad deliveries"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'cad-deliveries'
    AND public.has_role(auth.uid(), 'agency_admin')
  );

-- Authenticated users can read from cad-deliveries
CREATE POLICY "Authenticated can read cad deliveries"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'cad-deliveries');

-- Enable realtime for cad_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.cad_requests;
