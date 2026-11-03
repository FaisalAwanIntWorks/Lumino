import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCOPES = [
  // Admin API
  "read_products", "write_products",
  "read_orders", "write_orders",
  "read_draft_orders", "write_draft_orders",
  "read_inventory", "write_inventory",
  "read_customers", "write_customers",
  "read_checkouts", "write_checkouts",
  "read_price_rules", "write_price_rules",
  "read_discounts", "write_discounts",
  "read_shipping",
  "read_locations",
  "read_fulfillments", "write_fulfillments",
  "read_metaobjects", "write_metaobjects",
  "read_files", "write_files",
].join(",");

function isValidShop(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

function randomNonce(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const CLIENT_ID = Deno.env.get("SHOPIFY_APP_CLIENT_ID");

    if (!CLIENT_ID) {
      return new Response(
        JSON.stringify({ error: "Shopify app not configured (missing SHOPIFY_APP_CLIENT_ID)" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    let shop: string = (body.shop || "").trim().toLowerCase();
    const requestedClientId: string | undefined = body.clientId;
    const returnUrl: string | undefined = body.returnUrl;
    const impersonating: boolean = body.impersonating === true;

    // Normalize: strip protocol, trailing slash
    shop = shop.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!shop.includes(".")) shop = `${shop}.myshopify.com`;

    if (!isValidShop(shop)) {
      return new Response(
        JSON.stringify({ error: "Invalid shop domain. Must be like your-store.myshopify.com" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Check if caller is agency_admin
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "agency_admin")
      .maybeSingle();
    const isAdmin = !!roleRow;

    // Resolve target client
    let targetClientId: string | null = null;
    if (isAdmin && requestedClientId) {
      const { data: c } = await admin
        .from("clients").select("id").eq("id", requestedClientId).maybeSingle();
      if (!c) {
        return new Response(JSON.stringify({ error: "Client not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      targetClientId = c.id;
    } else {
      const { data: c } = await admin
        .from("clients").select("id").eq("user_id", userId).maybeSingle();
      if (!c) {
        return new Response(JSON.stringify({ error: "Client account not found for user" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      targetClientId = c.id;
    }

    const state = randomNonce();
    const { error: insertErr } = await admin.from("shopify_oauth_states").insert({
      state,
      client_id: targetClientId,
      user_id: userId,
      shop,
      return_url: returnUrl ?? null,
      impersonating: isAdmin && !!requestedClientId ? true : impersonating,
    });
    if (insertErr) {
      console.error("Failed to insert oauth state:", insertErr);
      return new Response(JSON.stringify({ error: "Failed to start install" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const redirectUri = `${SUPABASE_URL}/functions/v1/shopify-oauth-callback`;
    const installUrl =
      `https://${shop}/admin/oauth/authorize` +
      `?client_id=${encodeURIComponent(CLIENT_ID)}` +
      `&scope=${encodeURIComponent(SCOPES)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${encodeURIComponent(state)}`;

    return new Response(JSON.stringify({ install_url: installUrl, shop }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("shopify-oauth-start error:", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
