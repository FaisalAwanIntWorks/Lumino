import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sanitizeErrorForClient } from "../_shared/secrets-validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Credit conversion: 1 credit = $0.0005
const dollarsToCredits = (d: number) => Math.round(d / 0.0005);

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  // ── Internal-only endpoint ───────────────────────────────────────────────
  // This charges a saved card, so it must never be callable by an arbitrary
  // request carrying a client_id. Accept the service role key (internal calls
  // from the AI gate) or a signed-in super admin.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  let authorized = token.length > 0 && token === serviceKey;

  if (!authorized && token) {
    const { data: userData } = await supabase.auth.getUser(token);
    if (userData?.user) {
      const { data: isAdmin } = await supabase.rpc("is_super_admin", { _user_id: userData.user.id });
      authorized = isAdmin === true;
    }
  }

  if (!authorized) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", recharged: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 }
    );
  }

  let client_id: string | undefined;
  // Tracked so a failure part-way through never leaves a dangling charge in
  // Stripe that would be swept into the client's next subscription invoice.
  let stripeRef: Stripe | null = null;
  let pendingInvoiceItemId: string | null = null;
  let pendingInvoiceId: string | null = null;

  let dryRun = false;
  try {
    const body = await req.json();
    client_id = body?.client_id;
    dryRun = body?.dry_run === true;
    if (!client_id) throw new Error("client_id required");


    // Get auto-recharge settings
    const { data: settings } = await supabase
      .from("client_auto_recharge_settings")
      .select("*")
      .eq("client_id", client_id)
      .maybeSingle();

    if (!settings?.enabled || !settings.stripe_payment_method_id) {
      return new Response(
        JSON.stringify({ recharged: false, reason: "not_enabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Check spendable credit: purchased wallet balance + unexpired free credit.
    // Free credit is spent first, so an account still holding free credit does
    // not need a top-up yet.
    const { data: wallet } = await supabase
      .from("client_wallets")
      .select("balance")
      .eq("client_id", client_id)
      .maybeSingle();

    const { data: freeRows } = await supabase
      .from("client_free_credits")
      .select("dollars_remaining")
      .eq("client_id", client_id)
      .gt("expires_at", new Date().toISOString());

    const freeBalance = (freeRows ?? []).reduce(
      (sum: number, row: { dollars_remaining: number | null }) => sum + Number(row.dollars_remaining ?? 0),
      0,
    );
    const balance = Number(wallet?.balance ?? 0) + freeBalance;
    if (!dryRun && balance >= settings.threshold_amount) {
      return new Response(
        JSON.stringify({ recharged: false, reason: "above_threshold", balance }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Debounce: 5 minutes between recharges
    if (!dryRun && settings.last_recharged_at) {
      const lastRecharge = new Date(settings.last_recharged_at).getTime();
      if (Date.now() - lastRecharge < 5 * 60 * 1000) {
        return new Response(
          JSON.stringify({ recharged: false, reason: "debounce" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }
    }

    // ── Resolve Stripe customer: DB-first, email fallback ────────────────
    const { data: client } = await supabase
      .from("clients")
      .select("id, email, stripe_customer_id")
      .eq("id", client_id)
      .maybeSingle();

    if (!client) throw new Error("Client record not found");

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2025-08-27.basil",
    });
    stripeRef = stripe;

    let customerId: string | undefined = client.stripe_customer_id ?? undefined;

    if (!customerId) {
      const customers = await stripe.customers.list({
        email: client.email ?? "",
        limit: 1,
      });
      if (customers.data.length === 0) throw new Error("No Stripe customer found");
      customerId = customers.data[0].id;

      // Persist for future auto-recharges
      await supabase
        .from("clients")
        .update({ stripe_customer_id: customerId })
        .eq("id", client_id)
        .is("stripe_customer_id", null);

      console.log(`[AUTO-RECHARGE] Customer resolved via email: ${customerId}`);
    } else {
      console.log(`[AUTO-RECHARGE] Customer found in DB: ${customerId}`);
    }

    // The saved card defines who pays. If it is attached to a different
    // Stripe customer than the one on file (duplicate customers), bill that
    // customer — otherwise Stripe rejects the charge.
    const pm = await stripe.paymentMethods.retrieve(settings.stripe_payment_method_id);
    const pmCustomer = typeof pm.customer === "string" ? pm.customer : pm.customer?.id;
    if (!pmCustomer) throw new Error("Saved card is no longer attached to a Stripe customer");
    const dbCustomer = customerId;
    if (pmCustomer !== customerId) {
      console.warn(`[AUTO-RECHARGE] Card customer ${pmCustomer} differs from DB customer ${customerId}; billing card owner`);
      customerId = pmCustomer;
    }

    const amountCents = Math.round(settings.recharge_amount * 100);
    if (dryRun) {
      return new Response(JSON.stringify({
        dry_run: true, would_charge_cents: amountCents,
        credits: dollarsToCredits(settings.recharge_amount),
        customer: customerId, db_customer: dbCustomer, card_customer_mismatch: pmCustomer !== dbCustomer,
        card: pm.card ? `${pm.card.brand} ${pm.card.last4} exp ${pm.card.exp_month}/${pm.card.exp_year}` : pm.type,
        spendable_balance: balance, threshold: settings.threshold_amount,
        would_trigger_now: balance < settings.threshold_amount,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }
    const credits = dollarsToCredits(settings.recharge_amount);
    const description = `Auto-recharge: ${credits.toLocaleString()} credits ($${settings.recharge_amount})`;

    // Idempotency bucket: per-client per-hour prevents double-charge if invoked
    // concurrently. The 5-min debounce above is a first line; this is the safety net.
    const hourBucket = new Date().toISOString().slice(0, 13); // "2026-04-18T14"

    // Create the draft invoice FIRST (excluding any unrelated pending items),
    // then attach the item explicitly. Newer Stripe API versions no longer
    // sweep pending items into a new invoice, which previously produced
    // empty $0 "paid" invoices with the $100 item left orphaned.
    const invoice = await stripe.invoices.create(
      {
        customer: customerId,
        auto_advance: false,
        collection_method: "charge_automatically",
        default_payment_method: settings.stripe_payment_method_id,
        pending_invoice_items_behavior: "exclude",
        description,
        metadata: {
          client_id,
          type: "auto_recharge",
          recharge_amount: String(settings.recharge_amount),
          credits: String(credits),
        },
      },
      { idempotencyKey: `ar-inv-v2:${client_id}:${hourBucket}` }
    );
    pendingInvoiceId = invoice.id ?? null;

    await stripe.invoiceItems.create(
      {
        customer: customerId,
        invoice: invoice.id,
        amount: amountCents,
        currency: "usd",
        description,
      },
      { idempotencyKey: `ar-item-v2:${client_id}:${hourBucket}` }
    );

    const finalized = await stripe.invoices.finalizeInvoice(invoice.id!, { auto_advance: false });
    if ((finalized.amount_due ?? 0) !== amountCents) {
      throw new Error(`Invoice total mismatch: expected ${amountCents}, got ${finalized.amount_due}`);
    }

    const paidInvoice = await stripe.invoices.pay(
      invoice.id!,
      { payment_method: settings.stripe_payment_method_id },
      { idempotencyKey: `ar-pay:${invoice.id}` }
    );

    if (paidInvoice.status !== "paid" || (paidInvoice.amount_paid ?? 0) !== amountCents) {
      throw new Error(`Invoice payment failed with status: ${paidInvoice.status}`);
    }

    // Paid — nothing left to clean up in Stripe.
    pendingInvoiceId = null;


    // Credit the wallet. The unique index on (reference_id) for topup/auto_recharge
    // rows means a retry that reuses an already-paid invoice cannot credit twice —
    // it raises a duplicate-key error, which we treat as "already credited".
    const { data: creditResult, error: creditError } = await supabase.rpc("credit_wallet", {
      p_client_id: client_id,
      p_amount: settings.recharge_amount,
      p_type: "auto_recharge",
      p_description: `Auto-recharge: ${credits.toLocaleString()} credits`,
      p_reference_id: paidInvoice.id,
    });

    const alreadyCredited = creditError?.code === "23505";
    if (creditError && !alreadyCredited) throw creditError;
    if (alreadyCredited) {
      console.log(`[AUTO-RECHARGE] Invoice ${paidInvoice.id} already credited — skipping duplicate`);
    }

    // Update last_recharged_at and clear any previous failure state
    await supabase
      .from("client_auto_recharge_settings")
      .update({
        last_recharged_at: new Date().toISOString(),
        last_failed_at: null,
        last_failure_reason: null,
      })
      .eq("client_id", client_id);


    console.log(`[AUTO-RECHARGE] Success: client=${client_id}, amount=$${settings.recharge_amount}, credits=${credits}, invoice=${paidInvoice.id}`);

    return new Response(
      JSON.stringify({
        recharged: true,
        amount: settings.recharge_amount,
        credits,
        new_balance: creditResult?.balance,
        invoice_id: paidInvoice.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const clientMsg = sanitizeErrorForClient(error, "Auto-recharge failed. Please try again.");
    console.error(`[AUTO-RECHARGE] Failed for client=${client_id}: ${rawMessage}`);

    // Clean up any charge left parked in Stripe. Without this, an orphan
    // invoice item is swept into the client's next subscription invoice and
    // they are billed for credits they never received. Cleanup errors are
    // logged only — they must never mask the original failure.
    if (stripeRef && pendingInvoiceItemId) {
      try {
        await stripeRef.invoiceItems.del(pendingInvoiceItemId);
        console.log(`[AUTO-RECHARGE] Removed orphan invoice item ${pendingInvoiceItemId}`);
      } catch (cleanupErr) {
        console.error("[AUTO-RECHARGE] Invoice item cleanup failed:", cleanupErr);
      }
    }
    if (stripeRef && pendingInvoiceId) {
      try {
        const inv = await stripeRef.invoices.retrieve(pendingInvoiceId);
        if (inv.status === "draft") {
          await stripeRef.invoices.del(pendingInvoiceId);
        } else if (inv.status === "open") {
          await stripeRef.invoices.voidInvoice(pendingInvoiceId);
        }
        console.log(`[AUTO-RECHARGE] Cleaned up unpaid invoice ${pendingInvoiceId} (${inv.status})`);
      } catch (cleanupErr) {
        console.error("[AUTO-RECHARGE] Invoice cleanup failed:", cleanupErr);
      }
    }


    if (client_id) {
      // Record the failure so the trigger backs off instead of retrying on
      // every request, and make it visible to the client and to us.
      try {
        await supabase
          .from("client_auto_recharge_settings")
          .update({
            last_failed_at: new Date().toISOString(),
            last_failure_reason: rawMessage.slice(0, 500),
          })
          .eq("client_id", client_id);

        await supabase.from("client_notifications").insert({
          client_id,
          category: "billing",
          title: "Automatic credit top-up failed",
          message:
            "We couldn't charge your saved card, so no credits were added. Please check your card details in Settings or buy a credit pack.",
          metadata: { reason: rawMessage.slice(0, 500) },
        });

        // error_type must match system_errors_error_type_check
        // (network|auth|database|validation|timeout|permission|unknown).
        const { error: sysErr } = await supabase.from("system_errors").insert({
          error_source: "edge_function",
          function_name: "process-auto-recharge",
          error_type: "unknown",
          error_message: `Auto-recharge failed: ${rawMessage.slice(0, 900)}`,
          severity: "high",
          client_id,
          endpoint: "process-auto-recharge",
          request_metadata: { kind: "auto_recharge_failed", reason: rawMessage.slice(0, 500) },
        });
        if (sysErr) console.error("[AUTO-RECHARGE] system_errors insert failed:", sysErr);
      } catch (logErr) {
        console.error("[AUTO-RECHARGE] Failed to record failure state:", logErr);
      }
    }

    return new Response(
      JSON.stringify({ error: clientMsg, recharged: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }

});
