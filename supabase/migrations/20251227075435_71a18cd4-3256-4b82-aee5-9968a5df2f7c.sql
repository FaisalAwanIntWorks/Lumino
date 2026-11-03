-- Re-create idempotently (the constraint can already exist from the table definition).
ALTER TABLE public.client_ring_catalog DROP CONSTRAINT IF EXISTS client_ring_catalog_master_variant_id_fkey;
-- Add foreign key from client_ring_catalog to master_ring_variants
ALTER TABLE public.client_ring_catalog
ADD CONSTRAINT client_ring_catalog_master_variant_id_fkey
FOREIGN KEY (master_variant_id)
REFERENCES public.master_ring_variants(id)
ON DELETE CASCADE;