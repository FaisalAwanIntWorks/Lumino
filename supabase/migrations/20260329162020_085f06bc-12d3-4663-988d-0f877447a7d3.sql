
-- Create pending_render_emails table for deferred email sends
CREATE TABLE public.pending_render_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id text NOT NULL UNIQUE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  form_type text NOT NULL,
  customer_email text NOT NULL,
  customer_name text,
  details jsonb DEFAULT '{}'::jsonb,
  send_after timestamptz NOT NULL DEFAULT (now() + interval '3 minutes'),
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for cron worker queries
CREATE INDEX idx_pending_render_emails_status_send_after 
  ON public.pending_render_emails (status, send_after) 
  WHERE status = 'pending';

-- RLS: service-role only access (no client access needed)
ALTER TABLE public.pending_render_emails ENABLE ROW LEVEL SECURITY;
