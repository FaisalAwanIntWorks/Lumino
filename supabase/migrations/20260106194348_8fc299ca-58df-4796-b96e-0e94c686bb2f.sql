-- Add 'staff' to the app_role enum type
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'staff';

-- Add user_id column to link staff members to auth users
ALTER TABLE public.staff_members 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_staff_members_user_id ON public.staff_members(user_id);

-- Update RLS policies to also allow staff to access their own record
CREATE POLICY "Staff can view their own record"
  ON public.staff_members
  FOR SELECT
  USING (auth.uid() = user_id);