CREATE OR REPLACE FUNCTION public.fill_client_activity_log_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_email IS NULL OR NEW.user_email = '' THEN
    SELECT c.email, c.company_name
      INTO NEW.user_email, NEW.user_name
    FROM public.clients c
    WHERE c.id = NEW.client_id
      AND c.user_id = NEW.user_id
    LIMIT 1;
  END IF;

  IF NEW.user_email IS NULL OR NEW.user_email = '' THEN
    SELECT sm.email, sm.name
      INTO NEW.user_email, NEW.user_name
    FROM public.staff_members sm
    WHERE sm.client_id = NEW.client_id
      AND sm.user_id = NEW.user_id
    LIMIT 1;
  END IF;

  IF NEW.user_email IS NULL OR NEW.user_email = '' THEN
    SELECT asm.email, asm.name
      INTO NEW.user_email, NEW.user_name
    FROM public.admin_staff_members asm
    WHERE asm.user_id = NEW.user_id
      AND asm.status = 'active'
    LIMIT 1;
  END IF;

  IF NEW.user_email IS NULL OR NEW.user_email = '' THEN
    NEW.user_email := 'system@jewlx.ai';
  END IF;

  IF NEW.user_type IS NULL OR NEW.user_type = '' THEN
    NEW.user_type := CASE
      WHEN EXISTS (
        SELECT 1 FROM public.staff_members sm
        WHERE sm.client_id = NEW.client_id
          AND sm.user_id = NEW.user_id
          AND sm.status = 'active'
      ) THEN 'staff'
      ELSE 'owner'
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fill_client_activity_log_identity_before_insert ON public.client_activity_logs;
CREATE TRIGGER fill_client_activity_log_identity_before_insert
  BEFORE INSERT ON public.client_activity_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.fill_client_activity_log_identity();