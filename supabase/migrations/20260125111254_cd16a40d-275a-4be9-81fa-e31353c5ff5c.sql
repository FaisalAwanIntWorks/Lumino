-- Remove plaintext password storage from tables
-- These passwords are redundant since users authenticate via Supabase Auth

-- Drop password column from staff_members (passwords are now shown one-time on creation)
ALTER TABLE public.staff_members DROP COLUMN IF EXISTS password;

-- Drop password column from admin_staff_members
ALTER TABLE public.admin_staff_members DROP COLUMN IF EXISTS password;

-- Drop password_plain column from clients
ALTER TABLE public.clients DROP COLUMN IF EXISTS password_plain;