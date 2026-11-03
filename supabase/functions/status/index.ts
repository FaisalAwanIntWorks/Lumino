/**
 * status — lightweight public/admin status endpoint.
 *
 * Public callers (no `admin` flag) get the core infrastructure checks only.
 * Admin callers (`?admin=true` or body `{ admin: true }`) also get the external
 * provider checks. Probing logic lives in _shared/platform-health-checks.ts and
 * is shared with `platform-health-monitor`, which owns persistence, incidents
 * and alerting — this endpoint never writes anything.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { loadSettings, runCoreChecks, runExternalChecks, type ServiceStatus } from "../_shared/platform-health-checks.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const url = new URL(req.url);

    // Liveness ping used by the health monitor to time the edge runtime
    // itself, without any database work in the measurement.
    if (url.searchParams.get('ping') === '1') {
      return new Response(
        JSON.stringify({ ok: true, timestamp: new Date().toISOString() }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    // Determine if admin mode
    const isAdmin = url.searchParams.get('admin') === 'true';

    // Also check body for supabase.functions.invoke usage
    let bodyAdmin = false;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        bodyAdmin = body?.admin === true;
      } catch { /* no body */ }
    }
    const fullCheck = isAdmin || bodyAdmin;

    const settings = await loadSettings(supabase);
    const statuses: ServiceStatus[] = await runCoreChecks(supabase, supabaseUrl, supabaseKey, settings, {
      probeEdgeFunctions: false, // this request *is* the edge function probe
      includeCron: fullCheck,
    });

    if (fullCheck) {
      const external = await runExternalChecks(settings, supabaseUrl);
      statuses.push(...external.statuses);
    }

    return new Response(
      JSON.stringify({ statuses, timestamp: new Date().toISOString() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (error) {
    console.error('Status check error', (error as Error).message);
    return new Response(
      JSON.stringify({ error: 'Status check failed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
