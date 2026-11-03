-- Add shopify_diamond_variant_id column to clients table for MVP two-line cart
ALTER TABLE public.clients 
ADD COLUMN shopify_diamond_variant_id text;