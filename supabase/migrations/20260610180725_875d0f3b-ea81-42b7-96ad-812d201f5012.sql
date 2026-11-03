ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS scheduling_url text,
  ADD COLUMN IF NOT EXISTS scheduling_provider text;

COMMENT ON COLUMN public.clients.scheduling_provider IS
  'One of: calendly | cal | other. Used by widgets to pick embed params.';

CREATE OR REPLACE FUNCTION public.get_client_scheduling(client_uuid uuid)
RETURNS TABLE(scheduling_url text, scheduling_provider text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT c.scheduling_url, c.scheduling_provider
  FROM public.clients c
  WHERE c.id = client_uuid;
$$;

GRANT EXECUTE ON FUNCTION public.get_client_scheduling(uuid) TO anon, authenticated, service_role;