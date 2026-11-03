-- Extend the AI cache invalidation trigger to ai_training_examples.
-- When a client adds/edits/deletes a training Q&A the cached catalog context
-- (which embeds those examples) must be cleared so the next chat turn picks up
-- the updated knowledge base immediately.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ai_training_examples'
  ) THEN
    DROP TRIGGER IF EXISTS trg_invalidate_ai_cache ON public.ai_training_examples;
    CREATE TRIGGER trg_invalidate_ai_cache
      AFTER INSERT OR UPDATE OR DELETE ON public.ai_training_examples
      FOR EACH ROW EXECUTE FUNCTION public.invalidate_client_ai_cache();
  END IF;
END $$;