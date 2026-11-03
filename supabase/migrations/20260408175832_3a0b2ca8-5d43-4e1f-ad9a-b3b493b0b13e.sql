
-- Step 1: Delete all existing rows from ring_metal_options
DELETE FROM public.ring_metal_options;

-- Step 2: Insert the 6 new simplified options
INSERT INTO public.ring_metal_options (option_value, name, price, display_order) VALUES
  ('yellow-gold', 'Yellow Gold', 0, 1),
  ('rose-gold', 'Rose Gold', 0, 2),
  ('white-gold', 'White Gold', 0, 3),
  ('platinum', 'Platinum', 0, 4),
  ('silver', 'Silver', 0, 5),
  ('two-tone', 'Two Tone', 0, 6);

-- Step 3: Update all client_ring_form_config rows to use the new 6 metal options
UPDATE public.client_ring_form_config
SET step_options = jsonb_set(
  COALESCE(step_options, '{}'::jsonb),
  '{metal}',
  '["yellow-gold","rose-gold","white-gold","platinum","silver","two-tone"]'::jsonb
),
updated_at = now();
