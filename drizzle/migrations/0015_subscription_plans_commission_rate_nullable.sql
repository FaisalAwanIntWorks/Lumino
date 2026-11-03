-- Fix: "null value in column commission_rate of relation subscription_plans
-- violates not-null constraint" when creating a plan from the admin
-- Subscription Plan Manager.
--
-- Commission is no longer a product concept, so make the leftover column
-- harmless: nullable with a default of 0. Idempotent; safe if the column
-- was already dropped.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscription_plans'
      AND column_name = 'commission_rate'
  ) THEN
    ALTER TABLE public.subscription_plans
      ALTER COLUMN commission_rate DROP NOT NULL,
      ALTER COLUMN commission_rate SET DEFAULT 0;
  END IF;
END $$;