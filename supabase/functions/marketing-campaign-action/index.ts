// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.116.0/cors";
import { requireSuperAdmin } from "../_shared/admin-access.ts";
import { buildEmailHtml, personalize, leadToVars, normalizeEmail, applyVariables } from "../_shared/marketing-email.ts";
import { sendBatch } from "../_shared/marketing-send.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/**
 * Super-admin actions:
 *  - test  { template_id, to, subject?, preview_text? }  one sample email
 *  - start { campaign_id }  render, queue recipients, schedule
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const denied = await requireSuperAdmin(req, corsHeaders);
    if (denied) return denied;
    const body = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    if (body?.action === "test") {
      const to = normalizeEmail(body.to);
      if (!to) return json({ error: "Enter a valid email address." }, 400);
      const { data: t } = await supabase.from("marketing_templates").select("*").eq("id", body.template_id).maybeSingle();
      if (!t) return json({ error: "Template not found." }, 404);
      const sample = { first_name: "Alex", last_name: "Taylor", company: "Sample Jewelers", city: "New York", email: to };
      const vars = leadToVars(sample, { unsubscribe_url: "https://studio.aurezotech.com/unsubscribe" });
      const html = personalize(buildEmailHtml({ mode: t.mode, blocks: t.blocks, html: t.html, previewText: body.preview_text ?? t.preview_text }), vars);
      const subject = "[Test] " + applyVariables(body.subject || t.subject || t.name, vars, false);
      await sendBatch([{ to, subject, html, token: "test" }]);
      return json({ ok: true });
    }

    if (body?.action === "start") {
      const { data: c } = await supabase.from("marketing_campaigns").select("*").eq("id", body.campaign_id).maybeSingle();
      if (!c) return json({ error: "Campaign not found." }, 404);
      if (!["draft", "paused"].includes(c.status)) return json({ error: `Campaign is ${c.status}.` }, 400);

      if (c.status === "draft") {
        if (!c.template_id || !c.list_ids?.length || !c.subject) return json({ error: "Pick a template, at least one list and a subject." }, 400);
        const { data: t } = await supabase.from("marketing_templates").select("*").eq("id", c.template_id).maybeSingle();
        if (!t) return json({ error: "Template not found." }, 404);
        const rendered = buildEmailHtml({ mode: t.mode, blocks: t.blocks, html: t.html, previewText: c.preview_text });

        // Queue every subscribed lead in the chosen lists, once.
        const seen = new Set<string>();
        let from = 0;
        while (true) {
          const { data: members, error } = await supabase.from("marketing_list_members")
            .select("lead_id, marketing_leads!inner(id, email, status)")
            .in("list_id", c.list_ids).eq("marketing_leads.status", "subscribed")
            .range(from, from + 999);
          if (error) throw error;
          const rows = (members ?? [])
            .filter((m: any) => !seen.has(m.lead_id) && seen.add(m.lead_id))
            .map((m: any) => ({ campaign_id: c.id, lead_id: m.lead_id, email: m.marketing_leads.email }));
          if (rows.length) {
            const { error: insErr } = await supabase.from("marketing_campaign_recipients")
              .upsert(rows, { onConflict: "campaign_id,lead_id", ignoreDuplicates: true });
            if (insErr) throw insErr;
          }
          if (!members || members.length < 1000) break;
          from += 1000;
        }
        if (seen.size === 0) return json({ error: "No subscribed leads in the selected lists." }, 400);
        await supabase.from("marketing_campaigns").update({ rendered_html: rendered, status: "scheduled", pause_reason: null }).eq("id", c.id);
        return json({ ok: true, queued: seen.size });
      }

      await supabase.from("marketing_campaigns").update({ status: "scheduled", pause_reason: null }).eq("id", c.id);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("marketing-campaign-action", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

