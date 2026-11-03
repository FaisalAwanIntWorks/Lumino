ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS stripe_event_id text,
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

UPDATE public.stripe_webhook_events
SET
  stripe_event_id = COALESCE(stripe_event_id, id),
  event_type = COALESCE(event_type, type),
  status = COALESCE(status, CASE WHEN processing_error IS NULL THEN 'processed' ELSE 'failed' END),
  error_message = COALESCE(error_message, processing_error),
  created_at = COALESCE(created_at, processed_at)
WHERE stripe_event_id IS NULL
   OR event_type IS NULL
   OR status IS NULL
   OR error_message IS DISTINCT FROM processing_error;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stripe_webhook_events_stripe_event_id_key'
      AND conrelid = 'public.stripe_webhook_events'::regclass
  ) THEN
    ALTER TABLE public.stripe_webhook_events
      ADD CONSTRAINT stripe_webhook_events_stripe_event_id_key UNIQUE (stripe_event_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_event_id
  ON public.stripe_webhook_events(stripe_event_id);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_failed
  ON public.stripe_webhook_events(created_at DESC)
  WHERE status = 'failed';