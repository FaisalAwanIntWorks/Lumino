import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveLicensePayments } from "../_shared/license-resolver.ts";
import {
  resolveOrCreatePlan,
  subscriptionPriceId,
  subscriptionProductId,
} from "../_shared/stripe-plan-resolver.ts";
import { denyReadOnlyAdmin } from "../_shared/admin-access.ts";
import { applyUpcomingScheduleForClient } from "../_shared/stripe-schedule.ts";

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

  // Read-only admin staff must not perform any write operation.
  const readOnlyDenied = await denyReadOnlyAdmin(req, corsHeaders);
  if (readOnlyDenied) return readOnlyDenied;

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
      .select("id, email, company_name, stripe_customer_id, plan_id, enabled_features, license_fee_payment_ref")
      .eq("id", clientId)
      .maybeSingle();
    if (clientErr || !client) throw new Error("Client not found");

    // Snapshot "before" totals from the cache for audit logging.
    const { data: beforeSub } = await supabase
      .from("client_subscriptions")
      .select("license_total_paid, license_currency, license_last_paid_at, status, plan_name")
      .eq("client_id", clientId)
      .maybeSingle();
    const before = {
      license_total_paid: beforeSub?.license_total_paid ?? 0,
      license_currency: beforeSub?.license_currency ?? null,
      license_last_paid_at: beforeSub?.license_last_paid_at ?? null,
      status: beforeSub?.status ?? null,
      plan_name: beforeSub?.plan_name ?? null,
    };

    const writeAudit = async (
      outcome: "success" | "noop" | "error",
      after: Record<string, unknown>,
      extra: Record<string, unknown> = {},
    ) => {
      try {
        await supabase.from("admin_activity_logs").insert({
          admin_user_id: userData.user.id,
          admin_email: userData.user.email ?? "unknown",
          admin_name: (userData.user.user_metadata as any)?.full_name ?? null,
          admin_type: "agency_admin",
          action_type: "stripe_reconcile",
          action_category: "billing",
          description:
            outcome === "success"
              ? `Reconciled Stripe for ${client.company_name ?? client.email ?? clientId}`
              : outcome === "noop"
              ? `Stripe reconcile ran (no-op) for ${client.company_name ?? client.email ?? clientId}`
              : `Stripe reconcile failed for ${client.company_name ?? client.email ?? clientId}`,
          metadata: {
            client_id: clientId,
            outcome,
            before,
            after,
            ...extra,
          },
          ip_address: req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip"),
          user_agent: req.headers.get("user-agent"),
        });
      } catch (e) {
        log("AUDIT_LOG_FAILED", { error: e instanceof Error ? e.message : String(e) });
      }
    };

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil", maxNetworkRetries: 3 });

    // Resolve Stripe customer
    let customerId = overrideCustomerId || client.stripe_customer_id;
    if (!customerId && client.email) {
      const list = await stripe.customers.list({ email: client.email, limit: 1 });
      if (list.data.length > 0) customerId = list.data[0].id;
    }
    if (!customerId) {
      await writeAudit("noop", { ...before }, { reason: "no_stripe_customer" });
      return new Response(
        JSON.stringify({ ok: false, reason: "no_stripe_customer", message: "No Stripe customer found for this client's email." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    // Surface a login-email vs Stripe-email mismatch to the admin (informational).
    let stripeEmail: string | null = null;
    try {
      const cust = await stripe.customers.retrieve(customerId);
      stripeEmail = (cust as any)?.deleted ? null : ((cust as any)?.email ?? null);
    } catch { /* ignore */ }
    const emailMismatch = !!(stripeEmail && client.email && stripeEmail.toLowerCase() !== String(client.email).toLowerCase());

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
      // Plan booked to start later counts as active ("scheduled").
      const sched = await applyUpcomingScheduleForClient(supabase, stripe, client.id, customerId);
      if (sched) {
        await supabase.from("clients").update({ status: "active" }).eq("id", client.id);
        await writeAudit("success", { ...before, status: "scheduled" }, { path: "scheduled_plan", schedule_id: sched.scheduleId, starts_at: sched.startAt });
        return new Response(
          JSON.stringify({ ok: true, stripe_customer_id: customerId, stripe_email: stripeEmail, email_mismatch: emailMismatch, status: "scheduled", scheduled_start_at: sched.startAt, schedule_id: sched.scheduleId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }
    }
    if (!sub) {
      const any = await stripe.subscriptions.list({ customer: customerId, limit: 1 });
      sub = any.data[0] ?? null;
    }

    if (!sub) {
      // No subscription, but still try to resolve license-fee payments so
      // custom-plan clients (license-only) show in the billing UI.
      const license = await resolveLicensePayments(
        stripe,
        (client.license_fee_payment_ref as string[] | null) ?? [],
      );
      if (license.payments.length > 0) {
        await supabase.from("client_subscriptions").upsert(
          {
            client_id: client.id,
            stripe_customer_id: customerId,
            status: "none",
            has_license_fee: true,
            license_payments: license.payments as unknown as Record<string, unknown>[],
            license_total_paid: license.total_paid,
            license_currency: license.currency,
            license_last_paid_at: license.last_paid_at,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "client_id" },
        );
        const afterLicenseOnly = {
          license_total_paid: license.total_paid,
          license_currency: license.currency,
          license_last_paid_at: license.last_paid_at,
          status: "none",
          plan_name: null,
        };
        await writeAudit("success", afterLicenseOnly, {
          license_payment_count: license.payments.length,
          path: "license_only_no_subscription",
        });
        return new Response(
          JSON.stringify({
            ok: true,
            stripe_customer_id: customerId,
            status: "none",
            plan_name: null,
            license_payments: license.payments,
            license_total_paid: license.total_paid,
            license_currency: license.currency,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }
      await writeAudit("noop", { ...before }, { reason: "no_subscription" });
      return new Response(
        JSON.stringify({ ok: false, reason: "no_subscription", message: "Stripe customer has no subscriptions." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }

    // Resolve plan (price id / legacy price / product id) and auto-create a
    // full-access plan when the Stripe price isn't mapped yet.
    const priceId = subscriptionPriceId(sub);
    const planRow = await resolveOrCreatePlan(supabase, stripe, priceId, {
      productId: subscriptionProductId(sub),
      amountCents: sub.items.data[0]?.price?.unit_amount ?? null,
      interval: sub.items.data[0]?.price?.recurring?.interval ?? null,
    });

    const planName = planRow?.name ?? null;
    const planId = planRow?.id ?? null;
    const hasLicense = planRow?.include_license ?? false;


    // Update clients row. Modules (enabled_features) are admin-controlled
    // and never changed by a billing sync.
    const clientUpdate: Record<string, unknown> = {};
    if (planId) clientUpdate.plan_id = planId;
    if (["active", "trialing"].includes(sub.status)) clientUpdate.status = "active";
    if (Object.keys(clientUpdate).length > 0) {
      await supabase.from("clients").update(clientUpdate).eq("id", client.id);
    }

    // Resolve license-fee payments from admin-linked refs
    const license = await resolveLicensePayments(
      stripe,
      (client.license_fee_payment_ref as string[] | null) ?? [],
    );
    const hasLicenseFlag = hasLicense || license.payments.length > 0;

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
        has_license_fee: hasLicenseFlag,
        license_payments: license.payments as unknown as Record<string, unknown>[],
        license_total_paid: license.total_paid,
        license_currency: license.currency,
        license_last_paid_at: license.last_paid_at,
        cancel_at_period_end: sub.cancel_at_period_end ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id" },
    );

    log("Reconciled", { clientId: client.id, customerId, planName, status: sub.status, priceId, licenseCount: license.payments.length });

    await writeAudit(
      "success",
      {
        license_total_paid: license.total_paid,
        license_currency: license.currency,
        license_last_paid_at: license.last_paid_at,
        status: sub.status,
        plan_name: planName,
      },
      {
        subscription_id: sub.id,
        plan_id: planId,
        price_id: priceId,
        license_payment_count: license.payments.length,
        feature_set_applied: false,
      },
    );

    return new Response(
      JSON.stringify({
        ok: true,
        stripe_customer_id: customerId,
        stripe_email: stripeEmail,
        email_mismatch: emailMismatch,
        subscription_id: sub.id,
        plan_name: planName,
        plan_id: planId,
        status: sub.status,
        current_period_end: getSubscriptionPeriodEnd(sub),
        feature_set_applied: false,
        price_id: priceId,
        license_payments: license.payments,
        license_total_paid: license.total_paid,
        license_currency: license.currency,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("ERROR", { message: msg });
    // Best-effort audit: writeAudit may not be in scope on very early failures.
    try {
      // @ts-ignore — defensive when failure happens before writeAudit is defined
      if (typeof writeAudit === "function") await writeAudit("error", {}, { error: msg });
    } catch { /* ignore */ }
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
