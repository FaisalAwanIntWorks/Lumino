// Edge function: backfill-dtt-ghl-leads
// One-shot backfill that finds existing GHL contacts for DTT Diamond Form leads
// from the last N days, overwrites their custom fields with the correct values
// from our DB, and tags them with `backfill-retrigger` so a GHL workflow can
// re-fire the email that went out blank during the Pabbly outage.
//
// Does NOT create contacts, opportunities, or notes. DTT only.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  fetchGhlFieldMeta,
  isNaturalFlowLead,
  PRICE_QUESTION_KEYS,
  translateMappingValue,
  type TranslateWarning,
} from "../_shared/dtt-ghl-value-map.ts";
import { requireAgencyAdmin } from "../_shared/ghl-auth.ts";
import { toE164 } from "../_shared/dtt-phone.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DTT_CLIENT_ID = "aeec6491-bd1f-4787-97f9-6a47a2ddc8af";
const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const BACKFILL_TAG = "backfill-retrigger";

async function ghl(token: string, path: string, init: RequestInit = {}) {
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
  return { ok: res.ok, status: res.status, json };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const denied = await requireAgencyAdmin(req);
  if (denied) return denied;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const days = Math.min(Math.max(Number(body?.days) || 30, 1), 90);
    const dryRun = !!body?.dry_run;
    const limit = Math.min(Math.max(Number(body?.limit) || 100, 1), 300);
    const offset = Math.max(Number(body?.offset) || 0, 0);
    const leadIds: string[] | undefined = Array.isArray(body?.lead_ids) ? body.lead_ids : undefined;
    const clientId = body?.client_id || DTT_CLIENT_ID;
    // Optional explicit window — overrides `days` if provided.
    const fromIso: string | undefined = typeof body?.from === "string" ? body.from : undefined;
    const toIso: string | undefined = typeof body?.to === "string" ? body.to : undefined;


    if (clientId !== DTT_CLIENT_ID) {
      return new Response(JSON.stringify({ error: "DTT only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = Deno.env.get("DTT_GHL_PRIVATE_TOKEN");
    if (!token) {
      return new Response(JSON.stringify({ error: "DTT_GHL_PRIVATE_TOKEN not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // form_type = 'diamond' is REQUIRED now that a client can also hold grillz /
    // enquiry / metal / ring_* config rows: maybeSingle() would otherwise error
    // on multiple rows, and the mappings query would mix in another form's keys.
    // Pre-existing rows all default to 'diamond', so behaviour is unchanged.
    const [cfgRes, mapRes] = await Promise.all([
      supabase.from("client_ghl_integrations").select("*")
        .eq("client_id", DTT_CLIENT_ID).eq("form_type", "diamond").maybeSingle(),
      supabase.from("client_ghl_field_mappings").select("*")
        .eq("client_id", DTT_CLIENT_ID).eq("form_type", "diamond"),
    ]);
    const cfg = cfgRes.data;
    const mappings = mapRes.data || [];
    if (!cfg?.enabled || !cfg.location_id) {
      return new Response(JSON.stringify({ error: "Integration disabled or missing location_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (mappings.length === 0) {
      return new Response(JSON.stringify({ error: "No custom field mappings configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const since = fromIso || new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const until = toIso || null;
    let query = supabase
      .from("diamond_form_leads")
      .select("*")
      .eq("client_id", DTT_CLIENT_ID)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (until) query = query.lte("created_at", until);
    if (leadIds?.length) query = query.in("id", leadIds);
    const { data: leads, error: leadErr } = await query;
    if (leadErr) throw leadErr;

    // Total count in window (for UI awareness — separate from this batch).
    let windowTotal = leads?.length || 0;
    if (!leadIds?.length) {
      let countQ = supabase
        .from("diamond_form_leads")
        .select("id", { count: "exact", head: true })
        .eq("client_id", DTT_CLIENT_ID)
        .gte("created_at", since);
      if (until) countQ = countQ.lte("created_at", until);
      const { count } = await countQ;
      windowTotal = count ?? windowTotal;
    }


    const stats = { batch: leads?.length || 0, window_total: windowTotal, matched: 0, updated: 0, tagged: 0, errors: 0, no_match: 0, no_contact_info: 0 };
    const sampleErrors: any[] = [];

    if (dryRun) {
      let withContact = 0, without = 0;
      for (const l of leads || []) {
        if (!l.email && !l.phone_number) without++;
        else withContact++;
      }
      return new Response(JSON.stringify({
        ok: true, dry_run: true, days, limit, offset,
        batch: leads?.length || 0, window_total: windowTotal,
        eligible: withContact, no_contact_info: without,
        note: "Eligible = has email or phone; actual GHL match rate verified only on a real run.",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const log = async (lead_id: string, status: string, extra: Record<string, unknown> = {}) => {
      try {
        await supabase.from("ghl_sync_logs").insert({
          client_id: DTT_CLIENT_ID,
          lead_id,
          stage: "backfill",
          status,
          ghl_contact_id: (extra.ghl_contact_id as string) ?? null,
          ghl_response: extra.ghl_response ?? null,
          error: (extra.error as string) ?? null,
        });
      } catch (e) { console.error("log fail", e); }
    };

    // Fetch GHL custom field metadata once for the whole batch so we can
    // translate DB slugs into the actual picklist labels (RADIO/SINGLE/MULTI).
    const fieldMeta = await fetchGhlFieldMeta(token, cfg.location_id).catch((e) => {
      console.error("fetchGhlFieldMeta failed:", e);
      return new Map();
    });

    for (const lead of leads || []) {
      try {
        if (!lead.email && !lead.phone_number) {
          stats.no_contact_info++;
          await log(lead.id, "skipped", { error: "no email or phone" });
          continue;
        }

        // 1) Find contact: email first, then phone.
        let contactId: string | null = null;
        if (lead.email) {
          const r = await ghl(token, `/contacts/search/duplicate?locationId=${encodeURIComponent(cfg.location_id)}&email=${encodeURIComponent(lead.email)}`);
          contactId = r.json?.contact?.id || r.json?.id || null;
        }
        if (!contactId && lead.phone_number) {
          // E.164 — same formatting sync uses when creating the contact.
          const phone = toE164(lead.country_code, lead.phone_number);
          if (phone) {
            const r = await ghl(token, `/contacts/search/duplicate?locationId=${encodeURIComponent(cfg.location_id)}&phone=${encodeURIComponent(phone)}`);
            contactId = r.json?.contact?.id || r.json?.id || null;
          }
        }

        if (!contactId) {
          stats.no_match++;
          await log(lead.id, "no_match", { error: "no GHL contact for email/phone" });
          await sleep(350);
          continue;
        }
        stats.matched++;

        // 2) Build customFields[] from mappings (translated to GHL labels).
        const leadMap = lead as Record<string, unknown>;
        // Natural chain carries no prices — same rule as sync-dtt-ghl-lead.
        const isNatural = isNaturalFlowLead(leadMap);
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
              { omitPrices: isNatural },
            )
          )
          .filter((x: unknown): x is { id: string; value: string | string[] } => x !== null);
        if (translateWarnings.length) {
          await log(lead.id, "value_unmatched", {
            ghl_response: { warnings: translateWarnings },
            error: `${translateWarnings.length} slug(s) not in GHL picklist`,
          });
        }

        if (customFields.length) {
          const upd = await ghl(token, `/contacts/${contactId}`, {
            method: "PUT",
            body: JSON.stringify({ customFields }),
          });
          if (upd.ok) stats.updated++;
          await log(lead.id, upd.ok ? "success" : "error", {
            ghl_contact_id: contactId,
            ghl_response: upd.json,
            error: upd.ok ? undefined : `custom_fields HTTP ${upd.status}`,
          });
          if (!upd.ok) {
            stats.errors++;
            if (sampleErrors.length < 5) sampleErrors.push({ lead_id: lead.id, contact: contactId, response: upd.json });
          }
        }

        // 3) Add retrigger tag.
        const tagRes = await ghl(token, `/contacts/${contactId}/tags`, {
          method: "POST",
          body: JSON.stringify({ tags: [BACKFILL_TAG] }),
        });
        if (tagRes.ok) stats.tagged++;
        await log(lead.id, tagRes.ok ? "tagged" : "tag_error", {
          ghl_contact_id: contactId,
          ghl_response: tagRes.json,
          error: tagRes.ok ? undefined : `tag HTTP ${tagRes.status}`,
        });

        await sleep(350); // ~3 req/sec ceiling
      } catch (e: any) {
        stats.errors++;
        await log(lead.id, "error", { error: String(e?.message || e) });
      }
    }

    const nextOffset = (leads?.length || 0) === limit ? offset + limit : null;
    return new Response(JSON.stringify({
      ok: true, days, limit, offset, next_offset: nextOffset,
      ...stats, sample_errors: sampleErrors,
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    console.error("backfill-dtt-ghl-leads error:", err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
