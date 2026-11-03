ALTER TABLE public.cad_requests
  ADD COLUMN IF NOT EXISTS center_stone_specs text,
  ADD COLUMN IF NOT EXISTS halo_pave_layout text,
  ADD COLUMN IF NOT EXISTS shank_width text,
  ADD COLUMN IF NOT EXISTS gallery_comfort text,
  ADD COLUMN IF NOT EXISTS length_width text,
  ADD COLUMN IF NOT EXISTS clasp_bail_details text,
  ADD COLUMN IF NOT EXISTS chain_link_style text,
  ADD COLUMN IF NOT EXISTS engraving_text text,
  ADD COLUMN IF NOT EXISTS dental_impression_type text,
  ADD COLUMN IF NOT EXISTS tooth_coverage text,
  ADD COLUMN IF NOT EXISTS pattern_design text;