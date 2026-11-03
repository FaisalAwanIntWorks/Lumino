// Edge function: save-ghl-credentials
// Stores a client's GHL (CRM MVMNT) Private Integration Token.
//
// The token is written to public.client_ghl_credentials, which grants nothing
// to anon/authenticated — so the secret can never be read back by the browser.
// Only the last 4 characters are mirrored onto client_ghl_integrations so the
// Settings UI can show "•••• 1a2b" and know a token exists.
//
// Body: { client_id, token, location_id? }
//   - token: the new Private Integration Token. Pass an empty string to remove
//     the stored credential (disconnect).
//   - location_id: optional. When present the token is verified against
//     GET /locations/{id} before being stored, so a bad paste is rejected up
//     front instead of silently failing on the next lead.

import { createClient } from "npm:@supabase/supabase-js@2";
import { requireAgencyAdmin } from "../_shared/ghl-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const denied = await requireAgencyAdmin(req);
  if (denied) return denied;

  try {
    const { client_id, token, location_id } = await req.json();
    if (!client_id) return json(400, { ok: false, error: "client_id required" });
    if (typeof token !== "string") return json(400, { ok: false, error: "token required" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const trimmed = token.trim();

    // Empty token = disconnect.
    if (!trimmed) {
      await admin.from("client_ghl_credentials").delete().eq("client_id", client_id);
      await admin
        .from("client_ghl_integrations")
        .update({ token_last4: null, connection_verified_at: null })
        .eq("client_id", client_id);
      return json(200, { ok: true, removed: true });
    }

    // Verify before storing, when we know which location to check against.
    let verifiedAt: string | null = null;
    if (location_id) {
      const res = await fetch(`${GHL_BASE}/locations/${encodeURIComponent(location_id)}`, {
        headers: {
          Authorization: `Bearer ${trimmed}`,
          Version: GHL_VERSION,
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        const text = await res.text();
        // 200 + ok:false so supabase-js surfaces this message to the admin
        // instead of a generic "non-2xx status code".
        return json(200, {
          ok: false,
          error: `Token could not read location ${location_id} (HTTP ${res.status})`,
          details: text.slice(0, 500),
        });
      }
      verifiedAt = new Date().toISOString();
    }

    const { error: credErr } = await admin
      .from("client_ghl_credentials")
      .upsert({ client_id, private_token: trimmed }, { onConflict: "client_id" });
    if (credErr) return json(500, { ok: false, error: credErr.message });

    // Mirror the display-only fields. The integration row is upserted by the
    // Settings UI immediately before this call, so it exists by now.
    await admin
      .from("client_ghl_integrations")
      .update({ token_last4: trimmed.slice(-4), connection_verified_at: verifiedAt })
      .eq("client_id", client_id);

    return json(200, { ok: true, token_last4: trimmed.slice(-4), verified: !!verifiedAt });
  } catch (err) {
    console.error("save-ghl-credentials error:", err);
    return json(500, { ok: false, error: String(err) });
  }
});
