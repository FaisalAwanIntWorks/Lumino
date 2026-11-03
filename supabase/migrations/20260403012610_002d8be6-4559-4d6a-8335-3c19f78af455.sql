ALTER TABLE public.metal_buying_leads 
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS country_iso text;