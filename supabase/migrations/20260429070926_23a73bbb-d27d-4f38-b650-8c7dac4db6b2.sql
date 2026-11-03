
-- Support tickets
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL,
  created_by_name text,
  created_by_email text NOT NULL,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  initial_message text NOT NULL,
  last_admin_reply_at timestamptz,
  last_client_reply_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_client ON public.support_tickets(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status, created_at DESC);

-- Threaded messages
CREATE TABLE public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  author_role text NOT NULL, -- 'client' | 'admin'
  author_name text,
  author_email text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket ON public.support_ticket_messages(ticket_id, created_at ASC);

-- Updated_at trigger on tickets
DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

-- Tickets: clients see their own (via client owner or staff membership); admins see all
DROP POLICY IF EXISTS "Tickets viewable by owners, staff, admins" ON public.support_tickets;
CREATE POLICY "Tickets viewable by owners, staff, admins"
ON public.support_tickets FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'agency_admin'::app_role)
  OR public.get_user_client_id(auth.uid()) = client_id
  OR public.is_staff_of_client(auth.uid(), client_id)
);

DROP POLICY IF EXISTS "Tickets created by owner or staff" ON public.support_tickets;

CREATE POLICY "Tickets created by owner or staff"
ON public.support_tickets FOR INSERT
TO authenticated
WITH CHECK (
  created_by_user_id = auth.uid()
  AND (
    public.get_user_client_id(auth.uid()) = client_id
    OR public.is_staff_of_client(auth.uid(), client_id)
  )
);

DROP POLICY IF EXISTS "Tickets updated by admins or ticket client" ON public.support_tickets;

CREATE POLICY "Tickets updated by admins or ticket client"
ON public.support_tickets FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'agency_admin'::app_role)
  OR public.get_user_client_id(auth.uid()) = client_id
  OR public.is_staff_of_client(auth.uid(), client_id)
)
WITH CHECK (
  public.has_role(auth.uid(), 'agency_admin'::app_role)
  OR public.get_user_client_id(auth.uid()) = client_id
  OR public.is_staff_of_client(auth.uid(), client_id)
);

-- Messages: visible to anyone who can see the parent ticket
DROP POLICY IF EXISTS "Messages viewable via parent ticket" ON public.support_ticket_messages;
CREATE POLICY "Messages viewable via parent ticket"
ON public.support_ticket_messages FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = ticket_id
      AND (
        public.has_role(auth.uid(), 'agency_admin'::app_role)
        OR public.get_user_client_id(auth.uid()) = t.client_id
        OR public.is_staff_of_client(auth.uid(), t.client_id)
      )
  )
);

DROP POLICY IF EXISTS "Messages insertable by ticket participants" ON public.support_ticket_messages;

CREATE POLICY "Messages insertable by ticket participants"
ON public.support_ticket_messages FOR INSERT
TO authenticated
WITH CHECK (
  author_user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.id = ticket_id
      AND (
        public.has_role(auth.uid(), 'agency_admin'::app_role)
        OR public.get_user_client_id(auth.uid()) = t.client_id
        OR public.is_staff_of_client(auth.uid(), t.client_id)
      )
  )
);
