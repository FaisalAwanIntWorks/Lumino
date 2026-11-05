// Edge function: ghl-provision-fields
//
// Creates the Aurezo standard custom fields inside a client's CRM MVMNT (GHL)
// location and writes the matching rows into client_ghl_field_mappings, so an
// admin no longer has to build fields by hand and map them one by one.
//
// Contract:
//   POST { client_id, form_type, location_id, dry_run?, include_optional?, token? }
//
//   dry_run: true  -> reads the location's existing fields and reports what
//                     would be created / reused / is already mapped. Writes
//                     nothing, neither in the CRM nor in our database.
//   dry_run: false -> ensures the "Aurezo" folder, creates only the missing
//                     fields (Single Line text, Contact object), then upserts
//                     the mappings. Hand-set mappings are never overwritten.
//
// Safe to run repeatedly: matching is done on the CRM fieldKey, so an existing
// field is reused instead of duplicated.

import { getClientGhlToken, requireAgencyAdmin } from "../_shared/ghl-auth.ts";
import {
  CRM_FIELD_FOLDER,
  catalogFor,
  ghlFieldSlug,
  normalizeFieldKey,
} from "../_shared/crm-field-catalog.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function ghl(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${GHL_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: GHL_VERSION,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  return { ok: res.ok, status: res.status, body };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface PlanRow {
  question_key: string;
  name: string;
  field_key: string;
  optional: boolean;
  /** create | reuse | mapped */
  action: string;
  ghl_custom_field_id: string | null;
  /** An existing field whose name matches but whose key does not. */
  conflict?: { id: string; name: string; fieldKey?: string } | null;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const denied = await requireAgencyAdmin(req);
  if (denied) return denied;

  try {
    const {
      client_id,
      form_type,
      location_id,
      dry_run = true,
      include_optional = false,
      token: bodyToken,
    } = await req.json();

    if (!client_id || !form_type || !location_id) {
      return json({ ok: false, error: "client_id, form_type and location_id are required" }, 400);
    }

    const catalog = catalogFor(form_type)
      .filter((f) => include_optional || !f.optional);
    if (!catalog.length) {
      return json({ ok: false, error: `No Aurezo field catalog for form "${form_type}" yet` }, 400);
    }

    const token = (typeof bodyToken === "string" && bodyToken.trim())
      || (await getClientGhlToken(client_id))
      || Deno.env.get("DTT_GHL_PRIVATE_TOKEN");
    if (!token) return json({ ok: false, error: "No token configured for this client" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Read the location so a wrong Location ID is visible before writing ──
    const loc = await ghl(`/locations/${encodeURIComponent(location_id)}`, token);
    if (!loc.ok) {
      return json({
        ok: false,
        error: `Could not read location ${location_id}: HTTP ${loc.status} — ${loc.body?.message || "check token & location"}`,
      }, 400);
    }
    const locationName = loc.body?.location?.name || loc.body?.name || location_id;

    // ── Existing CRM fields, indexed by normalized key and by name ──────────
    const fieldsRes = await ghl(
      `/locations/${encodeURIComponent(location_id)}/customFields?model=contact`,
      token,
    );
    if (!fieldsRes.ok) {
      return json({ ok: false, error: `Could not list custom fields: HTTP ${fieldsRes.status}` }, 400);
    }
    const existing: any[] = fieldsRes.body?.customFields || [];
    const byKey = new Map<string, any>();
    const byName = new Map<string, any>();
    for (const f of existing) {
      const k = normalizeFieldKey(f.fieldKey) || ghlFieldSlug(f.name || "");
      if (k) byKey.set(k, f);
      if (f.name) byName.set(String(f.name).trim().toLowerCase(), f);
    }

    // ── Mappings we already store for this client + form ────────────────────
    const { data: mapRows } = await admin
      .from("client_ghl_field_mappings")
      .select("question_key, ghl_custom_field_id, display_order")
      .eq("client_id", client_id)
      .eq("form_type", form_type);
    const mapped = new Map<string, string>(
      (mapRows || []).map((r: any) => [r.question_key, r.ghl_custom_field_id]),
    );
    // New mappings are appended after whatever the admin already has, so the
    // existing order in the settings card is never shuffled.
    const nextOrder = (mapRows || []).reduce(
      (max: number, r: any) => Math.max(max, Number(r.display_order ?? -1) + 1),
      0,
    );

    // ── Build the plan ──────────────────────────────────────────────────────
    const plan: PlanRow[] = catalog.map((def) => {
      const fieldKey = ghlFieldSlug(def.name);
      const hit = byKey.get(fieldKey);
      const nameHit = byName.get(def.name.trim().toLowerCase());
      const existingMapping = mapped.get(def.questionKey);

      if (hit) {
        // A mapping set by hand to a different field is left exactly as it is.
        const manual = !!existingMapping && existingMapping !== hit.id;
        return {
          question_key: def.questionKey,
          name: def.name,
          field_key: fieldKey,
          optional: !!def.optional,
          action: manual ? "manual" : existingMapping === hit.id ? "mapped" : "reuse",
          ghl_custom_field_id: hit.id,
          conflict: null,
        };
      }

      // The standard field does not exist in the CRM, but the admin already
      // mapped this answer to some other field by hand — keep that as it is
      // rather than creating a duplicate and re-pointing the mapping.
      if (existingMapping) {
        return {
          question_key: def.questionKey,
          name: def.name,
          field_key: fieldKey,
          optional: !!def.optional,
          action: "manual",
          ghl_custom_field_id: existingMapping,
          conflict: null,
        };
      }

      return {
        question_key: def.questionKey,
        name: def.name,
        field_key: fieldKey,
        optional: !!def.optional,
        action: "create",
        ghl_custom_field_id: null,
        conflict: nameHit ? { id: nameHit.id, name: nameHit.name, fieldKey: nameHit.fieldKey } : null,
      };
    });

    const summary = () => ({
      create: plan.filter((p) => p.action === "create").length,
      reuse: plan.filter((p) => p.action === "reuse").length,
      mapped: plan.filter((p) => p.action === "mapped").length,
      manual: plan.filter((p) => p.action === "manual").length,
      failed: plan.filter((p) => p.error).length,
    });


    if (dry_run) {
      return json({
        ok: true,
        dry_run: true,
        location_id,
        location_name: locationName,
        form_type,
        folder: CRM_FIELD_FOLDER,
        plan,
        summary: summary(),
      });
    }

    // ── Ensure the Aurezo folder (best effort — degrade to top level) ────────
    let folderId: string | null = null;
    let folderWarning: string | null = null;
    const folderHit = existing.find(
      (f: any) => f.dataType === "FOLDER" && String(f.name || "").trim().toLowerCase() === CRM_FIELD_FOLDER.toLowerCase(),
    );
    if (folderHit) {
      folderId = folderHit.id;
    } else {
      const created = await ghl(`/locations/${encodeURIComponent(location_id)}/customFields/folder`, token, {
        method: "POST",
        body: JSON.stringify({ objectKey: "contact", name: CRM_FIELD_FOLDER }),
      });
      if (created.ok) {
        folderId = created.body?.id || created.body?.folder?.id || null;
      } else {
        folderWarning = `Could not create the "${CRM_FIELD_FOLDER}" folder (HTTP ${created.status}); fields were created at the top level.`;
      }
    }

    // ── Create the missing fields, one at a time ────────────────────────────
    for (const row of plan) {
      if (row.action !== "create") continue;
      const res = await ghl(`/locations/${encodeURIComponent(location_id)}/customFields`, token, {
        method: "POST",
        body: JSON.stringify({
          name: row.name,
          dataType: "TEXT",
          model: "contact",
          ...(folderId ? { parentId: folderId } : {}),
        }),
      });
      if (res.ok) {
        const id = res.body?.customField?.id || res.body?.id;
        if (id) {
          row.ghl_custom_field_id = id;
          row.action = "created";
        } else {
          row.error = "CRM accepted the field but returned no id";
        }
      } else {
        row.error = `HTTP ${res.status} — ${res.body?.message || "create failed"}`;
      }
      await sleep(250);
    }

    // ── Write mappings for NEW answers only ─────────────────────────────────
    // "mapped" rows already point at this field: leave them exactly as the
    // admin has them (label, order). "manual" rows point somewhere else by
    // choice. Only freshly created fields and unmapped existing fields get a
    // mapping, appended after the current rows.
    const rows = plan
      .filter((p) => p.ghl_custom_field_id && !p.error && (p.action === "created" || p.action === "reuse"))
      .map((p, i) => ({
        client_id,
        form_type,
        question_key: p.question_key,
        ghl_custom_field_id: p.ghl_custom_field_id,
        label: p.name,
        display_order: nextOrder + i,
      }));


    let mappingError: string | null = null;
    if (rows.length) {
      const { error } = await admin
        .from("client_ghl_field_mappings")
        .upsert(rows, { onConflict: "client_id,form_type,question_key" });
      if (error) mappingError = error.message;
    }

    const created = plan.filter((p) => p.action === "created").length;
    return json({
      ok: !mappingError,
      dry_run: false,
      location_id,
      location_name: locationName,
      form_type,
      folder: folderId ? CRM_FIELD_FOLDER : null,
      warning: folderWarning,
      error: mappingError,
      plan,
      summary: {
        created,
        reused: plan.filter((p) => p.action === "reuse").length,
        already_mapped: plan.filter((p) => p.action === "mapped").length,
        kept_manual: plan.filter((p) => p.action === "manual").length,
        failed: plan.filter((p) => p.error).length,
        mappings_written: mappingError ? 0 : rows.length,
      },

    });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});
