-- Backfill per-metal refinery_sell_pct into metals_config JSONB
-- Preserves existing client behavior exactly by deriving silver/platinum from the legacy top-level value
UPDATE public.client_metal_buying_config
SET metals_config = jsonb_set(
  jsonb_set(
    jsonb_set(
      COALESCE(metals_config, '{}'::jsonb),
      '{gold,refinery_sell_pct}',
      to_jsonb(COALESCE(refinery_sell_pct, 99)),
      true
    ),
    '{silver,refinery_sell_pct}',
    to_jsonb(GREATEST(80, LEAST(98, COALESCE(refinery_sell_pct, 99) - 7))),
    true
  ),
  '{platinum,refinery_sell_pct}',
  to_jsonb(GREATEST(80, LEAST(98, COALESCE(refinery_sell_pct, 99) - 4))),
  true
)
WHERE metals_config IS NOT NULL
  AND (
    NOT (metals_config -> 'gold' ? 'refinery_sell_pct')
    OR NOT (metals_config -> 'silver' ? 'refinery_sell_pct')
    OR NOT (metals_config -> 'platinum' ? 'refinery_sell_pct')
  );