/**
 * heartbeat — tiny public liveness probe for an EXTERNAL uptime pinger.
 * It is hit every few minutes from outside Supabase, so an
 * alert still fires when the database itself is down and pg_cron cannot run
 * the daily platform-health-monitor.
 *
 * It does exactly one small read (the same query the health monitor uses),
 * never writes, and answers:
 *   200 {"ok":true,  "db":"ok",    "db_ms":N}
 *   503 {"ok":false, "db":"slow",  "db_ms":N}   latency above HEARTBEAT_SLOW_MS (default 4000)
 *   503 {"ok":false, "db":"error", "error":".."} query failed / cannot connect
 *
 * A non-2xx answer is what the pinger treats as DOWN, so nothing else is
 * needed on its side. Deep checks (API keys, credits, quotas) stay in the
 * daily platform-health-monitor; this endpoint must stay cheap.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";

const SLOW_MS = Number(Deno.env.get("HEARTBEAT_SLOW_MS") ?? "4000") || 4000;
const QUERY_TIMEOUT_MS = 10_000;

const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store, max-age=0",
  "Access-Control-Allow-Origin": "*",
};

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify({ ...body, ts: new Date().toISOString() }), { status, headers });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "GET" && req.method !== "HEAD") return reply(405, { ok: false, error: "GET only" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return reply(503, { ok: false, db: "error", error: "missing env" });

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const start = Date.now();
  try {
    const query = supabase.from("products").select("id").limit(1);
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`no answer in ${QUERY_TIMEOUT_MS}ms`)), QUERY_TIMEOUT_MS));
    const { error } = await Promise.race([query, timeout]);
    const db_ms = Date.now() - start;
    if (error) return reply(503, { ok: false, db: "error", db_ms, error: error.message });
    if (db_ms > SLOW_MS) return reply(503, { ok: false, db: "slow", db_ms, slow_ms: SLOW_MS });
    return reply(200, { ok: true, db: "ok", db_ms });
  } catch (e) {
    return reply(503, { ok: false, db: "error", db_ms: Date.now() - start, error: (e as Error).message });
  }
});
