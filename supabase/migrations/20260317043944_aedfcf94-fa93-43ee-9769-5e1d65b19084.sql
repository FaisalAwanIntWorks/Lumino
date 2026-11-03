
CREATE TABLE public.lead_follow_up_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL,
  lead_source TEXT NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  author_name TEXT,
  author_email TEXT,
  note_type TEXT NOT NULL DEFAULT 'note',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.lead_follow_up_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can manage own follow-up notes"
ON public.lead_follow_up_notes
FOR ALL TO authenticated
USING (
  client_id = public.get_user_client_id(auth.uid())
  OR public.has_role(auth.uid(), 'agency_admin')
  OR public.is_staff_of_client(auth.uid(), client_id)
)
WITH CHECK (
  client_id = public.get_user_client_id(auth.uid())
  OR public.has_role(auth.uid(), 'agency_admin')
  OR public.is_staff_of_client(auth.uid(), client_id)
);
