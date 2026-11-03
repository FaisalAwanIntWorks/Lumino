// Edge function: backfill-crm-leads
//
// Generic, admin-triggered backfill for any CRM MVMNT (GoHighLevel) form
// surface handled by `sync-crm-lead` (Ring Builder, Grillz, Custom Enquiry,
// Metal IQ, Ring OS saved designs / appointments).
//
// It adds NO sync logic of its own: it lists historical leads for the given
// client + form_type and calls the live `sync-crm-lead` function once per lead.
// That function is idempotent (it consults ghl_sync_logs), so a lead already in
// CRM is skipped rather than duplicated.
//
// The Diamond Form is deliberately excluded — it has its own hardened path
// (sync-dtt-ghl-lead / backfill-dtt-ghl-leads) that this must not touch.

import { createClient } from "npm:@supabase/supabase-js@2";
import { requireAgencyAdmin, requireServiceRole } from "../_shared/ghl-auth.ts";
import { CRM_FORM_BY_TYPE } from "../_shared/crm-form-registry.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface LeadResult {
  lead_id: string;
  customer?: string | null;
  created_at?: string | null;
  status: "synced" | "skipped" | "error" | "dry_run";
  reason?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Admin caller, or an internal call carrying the shared trigger secret.
  const denied = await requireAgencyAdmin(req);
  if (denied) {
    const internalDenied = await requireServiceRole(req);
    if (internalDenied) return denied;
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    const clientId = typeof body?.client_id === "string" ? body.client_id : "";
    const formType = typeof body?.form_type === "string" ? body.form_type : "";
    if (!clientId || !formType) {
      return json({ error: "client_id and form_type are required" }, 400);
    }

    const def = CRM_FORM_BY_TYPE[formType];
    if (!def) return json({ error: `Unknown form_type "${formType}"` }, 400);
    if (def.formType === "diamond") {
      return json({ error: "Diamond Form has its own backfill (backfill-dtt-ghl-leads)" }, 400);
    }

    const dryRun = !!body?.dry_run;
    // Re-run only the opportunity stage for leads that already synced but never
    // got their own card (GHL's OPPORTUNITY_NO_DUPLICATE).
    const forceOpportunity = !!body?.force_opportunity;

    const limit = Math.min(Math.max(Number(body?.limit) || 100, 1), 300);
    const offset = Math.max(Number(body?.offset) || 0, 0);
    const leadIds: string[] | undefined = Array.isArray(body?.lead_ids)
      ? (body.lead_ids as string[])
      : undefined;
    const excludeIds: string[] = Array.isArray(body?.exclude_lead_ids)
      ? (body.exclude_lead_ids as string[])
      : [];
    const fromIso = typeof body?.from === "string" ? body.from : undefined;
    const toIso = typeof body?.to === "string" ? body.to : undefined;
    const days = Math.min(Math.max(Number(body?.days) || 90, 1), 365);

    // Integration must exist and be enabled for this exact form.
    const { data: cfg } = await supabase
      .from("client_ghl_integrations")
      .select("enabled, location_id")
      .eq("client_id", clientId)
      .eq("form_type", def.formType)
      .maybeSingle();

    if (!cfg?.enabled || !cfg.location_id) {
      return json({ error: "Integration disabled or missing location_id for this form" }, 400);
    }

    const since = fromIso || new Date(Date.now() - days * 86_400_000).toISOString();

    // Type as any: conditional .lte()/.in() chaining produces a builder union that TS cannot await
    let query: any = supabase
      .from(def.table)
      .select(`id, created_at, ${def.contact.fullName}, ${def.contact.email}`)
      .eq("client_id", clientId)
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(offset, offset + limit - 1);

    if (toIso) query = query.lte("created_at", toIso);
    if (leadIds?.length) query = query.in("id", leadIds);

    const { data: leadsRaw, error: leadErr } = await query;
    if (leadErr) throw leadErr;

    const leads = (leadsRaw || []).filter((l: Record<string, unknown>) =>
      !excludeIds.includes(String(l.id))
    );

    const results: LeadResult[] = [];

    for (const lead of leads as Array<Record<string, unknown>>) {
      const leadId = String(lead.id);
      const base = {
        lead_id: leadId,
        customer: (lead[def.contact.fullName as string] as string) ?? null,
        created_at: (lead.created_at as string) ?? null,
      };

      if (dryRun) {
        results.push({ ...base, status: "dry_run" });
        continue;
      }

      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-crm-lead`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SERVICE_ROLE}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: clientId,
            lead_id: leadId,
            form_type: def.formType,
            force_opportunity: forceOpportunity,
          }),

        });
        const payload = await res.json().catch(() => ({}));

        if (!res.ok) {
          results.push({ ...base, status: "error", reason: payload?.error || `HTTP ${res.status}` });
        } else if (payload?.skipped) {
          results.push({ ...base, status: "skipped", reason: payload?.reason });
        } else {
          results.push({ ...base, status: "synced" });
        }
      } catch (e) {
        results.push({ ...base, status: "error", reason: String(e) });
      }

      // Stay well under GHL's rate limits.
      await sleep(600);
    }

    const summary = results.reduce<Record<string, number>>((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    return json({
      ok: true,
      client_id: clientId,
      form_type: def.formType,
      table: def.table,
      dry_run: dryRun,
      total: results.length,
      summary,
      results,
    }, 200);
  } catch (error) {
    console.error("backfill-crm-leads error:", error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
