DROP FUNCTION IF EXISTS public.force_client_auth_email_update(uuid, text);

CREATE FUNCTION public.force_client_auth_email_update(p_user_id uuid, p_new_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_conflict uuid;
BEGIN
  IF p_new_email IS NULL OR length(trim(p_new_email)) = 0 THEN
    RAISE EXCEPTION 'email_required';
  END IF;

  SELECT id INTO v_conflict FROM auth.users
   WHERE lower(email) = lower(p_new_email) AND id <> p_user_id
   LIMIT 1;
  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'email_taken';
  END IF;

  UPDATE auth.users
     SET email = p_new_email,
         email_confirmed_at = COALESCE(email_confirmed_at, now()),
         email_change = '',
         email_change_token_new = '',
         email_change_token_current = '',
         email_change_confirm_status = 0,
         updated_at = now()
   WHERE id = p_user_id;

  UPDATE auth.identities
     SET identity_data = jsonb_set(
           COALESCE(identity_data, '{}'::jsonb),
           '{email}',
           to_jsonb(p_new_email),
           true
         ),
         email = p_new_email,
         updated_at = now()
   WHERE user_id = p_user_id AND provider = 'email';

  UPDATE public.clients
     SET email = p_new_email
   WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.force_client_auth_email_update(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.force_client_auth_email_update(uuid, text) TO service_role;