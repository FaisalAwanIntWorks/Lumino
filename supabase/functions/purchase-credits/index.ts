import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { sanitizeErrorForClient } from "../_shared/secrets-validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[PURCHASE-CREDITS] ${step}${d}`);
};

class UserFacingError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "UserFacingError";
    this.status = status;
  }
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new UserFacingError("No authorization header provided", 401);

    const token = authHeader.replace("Bearer ", "");
    const { data, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !data.user) throw new UserFacingError("Authentication failed.", 401);
    const user = data.user;
    if (!user.email) throw new UserFacingError("User not authenticated.", 401);

    const { pack } = await req.json();
    const packKey = `credits_${pack}`;

    // Load pack config from DB (single source of truth — avoids code deploys when packs change)
    const { data: product, error: packError } = await supabaseClient
      .from("credit_packs")
      .select("stripe_price_id, amount_usd, bonus_usd, label")
      .eq("pack_key", packKey)
      .eq("active", true)
      .maybeSingle();

    if (packError || !product) {
      logStep("Invalid credit pack requested", { pack, packKey, packError });
      throw new UserFacingError(
        `Invalid credit pack: ${pack}. Please choose a valid pack.`,
        400
      );
    }

    logStep("Credit pack resolved from DB", { pack: packKey, priceId: product.stripe_price_id });

    // Get client (id + stripe_customer_id)
    const { data: clientData } = await supabaseClient
      .from("clients")
      .select("id, stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!clientData) throw new UserFacingError("No client record found.", 400);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil", maxNetworkRetries: 3 });

    // ── Resolve Stripe customer: DB-first, email fallback ────────────────
    let customerId: string | undefined = clientData.stripe_customer_id ?? undefined;

    if (!customerId) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        await supabaseClient
          .from("clients")
          .update({ stripe_customer_id: customerId })
          .eq("id", clientData.id)
          .is("stripe_customer_id", null);
        logStep("Stripe customer found via email", { customerId });
      }
    } else {
      logStep("Stripe customer found in DB", { customerId });
    }

    const origin = req.headers.get("origin") || "https://studio.aurezotech.com";

    // Idempotency key: one session per user+pack per day (v2 = card-saving sessions)
    const dateBucket = new Date().toISOString().slice(0, 10);
    const idempotencyKey = `credits:v2:${user.id}:${packKey}:${dateBucket}`;

    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        customer_email: customerId ? undefined : user.email,
        customer_creation: customerId ? undefined : "always",
        line_items: [{ price: product.stripe_price_id, quantity: 1 }],
        mode: "payment",
        // Cards only, and keep the card on file so automatic top-up can use it.
        payment_method_types: ["card"],
        payment_intent_data: { setup_future_usage: "off_session" },
        invoice_creation: { enabled: true },
        success_url: `${origin}/credits-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/dashboard/usage`,
        metadata: {
          user_id: user.id,
          client_id: clientData.id,
          // credit_amount = base + bonus, so wallet credits the FULL advertised value
          credit_amount: String(product.amount_usd + product.bonus_usd),
          base_amount: String(product.amount_usd),
          bonus_amount: String(product.bonus_usd),
          pack: packKey,
          type: "credit_purchase",
        },
      },
      { idempotencyKey }
    );

    logStep("Checkout session created", { sessionId: session.id, pack: packKey });

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
    const clientMsg = sanitizeErrorForClient(
      error,
      "Credit purchase failed. Please try again."
    );
    return new Response(JSON.stringify({ error: clientMsg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
