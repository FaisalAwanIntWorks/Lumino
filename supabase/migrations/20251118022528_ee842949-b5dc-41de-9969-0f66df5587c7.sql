-- Add address fields to clients table for sub-account display
ALTER TABLE public.clients 
ADD COLUMN IF NOT EXISTS address_line1 text,
ADD COLUMN IF NOT EXISTS address_line2 text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS state text,
ADD COLUMN IF NOT EXISTS postal_code text,
ADD COLUMN IF NOT EXISTS country text DEFAULT 'US';

-- Add index for searching by address
CREATE INDEX IF NOT EXISTS idx_clients_address ON public.clients(city, state);

-- Add comment explaining address usage
COMMENT ON COLUMN public.clients.address_line1 IS 'Primary address line for client business location';
COMMENT ON COLUMN public.clients.city IS 'City for client business location';