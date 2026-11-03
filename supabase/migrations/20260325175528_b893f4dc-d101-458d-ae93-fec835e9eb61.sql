ALTER TABLE public.appointment_bookings ADD COLUMN IF NOT EXISTS follow_up_status TEXT DEFAULT 'new';
ALTER PUBLICATION supabase_realtime ADD TABLE public.appointment_bookings;