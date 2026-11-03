-- Add shopify_storefront_token column to clients table for Storefront Cart API
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS shopify_storefront_token_encrypted bytea;