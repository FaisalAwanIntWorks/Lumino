import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isValidShop(shop: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop);
}

async function verifyHmac(params: URLSearchParams, secret: string): Promise<boolean> {
  const hmacFromShopify = params.get("hmac");
  if (!hmacFromShopify) return false;

  // Build message from sorted params, excluding hmac and signature
  const entries: [string, string][] = [];
  for (const [k, v] of params.entries()) {
    if (k === "hmac" || k === "signature") continue;
    entries.push([k, v]);
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  const message = entries.map(([k, v]) => `${k}=${v}`).join("&");

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time compare
  if (computed.length !== hmacFromShopify.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ hmacFromShopify.charCodeAt(i);
  }
  return diff === 0;
}

function htmlRedirect(url: string, message: string): Response {
  const safe = url.replace(/"/g, "&quot;");
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Shopify Connection</title>
<meta http-equiv="refresh" content="0;url=${safe}">
<body style="font-family:system-ui;background:#000;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">
  <div style="text-align:center">
    <p>${message}</p>
    <p><a style="color:#50C878" href="${safe}">Continue</a></p>
  </div>
</body>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function defaultReturnUrl(shop: string, ok: boolean, errMsg?: string, opts?: { admin?: boolean; clientId?: string }): string {
  const base = opts?.admin && opts?.clientId
    ? `https://admin.jewlx.ai/admin/clients/${opts.clientId}`
    : "https://vault.jewlx.ai/settings/shopify";
  const params = new URLSearchParams();
  params.set(ok ? "connected" : "error", ok ? "1" : (errMsg || "1"));
  params.set("shop", shop);
  return `${base}?${params.toString()}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const params = url.searchParams;
  const code = params.get("code");
  const shop = (params.get("shop") || "").toLowerCase();
  const state = params.get("state");

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const CLIENT_ID = Deno.env.get("SHOPIFY_APP_CLIENT_ID")!;
    const CLIENT_SECRET = Deno.env.get("SHOPIFY_APP_CLIENT_SECRET")!;

    if (!CLIENT_ID || !CLIENT_SECRET) {
      return htmlRedirect(defaultReturnUrl(shop, false, "app_not_configured"), "App not configured");
    }
    if (!code || !shop || !state || !isValidShop(shop)) {
      return htmlRedirect(defaultReturnUrl(shop || "unknown", false, "invalid_request"), "Invalid request");
    }

    // Verify HMAC from Shopify
    const hmacOk = await verifyHmac(params, CLIENT_SECRET);
    if (!hmacOk) {
      console.error("HMAC verification failed");
      return htmlRedirect(defaultReturnUrl(shop, false, "hmac_failed"), "Signature verification failed");
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Look up state
    const { data: stateRow, error: stateErr } = await admin
      .from("shopify_oauth_states")
      .select("client_id, user_id, shop, return_url, expires_at, impersonating")
      .eq("state", state)
      .maybeSingle();

    if (stateErr || !stateRow) {
      return htmlRedirect(defaultReturnUrl(shop, false, "invalid_state"), "Install session not found or expired");
    }
    const adminCtx = { admin: !!stateRow.impersonating, clientId: stateRow.client_id as string };
    if (new Date(stateRow.expires_at).getTime() < Date.now()) {
      await admin.from("shopify_oauth_states").delete().eq("state", state);
      return htmlRedirect(defaultReturnUrl(shop, false, "state_expired", adminCtx), "Install session expired");
    }
    if (stateRow.shop.toLowerCase() !== shop) {
      return htmlRedirect(defaultReturnUrl(shop, false, "shop_mismatch", adminCtx), "Shop mismatch");
    }

    const returnUrl = stateRow.return_url || defaultReturnUrl(shop, true, undefined, adminCtx);

    // Exchange code -> access token
    const tokenResp = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
      }),
    });
    const tokenJson = await tokenResp.json();
    if (!tokenResp.ok || !tokenJson.access_token) {
      console.error("Token exchange failed:", tokenJson);
      return htmlRedirect(
        defaultReturnUrl(shop, false, "token_exchange_failed"),
        "Failed to obtain access token from Shopify",
      );
    }
    const adminAccessToken: string = tokenJson.access_token;

    // Look up user_id of the target client (encryption RPCs key by user_id)
    const { data: clientRow } = await admin
      .from("clients")
      .select("user_id")
      .eq("id", stateRow.client_id)
      .maybeSingle();

    if (!clientRow?.user_id) {
      return htmlRedirect(defaultReturnUrl(shop, false, "client_user_missing"), "Client user missing");
    }

    // Save store URL on client
    await admin
      .from("clients")
      .update({ shopify_store_url: `https://${shop}` })
      .eq("id", stateRow.client_id);

    // Encrypt admin token
    const { error: encErr } = await admin.rpc("encrypt_shopify_token", {
      client_user_id: clientRow.user_id,
      token: adminAccessToken,
    });
    if (encErr) {
      console.error("encrypt_shopify_token failed:", encErr);
      return htmlRedirect(defaultReturnUrl(shop, false, "encrypt_failed"), "Failed to store token");
    }

    // Create Storefront token via Admin GraphQL (best-effort, non-blocking on failure)
    try {
      const sfResp = await fetch(`https://${shop}/admin/api/2024-07/graphql.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": adminAccessToken,
        },
        body: JSON.stringify({
          query: `mutation { storefrontAccessTokenCreate(input: { title: "JewlX Storefront ${Date.now()}" }) {
            storefrontAccessToken { accessToken } userErrors { field message } } }`,
        }),
      });
      const sfJson = await sfResp.json();
      const sfToken = sfJson?.data?.storefrontAccessTokenCreate?.storefrontAccessToken?.accessToken;
      if (sfToken) {
        await admin.rpc("encrypt_storefront_token", {
          client_user_id: clientRow.user_id,
          token: sfToken,
        });
      } else {
        console.warn("Storefront token creation returned no token:", sfJson);
      }
    } catch (e) {
      console.warn("Storefront token creation threw:", e);
    }

    // Cleanup state
    await admin.from("shopify_oauth_states").delete().eq("state", state);

    const successUrl = returnUrl.includes("?")
      ? `${returnUrl}&connected=1&shop=${encodeURIComponent(shop)}`
      : `${returnUrl}?connected=1&shop=${encodeURIComponent(shop)}`;

    return htmlRedirect(successUrl, "Shopify connected. Redirecting...");
  } catch (e) {
    console.error("shopify-oauth-callback error:", e);
    return htmlRedirect(defaultReturnUrl(shop || "unknown", false, "internal_error"), "Internal error");
  }
});
