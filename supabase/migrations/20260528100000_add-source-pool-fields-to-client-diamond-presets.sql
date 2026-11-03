-- Add source_pool_id and report_no to client_diamond_presets so every
-- pool-derived preset row carries the exact physical diamond identity.
-- These two columns are the key that makes report_no lookup 100% accurate.

ALTER TABLE public.client_diamond_presets
  ADD COLUMN IF NOT EXISTS source_pool_id uuid
    REFERENCES public.diamond_inventory_pool(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS report_no text;

CREATE INDEX IF NOT EXISTS idx_client_diamond_presets_source_pool_id
  ON public.client_diamond_presets(source_pool_id)
  WHERE source_pool_id IS NOT NULL;
