-- Diamond scoring (diamond_pipeline_step, 20261026120000) keeps its keyset
-- cursor with `max(pool_id)` over uuid batches, but Postgres has no max(uuid),
-- so a run failed on its first batch with "function max(uuid) does not exist".
-- Supplying the missing aggregate fixes the step without copying its body.
-- uuid comparison is bytewise, the same order as `p.id > v_cursor` uses.
CREATE OR REPLACE FUNCTION public.uuid_larger(a uuid, b uuid)
RETURNS uuid
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
AS $$ SELECT CASE WHEN a >= b THEN a ELSE b END $$;

DO $$
BEGIN
  IF to_regprocedure('pg_catalog.max(uuid)') IS NULL
     AND to_regprocedure('public.max(uuid)') IS NULL THEN
    CREATE AGGREGATE public.max(uuid) (
      SFUNC       = public.uuid_larger,
      STYPE       = uuid,
      COMBINEFUNC = public.uuid_larger,
      PARALLEL    = SAFE
    );
  END IF;
END $$;