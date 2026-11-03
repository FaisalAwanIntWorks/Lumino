ALTER TABLE public.analytics_events DROP CONSTRAINT IF EXISTS analytics_events_event_type_check;

ALTER TABLE public.analytics_events ADD CONSTRAINT analytics_events_event_type_check CHECK (event_type IN ('configurator_load', 'add_to_cart', 'purchase', 'page_view', 'embed_view', 'ring_view', 'config_started', 'config_completed', 'design_saved', 'widget_view'));