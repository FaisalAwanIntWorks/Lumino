import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type Status = "ok" | "missing" | "wrong_client" | "no_token" | "api_error";

interface Row {
  client_id: string;
  company_name: string;
  store: string;
  status: Status;
  detail: string | null;
  callback_url: string | null;
}

const WEBHOOK_PATH = "/functions/v1/shopify-order-webhook";

// Read-only: lists each connected store's ORDERS_CREATE webhooks and reports
// whether one points at shopify-order-webhook. Nothing is created or changed.
async function checkClient(supabase: any, c: any): Promise<Row> {
  const base = { client_id: c.id, company_name: c.company_name, callback_url: null as string | null };
  const domain = String(c.shopify_store_url).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const store = domain;

  const { data: token, error: tokenError } = await supabase.rpc("decrypt_shopify_token", { client_user_id: c.user_id });
  if (tokenError || !token) {
    return { ...base, store, status: "no_token", detail: "No Admin API token stored for this store" };
  }

  try {
    const res = await fetch(`https://${domain}/admin/api/2024-07/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
      body: JSON.stringify({
        query: `query { webhookSubscriptions(first: 50, topics: [ORDERS_CREATE]) { edges { node { topic endpoint { ... on WebhookHttpEndpoint { callbackUrl } } } } } }`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return { ...base, store, status: "api_error", detail: `Shopify returned HTTP ${res.status}` };
    }
    const json = await res.json();
    if (json.errors) {
      const msg = Array.isArray(json.errors) ? json.errors.map((e: any) => e.message).join("; ") : String(json.errors);
      return { ...base, store, status: "api_error", detail: msg.slice(0, 200) };
    }

    const urls: string[] = (json.data?.webhookSubscriptions?.edges ?? [])
      .map((e: any) => e.node?.endpoint?.callbackUrl)
      .filter((u: unknown): u is string => typeof u === "string" && u.includes(WEBHOOK_PATH));

    if (urls.length === 0) {
      return { ...base, store, status: "missing", detail: "No ORDERS_CREATE webhook points at Aurezo" };
    }

    // A webhook with ?client_id= for a different client would file orders under that client.
    const ours = urls.find((u) => {
      try {
        const id = new URL(u).searchParams.get("client_id");
        return !id || id === c.id;
      } catch {
        return false;
      }
    });
    if (!ours) {
      return { ...base, store, status: "wrong_client", detail: "Webhook carries a different client_id", callback_url: urls[0] };
    }
    return { ...base, store, status: "ok", detail: null, callback_url: ours };
  } catch (e) {
    return { ...base, store, status: "api_error", detail: e instanceof Error ? e.message.slice(0, 200) : "Request failed" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const { data: userData, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError || !userData.user) throw new Error("Authentication failed");

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "agency_admin")
      .maybeSingle();
    if (!roleData) throw new Error("Unauthorized: not an admin");

    const { data: clients, error } = await supabase
      .from("clients")
      .select("id, user_id, company_name, shopify_store_url")
      .not("shopify_store_url", "is", null)
      .order("company_name");
    if (error) throw new Error(error.message);

    const list = (clients ?? []).filter((c: any) => String(c.shopify_store_url).trim() !== "");
    const rows: Row[] = [];
    // Small batches keep us well inside Shopify's per-store limits and the function timeout.
    for (let i = 0; i < list.length; i += 5) {
      rows.push(...(await Promise.all(list.slice(i, i + 5).map((c: any) => checkClient(supabase, c)))));
    }

    return new Response(JSON.stringify({ rows }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[SHOPIFY-WEBHOOK-STATUS] ERROR:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
