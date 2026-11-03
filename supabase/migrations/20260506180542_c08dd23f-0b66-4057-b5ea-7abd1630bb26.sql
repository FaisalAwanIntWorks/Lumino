-- OAuth state nonce table for Shopify install flow
CREATE TABLE public.shopify_oauth_states (
  state TEXT PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  shop TEXT NOT NULL,
  return_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes')
);

CREATE INDEX IF NOT EXISTS idx_shopify_oauth_states_expires_at ON public.shopify_oauth_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_shopify_oauth_states_client_id ON public.shopify_oauth_states(client_id);

ALTER TABLE public.shopify_oauth_states ENABLE ROW LEVEL SECURITY;

-- Only the user who initiated can see their own state rows; admins see all
DROP POLICY IF EXISTS "Users can view their own oauth states" ON public.shopify_oauth_states;
CREATE POLICY "Users can view their own oauth states"
ON public.shopify_oauth_states
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'agency_admin'::app_role)
);

-- No public insert/update/delete from clients; service role manages writes
DROP POLICY IF EXISTS "Admins can delete oauth states" ON public.shopify_oauth_states;
CREATE POLICY "Admins can delete oauth states"
ON public.shopify_oauth_states
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'agency_admin'::app_role));

-- Cleanup function for expired states (callable via pg_cron)
CREATE OR REPLACE FUNCTION public.cleanup_expired_shopify_oauth_states()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.shopify_oauth_states WHERE expires_at < now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;