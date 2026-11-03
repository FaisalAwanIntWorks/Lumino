// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.116.0/cors";
import { requireSuperAdmin, getAdminAccess } from "../_shared/admin-access.ts";
import { normalizeEmail, STANDARD_LEAD_FIELDS } from "../_shared/marketing-email.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const denied = await requireSuperAdmin(req, corsHeaders);
    if (denied) return denied;
    const { userId } = await getAdminAccess(req);

    const body = await req.json();
    const rawLeads: any[] = Array.isArray(body?.leads) ? body.leads : [];
    if (rawLeads.length === 0 || rawLeads.length > 20000) return json({ error: "Send between 1 and 20,000 leads." }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    let listId: string | null = typeof body.list_id === "string" ? body.list_id : null;
    if (!listId && typeof body.list_name === "string" && body.list_name.trim()) {
      const { data, error } = await supabase.from("marketing_lists")
        .insert({ name: body.list_name.trim().slice(0, 120), created_by: userId }).select("id").single();
      if (error) throw error;
      listId = data.id;
    }

    // Normalise + dedupe again server-side.
    const byEmail = new Map<string, any>();
    let invalid = 0;
    for (const l of rawLeads) {
      const email = normalizeEmail(l?.email);
      if (!email) { invalid++; continue; }
      if (byEmail.has(email)) continue;
      const row: any = { email, source: "admin_upload", custom_fields: {} };
      for (const f of STANDARD_LEAD_FIELDS) if (f !== "email" && l[f]) row[f] = String(l[f]).slice(0, 200);
      if (l.custom_fields && typeof l.custom_fields === "object") {
        for (const [k, v] of Object.entries(l.custom_fields)) {
          if (/^[a-z0-9_]{1,40}$/.test(k)) row.custom_fields[k] = String(v ?? "").slice(0, 500);
        }
      }
      byEmail.set(email, row);
    }

    let added = 0, existing = 0, suppressed = 0;
    const leadIds: string[] = [];
    const emails = [...byEmail.keys()];
    for (let i = 0; i < emails.length; i += 500) {
      const chunk = emails.slice(i, i + 500);
      const { data: found, error } = await supabase.from("marketing_leads")
        .select("id, email, status, custom_fields, first_name, last_name, company, phone, city, country").in("email", chunk);
      if (error) throw error;
      const foundMap = new Map((found ?? []).map((r: any) => [r.email, r]));
      const toInsert: any[] = [];
      for (const email of chunk) {
        const incoming = byEmail.get(email);
        const prior: any = foundMap.get(email);
        if (prior) {
          existing++;
          if (prior.status !== "subscribed") suppressed++;
          leadIds.push(prior.id);
          // Fill blanks only; never overwrite existing details or status.
          const patch: any = {};
          for (const f of STANDARD_LEAD_FIELDS) if (f !== "email" && !prior[f] && incoming[f]) patch[f] = incoming[f];
          const merged = { ...incoming.custom_fields, ...(prior.custom_fields ?? {}) };
          if (Object.keys(merged).length !== Object.keys(prior.custom_fields ?? {}).length) patch.custom_fields = merged;
          if (Object.keys(patch).length) await supabase.from("marketing_leads").update(patch).eq("id", prior.id);
        } else {
          toInsert.push(incoming);
        }
      }
      if (toInsert.length) {
        const { data: ins, error: insErr } = await supabase.from("marketing_leads").insert(toInsert).select("id");
        if (insErr) throw insErr;
        added += ins?.length ?? 0;
        leadIds.push(...(ins ?? []).map((r: any) => r.id));
      }
    }

    if (listId && leadIds.length) {
      for (let i = 0; i < leadIds.length; i += 1000) {
        const rows = leadIds.slice(i, i + 1000).map((lead_id) => ({ list_id: listId, lead_id }));
        const { error } = await supabase.from("marketing_list_members").upsert(rows, { onConflict: "list_id,lead_id", ignoreDuplicates: true });
        if (error) throw error;
      }
    }

    return json({ list_id: listId, added, existing, suppressed, invalid });
  } catch (e) {
    console.error("marketing-import-leads", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
