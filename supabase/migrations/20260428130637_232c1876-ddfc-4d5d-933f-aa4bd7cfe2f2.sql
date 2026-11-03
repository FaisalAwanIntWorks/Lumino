UPDATE public.subscription_plans SET name = 'JewlX Suite' WHERE name = 'JewelX Suite';

UPDATE public.client_subscriptions SET plan_name = 'JewlX Suite' WHERE plan_name = 'JewelX Suite';

UPDATE public.subscription_plans
SET features = REPLACE(features::text, 'Everything in JewelX Suite', 'Everything in JewlX Suite')::jsonb
WHERE features::text LIKE '%Everything in JewelX Suite%';