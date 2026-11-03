import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
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

  try {
    const { client_id } = await req.json();
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

    // Check wallet balance
    const { data: wallet } = await supabase
      .from("client_wallets")
      .select("balance")
      .eq("client_id", client_id)
      .maybeSingle();

    const balance = wallet?.balance ?? 0;
    if (balance >= settings.threshold_amount) {
      return new Response(
        JSON.stringify({ recharged: false, reason: "above_threshold", balance }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Debounce: 5 minutes between recharges
    if (settings.last_recharged_at) {
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

    const amountCents = Math.round(settings.recharge_amount * 100);
    const credits = dollarsToCredits(settings.recharge_amount);
    const description = `Auto-recharge: ${credits.toLocaleString()} credits ($${settings.recharge_amount})`;

    // Idempotency bucket: per-client per-hour prevents double-charge if invoked
    // concurrently. The 5-min debounce above is a first line; this is the safety net.
    const hourBucket = new Date().toISOString().slice(0, 13); // "2026-04-18T14"

    // Create invoice item + invoice instead of raw PaymentIntent
    await stripe.invoiceItems.create(
      {
        customer: customerId,
        amount: amountCents,
        currency: "usd",
        description,
      },
      { idempotencyKey: `ar-item:${client_id}:${hourBucket}` }
    );

    const invoice = await stripe.invoices.create(
      {
        customer: customerId,
        auto_advance: true,
        collection_method: "charge_automatically",
        default_payment_method: settings.stripe_payment_method_id,
        metadata: {
          client_id,
          type: "auto_recharge",
          recharge_amount: String(settings.recharge_amount),
          credits: String(credits),
        },
      },
      { idempotencyKey: `ar-inv:${client_id}:${hourBucket}` }
    );

    // Finalize and pay the invoice
    const paidInvoice = await stripe.invoices.pay(
      invoice.id,
      { payment_method: settings.stripe_payment_method_id },
      { idempotencyKey: `ar-pay:${invoice.id}` }
    );

    if (paidInvoice.status !== "paid") {
      throw new Error(`Invoice payment failed with status: ${paidInvoice.status}`);
    }

    // Credit the wallet
    const { data: creditResult } = await supabase.rpc("credit_wallet", {
      p_client_id: client_id,
      p_amount: settings.recharge_amount,
      p_type: "auto_recharge",
      p_description: `Auto-recharge: ${credits.toLocaleString()} credits`,
      p_reference_id: paidInvoice.id,
    });

    // Update last_recharged_at
    await supabase
      .from("client_auto_recharge_settings")
      .update({ last_recharged_at: new Date().toISOString() })
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
    const clientMsg = sanitizeErrorForClient(error, "Auto-recharge failed. Please try again.");
    return new Response(
      JSON.stringify({ error: clientMsg, recharged: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
