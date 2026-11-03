-- Make plan_id optional so clients don't need a plan to access the platform
ALTER TABLE public.clients ALTER COLUMN plan_id DROP NOT NULL;

-- (Removed: seeded a test admin with a hard-coded password.)
