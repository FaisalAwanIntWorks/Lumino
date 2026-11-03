
CREATE TABLE public.appointment_bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id),
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  preferred_date DATE,
  preferred_time TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Allow public inserts (unauthenticated customers booking appointments)
ALTER TABLE public.appointment_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create appointment bookings"
  ON public.appointment_bookings
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view their client bookings"
  ON public.appointment_bookings
  FOR SELECT
  TO authenticated
  USING (true);
