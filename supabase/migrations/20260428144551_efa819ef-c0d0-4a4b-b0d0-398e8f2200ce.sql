
CREATE OR REPLACE FUNCTION public.consume_cad_addon(
  p_client_id uuid,
  p_addon_kind text,
  p_cad_request_id uuid,
  p_fallback_kinds text[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_kinds text[];
  v_row   public.client_cad_addons;
BEGIN
  -- Authorization: caller must own the client, be staff, or be admin
  IF NOT (
    public.has_role(auth.uid(), 'agency_admin'::app_role)
    OR public.get_user_client_id(auth.uid()) = p_client_id
    OR public.is_staff_of_client(auth.uid(), p_client_id)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_authorized');
  END IF;

  IF p_addon_kind NOT IN ('cad_tweak','new_cad','cad_render') THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_kind');
  END IF;

  -- Build search order: primary kind, then fallbacks (validated)
  v_kinds := ARRAY[p_addon_kind];
  IF p_fallback_kinds IS NOT NULL THEN
    v_kinds := v_kinds || (
      SELECT COALESCE(array_agg(k), ARRAY[]::text[])
      FROM unnest(p_fallback_kinds) AS k
      WHERE k IN ('cad_tweak','new_cad','cad_render')
        AND k <> p_addon_kind
    );
  END IF;

  -- Lock and pick the oldest unconsumed add-on matching any of the kinds (in priority order)
  SELECT * INTO v_row
  FROM public.client_cad_addons
  WHERE client_id = p_client_id
    AND consumed_at IS NULL
    AND addon_kind = ANY(v_kinds)
  ORDER BY array_position(v_kinds, addon_kind), granted_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no_balance');
  END IF;

  UPDATE public.client_cad_addons
  SET consumed_at = now(),
      consumed_by_cad_request_id = p_cad_request_id
  WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'success', true,
    'addon_id', v_row.id,
    'addon_kind', v_row.addon_kind
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.consume_cad_addon(uuid, text, uuid, text[]) TO authenticated;
