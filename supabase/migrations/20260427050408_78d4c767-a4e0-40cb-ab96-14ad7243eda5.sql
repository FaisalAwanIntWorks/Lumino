CREATE INDEX IF NOT EXISTS idx_grill_preview_images_lead
  ON grill_preview_images(lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_custom_enquiry_preview_images_lead
  ON custom_enquiry_preview_images(lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_grill_questions_lookup
  ON client_grill_questions(client_id, is_enabled, display_order);

CREATE INDEX IF NOT EXISTS idx_custom_enquiry_questions_lookup
  ON client_custom_enquiry_questions(client_id, is_enabled, display_order);

-- Deduplicate any existing rows that would violate the unique constraint, keeping the most recent
DELETE FROM client_custom_enquiry_questions a
USING client_custom_enquiry_questions b
WHERE a.client_id = b.client_id
  AND a.question_key = b.question_key
  AND a.created_at < b.created_at;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_custom_enquiry_questions_client_key'
  ) THEN
    ALTER TABLE client_custom_enquiry_questions
      ADD CONSTRAINT uq_custom_enquiry_questions_client_key
      UNIQUE (client_id, question_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_client_notif_prefs_lookup
  ON client_notification_preferences(client_id, notification_type);