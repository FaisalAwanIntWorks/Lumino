import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";

const logStep = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[STRIPE-WEBHOOK] ${step}${d}`);
};

// 1 credit = $0.0005
const dollarsToCredits = (d: number) => Math.round(d / 0.0005);

// ── Helpers ────────────────────────────────────────────────────────────────

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

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

/** Persist stripe_customer_id on the client row (once only). */
async function saveCustomerIdOnClient(
  supabase: SupabaseClient,
  clientId: string,
  customerId: string,
) {
  await supabase
    .from("clients")
    .update({ stripe_customer_id: customerId })
    .eq("id", clientId)
    .is("stripe_customer_id", null);
}

/** Resolve Stripe customer ID to our internal client_id. */
async function clientByStripeCustomer(
  supabase: SupabaseClient,
  customerId: string,
): Promise<{ id: string; plan_id: string | null } | null> {
  const { data } = await supabase
    .from("clients")
    .select("id, plan_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data ?? null;
}

/** Fetch client display info (company name + email) for notifications. */
async function clientInfo(
  supabase: SupabaseClient,
  clientId: string | null | undefined,
): Promise<{ company_name: string | null; email: string | null }> {
  if (!clientId) return { company_name: null, email: null };
  const { data } = await supabase
    .from("clients")
    .select("company_name, email")
    .eq("id", clientId)
    .maybeSingle();
  return { company_name: data?.company_name ?? null, email: data?.email ?? null };
}

/** Fan out admin in-app notification + email. Idempotent on (event_type, stripe_object_id). */
async function notifyAdmins(
  supabase: SupabaseClient,
  payload: {
    event_type:
      | "subscription_started" | "subscription_renewed" | "subscription_canceled"
      | "credits_purchased" | "cad_addon_purchased"
      | "payment_failed" | "refund" | "dispute";
    stripe_event_id?: string | null;
    stripe_object_id: string;
    client_id?: string | null;
    amount_cents?: number | null;
    currency?: string | null;
    plan_name?: string | null;
    pack_label?: string | null;
    addon_label?: string | null;
    stripe_session_id?: string | null;
    stripe_subscription_id?: string | null;
    stripe_invoice_id?: string | null;
    stripe_charge_id?: string | null;
    occurred_at?: string | null;
    notes?: string | null;
  },
) {
  try {
    const info = await clientInfo(supabase, payload.client_id);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(`${supabaseUrl}/functions/v1/notify-admins-billing-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        ...payload,
        client_company: info.company_name,
        client_email: info.email,
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      logStep("notifyAdmins non-OK", { status: res.status, txt: txt.slice(0, 200) });
    }
  } catch (e: any) {
    // Never fail the webhook on a notification error
    logStep("notifyAdmins error (swallowed)", { msg: e?.message ?? String(e) });
  }
}

/** Resolve plan name + id from a price ID via the subscription_plans table.
 *  Falls back to legacy_stripe_price_ids so old subs created before a price change
 *  still map to the correct plan. */
async function planByPriceId(
  supabase: SupabaseClient,
  priceId: string,
): Promise<
  { id: string; name: string; include_license: boolean; feature_set: Record<string, boolean> | null } | null
> {
  const { data: byPrice } = await supabase
    .from("subscription_plans")
    .select("id, name, include_license, feature_set")
    .eq("stripe_price_id", priceId)
    .maybeSingle();
  if (byPrice) return byPrice as any;

  const { data: byLegacy } = await supabase
    .from("subscription_plans")
    .select("id, name, include_license, feature_set")
    .contains("legacy_stripe_price_ids", [priceId])
    .maybeSingle();
  return (byLegacy as any) ?? null;
}

/**
 * Known-safe per-plan feature defaults — used as a defensive fallback when
 * subscription_plans.feature_set is NULL. Keyed by plan name (case-insensitive).
 */
const FEATURE_SET_DEFAULTS: Record<string, Record<string, boolean>> = {
  "custom x": {
    orders: false, jewlx_agent: false, diamond_form: true, metal_buying: false,
    custom_enquiry: true, embed_branding: false, grillz_builder: true,
    experimental_ui: false, product_catalogue: false,
  },
  "metal iq": {
    orders: false, jewlx_agent: false, diamond_form: false, metal_buying: true,
    custom_enquiry: false, embed_branding: false, grillz_builder: false,
    experimental_ui: false, product_catalogue: false,
  },
  "ring os": {
    orders: true, jewlx_agent: true, diamond_form: true, metal_buying: false,
    custom_enquiry: false, embed_branding: true, grillz_builder: false,
    experimental_ui: false, product_catalogue: true,
  },
  "jewlx suite": {
    orders: true, jewlx_agent: true, diamond_form: true, metal_buying: true,
    custom_enquiry: true, embed_branding: true, grillz_builder: true,
    experimental_ui: true, product_catalogue: true,
  },
};

function resolveFeatureSet(
  planName: string | null,
  planFeatureSet: Record<string, boolean> | null,
): Record<string, boolean> | null {
  if (planFeatureSet) return planFeatureSet;
  if (!planName) return null;
  const fallback = FEATURE_SET_DEFAULTS[planName.toLowerCase().trim()];
  if (fallback) {
    logStep("WARN: feature_set missing in DB — using safe per-plan default", { planName });
    return fallback;
  }
  return null;
}

/**
 * Upsert client_subscriptions row from a Stripe Subscription object.
 * Uses client_id as the conflict target (one row per client).
 */
async function upsertSubscription(
  supabase: SupabaseClient,
  clientId: string,
  customerId: string,
  subscription: Stripe.Subscription,
  overridePlanName?: string | null,
  overridePlanId?: string | null,
  overrideHasLicense?: boolean,
) {
  await supabase.from("client_subscriptions").upsert(
    {
      client_id: clientId,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      plan_name: overridePlanName ?? null,
      plan_id: overridePlanId ?? null,
      current_period_end: getSubscriptionPeriodEnd(subscription),
      trial_end: unixToIso(subscription.trial_end),
      has_license_fee: overrideHasLicense ?? false,
      cancel_at_period_end: subscription.cancel_at_period_end ?? false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "client_id" },
  );
}

// ── Event handlers ─────────────────────────────────────────────────────────

/**
 * Payment Link auto-onboarding.
 * Triggered by checkout.session.completed when a brand-new customer pays via a
 * Stripe Payment Link (no user_id metadata). Provisions a JewlX account end-to-end.
 */
async function handlePaymentLinkOnboarding(
  session: Stripe.Checkout.Session,
  customerId: string,
  supabase: SupabaseClient,
  stripe: Stripe,
) {
  const paymentLinkId =
    typeof session.payment_link === "string"
      ? session.payment_link
      : session.payment_link?.id ?? null;

  // Look up plan from subscription_plans by payment_link_id
  let planId: string | null = null;
  let planName: string | null = null;
  let featureSet: Record<string, boolean> | null = null;
  if (paymentLinkId) {
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("id, name, feature_set")
      .eq("stripe_payment_link_id", paymentLinkId)
      .maybeSingle();
    if (plan) {
      planId = plan.id;
      planName = plan.name;
      featureSet = (plan.feature_set as Record<string, boolean> | null) ?? null;
    } else {
      logStep("Payment Link not mapped to any plan — will try price_id fallback", { paymentLinkId });
    }
  }

  // Fallback: resolve plan from the subscription's first price ID.
  // This handles plans where stripe_payment_link_id was not pre-populated in the DB
  // (e.g. Metal IQ) so onboarding still applies the correct feature_set.
  if (!planId) {
    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id ?? null;
    if (subscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        for (const item of sub.items.data) {
          const priceId = item.price?.id;
          if (!priceId) continue;
          const plan = await planByPriceId(supabase, priceId);
          if (plan) {
            planId = plan.id;
            planName = plan.name;
            featureSet = plan.feature_set ?? null;
            logStep("Plan resolved via price_id fallback", { planId, planName, priceId });
            break;
          }
        }
      } catch (e) {
        logStep("WARN: failed to retrieve subscription for price_id fallback", { error: String(e) });
      }
    }
  }

  // ── STRICT ALLOWLIST ──────────────────────────────────────────────────────
  // Only auto-onboard when the Stripe payment matches a published standard
  // plan in subscription_plans (by payment_link_id, stripe_price_id, or
  // legacy_stripe_price_ids). Custom prices, ad-hoc Payment Links, and
  // one-off deals must be onboarded manually — we just alert the admins.
  if (!planId) {
    logStep("WARN: non-standard plan, skipping auto-onboarding", {
      sessionId: session.id,
      customerId,
      paymentLinkId,
    });

    // Best-effort: gather context for the admin alert
    let priceIdForAlert: string | null = null;
    let amountCentsForAlert: number | null = session.amount_total ?? null;
    let currencyForAlert: string | null = session.currency ?? null;
    try {
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null;
      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const firstItem = sub.items.data[0];
        priceIdForAlert = firstItem?.price?.id ?? null;
        if (amountCentsForAlert == null && firstItem?.price?.unit_amount != null) {
          amountCentsForAlert = firstItem.price.unit_amount;
        }
        if (!currencyForAlert && firstItem?.price?.currency) {
          currencyForAlert = firstItem.price.currency;
        }
      }
    } catch (e) {
      logStep("WARN: failed to retrieve subscription for alert context", { error: String(e) });
    }

    const alertEmail =
      session.customer_details?.email ??
      session.customer_email ??
      null;

    const alertMessage =
      `Stripe payment from ${alertEmail ?? "(unknown email)"} for ` +
      `${amountCentsForAlert != null ? (amountCentsForAlert / 100).toFixed(2) : "?"} ` +
      `${(currencyForAlert ?? "usd").toUpperCase()} ` +
      `did not match any published plan. ` +
      `Price: ${priceIdForAlert ?? "n/a"}, Payment Link: ${paymentLinkId ?? "n/a"}. ` +
      `No account was created — please onboard manually if appropriate.`;

    try {
      const { data: admins } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "agency_admin");

      const rows = (admins ?? []).map((a: any) => ({
        user_id: a.user_id,
        category: "system",
        title: "Non-standard Stripe payment received — manual onboarding needed",
        message: alertMessage,
        metadata: {
          stripe_customer_id: customerId,
          stripe_price_id: priceIdForAlert,
          stripe_payment_link_id: paymentLinkId,
          amount_cents: amountCentsForAlert,
          currency: currencyForAlert,
          session_id: session.id,
          customer_email: alertEmail,
        },
      }));

      if (rows.length > 0) {
        await supabase.from("admin_notifications").insert(rows);
      }
    } catch (e) {
      logStep("WARN: failed to insert admin_notifications for non-standard payment", {
        error: String(e),
      });
    }

    return; // hard stop — no auth user, no clients row, no email
  }

  // Defensive: apply known-safe defaults if DB row was missing feature_set
  featureSet = resolveFeatureSet(planName, featureSet);

  // Idempotency / upgrade path: client may already exist for this stripe_customer_id
  const existingByCustomer = await clientByStripeCustomer(supabase, customerId);
  if (existingByCustomer) {
    if (planId && planId !== existingByCustomer.plan_id) {
      const update: Record<string, unknown> = { plan_id: planId, status: "active" };
      if (featureSet) update.enabled_features = featureSet;
      await supabase
        .from("clients")
        .update(update)
        .eq("id", existingByCustomer.id);
      logStep("Existing client plan upgraded via Payment Link", {
        clientId: existingByCustomer.id,
        newPlanId: planId,
        planName,
        featureSet,
      });
    } else {
      logStep("Existing client paid Payment Link, no plan change", {
        clientId: existingByCustomer.id,
      });
    }
    return;
  }

  // Resolve email + custom fields
  const customerEmail =
    session.customer_details?.email ??
    session.customer_email ??
    (await stripe.customers.retrieve(customerId).then(
      (c: any) => (c as Stripe.Customer).email,
    ).catch(() => null));

  if (!customerEmail) {
    logStep("Payment Link onboarding: no email on session/customer", {
      sessionId: session.id,
    });
    return;
  }

  const cf = session.custom_fields ?? [];
  const findField = (...keys: string[]): string | null => {
    for (const f of cf) {
      const haystack = `${f.key} ${f.label?.custom ?? ""}`.toLowerCase();
      if (keys.some((k) => haystack.includes(k))) {
        return f.text?.value || f.dropdown?.value || null;
      }
    }
    return null;
  };

  const customerName = session.customer_details?.name || findField("name") || "";
  const phone =
    session.customer_details?.phone || findField("phone", "mobile") || null;
  const businessName =
    findField("business", "company") || customerName || "My Company";

  // Find agency
  const { data: agency } = await supabase
    .from("agencies")
    .select("id")
    .limit(1)
    .single();
  if (!agency) {
    logStep("Payment Link onboarding: no agency found");
    return;
  }

  // Check for existing auth user with this email
  let authUserId: string | null = null;
  const { data: list } = await supabase.auth.admin.listUsers();
  const matched = list?.users?.find(
    (u: any) => u.email?.toLowerCase() === customerEmail.toLowerCase(),
  );

  if (matched) {
    authUserId = matched.id;
    logStep("Auth user already exists for email", { authUserId });

    // If a clients row exists for this user_id but missing stripe_customer_id, link it
    const { data: existingClient } = await supabase
      .from("clients")
      .select("id, plan_id, stripe_customer_id")
      .eq("user_id", authUserId)
      .maybeSingle();

    if (existingClient) {
      const update: Record<string, unknown> = { status: "active" };
      if (!existingClient.stripe_customer_id) update.stripe_customer_id = customerId;
      if (planId && planId !== existingClient.plan_id) {
        update.plan_id = planId;
        if (featureSet) update.enabled_features = featureSet;
      }
      await supabase.from("clients").update(update).eq("id", existingClient.id);
      logStep("Linked Stripe customer to existing client", {
        clientId: existingClient.id,
        planName,
        featureSet: update.enabled_features ?? null,
      });
      return;
    }
    // No clients row — fall through to create one
  } else {
    const { data: created, error: createErr } =
      await supabase.auth.admin.createUser({
        email: customerEmail,
        email_confirm: true,
        user_metadata: {
          company_name: businessName,
          full_name: customerName,
          phone,
        },
      });
    if (createErr || !created?.user) {
      logStep("Failed to create auth user", { error: createErr?.message });
      return;
    }
    authUserId = created.user.id;
    logStep("Auth user created", { authUserId, email: customerEmail });
  }

  // Insert clients row (apply plan's feature_set so sidebar gating is correct on first login)
  const clientInsert: Record<string, unknown> = {
    user_id: authUserId,
    agency_id: agency.id,
    company_name: businessName,
    email: customerEmail,
    phone,
    plan_id: planId,
    stripe_customer_id: customerId,
    status: "active",
    password_set: false,
  };
  if (featureSet) {
    clientInsert.enabled_features = featureSet;
  }
  const { error: clientErr } = await supabase.from("clients").insert(clientInsert);
  if (clientErr) {
    logStep("Failed to insert clients row", { error: clientErr.message });
    return;
  }
  logStep("New client provisioned with plan-scoped features", {
    email: customerEmail,
    planId,
    planName,
    featureSet,
  });

  // Resolve our internal client_id for downstream upserts
  const { data: newClient } = await supabase
    .from("clients")
    .select("id")
    .eq("user_id", authUserId)
    .maybeSingle();
  const newClientId = newClient?.id ?? null;

  // Upsert user_profiles row so phone/full_name appear in Settings on first login
  if (newClientId) {
    try {
      await supabase.from("user_profiles").upsert(
        {
          user_id: authUserId,
          full_name: customerName || businessName,
          phone: phone,
        },
        { onConflict: "user_id" },
      );
    } catch (e) {
      logStep("WARN: failed to upsert user_profiles", { error: String(e) });
    }
  }

  // Populate client_subscriptions cache so Billing tab shows correct plan immediately
  if (newClientId) {
    try {
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id ?? null;

      let currentPeriodEnd: string | null = null;
      let subStatus = "active";
      if (subscriptionId) {
        try {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          subStatus = sub.status || "active";
          currentPeriodEnd = getSubscriptionPeriodEnd(sub);
        } catch (e) {
          logStep("WARN: failed to retrieve subscription for cache", { error: String(e) });
        }
      }

      await supabase.from("client_subscriptions").upsert(
        {
          client_id: newClientId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          status: subStatus,
          plan_name: planName,
          plan_id: planId,
          current_period_end: currentPeriodEnd,
          has_license_fee: false,
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "client_id" },
      );
    } catch (e) {
      logStep("WARN: failed to upsert client_subscriptions", { error: String(e) });
    }
  }

  // Upsert client role (idempotent — surface real errors)
  const { error: roleError } = await supabase
    .from("user_roles")
    .upsert(
      { user_id: authUserId, role: "client" },
      { onConflict: "user_id,role", ignoreDuplicates: true },
    );
  if (roleError) {
    logStep("WARN: failed to upsert client role", { authUserId, error: roleError.message });
  }

  // Generate our own custom recovery token (vault.jewlx.ai domain — no Supabase URL leak)
  let recoveryLink: string | null = null;
  try {
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const customToken = Array.from(tokenBytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await supabase
      .from("password_reset_tokens")
      .delete()
      .eq("email", customerEmail.toLowerCase());

    const { error: tokenErr } = await supabase
      .from("password_reset_tokens")
      .insert({
        user_id: authUserId,
        email: customerEmail.toLowerCase(),
        token: customToken,
        expires_at: expiresAt.toISOString(),
      });

    if (tokenErr) {
      logStep("Failed to store custom recovery token", { error: tokenErr.message });
    } else {
      recoveryLink = `https://vault.jewlx.ai/reset-password?token=${customToken}`;
    }
  } catch (e) {
    logStep("Failed to generate recovery link", { error: String(e) });
  }

  // Send welcome email with password-set CTA
  await supabase.functions
    .invoke("send-client-welcome-email", {
      body: {
        user_id: authUserId,
        client_email: customerEmail,
        company_name: businessName,
        redirect_url: "https://vault.jewlx.ai",
        plan_name: planName,
        recovery_link: recoveryLink,
      },
    })
    .catch((e: any) =>
      logStep("send-client-welcome-email failed", { error: String(e) }),
    );

  // Notify admins
  await supabase.functions
    .invoke("notify-admins-new-client", {
      body: {
        new_client_company: businessName,
        new_client_email: customerEmail,
        plan_name: planName,
        // created_by_admin_email omitted → flagged as self-serve via Stripe
      },
    })
    .catch((e: any) =>
      logStep("notify-admins-new-client failed", { error: String(e) }),
    );

  logStep("Payment Link onboarding complete", {
    authUserId,
    customerEmail,
    planName,
    customerId,
  });

  // Admin billing notification (in-app + email) for Payment Link self-serve signups
  await notifyAdmins(supabase, {
    event_type: "subscription_started",
    stripe_object_id: session.id,
    stripe_session_id: session.id,
    stripe_subscription_id:
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id ?? null,
    client_id: newClientId,
    amount_cents: session.amount_total ?? null,
    currency: session.currency ?? "usd",
    plan_name: planName,
    occurred_at: new Date().toISOString(),
    notes: `Payment Link self-serve signup — ${customerEmail}`,
  });
}

/**
 * checkout.session.completed
 *
 * Three cases:
 *  A)  mode=subscription with metadata.user_id  → existing in-app upgrade flow
 *  A2) mode=subscription via Payment Link       → auto-create JewlX account
 *  B)  type=credit_purchase                     → credit wallet (idempotent)
 */
async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
  supabase: SupabaseClient,
  stripe: Stripe,
) {
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;

  // ── Case C: CAD add-on purchase ─────────────────────────────────────────
  if (session.metadata?.type === "cad_addon" && session.payment_status === "paid") {
    const clientId = session.metadata.client_id || null;
    const addonKind = session.metadata.addon_kind || null;
    const addonLabel = session.metadata.addon_label || addonKind || "CAD add-on";
    const priceId = session.metadata.price_id || null;
    const amountCents = session.amount_total ?? 0;
    const currency = session.currency ?? "usd";

    // Resolve client if missing in metadata (e.g. legacy session) via stripe_customer_id
    let resolvedClientId = clientId;
    if (!resolvedClientId && customerId) {
      const c = await clientByStripeCustomer(supabase, customerId);
      resolvedClientId = c?.id ?? null;
    }

    if (resolvedClientId && addonKind) {
      // Idempotent insert keyed on stripe_session_id
      const { error: addonErr } = await supabase
        .from("client_cad_addons")
        .insert({
          client_id: resolvedClientId,
          addon_kind: addonKind,
          stripe_session_id: session.id,
          stripe_price_id: priceId,
          amount_cents: amountCents,
          currency,
          metadata: { source: "stripe_webhook" },
        });
      if (addonErr && (addonErr as any).code !== "23505") {
        logStep("Failed to insert client_cad_addons", { err: addonErr.message });
      } else if (!addonErr) {
        logStep("CAD add-on granted", { clientId: resolvedClientId, addonKind, sessionId: session.id });
        // Client-side in-app notification
        await supabase.from("client_notifications").insert({
          client_id: resolvedClientId,
          category: "billing",
          title: "CAD Add-on Activated",
          message: `${addonLabel} is now available on your account.`,
          metadata: { addon_kind: addonKind, stripe_session_id: session.id, amount_cents: amountCents },
        });
      }
    } else {
      logStep("CAD add-on session missing client/addon_kind", { sessionId: session.id });
    }

    await notifyAdmins(supabase, {
      event_type: "cad_addon_purchased",
      stripe_object_id: session.id,
      stripe_session_id: session.id,
      client_id: resolvedClientId,
      amount_cents: amountCents,
      currency,
      addon_label: addonLabel,
      occurred_at: new Date().toISOString(),
    });

    return;
  }

  // ── Case B: credit purchase ──────────────────────────────────────────────
  if (session.metadata?.type === "credit_purchase" && session.payment_status === "paid") {
    const clientId = session.metadata.client_id;
    const creditAmount = Number(session.metadata.credit_amount);

    if (clientId && creditAmount > 0) {
      // Idempotency: already credited?
      const { data: existing } = await supabase
        .from("wallet_transactions")
        .select("id")
        .eq("reference_id", session.id)
        .eq("type", "topup")
        .maybeSingle();

      if (!existing) {
        const credits = dollarsToCredits(creditAmount);
        // creditAmount is base+bonus (25, 55, 120). Map by the credit total
        // for human-readable descriptions on packs that include a bonus.
        const PACK_LABELS: Record<number, string> = {
          50_000: "50,000",
          110_000: "110,000",
          240_000: "240,000",
        };
        const label = PACK_LABELS[credits] ?? credits.toLocaleString();

        // The DB has a unique partial index on wallet_transactions(reference_id)
        // WHERE type='topup'. If verify-credit-purchase raced us and won, the
        // INSERT inside credit_wallet will fail with 23505 — treat that as a
        // benign no-op (other side already credited the wallet).
        const { error: creditErr } = await supabase.rpc("credit_wallet", {
          p_client_id: clientId,
          p_amount: creditAmount,
          p_type: "topup",
          p_description: `${label} credits purchased`,
          p_reference_id: session.id,
        });
        if (creditErr) {
          const code = (creditErr as any).code;
          const msg = creditErr.message || "";
          if (code === "23505" || msg.includes("uniq_wallet_tx_topup_reference") || msg.toLowerCase().includes("duplicate key")) {
            logStep("Credit purchase already credited by verify endpoint, skipping", {
              sessionId: session.id,
            });
          } else {
            throw creditErr;
          }
        } else {
          logStep("Wallet credited (credit purchase)", { clientId, creditAmount });
          // Notify client (in-app)
          await supabase.from("client_notifications").insert({
            client_id: clientId,
            category: "billing",
            title: "Credits Added",
            message: `${label} credits have been added to your account.`,
            metadata: { stripe_session_id: session.id, credit_amount: creditAmount, credits: credits },
          });
        }
      } else {
        logStep("Credit purchase already processed, skipping wallet credit", {
          sessionId: session.id,
        });
      }

      // Admin notify (idempotent — safe even if we hit the duplicate-key path above)
      const PACK_LABELS_INNER: Record<number, string> = {
        50_000: "50,000",
        110_000: "110,000",
        240_000: "240,000",
      };
      const packLabel = PACK_LABELS_INNER[dollarsToCredits(creditAmount)]
        ? `${PACK_LABELS_INNER[dollarsToCredits(creditAmount)]} credits`
        : `${dollarsToCredits(creditAmount).toLocaleString()} credits`;
      await notifyAdmins(supabase, {
        event_type: "credits_purchased",
        stripe_object_id: session.id,
        stripe_session_id: session.id,
        client_id: clientId,
        amount_cents: session.amount_total ?? Math.round(creditAmount * 100),
        currency: session.currency ?? "usd",
        pack_label: packLabel,
        occurred_at: new Date().toISOString(),
      });
    }
    return; // credit purchase done
  }

  // ── Case A: subscription checkout ───────────────────────────────────────
  if (session.mode !== "subscription") return;

  const userId = session.metadata?.user_id;
  let planName: string | null = session.metadata?.plan_name ?? null;

  // ── Case A2: Payment Link auto-onboarding (no user_id metadata) ─────────
  // Triggered when a new customer pays via a Stripe Payment Link.
  // We auto-create the auth user, clients row, role, and send a password-recovery email.
  if (!userId && customerId && session.payment_link) {
    await handlePaymentLinkOnboarding(session, customerId, supabase, stripe);
    return;
  }

  if (!userId || !customerId) {
    logStep("checkout.session.completed: missing user_id or customer_id in metadata", {
      sessionId: session.id,
    });
    return;
  }

  // Find our client record
  const { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!client) {
    logStep("No client found for user_id", { userId });
    return;
  }

  // Persist stripe_customer_id (idempotent)
  await saveCustomerIdOnClient(supabase, client.id, customerId);

  // Retrieve full subscription object
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  if (!subscriptionId) {
    logStep("No subscription ID on completed checkout session", { sessionId: session.id });
    return;
  }

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);

  // Determine plan details
  let resolvedPlanName: string | null = planName;
  let resolvedPlanId: string | null = null;
  let hasLicense = false;

  if (planName) {
    const { data: plan } = await supabase
      .from("subscription_plans")
      .select("id, include_license")
      .eq("name", planName)
      .maybeSingle();

    if (plan) {
      resolvedPlanId = plan.id;
      hasLicense = plan.include_license ?? false;
    }
  }

  await upsertSubscription(
    supabase,
    client.id,
    customerId,
    subscription,
    resolvedPlanName,
    resolvedPlanId,
    hasLicense,
  );

  // Update client.plan_id
  if (resolvedPlanId) {
    await supabase
      .from("clients")
      .update({ plan_id: resolvedPlanId })
      .eq("id", client.id);
  }

  logStep("Subscription provisioned via checkout.session.completed", {
    clientId: client.id,
    planName: resolvedPlanName,
    status: subscription.status,
  });

  await notifyAdmins(supabase, {
    event_type: "subscription_started",
    stripe_object_id: subscription.id,
    stripe_session_id: session.id,
    stripe_subscription_id: subscription.id,
    client_id: client.id,
    amount_cents: session.amount_total ?? null,
    currency: session.currency ?? "usd",
    plan_name: resolvedPlanName,
    occurred_at: new Date().toISOString(),
  });

  // ── Trial fingerprint recording ──────────────────────────────────────────
  // Store email fingerprint (from metadata set at checkout creation)
  const emailFingerprint = session.metadata?.email_fingerprint;
  if (emailFingerprint && subscription.status === "trialing") {
    await supabase.from("trial_used_fingerprints").upsert(
      {
        fingerprint_type: "email",
        fingerprint_value: emailFingerprint,
        client_id: client.id,
        stripe_subscription_id: subscription.id,
      },
      { onConflict: "fingerprint_type,fingerprint_value", ignoreDuplicates: true }
    );
    logStep("Email fingerprint recorded", { emailFingerprint });
  }

  // Retrieve payment method to store card fingerprint
  const fullSub = await stripe.subscriptions.retrieve(subscription.id, {
    expand: ["default_payment_method"],
  });
  const pm = fullSub.default_payment_method as Stripe.PaymentMethod | null;
  const cardFingerprint = pm?.card?.fingerprint;

  if (cardFingerprint && subscription.status === "trialing") {
    // Check if this card fingerprint was used in a previous trial
    const { data: priorCardTrial } = await supabase
      .from("trial_used_fingerprints")
      .select("client_id")
      .eq("fingerprint_type", "card")
      .eq("fingerprint_value", cardFingerprint)
      .maybeSingle();

    if (priorCardTrial && priorCardTrial.client_id !== client.id) {
      logStep("Duplicate card fingerprint detected — canceling trial subscription", {
        cardFingerprint,
        priorClientId: priorCardTrial.client_id,
        newClientId: client.id,
      });

      // Cancel the trial immediately
      await stripe.subscriptions.cancel(subscription.id);

      // Log as fraud alert
      await supabase.from("fraud_alerts").insert({
        alert_type: "duplicate_trial_card",
        stripe_customer_id: customerId,
        client_id: client.id,
        stripe_object_id: subscription.id,
        reason: `Card fingerprint ${cardFingerprint} already used by client ${priorCardTrial.client_id}`,
        action_taken: "subscription_canceled",
        raw_payload: { subscription_id: subscription.id, card_fingerprint: cardFingerprint },
      });
    } else if (!priorCardTrial) {
      // First use of this card — record it
      await supabase.from("trial_used_fingerprints").upsert(
        {
          fingerprint_type: "card",
          fingerprint_value: cardFingerprint,
          client_id: client.id,
          stripe_subscription_id: subscription.id,
        },
        { onConflict: "fingerprint_type,fingerprint_value", ignoreDuplicates: true }
      );
      logStep("Card fingerprint recorded", { cardFingerprint });
    }
  }
}

/**
 * customer.subscription.created / customer.subscription.updated
 *
 * Keeps client_subscriptions in sync with Stripe truth.
 */
async function handleSubscriptionUpsert(
  subscription: Stripe.Subscription,
  supabase: SupabaseClient,
) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const client = await clientByStripeCustomer(supabase, customerId);
  if (!client) {
    logStep("No client found for customer (subscription upsert)", { customerId });
    return;
  }

  // Resolve plan from the first matching price ID in subscription items
  let planName: string | null = null;
  let planId: string | null = null;
  let hasLicense = false;
  let featureSet: Record<string, boolean> | null = null;

  for (const item of subscription.items.data) {
    const priceId = item.price?.id;
    if (!priceId) continue;
    const plan = await planByPriceId(supabase, priceId);
    if (plan) {
      planName = plan.name;
      planId = plan.id;
      hasLicense = plan.include_license ?? false;
      featureSet = plan.feature_set ?? null;
      break;
    }
  }

  // Defensive fallback if DB row was missing feature_set
  featureSet = resolveFeatureSet(planName, featureSet);

  await upsertSubscription(
    supabase,
    client.id,
    customerId,
    subscription,
    planName,
    planId,
    hasLicense,
  );

  // Keep client.plan_id AND enabled_features in sync for active/trialing subscriptions.
  // This makes Stripe Customer Portal upgrades/downgrades immediately update the
  // client sidebar to match the new plan's feature set.
  if (["active", "trialing"].includes(subscription.status) && planId) {
    const update: Record<string, unknown> = { plan_id: planId };
    if (featureSet) update.enabled_features = featureSet;
    await supabase
      .from("clients")
      .update(update)
      .eq("id", client.id);
    logStep("Client plan + features synced from subscription", {
      clientId: client.id,
      planId,
      planName,
      featureSet,
    });
  }

  logStep("Subscription upserted", {
    clientId: client.id,
    subscriptionId: subscription.id,
    status: subscription.status,
    planName,
  });
}

/**
 * customer.subscription.deleted
 *
 * Marks the subscription canceled and revokes the client plan.
 */
async function handleSubscriptionDeleted(
  subscription: Stripe.Subscription,
  supabase: SupabaseClient,
) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const client = await clientByStripeCustomer(supabase, customerId);
  if (!client) {
    logStep("No client found for customer (subscription deleted)", { customerId });
    return;
  }

  await supabase
    .from("client_subscriptions")
    .update({
      status: "canceled",
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq("client_id", client.id);

  // Clear the client's active plan
  await supabase
    .from("clients")
    .update({ plan_id: null })
    .eq("id", client.id);

  logStep("Subscription canceled, plan revoked", {
    clientId: client.id,
    subscriptionId: subscription.id,
  });

  await notifyAdmins(supabase, {
    event_type: "subscription_canceled",
    stripe_object_id: subscription.id,
    stripe_subscription_id: subscription.id,
    client_id: client.id,
    occurred_at: new Date().toISOString(),
  });
}

/**
 * invoice.payment_succeeded
 *
 * Restores active status if the subscription was past_due / unpaid.
 * Ignores auto_recharge invoices (handled entirely by process-auto-recharge).
 */
async function handleInvoicePaymentSucceeded(
  invoice: Stripe.Invoice,
  supabase: SupabaseClient,
) {
  // Auto-recharge invoices are already handled by the edge function
  if (invoice.metadata?.type === "auto_recharge") return;

  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : (invoice.customer as Stripe.Customer | null)?.id ?? null;
  if (!customerId) return;

  await supabase
    .from("client_subscriptions")
    .update({ status: "active", updated_at: new Date().toISOString() })
    .eq("stripe_customer_id", customerId)
    .in("status", ["past_due", "unpaid", "incomplete"]);

  logStep("Invoice paid — subscription restored to active", {
    customerId,
    invoiceId: invoice.id,
  });

  // Notify admins on renewal cycles only (skip first invoice — covered by subscription_started)
  if ((invoice as any).billing_reason === "subscription_cycle") {
    const client = await clientByStripeCustomer(supabase, customerId);
    await notifyAdmins(supabase, {
      event_type: "subscription_renewed",
      stripe_object_id: invoice.id!,
      stripe_invoice_id: invoice.id,
      stripe_subscription_id: typeof (invoice as any).subscription === "string" ? (invoice as any).subscription : null,
      client_id: client?.id ?? null,
      amount_cents: invoice.amount_paid ?? null,
      currency: invoice.currency ?? "usd",
      occurred_at: new Date().toISOString(),
    });
  }
}

/**
 * invoice.payment_failed
 *
 * Marks the subscription past_due.
 * Dunning emails (if enabled) are sent by Stripe automatically.
 */
async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
  supabase: SupabaseClient,
) {
  if (invoice.metadata?.type === "auto_recharge") {
    logStep("Auto-recharge payment failed (no subscription change)", {
      invoiceId: invoice.id,
    });
    return;
  }

  const customerId =
    typeof invoice.customer === "string"
      ? invoice.customer
      : (invoice.customer as Stripe.Customer | null)?.id ?? null;
  if (!customerId) return;

  await supabase
    .from("client_subscriptions")
    .update({ status: "past_due", updated_at: new Date().toISOString() })
    .eq("stripe_customer_id", customerId)
    .in("status", ["active", "trialing"]);

  logStep("Invoice payment failed — subscription marked past_due", {
    customerId,
    invoiceId: invoice.id,
  });

  const failClient = await clientByStripeCustomer(supabase, customerId);
  await notifyAdmins(supabase, {
    event_type: "payment_failed",
    stripe_object_id: invoice.id!,
    stripe_invoice_id: invoice.id,
    stripe_subscription_id: typeof (invoice as any).subscription === "string" ? (invoice as any).subscription : null,
    client_id: failClient?.id ?? null,
    amount_cents: invoice.amount_due ?? null,
    currency: invoice.currency ?? "usd",
    occurred_at: new Date().toISOString(),
    notes: `Billing reason: ${(invoice as any).billing_reason ?? "unknown"}`,
  });
}

/**
 * charge.refunded
 *
 * If the charge was for a credit purchase, claws back the refunded credits
 * from the client wallet.
 */
async function handleChargeRefunded(
  charge: Stripe.Charge,
  supabase: SupabaseClient,
  stripe: Stripe,
) {
  const paymentIntentId =
    typeof charge.payment_intent === "string"
      ? charge.payment_intent
      : (charge.payment_intent as Stripe.PaymentIntent | null)?.id ?? null;

  if (!paymentIntentId) return;

  // Find the checkout session that originated this charge
  const sessions = await stripe.checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 1,
  });
  if (sessions.data.length === 0) return;

  const session = sessions.data[0];
  if (session.metadata?.type !== "credit_purchase") return;

  const clientId = session.metadata.client_id;
  if (!clientId) return;

  // Refunded amount in dollars (could be partial)
  const refundedDollars = charge.amount_refunded / 100;
  if (refundedDollars <= 0) return;

  const credits = dollarsToCredits(refundedDollars);

  await supabase.rpc("debit_wallet", {
    p_client_id: clientId,
    p_amount: refundedDollars,
    p_description: `Refund clawback: ${credits.toLocaleString()} credits removed`,
    p_reference_id: charge.id,
    p_metadata: {
      type: "refund_clawback",
      charge_id: charge.id,
      session_id: session.id,
      refunded_dollars: refundedDollars,
    },
  });

  logStep("Credits clawed back on refund", {
    clientId,
    refundedDollars,
    credits,
    chargeId: charge.id,
  });

  await notifyAdmins(supabase, {
    event_type: "refund",
    stripe_object_id: charge.id,
    stripe_charge_id: charge.id,
    stripe_session_id: session.id,
    client_id: clientId,
    amount_cents: charge.amount_refunded,
    currency: charge.currency ?? "usd",
    occurred_at: new Date().toISOString(),
    notes: `Clawed back ${credits.toLocaleString()} credits`,
  });
}

/**
 * charge.dispute.created
 *
 * Logs the dispute for visibility. Access is not automatically revoked here
 * because the client may win the dispute. Admin should review flagged disputes.
 * The subscription will be updated via invoice.payment_failed if Stripe debits.
 */
async function handleDisputeCreated(
  dispute: Stripe.Dispute,
  supabase: SupabaseClient,
  stripe: Stripe,
) {
  const chargeId =
    typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;

  const charge = await stripe.charges.retrieve(chargeId);
  const customerId =
    typeof charge.customer === "string"
      ? charge.customer
      : (charge.customer as Stripe.Customer | null)?.id ?? null;

  if (!customerId) return;

  const client = await clientByStripeCustomer(supabase, customerId);
  if (!client) return;

  // Dispute is logged via stripe_webhook_events (already written before this handler runs).
  // We do NOT touch the wallet here — the client may win the dispute.
  // If they lose, Stripe will fire invoice.payment_failed which marks the subscription past_due.
  logStep("Dispute created — logged for admin review", {
    clientId: client.id,
    disputeId: dispute.id,
    amount: dispute.amount,
    reason: dispute.reason,
  });

  await notifyAdmins(supabase, {
    event_type: "dispute",
    stripe_object_id: dispute.id,
    stripe_charge_id: chargeId,
    client_id: client.id,
    amount_cents: dispute.amount,
    currency: dispute.currency ?? "usd",
    occurred_at: new Date().toISOString(),
    notes: `Reason: ${dispute.reason}`,
  });
}

/**
 * payment_method.attached
 *
 * If the client has auto-recharge configured with this payment method,
 * refresh its display details (brand / last4) from Stripe.
 */
async function handlePaymentMethodAttached(
  pm: Stripe.PaymentMethod,
  supabase: SupabaseClient,
) {
  if (!pm.card) return;

  const customerId =
    typeof pm.customer === "string"
      ? pm.customer
      : (pm.customer as Stripe.Customer | null)?.id ?? null;
  if (!customerId) return;

  const client = await clientByStripeCustomer(supabase, customerId);
  if (!client) return;

  // Only update if the saved PM ID matches the newly attached one
  await supabase
    .from("client_auto_recharge_settings")
    .update({
      payment_method_brand: pm.card.brand,
      payment_method_last4: pm.card.last4,
    })
    .eq("client_id", client.id)
    .eq("stripe_payment_method_id", pm.id);

  logStep("Payment method details refreshed", {
    clientId: client.id,
    pmId: pm.id,
    brand: pm.card.brand,
  });
}

/**
 * radar.early_fraud_warning.created
 *
 * Logs Stripe Radar fraud signals to fraud_alerts for admin review.
 * Access is not automatically revoked — admin should investigate first.
 * If the linked charge belongs to a subscription, the subscription will already
 * be updated via invoice.payment_failed if Stripe debits for the chargeback.
 */
async function handleRadarEarlyFraudWarning(
  warning: Stripe.Radar.EarlyFraudWarning,
  supabase: SupabaseClient,
  stripe: Stripe,
) {
  const chargeId =
    typeof warning.charge === "string" ? warning.charge : (warning.charge as Stripe.Charge).id;

  let stripeCustomerId: string | null = null;
  let clientId: string | null = null;
  let amountCents: number | null = null;

  try {
    const charge = await stripe.charges.retrieve(chargeId);
    amountCents = charge.amount;
    stripeCustomerId =
      typeof charge.customer === "string"
        ? charge.customer
        : (charge.customer as Stripe.Customer | null)?.id ?? null;

    if (stripeCustomerId) {
      const client = await clientByStripeCustomer(supabase, stripeCustomerId);
      clientId = client?.id ?? null;
    }
  } catch {
    // Charge may not be accessible — log what we have
  }

  await supabase.from("fraud_alerts").insert({
    alert_type: "radar_early_fraud_warning",
    stripe_customer_id: stripeCustomerId,
    client_id: clientId,
    stripe_object_id: warning.id,
    amount: amountCents,
    reason: warning.fraud_type,
    action_taken: "logged",
    raw_payload: warning as unknown as Record<string, unknown>,
  });

  logStep("Radar early fraud warning logged", {
    warningId: warning.id,
    fraudType: warning.fraud_type,
    clientId,
    actionable: warning.actionable,
  });
}

/**
 * Set client_subscriptions.status for a given Stripe customer.
 * Used by paused/resumed/invoice.paid handlers.
 */
async function setSubscriptionStatusByCustomer(
  customerId: string,
  newStatus: string,
  supabase: SupabaseClient,
  onlyIfStatusIn?: string[],
) {
  const client = await clientByStripeCustomer(supabase, customerId);
  if (!client) {
    logStep("No client found for customer (status update)", { customerId, newStatus });
    return;
  }
  let q = supabase
    .from("client_subscriptions")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("client_id", client.id);
  if (onlyIfStatusIn && onlyIfStatusIn.length > 0) {
    q = q.in("status", onlyIfStatusIn);
  }
  await q;
  logStep("Subscription status updated", { clientId: client.id, newStatus });
}

/**
 * checkout.session.async_payment_failed
 * Log + insert admin notification. Do NOT auto-create accounts.
 */
async function handleAsyncPaymentFailed(
  session: Stripe.Checkout.Session,
  supabase: SupabaseClient,
) {
  const email =
    session.customer_details?.email ?? session.customer_email ?? "(unknown)";
  logStep("Async payment failed during checkout", {
    sessionId: session.id,
    email,
  });

  // Notify all agency_admins
  const { data: admins } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "agency_admin");

  if (admins && admins.length > 0) {
    const rows = admins.map((a: any) => ({
      user_id: a.user_id,
      category: "billing",
      title: "Checkout Payment Failed",
      message: `Async payment failed for ${email} (session ${session.id})`,
      metadata: { session_id: session.id, email },
    }));
    await supabase.from("admin_notifications").insert(rows);
  }
}

/**
 * customer.subscription.pending_update_expired
 * No state change — just notify admins for visibility.
 */
async function handlePendingUpdateExpired(
  subscription: Stripe.Subscription,
  supabase: SupabaseClient,
) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const client = await clientByStripeCustomer(supabase, customerId);
  logStep("Subscription pending update expired", {
    subscriptionId: subscription.id,
    clientId: client?.id ?? null,
  });

  const { data: admins } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "agency_admin");

  if (admins && admins.length > 0) {
    const rows = admins.map((a: any) => ({
      user_id: a.user_id,
      category: "billing",
      title: "Subscription Pending Update Expired",
      message: `Stripe subscription ${subscription.id} pending update expired before invoice payment.`,
      metadata: { subscription_id: subscription.id, client_id: client?.id ?? null },
    }));
    await supabase.from("admin_notifications").insert(rows);
  }
}

/**
 * payment_method.detached — log only.
 */
async function handlePaymentMethodDetached(
  pm: Stripe.PaymentMethod,
  supabase: SupabaseClient,
) {
  const customerId =
    typeof pm.customer === "string"
      ? pm.customer
      : (pm.customer as Stripe.Customer | null)?.id ?? null;
  logStep("Payment method detached", { pmId: pm.id, customerId });

  if (!customerId) return;
  const client = await clientByStripeCustomer(supabase, customerId);
  if (!client) return;

  // Clear stored auto-recharge PM details if it matches
  await supabase
    .from("client_auto_recharge_settings")
    .update({
      stripe_payment_method_id: null,
      payment_method_brand: null,
      payment_method_last4: null,
      enabled: false,
    })
    .eq("client_id", client.id)
    .eq("stripe_payment_method_id", pm.id);
}

// ── Main dispatcher ────────────────────────────────────────────────────────

async function handleEvent(
  event: Stripe.Event,
  supabase: SupabaseClient,
  stripe: Stripe,
) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await handleCheckoutCompleted(
        event.data.object as Stripe.Checkout.Session,
        supabase,
        stripe,
      );
      break;

    case "checkout.session.async_payment_failed":
      await handleAsyncPaymentFailed(
        event.data.object as Stripe.Checkout.Session,
        supabase,
      );
      break;

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.pending_update_applied":
      await handleSubscriptionUpsert(
        event.data.object as Stripe.Subscription,
        supabase,
      );
      break;

    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(
        event.data.object as Stripe.Subscription,
        supabase,
      );
      break;

    case "customer.subscription.paused": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      await setSubscriptionStatusByCustomer(customerId, "paused", supabase);
      break;
    }

    case "customer.subscription.resumed": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      await setSubscriptionStatusByCustomer(customerId, "active", supabase);
      break;
    }

    case "customer.subscription.pending_update_expired":
      await handlePendingUpdateExpired(
        event.data.object as Stripe.Subscription,
        supabase,
      );
      break;

    case "invoice.paid":
    case "invoice.payment_succeeded":
      await handleInvoicePaymentSucceeded(
        event.data.object as Stripe.Invoice,
        supabase,
      );
      break;

    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(
        event.data.object as Stripe.Invoice,
        supabase,
      );
      break;

    case "charge.refunded":
      await handleChargeRefunded(
        event.data.object as Stripe.Charge,
        supabase,
        stripe,
      );
      break;

    case "charge.dispute.created":
      await handleDisputeCreated(
        event.data.object as Stripe.Dispute,
        supabase,
        stripe,
      );
      break;

    case "payment_method.attached":
      await handlePaymentMethodAttached(
        event.data.object as Stripe.PaymentMethod,
        supabase,
      );
      break;

    case "payment_method.detached":
      await handlePaymentMethodDetached(
        event.data.object as Stripe.PaymentMethod,
        supabase,
      );
      break;

    case "radar.early_fraud_warning.created":
      await handleRadarEarlyFraudWarning(
        event.data.object as Stripe.Radar.EarlyFraudWarning,
        supabase,
        stripe,
      );
      break;

    default:
      logStep("Unhandled event type (no-op)", { type: event.type });
  }
}

// ── Entry point ────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!stripeKey || !webhookSecret) {
    console.error("[STRIPE-WEBHOOK] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
    return new Response("Server configuration error", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil", maxNetworkRetries: 3 });
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  let eventId: string | undefined;

  try {
    // Raw body — must NOT call .json() first; signature verification requires untouched bytes
    const rawBody = await req.text();
    const sigHeader = req.headers.get("stripe-signature");

    if (!sigHeader) {
      return new Response(
        JSON.stringify({ error: "Missing stripe-signature header" }),
        { headers: { "Content-Type": "application/json" }, status: 400 },
      );
    }

    // Verify signature (throws on mismatch — Stripe retries on 4xx/5xx)
    const event = await stripe.webhooks.constructEventAsync(
      rawBody,
      sigHeader,
      webhookSecret,
    );
    eventId = event.id;
    logStep("Event verified", { type: event.type, id: event.id });

    // ── Idempotency ──────────────────────────────────────────────────────
    const { data: existing } = await supabase
      .from("stripe_webhook_events")
      .select("id, status")
      .eq("stripe_event_id", event.id)
      .maybeSingle();

    if (existing?.status === "processed") {
      logStep("Event already processed — skipping", { eventId: event.id });
      return new Response(
        JSON.stringify({ received: true, skipped: true }),
        { headers: { "Content-Type": "application/json" }, status: 200 },
      );
    }

    // Insert new record or reset a previously failed one for retry
    if (!existing) {
      await supabase.from("stripe_webhook_events").insert({
        id: event.id,
        type: event.type,
        payload: event as unknown as Record<string, unknown>,
        stripe_event_id: event.id,
        event_type: event.type,
        status: "processing",
      });
    } else {
      await supabase
        .from("stripe_webhook_events")
        .update({ status: "processing", error_message: null, processing_error: null })
        .eq("stripe_event_id", event.id);
    }

    // ── Process ──────────────────────────────────────────────────────────
    await handleEvent(event, supabase, stripe);

    await supabase
      .from("stripe_webhook_events")
      .update({ status: "processed", processed_at: new Date().toISOString(), processing_error: null })
      .eq("stripe_event_id", event.id);

    logStep("Event processed successfully", { type: event.type, id: event.id });

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });

    if (eventId) {
      try {
        await supabase
          .from("stripe_webhook_events")
          .update({ status: "failed", error_message: msg.slice(0, 500), processing_error: msg.slice(0, 500) })
          .eq("stripe_event_id", eventId);
      } catch { /* ignore secondary failure */ }
    }

    // Return 400 for signature errors so Stripe stops retrying a bad request.
    // Return 500 for processing errors so Stripe retries (up to 3 days).
    const isSignatureError =
      msg.toLowerCase().includes("signature") ||
      msg.toLowerCase().includes("webhook");
    const status = isSignatureError ? 400 : 500;

    return new Response(
      JSON.stringify({ error: "Webhook processing failed" }),
      { headers: { "Content-Type": "application/json" }, status },
    );
  }
});
