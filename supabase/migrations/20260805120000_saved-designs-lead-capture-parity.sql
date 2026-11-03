-- ── saved_designs: let lead capture work for non-"active" clients ────────────
--
-- Problem
-- -------
-- Every lead surface on the platform accepts an anonymous insert from the
-- public widget/form:
--
--   diamond_form_leads    (Quote Estimator)   → WITH CHECK (true)
--   grill_form_leads      (Grillz Builder)    → WITH CHECK (true)
--   custom_enquiry_leads  (CustomX)           → WITH CHECK (true)
--   metal_buying_leads    (Metal IQ)          → WITH CHECK (true)
--   design_requests       (Ring OS request)   → WITH CHECK (true)
--   appointment_bookings  (Bookings)          → WITH CHECK (true)
--
-- saved_designs is the single exception: its anon INSERT policy additionally
-- requires is_client_active(client_id), i.e. clients.status = 'active'. Any
-- client on 'trial', 'paused', 'CRM - Trial', … therefore silently loses every
-- Ring OS lead — both the widget's "Save" action and the No-Deposit request
-- form fail with 42501 "new row violates row-level security policy".
--
-- clients.status legitimately carries many non-'active' values (see
-- clients_status_check), so gating lead capture on it was never the intent.
--
-- Fix
-- ---
-- Keep the anti-spam validation that actually matters — the client_id must
-- resolve to a real client row, and name/email must be present and bounded —
-- but stop rejecting perfectly valid clients because of their billing status.
-- This is still stricter than every other lead table above.
--
-- Nothing else changes: anon still cannot SELECT / UPDATE / DELETE
-- saved_designs (the RESTRICTIVE policies from 20260126115353 stay in force),
-- and is_client_active() itself is left untouched for any future caller.

-- Client-existence check for the anon role, which cannot read public.clients.
CREATE OR REPLACE FUNCTION public.client_exists(p_client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM clients WHERE id = p_client_id
  );
$$;

COMMENT ON FUNCTION public.client_exists(UUID) IS
  'True when the client id resolves to a real client row, regardless of billing status. Used by anonymous lead-capture RLS policies.';

DROP POLICY IF EXISTS "Anon can insert leads for valid clients" ON public.saved_designs;

CREATE POLICY "Anon can insert leads for valid clients"
ON public.saved_designs
FOR INSERT
TO anon
WITH CHECK (
  client_exists(client_id)
  AND customer_name IS NOT NULL
  AND customer_email IS NOT NULL
  AND length(customer_name) <= 200
  AND length(customer_email) <= 255
);
