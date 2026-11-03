CREATE OR REPLACE FUNCTION public.sync_client_email_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.clients
       SET email = NEW.email
     WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;