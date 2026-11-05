import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  resolveOrCreatePlan,
  subscriptionPriceId,
  subscriptionProductId,
} from "../_shared/stripe-plan-resolver.ts";
import { logEmail } from "../_shared/email-log.ts";

const Resend = (await import("npm:resend@2.0.0")).Resend;

const FROM_EMAIL = "Aurezo <onboarding@resend.dev>";
const ADMIN_EMAIL = Deno.env.get("SUPPORT_EMAIL") || "";

const logStep = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[ADMIN-RECONCILIATION] ${step}${d}`);
};

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

type SupabaseClient = ReturnType<typeof createClient>;

interface Fix {
  clientId: string;
  subscriptionId: string;
  oldStatus: string;
  newStatus: string;
}

/** Fetch all Stripe subscriptions (auto-paginated). */
async function listAllStripeSubscriptions(stripe: Stripe): Promise<Stripe.Subscription[]> {
  const all: Stripe.Subscription[] = [];
  let lastId: string | undefined;

  while (true) {
    const page = await stripe.subscriptions.list({
      limit: 100,
      starting_after: lastId,
      status: "all",
      expand: ["data.default_payment_method"],
    });
    all.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    lastId = page.data[page.data.length - 1].id;
  }
  return all;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY");

  if (!stripeKey) {
    return new Response("STRIPE_SECRET_KEY not set", { status: 500 });
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil", maxNetworkRetries: 3 });
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const startedAt = Date.now();

  const fixes: Fix[] = [];
  const errors: string[] = [];
  const plansLinked: {
    clientId: string;
    subscriptionId: string;
    planName: string;
    autoCreated: boolean;
  }[] = [];
  const plansAutoCreated: string[] = [];
  let checked = 0;

  try {
    logStep("Starting nightly reconciliation");

    // Load all Stripe subscriptions
    const stripeSubscriptions = await listAllStripeSubscriptions(stripe);
    logStep("Loaded Stripe subscriptions", { count: stripeSubscriptions.length });

    // Load all our cached subscriptions that are NOT canceled
    const { data: cachedRows, error: cacheErr } = await supabase
      .from("client_subscriptions")
      .select("client_id, stripe_subscription_id, stripe_customer_id, status, plan_name");

    if (cacheErr) throw new Error(`DB read error: ${cacheErr.message}`);

    // Build index: stripe_subscription_id → our row
    const cacheBySubId = new Map(
      (cachedRows ?? []).map((r) => [r.stripe_subscription_id, r])
    );

    // ── Pass 1: reconcile each Stripe subscription against our cache ────────
    for (const sub of stripeSubscriptions) {
      checked++;
      const cached = cacheBySubId.get(sub.id);

      if (!cached) {
        // Subscription exists in Stripe but not in our cache — skip (likely a pre-migration sub)
        continue;
      }

      if (cached.status !== sub.status) {
        logStep("Status mismatch — fixing", {
          subscriptionId: sub.id,
          db: cached.status,
          stripe: sub.status,
        });

        const { error: fixErr } = await supabase
          .from("client_subscriptions")
          .update({
            status: sub.status,
            current_period_end: getSubscriptionPeriodEnd(sub),
            trial_end: unixToIso(sub.trial_end),
            cancel_at_period_end: sub.cancel_at_period_end ?? false,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", sub.id);

        if (fixErr) {
          errors.push(`Fix failed for sub ${sub.id}: ${fixErr.message}`);
        } else {
          fixes.push({
            clientId: cached.client_id,
            subscriptionId: sub.id,
            oldStatus: cached.status,
            newStatus: sub.status,
          });

          // Revoke plan if subscription is now canceled
          if (sub.status === "canceled") {
            await supabase
              .from("clients")
              .update({ plan_id: null })
              .eq("id", cached.client_id);
          }
        }
      }

      // Remove from map so we can detect orphaned DB rows in Pass 2
      cacheBySubId.delete(sub.id);
    }

    // ── Pass 2: DB rows whose subscription no longer exists in Stripe ───────
    for (const [subId, row] of cacheBySubId) {
      if (row.status === "canceled") continue; // already canceled, no action needed

      try {
        // Double-check Stripe directly in case it was missed in pagination
        await stripe.subscriptions.retrieve(subId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("No such subscription")) {
          logStep("Orphaned DB subscription — marking canceled", { subId });
          await supabase
            .from("client_subscriptions")
            .update({ status: "canceled", updated_at: new Date().toISOString() })
            .eq("stripe_subscription_id", subId);

          fixes.push({
            clientId: row.client_id,
            subscriptionId: subId,
            oldStatus: row.status,
            newStatus: "canceled (orphan)",
          });
        }
      }
    }

    // ── Pass 2b: repoint cached rows at a NEW live subscription ────────────
    // A customer whose old subscription was cancelled and who then started a
    // fresh one used to be skipped entirely (the new sub id was not in the
    // cache), leaving the client marked `canceled` and their widgets dark.
    const cacheByCustomer = new Map(
      (cachedRows ?? [])
        .filter((r) => r.stripe_customer_id)
        .map((r) => [r.stripe_customer_id as string, r]),
    );
    for (const sub of stripeSubscriptions) {
      if (!["active", "trialing", "past_due", "unpaid", "incomplete", "paused"].includes(sub.status)) {
        continue;
      }
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
      if (!customerId) continue;

      const row = cacheByCustomer.get(customerId);
      if (!row) continue;
      if (row.stripe_subscription_id === sub.id) continue; // handled in Pass 1

      logStep("Cached row points at a stale subscription — repointing", {
        clientId: row.client_id,
        oldSubscriptionId: row.stripe_subscription_id,
        newSubscriptionId: sub.id,
        newStatus: sub.status,
      });

      const { error: repointErr } = await supabase
        .from("client_subscriptions")
        .update({
          stripe_subscription_id: sub.id,
          status: sub.status,
          current_period_end: getSubscriptionPeriodEnd(sub),
          trial_end: unixToIso(sub.trial_end),
          cancel_at_period_end: sub.cancel_at_period_end ?? false,
          updated_at: new Date().toISOString(),
        })
        .eq("client_id", row.client_id);

      if (repointErr) {
        errors.push(`Repoint failed for client ${row.client_id}: ${repointErr.message}`);
      } else {
        fixes.push({
          clientId: row.client_id,
          subscriptionId: sub.id,
          oldStatus: `${row.status} (sub ${row.stripe_subscription_id ?? "none"})`,
          newStatus: sub.status,
        });
      }
    }



    // ── Pass 3: link every live subscription to an internal plan ────────────
    for (const sub of stripeSubscriptions) {
      if (!["active", "trialing", "past_due"].includes(sub.status)) continue;

      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
      if (!customerId) continue;

      try {
        // Resolve the client: by stored customer id, else by customer email.
        let { data: client } = await supabase
          .from("clients")
          .select("id, plan_id, enabled_features, status")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();

        if (!client) {
          const customer = await stripe.customers.retrieve(customerId);
          const email = (customer as Stripe.Customer)?.email ?? null;
          if (email) {
            const { data: byEmail } = await supabase
              .from("clients")
              .select("id, plan_id, enabled_features, status")
              .ilike("email", email)
              .maybeSingle();
            if (byEmail) {
              client = byEmail;
              await supabase
                .from("clients")
                .update({ stripe_customer_id: customerId })
                .eq("id", byEmail.id);
            }
          }
        }

        if (!client) continue;

        const priceId = subscriptionPriceId(sub);
        const plan = await resolveOrCreatePlan(supabase, stripe, priceId, {
          productId: subscriptionProductId(sub),
          amountCents: sub.items?.data?.[0]?.price?.unit_amount ?? null,
          interval: sub.items?.data?.[0]?.price?.recurring?.interval ?? null,
        });
        if (!plan) continue;
        if (plan.created_now) plansAutoCreated.push(plan.name);

        // Refresh / create the subscription cache row with the resolved plan.
        await supabase.from("client_subscriptions").upsert(
          {
            client_id: client.id,
            stripe_customer_id: customerId,
            stripe_subscription_id: sub.id,
            status: sub.status,
            plan_name: plan.name,
            plan_id: plan.id,
            current_period_end: getSubscriptionPeriodEnd(sub),
            trial_end: unixToIso(sub.trial_end),
            has_license_fee: plan.include_license,
            cancel_at_period_end: sub.cancel_at_period_end ?? false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "client_id" },
        );

        // Never overwrite a plan an admin already set — only fill the gap.
        // Modules (enabled_features) stay admin-controlled.
        if (!client.plan_id) {
          await supabase.from("clients").update({ plan_id: plan.id }).eq("id", client.id);

          plansLinked.push({
            clientId: client.id,
            subscriptionId: sub.id,
            planName: plan.name,
            autoCreated: plan.created_now,
          });
          logStep("Client linked to plan", {
            clientId: client.id,
            plan: plan.name,
            autoCreated: plan.created_now,
          });
        }
      } catch (e) {
        errors.push(
          `Plan link failed for sub ${sub.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    const durationMs = Date.now() - startedAt;

    // ── Persist reconciliation log ───────────────────────────────────────────
    await supabase.from("reconciliation_logs").insert({
      subscriptions_checked: checked,
      mismatches_fixed: fixes.length,
      errors: errors.length,
      details: { fixes, errors, plans_linked: plansLinked, plans_auto_created: plansAutoCreated },
      duration_ms: durationMs,
    });


    logStep("Reconciliation complete", {
      checked,
      fixed: fixes.length,
      errors: errors.length,
      durationMs,
    });

    // ── Send admin email if anything was fixed or errors occurred ────────────
    if (resendKey && (fixes.length > 0 || errors.length > 0 || plansLinked.length > 0)) {
      const resend = new Resend(resendKey);
      const fixRows = fixes
        .map(
          (f) =>
            `<tr>
              <td>${f.clientId}</td>
              <td>${f.subscriptionId}</td>
              <td>${f.oldStatus}</td>
              <td>${f.newStatus}</td>
            </tr>`
        )
        .join("");

      const planRows = plansLinked
        .map(
          (p) =>
            `<tr>
              <td>${p.clientId}</td>
              <td>${p.subscriptionId}</td>
              <td>${p.planName}</td>
              <td>${p.autoCreated ? "auto-created" : "existing"}</td>
            </tr>`
        )
        .join("");

      const reconSubject = `[Aurezo] Nightly Reconciliation — ${fixes.length} fixes, ${plansLinked.length} plans linked, ${errors.length} errors`;
      const reconRes = await resend.emails.send({
        from: FROM_EMAIL,
        to: ADMIN_EMAIL,
        subject: reconSubject,
        html: `
          <h2>Stripe Nightly Reconciliation Report</h2>
          <p><strong>Ran at:</strong> ${new Date().toUTCString()}</p>
          <p><strong>Subscriptions checked:</strong> ${checked}</p>
          <p><strong>Mismatches fixed:</strong> ${fixes.length}</p>
          <p><strong>Plans linked:</strong> ${plansLinked.length}</p>
          <p><strong>Plans auto-created:</strong> ${plansAutoCreated.length}${
            plansAutoCreated.length ? ` (${plansAutoCreated.join(", ")})` : ""
          }</p>
          <p><strong>Errors:</strong> ${errors.length}</p>
          ${
            fixes.length > 0
              ? `<h3>Fixes</h3>
                <table border="1" cellpadding="4">
                  <tr><th>Client ID</th><th>Subscription ID</th><th>Old Status</th><th>New Status</th></tr>
                  ${fixRows}
                </table>`
              : ""
          }
          ${
            plansLinked.length > 0
              ? `<h3>Plans linked</h3>
                <table border="1" cellpadding="4">
                  <tr><th>Client ID</th><th>Subscription ID</th><th>Plan</th><th>Origin</th></tr>
                  ${planRows}
                </table>`
              : ""
          }
          ${
            errors.length > 0
              ? `<h3>Errors</h3><ul>${errors.map((e) => `<li>${e}</li>`).join("")}</ul>`
              : ""
          }
          <p style="color:#888;font-size:12px">Duration: ${durationMs}ms</p>
        `,
      });
      await logEmail(supabase, {
        to: ADMIN_EMAIL, emailType: "stripe_reconciliation_report", subject: reconSubject,
        ok: !reconRes.error && !!reconRes.data?.id,
        resendId: reconRes.data?.id ?? null,
        error: reconRes.error ? String((reconRes.error as { message?: string }).message ?? reconRes.error) : null,
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        checked,
        fixed: fixes.length,
        plans_linked: plansLinked.length,
        plans_auto_created: plansAutoCreated,
        errors: errors.length,
        error_details: errors,
      }),
      { headers: { "Content-Type": "application/json" }, status: 200 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logStep("FATAL ERROR", { message: msg });

    try {
      await supabase.from("reconciliation_logs").insert({
        subscriptions_checked: checked,
        mismatches_fixed: fixes.length,
        errors: errors.length + 1,
        details: { fixes, errors: [...errors, msg] },
        duration_ms: Date.now() - startedAt,
      });
    } catch {
      // Best-effort log write; never block the error response.
    }

    return new Response(JSON.stringify({ error: msg }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
