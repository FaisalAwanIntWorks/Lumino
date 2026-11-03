-- Remove insecure plaintext password storage from staff tables
-- Passwords are managed securely by Supabase Auth, not stored in application tables

-- Drop password column from staff_members
ALTER TABLE staff_members DROP COLUMN IF EXISTS password;

-- Drop password column from admin_staff_members  
ALTER TABLE admin_staff_members DROP COLUMN IF EXISTS password;

-- Add comments explaining why passwords are not stored here
COMMENT ON TABLE staff_members IS 'Staff member records. Passwords are managed securely by Supabase Auth, not stored in this table.';
COMMENT ON TABLE admin_staff_members IS 'Admin staff records. Passwords are managed securely by Supabase Auth, not stored in this table.';