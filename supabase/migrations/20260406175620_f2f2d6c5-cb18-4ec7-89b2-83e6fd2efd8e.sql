
ALTER TABLE public.client_status_tags DROP CONSTRAINT IF EXISTS client_status_tags_context_check;
ALTER TABLE public.client_status_tags ADD CONSTRAINT client_status_tags_context_check CHECK (context IN ('leads', 'orders', 'metal_buying'));
