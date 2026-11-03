import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sanitizeErrorForClient } from "../_shared/secrets-validation.ts";

// Server-side allowlist of valid CAD add-on Stripe price IDs.
// Mirrors CAD_ADDONS in src/components/settings/BillingTabContent.tsx.
// Stripe is the source of truth for the actual amount charged — the client
// cannot manipulate price by sending an arbitrary price_id.
const CAD_ADDON_PRICES: Record<string, { kind: "cad_tweak" | "new_cad" | "cad_render"; label: string }> = {
  "price_1TI8rHELyIQnr0qGFputHmUE": { kind: "cad_tweak",  label: "CAD Tweak" },
  "price_1TI8rgELyIQnr0qGwkKGJfIi": { kind: "new_cad",    label: "New CAD Request" },
  "price_1TI8s4ELyIQnr0qGUVbRSlow": { kind: "cad_render", label: "CAD + Render" },
};
const VALID_CAD_ADDON_PRICE_IDS = new Set(Object.keys(CAD_ADDON_PRICES));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[PURCHASE-CAD-ADDON] ${step}${d}`);
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
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new UserFacingError("No authorization header provided", 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new UserFacingError("Authentication failed.", 401);
    const user = userData.user;
    if (!user.email) throw new UserFacingError("User not authenticated.", 401);

    const { price_id } = await req.json();
    if (!price_id || typeof price_id !== "string") {
      throw new UserFacingError("Invalid or missing price_id", 400);
    }

    // ── Validate price_id against server-side allowlist ──────────────────
    if (!VALID_CAD_ADDON_PRICE_IDS.has(price_id)) {
      logStep("Rejected unknown price_id", { price_id });
      throw new UserFacingError("Invalid price_id", 400);
    }

    logStep("Price ID validated", { price_id });

    // ── Resolve Stripe customer: DB-first, email fallback ────────────────
    const { data: client } = await supabaseClient
      .from("clients")
      .select("id, stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil", maxNetworkRetries: 3 });

    let customerId: string | undefined = client?.stripe_customer_id ?? undefined;

    if (!customerId) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
        if (client) {
          await supabaseClient
            .from("clients")
            .update({ stripe_customer_id: customerId })
            .eq("id", client.id)
            .is("stripe_customer_id", null);
        }
      }
      logStep("Stripe customer resolved via email", { customerId });
    } else {
      logStep("Stripe customer found in DB", { customerId });
    }

    // Idempotency key: one session per user+price per day
    const dateBucket = new Date().toISOString().slice(0, 10);
    const idempotencyKey = `cad-addon:${user.id}:${price_id}:${dateBucket}`;

    const addonInfo = CAD_ADDON_PRICES[price_id];
    const session = await stripe.checkout.sessions.create(
      {
        customer: customerId,
        customer_email: customerId ? undefined : user.email,
        line_items: [{ price: price_id, quantity: 1 }],
        mode: "payment",
        invoice_creation: { enabled: true },
        success_url: `${req.headers.get("origin")}/settings?tab=billing`,
        cancel_url: `${req.headers.get("origin")}/settings?tab=billing`,
        metadata: {
          type: "cad_addon",
          user_id: user.id,
          client_id: client?.id ?? "",
          price_id,
          addon_kind: addonInfo.kind,
          addon_label: addonInfo.label,
        },
        payment_intent_data: {
          metadata: {
            type: "cad_addon",
            user_id: user.id,
            client_id: client?.id ?? "",
            price_id,
            addon_kind: addonInfo.kind,
          },
        },
      },
      { idempotencyKey }
    );

    logStep("Checkout session created", { sessionId: session.id });

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
      "Purchase failed. Please try again."
    );
    return new Response(JSON.stringify({ error: clientMsg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
