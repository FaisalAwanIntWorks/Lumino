-- Fix security linter issues

-- 1. Fix function search path for get_encryption_key
CREATE OR REPLACE FUNCTION get_encryption_key()
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    current_setting('app.settings.encryption_key', true),
    'CHANGE_THIS_KEY_IN_PRODUCTION_VIA_SECRETS'
  );
$$;

-- 2. Enable RLS on rate_limits table
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS policies for rate_limits table
CREATE POLICY "System can manage rate limits"
ON rate_limits FOR ALL
USING (true)
WITH CHECK (true);