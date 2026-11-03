-- ============================================================
-- §2: Compound indexes for every table polled every 45 s.
--     Pattern: WHERE client_id = X ORDER BY created_at DESC
--     Without these, every poll = sort spill / full scan.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_saved_designs_client_created
  ON public.saved_designs (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_grill_form_leads_client_created
  ON public.grill_form_leads (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_custom_enquiry_leads_client_created
  ON public.custom_enquiry_leads (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_design_requests_client_created
  ON public.design_requests (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointment_bookings_client_created
  ON public.appointment_bookings (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_appointment_bookings_client_preferred
  ON public.appointment_bookings (client_id, preferred_date);

CREATE INDEX IF NOT EXISTS idx_metal_buying_leads_client_created
  ON public.metal_buying_leads (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_diamond_form_leads_client_created
  ON public.diamond_form_leads (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_chat_sessions_client_started
  ON public.ai_chat_sessions (client_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_cad_requests_client_created
  ON public.cad_requests (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cad_requests_client_status
  ON public.cad_requests (client_id, status);

CREATE INDEX IF NOT EXISTS idx_cad_request_messages_request_created
  ON public.cad_request_messages (cad_request_id, created_at);

CREATE INDEX IF NOT EXISTS idx_cad_resize_requests_client_created
  ON public.cad_resize_requests (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cad_resize_requests_order
  ON public.cad_resize_requests (order_id);

CREATE INDEX IF NOT EXISTS idx_orders_client_created
  ON public.orders (client_id, created_at DESC);

-- Refresh planner statistics for all affected tables
ANALYZE public.saved_designs;
ANALYZE public.grill_form_leads;
ANALYZE public.custom_enquiry_leads;
ANALYZE public.design_requests;
ANALYZE public.appointment_bookings;
ANALYZE public.metal_buying_leads;
ANALYZE public.diamond_form_leads;
ANALYZE public.ai_chat_sessions;
ANALYZE public.cad_requests;
ANALYZE public.cad_request_messages;
ANALYZE public.cad_resize_requests;
ANALYZE public.orders;
