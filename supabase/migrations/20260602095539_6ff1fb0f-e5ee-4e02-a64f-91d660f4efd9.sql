CREATE OR REPLACE FUNCTION public.force_client_auth_email_update(
  p_user_id uuid,
  p_new_email text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean_email text;
  v_current_email text;
  v_conflicting_user uuid;
BEGIN
  v_clean_email := lower(trim(coalesce(p_new_email, '')));

  IF p_user_id IS NULL OR v_clean_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid email address');
  END IF;

  SELECT lower(email)
    INTO v_current_email
  FROM auth.users
  WHERE id = p_user_id;

  IF v_current_email IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'User account not found');
  END IF;

  IF v_current_email = v_clean_email THEN
    UPDATE auth.users
       SET email_change = '',
           email_change_token_new = '',
           email_change_token_current = '',
           email_change_confirm_status = 0,
           email_change_sent_at = NULL,
           updated_at = now()
     WHERE id = p_user_id;

    RETURN jsonb_build_object('ok', true, 'email', v_clean_email, 'unchanged', true);
  END IF;

  SELECT id
    INTO v_conflicting_user
  FROM auth.users
  WHERE lower(email) = v_clean_email
    AND id <> p_user_id
  LIMIT 1;

  IF v_conflicting_user IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This email is already used by another account.');
  END IF;

  UPDATE auth.users
     SET email = v_clean_email,
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         confirmation_sent_at = NULL,
         confirmation_token = '',
         email_change = '',
         email_change_token_new = '',
         email_change_token_current = '',
         email_change_confirm_status = 0,
         email_change_sent_at = NULL,
         updated_at = now()
   WHERE id = p_user_id;

  UPDATE auth.identities
     SET identity_data = jsonb_set(
           coalesce(identity_data, '{}'::jsonb),
           '{email}',
           to_jsonb(v_clean_email)
         ),
         updated_at = now()
   WHERE user_id = p_user_id
     AND provider = 'email';

  UPDATE public.clients
     SET email = v_clean_email,
         updated_at = now()
   WHERE user_id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'email', v_clean_email);
END;
$$;

REVOKE ALL ON FUNCTION public.force_client_auth_email_update(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.force_client_auth_email_update(uuid, text) TO service_role;