import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { resolveClientIdForUser, resolveStripeCustomer } from "../_shared/stripe-customer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Opens a no-charge Stripe page where the client saves a card for automatic top-up.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    const { data: u, error } = await supabase.auth.getUser(token);
    if (error || !u.user?.email) return json({ error: "Not authenticated" }, 401);

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-08-27.basil", maxNetworkRetries: 3 });
    const clientId = await resolveClientIdForUser(supabase, u.user.id);
    if (!clientId) return json({ error: "No client record found" }, 400);
    let customerId = await resolveStripeCustomer(supabase, stripe, { clientId, fallbackEmail: u.user.email });
    if (!customerId) {
      const c = await stripe.customers.create({ email: u.user.email, metadata: { client_id: clientId } });
      customerId = c.id;
      await supabase.from("clients").update({ stripe_customer_id: customerId }).eq("id", clientId).is("stripe_customer_id", null);
    }

    const origin = req.headers.get("origin") || "https://studio.aurezotech.com";
    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId,
      payment_method_types: ["card"],
      success_url: `${origin}/dashboard/settings?card_saved=1`,
      cancel_url: `${origin}/dashboard/settings`,
      metadata: { client_id: clientId, type: "card_setup" },
    });
    return json({ url: session.url });
  } catch (e) {
    console.error("[CREATE-CARD-SETUP]", e instanceof Error ? e.message : String(e));
    return json({ error: "Could not open the card page. Please try again." }, 500);
  }
});
