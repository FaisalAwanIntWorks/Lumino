
-- 1. Welcome amount = 45,000 credits ($22.50 @ $0.0005/credit)
UPDATE public.platform_ai_config
SET monthly_free_credits_dollars = 22.50
WHERE id = (SELECT id FROM public.platform_ai_config LIMIT 1);

-- 2. Self-healing welcome grant on every new client row
CREATE OR REPLACE FUNCTION public.trg_grant_welcome_credits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_free_credits(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS grant_welcome_credits_on_client_insert ON public.clients;
CREATE TRIGGER grant_welcome_credits_on_client_insert
AFTER INSERT ON public.clients
FOR EACH ROW EXECUTE FUNCTION public.trg_grant_welcome_credits();

-- 3. Backfill every existing client missing an active grant
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT cl.id
    FROM public.clients cl
    LEFT JOIN public.client_free_credits cfc
      ON cfc.client_id = cl.id
     AND cfc.expires_at > now()
    WHERE cfc.id IS NULL
  LOOP
    PERFORM public.ensure_free_credits(c.id);
  END LOOP;
END $$;
