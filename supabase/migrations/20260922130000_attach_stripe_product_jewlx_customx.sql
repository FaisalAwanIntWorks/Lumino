-- Attach Stripe product prod_UW7thwMRvclZc0 ("JewlX Custom X special plan",
-- $500/mo) to the manually created "JewlX CustomX" subscription plan.
--
-- The webhook / reconciliation resolver looks plans up by stripe_price_id,
-- then legacy_stripe_price_ids, then stripe_product_ids, then auto-creates a
-- hidden plan. If a hidden plan was already auto-created for this product,
-- its Stripe ids and clients are moved to the new plan so resolution is
-- unambiguous (two plans holding the same product id would break the
-- .maybeSingle() lookup).

DO $$
DECLARE
  v_product   text := 'prod_UW7thwMRvclZc0';
  v_new       uuid;
  v_old       record;
BEGIN
  SELECT id INTO v_new
  FROM public.subscription_plans
  WHERE name ILIKE 'JewlX CustomX%'
    AND COALESCE(auto_created, false) = false
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_new IS NULL THEN
    RAISE NOTICE 'JewlX CustomX plan not found; nothing to attach';
    RETURN;
  END IF;

  FOR v_old IN
    SELECT id, stripe_price_id, legacy_stripe_price_ids
    FROM public.subscription_plans
    WHERE id <> v_new
      AND stripe_product_ids @> ARRAY[v_product]
  LOOP
    -- Carry the Stripe price ids over so checkout + webhook hit the new plan.
    UPDATE public.subscription_plans
    SET stripe_price_id = COALESCE(stripe_price_id, v_old.stripe_price_id),
        legacy_stripe_price_ids = (
          SELECT ARRAY(
            SELECT DISTINCT x FROM unnest(
              array_remove(
                COALESCE(legacy_stripe_price_ids, '{}')
                || COALESCE(v_old.legacy_stripe_price_ids, '{}')
                || ARRAY[v_old.stripe_price_id],
                NULL
              )
            ) AS x
          )
        )
    WHERE id = v_new;

    UPDATE public.subscription_plans
    SET stripe_product_ids = array_remove(stripe_product_ids, v_product),
        stripe_price_id = NULL,
        legacy_stripe_price_ids = '{}'
    WHERE id = v_old.id;

    UPDATE public.clients              SET plan_id = v_new WHERE plan_id = v_old.id;
    UPDATE public.client_subscriptions SET plan_id = v_new WHERE plan_id = v_old.id;

    RAISE NOTICE 'Moved product % from plan % to %', v_product, v_old.id, v_new;
  END LOOP;

  UPDATE public.subscription_plans
  SET stripe_product_ids = (
    SELECT ARRAY(SELECT DISTINCT x FROM unnest(stripe_product_ids || ARRAY[v_product]) AS x)
  )
  WHERE id = v_new;
END $$;
