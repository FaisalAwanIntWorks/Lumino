-- Create private bucket for daily DB backups
INSERT INTO storage.buckets (id, name, public)
VALUES ('jewlx-backups', 'jewlx-backups', false)
ON CONFLICT (id) DO NOTHING;

-- Helper RPC to list all public tables (used by backup function)
CREATE OR REPLACE FUNCTION public.list_public_tables()
RETURNS TABLE(table_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
  SELECT c.relname::text AS table_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
  ORDER BY c.relname;
$$;