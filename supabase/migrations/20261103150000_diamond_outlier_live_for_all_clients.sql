-- ============================================================================
-- Diamond Outlier Engine: go live for ALL client accounts (3 Nov 2026)
--
-- Until now the engine's picks applied only to the Sandbox client (JewlX,
-- dcd952fc-783b-4a92-be7f-62751265c650) via live_scope = 'allowlist'
-- (migration 20260928090000). This flips the scope to 'all'.
--
-- What this does NOT change
--   * shadow_mode: if shadow mode is ON, nothing is applied to anyone (same as
--     before); the engine is live for a client only when shadow_mode = false.
--   * Scores, thresholds, rep-change report, materialized views: untouched.
--     diamond_pool_group_reps_engine is already refreshed by every scoring run,
--     and get_diamond_presets_filtered_base picks the view per request through
--     diamond_engine_live_for(client_id), so the switch takes effect on the
--     next widget request with no refresh and no re-score.
--   * live_client_ids is kept, so a rollback restores Sandbox-only exactly.
--   * No cron is added (scoring stays on the admin Run Score Now button).
--
-- Rollback (back to Sandbox only):
--   UPDATE public.diamond_outlier_config SET live_scope = 'allowlist' WHERE id = 1;
-- ============================================================================

UPDATE public.diamond_outlier_config
   SET live_scope = 'all'
 WHERE id = 1
   AND live_scope IS DISTINCT FROM 'all';

DO $$
DECLARE
  c record;
BEGIN
  SELECT shadow_mode, live_scope INTO c FROM public.diamond_outlier_config WHERE id = 1;
  IF NOT FOUND THEN
    RAISE NOTICE 'diamond_outlier_config row 1 missing: engine not configured, nothing changed';
  ELSIF c.shadow_mode THEN
    RAISE NOTICE 'live_scope=% but shadow_mode is ON: engine still applied to nobody until shadow mode is switched off', c.live_scope;
  ELSE
    RAISE NOTICE 'Diamond outlier engine now LIVE for all client accounts (live_scope=%)', c.live_scope;
  END IF;
END $$;
