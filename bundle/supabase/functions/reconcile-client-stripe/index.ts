import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (s: string, d?: unknown) =>
  console.log(`[RECONCILE-CLIENT-STRIPE] ${s}${d ? " - " + JSON.stringify(d) : ""}`);

function unixToIso(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : null;
}

function getSubscriptionPeriodEnd(subscription: Stripe.Subscription): string | null {
  const topLevel = (subscription as any).current_period_end;
  const itemLevel = subscription.items?.data?.[0]?.current_period_end;
  return unixToIso(typeof topLevel === "number" ? topLevel : itemLevel);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData.user) throw new Error("Invalid auth");

    // Verify caller is agency_admin
    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "agency_admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const clientId: string | undefined = body.client_id;
    const overrideCustomerId: string | undefined = body.stripe_customer_id;
    if (!clientId) throw new Error("client_id required");

    // Fetch client row
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, email, stripe_customer_id, plan_id, enabled_features")
      .eq("id", clientId)
      .maybeSingle();
    if (clientErr || !client) throw new Error("Client not found");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil", maxNetworkRetries: 3 });

    // Resolve Stripe customer
    let customerId = overrideCustomerId || client.stripe_customer_id;
    if (!customerId && client.email) {
      const list = await stripe.customers.list({ email: client.email, limit: 1 });
      if (list.data.length > 0) customerId = list.data[0].id;
    }
    if (!customerId) {
      return new Response(
        JSON.stringify({ ok: false, reason: "no_stripe_customer", message: "No Stripe customer found for this client's email." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    // Persist stripe_customer_id if missing
    if (client.stripe_customer_id !== customerId) {
      await supabase.from("clients").update({ stripe_customer_id: customerId }).eq("id", client.id);
    }

    // Find active or trialing sub
    const [active, trialing] = await Promise.all([
      stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 }),
      stripe.subscriptions.list({ customer: customerId, status: "trialing", limit: 1 }),
    ]);
    const subs = [...active.data, ...trialing.data];
    let sub: Stripe.Subscription | null = subs[0] ?? null;
    if (!sub) {
      const any = await stripe.subscriptions.list({ customer: customerId, limit: 1 });
      sub = any.data[0] ?? null;
    }

    if (!sub) {
      return new Response(
        JSON.stringify({ ok: false, reason: "no_subscription", message: "Stripe customer has no subscriptions." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    // Resolve plan via DB (price_id OR legacy_stripe_price_ids)
    const priceId = sub.items.data[0]?.price?.id ?? null;
    let planRow: { id: string; name: string; feature_set: Record<string, boolean> | null; include_license: boolean } | null = null;
    if (priceId) {
      const { data: byPrice } = await supabase
        .from("subscription_plans")
        .select("id, name, feature_set, include_license")
        .eq("stripe_price_id", priceId)
        .maybeSingle();
      if (byPrice) planRow = byPrice as any;

      if (!planRow) {
        const { data: byLegacy } = await supabase
          .from("subscription_plans")
          .select("id, name, feature_set, include_license")
          .contains("legacy_stripe_price_ids", [priceId])
          .maybeSingle();
        if (byLegacy) planRow = byLegacy as any;
      }
    }

    const planName = planRow?.name ?? null;
    const planId = planRow?.id ?? null;
    const featureSet = planRow?.feature_set ?? null;
    const hasLicense = planRow?.include_license ?? false;

    // Update clients row
    const clientUpdate: Record<string, unknown> = {};
    if (planId) clientUpdate.plan_id = planId;
    if (featureSet) clientUpdate.enabled_features = featureSet;
    if (["active", "trialing"].includes(sub.status)) clientUpdate.status = "active";
    if (Object.keys(clientUpdate).length > 0) {
      await supabase.from("clients").update(clientUpdate).eq("id", client.id);
    }

    // Upsert client_subscriptions cache
    await supabase.from("client_subscriptions").upsert(
      {
        client_id: client.id,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        status: sub.status,
        plan_name: planName,
        plan_id: planId,
        current_period_end: getSubscriptionPeriodEnd(sub),
        trial_end: unixToIso(sub.trial_end),
        has_license_fee: hasLicense,
        cancel_at_period_end: sub.cancel_at_period_end ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id" },
    );

    log("Reconciled", { clientId: client.id, customerId, planName, status: sub.status, priceId });

    return new Response(
      JSON.stringify({
        ok: true,
        stripe_customer_id: customerId,
        plan_name: planName,
        plan_id: planId,
        status: sub.status,
        current_period_end: getSubscriptionPeriodEnd(sub),
        feature_set_applied: !!featureSet,
        price_id: priceId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    log("ERROR", { message: e instanceof Error ? e.message : String(e) });
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
