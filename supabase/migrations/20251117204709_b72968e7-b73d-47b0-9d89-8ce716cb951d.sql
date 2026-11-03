-- Remove the hard-coded test admin (admin@jewlx.com) created by an earlier seed migration.
-- (Original statements referenced a user that only existed in the source project's database.)
DELETE FROM public.user_roles
WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'admin@jewlx.com');
DELETE FROM auth.users WHERE email = 'admin@jewlx.com';
