-- Rebrand: replace the old JewlX name in user-visible data with Aurezo.
-- Case-sensitive on purpose: lowercase identifiers such as the `jewlx_agent`
-- feature key, storage paths (jewlx3updatedtransparentimages) and cron job
-- names (weekly-jewlx-db-backup) are internal keys and stay unchanged.
-- None of these tables have UPDATE triggers, so no side effects fire.

UPDATE public.agencies
SET name = regexp_replace(name, 'JewlX|JewelX|Jewlx|JEWLX', 'Aurezo', 'g')
WHERE name ~ 'JewlX|JewelX|Jewlx|JEWLX';

UPDATE public.subscription_plans
SET name = regexp_replace(name, 'JewlX|JewelX|Jewlx|JEWLX', 'Aurezo', 'g')
WHERE name ~ 'JewlX|JewelX|Jewlx|JEWLX';

UPDATE public.subscription_plans
SET features = regexp_replace(features::text, 'JewlX|JewelX|Jewlx|JEWLX', 'Aurezo', 'g')::jsonb
WHERE features::text ~ 'JewlX|JewelX|Jewlx|JEWLX';

UPDATE public.email_logs
SET subject = regexp_replace(subject, 'JewlX|JewelX|Jewlx|JEWLX', 'Aurezo', 'g')
WHERE subject ~ 'JewlX|JewelX|Jewlx|JEWLX';

UPDATE public.admin_activity_logs
SET description = regexp_replace(description, 'JewlX|JewelX|Jewlx|JEWLX', 'Aurezo', 'g')
WHERE description ~ 'JewlX|JewelX|Jewlx|JEWLX';

UPDATE public.admin_activity_logs
SET metadata = regexp_replace(metadata::text, 'JewlX|JewelX|Jewlx|JEWLX', 'Aurezo', 'g')::jsonb
WHERE metadata::text ~ 'JewlX|JewelX|Jewlx|JEWLX';

UPDATE public.audit_logs
SET metadata = regexp_replace(metadata::text, 'JewlX|JewelX|Jewlx|JEWLX', 'Aurezo', 'g')::jsonb
WHERE metadata::text ~ 'JewlX|JewelX|Jewlx|JEWLX';
