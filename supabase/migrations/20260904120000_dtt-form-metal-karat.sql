-- Quote Estimator (DTT form): store the karat / purity variant chosen for the
-- ring metal (e.g. 14k, 18k, pt950, 925-sterling). The variant list and its
-- per-client prices live in client_dtt_form_config.form_content.metalKarats.
ALTER TABLE public.diamond_form_leads
  ADD COLUMN IF NOT EXISTS diamond_metal_karat text;

COMMENT ON COLUMN public.diamond_form_leads.diamond_metal_karat IS
  'Karat / purity variant of diamond_metal chosen in the Quote Estimator form (e.g. 14k, 18k, pt950, 925-sterling).';
