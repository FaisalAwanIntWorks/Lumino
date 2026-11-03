// One-shot backfill: scan Stripe checkout sessions from the last 30 days and
// fulfill any CAD add-on purchases that were charged before metadata tagging
// was added to purchase-cad-addon. Idempotent via stripe_session_id uniqueness
// on client_cad_addons.
//
// Auth: requires Authorization Bearer with the SUPABASE_SERVICE_ROLE_KEY OR a
// signed-in agency_admin user. Returns a JSON summary of what was found and
// what was inserted.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (s: string, d?: unknown) =>
  console.log(`[BACKFILL-CAD-ADDONS] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);

// Map known CAD add-on price IDs to (kind, label). Mirrors CAD_ADDON_PRICES
// in purchase-cad-addon/index.ts. Used to detect legacy sessions that lacked
// metadata.addon_kind.
const ADDON_PRICE_MAP: Record<string, { kind: string; label: string }> = {
  "price_1TI8rHELyIQnr0qGFputHmUE": { kind: "cad_tweak",  label: "CAD Tweak" },
  "price_1TI8rgELyIQnr0qGwkKGJfIi": { kind: "new_cad",    label: "New CAD Request" },
  "price_1TI8s4ELyIQnr0qGUVbRSlow": { kind: "cad_render", label: "CAD + Render" },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not configured");

    // Authorize: must be agency_admin OR call with the service role key
    const auth = req.headers.get("Authorization") || "";
    const token = auth.replace("Bearer ", "").trim();
    let authorized = false;

    if (token && token === serviceKey) {
      authorized = true;
    } else if (token) {
      const sbUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: u } = await sbUser.auth.getUser(token);
      if (u?.user) {
        const sbAdmin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
        const { data: roles } = await sbAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", u.user.id);
        if (roles?.some((r: any) => r.role === "agency_admin")) authorized = true;
      }
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // Look up known CAD add-on price IDs from purchase-cad-addon source intent.
    // We pass them in as a query/body override OR detect by line item description.
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const overrideMap = (body?.price_map ?? {}) as Record<string, { kind: string; label: string }>;
    Object.assign(ADDON_PRICE_MAP, overrideMap);

    const sinceSeconds = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    const summary = {
      sessions_scanned: 0,
      cad_addon_candidates: 0,
      already_fulfilled: 0,
      newly_fulfilled: 0,
      skipped_no_client: 0,
      errors: [] as Array<{ session_id: string; error: string }>,
      fulfilled: [] as Array<{ session_id: string; client_id: string; addon_kind: string }>,
    };

    let starting_after: string | undefined = undefined;
    let pageCount = 0;
    const MAX_PAGES = 20; // 100 * 20 = 2000 sessions max safety cap

    while (pageCount < MAX_PAGES) {
      const page: Awaited<ReturnType<typeof stripe.checkout.sessions.list>> = await stripe.checkout.sessions.list({
        limit: 100,
        created: { gte: sinceSeconds },
        ...(starting_after ? { starting_after } : {}),
      });

      pageCount++;
      summary.sessions_scanned += page.data.length;

      for (const session of page.data) {
        if (session.payment_status !== "paid") continue;
        if (session.mode !== "payment") continue;

        // Detect CAD add-on:
        // 1) explicit metadata (new sessions)
        // 2) price_id present in ADDON_PRICE_MAP override (legacy sessions)
        let addonKind: string | null = session.metadata?.addon_kind ?? null;
        let addonLabel: string | null = session.metadata?.addon_label ?? null;
        let priceId: string | null = session.metadata?.price_id ?? null;
        let clientId: string | null = session.metadata?.client_id ?? null;

        if (!addonKind) {
          // Inspect line items for a price ID we recognise
          try {
            const li = await stripe.checkout.sessions.listLineItems(session.id, { limit: 5 });
            for (const item of li.data) {
              const pid = item.price?.id;
              if (pid && ADDON_PRICE_MAP[pid]) {
                priceId = pid;
                addonKind = ADDON_PRICE_MAP[pid].kind;
                addonLabel = ADDON_PRICE_MAP[pid].label;
                break;
              }
            }
          } catch (e) {
            // ignore
          }
        }

        if (!addonKind) continue; // Not a CAD add-on session
        summary.cad_addon_candidates++;

        // Resolve client by stripe_customer_id if metadata missing
        if (!clientId) {
          const customerId =
            typeof session.customer === "string"
              ? session.customer
              : session.customer?.id ?? null;
          if (customerId) {
            const { data: c } = await supabase
              .from("clients")
              .select("id")
              .eq("stripe_customer_id", customerId)
              .maybeSingle();
            clientId = c?.id ?? null;
          }
        }

        if (!clientId) {
          summary.skipped_no_client++;
          continue;
        }

        // Idempotent insert
        const { error: insErr } = await supabase
          .from("client_cad_addons")
          .insert({
            client_id: clientId,
            addon_kind: addonKind,
            stripe_session_id: session.id,
            stripe_price_id: priceId,
            amount_cents: session.amount_total ?? 0,
            currency: session.currency ?? "usd",
            metadata: { source: "backfill_30d", backfilled_at: new Date().toISOString() },
          });

        if (insErr) {
          if ((insErr as any).code === "23505") {
            summary.already_fulfilled++;
          } else {
            summary.errors.push({ session_id: session.id, error: insErr.message });
            log("Insert failed", { session_id: session.id, error: insErr.message });
          }
          continue;
        }

        summary.newly_fulfilled++;
        summary.fulfilled.push({ session_id: session.id, client_id: clientId, addon_kind: addonKind });

        // Notify the client in-app
        try {
          await supabase.from("client_notifications").insert({
            client_id: clientId,
            category: "billing",
            title: "CAD Add-on Activated",
            message: `${addonLabel ?? addonKind} is now available on your account.`,
            metadata: {
              addon_kind: addonKind,
              stripe_session_id: session.id,
              amount_cents: session.amount_total ?? 0,
              backfilled: true,
            },
          });
        } catch (e: any) {
          log("Client notification failed (swallowed)", { error: String(e?.message ?? e) });
        }
      }

      if (!page.has_more) break;
      starting_after = page.data[page.data.length - 1]?.id;
      if (!starting_after) break;
    }

    log("Backfill complete", summary);

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    log("ERROR", { msg: e?.message ?? String(e) });
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
