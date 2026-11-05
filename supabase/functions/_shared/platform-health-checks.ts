/**
 * Platform health checks shared by the public `status` function and the
 * `platform-health-monitor` cron/admin function.
 *
 * Every probe returns a ServiceStatus. HTTP semantics matter here: a 401/403
 * from a provider means our key is broken (down), 429 means we are being rate
 * limited (degraded), 5xx means the provider is having trouble (degraded), a
 * timeout / DNS failure means unreachable (down).
 */
// deno-lint-ignore-file no-explicit-any
import { UNKEY_API_BASE } from "./unkey.ts";
import { ASSET_CDN } from "./asset-cdn.ts";

export type HealthStatus = "operational" | "degraded" | "down";

export interface ServiceStatus {
  component: string;
  category: string;
  status: HealthStatus;
  latency?: number;
  message: string;
  details?: Record<string, unknown>;
}

export type QuotaLevel = "ok" | "warning" | "critical" | "info";

export interface QuotaMetric {
  service: string;
  metric: string;
  label: string;
  used: number;
  limit: number | null;
  unit: string;
  pct: number | null;
  level: QuotaLevel;
  details?: Record<string, unknown>;
}

export interface HealthSettings {
  alerts_enabled: boolean;
  alert_emails: string[];
  warning_pct: number;
  critical_pct: number;
  latency_degraded_ms: number;
  incident_confirm_failures: number;
  quota_alert_cooldown_hours: number;
  /** null = not set (no percentage, no quota alert). */
  resend_daily_limit: number | null;
  resend_monthly_limit: number | null;
  email_failure_rate_pct: number;
  db_size_limit_mb: number | null;
  storage_limit_mb: number | null;
  edge_errors_per_day: number;
  /** false until a super admin confirms the limits match the real plans. */
  plan_limits_verified: boolean;
  stripe_failed_webhooks_24h: number;
}

export const DEFAULT_SETTINGS: HealthSettings = {
  alerts_enabled: true,
  alert_emails: [],
  warning_pct: 80,
  critical_pct: 95,
  latency_degraded_ms: 4000,
  incident_confirm_failures: 1,
  quota_alert_cooldown_hours: 24,
  resend_daily_limit: 100,
  resend_monthly_limit: 3000,
  email_failure_rate_pct: 20,
  db_size_limit_mb: null,
  storage_limit_mb: null,
  edge_errors_per_day: 100,
  plan_limits_verified: false,
  stripe_failed_webhooks_24h: 1,
};

export const CATEGORY = {
  core: "Core Infrastructure",
  ai: "AI Providers",
  external: "External Services",
  cdn: "CDN",
} as const;

/** Load settings rows into a typed object, falling back to defaults. */
export async function loadSettings(supabase: any): Promise<HealthSettings> {
  const out: HealthSettings = { ...DEFAULT_SETTINGS };
  try {
    const { data } = await supabase.from("platform_health_settings").select("key, value");
    for (const row of data ?? []) {
      if (row.key in out) (out as any)[row.key] = row.value;
    }
  } catch { /* defaults */ }
  return out;
}

// ─── HTTP probe ──────────────────────────────────────────────────────────────

export interface ProbeResult {
  reachable: boolean;
  status: number;
  latency: number;
  body?: any;
  headers?: Record<string, string>;
}

export async function probe(
  url: string,
  options: RequestInit = {},
  timeoutMs = 8000,
  parseJson = false,
): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    let body: any;
    if (parseJson) {
      try { body = await res.json(); } catch { body = undefined; }
    } else {
      // Drain the body so the connection can be reused.
      try { await res.arrayBuffer(); } catch { /* ignore */ }
    }
    const headers: Record<string, string> = {};
    res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
    return { reachable: true, status: res.status, latency: Date.now() - start, body, headers };
  } catch {
    return { reachable: false, status: 0, latency: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Turn an HTTP probe into a status. `okStatuses` lists codes that should be
 * treated as healthy even though they are not 2xx (e.g. 405 on a HEAD probe).
 */
export function classify(
  r: ProbeResult,
  settings: HealthSettings,
  okStatuses: number[] = [],
): { status: HealthStatus; message: string } {
  if (!r.reachable) return { status: "down", message: "Unreachable (timeout or network error)" };
  // Explicitly allowed codes win over every other rule (e.g. a CDN root that
  // returns 403 because the bucket has no index document is still serving).
  if (okStatuses.includes(r.status)) {
    if (r.latency > settings.latency_degraded_ms) return { status: "degraded", message: `Slow response (${r.latency}ms)` };
    return { status: "operational", message: "Responding normally" };
  }
  if (r.status === 401 || r.status === 403) return { status: "down", message: `API key rejected (HTTP ${r.status})` };
  if (r.status === 429) return { status: "degraded", message: "Rate limited (HTTP 429)" };
  if (r.status >= 500) return { status: "degraded", message: `Provider error (HTTP ${r.status})` };
  if (r.status >= 400 && !okStatuses.includes(r.status)) {
    return { status: "degraded", message: `Unexpected response (HTTP ${r.status})` };
  }
  if (r.latency > settings.latency_degraded_ms) {
    return { status: "degraded", message: `Slow response (${r.latency}ms)` };
  }
  return { status: "operational", message: "Responding normally" };
}

function missingKey(component: string, category: string, keyName: string): ServiceStatus {
  return { component, category, status: "down", message: `${keyName} secret not configured`, details: { missing_secret: keyName } };
}

// ─── Core infrastructure ─────────────────────────────────────────────────────

export interface CoreCheckOptions {
  /** Probe the edge runtime through a real HTTP round-trip (monitor only). */
  probeEdgeFunctions: boolean;
  /** Include pg_cron job health (monitor only). */
  includeCron: boolean;
}

export async function runCoreChecks(
  supabase: any,
  supabaseUrl: string,
  serviceKey: string,
  settings: HealthSettings,
  opts: CoreCheckOptions,
): Promise<ServiceStatus[]> {
  const out: ServiceStatus[] = [];

  // Database
  {
    const start = Date.now();
    try {
      const { error } = await supabase.from("products").select("id").limit(1);
      const latency = Date.now() - start;
      if (error) {
        out.push({ component: "Database", category: CATEGORY.core, status: "down", latency, message: `Query failed: ${error.message}` });
      } else {
        const slow = latency > settings.latency_degraded_ms;
        out.push({ component: "Database", category: CATEGORY.core, status: slow ? "degraded" : "operational", latency, message: slow ? `Slow response (${latency}ms)` : "Responding normally" });
      }
    } catch (e) {
      out.push({ component: "Database", category: CATEGORY.core, status: "down", latency: Date.now() - start, message: `Unable to connect: ${(e as Error).message}` });
    }
  }

  // Authentication — real round-trip to the GoTrue health endpoint.
  {
    const r = await probe(`${supabaseUrl}/auth/v1/health`, { headers: { apikey: serviceKey } });
    const c = classify(r, settings);
    out.push({ component: "Authentication", category: CATEGORY.core, status: c.status, latency: r.latency, message: c.message });
  }

  // Edge Functions: a real round-trip through the edge runtime. `?ping=1`
  // returns immediately, so the latency is the runtime's, not the database's.
  if (opts.probeEdgeFunctions) {
    const r = await probe(`${supabaseUrl}/functions/v1/status?ping=1`, {
      method: "GET",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    }, 15000);
    const c = classify(r, settings);
    let status = c.status;
    let message = c.message;
    let errors24h = 0;
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("system_errors")
        .select("id", { count: "exact", head: true })
        .eq("error_source", "edge_function")
        .gte("timestamp", since);
      errors24h = count ?? 0;
    } catch { /* ignore */ }
    if (status === "operational" && errors24h >= settings.edge_errors_per_day) {
      status = "degraded";
      message = `${errors24h} logged edge function errors in 24h`;
    } else if (status === "operational") {
      message = `Runtime responding · ${errors24h} logged error(s) in 24h`;
    }
    out.push({
      component: "Edge Functions", category: CATEGORY.core, status, latency: r.latency, message,
      details: {
        errors_24h: errors24h,
        http_status: r.status,
        coverage_note: "Only functions that write to System Errors are counted; a function that fails without logging is not visible here.",
      },
    });
  } else {
    out.push({ component: "Edge Functions", category: CATEGORY.core, status: "operational", latency: 0, message: "Serving this request" });
  }

  // Storage
  {
    const start = Date.now();
    try {
      const { error } = await supabase.storage.listBuckets();
      const latency = Date.now() - start;
      if (error) {
        out.push({ component: "Storage", category: CATEGORY.core, status: "degraded", latency, message: `Bucket listing failed: ${error.message}` });
      } else {
        const slow = latency > settings.latency_degraded_ms;
        out.push({ component: "Storage", category: CATEGORY.core, status: slow ? "degraded" : "operational", latency, message: slow ? `Slow response (${latency}ms)` : "Responding normally" });
      }
    } catch (e) {
      out.push({ component: "Storage", category: CATEGORY.core, status: "down", latency: Date.now() - start, message: `Unable to connect: ${(e as Error).message}` });
    }
  }

  // Scheduled jobs (pg_cron)
  if (opts.includeCron) {
    const start = Date.now();
    try {
      const { data, error } = await supabase.rpc("get_cron_job_health");
      const latency = Date.now() - start;
      if (error) {
        out.push({ component: "Scheduled Jobs", category: CATEGORY.core, status: "degraded", latency, message: `Could not read pg_cron: ${error.message}` });
      } else if (data && typeof data === "object" && !Array.isArray(data) && (data as any).error) {
        out.push({ component: "Scheduled Jobs", category: CATEGORY.core, status: "degraded", latency, message: `pg_cron error: ${(data as any).error}` });
      } else {
        const jobs: any[] = Array.isArray(data) ? data : [];
        const failed = jobs.filter((j) => Number(j.failed_24h ?? 0) > 0);
        const lastFailed = jobs.filter((j) => j.active && j.last_status === "failed");
        const totalFailed = failed.reduce((s, j) => s + Number(j.failed_24h ?? 0), 0);
        let status: HealthStatus = "operational";
        let message = `${jobs.length} jobs scheduled, no SQL failures in 24h`;
        if (lastFailed.length > 0) {
          status = "degraded";
          message = `${lastFailed.map((j) => j.jobname).join(", ")} failed on last run`;
        } else if (totalFailed > 0) {
          status = "degraded";
          message = `${totalFailed} failed run(s) in 24h (${failed.map((j) => j.jobname).join(", ")})`;
        }

        // A cron job "succeeds" as soon as it queues its HTTP call. What the
        // edge function answered is only visible in pg_net's response log.
        let http: any = null;
        try {
          const res = await supabase.rpc("get_db_http_health");
          http = res.data ?? null;
        } catch { /* ignore */ }
        if (http?.available) {
          const bad = Number(http.auth_failed ?? 0) + Number(http.server_error ?? 0) + Number(http.timed_out ?? 0) + Number(http.no_response ?? 0);
          const total = Number(http.total ?? 0);
          if (bad > 0) {
            const parts = [
              Number(http.auth_failed) > 0 ? `${http.auth_failed} rejected (401/403)` : null,
              Number(http.server_error) > 0 ? `${http.server_error} server error` : null,
              Number(http.timed_out) > 0 ? `${http.timed_out} timed out` : null,
              Number(http.no_response) > 0 ? `${http.no_response} no response` : null,
            ].filter(Boolean).join(", ");
            if (status === "operational") status = "degraded";
            message = `${message} · database-triggered calls: ${parts} of ${total} in the last ~6h`;
          } else {
            message = `${message} · ${total} database-triggered call(s) answered in the last ~6h`;
          }
        } else {
          message = `${message} · function responses not inspectable`;
        }

        out.push({
          component: "Scheduled Jobs", category: CATEGORY.core, status, latency, message,
          details: {
            jobs: jobs.map((j) => ({ jobname: j.jobname, schedule: j.schedule, active: j.active, last_status: j.last_status, last_run_at: j.last_run_at, failed_24h: j.failed_24h })),
            http,
          },
        });
      }
    } catch (e) {
      out.push({ component: "Scheduled Jobs", category: CATEGORY.core, status: "degraded", latency: Date.now() - start, message: `pg_cron check failed: ${(e as Error).message}` });
    }
  }

  return out;
}

// ─── External providers ──────────────────────────────────────────────────────

export interface ExternalCheckResult {
  statuses: ServiceStatus[];
  /** Raw provider payloads the quota collector can reuse (Resend domains, Stripe endpoints). */
  extras: {
    resendDomains?: Array<{ name: string; status: string }>;
    /** Usage as reported by Resend's own response headers, when it sends them. */
    resendQuota?: { monthly_used: number | null; daily_used: number | null };
    stripeEndpoints?: Array<{ url: string; status: string; livemode: boolean }>;
  };
}

export async function runExternalChecks(
  settings: HealthSettings,
  supabaseUrl: string,
): Promise<ExternalCheckResult> {
  const extras: ExternalCheckResult["extras"] = {};
  const checks: Promise<ServiceStatus | null>[] = [];

  // Lovable AI Gateway (primary AI provider). Listing models succeeds even when
  // the workspace is out of AI credits, so this sends one minimal completion:
  // the only request that proves AI features would actually work.
  checks.push((async () => {
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return missingKey("Lovable AI Gateway", CATEGORY.ai, "LOVABLE_API_KEY");
    const model = "google/gemini-2.5-flash";
    const r = await probe("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 8 }),
    }, 20000, true);
    const details = { http_status: r.status, probe: "chat.completions", model };
    if (r.status === 402) {
      return { component: "Lovable AI Gateway", category: CATEGORY.ai, status: "down" as HealthStatus, latency: r.latency, message: "AI credits exhausted (HTTP 402): add credits in Lovable", details };
    }
    const c = classify(r, settings);
    const message = c.status === "operational" ? "Test completion succeeded" : c.message;
    return { component: "Lovable AI Gateway", category: CATEGORY.ai, status: c.status, latency: r.latency, message, details };
  })());

  // Resend: key validity, sending-domain verification, and real quota usage.
  checks.push((async () => {
    const key = Deno.env.get("RESEND_API_KEY");
    if (!key) return missingKey("Resend", CATEGORY.external, "RESEND_API_KEY");
    const auth = { Authorization: `Bearer ${key}` };

    const readQuota = (h?: Record<string, string>) => {
      if (!h) return;
      const monthly = h["x-resend-monthly-quota"];
      const daily = h["x-resend-daily-quota"];
      if (monthly === undefined && daily === undefined) return;
      const num = (v?: string) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
      extras.resendQuota = { monthly_used: num(monthly), daily_used: num(daily) };
    };

    const r = await probe("https://api.resend.com/domains", { headers: auth }, 8000, true);
    readQuota(r.headers);
    const details: Record<string, unknown> = { http_status: r.status, error_name: r.body?.name ?? null };

    // A quota that is already exhausted is a real outage for email.
    const quotaExceeded = (x: ProbeResult) =>
      x.status === 429 && (x.body?.name === "daily_quota_exceeded" || x.body?.name === "monthly_quota_exceeded");
    const quotaMessage = (x: ProbeResult) =>
      x.body?.name === "daily_quota_exceeded"
        ? "Daily email quota exhausted: sends are being rejected"
        : "Monthly email quota exhausted: sends are being rejected";

    if (quotaExceeded(r)) {
      return { component: "Resend", category: CATEGORY.external, status: "down" as HealthStatus, latency: r.latency, message: quotaMessage(r), details };
    }

    // Resend answers 401 `restricted_api_key` to a "Sending access" key on
    // every endpoint except sending. To prove that key really can send, post
    // an empty payload: a valid key gets a validation error (nothing is sent,
    // nothing is billed), a bad key gets an auth error.
    if (r.status === 401 && r.body?.name === "restricted_api_key") {
      const s2 = await probe("https://api.resend.com/emails", {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: "{}",
      }, 8000, true);
      readQuota(s2.headers);
      details.key_type = "sending_only";
      details.send_probe_status = s2.status;
      details.send_probe_error = s2.body?.name ?? null;
      const latency = r.latency + s2.latency;
      if (!s2.reachable) {
        return { component: "Resend", category: CATEGORY.external, status: "down" as HealthStatus, latency, message: "Send endpoint unreachable (timeout or network error)", details };
      }
      if (quotaExceeded(s2)) {
        return { component: "Resend", category: CATEGORY.external, status: "down" as HealthStatus, latency, message: quotaMessage(s2), details };
      }
      const keyProblem = s2.status === 401 || s2.status === 403 ||
        (s2.status === 400 && /api key/i.test(String(s2.body?.message ?? "")));
      if (keyProblem) {
        return { component: "Resend", category: CATEGORY.external, status: "down" as HealthStatus, latency, message: `API key rejected for sending (HTTP ${s2.status})`, details };
      }
      if (s2.status === 429) {
        return { component: "Resend", category: CATEGORY.external, status: "degraded" as HealthStatus, latency, message: "Rate limited (HTTP 429)", details };
      }
      if (s2.status >= 500) {
        return { component: "Resend", category: CATEGORY.external, status: "degraded" as HealthStatus, latency, message: `Provider error (HTTP ${s2.status})`, details };
      }
      // 400/422 validation error = key accepted, payload (deliberately) invalid.
      return {
        component: "Resend", category: CATEGORY.external, status: "operational" as HealthStatus, latency,
        message: "Sending key accepted · domain verification not checkable with a sending-only key",
        details,
      };
    }

    const c = classify(r, settings);
    if (r.status === 400 && /api key/i.test(String(r.body?.message ?? ""))) {
      c.status = "down";
      c.message = `API key rejected: ${r.body?.message ?? "invalid"}`;
    }
    let status = c.status;
    let message = c.message;
    if (r.status === 200 && Array.isArray(r.body?.data)) {
      details.key_type = "full_access";
      const domains = r.body.data.map((d: any) => ({ name: d.name, status: d.status }));
      extras.resendDomains = domains;
      details.domains = domains;
      const unverified = domains.filter((d: any) => d.status !== "verified");
      if (status === "operational" && unverified.length > 0) {
        status = "degraded";
        message = `Domain not verified: ${unverified.map((d: any) => `${d.name} (${d.status})`).join(", ")}`;
      } else if (status === "operational" && domains.length === 0) {
        status = "degraded";
        message = "No sending domain configured";
      } else if (status === "operational") {
        message = `Responding normally · ${domains.length} sending domain(s) verified`;
      }
    }
    return { component: "Resend", category: CATEGORY.external, status, latency: r.latency, message, details };
  })());

  // Stripe — key validity + webhook endpoint registered and enabled
  checks.push((async () => {
    const key = Deno.env.get("STRIPE_SECRET_KEY");
    if (!key) return missingKey("Stripe", CATEGORY.external, "STRIPE_SECRET_KEY");
    const headers = { Authorization: `Bearer ${key}` };
    const [balance, endpoints] = await Promise.all([
      probe("https://api.stripe.com/v1/balance", { headers }, 8000, true),
      probe("https://api.stripe.com/v1/webhook_endpoints?limit=50", { headers }, 8000, true),
    ]);
    const c = classify(balance, settings);
    const details: Record<string, unknown> = {
      http_status: balance.status,
      mode: key.startsWith("sk_live") || key.startsWith("rk_live") ? "live" : "test",
    };
    let status = c.status;
    let message = c.message;
    if (endpoints.status === 200 && Array.isArray(endpoints.body?.data)) {
      const host = (() => { try { return new URL(supabaseUrl).host; } catch { return ""; } })();
      const list = endpoints.body.data.map((e: any) => ({ url: e.url, status: e.status, livemode: !!e.livemode }));
      extras.stripeEndpoints = list;
      const ours = list.filter((e: any) => (host && e.url.includes(host)) || e.url.includes("stripe-webhook"));
      details.webhook_endpoints = ours;
      if (status === "operational") {
        if (ours.length === 0) {
          status = "degraded";
          message = "No webhook endpoint registered for this project";
        } else if (ours.every((e: any) => e.status !== "enabled")) {
          status = "degraded";
          message = "Webhook endpoint is disabled in Stripe";
        }
      }
    }
    return { component: "Stripe", category: CATEGORY.external, status, latency: balance.latency, message, details };
  })());

  // Unkey: two questions, both must be yes for the card to be green.
  //   1. Is Unkey up and does it accept our root key?        (v2 API)
  //   2. Is the host the platform code actually calls alive?  (UNKEY_API_BASE)
  // Answering only the first one would show green while every API-key
  // authenticated request in the platform fails.
  checks.push((async () => {
    const key = Deno.env.get("UNKEY_ROOT_KEY");
    const apiId = Deno.env.get("UNKEY_API_ID");
    if (!key) return missingKey("Unkey", CATEGORY.external, "UNKEY_ROOT_KEY");
    if (!apiId) return missingKey("Unkey", CATEGORY.external, "UNKEY_API_ID");

    const service = await probe("https://api.unkey.com/v2/apis.getApi", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ apiId }),
    }, 8000, true);

    const base = String(UNKEY_API_BASE).replace(/\/+$/, "");
    const appHost = (() => { try { return new URL(base).host; } catch { return base; } })();
    const appOnV2 = base === "https://api.unkey.com/v2";
    const app = appOnV2
      ? service
      : await probe(`${base}/apis.getApi?apiId=${encodeURIComponent(apiId)}`, { headers: { Authorization: `Bearer ${key}` } }, 8000);

    const details = {
      service_http_status: service.status,
      service_api: "api.unkey.com/v2",
      platform_api_base: base,
      platform_host_reachable: app.reachable,
      platform_http_status: app.status,
    };
    const latency = appOnV2 ? service.latency : Math.max(service.latency, app.latency);

    const c = classify(service, settings);
    if (service.status === 404) { c.status = "down"; c.message = "Configured UNKEY_API_ID not found"; }
    if (c.status === "down") {
      return { component: "Unkey", category: CATEGORY.external, status: c.status, latency, message: c.message, details };
    }
    if (!app.reachable) {
      return {
        component: "Unkey", category: CATEGORY.external, status: "down" as HealthStatus, latency,
        message: `Platform code calls ${appHost}, which is unreachable. Unkey itself is up, but API-key authentication in the platform fails until the integration moves to api.unkey.com/v2.`,
        details,
      };
    }
    if (!appOnV2 && (app.status === 404 || app.status === 410 || app.status >= 500)) {
      return {
        component: "Unkey", category: CATEGORY.external, status: "degraded" as HealthStatus, latency,
        message: `Platform code calls ${appHost}, which answered HTTP ${app.status}`,
        details,
      };
    }
    return { component: "Unkey", category: CATEGORY.external, status: c.status, latency, message: c.message, details };
  })());

  // CDNs — any HTTP response from the edge proves the distribution is serving.
  checks.push((async () => {
    const r = await probe(`${ASSET_CDN.rings}/`, { method: "HEAD" });
    const c = classify(r, settings, [400, 403, 404, 405]);
    const message = c.status === "operational" ? "Edge is serving" : c.message;
    return { component: "Product Images CDN", category: CATEGORY.cdn, status: c.status, latency: r.latency, message, details: { http_status: r.status, probe: "HEAD / (distribution root)" } };
  })());
  checks.push((async () => {
    const r = await probe(`${ASSET_CDN.main}/`, { method: "HEAD" });
    const c = classify(r, settings, [400, 403, 404, 405]);
    const message = c.status === "operational" ? "Edge is serving" : c.message;
    return { component: "UI Assets CDN", category: CATEGORY.cdn, status: c.status, latency: r.latency, message, details: { http_status: r.status, probe: "HEAD / (distribution root)" } };
  })());

  const results = await Promise.all(checks);
  return { statuses: results.filter((s): s is ServiceStatus => s !== null), extras };
}

// ─── Quotas & usage ──────────────────────────────────────────────────────────

function levelFor(pct: number | null, settings: HealthSettings): QuotaLevel {
  if (pct === null) return "info";
  if (pct >= settings.critical_pct) return "critical";
  if (pct >= settings.warning_pct) return "warning";
  return "ok";
}

function pctOf(used: number, limit: number | null): number | null {
  if (limit === null || limit <= 0) return null;
  return Math.round((used / limit) * 10000) / 100;
}

async function countRows(supabase: any, table: string, build: (q: any) => any): Promise<number> {
  try {
    const q = build(supabase.from(table).select("id", { count: "exact", head: true }));
    const { count, error } = await q;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

interface EmailStats {
  sent_calls: number;
  sent_recipients: number;
  failed_calls: number;
  failed_recipients: number;
  skipped_calls: number;
}

export async function emailStats(supabase: any, fromIso: string, toIso: string): Promise<EmailStats | null> {
  try {
    const { data, error } = await supabase.rpc("get_platform_email_stats", { p_from: fromIso, p_to: toIso });
    if (error || !data) return null;
    return {
      sent_calls: Number(data.sent_calls ?? 0),
      sent_recipients: Number(data.sent_recipients ?? 0),
      failed_calls: Number(data.failed_calls ?? 0),
      failed_recipients: Number(data.failed_recipients ?? 0),
      skipped_calls: Number(data.skipped_calls ?? 0),
    };
  } catch {
    return null;
  }
}

const LOG_SOURCE_NOTE =
  "Counted from the platform email log, one per recipient (how Resend bills). Email sent from outside the platform with the same Resend account is not included.";

export async function collectQuotas(
  supabase: any,
  settings: HealthSettings,
  extras: ExternalCheckResult["extras"],
): Promise<QuotaMetric[]> {
  const now = new Date();
  const nowIso = now.toISOString();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [
    mailToday, mailMonth, mail24h,
    aiToday, aiTodayCached, aiMonth, aiMonthCached,
    webhooks24h, webhooksFailed24h,
    errors24h, errorsCritical24h, edgeErrors24h,
    dbSize, storageSize,
  ] = await Promise.all([
    emailStats(supabase, dayStart, nowIso),
    emailStats(supabase, monthStart, nowIso),
    emailStats(supabase, dayAgo, nowIso),
    countRows(supabase, "ai_usage_logs", (q) => q.gte("created_at", dayStart)),
    countRows(supabase, "ai_usage_logs", (q) => q.gte("created_at", dayStart).eq("cached", true)),
    countRows(supabase, "ai_usage_logs", (q) => q.gte("created_at", monthStart)),
    countRows(supabase, "ai_usage_logs", (q) => q.gte("created_at", monthStart).eq("cached", true)),
    countRows(supabase, "stripe_webhook_events", (q) => q.gte("processed_at", dayAgo)),
    countRows(supabase, "stripe_webhook_events", (q) => q.gte("processed_at", dayAgo).eq("status", "failed")),
    countRows(supabase, "system_errors", (q) => q.gte("timestamp", dayAgo)),
    countRows(supabase, "system_errors", (q) => q.gte("timestamp", dayAgo).eq("severity", "critical")),
    countRows(supabase, "system_errors", (q) => q.gte("timestamp", dayAgo).eq("error_source", "edge_function")),
    supabase.rpc("get_platform_db_size_bytes").then((r: any) => (r.error ? null : Number(r.data ?? 0))).catch(() => null),
    supabase.rpc("get_platform_storage_size_bytes").then((r: any) => (r.error ? null : Number(r.data ?? 0))).catch(() => null),
  ]);

  const metrics: QuotaMetric[] = [];
  const verified = settings.plan_limits_verified === true;
  const settingSource = (limit: number | null) =>
    limit === null ? "not set" : verified ? "settings (verified)" : "settings (unverified)";

  // Resend. Its own headers are the authority when it sends them. The daily
  // header exists only on the free plan, so its presence also identifies the plan.
  const rq = extras.resendQuota;
  const freePlanDetected = rq?.daily_used != null;
  const paidPlanDetected = !!rq && rq.monthly_used != null && rq.daily_used == null;

  {
    const fromResend = rq?.daily_used != null;
    const used = fromResend ? Number(rq!.daily_used) : (mailToday?.sent_recipients ?? null);
    // Paid plans have no daily limit at all.
    const limit = paidPlanDetected ? null : (freePlanDetected ? 100 : settings.resend_daily_limit);
    if (used !== null) {
      const pct = pctOf(used, limit);
      metrics.push({
        service: "resend", metric: "emails_today", label: "Emails today (UTC day)",
        used, limit, unit: "emails", pct, level: levelFor(pct, settings),
        details: {
          source: fromResend ? "resend" : "email_log",
          source_note: fromResend ? "Reported by Resend." : LOG_SOURCE_NOTE,
          limit_source: paidPlanDetected ? "paid plan: no daily limit" : freePlanDetected ? "resend free plan" : settingSource(limit),
          api_calls: mailToday?.sent_calls ?? null,
        },
      });
    }
  }
  {
    const fromResend = rq?.monthly_used != null;
    const used = fromResend ? Number(rq!.monthly_used) : (mailMonth?.sent_recipients ?? null);
    const limit = freePlanDetected ? 3000 : settings.resend_monthly_limit;
    if (used !== null) {
      const pct = pctOf(used, limit);
      metrics.push({
        service: "resend", metric: "emails_month", label: "Emails this month (UTC)",
        used, limit, unit: "emails", pct, level: levelFor(pct, settings),
        details: {
          source: fromResend ? "resend" : "email_log",
          source_note: fromResend ? "Reported by Resend." : LOG_SOURCE_NOTE,
          limit_source: freePlanDetected ? "resend free plan" : settingSource(limit),
          api_calls: mailMonth?.sent_calls ?? null,
        },
      });
    }
  }
  if (mail24h) {
    const attempted = mail24h.sent_recipients + mail24h.failed_recipients;
    const rate = attempted > 0 ? Math.round((mail24h.failed_recipients / attempted) * 10000) / 100 : 0;
    const level: QuotaLevel = attempted === 0 ? "info"
      : rate >= settings.email_failure_rate_pct ? "critical"
      : rate >= settings.email_failure_rate_pct / 2 ? "warning" : "ok";
    metrics.push({
      service: "resend", metric: "failure_rate_24h", label: "Emails rejected by Resend (24h)",
      used: rate, limit: settings.email_failure_rate_pct, unit: "%", pct: null, level,
      details: {
        attempted, failed: mail24h.failed_recipients, sent: mail24h.sent_recipients,
        source: "email_log",
        source_note: "A send counts as rejected when Resend returned no message id. Bounces and spam complaints after acceptance are not visible to the platform.",
        limit_source: "alert threshold",
      },
    });
  }

  // AI requests (platform log)
  const aiNote = "Requests recorded in the platform's AI usage log. Cached answers did not call an AI provider.";
  metrics.push({ service: "ai", metric: "requests_today", label: "AI requests today (UTC day)", used: aiToday, limit: null, unit: "requests", pct: null, level: "info", details: { cached: aiTodayCached, live: aiToday - aiTodayCached, source: "ai_usage_log", source_note: aiNote } });
  metrics.push({ service: "ai", metric: "requests_month", label: "AI requests this month (UTC)", used: aiMonth, limit: null, unit: "requests", pct: null, level: "info", details: { cached: aiMonthCached, live: aiMonth - aiMonthCached, source: "ai_usage_log", source_note: aiNote } });

  // Database & storage (measured)
  if (dbSize !== null) {
    const usedMb = Math.round((dbSize / (1024 * 1024)) * 10) / 10;
    const limit = settings.db_size_limit_mb;
    const pct = pctOf(usedMb, limit);
    metrics.push({ service: "supabase", metric: "db_size_mb", label: "Database size", used: usedMb, limit, unit: "MB", pct, level: levelFor(pct, settings), details: { source: "postgres", source_note: "Measured with pg_database_size.", limit_source: settingSource(limit) } });
  }
  if (storageSize !== null) {
    const usedMb = Math.round((storageSize / (1024 * 1024)) * 10) / 10;
    const limit = settings.storage_limit_mb;
    const pct = pctOf(usedMb, limit);
    metrics.push({ service: "supabase", metric: "storage_size_mb", label: "File storage used", used: usedMb, limit, unit: "MB", pct, level: levelFor(pct, settings), details: { source: "storage", source_note: "Sum of every stored object's size.", limit_source: settingSource(limit) } });
  }

  // Stripe webhooks (platform log)
  const stripeNote = "Events received by the platform's webhook handler. Events Stripe could not deliver at all never reach this log.";
  metrics.push({ service: "stripe", metric: "webhook_events_24h", label: "Stripe webhook events received (24h)", used: webhooks24h, limit: null, unit: "events", pct: null, level: "info", details: { source: "stripe_webhook_events", source_note: stripeNote } });
  {
    const threshold = settings.stripe_failed_webhooks_24h;
    const level: QuotaLevel = webhooksFailed24h >= threshold ? (webhooksFailed24h >= threshold * 5 ? "critical" : "warning") : "ok";
    metrics.push({ service: "stripe", metric: "webhook_failed_24h", label: "Stripe webhooks that failed processing (24h)", used: webhooksFailed24h, limit: threshold, unit: "events", pct: null, level, details: { source: "stripe_webhook_events", source_note: stripeNote, limit_source: "alert threshold" } });
  }

  // Errors (platform log)
  const errNote = "Only errors written to System Errors are counted. Code that fails without logging is not visible here.";
  metrics.push({ service: "errors", metric: "system_errors_24h", label: "Logged system errors (24h)", used: errors24h, limit: null, unit: "errors", pct: null, level: "info", details: { source: "system_errors", source_note: errNote } });
  {
    const level: QuotaLevel = errorsCritical24h === 0 ? "ok" : errorsCritical24h >= 10 ? "critical" : "warning";
    metrics.push({ service: "errors", metric: "critical_errors_24h", label: "Logged critical errors (24h)", used: errorsCritical24h, limit: null, unit: "errors", pct: null, level, details: { source: "system_errors", source_note: errNote } });
  }
  {
    const threshold = settings.edge_errors_per_day;
    const level: QuotaLevel = edgeErrors24h >= threshold ? "critical" : edgeErrors24h >= threshold / 2 ? "warning" : "ok";
    metrics.push({ service: "edge", metric: "errors_24h", label: "Logged edge function errors (24h)", used: edgeErrors24h, limit: threshold, unit: "errors", pct: null, level, details: { source: "system_errors", source_note: errNote, limit_source: "alert threshold" } });
  }

  return metrics;
}
