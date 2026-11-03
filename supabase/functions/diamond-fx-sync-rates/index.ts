// Sync Rates for the admin diamond FX panel.
//
// Fetches USD -> GBP and USD -> CAD from Metals-API at the moment the admin
// clicks, records the quote (diamond_fx_rate_fetches) and returns it as a
// suggestion. It never prices, stages or publishes diamonds: that only happens
// when the admin clicks Apply (apply_diamond_fx_rates).
//
// Only rates.GBP and rates.CAD are read (GBP / CAD per 1 USD). The USDGBP /
// USDCAD keys in the same response are the inverse (USD per 1 GBP / CAD).
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const PROVIDER = 'metals-api.com';

// Mirrors _diamond_fx_check_rates in migration 20261028120000.
const inRange = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Not authenticated' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Admin with write access only (read-only admin staff are refused).
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: userId, error: authError } = await userClient.rpc('diamond_fx_assert_admin_write');
    if (authError || !userId) return json({ error: 'Admin write access required' }, 403);

    const apiKey = Deno.env.get('METALS_API_KEY');
    if (!apiKey) return json({ error: 'FX API key is not configured (METALS_API_KEY)' }, 500);

    // The URL carries the key: never log it.
    const res = await fetch(`https://metals-api.com/api/latest?access_key=${apiKey}&base=USD&symbols=GBP,CAD`);
    if (!res.ok) {
      console.error(`FX provider HTTP ${res.status}`);
      return json({ error: `FX provider returned HTTP ${res.status}. Enter the rates manually if needed.` }, 502);
    }
    const body = await res.json();
    if (!body?.success) {
      console.error('FX provider success=false', JSON.stringify(body?.error ?? {}));
      return json({ error: 'FX provider returned an error. Enter the rates manually if needed.' }, 502);
    }
    if (String(body.base ?? '').toUpperCase() !== 'USD') {
      return json({ error: `FX provider answered with base ${body.base}, expected USD.` }, 502);
    }

    const gbp = Number(body.rates?.GBP);
    const cad = Number(body.rates?.CAD);
    if (!inRange(gbp, 0.4, 1.2) || !inRange(cad, 1.0, 2.0)) {
      return json({ error: `FX quote looks wrong (GBP ${body.rates?.GBP}, CAD ${body.rates?.CAD}). Not used.` }, 502);
    }

    const providerTs = Number(body.timestamp);
    const providerTimestamp = Number.isFinite(providerTs) && providerTs > 0
      ? new Date(providerTs * 1000).toISOString()
      : null;

    const service = createClient(supabaseUrl, serviceKey);
    const { data: fetchRow, error: recordError } = await service.rpc('record_diamond_fx_fetch', {
      p_usd_to_gbp: String(body.rates.GBP),
      p_usd_to_cad: String(body.rates.CAD),
      p_provider: PROVIDER,
      p_provider_timestamp: providerTimestamp,
      p_fetched_by: userId,
    });
    if (recordError) {
      console.error('record_diamond_fx_fetch failed:', recordError.message);
      return json({ error: 'Could not record the fetched rates' }, 500);
    }

    return json({
      fetch_id: fetchRow?.id ?? null,
      base: 'USD',
      quotes: { GBP: String(body.rates.GBP), CAD: String(body.rates.CAD) },
      source: PROVIDER,
      provider_timestamp: providerTimestamp,
      fetched_at: fetchRow?.fetched_at ?? new Date().toISOString(),
      status: 'suggested_only',
    });
  } catch (error) {
    console.error('diamond-fx-sync-rates error:', error instanceof Error ? error.message : String(error));
    return json({ error: 'Failed to sync rates' }, 500);
  }
});
