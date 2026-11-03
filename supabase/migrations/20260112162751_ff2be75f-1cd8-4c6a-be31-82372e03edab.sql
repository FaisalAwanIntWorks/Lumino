-- Make product_id nullable and add product_name column for storing ring configuration name
ALTER TABLE public.saved_designs 
  ALTER COLUMN product_id DROP NOT NULL;

-- Add product_name column to store the generated ring name like "Three Stone High Polish Yellow Gold Round"
ALTER TABLE public.saved_designs 
  ADD COLUMN IF NOT EXISTS product_name text;

-- Add RLS policy for anonymous users to insert from embed widget
-- This allows the embed to save designs without requiring user authentication
CREATE POLICY "Public can insert saved designs from embed" 
ON public.saved_designs 
FOR INSERT 
WITH CHECK (true);

-- Update existing SELECT policy to allow public viewing for admin purposes (they need client_id match)
-- Keep existing policies but also allow clients via staff access
CREATE POLICY "Staff with leads access can view saved designs" 
ON public.saved_designs 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM staff_members sm
    WHERE sm.user_id = auth.uid() 
    AND sm.client_id = saved_designs.client_id 
    AND (sm.permissions->>'leads_access')::boolean = true
  )
);