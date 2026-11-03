-- CustomX (Grillz + Custom Enquiry) hot-path indexes (J14).
-- Covers the most common query patterns in the embed forms and admin dashboard.

-- AI preview lookups by lead (used in feedback updates — K8 fix adds lead_id filter)
CREATE INDEX IF NOT EXISTS idx_grill_preview_images_lead
  ON grill_preview_images(lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_custom_enquiry_preview_images_lead
  ON custom_enquiry_preview_images(lead_id, created_at DESC);

-- Config loading: always WHERE client_id = ? (lookup one row per client)
CREATE INDEX IF NOT EXISTS idx_grill_questions_lookup
  ON client_grill_questions(client_id, is_enabled, display_order);

CREATE INDEX IF NOT EXISTS idx_custom_enquiry_questions_lookup
  ON client_custom_enquiry_questions(client_id, is_enabled, display_order);

-- J2: unique constraint on (client_id, question_key) enables upsert without delete-all.
-- Added as a constraint (not just an index) so Supabase upsert ON CONFLICT works.
ALTER TABLE client_custom_enquiry_questions
  DROP CONSTRAINT IF EXISTS uq_custom_enquiry_questions_client_key;
ALTER TABLE client_custom_enquiry_questions
  ADD CONSTRAINT uq_custom_enquiry_questions_client_key
  UNIQUE (client_id, question_key);

-- Notification preferences lookup (J11 — one check per email send)
CREATE INDEX IF NOT EXISTS idx_client_notif_prefs_lookup
  ON client_notification_preferences(client_id, notification_type);
