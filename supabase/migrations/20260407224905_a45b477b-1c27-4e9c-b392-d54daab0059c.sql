ALTER TABLE public.cad_requests
  ADD COLUMN IF NOT EXISTS jeweler_reference_source text,
  ADD COLUMN IF NOT EXISTS jeweler_reference_urls text[];