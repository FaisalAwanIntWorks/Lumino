-- Add Shopify sync tracking columns to client_ring_catalog
ALTER TABLE public.client_ring_catalog 
ADD COLUMN IF NOT EXISTS shopify_synced_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS shopify_sync_status TEXT DEFAULT 'pending';

-- Add Admin API token storage to clients table
ALTER TABLE public.clients
ADD COLUMN IF NOT EXISTS shopify_admin_access_token_encrypted BYTEA;