import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2.116.0/cors";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const UUID = /^[0-9a-f-]{36}$/i;

/** Public. GET ?token= → status; POST (body {token} or one-click ?token=) → unsubscribe. */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let token = url.searchParams.get("token") ?? "";
    if (req.method === "POST" && !token) {
      try { token = String((await req.json())?.token ?? ""); } catch { /* one-click form body */ }
    }
    if (!UUID.test(token)) return json({ status: "invalid" }, 400);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const { data: lead } = await supabase.from("marketing_leads").select("id, status").eq("unsubscribe_token", token).maybeSingle();
    if (!lead) return json({ status: "invalid" }, 404);

    if (req.method === "GET") return json({ status: lead.status === "subscribed" ? "subscribed" : "unsubscribed" });

    if (lead.status === "subscribed") {
      await supabase.from("marketing_leads").update({ status: "unsubscribed" }).eq("id", lead.id);
    }
    const now = new Date().toISOString();
    await supabase.from("marketing_campaign_recipients").update({ unsubscribed_at: now })
      .eq("lead_id", lead.id).not("sent_at", "is", null).is("unsubscribed_at", null);
    await supabase.from("marketing_campaign_recipients").update({ status: "skipped" }).eq("lead_id", lead.id).eq("status", "queued");
    return json({ status: "unsubscribed" });
  } catch (e) {
    console.error("marketing-unsubscribe", e);
    return json({ status: "error" }, 500);
  }
});
