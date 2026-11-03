UPDATE public.plan_ai_defaults d
SET chat_rpm = t.chat_rpm,
    image_rpm = t.image_rpm,
    cost_estimate_rpm = t.cost_estimate_rpm,
    chat_quota = t.chat_quota,
    image_quota = t.image_quota
FROM (
  SELECT p.id AS plan_id, l.chat_rpm, l.image_rpm, l.cost_estimate_rpm, l.chat_quota, l.image_quota
  FROM public.subscription_plans p
  CROSS JOIN LATERAL (
    SELECT cd.chat_rpm, cd.image_rpm, cd.cost_estimate_rpm, cd.chat_quota, cd.image_quota
    FROM public.subscription_plans cp
    JOIN public.plan_ai_defaults cd ON cd.plan_id = cp.id
    WHERE COALESCE(cp.auto_created, false) = false
    ORDER BY (cp.price_monthly <= COALESCE(p.price_monthly, 0)) DESC,
             CASE WHEN cp.price_monthly <= COALESCE(p.price_monthly, 0) THEN -cp.price_monthly ELSE cp.price_monthly END ASC
    LIMIT 1
  ) l
  WHERE COALESCE(p.auto_created, false) = true
) t
WHERE d.plan_id = t.plan_id;