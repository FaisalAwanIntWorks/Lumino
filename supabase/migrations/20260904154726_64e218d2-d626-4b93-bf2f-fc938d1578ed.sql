-- Quote Estimator (DTT form): store the karat / purity variant chosen for the
-- ring metal (e.g. 14k, 18k, pt950, 925-sterling). The variant list and its
-- per-client prices live in client_dtt_form_config.form_content.metalKarats.
ALTER TABLE public.diamond_form_leads
  ADD COLUMN IF NOT EXISTS diamond_metal_karat text;

COMMENT ON COLUMN public.diamond_form_leads.diamond_metal_karat IS
  'Karat / purity variant of diamond_metal chosen in the Quote Estimator form (e.g. 14k, 18k, pt950, 925-sterling).';

-- Quote Estimator (DTT form): for Two Tone rings, store which two metals the
-- customer combined (e.g. yellow-white, rose-platinum). The combination list
-- and its per-client prices live in client_dtt_form_config.form_content.twoToneCombos.
ALTER TABLE public.diamond_form_leads
  ADD COLUMN IF NOT EXISTS diamond_two_tone_metals text;

COMMENT ON COLUMN public.diamond_form_leads.diamond_two_tone_metals IS
  'Two Tone metal combination chosen in the Quote Estimator form (e.g. yellow-white, rose-platinum).';