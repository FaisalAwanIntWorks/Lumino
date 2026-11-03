-- Diamond catalogue editor (Sandbox GBP / CAD): show each preview card at the
-- stored price of the published FX version, the same number Ring OS uses
-- (get_diamond_presets_filtered applies the markup on top of this price).
-- Read-only, one page of ids at a time; stones without a stored price are
-- simply absent (Ring OS hides them too until rates are re-applied).
CREATE OR REPLACE FUNCTION public.get_diamond_fx_prices_for_pool_ids(p_pool_ids uuid[], p_currency text)
RETURNS TABLE(pool_id uuid, price numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT fx.pool_id,
         CASE WHEN UPPER(p_currency) = 'GBP' THEN fx.price_gbp ELSE fx.price_cad END
  FROM public.diamond_fx_state s
  JOIN public.diamond_pool_fx_prices fx ON fx.version_id = s.active_version_id
  WHERE s.id = 1
    AND UPPER(p_currency) IN ('GBP', 'CAD')
    AND COALESCE(cardinality(p_pool_ids), 0) <= 500
    AND fx.pool_id = ANY (p_pool_ids)
$$;
REVOKE ALL ON FUNCTION public.get_diamond_fx_prices_for_pool_ids(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_diamond_fx_prices_for_pool_ids(uuid[], text) TO authenticated, service_role;