-- F1: Ensure every new client immediately gets a default ring_form_config row so
-- the form never silently falls back to hardcoded USD defaults.

CREATE OR REPLACE FUNCTION create_default_ring_form_config()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO client_ring_form_config (
    client_id,
    onboarding_completed,
    submission_mode,
    ai_image_enabled
  )
  VALUES (NEW.id, false, 'contact', false)
  ON CONFLICT (client_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Drop first so re-running the migration is idempotent.
DROP TRIGGER IF EXISTS trg_new_client_ring_form_config ON clients;

CREATE TRIGGER trg_new_client_ring_form_config
  AFTER INSERT ON clients
  FOR EACH ROW
  EXECUTE FUNCTION create_default_ring_form_config();

-- Back-fill any existing clients that don't have a row yet.
INSERT INTO client_ring_form_config (client_id, onboarding_completed, submission_mode, ai_image_enabled)
SELECT id, false, 'contact', false
FROM clients
WHERE id NOT IN (SELECT client_id FROM client_ring_form_config WHERE client_id IS NOT NULL)
ON CONFLICT (client_id) DO NOTHING;
