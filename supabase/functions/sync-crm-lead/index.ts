// Edge function: sync-crm-lead
//
// Generic CRM MVMNT (GoHighLevel) sync for every lead surface except the
// Diamond Form: Ring Builder, Grillz, Custom Enquiry, Metal IQ, the Ring OS
// surfaces (saved designs, appointment bookings) and completed Shopify orders
// that started in an Aurezo widget ('order').
//
// Invoked by the AFTER INSERT trigger public.trigger_crm_form_sync(<form_type>)
// on each lead table. Behaves exactly like sync-dtt-ghl-lead — upsert contact,
// create opportunity, attach a note with the full submission, push mapped
// custom fields — but resolves table/columns from _shared/crm-form-registry.ts
// instead of hardcoding the Diamond Form.
//
// The Diamond Form deliberately keeps its own function (sync-dtt-ghl-lead) so
// DTT's live integration is untouched by anything here.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  fetchGhlFieldMeta,
  translateMappingValue,
  type TranslateWarning,
} from "../_shared/dtt-ghl-value-map.ts";
import { getClientGhlToken, requireServiceRole } from "../_shared/ghl-auth.ts";
import { toE164 } from "../_shared/dtt-phone.ts";
import {
  CRM_FORM_BY_TYPE,
  expandJsonTextColumns,
  flattenLeadForNote,
  getLeadValue,
  resolveCustomerName,
  resolveMappedValue,
  type CrmFormDef,
} from "../_shared/crm-form-registry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

interface ReqBody {
  client_id: string;
  lead_id: string;
  form_type: string;
  /**
   * Re-run only the opportunity stage for a lead that already synced. Used by
   * the backfill to create the missing card for leads that previously hit
   * GHL's OPPORTUNITY_NO_DUPLICATE. Contact and note stages stay untouched.
   */
  force_opportunity?: boolean;
}


const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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
      let body: any = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      return { ok: res.ok, status: res.status, json: body };
    } catch (e) {
      if (attempt < retries) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
}

/** GHL wants firstName/lastName; most of our forms capture one "name" field. */
function splitName(full: string): { firstName: string; lastName?: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || "Lead" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/**
 * Every form except the Diamond Form already stores customer_phone in E.164
 * (the widgets call formatPhoneE164 before insert). Only prefix a dialling code
 * when the stored value clearly lacks one, so we never produce "+1+1416…".
 *
 * `contact.phone` may be a dotted path (`orders` keeps the number on the
 * shipping address JSONB rather than in a column of its own).
 */
function resolvePhone(def: CrmFormDef, lead: Record<string, unknown>): string | undefined {
  const raw = String(getLeadValue(lead, def.contact.phone) ?? "").trim();
  if (!raw) return undefined;
  if (raw.startsWith("+")) return toE164(undefined, raw);
  const cc = def.contact.countryCode ? getLeadValue(lead, def.contact.countryCode) : undefined;
  return toE164(cc, raw);
}

/** Fill {token} placeholders in the opportunity name from the lead row. */
function renderTemplate(
  template: string,
  def: CrmFormDef,
  lead: Record<string, unknown>,
  leadId: string,
): string {
  const customerName = resolveCustomerName(def, lead);
  return template.replace(/\{([a-zA-Z0-9_.]+)\}/g, (_m, key: string) => {
    if (key === "customer_name") return customerName;
    if (key === "lead_id") return leadId;
    if (key === "email") return String(getLeadValue(lead, def.contact.email) ?? "");
    const value = getLeadValue(lead, key);
    if (value === null || value === undefined) return "";
    return Array.isArray(value) ? value.join(", ") : String(value);
  }).replace(/\s+/g, " ").trim();
}

function buildNote(def: CrmFormDef, lead: Record<string, unknown>): string {
  const lines: string[] = [def.noteTitle, ""];
  for (const [key, value] of flattenLeadForNote(def, lead)) {
    lines.push(`${key}: ${value}`);
  }
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Internal only — invoked by the per-table triggers with the shared secret.
  const denied = await requireServiceRole(req);
  if (denied) return denied;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let logClientId: string | null = null;
  let logFormType = "unknown";

  const log = async (
    leadId: string | null,
    stage: string,
    status: string,
    extra: Record<string, unknown> = {},
  ) => {
    if (!logClientId) return;
    try {
      await supabase.from("ghl_sync_logs").insert({
        client_id: logClientId,
        form_type: logFormType,
        lead_id: leadId,
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
    if (!body?.client_id || !body?.lead_id || !body?.form_type) {
      return json({ error: "client_id, lead_id and form_type required" }, 400);
    }

    const def = CRM_FORM_BY_TYPE[body.form_type];
    if (!def) return json({ error: `Unknown form_type "${body.form_type}"` }, 400);
    // The Diamond Form has its own hardened function; refuse to double-handle it.
    if (def.formType === "diamond") {
      return json({ error: "diamond form is handled by sync-dtt-ghl-lead" }, 400);
    }

    const clientId = body.client_id;
    logClientId = clientId;
    logFormType = def.formType;

    const token = await getClientGhlToken(clientId);
    if (!token) {
      await log(body.lead_id, "overall", "error", { error: "No GHL token configured for this client" });
      return json({ error: "Token not configured" }, 500);
    }

    const [cfgRes, mapRes, leadRes] = await Promise.all([
      supabase.from("client_ghl_integrations").select("*")
        .eq("client_id", clientId).eq("form_type", def.formType).maybeSingle(),
      supabase.from("client_ghl_field_mappings").select("*")
        .eq("client_id", clientId).eq("form_type", def.formType),
      supabase.from(def.table).select("*").eq("id", body.lead_id).maybeSingle(),
    ]);

    const cfg = cfgRes.data as Record<string, any> | null;
    const mappings = (mapRes.data || []) as Array<Record<string, any>>;
    const leadRaw = leadRes.data as Record<string, unknown> | null;

    if (!cfg?.enabled) {
      return json({ skipped: true, reason: "Integration disabled for this form" }, 200);
    }
    if (!cfg.location_id) {
      await log(body.lead_id, "overall", "error", { error: "location_id missing" });
      return json({ error: "location_id missing" }, 400);
    }
    if (!leadRaw) {
      await log(body.lead_id, "overall", "error", { error: "lead not found" });
      return json({ error: "Lead not found" }, 404);
    }
    if (leadRaw.client_id !== clientId) {
      await log(body.lead_id, "overall", "error", { error: "lead does not belong to client_id" });
      return json({ error: "Lead/client mismatch" }, 400);
    }

    // The Ring Builder writes its whole answer set as a JSON string into
    // design_requests.description. Expand it here so `description.selections.shape`
    // resolves like any other key — for field mapping, the note, the opportunity
    // name template and the monetary value source alike.
    const lead = expandJsonTextColumns(def, leadRaw);

    // Idempotency: prior attempts for this (form_type, lead) decide which stages
    // still need to run, so a trigger re-fire or manual retry never duplicates a
    // contact, opportunity or note.
    const { data: priorLogs } = await supabase
      .from("ghl_sync_logs")
      .select("stage,status,ghl_contact_id")
      .eq("lead_id", body.lead_id)
      .eq("form_type", def.formType);
    const priors = priorLogs || [];
    const force = body.force_opportunity === true;
    const alreadyForced = priors.some(
      (l) => l.stage === "opportunity_duplicate_forced" && l.status === "success",
    );
    if (!force && priors.some((l) => l.stage === "overall" && l.status === "success")) {
      return json({ skipped: true, reason: "already synced" }, 200);
    }
    const priorContactId: string | undefined =
      priors.find((l) => l.stage === "contact" && l.status === "success" && l.ghl_contact_id)?.ghl_contact_id ?? undefined;
    const oppDone = force
      ? alreadyForced
      : priors.some((l) => l.stage === "opportunity" && l.status === "success");
    // A forced re-run only creates the missing opportunity — never a second note.
    const noteDone = force || priors.some((l) => l.stage === "note" && l.status === "success");


    // Build customFields[] from the per-form mappings. useDttSlugMap is false —
    // DTT's hand-written dictionary describes the Diamond Form's picklists only,
    // so these clients auto-match against their own live picklist instead.
    const fieldMeta = await fetchGhlFieldMeta(token, cfg.location_id).catch((e) => {
      console.error("fetchGhlFieldMeta failed:", e);
      return new Map();
    });
    const translateWarnings: TranslateWarning[] = [];
    const customFields = mappings
      .map((m) =>
        translateMappingValue(
          m.question_key,
          m.ghl_custom_field_id,
          resolveMappedValue(def, lead, m.question_key),
          fieldMeta.get(m.ghl_custom_field_id),
          translateWarnings,
          { useDttSlugMap: false },
        )
      )
      .filter((x): x is { id: string; value: string | string[] } => x !== null);

    if (translateWarnings.length) {
      await log(body.lead_id, "custom_fields", "value_unmatched", {
        ghl_response: { warnings: translateWarnings },
        error: `${translateWarnings.length} value(s) not in GHL picklist`,
      });
    }

    // 1) Contact — reuse one from a prior attempt, otherwise create and fall
    // back to GHL's duplicate response (HTTP 400 + meta.contactId).
    let contactId: string | undefined = priorContactId;

    if (!contactId) {
      const { firstName, lastName } = splitName(resolveCustomerName(def, lead));
      const email = String(getLeadValue(lead, def.contact.email) ?? "").trim() || undefined;
      const phone = resolvePhone(def, lead);

      if (!email && !phone) {
        await log(body.lead_id, "contact", "error", { error: "lead has neither email nor phone" });
        return json({ error: "Lead has no email or phone" }, 422);
      }

      const contactPayload: Record<string, unknown> = {
        locationId: cfg.location_id,
        firstName,
        lastName,
        email,
        phone,
        source: cfg.contact_source || def.defaultSource,
        tags: Array.isArray(cfg.contact_tags) && cfg.contact_tags.length ? cfg.contact_tags : undefined,
        customFields: customFields.length ? customFields : undefined,
      };

      const contactRes = await ghl(token, "/contacts/", {
        method: "POST",
        body: JSON.stringify(contactPayload),
      });

      contactId = contactRes.json?.contact?.id || contactRes.json?.id || contactRes.json?.contactId;

      if (!contactRes.ok && !contactId) {
        const dupId = contactRes.json?.meta?.contactId;
        if (dupId) {
          contactId = dupId;
          await log(body.lead_id, "contact", "success", {
            ghl_contact_id: contactId,
            ghl_response: { reused_existing: true, original: contactRes.json },
          });
          // Push this submission's answers onto the existing contact.
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
        } else {
          await log(body.lead_id, "contact", "error", {
            error: `HTTP ${contactRes.status}`,
            ghl_response: contactRes.json,
          });
          return json({ error: "Contact create failed", details: contactRes.json }, 502);
        }
      } else if (contactRes.ok) {
        await log(body.lead_id, "contact", "success", {
          ghl_contact_id: contactId,
          ghl_response: contactRes.json,
        });
      }

      if (!contactId) {
        return json({ error: "No contact id returned", details: contactRes.json }, 502);
      }
    }

    // A stage failure must not mark the sync complete — leaving "overall" absent
    // is what makes a re-invocation retry only the missing stages.
    let hadError = false;

    // 2) Opportunity
    if (cfg.create_opportunity !== false && cfg.pipeline_id && cfg.stage_id && !oppDone) {
      let monetaryValue: number | undefined;
      if (cfg.value_source === "fixed") {
        monetaryValue = Number(cfg.fixed_value) || undefined;
      } else if (cfg.value_source && cfg.value_source !== "none") {
        // value_source holds the name of a numeric column (or dotted JSON path).
        monetaryValue = Number(getLeadValue(lead, cfg.value_source)) || undefined;
      }

      const oppName =
        renderTemplate(cfg.opportunity_name_template || def.defaultOppTemplate, def, lead, body.lead_id) ||
        resolveCustomerName(def, lead);

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
      // pipeline (OPPORTUNITY_NO_DUPLICATE). When the integration allows it, we
      // still want one card per submission, so retry with a disambiguated name —
      // GHL accepts it when the existing deal lives in another pipeline.
      if (isDuplicate(oppRes)) {
        existingId = oppRes.json?.meta?.existingId ?? null;
        if (cfg.allow_duplicate_opportunities) {
          const stamp = new Date(
            String((lead as Record<string, unknown>).created_at ?? Date.now()),
          ).toISOString().slice(0, 10);
          const retry = await createOpp(`${oppName} — ${def.label} (${stamp})`);
          if (retry.ok) {
            oppRes = retry;
            forced = true;
          }
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
              reason: cfg.allow_duplicate_opportunities
                ? "GHL refused a second open opportunity even with a distinct name"
                : "allow_duplicate_opportunities is off for this integration",
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

    // 3) Note with the full submission (Ring OS configurations included).
    if (cfg.create_note !== false && !noteDone) {
      const noteRes = await ghl(token, `/contacts/${contactId}/notes`, {
        method: "POST",
        body: JSON.stringify({ body: buildNote(def, lead) }),
      });
      if (!noteRes.ok) hadError = true;
      await log(body.lead_id, "note", noteRes.ok ? "success" : "error", {
        ghl_contact_id: contactId,
        ghl_response: noteRes.json,
        error: noteRes.ok ? undefined : `HTTP ${noteRes.status}`,
      });
    }

    if (hadError) {
      await log(body.lead_id, "overall", "error", {
        ghl_contact_id: contactId,
        error: "one or more stages failed — safe to retry",
      });
      return json({ ok: false, partial: true, contactId }, 502);
    }

    await log(body.lead_id, "overall", "success", { ghl_contact_id: contactId });
    return json({ ok: true, contactId }, 200);
  } catch (err) {
    console.error("sync-crm-lead error:", err);
    await log(null, "overall", "error", { error: String(err) });
    return json({ error: String(err) }, 500);
  }
});
