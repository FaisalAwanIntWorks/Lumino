-- Add permissions column to staff_members table
ALTER TABLE public.staff_members 
ADD COLUMN permissions jsonb NOT NULL DEFAULT '{"catalog_access": true}'::jsonb;