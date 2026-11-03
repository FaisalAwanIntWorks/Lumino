
UPDATE public.lookup_visual_colors
SET color_name = 'White Gold'
WHERE color_id = 'white';

INSERT INTO public.lookup_visual_colors (color_id, color_name, color_hex, display_order, is_active)
VALUES
  ('platinum', 'Platinum', '#E5E4E2', 4, true),
  ('silver',   'Silver',   '#C0C0C0', 5, true)
ON CONFLICT (color_id) DO UPDATE
  SET color_name = EXCLUDED.color_name,
      color_hex = EXCLUDED.color_hex,
      display_order = EXCLUDED.display_order,
      is_active = true;
