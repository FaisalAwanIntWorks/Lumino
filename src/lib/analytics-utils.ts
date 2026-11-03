import { supabase } from '@/integrations/supabase/client';

/** In-memory fallback when sessionStorage is unavailable (3rd-party iframe). */
let memorySessionId: string | null = null;

const newId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    // crypto.randomUUID needs a secure context; fall back to a random string.
    return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
};

/**
 * Get or create a session ID stored in sessionStorage.
 * Survives same-tab refreshes but resets on new tab — works reliably in iframes
 * even in Safari/Firefox with strict 3rd-party storage policies.
 *
 * When storage is blocked entirely we keep the ID in a module-level variable so
 * every event fired by this page load still shares one session ID; without that
 * the "unique sessions" count inflates to one session per event.
 */
export const getOrCreateSessionId = (): string => {
  const KEY = 'jewlx_session_id';
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id = memorySessionId || newId();
      sessionStorage.setItem(KEY, id);
    }
    memorySessionId = id;
    return id;
  } catch {
    // sessionStorage blocked — keep one ephemeral ID for this page load.
    if (!memorySessionId) memorySessionId = newId();
    return memorySessionId;
  }
};

/** Widget sources recognised by the traffic dashboard. */
export type WidgetViewSource =
  | 'jewlx_widget'
  | 'ring_builder'
  | 'grillz_builder'
  | 'custom_enquiry'
  | 'metal_buying';

/**
 * Guards against double-firing within a single page load (React StrictMode
 * double-invokes effects in dev, and the embed bootstrap effect can re-run when
 * its access flags settle). Deliberately NOT persisted to sessionStorage: an
 * impression is per widget load, so a refresh or a second visit in the same tab
 * must count again — otherwise `total` collapses into `unique` and the
 * "total views" tile permanently under-reports.
 */
const firedThisPageLoad = new Set<string>();

/**
 * Track a widget/form view. Fires once per widget per page load.
 */
export const trackWidgetView = async (clientId: string, source: WidgetViewSource) => {
  const guardKey = `${clientId}:${source}`;
  if (firedThisPageLoad.has(guardKey)) return;
  firedThisPageLoad.add(guardKey);

  const sessionId = getOrCreateSessionId();

  try {
    // supabase-js resolves with { error } instead of throwing, so this MUST be
    // inspected — an RLS rejection or an unknown event_type used to disappear
    // silently and the dashboard just showed zero traffic forever.
    const { error } = await supabase.from('analytics_events').insert({
      client_id: clientId,
      event_type: 'widget_view',
      metadata: { source, session_id: sessionId },
    });

    if (error) {
      // Allow a retry on the next mount rather than swallowing the view.
      firedThisPageLoad.delete(guardKey);
      console.error(
        `[analytics] widget_view insert rejected for source "${source}":`,
        error.message,
        error.details || '',
        error.hint || ''
      );
    }
  } catch (error) {
    firedThisPageLoad.delete(guardKey);
    console.error('[analytics] widget_view request failed:', error);
  }
};

type AnalyticsEventType =
  | 'configurator_load'
  | 'add_to_cart'
  | 'purchase'
  | 'page_view'
  | 'embed_view'
  | 'ring_view'
  | 'config_started'
  | 'config_completed'
  | 'design_saved'
  | 'widget_view'
  // F8: Form-funnel events emitted by useFormAnalytics hook.
  | 'form_started'
  | 'form_step_advanced'
  | 'form_abandoned';

export const trackEmbedEvent = async (
  clientId: string,
  eventType: AnalyticsEventType,
  metadata?: Record<string, any>
) => {
  try {
    const { error } = await supabase.from('analytics_events').insert({
      client_id: clientId,
      event_type: eventType,
      metadata: metadata || {},
    } as any);
    if (error) {
      console.error(
        `[analytics] "${eventType}" insert rejected:`,
        error.message,
        error.details || '',
        error.hint || ''
      );
    }
  } catch (error) {
    console.error('[analytics] event request failed:', error);
  }
};

// B9: Bound the result set so a busy client doesn't OOM the admin dashboard.
// 5000 rows per 30-day window is plenty for the funnel calc downstream and
// keeps the response under a few hundred KB.
const ANALYTICS_DEFAULT_LIMIT = 5000;

export const getAnalyticsData = async (
  clientId: string,
  days: number = 30,
  limit: number = ANALYTICS_DEFAULT_LIMIT,
) => {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const { data, error } = await supabase
    .from('analytics_events')
    .select('*')
    .eq('client_id', clientId)
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  return data || [];
};

export const calculateConversionFunnel = (events: any[]) => {
  const views = events.filter(e => e.event_type === 'embed_view').length;
  const started = events.filter(e => e.event_type === 'config_started').length;
  const completed = events.filter(e => e.event_type === 'config_completed').length;
  const saved = events.filter(e => e.event_type === 'design_saved').length;
  
  return {
    views,
    started,
    completed,
    saved,
    startRate: views > 0 ? ((started / views) * 100).toFixed(1) : '0',
    completeRate: started > 0 ? ((completed / started) * 100).toFixed(1) : '0',
    saveRate: completed > 0 ? ((saved / completed) * 100).toFixed(1) : '0',
  };
};
