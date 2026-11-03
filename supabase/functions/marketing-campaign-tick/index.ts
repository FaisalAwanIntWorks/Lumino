// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.116.0/cors";
import { allowedBatchNow, leadToVars, personalize, applyVariables } from "../_shared/marketing-email.ts";
import { sendBatch, unsubscribeUrl } from "../_shared/marketing-send.ts";
import { logEmail } from "../_shared/email-log.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Called every minute by the scheduler while a campaign is active. Sends only what each campaign's settings allow. */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (req.headers.get("Authorization") !== `Bearer ${serviceKey}`) return json({ error: "Forbidden" }, 403);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, { auth: { persistSession: false } });
  const now = new Date();
  const results: any[] = [];

  const { data: campaigns } = await supabase.from("marketing_campaigns").select("*").in("status", ["scheduled", "sending"]);
  for (const c of campaigns ?? []) {
    try {
      // Safety brake on bounces / complaints.
      const { count: sentTotal } = await supabase.from("marketing_campaign_recipients")
        .select("id", { count: "exact", head: true }).eq("campaign_id", c.id).not("sent_at", "is", null);
      if ((sentTotal ?? 0) >= 50) {
        const { count: bounced } = await supabase.from("marketing_campaign_recipients")
          .select("id", { count: "exact", head: true }).eq("campaign_id", c.id).not("bounced_at", "is", null);
        const { count: complained } = await supabase.from("marketing_campaign_recipients")
          .select("id", { count: "exact", head: true }).eq("campaign_id", c.id).not("complained_at", "is", null);
        const bRate = (100 * (bounced ?? 0)) / sentTotal!;
        const cRate = (100 * (complained ?? 0)) / sentTotal!;
        if (bRate > Number(c.max_bounce_rate) || cRate > Number(c.max_complaint_rate)) {
          const reason = `Auto-paused: bounce rate ${bRate.toFixed(1)}%, complaint rate ${cRate.toFixed(2)}%`;
          await supabase.from("marketing_campaigns").update({ status: "paused", pause_reason: reason }).eq("id", c.id);
          const { data: supers } = await supabase.from("admin_staff_members").select("user_id").eq("is_super_admin", true).eq("status", "active");
          if (supers?.length) {
            await supabase.from("admin_notifications").insert(supers.map((s: any) => ({
              user_id: s.user_id, category: "system", title: "Email campaign paused", message: `${c.name}: ${reason}`, metadata: { campaign_id: c.id },
            })));
          }
          results.push({ id: c.id, paused: reason });
          continue;
        }
      }

      const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
      const { count: sent24 } = await supabase.from("marketing_campaign_recipients")
        .select("id", { count: "exact", head: true }).eq("campaign_id", c.id).gte("sent_at", since);
      const n = allowedBatchNow(c, now, sent24 ?? 0);
      if (n <= 0) { results.push({ id: c.id, waiting: true }); continue; }

      const { data: claimed, error: claimErr } = await supabase.rpc("marketing_claim_recipients", { _campaign: c.id, _limit: n });
      if (claimErr) throw claimErr;
      if (!claimed?.length) {
        const { count: open } = await supabase.from("marketing_campaign_recipients")
          .select("id", { count: "exact", head: true }).eq("campaign_id", c.id).in("status", ["queued", "sending"]);
        if (!open) await supabase.from("marketing_campaigns").update({ status: "completed" }).eq("id", c.id);
        results.push({ id: c.id, done: !open });
        continue;
      }

      const { data: leads } = await supabase.from("marketing_leads").select("*").in("id", claimed.map((r: any) => r.lead_id));
      const leadMap = new Map((leads ?? []).map((l: any) => [l.id, l]));
      const sendable: any[] = [];
      const skipped: string[] = [];
      for (const r of claimed) {
        const lead: any = leadMap.get(r.lead_id);
        if (!lead || lead.status !== "subscribed") { skipped.push(r.id); continue; }
        const vars = leadToVars(lead, { unsubscribe_url: unsubscribeUrl(lead.unsubscribe_token) });
        sendable.push({
          rid: r.id,
          email: {
            to: lead.email,
            subject: applyVariables(c.subject, vars, false),
            html: personalize(c.rendered_html ?? "", vars),
            token: lead.unsubscribe_token,
            tags: [{ name: "campaign_id", value: c.id }],
          },
        });
      }
      if (skipped.length) await supabase.from("marketing_campaign_recipients").update({ status: "skipped" }).in("id", skipped);

      await supabase.from("marketing_campaigns").update({ status: "sending", last_batch_at: now.toISOString() }).eq("id", c.id);

      if (sendable.length) {
        try {
          const ids = await sendBatch(sendable.map((s) => s.email));
          const sentAt = new Date().toISOString();
          await Promise.all(sendable.map((s, i) =>
            supabase.from("marketing_campaign_recipients")
              .update({ status: "sent", resend_id: ids[i] ?? null, sent_at: sentAt }).eq("id", s.rid)
          ));
          await logEmail(supabase, { to: `${sendable.length} recipients`, emailType: "marketing_campaign", subject: c.subject, ok: true, metadata: { campaign_id: c.id, count: sendable.length } });
        } catch (sendErr) {
          const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
          // Put them back in the queue and pause so nothing loops on a provider error.
          await supabase.from("marketing_campaign_recipients").update({ status: "queued", error: msg.slice(0, 500) }).in("id", sendable.map((s) => s.rid));
          await supabase.from("marketing_campaigns").update({ status: "paused", pause_reason: `Sending failed: ${msg.slice(0, 200)}` }).eq("id", c.id);
          await logEmail(supabase, { to: `${sendable.length} recipients`, emailType: "marketing_campaign", subject: c.subject, ok: false, error: msg, metadata: { campaign_id: c.id } });
          results.push({ id: c.id, error: msg });
          continue;
        }
      }
      results.push({ id: c.id, sent: sendable.length, skipped: skipped.length });
    } catch (e) {
      console.error("tick campaign", c.id, e);
      results.push({ id: c.id, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return json({ ok: true, results });
});
