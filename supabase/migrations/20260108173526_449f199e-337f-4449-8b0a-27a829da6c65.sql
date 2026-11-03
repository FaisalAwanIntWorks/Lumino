-- Create admin_staff_members table for admin team management
CREATE TABLE public.admin_staff_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  password TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_staff_members ENABLE ROW LEVEL SECURITY;

-- Create policies for admin access only
CREATE POLICY "Agency admins can view all admin staff"
ON public.admin_staff_members
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Agency admins can insert admin staff"
ON public.admin_staff_members
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Agency admins can update admin staff"
ON public.admin_staff_members
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'agency_admin'));

CREATE POLICY "Agency admins can delete admin staff"
ON public.admin_staff_members
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'agency_admin'));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_admin_staff_members_updated_at
BEFORE UPDATE ON public.admin_staff_members
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();