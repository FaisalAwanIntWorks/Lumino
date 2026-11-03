-- Drop the FK column on client_ring_catalog (no longer used; my_master_db_data is the source of truth)
ALTER TABLE public.client_ring_catalog
  DROP COLUMN IF EXISTS master_variant_id;

-- Drop the deprecated master_ring_variants table
DROP TABLE IF EXISTS public.master_ring_variants CASCADE;