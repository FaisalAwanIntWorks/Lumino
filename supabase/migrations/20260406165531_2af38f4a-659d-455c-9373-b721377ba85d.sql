
CREATE OR REPLACE FUNCTION public.grant_new_client_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  -- Grant 5,000 credits = $2.50 to the new client
  SELECT public.credit_wallet(NEW.id, 2.50, 'credit', 'Welcome bonus: 5,000 credits', NULL) INTO v_result;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_grant_new_client_credits
AFTER INSERT ON public.clients
FOR EACH ROW
EXECUTE FUNCTION public.grant_new_client_credits();
