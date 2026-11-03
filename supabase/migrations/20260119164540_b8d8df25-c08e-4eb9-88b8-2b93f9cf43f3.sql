-- Fix client deletion: allow analytics events to be removed and cascade automatically

-- 1) Ensure admins can delete analytics events (required for manual cleanup + FK cascades)
DROP POLICY IF EXISTS "Admins can delete analytics" ON public.analytics_events;
CREATE POLICY "Admins can delete analytics"
ON public.analytics_events
FOR DELETE
USING (public.has_role(auth.uid(), 'agency_admin'));

-- 2) Make analytics_events.client_id FK cascade on client deletion
--    (prevents FK errors even if an app forgets to delete analytics events first)
ALTER TABLE public.analytics_events
  DROP CONSTRAINT IF EXISTS analytics_events_client_id_fkey;

ALTER TABLE public.analytics_events
  ADD CONSTRAINT analytics_events_client_id_fkey
  FOREIGN KEY (client_id)
  REFERENCES public.clients(id)
  ON DELETE CASCADE;