UPDATE public.client_onboarding_preferences
SET selected_shanks = ARRAY(
  SELECT shank_id
  FROM unnest(selected_shanks) AS shank_id
  WHERE shank_id NOT IN ('unknown-2', 'unknown-3')
)
WHERE selected_shanks && ARRAY['unknown-2', 'unknown-3'];

DELETE FROM public.client_option_prices
WHERE option_type = 'shanks'
  AND option_id IN ('unknown-2', 'unknown-3');