-- ── Orders: let status hold the client's own status tags ──────────────────
-- orders.status was created with
--   CHECK (status IN ('pending', 'fulfilled', 'refunded', 'canceled'))
-- but the client "Orders & Deposits" page (and the per-client status tags in
-- client_status_tags) use pending / processing / completed / cancelled plus
-- any custom tag the client adds. Every change to one of those values failed
-- the check, which the UI surfaced only as "Failed to update status".
--
-- Status is a free-text tag everywhere else in the app (leads, CAD requests),
-- so the constraint is dropped rather than widened. Revenue RPCs already treat
-- refunded / canceled / cancelled (any case) as excluded.
DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid
       AND a.attnum = ANY (c.conkey)
     WHERE c.conrelid = 'public.orders'::regclass
       AND c.contype  = 'c'
       AND a.attname  = 'status'
       AND array_length(c.conkey, 1) = 1
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', con.conname);
    RAISE NOTICE 'Dropped orders status check constraint %', con.conname;
  END LOOP;
END
$$;
