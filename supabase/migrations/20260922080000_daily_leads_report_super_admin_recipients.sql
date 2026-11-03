-- =====================================================================
-- Daily Leads Report: make sure every JewlX super admin is flagged.
--
-- The 2026-09-22 00:00 UTC run went to faisala@ only: the other two super
-- admins had no active is_super_admin row in admin_staff_members. Flag the
-- rows that exist (same three emails as the 2026-09-03 seed). The edge
-- function now also carries this list as a fallback, so this only keeps the
-- table honest. Nothing else is changed.
-- =====================================================================
UPDATE public.admin_staff_members
   SET is_super_admin = true,
       status         = 'active',
       updated_at     = now()
 WHERE lower(email) IN (
   'faisala@wavesmvmnt.com',
   'vikramk@wavesmvmnt.com',
   'gskinot@wavesmvmnt.com'
 );
