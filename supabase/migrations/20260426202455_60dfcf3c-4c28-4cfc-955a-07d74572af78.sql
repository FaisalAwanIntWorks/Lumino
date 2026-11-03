-- Section Q (completion) + N5: remaining hot-path indexes, dead column cleanup,
-- and a non-destructive unified view across all form lead tables.

CREATE INDEX IF NOT EXISTS idx_grill_config_client
  ON client_grill_config(client_id);

CREATE INDEX IF NOT EXISTS idx_enquiry_config_client
  ON client_custom_enquiry_config(client_id);

CREATE INDEX IF NOT EXISTS idx_grill_leads_client_created
  ON grill_form_leads(client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_enquiry_leads_client_created
  ON custom_enquiry_leads(client_id, created_at DESC);

ALTER TABLE client_custom_enquiry_config
  DROP COLUMN IF EXISTS back_options;

CREATE OR REPLACE VIEW form_leads_unified AS
  SELECT
    'ring'                           AS form_type,
    id,
    client_id,
    created_at,
    customer_name,
    customer_email,
    customer_phone,
    jsonb_build_object(
      'preferred_metal', preferred_metal,
      'preferred_stone', preferred_stone,
      'budget',          budget_range,
      'timeline',        timeline,
      'request_type',    request_type
    )                                AS form_payload
  FROM design_requests

  UNION ALL

  SELECT
    'grillz'                         AS form_type,
    id,
    client_id,
    created_at,
    customer_name,
    customer_email,
    customer_phone,
    jsonb_build_object(
      'metal_type',   metal_type,
      'metal_purity', metal_purity,
      'grillz_type',  grillz_type,
      'budget',       budget,
      'top_teeth',    top_teeth,
      'bottom_teeth', bottom_teeth
    )                                AS form_payload
  FROM grill_form_leads

  UNION ALL

  SELECT
    'enquiry'                        AS form_type,
    id,
    client_id,
    created_at,
    customer_name,
    customer_email,
    customer_phone,
    jsonb_build_object(
      'jewelry_type',    jewelry_type,
      'gold_color',      gold_color,
      'karat',           karat,
      'budget',          budget,
      'diamond_quality', diamond_quality,
      'diamond_setup',   diamond_setup
    )                                AS form_payload
  FROM custom_enquiry_leads;

COMMENT ON VIEW form_leads_unified IS
  'N5: Read-only unified view across ring / grillz / enquiry lead tables. Use form_payload JSONB for form-specific fields. Do not write through this view.';