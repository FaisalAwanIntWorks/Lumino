// Meta Conversions API (CAPI)
// Mirrors browser Pixel Lead/Schedule events server-side for deduplication.
// Public function (verify_jwt = false).
// DTT keeps its dedicated pixel/token pair; every other client uses the
// meta_pixel_id + meta_capi_access_token stored on their own account.

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DTT_CLIENT_ID = 'aeec6491-bd1f-4787-97f9-6a47a2ddc8af';
const DTT_PIXEL_ID = '837690850976474';
const ALLOWED_EVENTS = new Set(['Lead', 'Schedule']);
const GRAPH_VERSION = 'v21.0';


async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const norm = (v?: string | null) => (v ?? '').toString().trim().toLowerCase();
const normPhone = (v?: string | null) => (v ?? '').toString().replace(/[^\d]/g, '');

function getClientIp(req: Request): string | undefined {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || undefined;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const {
      clientId,
      eventName,
      eventId,
      eventSourceUrl,
      userData = {},
      customData = {},
      testEventCode,
    } = body ?? {};

    if (!clientId || typeof clientId !== 'string') {
      return new Response(JSON.stringify({ error: 'client_id_required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!ALLOWED_EVENTS.has(eventName)) {
      return new Response(JSON.stringify({ error: 'event_not_supported' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve the pixel + access token for this client.
    let pixelId: string | null = null;
    let accessToken: string | null = null;

    if (clientId === DTT_CLIENT_ID) {
      pixelId = DTT_PIXEL_ID;
      accessToken = Deno.env.get('META_CAPI_ACCESS_TOKEN_DTT') ?? null;
    }

    if (!accessToken || !pixelId) {
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const { data: client } = await admin
        .from('clients')
        .select('meta_pixel_id, meta_capi_access_token')
        .eq('id', clientId)
        .maybeSingle();

      pixelId = pixelId || (client?.meta_pixel_id ?? null);
      accessToken = accessToken || (client?.meta_capi_access_token ?? null);
    }
    // Stray whitespace from pasting makes Meta reject the token.
    if (accessToken) accessToken = accessToken.replace(/\s+/g, '') || null;

    if (!pixelId || !accessToken) {
      // Not an error for the widget — the browser pixel still fired.
      return new Response(JSON.stringify({ skipped: 'capi_not_configured' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }



    const ip = getClientIp(req);
    const ua = req.headers.get('user-agent') || undefined;

    const ud: Record<string, unknown> = {};
    if (userData.email)     ud.em = [await sha256Hex(norm(userData.email))];
    if (userData.phone)     ud.ph = [await sha256Hex(normPhone(userData.phone))];
    if (userData.firstName) ud.fn = [await sha256Hex(norm(userData.firstName))];
    if (userData.lastName)  ud.ln = [await sha256Hex(norm(userData.lastName))];
    if (userData.country)   ud.country = [await sha256Hex(norm(userData.country))];
    if (userData.externalId) ud.external_id = [await sha256Hex(norm(userData.externalId))];
    if (userData.fbc) ud.fbc = userData.fbc;
    if (userData.fbp) ud.fbp = userData.fbp;
    if (ip) ud.client_ip_address = ip;
    if (ua) ud.client_user_agent = ua;

    const event: Record<string, unknown> = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_source_url: eventSourceUrl || undefined,
      event_id: eventId || crypto.randomUUID(),
      user_data: ud,
      custom_data: customData,
    };

    const payload: Record<string, unknown> = { data: [event] };
    if (testEventCode) payload.test_event_code = testEventCode;

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;
    const fbRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const fbJson = await fbRes.json().catch(() => ({}));

    if (!fbRes.ok) {
      console.error('[meta-capi] Graph API error', fbRes.status, fbJson);
      return new Response(JSON.stringify({ error: 'graph_api_error', status: fbRes.status, details: fbJson }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, eventId: event.event_id, fb: fbJson }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[meta-capi] error', err);
    return new Response(JSON.stringify({ error: 'internal_error', message: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
