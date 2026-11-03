-- Per-option enable/disable flags for Grillz Builder card steps
-- (Extended Fangs / Open Faced). Shape: { "<step_key>": { "<option_value>": false } }
-- Absent flag = enabled, so existing clients are unaffected.
ALTER TABLE public.client_grill_config
  ADD COLUMN IF NOT EXISTS enabled_options jsonb;
