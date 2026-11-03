ALTER TABLE public.client_ghl_integrations
  ADD COLUMN IF NOT EXISTS allow_duplicate_opportunities boolean NOT NULL DEFAULT false;

UPDATE public.client_ghl_integrations
   SET allow_duplicate_opportunities = true
 WHERE form_type = 'ring_request';