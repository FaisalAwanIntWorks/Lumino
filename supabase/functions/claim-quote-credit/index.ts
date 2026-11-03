import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { getClientGhlToken } from "../_shared/ghl-auth.ts";
import { toE164 } from "../_shared/dtt-phone.ts";

/**
 * Quote Estimator claim step — record the mobile number the customer hands
 * over on the final screen so it travels with the lead the store already has.
 *
 * Public (verify_jwt = false): the widget runs anonymously inside an iframe on
 * the retailer's site. The anon role has no UPDATE access to leads, so the
 * write happens here with the service role and is scoped to the exact lead id
 * plus its owning client id.
 *
 * What it writes:
 *   - claim_phone / claim_phone_at: always (the number the credit is texted to).
 *   - country_code / phone_number: only when the number differs from the one
 *     given on the contact step, so Leads & Bookings shows the SMS number.
 *   - CRM: when the number changed and the client syncs to GoHighLevel, the
 *     contact the insert trigger already created is updated in place
 *     (PUT /contacts/{id}) using the id kept in ghl_sync_logs. If the sync has
 *     not created the contact yet, it will read the updated row itself.
 *
 * No email, no SMS send, no tracking.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const E164_RE = /^\+[1-9]\d{6,14}$/;

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

// The insert trigger fires sync-dtt-ghl-lead the moment the lead row lands;
// the customer usually taps "Text me" a few seconds later. Poll the sync log
// briefly so a contact that is being created right now is still caught.
const CONTACT_LOOKUP_ATTEMPTS = 5;
const CONTACT_LOOKUP_DELAY_MS = 2000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Explicit generics: ReturnType<typeof createClient> falls back to the
// library's default Database (unknown), which collapses every table row to
// `never` and breaks the queries below.
type Admin = SupabaseClient<any, "public", any>;

async function ghlCall(token: string, method: "PUT" | "POST", path: string, body: unknown, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${GHL_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Version: GHL_VERSION,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let parsed: any = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      return { ok: res.ok, status: res.status, json: parsed };
    } catch (e) {
      if (attempt < retries) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
}

/**
 * Push the new phone onto the GHL contact that sync-dtt-ghl-lead created for
 * this lead. Logged to ghl_sync_logs under stage "phone_update" so the
 * outcome is visible next to the rest of the lead's sync history.
 */
async function updateCrmPhone(
  admin: Admin,
  clientId: string,
  leadId: string,
  phone: string,
  previous: string | undefined,
  countryCode: string,
  nationalNumber: string,
) {
  const log = async (status: string, extra: Record<string, unknown> = {}) => {
    try {
      await admin.from("ghl_sync_logs").insert({
        client_id: clientId,
        lead_id: leadId,
        stage: "phone_update",
        status,
        ghl_contact_id: (extra.ghl_contact_id as string) ?? null,
        ghl_response: extra.ghl_response ?? null,
        error: (extra.error as string) ?? null,
      });
    } catch (e) {
      console.error("claim-quote-credit: failed to write ghl_sync_logs:", e);
    }
  };

  try {
    // Same gate the insert trigger + sync function apply: an enabled Diamond
    // Form integration with a location. Clients without GHL simply skip.
    const { data: cfg } = await admin
      .from("client_ghl_integrations")
      .select("enabled, location_id")
      .eq("client_id", clientId)
      .eq("form_type", "diamond")
      .maybeSingle();
    if (!cfg?.enabled || !cfg.location_id) return;

    const token = await getClientGhlToken(clientId);
    if (!token) {
      await log("error", { error: "No GHL token configured for this client" });
      return;
    }

    let contactId: string | undefined;
    for (let attempt = 0; attempt < CONTACT_LOOKUP_ATTEMPTS; attempt++) {
      const { data: rows } = await admin
        .from("ghl_sync_logs")
        .select("ghl_contact_id")
        .eq("lead_id", leadId)
        .eq("stage", "contact")
        .eq("status", "success")
        .not("ghl_contact_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(1);
      contactId = rows?.[0]?.ghl_contact_id ?? undefined;
      if (contactId) break;
      await sleep(CONTACT_LOOKUP_DELAY_MS);
    }

    if (!contactId) {
      // The lead row already carries the new number, so when the sync runs
      // (or is retried) it creates the contact with the updated phone.
      await log("skipped", {
        error: "No GHL contact yet; sync will use the updated phone",
        ghl_response: { phone, previous },
      });
      return;
    }

    // 1) The contact's own phone field.
    const res = await ghlCall(token, "PUT", `/contacts/${contactId}`, { phone });
    await log(res.ok ? "success" : "error", {
      ghl_contact_id: contactId,
      ghl_response: { ...(res.json ?? {}), phone, previous },
      error: res.ok ? undefined : `HTTP ${res.status}`,
    });
    if (!res.ok) return;

    // 2) Any custom fields the client mapped to the phone columns, so a
    //    "Phone" custom field does not keep showing the contact-step number.
    const { data: mappings } = await admin
      .from("client_ghl_field_mappings")
      .select("question_key, ghl_custom_field_id")
      .eq("client_id", clientId)
      .eq("form_type", "diamond")
      .in("question_key", ["phone_number", "country_code", "claim_phone"]);
    const customFields = (mappings || [])
      .filter((m: any) => m.ghl_custom_field_id)
      .map((m: any) => ({
        id: m.ghl_custom_field_id as string,
        value:
          m.question_key === "country_code" ? countryCode
          : m.question_key === "phone_number" ? nationalNumber
          : phone,
      }));
    if (customFields.length) {
      const cf = await ghlCall(token, "PUT", `/contacts/${contactId}`, { customFields });
      await log(cf.ok ? "success" : "error", {
        ghl_contact_id: contactId,
        ghl_response: { stage: "phone_update_custom_fields", ...(cf.json ?? {}) },
        error: cf.ok ? undefined : `HTTP ${cf.status}`,
      });
    }

    // 3) A note on the contact, so the change is visible in the CRM's Notes
    //    tab next to the original submission note (which is never rewritten).
    const noteRes = await ghlCall(token, "POST", `/contacts/${contactId}/notes`, {
      body: `Phone number updated on the Quote Estimator claim screen

previous: ${previous ?? "(none)"}
new: ${phone}`,
    });
    await log(noteRes.ok ? "success" : "error", {
      ghl_contact_id: contactId,
      ghl_response: { stage: "phone_update_note", ...(noteRes.json ?? {}) },
      error: noteRes.ok ? undefined : `HTTP ${noteRes.status}`,
    });
  } catch (e) {
    console.error("claim-quote-credit: CRM phone update failed:", e);
    await log("error", { error: String((e as Error)?.message ?? e) });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { leadId, clientId, phone, countryCode, phoneNumber } = await req.json();

    if (!UUID_RE.test(String(leadId ?? "")) || !UUID_RE.test(String(clientId ?? ""))) {
      return json({ error: "Invalid request" }, 400);
    }
    const normalized = String(phone ?? "").replace(/[\s()-]/g, "");
    if (!E164_RE.test(normalized)) {
      return json({ error: "Invalid phone number" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: lead, error: leadErr } = await supabase
      .from("diamond_form_leads")
      .select("id, country_code, phone_number")
      .eq("id", leadId)
      .eq("client_id", clientId)
      .maybeSingle();

    if (leadErr) {
      console.error("claim-quote-credit lead lookup failed:", leadErr);
      return json({ error: "Could not record the number" }, 500);
    }
    if (!lead) {
      return json({ error: "Lead not found" }, 404);
    }

    const previous = toE164(lead.country_code, lead.phone_number);
    const changed = previous !== normalized;

    const update: Record<string, unknown> = {
      claim_phone: normalized,
      claim_phone_at: new Date().toISOString(),
    };

    if (changed) {
      // Prefer the split the widget sent (dial code + national digits) when it
      // agrees with the E.164 number; otherwise store the full number and
      // leave the dial code empty so toE164() still yields the same value.
      const cc = String(countryCode ?? "").replace(/[^\d]/g, "");
      const national = String(phoneNumber ?? "").replace(/[^\d]/g, "");
      if (cc && national && toE164(cc, national) === normalized) {
        update.country_code = `+${cc}`;
        update.phone_number = national;
      } else {
        update.country_code = "";
        update.phone_number = normalized;
      }
    }

    const { error } = await supabase
      .from("diamond_form_leads")
      .update(update)
      .eq("id", leadId)
      .eq("client_id", clientId);

    if (error) {
      console.error("claim-quote-credit update failed:", error);
      return json({ error: "Could not record the number" }, 500);
    }

    if (changed) {
      // Run the CRM update before responding. A background task
      // (EdgeRuntime.waitUntil) was observed to be dropped after the response,
      // leaving the GHL contact on the old number; the claim screen shows a
      // sending state while this completes.
      await updateCrmPhone(
        supabase,
        clientId,
        leadId,
        normalized,
        previous,
        String(update.country_code ?? lead.country_code ?? ""),
        String(update.phone_number ?? lead.phone_number ?? ""),
      );
    }

    return json({ success: true, phoneChanged: changed });
  } catch (err) {
    console.error("claim-quote-credit error:", err);
    return json({ error: "Unexpected error" }, 500);
  }
});
