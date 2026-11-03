
-- Create client_status_tags table for custom status tags
CREATE TABLE public.client_status_tags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tag_name TEXT NOT NULL,
  tag_color TEXT NOT NULL DEFAULT 'bg-secondary',
  context TEXT NOT NULL CHECK (context IN ('leads', 'orders')),
  display_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add unique constraint
ALTER TABLE public.client_status_tags ADD CONSTRAINT unique_client_tag_context UNIQUE (client_id, tag_name, context);

-- Create index for fast lookups
CREATE INDEX idx_client_status_tags_client_context ON public.client_status_tags(client_id, context);

-- RLS
ALTER TABLE public.client_status_tags ENABLE ROW LEVEL SECURITY;

-- Clients can read their own tags
CREATE POLICY "Clients can read own tags" ON public.client_status_tags
  FOR SELECT USING (
    client_id = public.get_user_client_id(auth.uid())
    OR public.has_role(auth.uid(), 'agency_admin')
    OR public.is_staff_of_client(auth.uid(), client_id)
  );

-- Clients can insert their own tags
CREATE POLICY "Clients can insert own tags" ON public.client_status_tags
  FOR INSERT WITH CHECK (
    client_id = public.get_user_client_id(auth.uid())
    OR public.has_role(auth.uid(), 'agency_admin')
  );

-- Clients can delete their own non-default tags
CREATE POLICY "Clients can delete own tags" ON public.client_status_tags
  FOR DELETE USING (
    (client_id = public.get_user_client_id(auth.uid()) OR public.has_role(auth.uid(), 'agency_admin'))
    AND is_default = false
  );

-- Allow anon read for public access (embed pages won't need this, but admin impersonation does)
CREATE POLICY "Anon can read tags" ON public.client_status_tags
  FOR SELECT TO anon USING (true);
