
-- Create cad_request_messages table
CREATE TABLE public.cad_request_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cad_request_id UUID REFERENCES public.cad_requests(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('admin', 'client', 'staff')),
  message TEXT,
  file_urls TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cad_request_messages ENABLE ROW LEVEL SECURITY;

-- Admins can read all messages
CREATE POLICY "Admins can read all cad messages"
ON public.cad_request_messages
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'agency_admin'));

-- Admins can insert messages
CREATE POLICY "Admins can insert cad messages"
ON public.cad_request_messages
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'agency_admin')
  AND sender_id = auth.uid()
);

-- Clients/staff can read messages for their own CAD requests
CREATE POLICY "Clients can read own cad messages"
ON public.cad_request_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cad_requests cr
    WHERE cr.id = cad_request_id
    AND (
      cr.client_id = public.get_user_client_id(auth.uid())
      OR public.is_staff_of_client(auth.uid(), cr.client_id)
    )
  )
);

-- Clients/staff can insert messages for their own CAD requests
CREATE POLICY "Clients can insert own cad messages"
ON public.cad_request_messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.cad_requests cr
    WHERE cr.id = cad_request_id
    AND (
      cr.client_id = public.get_user_client_id(auth.uid())
      OR public.is_staff_of_client(auth.uid(), cr.client_id)
    )
  )
);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.cad_request_messages;

-- Storage policy for chat attachments in cad-deliveries bucket
CREATE POLICY "Authenticated users can upload chat attachments"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'cad-deliveries'
  AND (storage.foldername(name))[1] = 'chat-attachments'
);

-- Allow authenticated users to read chat attachments
CREATE POLICY "Authenticated users can read chat attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'cad-deliveries'
  AND (storage.foldername(name))[1] = 'chat-attachments'
);
