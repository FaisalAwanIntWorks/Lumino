-- Copied from drizzle/migrations/0030_metal_iq_volume_tiers.sql (applied directly to the source database, missing from supabase/migrations).
ALTER TABLE public.client_metal_buying_config ADD COLUMN IF NOT EXISTS volume_tier_config jsonb;
COMMENT ON COLUMN public.client_metal_buying_config.volume_tier_config IS 'Opt-in Metal IQ volume tiers: {enabled, tiers:[{min_grams,bonus_pct}], bullion_24k_pct, bullion_24k_min_oz}. NULL/disabled = legacy pricing.';
ALTER TABLE public.metal_buying_leads ADD COLUMN IF NOT EXISTS items jsonb;
COMMENT ON COLUMN public.metal_buying_leads.items IS 'Multi-piece submissions: per-line breakdown [{metal,karat,weightGrams,buyPct,offer}]. NULL for single-piece leads.';