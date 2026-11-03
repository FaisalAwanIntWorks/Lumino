// Edge function: test-ghl-connection
// Verifies a GHL Private Integration Token can read the supplied location.
//
// Token resolution order:
//   1. `token` in the request body — used while an admin is typing a new one,
//      so they can verify before saving.
//   2. The client's stored token (client_ghl_credentials, DTT falls back to
//      the DTT_GHL_PRIVATE_TOKEN secret) when `client_id` is supplied.
//   3. DTT_GHL_PRIVATE_TOKEN — the original behaviour, kept so existing calls
//      that send only `location_id` keep working unchanged.

import { getClientGhlToken, requireAgencyAdmin } from "../_shared/ghl-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const denied = await requireAgencyAdmin(req);
  if (denied) return denied;

  try {
    const { location_id, client_id, token: bodyToken } = await req.json();
    if (!location_id) {
      return new Response(JSON.stringify({ ok: false, error: "location_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = (typeof bodyToken === "string" && bodyToken.trim())
      || (client_id ? await getClientGhlToken(client_id) : null)
      || Deno.env.get("DTT_GHL_PRIVATE_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ ok: false, error: "No token configured for this client" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(`${GHL_BASE}/locations/${location_id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Version: GHL_VERSION,
        Accept: "application/json",
      },
    });
    const text = await res.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }

    return new Response(
      JSON.stringify({ ok: res.ok, status: res.status, body }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
