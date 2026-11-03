// Admin-only helper for the License Fee payments editor in ClientDetail.
// Two actions, both gated to agency_admin:
//   - "list":    resolve linked refs into rich payment objects for the editor.
//   - "suggest": scan the customer's Stripe payment intents for matches
//                against the license_products allow-list; returns suggestions.
//
// Writes are done client-side via direct table updates (RLS already protects
// clients.license_fee_payment_ref via admin policies).

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  resolveLicensePayments,
  suggestLicensePayments,
} from "../_shared/license-resolver.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (s: string, d?: unknown) =>
  console.log(`[LICENSE-PAYMENTS-ADMIN] ${s}${d ? " - " + JSON.stringify(d) : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");
    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData.user) throw new Error("Invalid auth");

    const { data: roleRow } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "agency_admin")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const action: string = body.action;
    const clientId: string | undefined = body.client_id;
    if (!clientId) throw new Error("client_id required");

    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .select("id, stripe_customer_id, license_fee_payment_ref")
      .eq("id", clientId)
      .maybeSingle();
    if (clientErr || !client) throw new Error("Client not found");

    const stripe = new Stripe(stripeKey, {
      apiVersion: "2025-08-27.basil",
      maxNetworkRetries: 3,
    });

    if (action === "list") {
      const result = await resolveLicensePayments(
        stripe,
        (client.license_fee_payment_ref as string[] | null) ?? [],
      );
      return new Response(JSON.stringify({ ok: true, ...result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (action === "suggest") {
      if (!client.stripe_customer_id) {
        return new Response(
          JSON.stringify({
            ok: false,
            reason: "no_customer",
            message: "Link a Stripe customer ID first before auto-detecting.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
        );
      }

      const { data: products } = await supabase
        .from("license_products")
        .select("stripe_product_id, label");
      const knownProducts = new Map<string, string | null>(
        (products ?? []).map((p) => [p.stripe_product_id, p.label]),
      );

      const suggestions = await suggestLicensePayments(
        stripe,
        client.stripe_customer_id,
        knownProducts,
        (client.license_fee_payment_ref as string[] | null) ?? [],
      );

      return new Response(JSON.stringify({ ok: true, suggestions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ error: "unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    log("ERROR", { message: e instanceof Error ? e.message : String(e) });
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : String(e) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
