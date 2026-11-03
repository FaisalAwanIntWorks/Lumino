
-- 1. Client update policy for cad_requests (allows clients to update status and client_feedback)
CREATE POLICY "Clients can update own cad_requests feedback"
  ON public.cad_requests FOR UPDATE
  TO authenticated
  USING (client_id = public.get_user_client_id(auth.uid()) OR public.is_staff_of_client(auth.uid(), client_id))
  WITH CHECK (client_id = public.get_user_client_id(auth.uid()) OR public.is_staff_of_client(auth.uid(), client_id));

-- 2. Add request_number column with auto-increment
ALTER TABLE public.cad_requests ADD COLUMN IF NOT EXISTS request_number SERIAL;

-- 3. Create admin_notifications table
CREATE TABLE public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  category TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  message TEXT,
  metadata JSONB DEFAULT '{}',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read own notifications" ON public.admin_notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid() AND public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Admins update own notifications" ON public.admin_notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Admins delete own notifications" ON public.admin_notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Authenticated can insert admin notifications" ON public.admin_notifications
  FOR INSERT TO authenticated WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;
