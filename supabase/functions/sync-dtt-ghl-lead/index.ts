// Edge function: sync-dtt-ghl-lead
// Fires after a Diamond Form lead is saved. Creates a new contact in
// GoHighLevel, an opportunity, a note with the full submission, and writes
// mapped custom-field values.
//
// Works for any client that has an enabled row in client_ghl_integrations.
// DTT keeps its original behaviour: its token still falls back to the
// DTT_GHL_PRIVATE_TOKEN secret and its slug→label dictionary is still applied.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  fetchGhlFieldMeta,
  isNaturalFlowLead,
  PRICE_QUESTION_KEYS,
  translateMappingValue,
  type TranslateWarning,
} from "../_shared/dtt-ghl-value-map.ts";
import { joinCrmValuesForNote } from "../_shared/crm-value-format.ts";
import { getClientGhlToken, requireServiceRole } from "../_shared/ghl-auth.ts";
import { toE164 } from "../_shared/dtt-phone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DTT_CLIENT_ID = "aeec6491-bd1f-4787-97f9-6a47a2ddc8af";
const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

interface ReqBody {
  client_id: string;
  lead_id: string;
  // Re-run only the opportunity stage for a lead that already synced but never
  // got its own card (GHL's OPPORTUNITY_NO_DUPLICATE).
  force_opportunity?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// GHL request helper with retry on transient failures (rate limit / 5xx /
// network). Non-transient responses (e.g. 400 duplicate) return immediately so
// the caller's own handling still runs.
async function ghl(token: string, path: string, init: RequestInit = {}, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`${GHL_BASE}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          Version: GHL_VERSION,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(init.headers || {}),
        },
      });
      const text = await res.text();
      let json: any = null;
      try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      return { ok: res.ok, status: res.status, json };
    } catch (e) {
      // Network-level error — back off and retry a couple of times.
      if (attempt < retries) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
}

function formatLeadAsNote(lead: any, omitPrices = false): string {
  const lines: string[] = ["Diamond Form submission", ""];
  const skip = new Set(["id", "client_id", "created_at", "updated_at"]);
  if (omitPrices) for (const k of PRICE_QUESTION_KEYS) skip.add(k);
  for (const [k, v] of Object.entries(lead)) {
    if (skip.has(k)) continue;
    if (v === null || v === undefined || v === "") continue;
    const val = Array.isArray(v)
      ? joinCrmValuesForNote(v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))))
      : typeof v === "object" ? JSON.stringify(v) : String(v);
    if (val === "") continue;
    lines.push(`${k}: ${val}`);
  }
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Internal only — invoked by the diamond_form_leads trigger with the
  // service-role key. Reject any other caller (closes the "public anon key can
  // call sync" hole).
  const denied = await requireServiceRole(req);
  if (denied) return denied;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Set once the request body is parsed; log() falls back to DTT only so an
  // early parse failure still lands somewhere visible, as it did before.
  let logClientId = DTT_CLIENT_ID;

  const log = async (lead_id: string | null, stage: string, status: string, extra: Record<string, unknown> = {}) => {
    try {
      await supabase.from("ghl_sync_logs").insert({
        client_id: logClientId,
        lead_id,
        stage,
        status,
        ghl_contact_id: (extra.ghl_contact_id as string) ?? null,
        ghl_response: extra.ghl_response ?? null,
        error: (extra.error as string) ?? null,
      });
    } catch (e) {
      console.error("Failed to write ghl_sync_logs:", e);
    }
  };

  try {
    const body = (await req.json()) as ReqBody;
    if (!body?.client_id || !body?.lead_id) {
      return new Response(JSON.stringify({ error: "client_id and lead_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const clientId = body.client_id;
    logClientId = clientId;
    const isDtt = clientId === DTT_CLIENT_ID;

    // Per-client Private Integration Token; DTT falls back to the original
    // DTT_GHL_PRIVATE_TOKEN secret inside getClientGhlToken().
    const token = await getClientGhlToken(clientId);
    if (!token) {
      await log(body.lead_id, "overall", "error", { error: "No GHL token configured for this client" });
      return new Response(JSON.stringify({ error: "Token not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load config + mappings + lead in parallel.
    //
    // form_type = 'diamond' is REQUIRED: a client can now also have grillz /
    // enquiry / metal / ring_* rows. Without the filter maybeSingle() would
    // error on multiple rows (silently disabling this sync) and the mappings
    // query would push another form's answers onto a Diamond Form lead.
    // Every pre-existing row defaults to 'diamond', so behaviour is unchanged.
    const [cfgRes, mapRes, leadRes] = await Promise.all([
      supabase.from("client_ghl_integrations").select("*")
        .eq("client_id", clientId).eq("form_type", "diamond").maybeSingle(),
      supabase.from("client_ghl_field_mappings").select("*")
        .eq("client_id", clientId).eq("form_type", "diamond"),
      supabase.from("diamond_form_leads").select("*").eq("id", body.lead_id).maybeSingle(),
    ]);

    const cfg = cfgRes.data;
    const mappings = mapRes.data || [];
    const lead = leadRes.data;

    if (!cfg?.enabled) {
      return new Response(JSON.stringify({ skipped: true, reason: "Integration disabled" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!cfg.location_id) {
      await log(body.lead_id, "overall", "error", { error: "location_id missing" });
      return new Response(JSON.stringify({ error: "location_id missing" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!lead) {
      await log(body.lead_id, "overall", "error", { error: "lead not found" });
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Now that more than one client can sync, make sure the lead really belongs
    // to the client whose token and config we are about to use.
    if (lead.client_id !== clientId) {
      await log(body.lead_id, "overall", "error", { error: "lead does not belong to client_id" });
      return new Response(JSON.stringify({ error: "Lead/client mismatch" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: inspect prior sync attempts for this lead so a re-fire of the
    // trigger / a manual retry never creates duplicate contacts, opportunities
    // or notes. Completed stages are skipped; a previously created contact is
    // reused. This also makes the function a safe "retry the failed lead" path.
    const { data: priorLogs } = await supabase
      .from("ghl_sync_logs")
      .select("stage,status,ghl_contact_id")
      .eq("lead_id", body.lead_id);
    const priors = priorLogs || [];
    const force = body.force_opportunity === true;
    const overallDone = priors.some((l) => l.stage === "overall" && l.status === "success");
    if (overallDone && !force) {
      return new Response(JSON.stringify({ skipped: true, reason: "already synced" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const priorContactId: string | undefined =
      priors.find((l) => l.stage === "contact" && l.status === "success" && l.ghl_contact_id)?.ghl_contact_id ?? undefined;
    const oppDone = !force && priors.some((l) => l.stage === "opportunity" && l.status === "success");
    // On a forced opportunity re-run, never re-attach the note or re-push
    // custom fields — only the missing card is what we are after.
    const noteDone = force || priors.some((l) => l.stage === "note" && l.status === "success");

    // Build customFields[] from mappings, translating DB slugs into the actual
    // GHL picklist labels so RADIO/SINGLE/MULTI dropdowns render correctly.
    const fieldMeta = await fetchGhlFieldMeta(token, cfg.location_id).catch((e) => {
      console.error("fetchGhlFieldMeta failed:", e);
      return new Map();
    });
    const leadMap = lead as Record<string, unknown>;
    // Natural chain shows no prices in the form, so the CRM gets none either:
    // the quote field is left out and option names go without "(+$…)".
    const isNatural = isNaturalFlowLead(leadMap);
    const priceMappings = isNatural
      ? mappings.filter((m: any) => PRICE_QUESTION_KEYS.has(m.question_key))
      : [];
    const translateWarnings: TranslateWarning[] = [];
    const customFields = mappings
      .filter((m: any) => !(isNatural && PRICE_QUESTION_KEYS.has(m.question_key)))
      .map((m: any) =>
        translateMappingValue(
          m.question_key,
          m.ghl_custom_field_id,
          leadMap[m.question_key],
          fieldMeta.get(m.ghl_custom_field_id),
          translateWarnings,
          { useDttSlugMap: isDtt, omitPrices: isNatural },
        )
      )
      .filter((x: unknown): x is { id: string; value: string | string[] } => x !== null);

    if (translateWarnings.length) {
      await log(body.lead_id, "custom_fields", "value_unmatched", {
        ghl_response: { warnings: translateWarnings },
        error: `${translateWarnings.length} slug(s) not in GHL picklist`,
      });
    }

    // 1) Create contact — skipped when a prior attempt already created one for
    // this lead (idempotency). GHL enforces uniqueness on email/phone in v2;
    // on a duplicate it returns HTTP 400 with `meta.contactId`, which we reuse
    // so the opportunity + note + custom fields still attach to the right contact.
    let contactId: string | undefined = priorContactId;

    if (!contactId) {
      const phone = toE164(lead.country_code, lead.phone_number);

      const contactPayload: Record<string, unknown> = {
        locationId: cfg.location_id,
        firstName: lead.first_name || "Lead",
        email: lead.email || undefined,
        phone,
        source: "JewlX Diamond Form",
        customFields: customFields.length ? customFields : undefined,
      };

      const contactRes = await ghl(token, "/contacts/", {
        method: "POST",
        body: JSON.stringify(contactPayload),
      });

      contactId =
        contactRes.json?.contact?.id || contactRes.json?.id || contactRes.json?.contactId;

      // Duplicate-contact fallback.
      if (!contactRes.ok && !contactId) {
        const dupId = contactRes.json?.meta?.contactId;
        if (dupId) {
          contactId = dupId;
          await log(body.lead_id, "contact", "success", {
            ghl_contact_id: contactId,
            ghl_response: { reused_existing: true, original: contactRes.json },
          });
          // Push custom fields onto the existing contact via PUT.
          if (customFields.length) {
            const upd = await ghl(token, `/contacts/${contactId}`, {
              method: "PUT",
              body: JSON.stringify({ customFields }),
            });
            await log(body.lead_id, "custom_fields", upd.ok ? "success" : "error", {
              ghl_contact_id: contactId,
              ghl_response: upd.json,
              error: upd.ok ? undefined : `HTTP ${upd.status}`,
            });
          }
          // Natural lead on a returning contact: blank the quote left behind by
          // an earlier Lab submission. Sent on its own so a rejected clear can
          // never block the answers above.
          if (priceMappings.length) {
            const clr = await ghl(token, `/contacts/${contactId}`, {
              method: "PUT",
              body: JSON.stringify({
                customFields: priceMappings.map((m: any) => ({ id: m.ghl_custom_field_id, value: "" })),
              }),
            });
            await log(body.lead_id, "custom_fields_price_clear", clr.ok ? "success" : "error", {
              ghl_contact_id: contactId,
              ghl_response: clr.json,
              error: clr.ok ? undefined : `HTTP ${clr.status}`,
            });
          }
        } else {
          await log(body.lead_id, "contact", "error", {
            error: `HTTP ${contactRes.status}`,
            ghl_response: contactRes.json,
          });
          return new Response(JSON.stringify({ error: "Contact create failed", details: contactRes.json }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else if (contactRes.ok) {
        await log(body.lead_id, "contact", "success", { ghl_contact_id: contactId, ghl_response: contactRes.json });
      }

      if (!contactId) {
        return new Response(JSON.stringify({ error: "No contact id returned", details: contactRes.json }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Track whether any stage failed this run. If so we deliberately do NOT
    // mark the overall sync as success, so a re-invocation retries the missing
    // stage instead of short-circuiting on "already synced".
    let hadError = false;

    // 2) Opportunity (only if pipeline + stage configured, and not already created)
    if (cfg.pipeline_id && cfg.stage_id && !oppDone) {
      let monetaryValue: number | undefined;
      if (cfg.value_source === "estimated_total") {
        monetaryValue = isNatural ? undefined : (Number(lead.estimated_total) || undefined);
      }
      else if (cfg.value_source === "fixed") monetaryValue = Number(cfg.fixed_value) || undefined;

      const oppName = (cfg.opportunity_name_template || "Diamond Form — {customer_name}")
        .replace("{customer_name}", lead.first_name || "Lead")
        .replace("{email}", lead.email || "")
        .replace("{lead_id}", body.lead_id);

      const createOpp = (name: string) =>
        ghl(token, "/opportunities/", {
          method: "POST",
          body: JSON.stringify({
            pipelineId: cfg.pipeline_id,
            pipelineStageId: cfg.stage_id,
            locationId: cfg.location_id,
            name,
            status: cfg.opportunity_status || "open",
            contactId,
            monetaryValue,
          }),
        });

      const isDuplicate = (r: { ok: boolean; status: number; json: any }) =>
        !r.ok && r.status === 400 && r.json?.code === "OPPORTUNITY_NO_DUPLICATE";

      let oppRes = await createOpp(oppName);
      let forced = false;
      let existingId: string | null = null;

      // GHL refuses a second *open* opportunity for the same contact in the same
      // pipeline (OPPORTUNITY_NO_DUPLICATE). We still want one card per
      // submission, so retry with a disambiguated name — GHL accepts it when the
      // existing deal lives in another pipeline or is already closed.
      if (isDuplicate(oppRes)) {
        existingId = oppRes.json?.meta?.existingId ?? null;
        const stamp = new Date(
          String((lead as Record<string, unknown>).created_at ?? Date.now()),
        ).toISOString().slice(0, 10);
        const retry = await createOpp(`${oppName} — Quote Estimator (${stamp})`);
        if (retry.ok) {
          oppRes = retry;
          forced = true;
        }
      }

      const duplicateOpp = isDuplicate(oppRes);
      const stageName = oppRes.ok
        ? (forced ? "opportunity_duplicate_forced" : "opportunity")
        : duplicateOpp
          ? "opportunity_duplicate_merged"
          : "opportunity";

      if (!oppRes.ok && !duplicateOpp) hadError = true;
      await log(body.lead_id, stageName, oppRes.ok || duplicateOpp ? "success" : "error", {
        ghl_contact_id: contactId,
        ghl_response: duplicateOpp
          ? {
              duplicate: true,
              existingId,
              forced: false,
              reason: "GHL refused a second open opportunity even with a distinct name",
            }
          : oppRes.json,
        error: oppRes.ok || duplicateOpp ? undefined : `HTTP ${oppRes.status}`,
      });
      // The idempotency check keys off the "opportunity" stage; make sure a
      // forced/merged run also marks this stage done for future retries.
      if (stageName !== "opportunity" && (oppRes.ok || duplicateOpp)) {
        await log(body.lead_id, "opportunity", "success", {
          ghl_contact_id: contactId,
          ghl_response: duplicateOpp ? { duplicate: true, existingId } : oppRes.json,
        });
      }
    }

    // 3) Note with full submission (skipped if already attached on a prior run).
    if (!noteDone) {
      const noteBody = formatLeadAsNote(lead, isNatural);
      const noteRes = await ghl(token, `/contacts/${contactId}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: noteBody, userId: undefined }),
      });
      if (!noteRes.ok) hadError = true;
      await log(body.lead_id, "note", noteRes.ok ? "success" : "error", {
        ghl_contact_id: contactId,
        ghl_response: noteRes.json,
        error: noteRes.ok ? undefined : `HTTP ${noteRes.status}`,
      });
    }

    // Only flag overall success when every attempted stage succeeded. On a
    // partial failure we log an error so the lead can be safely retried (the
    // idempotency guards above skip the stages that already completed).
    if (hadError) {
      await log(body.lead_id, "overall", "error", {
        ghl_contact_id: contactId,
        error: "one or more stages failed — safe to retry",
      });
      return new Response(JSON.stringify({ ok: false, partial: true, contactId }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await log(body.lead_id, "overall", "success", { ghl_contact_id: contactId });
    return new Response(JSON.stringify({ ok: true, contactId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("sync-dtt-ghl-lead error:", err);
    await log(null, "overall", "error", { error: String(err) });
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
