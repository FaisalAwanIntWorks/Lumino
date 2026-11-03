-- Add allowed_domains column to clients table for embed widget security
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS allowed_domains text[] DEFAULT '{}';

COMMENT ON COLUMN clients.allowed_domains IS 
  'List of domains allowed to embed the ring builder widget (e.g., mystore.myshopify.com)';

-- Create index for faster domain lookups
CREATE INDEX IF NOT EXISTS idx_clients_allowed_domains ON clients USING GIN (allowed_domains);