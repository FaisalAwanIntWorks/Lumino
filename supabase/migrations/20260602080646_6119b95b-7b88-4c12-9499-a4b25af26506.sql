
CREATE OR REPLACE FUNCTION public.sync_client_email_from_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.clients
       SET email = NEW.email,
           updated_at = now()
     WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_client_email_from_auth_trg ON auth.users;
CREATE TRIGGER sync_client_email_from_auth_trg
AFTER UPDATE OF email ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_client_email_from_auth();
