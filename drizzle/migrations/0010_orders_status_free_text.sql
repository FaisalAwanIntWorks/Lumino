DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a
        ON a.attrelid = c.conrelid
       AND a.attnum = ANY (c.conkey)
     WHERE c.conrelid = 'public.orders'::regclass
       AND c.contype  = 'c'
       AND a.attname  = 'status'
       AND array_length(c.conkey, 1) = 1
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT %I', con.conname);
    RAISE NOTICE 'Dropped orders status check constraint %', con.conname;
  END LOOP;
END
$$;