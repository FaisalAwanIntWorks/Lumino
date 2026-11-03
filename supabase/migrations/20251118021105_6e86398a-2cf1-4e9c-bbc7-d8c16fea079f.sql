-- Add RLS policy for clients to update their own branding config
CREATE POLICY "Clients can update their own record"
ON public.clients
FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Drop old analytics events check constraint
ALTER TABLE public.analytics_events
DROP CONSTRAINT IF EXISTS analytics_events_event_type_check;

-- Add updated check constraint with all event types
ALTER TABLE public.analytics_events
ADD CONSTRAINT analytics_events_event_type_check
CHECK (event_type IN (
  'configurator_load',
  'add_to_cart', 
  'purchase',
  'page_view',
  'embed_view',
  'ring_view',
  'config_started',
  'config_completed',
  'design_saved'
));