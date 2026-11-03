import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { sanitizeErrorForClient } from "../_shared/secrets-validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");

    const { payment_method_id } = await req.json();
    if (!payment_method_id) throw new Error("payment_method_id required");

    // Get client
    const { data: client } = await supabase
      .from("clients")
      .select("id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!client) throw new Error("Client not found");

    // Get payment method details from Stripe
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2025-08-27.basil",
      maxNetworkRetries: 3,
    });
    const pm = await stripe.paymentMethods.retrieve(payment_method_id);

    // Upsert auto-recharge settings with payment method info
    const { error: upsertError } = await supabase
      .from("client_auto_recharge_settings")
      .upsert(
        {
          client_id: client.id,
          stripe_payment_method_id: payment_method_id,
          payment_method_brand: pm.card?.brand ?? null,
          payment_method_last4: pm.card?.last4 ?? null,
        },
        { onConflict: "client_id" }
      );

    if (upsertError) throw upsertError;

    return new Response(
      JSON.stringify({
        success: true,
        brand: pm.card?.brand,
        last4: pm.card?.last4,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const clientMsg = sanitizeErrorForClient(error, "Failed to save payment method. Please try again.");
    return new Response(
      JSON.stringify({ error: clientMsg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
