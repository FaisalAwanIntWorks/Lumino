// deno-lint-ignore-file no-explicit-any
import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { Webhook } from "npm:svix@1.45.1";

/**
 * Resend delivery events for marketing campaigns. Verified with the Svix
 * signature (RESEND_MARKETING_WEBHOOK_SECRET). Bounces/complaints suppress the lead.
 */
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const secret = Deno.env.get("RESEND_MARKETING_WEBHOOK_SECRET");
  if (!secret) return new Response("not configured", { status: 503 });

  const payload = await req.text();
  let evt: any;
  try {
    evt = new Webhook(secret).verify(payload, {
      "svix-id": req.headers.get("svix-id") ?? "",
      "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
      "svix-signature": req.headers.get("svix-signature") ?? "",
    });
  } catch {
    return new Response("invalid signature", { status: 401 });
  }

  const resendId: string | undefined = evt?.data?.email_id;
  if (!resendId) return new Response("ignored");

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: rec } = await supabase.from("marketing_campaign_recipients").select("id, lead_id, opened_at, clicked_at").eq("resend_id", resendId).maybeSingle();
  if (!rec) return new Response("ignored");

  const at = evt.created_at ?? new Date().toISOString();
  const patch: Record<string, unknown> = {};
  let leadStatus: string | null = null;
  switch (evt.type) {
    case "email.delivered": patch.delivered_at = at; patch.status = "delivered"; break;
    case "email.opened": if (!rec.opened_at) patch.opened_at = at; break;
    case "email.clicked": if (!rec.clicked_at) patch.clicked_at = at; break;
    case "email.bounced":
      patch.bounced_at = at; patch.status = "failed";
      if (evt.data?.bounce?.type !== "Transient") leadStatus = "bounced";
      break;
    case "email.complained": patch.complained_at = at; leadStatus = "complained"; break;
    default: return new Response("ignored");
  }
  if (Object.keys(patch).length) await supabase.from("marketing_campaign_recipients").update(patch).eq("id", rec.id);
  if (leadStatus) await supabase.from("marketing_leads").update({ status: leadStatus }).eq("id", rec.lead_id);
  return new Response("ok");
});
