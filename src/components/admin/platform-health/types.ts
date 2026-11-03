export type HealthStatus = 'operational' | 'degraded' | 'down';
export type QuotaLevel = 'ok' | 'warning' | 'critical' | 'info';

export interface HealthCheckRow {
  id: string;
  run_id: string;
  checked_at: string;
  component: string;
  category: string;
  status: HealthStatus;
  latency_ms: number | null;
  message: string | null;
  details: Record<string, unknown>;
  source: 'cron' | 'manual';
}

export interface OverviewRow {
  component: string;
  category: string;
  /** Share of checks that were not "down". */
  uptime_pct: number | null;
  /** Share of checks that were fully operational. */
  healthy_pct: number | null;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  checks_total: number;
  checks_ok: number;
  checks_down: number;
  checks_degraded: number;
  incidents: number;
  downtime_min_seconds: number;
  downtime_max_seconds: number;
}

export interface TrendRow {
  day: string;
  component: string;
  category: string;
  uptime_pct: number | null;
  healthy_pct: number | null;
  avg_latency_ms: number | null;
  checks_total: number;
  checks_down: number;
  checks_degraded: number;
}

export interface IncidentRow {
  id: string;
  component: string;
  category: string;
  status: 'degraded' | 'down';
  /** Last passing check before the first failure (null = none on record). */
  prev_ok_at: string | null;
  /** First failing check. */
  started_at: string;
  /** Last failing check. */
  last_failed_at: string | null;
  /** First passing check after the failure. */
  resolved_at: string | null;
  checks_failed: number;
  first_message: string | null;
  last_message: string | null;
  notified_at: string | null;
  resolved_notified_at: string | null;
}

export interface QuotaDetails {
  /** Where the value was read from. */
  source?: string;
  source_note?: string;
  /** Where the limit comes from: provider, settings (verified / unverified), alert threshold, not set. */
  limit_source?: string;
  remaining_usd?: number;
  cached?: number;
  live?: number;
  attempted?: number;
  failed?: number;
  sent?: number;
  api_calls?: number | null;
  [key: string]: unknown;
}

export interface QuotaRow {
  id: string;
  captured_at: string;
  service: string;
  metric: string;
  label: string;
  used: number;
  quota_limit: number | null;
  pct: number | null;
  unit: string;
  level: QuotaLevel;
  details: QuotaDetails;
}

export interface AlertRow {
  id: string;
  created_at: string;
  alert_type: 'incident_open' | 'incident_resolved' | 'quota_warning' | 'quota_critical' | 'monthly_report' | 'test_alert';
  alert_key: string;
  component: string | null;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string | null;
  recipients: string[];
  email_status: 'sent' | 'failed' | 'skipped';
  email_error: string | null;
  resend_id: string | null;
  details: Record<string, unknown>;
}

export interface SettingRow {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
}

export interface ReportComponent {
  component: string;
  category: string;
  uptime_pct: number | null;
  healthy_pct: number | null;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  checks_total: number;
  checks_ok?: number;
  checks_down: number;
  checks_degraded: number;
  incidents: number;
  downtime_min_seconds?: number;
  downtime_max_seconds?: number;
  /** Reports stored before the accuracy pass. */
  downtime_seconds?: number;
}

export interface ReportIncident {
  component: string;
  status: string;
  prev_ok_at?: string | null;
  started_at: string;
  last_failed_at?: string | null;
  resolved_at: string | null;
  duration_min_seconds?: number;
  duration_max_seconds?: number;
  /** Reports stored before the accuracy pass. */
  duration_seconds?: number;
  checks_failed?: number;
  message: string | null;
}

export interface MonthlyReport {
  period: string;
  period_label: string;
  generated_at: string;
  checks_passed_pct?: number | null;
  checks_passed?: number;
  days_in_period?: number;
  days_with_checks?: number;
  /** Reports stored before the accuracy pass. */
  overall_uptime_pct?: number | null;
  total_checks: number;
  components: ReportComponent[];
  incidents: ReportIncident[];
  usage: {
    emails_sent: number | null;
    emails_rejected?: number | null;
    email_api_calls?: number | null;
    /** Reports stored before the accuracy pass. */
    emails_failed?: number;
    ai_requests: number;
    ai_requests_cached?: number;
    stripe_webhooks: number;
    stripe_webhooks_failed: number;
    system_errors: number;
    critical_errors: number;
    high_errors: number;
    alerts_sent: number;
  };
  quotas: Array<{
    service: string;
    metric: string;
    label: string;
    unit: string;
    first: number;
    last: number;
    peak: number;
    limit: number | null;
    worst_level: string;
    samples?: number;
  }>;
}

export interface MonitorRunResult {
  run_id: string;
  source: string;
  timestamp: string;
  duration_ms: number;
  statuses: Array<{ component: string; category: string; status: HealthStatus; latency?: number; message: string; details?: Record<string, unknown> }>;
  quotas: Array<Omit<QuotaRow, 'id' | 'captured_at' | 'quota_limit'> & { limit: number | null }>;
  incidents: { opened: number; alerted: number; resolved: number };
  quota_alerts_sent: number;
  plan_limits_verified?: boolean;
}

export const CATEGORY_ORDER = ['Core Infrastructure', 'AI Providers', 'External Services', 'CDN'];

export const fmtDuration = (seconds: number | null | undefined) => {
  const s = Number(seconds ?? 0);
  if (!Number.isFinite(s) || s < 1) return '0s';
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${(s / 3600).toFixed(1)} h`;
  return `${(s / 86400).toFixed(1)} d`;
};

/**
 * Checks are periodic, so an outage's length is only known as a range:
 * at least (last failed check - first failed check), at most
 * (first passing check - last passing check before it).
 */
export const fmtDurationRange = (min: number | null | undefined, max: number | null | undefined) => {
  const a = fmtDuration(min);
  const b = fmtDuration(max);
  return a === b ? a : `${a} – ${b}`;
};

export const incidentBounds = (i: Pick<IncidentRow, 'prev_ok_at' | 'started_at' | 'last_failed_at' | 'resolved_at'>) => {
  const started = new Date(i.started_at).getTime();
  const lastFailed = i.last_failed_at ? new Date(i.last_failed_at).getTime() : started;
  const prevOk = i.prev_ok_at ? new Date(i.prev_ok_at).getTime() : started;
  const end = i.resolved_at ? new Date(i.resolved_at).getTime() : Date.now();
  return { min: Math.max(0, (lastFailed - started) / 1000), max: Math.max(0, (end - prevOk) / 1000) };
};

export const fmtNumber = (n: number | null | undefined, digits = 0) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });

/** "7/7" style pass count; the honest way to show a handful of samples. */
export const fmtPassed = (ok: number | null | undefined, total: number | null | undefined) =>
  total == null || Number(total) === 0 ? '—' : `${fmtNumber(ok ?? 0)}/${fmtNumber(total)}`;

export const passColor = (ok: number | null | undefined, total: number | null | undefined) => {
  if (total == null || Number(total) === 0) return 'text-muted-foreground';
  const ratio = Number(ok ?? 0) / Number(total);
  return ratio >= 1 ? 'text-emerald-500' : ratio >= 0.9 ? 'text-yellow-500' : 'text-red-500';
};
