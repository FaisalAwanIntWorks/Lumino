INSERT INTO public.plan_ai_defaults (plan_id, chat_quota, image_quota, chat_rpm, image_rpm, cost_estimate_rpm)
SELECT p.id, t.chat_quota, t.image_quota, t.chat_rpm, t.image_rpm, t.cost_estimate_rpm
FROM public.subscription_plans p
CROSS JOIN LATERAL (
  SELECT d.chat_quota, d.image_quota, d.chat_rpm, d.image_rpm, d.cost_estimate_rpm
  FROM public.plan_ai_defaults d
  JOIN public.subscription_plans sp ON sp.id = d.plan_id
  WHERE COALESCE(p.auto_created, false) OR sp.price_monthly <= GREATEST(COALESCE(p.price_monthly, 0), 0)
  ORDER BY d.image_quota DESC
  LIMIT 1
) t
WHERE NOT EXISTS (SELECT 1 FROM public.plan_ai_defaults d2 WHERE d2.plan_id = p.id)
ON CONFLICT (plan_id) DO NOTHING;

INSERT INTO public.plan_ai_defaults (plan_id)
SELECT p.id FROM public.subscription_plans p
WHERE NOT EXISTS (SELECT 1 FROM public.plan_ai_defaults d WHERE d.plan_id = p.id)
ON CONFLICT (plan_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_plan_ai_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  SELECT d.chat_quota, d.image_quota, d.chat_rpm, d.image_rpm, d.cost_estimate_rpm
  INTO r
  FROM public.plan_ai_defaults d
  JOIN public.subscription_plans sp ON sp.id = d.plan_id
  WHERE COALESCE(NEW.auto_created, false)
     OR sp.price_monthly <= GREATEST(COALESCE(NEW.price_monthly, 0), 0)
  ORDER BY d.image_quota DESC
  LIMIT 1;

  IF r IS NULL THEN
    INSERT INTO public.plan_ai_defaults (plan_id) VALUES (NEW.id)
    ON CONFLICT (plan_id) DO NOTHING;
  ELSE
    INSERT INTO public.plan_ai_defaults (plan_id, chat_quota, image_quota, chat_rpm, image_rpm, cost_estimate_rpm)
    VALUES (NEW.id, r.chat_quota, r.image_quota, r.chat_rpm, r.image_rpm, r.cost_estimate_rpm)
    ON CONFLICT (plan_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_plan_ai_defaults ON public.subscription_plans;
CREATE TRIGGER trg_ensure_plan_ai_defaults
AFTER INSERT ON public.subscription_plans
FOR EACH ROW EXECUTE FUNCTION public.ensure_plan_ai_defaults();