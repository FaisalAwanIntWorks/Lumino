-- lovable-cron-fallback-reviewed: per-minute campaign tick only exists while a campaign is scheduled/sending; a trigger schedules it on start and the tick unschedules it once nothing is active
CREATE TABLE public.marketing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  first_name text,
  last_name text,
  company text,
  phone text,
  city text,
  country text,
  custom_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'subscribed' CHECK (status IN ('subscribed','unsubscribed','bounced','complained')),
  unsubscribe_token uuid NOT NULL DEFAULT gen_random_uuid(),
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX marketing_leads_email_uq ON public.marketing_leads (lower(email));
CREATE UNIQUE INDEX marketing_leads_token_uq ON public.marketing_leads (unsubscribe_token);

CREATE TABLE public.marketing_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.marketing_list_members (
  list_id uuid NOT NULL REFERENCES public.marketing_lists(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.marketing_leads(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (list_id, lead_id)
);
CREATE INDEX marketing_list_members_lead_idx ON public.marketing_list_members (lead_id);

CREATE TABLE public.marketing_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  mode text NOT NULL DEFAULT 'blocks' CHECK (mode IN ('blocks','html')),
  subject text NOT NULL DEFAULT '',
  preview_text text NOT NULL DEFAULT '',
  blocks jsonb NOT NULL DEFAULT '[]'::jsonb,
  html text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  template_id uuid REFERENCES public.marketing_templates(id) ON DELETE SET NULL,
  list_ids uuid[] NOT NULL DEFAULT '{}',
  subject text NOT NULL DEFAULT '',
  preview_text text NOT NULL DEFAULT '',
  rendered_html text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','sending','paused','completed','cancelled')),
  batch_size int NOT NULL DEFAULT 50 CHECK (batch_size BETWEEN 1 AND 100),
  interval_minutes int NOT NULL DEFAULT 30 CHECK (interval_minutes BETWEEN 1 AND 10080),
  daily_cap int CHECK (daily_cap IS NULL OR daily_cap > 0),
  window_start time,
  window_end time,
  timezone text NOT NULL DEFAULT 'UTC',
  start_at timestamptz,
  last_batch_at timestamptz,
  max_bounce_rate numeric NOT NULL DEFAULT 5,
  max_complaint_rate numeric NOT NULL DEFAULT 0.3,
  pause_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.marketing_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.marketing_leads(id) ON DELETE CASCADE,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','delivered','failed','skipped')),
  resend_id text,
  error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, lead_id)
);
CREATE INDEX marketing_recipients_queue_idx ON public.marketing_campaign_recipients (campaign_id, status);
CREATE INDEX marketing_recipients_resend_idx ON public.marketing_campaign_recipients (resend_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_leads, public.marketing_lists, public.marketing_list_members, public.marketing_templates, public.marketing_campaigns, public.marketing_campaign_recipients TO authenticated;
GRANT ALL ON public.marketing_leads, public.marketing_lists, public.marketing_list_members, public.marketing_templates, public.marketing_campaigns, public.marketing_campaign_recipients TO service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['marketing_leads','marketing_lists','marketing_list_members','marketing_templates','marketing_campaigns','marketing_campaign_recipients'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "Admins read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.has_role(auth.uid(), ''agency_admin''))', t);
    EXECUTE format('CREATE POLICY "Super admins write %1$s" ON public.%1$I FOR ALL TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()))', t);
  END LOOP;
END $$;

CREATE TRIGGER marketing_leads_updated BEFORE UPDATE ON public.marketing_leads FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER marketing_templates_updated BEFORE UPDATE ON public.marketing_templates FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER marketing_campaigns_updated BEFORE UPDATE ON public.marketing_campaigns FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.marketing_claim_recipients(_campaign uuid, _limit int)
RETURNS SETOF public.marketing_campaign_recipients
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.marketing_campaign_recipients r SET status = 'sending'
  WHERE r.id IN (
    SELECT id FROM public.marketing_campaign_recipients
    WHERE campaign_id = _campaign AND status = 'queued'
    ORDER BY created_at, id
    LIMIT _limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING r.*;
$$;
REVOKE ALL ON FUNCTION public.marketing_claim_recipients(uuid,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marketing_claim_recipients(uuid,int) TO service_role;

CREATE OR REPLACE FUNCTION public.trigger_marketing_campaign_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_url text; v_key text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.marketing_campaigns WHERE status IN ('scheduled','sending')) THEN
    PERFORM cron.unschedule('marketing-campaign-tick');
    RETURN;
  END IF;
  SELECT value INTO v_url FROM public.cron_config WHERE key = 'supabase_url';
  SELECT value INTO v_key FROM public.cron_config WHERE key = 'service_role_key';
  IF v_url IS NULL OR v_url LIKE '%YOUR_PROJECT%' THEN RETURN; END IF;
  PERFORM net.http_post(
    url := v_url || '/functions/v1/marketing-campaign-tick',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_key),
    body := '{}'::jsonb
  );
END $$;
REVOKE ALL ON FUNCTION public.trigger_marketing_campaign_tick() FROM PUBLIC, anon, authenticated;

-- Wake the tick when a campaign becomes scheduled/sending
CREATE OR REPLACE FUNCTION public.marketing_campaign_wake()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('scheduled','sending')
     AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'marketing-campaign-tick') THEN
    PERFORM cron.schedule('marketing-campaign-tick', '* * * * *', 'select public.trigger_marketing_campaign_tick()');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER marketing_campaign_wake AFTER INSERT OR UPDATE OF status ON public.marketing_campaigns
FOR EACH ROW EXECUTE FUNCTION public.marketing_campaign_wake();