import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sanitizeErrorForClient } from "../_shared/secrets-validation.ts";
import { resolveLicensePayments, type LicensePayment } from "../_shared/license-resolver.ts";
import { resolveClientIdForUser, resolveStripeCustomer } from "../_shared/stripe-customer.ts";
import { findUpcomingSchedule, scheduledCacheFields } from "../_shared/stripe-schedule.ts";
import { resolveOrCreatePlan } from "../_shared/stripe-plan-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CHECK-SUBSCRIPTION] ${step}${d}`);
};

const LICENSE_PRODUCT_ID = "prod_U9aNjNMnl3rL9s";
const CACHE_TTL_MS = 15 * 60 * 1000;

type SupabaseClientT = ReturnType<typeof createClient>;

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

// ── Plan resolution (DB-driven, supports legacy price IDs) ──────────────────

async function resolvePlanByPriceId(
  supabase: SupabaseClientT,
  priceId: string,
): Promise<{ id: string; name: string; include_license: boolean } | null> {
  const { data: byPrice } = await supabase
    .from("subscription_plans")
    .select("id, name, include_license")
    .eq("stripe_price_id", priceId)
    .maybeSingle();
  if (byPrice) return byPrice as any;

  const { data: byLegacy } = await supabase
    .from("subscription_plans")
    .select("id, name, include_license")
    .contains("legacy_stripe_price_ids", [priceId])
    .maybeSingle();
  return (byLegacy as any) ?? null;
}

// ── Stripe helpers ─────────────────────────────────────────────────────────

async function fetchPaymentMethod(
  stripe: Stripe,
  customerId: string,
): Promise<{ brand: string; last4: string; exp_month: number; exp_year: number } | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
    const defaultPm = customer.invoice_settings?.default_payment_method;
    if (defaultPm && typeof defaultPm === "string") {
      const pm = await stripe.paymentMethods.retrieve(defaultPm);
      if (pm.card) {
        return {
          brand: pm.card.brand,
          last4: pm.card.last4,
          exp_month: pm.card.exp_month,
          exp_year: pm.card.exp_year,
        };
      }
    }
  } catch (e) {
    logStep("Could not fetch payment method", { error: String(e) });
  }
  return null;
}

async function fetchInvoices(
  stripe: Stripe,
  customerId: string,
): Promise<{ id: string; amount: number; status: string; date: string; pdf: string | null }[]> {
  try {
    const stripeInvoices = await stripe.invoices.list({ customer: customerId, limit: 10 });
    return stripeInvoices.data.map((inv: any) => ({
      id: inv.id,
      amount: (inv.amount_paid ?? inv.total ?? 0) / 100,
      status: inv.status ?? "unknown",
      date: new Date((inv.created ?? 0) * 1000).toISOString(),
      pdf: inv.invoice_pdf ?? null,
    }));
  } catch (e) {
    logStep("Could not fetch invoices", { error: String(e) });
    return [];
  }
}

// ── Main handler ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const authUser = userData.user;
    if (!authUser?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { email: authUser.email });

    // Optional admin impersonation: agency_admin may pass impersonate_client_id
    // to view the billing state of another client.
    let impersonateClientId: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body.impersonate_client_id === "string" && body.impersonate_client_id) {
          impersonateClientId = body.impersonate_client_id;
        }
      } catch { /* no body / not json — ignore */ }
    }

    let effectiveEmail = authUser.email!;
    let client: { id: string; stripe_customer_id: string | null; license_fee_payment_ref: string[] | null; email?: string | null } | null = null;

    if (impersonateClientId) {
      const { data: roleRow } = await supabaseClient
        .from("user_roles")
        .select("role")
        .eq("user_id", authUser.id)
        .eq("role", "agency_admin")
        .maybeSingle();
      if (!roleRow) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: impClient, error: impErr } = await supabaseClient
        .from("clients")
        .select("id, email, stripe_customer_id, license_fee_payment_ref")
        .eq("id", impersonateClientId)
        .maybeSingle();
      if (impErr || !impClient) {
        return new Response(JSON.stringify({ error: "client_not_found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      client = impClient as any;
      effectiveEmail = (impClient.email as string | null) || effectiveEmail;
      logStep("Admin impersonation active", { adminId: authUser.id, clientId: impClient.id, clientEmail: impClient.email });
    } else {
      // Owner or active staff member -> their company's client row.
      const ownClientId = await resolveClientIdForUser(supabaseClient, authUser.id);
      if (ownClientId) {
        const { data: ownClient } = await supabaseClient
          .from("clients")
          .select("id, email, stripe_customer_id, license_fee_payment_ref")
          .eq("id", ownClientId)
          .maybeSingle();
        client = (ownClient as any) ?? null;
      }
    }

    // Linked Stripe customer wins over the login email (mismatched-email clients).
    const resolveCustomerId = (stripe: Stripe): Promise<string | null> =>
      resolveStripeCustomer(supabaseClient, stripe, { clientId: client?.id ?? null, fallbackEmail: effectiveEmail });

    // Helper: when a Stripe price doesn't match any subscription_plans row,
    // treat as a custom plan and label it with the Stripe product's name.
    const resolveCustomPlanName = async (
      stripe: Stripe,
      subscription: Stripe.Subscription,
    ): Promise<string> => {
      try {
        const productRef = subscription.items.data[0]?.price?.product;
        const productId = typeof productRef === "string" ? productRef : productRef?.id;
        if (productId) {
          const product = await stripe.products.retrieve(productId);
          if (product?.name) return `Custom — ${product.name}`;
        }
      } catch (e) {
        logStep("Could not fetch Stripe product for custom plan", { error: String(e) });
      }
      return "Custom Plan";
    };

    // ── DB cache lookup ──────────────────────────────────────────────────
    if (client) {
      const { data: clientSub } = await supabaseClient
        .from("client_subscriptions")
        .select("*")
        .eq("client_id", client.id)
        .maybeSingle();

      // Treat NULL current_period_end on active/trialing as stale — forces fresh Stripe pull
      const isActiveStatus = clientSub && ["active", "trialing"].includes(clientSub.status);
      const missingPeriod = clientSub && isActiveStatus && !clientSub.current_period_end;
      // A scheduled plan whose start date has passed must be re-read from Stripe.
      const scheduleStarted =
        clientSub?.status === "scheduled" &&
        (!(clientSub as any).scheduled_start_at || new Date((clientSub as any).scheduled_start_at).getTime() <= Date.now());
      const isFresh =
        clientSub &&
        !missingPeriod &&
        !scheduleStarted &&
        Date.now() - new Date(clientSub.updated_at).getTime() < CACHE_TTL_MS;

      if (isFresh) {
        logStep("Serving from DB cache", {
          clientId: client.id,
          status: clientSub.status,
          updatedAt: clientSub.updated_at,
        });

        const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil", maxNetworkRetries: 3 });
        const customerId = clientSub.stripe_customer_id;

        const [paymentMethod, invoices] = await Promise.all([
          fetchPaymentMethod(stripe, customerId),
          fetchInvoices(stripe, customerId),
        ]);

        const isActive = ["active", "trialing", "scheduled"].includes(clientSub.status);
        return new Response(
          JSON.stringify({
            subscribed: isActive,
            status: clientSub.status,
            scheduled_start_at: (clientSub as any).scheduled_start_at ?? null,
            product_id: null,
            plan_name: clientSub.plan_name,
            subscription_end: clientSub.current_period_end,
            trial_end: clientSub.trial_end,
            payment_method: paymentMethod,
            invoices,
            has_license_fee: clientSub.has_license_fee,
            license_payments: (clientSub.license_payments as LicensePayment[]) ?? [],
            license_total_paid: clientSub.license_total_paid ?? 0,
            license_currency: clientSub.license_currency ?? null,
            license_last_paid_at: clientSub.license_last_paid_at ?? null,
            _source: "db_cache",
            _synced_at: clientSub.updated_at,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }
      if (missingPeriod) {
        logStep("Cache stale — current_period_end is NULL on active sub, refetching from Stripe", {
          clientId: client.id,
        });
      }
    }

    // ── Full Stripe path ────────────────────────────────────────────────
    logStep("Cache miss — querying Stripe");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil", maxNetworkRetries: 3 });
    const customerId = await resolveCustomerId(stripe);

    if (!customerId) {
      logStep("No Stripe customer found");
      return new Response(
        JSON.stringify({
          subscribed: false,
          status: "none",
          product_id: null,
          plan_name: null,
          subscription_end: null,
          trial_end: null,
          payment_method: null,
          invoices: [],
          has_license_fee: false,
          license_payments: [],
          license_total_paid: 0,
          license_currency: null,
          license_last_paid_at: null,
          _source: "stripe_live",
          _synced_at: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
      );
    }
    logStep("Resolved Stripe customer", { customerId });

    if (client && client.stripe_customer_id !== customerId) {
      await supabaseClient
        .from("clients")
        .update({ stripe_customer_id: customerId })
        .eq("id", client.id);
    }

    const [activeSubs, trialingSubs] = await Promise.all([
      stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 }),
      stripe.subscriptions.list({ customer: customerId, status: "trialing", limit: 1 }),
    ]);

    const allSubs = [...activeSubs.data, ...trialingSubs.data];
    const hasActiveSub = allSubs.length > 0;

    let priceId: string | null = null;
    let subscriptionEnd: string | null = null;
    let trialEnd: string | null = null;
    let subStatus = "none";
    let subId: string | null = null;
    let cancelAtPeriodEnd = false;

    if (hasActiveSub) {
      const subscription = allSubs[0];
      subId = subscription.id;
      subStatus = subscription.status;
      cancelAtPeriodEnd = subscription.cancel_at_period_end;
      subscriptionEnd = getSubscriptionPeriodEnd(subscription);
      priceId = subscription.items.data[0]?.price?.id ?? null;
      trialEnd = unixToIso(subscription.trial_end);
      logStep("Active subscription found", { subscriptionId: subscription.id, status: subStatus });
    } else {
      const otherSubs = await stripe.subscriptions.list({ customer: customerId, limit: 1 });
      if (otherSubs.data.length > 0) {
        subId = otherSubs.data[0].id;
        subStatus = otherSubs.data[0].status;
        priceId = otherSubs.data[0].items.data[0]?.price?.id ?? null;
      }
      logStep("No active subscription found", { status: subStatus });
    }

    // A plan booked to start later (Stripe subscription schedule) counts as active.
    let schedule: Awaited<ReturnType<typeof findUpcomingSchedule>> = null;
    let schedulePlan: { id: string; name: string } | null = null;
    if (!hasActiveSub) {
      schedule = await findUpcomingSchedule(stripe, customerId);
      if (schedule) {
        const p = schedule.priceId
          ? await resolveOrCreatePlan(supabaseClient as any, stripe, schedule.priceId, {
              productId: schedule.productId,
              amountCents: schedule.amountCents,
              interval: schedule.interval,
            })
          : null;
        schedulePlan = p ? { id: p.id, name: p.name } : null;
        logStep("Scheduled plan found", { scheduleId: schedule.scheduleId, startAt: schedule.startAt, plan: schedulePlan?.name });
      }
    }

    // Resolve plan via DB (canonical name + legacy price support)
    let planName: string | null = null;
    let planId: string | null = null;
    let planIncludesLicense = false;
    if (priceId) {
      const plan = await resolvePlanByPriceId(supabaseClient as any, priceId);
      if (plan) {
        planName = plan.name;
        planId = plan.id;
        planIncludesLicense = plan.include_license;
      } else {
        // Custom plan: price is not in subscription_plans. Label with Stripe product name.
        logStep("Custom plan detected (priceId not mapped)", { priceId });
        if (hasActiveSub) {
          planName = await resolveCustomPlanName(stripe, allSubs[0]);
        }
      }
    }

    const [paymentMethod, invoices] = await Promise.all([
      fetchPaymentMethod(stripe, customerId),
      fetchInvoices(stripe, customerId),
    ]);

    // ── License fee resolution ─────────────────────────────────────────
    // Primary source of truth: admin-curated clients.license_fee_payment_ref
    // (Stripe pi_… / in_… ids). Defensive: resolver excludes credit_purchase
    // metadata and subscription invoices.
    const licenseRefs = (client?.license_fee_payment_ref as string[] | null) ?? [];
    const license = await resolveLicensePayments(stripe, licenseRefs);

    // Legacy fallback for standard self-serve clients who haven't had their
    // payment intent linked yet — keeps existing "Paid" status visible.
    let hasLicenseFee = license.payments.length > 0 || planIncludesLicense;
    if (!hasLicenseFee) {
      try {
        const sessions = await stripe.checkout.sessions.list({ customer: customerId, limit: 50 });
        for (const session of sessions.data) {
          if (session.payment_status === "paid" && session.mode === "payment") {
            const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 5 });
            for (const item of lineItems.data) {
              const itemProductId =
                typeof item.price?.product === "string" ? item.price.product : null;
              if (itemProductId === LICENSE_PRODUCT_ID) {
                hasLicenseFee = true;
                break;
              }
            }
          }
          if (hasLicenseFee) break;
        }
      } catch (e) {
        logStep("Could not check legacy license fee", { error: String(e) });
      }
    }

    if (schedule) {
      subStatus = "scheduled";
      subId = null;
      subscriptionEnd = schedule.startAt;
      trialEnd = null;
      cancelAtPeriodEnd = false;
      planName = schedulePlan?.name ?? planName;
      planId = schedulePlan?.id ?? planId;
    }

    // ── Self-healing write-through ──────────────────────────────────────
    if (client && (subId || schedule || license.payments.length > 0)) {
      await supabaseClient.from("client_subscriptions").upsert(
        {
          client_id: client.id,
          stripe_customer_id: customerId,
          stripe_subscription_id: subId,
          status: subStatus,
          plan_name: planName,
          plan_id: planId,
          current_period_end: subscriptionEnd,
          trial_end: trialEnd,
          has_license_fee: hasLicenseFee,
          license_payments: license.payments as unknown as Record<string, unknown>[],
          license_total_paid: license.total_paid,
          license_currency: license.currency,
          license_last_paid_at: license.last_paid_at,
          cancel_at_period_end: cancelAtPeriodEnd,
          stripe_schedule_id: schedule?.scheduleId ?? null,
          scheduled_start_at: schedule?.startAt ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "client_id" },
      );
      logStep("DB cache self-healed from Stripe", { clientId: client.id, planName, periodEnd: subscriptionEnd });

      // Backfill clients.plan_id on active subs. Modules (enabled_features)
      // are admin-controlled and never changed by a billing sync.
      if (planId && ["active", "trialing", "scheduled"].includes(subStatus)) {
        await supabaseClient.from("clients").update({ plan_id: planId }).eq("id", client.id);
      }
    }

    logStep("Returning billing data from Stripe", {
      subscribed: hasActiveSub,
      planName,
      hasLicenseFee,
      licensePaymentCount: license.payments.length,
      invoiceCount: invoices.length,
    });

    return new Response(
      JSON.stringify({
        subscribed: hasActiveSub || !!schedule,
        status: subStatus,
        scheduled_start_at: schedule?.startAt ?? null,
        product_id: null,
        plan_name: planName,
        subscription_end: subscriptionEnd,
        trial_end: trialEnd,
        payment_method: paymentMethod,
        invoices,
        has_license_fee: hasLicenseFee,
        license_payments: license.payments,
        license_total_paid: license.total_paid,
        license_currency: license.currency,
        license_last_paid_at: license.last_paid_at,
        _source: "stripe_live",
        _synced_at: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    logStep("ERROR", { message: error instanceof Error ? error.message : String(error) });
    const clientMsg = sanitizeErrorForClient(error, "Subscription check failed. Please try again.");
    return new Response(
      JSON.stringify({ error: clientMsg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
