-- Ring OS — hot-path composite indexes (Sections B3 + recommended index list).
-- Each index covers a query that is currently a table scan as the table grows.

-- B3: client_ring_form_questions lookup is always
--   WHERE client_id = ? AND is_enabled = true ORDER BY display_order
CREATE INDEX IF NOT EXISTS idx_ring_questions_lookup
  ON client_ring_form_questions(client_id, is_enabled, display_order);

-- Form-load: pull config row by client.
CREATE INDEX IF NOT EXISTS idx_ring_form_config_client
  ON client_ring_form_config(client_id);

-- Admin lead listing (latest leads per client).
CREATE INDEX IF NOT EXISTS idx_design_requests_client_created
  ON design_requests(client_id, created_at DESC);

-- AI preview lookup by lead, newest first.
CREATE INDEX IF NOT EXISTS idx_ring_preview_images_lead
  ON ring_preview_images(lead_id, created_at DESC);

-- Analytics dashboard query: events for a client over a recent date window.
-- Matches the WHERE client_id = ? AND created_at >= ? ORDER BY created_at pattern
-- used in src/lib/analytics-utils.ts::getAnalyticsData.
CREATE INDEX IF NOT EXISTS idx_analytics_events_client_time
  ON analytics_events(client_id, created_at DESC);
