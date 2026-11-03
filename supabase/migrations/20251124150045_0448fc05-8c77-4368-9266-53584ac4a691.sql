-- Enable pgcrypto extension for encryption/decryption
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Verify the extension is enabled
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    RAISE EXCEPTION 'pgcrypto extension failed to enable';
  END IF;
END $$;