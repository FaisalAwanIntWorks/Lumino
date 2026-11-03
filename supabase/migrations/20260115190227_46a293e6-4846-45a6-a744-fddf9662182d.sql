-- Add password_plain field to clients table for admin reference
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS password_plain TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.clients.password_plain IS 'Plain text password stored for admin reference during client creation';