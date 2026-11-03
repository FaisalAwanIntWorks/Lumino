ALTER TABLE public.cad_requests
  ADD COLUMN IF NOT EXISTS grillz_type text,
  ADD COLUMN IF NOT EXISTS top_teeth text,
  ADD COLUMN IF NOT EXISTS bottom_teeth text,
  ADD COLUMN IF NOT EXISTS metal_purity text,
  ADD COLUMN IF NOT EXISTS jewelry_type text,
  ADD COLUMN IF NOT EXISTS setting text,
  ADD COLUMN IF NOT EXISTS band text,
  ADD COLUMN IF NOT EXISTS budget text,
  ADD COLUMN IF NOT EXISTS timeline text;