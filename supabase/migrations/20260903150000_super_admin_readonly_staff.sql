-- ============================================================================
-- Super Admin vs. read-only Admin Staff
-- ----------------------------------------------------------------------------
-- Only three people are super admins (Faisal, Vikram, GSK). Every other
-- agency_admin is admin *staff*: they may read every screen but must not be
-- able to insert, update or delete anything, anywhere.
--
-- Enforcement is additive and fully reversible: we never rewrite an existing
-- policy, we only add RESTRICTIVE policies (which AND with everything else)
-- so a read-only admin fails every write. Clients, client staff and anonymous
-- widget traffic are unaffected, because the guard function returns TRUE for
-- anyone who is not a read-only agency admin.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Flag column
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_staff_members
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.admin_staff_members.is_super_admin IS
  'TRUE = full read/write platform owner. FALSE = read-only admin staff.';

CREATE INDEX IF NOT EXISTS idx_admin_staff_members_super_admin
  ON public.admin_staff_members (user_id) WHERE is_super_admin;

-- ---------------------------------------------------------------------------
-- 2. Seed the three super admins
--    Matched case-insensitively on email. If an account exists in auth.users
--    but has no admin_staff_members row yet, the row is created.
-- ---------------------------------------------------------------------------
DO $seed$
DECLARE
  super_emails TEXT[] := ARRAY[
    'faisala@wavesmvmnt.com',
    'vikramk@wavesmvmnt.com',
    'gskinot@wavesmvmnt.com'
  ];
  em       TEXT;
  au_id    UUID;
  au_email TEXT;
  promoted INT := 0;
BEGIN
  FOREACH em IN ARRAY super_emails LOOP
    -- Promote an existing admin staff row.
    UPDATE public.admin_staff_members
       SET is_super_admin = true,
           status         = 'active',
           updated_at     = now()
     WHERE lower(email) = lower(em);

    IF FOUND THEN
      promoted := promoted + 1;
      CONTINUE;
    END IF;

    -- No staff row yet: create one from the auth account if it exists.
    SELECT id, email INTO au_id, au_email
      FROM auth.users WHERE lower(email) = lower(em) LIMIT 1;

    IF au_id IS NOT NULL THEN
      INSERT INTO public.admin_staff_members (user_id, name, email, status, is_super_admin)
      VALUES (au_id, split_part(au_email, '@', 1), au_email, 'active', true);

      INSERT INTO public.user_roles (user_id, role)
      VALUES (au_id, 'agency_admin')
      ON CONFLICT DO NOTHING;

      promoted := promoted + 1;
    ELSE
      RAISE WARNING 'Super admin seed: no account found for %', em;
    END IF;
  END LOOP;

  -- Refuse to lock the whole platform out of write access.
  IF promoted = 0 THEN
    RAISE WARNING 'Super admin seed matched 0 accounts (fresh database) - create a super admin manually.';
  END IF;

  RAISE NOTICE 'Super admin seed: % of % accounts flagged.', promoted, array_length(super_emails, 1);
END
$seed$;

-- ---------------------------------------------------------------------------
-- 3. Guard functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_staff_members
     WHERE user_id = _user_id
       AND is_super_admin
       AND status = 'active'
  );
$fn$;

COMMENT ON FUNCTION public.is_super_admin(UUID) IS
  'TRUE when the user is one of the platform owners (full read/write).';

CREATE OR REPLACE FUNCTION public.is_readonly_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT _user_id IS NOT NULL
     AND public.has_role(_user_id, 'agency_admin'::public.app_role)
     AND NOT public.is_super_admin(_user_id);
$fn$;

COMMENT ON FUNCTION public.is_readonly_admin(UUID) IS
  'TRUE when the user is agency admin staff without super admin rights (view only).';

-- The value actually referenced by RLS. TRUE for everyone except read-only
-- admin staff, so clients / client staff / anon widget traffic are untouched.
--
-- RLS evaluates this per row, and bulk imports insert tens of thousands of
-- rows per statement, so the answer is memoised for the duration of the
-- transaction. set_config(..., is_local => true) is transaction scoped, which
-- matters because PostgREST reuses pooled connections across users - a
-- session-scoped cache would leak one user's answer to the next.
CREATE OR REPLACE FUNCTION public.admin_write_allowed()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  cached  TEXT;
  allowed BOOLEAN;
BEGIN
  cached := current_setting('jewlx.admin_write_allowed', true);
  IF cached IS NOT NULL AND cached <> '' THEN
    RETURN cached = 't';
  END IF;

  allowed := NOT public.is_readonly_admin(auth.uid());

  PERFORM set_config(
    'jewlx.admin_write_allowed',
    CASE WHEN allowed THEN 't' ELSE 'f' END,
    true  -- transaction local
  );

  RETURN allowed;
END;
$fn$;

COMMENT ON FUNCTION public.admin_write_allowed() IS
  'RLS guard: FALSE only for read-only admin staff. Used by the jewlx_readonly_admin_* restrictive policies.';

GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_readonly_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_write_allowed()   TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4. Restrictive write policies on every RLS-enabled table in public
-- ---------------------------------------------------------------------------
DO $policies$
DECLARE
  t        RECORD;
  n_tables INT := 0;
  -- Append-only trails. A read-only admin still has to be able to record that
  -- they logged in and which client account they looked at, otherwise the
  -- audit history goes blank exactly for the accounts we want to watch.
  -- DELETE stays blocked on these, so the trail cannot be erased.
  audit_insert_ok TEXT[] := ARRAY[
    'admin_activity_logs',
    'audit_logs',
    'client_activity_logs',
    'impersonation_sessions',
    'analytics_events'
  ];
  -- Closing an impersonation session stamps ended_at on the same row, and
  -- marking your own notification read is UI state, not data manipulation.
  audit_update_ok TEXT[] := ARRAY[
    'impersonation_sessions',
    'admin_notifications'
  ];
BEGIN
  FOR t IN
    SELECT c.oid::regclass AS tbl, c.relname AS name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relrowsecurity
     ORDER BY 1
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'jewlx_readonly_admin_no_insert', t.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'jewlx_readonly_admin_no_update', t.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', 'jewlx_readonly_admin_no_delete', t.tbl);

    IF NOT (t.name = ANY (audit_insert_ok)) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %s AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.admin_write_allowed())',
        'jewlx_readonly_admin_no_insert', t.tbl);
    END IF;

    IF NOT (t.name = ANY (audit_update_ok)) THEN
      EXECUTE format(
        'CREATE POLICY %I ON %s AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.admin_write_allowed()) WITH CHECK (public.admin_write_allowed())',
        'jewlx_readonly_admin_no_update', t.tbl);
    END IF;

    EXECUTE format(
      'CREATE POLICY %I ON %s AS RESTRICTIVE FOR DELETE TO authenticated USING (public.admin_write_allowed())',
      'jewlx_readonly_admin_no_delete', t.tbl);

    n_tables := n_tables + 1;
  END LOOP;

  RAISE NOTICE 'Read-only admin write guard applied to % tables.', n_tables;
END
$policies$;

-- Storage objects (file upload / delete) get the same guard. Wrapped so the
-- migration still succeeds if the role cannot create policies on storage.
DO $storage$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS jewlx_readonly_admin_no_insert ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS jewlx_readonly_admin_no_update ON storage.objects';
  EXECUTE 'DROP POLICY IF EXISTS jewlx_readonly_admin_no_delete ON storage.objects';

  EXECUTE 'CREATE POLICY jewlx_readonly_admin_no_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (public.admin_write_allowed())';
  EXECUTE 'CREATE POLICY jewlx_readonly_admin_no_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING (public.admin_write_allowed()) WITH CHECK (public.admin_write_allowed())';
  EXECUTE 'CREATE POLICY jewlx_readonly_admin_no_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING (public.admin_write_allowed())';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE WARNING 'Could not add read-only admin guard to storage.objects (insufficient privilege).';
END
$storage$;

-- ---------------------------------------------------------------------------
-- 5. Protect the super admin set itself
--    Never allow the last active super admin to be demoted, deactivated or
--    deleted - that would leave the platform with no write access at all.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_last_super_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  remaining INT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT (OLD.is_super_admin AND OLD.status = 'active') THEN
      RETURN OLD;
    END IF;
  ELSE
    -- Still an active super admin after the update: nothing to check.
    IF NEW.is_super_admin AND NEW.status = 'active' THEN
      RETURN NEW;
    END IF;
    IF NOT (OLD.is_super_admin AND OLD.status = 'active') THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT count(*) INTO remaining
    FROM public.admin_staff_members
   WHERE is_super_admin
     AND status = 'active'
     AND id <> OLD.id;

  IF remaining = 0 THEN
    RAISE EXCEPTION 'Cannot remove the last active super admin.';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_protect_last_super_admin ON public.admin_staff_members;
CREATE TRIGGER trg_protect_last_super_admin
  BEFORE UPDATE OR DELETE ON public.admin_staff_members
  FOR EACH ROW EXECUTE FUNCTION public.protect_last_super_admin();

-- ---------------------------------------------------------------------------
-- ROLLBACK (run manually if ever needed)
-- ---------------------------------------------------------------------------
-- DO $$ DECLARE t RECORD; BEGIN
--   FOR t IN SELECT c.oid::regclass AS tbl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--            WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity LOOP
--     EXECUTE format('DROP POLICY IF EXISTS jewlx_readonly_admin_no_insert ON %s', t.tbl);
--     EXECUTE format('DROP POLICY IF EXISTS jewlx_readonly_admin_no_update ON %s', t.tbl);
--     EXECUTE format('DROP POLICY IF EXISTS jewlx_readonly_admin_no_delete ON %s', t.tbl);
--   END LOOP; END $$;
--
-- To add / fix a super admin later:
--   UPDATE public.admin_staff_members SET is_super_admin = true WHERE lower(email) = lower('someone@wavesmvmnt.com');
