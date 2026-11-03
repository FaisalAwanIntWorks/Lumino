import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "npm:stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { linkPurchaseCard } from "../_shared/link-purchase-card.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = data.user;
    if (!user) throw new Error("User not authenticated");

    const { session_id } = await req.json();
    if (!session_id) throw new Error("Missing session_id");

    // Idempotency check — already credited?
    const { data: existingTx } = await supabaseClient
      .from('wallet_transactions')
      .select('id')
      .eq('reference_id', session_id)
      .eq('type', 'topup')
      .maybeSingle();

    if (existingTx) {
      // Already processed (likely by stripe-webhook). Look up the original
      // credit amount so the success page can still display it on refresh.
      const { data: tx } = await supabaseClient
        .from('wallet_transactions')
        .select('amount, balance_after')
        .eq('reference_id', session_id)
        .eq('type', 'topup')
        .maybeSingle();

      const { data: wallet } = await supabaseClient
        .from('client_wallets')
        .select('balance')
        .eq('client_id', (await getClientId(supabaseClient, user.id)))
        .single();

      return new Response(JSON.stringify({
        success: true,
        already_processed: true,
        credited: Number(tx?.amount ?? 0),
        balance: wallet?.balance ?? tx?.balance_after ?? 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify with Stripe
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil", maxNetworkRetries: 3 });
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid') {
      throw new Error("Payment not completed");
    }

    if (session.metadata?.type !== 'credit_purchase') {
      throw new Error("Invalid session type");
    }

    const clientId = session.metadata.client_id;
    const creditAmount = Number(session.metadata.credit_amount);

    if (!clientId || !creditAmount) {
      throw new Error("Invalid session metadata");
    }

    // Verify the user owns this client
    const actualClientId = await getClientId(supabaseClient, user.id);
    if (actualClientId !== clientId) {
      throw new Error("Client ID mismatch");
    }

    // Keep the card for automatic top-up (never switches it on).
    await linkPurchaseCard(supabaseClient, stripe, session, clientId);

    // Compute credits from dollar amount (1 credit = $0.0005). creditAmount already includes any bonus.
    const creditCount = Math.round(creditAmount / 0.0005);
    const creditLabel = creditCount.toLocaleString();

    // Credit the wallet. The DB has a unique partial index on
    // wallet_transactions(reference_id) WHERE type='topup', so if the
    // stripe-webhook beat us to it the RPC will fail with 23505 and we
    // surface the existing balance instead of double-crediting.
    const { data: result, error: creditError } = await supabaseClient.rpc('credit_wallet', {
      p_client_id: clientId,
      p_amount: creditAmount,
      p_type: 'topup',
      p_description: `${creditLabel} credits purchased`,
      p_reference_id: session_id,
    });

    if (creditError) {
      const code = (creditError as any).code;
      const msg = creditError.message || '';
      if (code === '23505' || msg.includes('uniq_wallet_tx_topup_reference') || msg.toLowerCase().includes('duplicate key')) {
        // Webhook already credited this session — read current balance and return idempotent success.
        const { data: wallet } = await supabaseClient
          .from('client_wallets')
          .select('balance')
          .eq('client_id', clientId)
          .single();
        return new Response(JSON.stringify({
          success: true,
          already_processed: true,
          credited: creditAmount,
          balance: wallet?.balance ?? 0,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw creditError;
    }

    return new Response(JSON.stringify({
      success: true,
      credited: creditAmount,
      balance: result?.balance ?? 0,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[VERIFY-CREDIT-PURCHASE] ERROR:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

async function getClientId(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from('clients')
    .select('id')
    .eq('user_id', userId)
    .single();
  if (!data) throw new Error("No client record found");
  return data.id;
}
