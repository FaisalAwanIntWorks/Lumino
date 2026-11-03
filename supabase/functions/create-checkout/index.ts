import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sanitizeErrorForClient } from "../_shared/secrets-validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-CHECKOUT] ${step}${d}`);
};

// Errors thrown with this class are shown to the client as-is (safe messages only).
class UserFacingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "UserFacingError";
    this.status = status;
  }
}

/**
 * Normalize an email address into a canonical fingerprint for trial dedup.
 * Handles Gmail dot-trick and +alias variants.
 */
function normalizeEmailFingerprint(email: string): string {
  const at = email.toLowerCase().lastIndexOf("@");
  if (at === -1) return email.toLowerCase();

  let local = email.slice(0, at).toLowerCase();
  const domain = email.slice(at + 1).toLowerCase();

  // Strip +alias (user+foo@example.com → user@example.com)
  local = local.split("+")[0];

  // Gmail: dots in local part are ignored (j.o.h.n === john)
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
  }

  return `${local}@${domain}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new UserFacingError("No authorization header provided", 401);

    const token = authHeader.replace("Bearer ", "");
    const { data, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new UserFacingError("Authentication failed. Please sign in again.", 401);
    const user = data.user;
    if (!user?.email) throw new UserFacingError("User not authenticated.", 401);
    logStep("User authenticated", { userId: user.id });

    // Parse plan_name from request body
    let planName = "Custom X";
    try {
      const body = await req.json();
      if (body?.plan_name && typeof body.plan_name === "string") {
        planName = body.plan_name;
      }
    } catch {
      // Default to Custom X if no body
    }

    // Load plan config from DB (dynamic — no hardcoded price IDs)
    const { data: planData, error: planError } = await supabaseClient
      .from("subscription_plans")
      .select("id, name, stripe_price_id, stripe_license_price_id, include_license")
      .eq("name", planName)
      .single();

    if (planError || !planData) {
      throw new UserFacingError(`Unknown plan: ${planName}`, 400);
    }

    if (!planData.stripe_price_id) {
      throw new UserFacingError(
        `${planName} plan requires a custom consultation. Please contact sales.`,
        400
      );
    }

    logStep("Plan loaded from DB", { planName, includeLicense: planData.include_license });

    const emailFingerprint = normalizeEmailFingerprint(user.email);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil", maxNetworkRetries: 3 });

    // ── Resolve Stripe customer: DB-first, email fallback ────────────────
    const { data: client } = await supabaseClient
      .from("clients")
      .select("id, stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId: string | undefined = client?.stripe_customer_id ?? undefined;

    if (!customerId) {
      // Email-based lookup for first-time subscribers
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        logStep("Stripe customer found via email", { customerId });

        // Persist for future lookups — avoids re-querying Stripe on every request
        if (client) {
          await supabaseClient
            .from("clients")
            .update({ stripe_customer_id: customerId })
            .eq("id", client.id)
            .is("stripe_customer_id", null);
        }
      }
    } else {
      logStep("Stripe customer found in DB", { customerId });
    }

    // ── Past-due renewal: pay the open invoice instead of a new subscription ──
    // When a renewal charge failed (invoice.payment_failed → past_due/unpaid) the
    // existing subscription is still alive in Stripe with an OPEN invoice. Creating
    // a fresh Checkout session here would leave that subscription dangling (double
    // billing once Smart Retries succeed) — so send the customer to Stripe's hosted
    // invoice page, where they can update their card and settle the renewal. Paying
    // it flips the subscription back to active and the webhook restores access.
    if (customerId) {
      const [pastDue, unpaid] = await Promise.all([
        stripe.subscriptions.list({ customer: customerId, status: "past_due", limit: 1 }),
        stripe.subscriptions.list({ customer: customerId, status: "unpaid", limit: 1 }),
      ]);
      const delinquentSub = pastDue.data[0] ?? unpaid.data[0];
      const latestInvoiceId =
        typeof delinquentSub?.latest_invoice === "string"
          ? delinquentSub.latest_invoice
          : delinquentSub?.latest_invoice?.id ?? null;

      if (delinquentSub && latestInvoiceId) {
        const invoice = await stripe.invoices.retrieve(latestInvoiceId);
        if (invoice.status === "open" && invoice.hosted_invoice_url) {
          logStep("Past-due subscription found — returning hosted invoice", {
            subscriptionId: delinquentSub.id,
            invoiceId: invoice.id,
            status: delinquentSub.status,
          });
          return new Response(
            JSON.stringify({ url: invoice.hosted_invoice_url, kind: "invoice" }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
          );
        }
        logStep("Past-due subscription found but latest invoice not payable — falling through to checkout", {
          subscriptionId: delinquentSub.id,
          invoiceId: invoice.id,
          invoiceStatus: invoice.status,
        });
      }
    }

    // ── Trial abuse check: block reused email fingerprints ───────────────
    // Only blocks a fingerprint that belongs to a DIFFERENT client. A returning
    // customer reactivating their own (canceled/past-due) subscription owns the
    // fingerprint from their original trial and must not be locked out.
    const { data: existingFingerprint } = await supabaseClient
      .from("trial_used_fingerprints")
      .select("id, client_id")
      .eq("fingerprint_type", "email")
      .eq("fingerprint_value", emailFingerprint)
      .maybeSingle();

    if (existingFingerprint && (!client || existingFingerprint.client_id !== client.id)) {
      throw new UserFacingError(
        "A free trial has already been used with this email address. Please contact support to discuss plan options.",
        403
      );
    }
    logStep(
      existingFingerprint
        ? "Email fingerprint belongs to this client — returning customer, checkout allowed"
        : "Email fingerprint clear — no prior trial found"
    );

    const origin = req.headers.get("origin") || "https://vault.jewlx.ai";

    // Build line items
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      { price: planData.stripe_price_id, quantity: 1 },
    ];

    if (planData.include_license && planData.stripe_license_price_id) {
      lineItems.unshift({ price: planData.stripe_license_price_id, quantity: 1 });
    }

    // Idempotency key: one checkout session per user+plan per 5-minute window.
    // Prevents double-session on double-click or network retry, while a failed
    // attempt (Stripe replays the stored error for the key) clears quickly so
    // "Please try again" actually retries.
    const timeBucket = Math.floor(Date.now() / (5 * 60 * 1000));
    const idempotencyKey = `checkout:${user.id}:${planName}:${customerId ?? "new"}:${timeBucket}`;

    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        customer_email: customerId ? undefined : user.email,
        line_items: lineItems,
        mode: "subscription",
        subscription_data: {
          metadata: { email_fingerprint: emailFingerprint },
        },
        // Collect billing address — required for Stripe Tax to compute GST/HST/PST
        billing_address_collection: "required",
        // Stripe Tax automatically applies correct tax rate based on customer address
        automatic_tax: { enabled: true },
        // Allow existing customer address to update for tax purposes
        customer_update: customerId ? { address: "auto" } : undefined,
        success_url: `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/plan-selection`,
        metadata: {
          user_id: user.id,
          plan_name: planName,
          company_name: user.user_metadata?.company_name || "My Company",
          email_fingerprint: emailFingerprint,
        },
      },
      { idempotencyKey }
    );

    logStep("Checkout session created", { sessionId: session.id, planName });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    if (error instanceof UserFacingError) {
      return new Response(JSON.stringify({ error: error.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: error.status,
      });
    }
    // Stripe request/permission errors carry no secrets and are the only way a
    // client can tell "card declined / key lacks permission" from a generic 500.
    const stripeType = (error as any)?.type as string | undefined;
    const stripeMsg =
      stripeType === "StripeInvalidRequestError" || stripeType === "StripePermissionError"
        ? `Stripe: ${(error as any)?.message ?? "request rejected"}`
        : null;
    const clientMsg = stripeMsg ?? sanitizeErrorForClient(
      error,
      "Checkout session creation failed. Please try again."
    );
    if (stripeMsg) logStep("Stripe error", { type: stripeType, code: (error as any)?.code, message: (error as any)?.message });
    return new Response(JSON.stringify({ error: clientMsg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
