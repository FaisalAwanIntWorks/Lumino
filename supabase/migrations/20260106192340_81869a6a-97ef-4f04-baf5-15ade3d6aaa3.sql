-- Create staff_members table for client team management
CREATE TABLE public.staff_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  password TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

-- Create policy: Clients can view their own staff
CREATE POLICY "Clients can view their own staff" 
ON public.staff_members 
FOR SELECT 
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
);

-- Create policy: Clients can insert their own staff
CREATE POLICY "Clients can insert their own staff" 
ON public.staff_members 
FOR INSERT 
WITH CHECK (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
);

-- Create policy: Clients can update their own staff
CREATE POLICY "Clients can update their own staff" 
ON public.staff_members 
FOR UPDATE 
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
);

-- Create policy: Clients can delete their own staff
CREATE POLICY "Clients can delete their own staff" 
ON public.staff_members 
FOR DELETE 
USING (
  client_id IN (
    SELECT id FROM public.clients WHERE user_id = auth.uid()
  )
);

-- Add trigger for updating updated_at
CREATE TRIGGER update_staff_members_updated_at
BEFORE UPDATE ON public.staff_members
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();