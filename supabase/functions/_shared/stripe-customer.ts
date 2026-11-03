import Stripe from "npm:stripe@18.5.0";

/**
 * Single source of truth for "which Stripe customer belongs to this login".
 * Order: client.stripe_customer_id -> client_subscriptions.stripe_customer_id
 * -> email lookup (only when nothing is linked; persisted if the column is null).
 * Staff logins resolve to their company's client, never their own email.
 */
export async function resolveClientIdForUser(supabase: any, userId: string): Promise<string | null> {
  const { data: own } = await supabase.from("clients").select("id").eq("user_id", userId).maybeSingle();
  if (own?.id) return own.id;
  const { data: staff } = await supabase
    .from("staff_members")
    .select("client_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return staff?.client_id ?? null;
}

async function isLiveCustomer(stripe: Stripe, id: string): Promise<boolean> {
  try {
    const c = await stripe.customers.retrieve(id);
    return !!c && !(c as any).deleted;
  } catch {
    return false;
  }
}

export async function resolveStripeCustomer(
  supabase: any,
  stripe: Stripe,
  opts: { clientId: string | null; fallbackEmail?: string | null },
): Promise<string | null> {
  const { clientId, fallbackEmail } = opts;
  let linked: string | null = null;
  let clientEmail: string | null = null;

  if (clientId) {
    const { data: client } = await supabase
      .from("clients")
      .select("email, stripe_customer_id")
      .eq("id", clientId)
      .maybeSingle();
    clientEmail = client?.email ?? null;
    linked = client?.stripe_customer_id ?? null;
    if (linked && (await isLiveCustomer(stripe, linked))) return linked;

    const { data: sub } = await supabase
      .from("client_subscriptions")
      .select("stripe_customer_id")
      .eq("client_id", clientId)
      .maybeSingle();
    if (sub?.stripe_customer_id && sub.stripe_customer_id !== linked && (await isLiveCustomer(stripe, sub.stripe_customer_id))) {
      return sub.stripe_customer_id;
    }
  }

  // Email fallback: company email first, then the login email.
  for (const email of [clientEmail, fallbackEmail]) {
    if (!email) continue;
    const list = await stripe.customers.list({ email, limit: 1 });
    const found = list.data[0]?.id;
    if (found) {
      if (clientId && !linked) {
        await supabase.from("clients").update({ stripe_customer_id: found }).eq("id", clientId).is("stripe_customer_id", null);
      }
      return found;
    }
  }
  return null;
}
