
-- Table to store client email notification preferences
CREATE TABLE public.client_notification_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, notification_type)
);

-- Enable RLS
ALTER TABLE public.client_notification_preferences ENABLE ROW LEVEL SECURITY;

-- Clients can view their own preferences
CREATE POLICY "Clients can view own notification preferences"
ON public.client_notification_preferences
FOR SELECT
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
);

-- Clients can insert their own preferences
CREATE POLICY "Clients can insert own notification preferences"
ON public.client_notification_preferences
FOR INSERT
WITH CHECK (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
);

-- Clients can update their own preferences
CREATE POLICY "Clients can update own notification preferences"
ON public.client_notification_preferences
FOR UPDATE
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
);

-- Staff can view preferences for their client
CREATE POLICY "Staff can view client notification preferences"
ON public.client_notification_preferences
FOR SELECT
USING (
  client_id IN (
    SELECT client_id FROM public.staff_members WHERE user_id = auth.uid() AND status = 'active'
  )
);

-- Agency admins can view all
CREATE POLICY "Agency admins can view all notification preferences"
ON public.client_notification_preferences
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'agency_admin'
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_client_notification_preferences_updated_at
BEFORE UPDATE ON public.client_notification_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
