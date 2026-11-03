import Stripe from "npm:stripe@18.5.0";

/**
 * After a paid credit-pack checkout, keep the card for auto top-up:
 * make it the customer's default (if none) and link it in
 * client_auto_recharge_settings. Never switches auto top-up on.
 * Best-effort: failures are logged, never thrown.
 */
export async function linkPurchaseCard(supabase: any, stripe: Stripe, session: Stripe.Checkout.Session, clientId: string) {
  try {
    const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
    if (!piId || !customerId) return;
    const pi = await stripe.paymentIntents.retrieve(piId, { expand: ["payment_method"] });
    const pm = pi.payment_method as Stripe.PaymentMethod | null;
    if (!pm || pm.type !== "card" || !pm.card) return;
    // Only reusable if Stripe attached it to the customer.
    if ((typeof pm.customer === "string" ? pm.customer : pm.customer?.id) !== customerId) return;

    const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
    if (!customer.invoice_settings?.default_payment_method) {
      await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm.id } });
    }

    const { data: existing } = await supabase
      .from("client_auto_recharge_settings")
      .select("stripe_payment_method_id")
      .eq("client_id", clientId)
      .maybeSingle();
    if (existing?.stripe_payment_method_id) return; // keep client's chosen card

    if (existing) {
      await supabase.from("client_auto_recharge_settings").update({
        stripe_payment_method_id: pm.id,
        payment_method_brand: pm.card.brand,
        payment_method_last4: pm.card.last4,
      }).eq("client_id", clientId);
    } else {
      await supabase.from("client_auto_recharge_settings").insert({
        client_id: clientId,
        enabled: false,
        threshold_amount: 5,
        recharge_amount: 25,
        stripe_payment_method_id: pm.id,
        payment_method_brand: pm.card.brand,
        payment_method_last4: pm.card.last4,
      });
    }
    console.log(`[LINK-PURCHASE-CARD] linked ${pm.id} for client ${clientId}`);
  } catch (e) {
    console.error("[LINK-PURCHASE-CARD] failed:", e instanceof Error ? e.message : String(e));
  }
}
