-- Copied from drizzle/migrations/0024_diamond_lead_quote_version.sql (applied directly to the source database, missing from supabase/migrations).
ALTER TABLE public.diamond_form_leads ADD COLUMN IF NOT EXISTS quote_version text CHECK (quote_version IN ('v1','v2'));
ALTER TABLE public.diamond_form_leads ADD COLUMN IF NOT EXISTS is_test_preview boolean NOT NULL DEFAULT false;
