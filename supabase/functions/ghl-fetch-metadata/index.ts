// Edge function: ghl-fetch-metadata
// Fetches Pipelines (with stages) and Custom Fields from a GHL location so the
// Settings UI can offer dropdowns instead of raw IDs.
//
// Token resolution matches test-ghl-connection: an unsaved `token` from the
// body first, then the client's stored token, then the original
// DTT_GHL_PRIVATE_TOKEN secret so existing calls keep working.

import { getClientGhlToken, requireAgencyAdmin } from "../_shared/ghl-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

async function ghlGet(path: string, token: string) {
  const res = await fetch(`${GHL_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Version: GHL_VERSION,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  return { ok: res.ok, status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const denied = await requireAgencyAdmin(req);
  if (denied) return denied;

  try {
    const { location_id, resource, client_id, token: bodyToken } = await req.json();
    if (!location_id || !resource) {
      return new Response(JSON.stringify({ ok: false, error: "location_id and resource required" }), {
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

    let result;
    if (resource === "pipelines") {
      result = await ghlGet(`/opportunities/pipelines?locationId=${encodeURIComponent(location_id)}`, token);
      // Normalize: [{id, name, stages:[{id,name}]}]
      const pipelines = (result.body?.pipelines || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        stages: (p.stages || []).map((s: any) => ({ id: s.id, name: s.name })),
      }));
      return new Response(JSON.stringify({ ok: result.ok, status: result.status, pipelines, raw: result.body }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (resource === "custom_fields") {
      // GHL v2: GET /locations/{locationId}/customFields  (model=contact by default)
      result = await ghlGet(`/locations/${encodeURIComponent(location_id)}/customFields?model=contact`, token);
      const fields = (result.body?.customFields || []).map((f: any) => ({
        id: f.id,
        name: f.name,
        fieldKey: f.fieldKey,
        dataType: f.dataType,
      }));
      return new Response(JSON.stringify({ ok: result.ok, status: result.status, fields, raw: result.body }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: `Unknown resource: ${resource}` }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
