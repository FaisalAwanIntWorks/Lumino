-- Bridge: live-schema columns of ring_configured_by_client missing from the migration history.
ALTER TABLE public.ring_configured_by_client
  ADD COLUMN IF NOT EXISTS combination_id TEXT,
  ADD COLUMN IF NOT EXISTS product_name TEXT,
  ADD COLUMN IF NOT EXISTS engraving_enabled BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_custom_pricing BOOLEAN,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC;


-- Update folder_path: replace 'unknown-1' with 'tapered'
UPDATE public.my_master_db_data
SET folder_path = REPLACE(folder_path, 'unknown-1', 'tapered')
WHERE folder_path LIKE '%unknown-1%';

-- Update combination_id: replace 'unknown-1' with 'tapered'
UPDATE public.my_master_db_data
SET combination_id = REPLACE(combination_id, 'unknown-1', 'tapered')
WHERE combination_id LIKE '%unknown-1%';

-- Update shank_id: replace 'unknown-1' with 'tapered'
UPDATE public.my_master_db_data
SET shank_id = 'tapered'
WHERE shank_id = 'unknown-1';

-- Update shank_name: replace 'Unknown 1' with 'Tapered'
UPDATE public.my_master_db_data
SET shank_name = 'Tapered'
WHERE shank_name = 'Unknown 1';

-- Update product_name: replace 'Unknown 1' with 'Tapered'
UPDATE public.my_master_db_data
SET product_name = REPLACE(product_name, 'Unknown 1', 'Tapered')
WHERE product_name LIKE '%Unknown 1%';

-- Also update ring_configured_by_client table
UPDATE public.ring_configured_by_client
SET shank_id = 'tapered'
WHERE shank_id = 'unknown-1';

UPDATE public.ring_configured_by_client
SET shank_name = 'Tapered'
WHERE shank_name = 'Unknown 1';

UPDATE public.ring_configured_by_client
SET combination_id = REPLACE(combination_id, 'unknown-1', 'tapered')
WHERE combination_id LIKE '%unknown-1%';

UPDATE public.ring_configured_by_client
SET product_name = REPLACE(product_name, 'Unknown 1', 'Tapered')
WHERE product_name LIKE '%Unknown 1%';
