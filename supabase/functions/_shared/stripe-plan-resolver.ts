import Stripe from "npm:stripe@18.5.0";

/**
 * Shared Stripe price -> internal plan resolver.
 *
 * Resolution order:
 *   1. subscription_plans.stripe_price_id
 *   2. subscription_plans.legacy_stripe_price_ids
 *   3. subscription_plans.stripe_product_ids
 *   4. Auto-create a hidden plan from the Stripe product/price with FULL feature
 *      access and top-tier AI limits, so a paying client is never silently
 *      capped by the hardcoded low defaults.
 *
 * Used by: stripe-webhook, admin-reconciliation, reconcile-client-stripe.
 */

// deno-lint-ignore no-explicit-any
export type SupabaseClient = any;

export interface ResolvedPlan {
  id: string;
  name: string;
  include_license: boolean;
  feature_set: Record<string, boolean> | null;
  auto_created: boolean;
  /** true when this call created the plan */
  created_now: boolean;
}

const log = (s: string, d?: unknown) =>
  console.log(`[PLAN-RESOLVER] ${s}${d ? " - " + JSON.stringify(d) : ""}`);

// Full feature set comes from the shared registry (single source of truth).
export { FULL_FEATURE_SET } from "./feature-registry.ts";
import { FULL_FEATURE_SET } from "./feature-registry.ts";
import { logEmail } from "./email-log.ts";

/** Fallback AI limits when no plan_ai_defaults row exists to clone. */
const TOP_TIER_AI_DEFAULTS = {
  chat_rpm: 100,
  image_rpm: 30,
  cost_estimate_rpm: 20,
  chat_quota: 100000,
  image_quota: 5000,
};

const PLAN_COLUMNS =
  "id, name, include_license, feature_set, auto_created, stripe_price_id, legacy_stripe_price_ids, stripe_product_ids";

function toResolved(row: any, created_now = false): ResolvedPlan {
  return {
    id: row.id,
    name: row.name,
    include_license: row.include_license ?? false,
    feature_set: row.feature_set ?? null,
    auto_created: row.auto_created ?? false,
    created_now,
  };
}

/** Look up an existing plan by price id / legacy price id / product id. */
export async function findPlanByPrice(
  supabase: SupabaseClient,
  priceId: string | null,
  productId: string | null,
): Promise<ResolvedPlan | null> {
  if (priceId) {
    const { data: byPrice } = await supabase
      .from("subscription_plans")
      .select(PLAN_COLUMNS)
      .eq("stripe_price_id", priceId)
      .maybeSingle();
    if (byPrice) return toResolved(byPrice);

    const { data: byLegacy } = await supabase
      .from("subscription_plans")
      .select(PLAN_COLUMNS)
      .contains("legacy_stripe_price_ids", [priceId])
      .maybeSingle();
    if (byLegacy) return toResolved(byLegacy);
  }

  if (productId) {
    const { data: byProduct } = await supabase
      .from("subscription_plans")
      .select(PLAN_COLUMNS)
      .contains("stripe_product_ids", [productId])
      .maybeSingle();
    if (byProduct) return toResolved(byProduct);
  }

  return null;
}

/**
 * Give an auto-created plan the AI limits of the nearest catalog tier at or
 * below its monthly price (price ladder). If the price sits below the cheapest
 * catalog tier — or is unknown — use the cheapest tier's limits rather than the
 * hardcoded low fallback.
 */
async function createAiDefaults(
  supabase: SupabaseClient,
  planId: string,
  monthlyPrice: number,
) {
  const { data: catalog } = await supabase
    .from("subscription_plans")
    .select(
      "id, price_monthly, plan_ai_defaults(chat_rpm, image_rpm, cost_estimate_rpm, chat_quota, image_quota)",
    )
    .eq("auto_created", false)
    .order("price_monthly", { ascending: true });

  const tiers = (catalog ?? [])
    .map((p: any) => ({
      price: Number(p.price_monthly ?? 0),
      limits: Array.isArray(p.plan_ai_defaults) ? p.plan_ai_defaults[0] : p.plan_ai_defaults,
    }))
    .filter((t: any) => t.limits);

  // Highest tier whose price does not exceed ours; else the cheapest tier.
  const atOrBelow = tiers.filter((t: any) => t.price <= monthlyPrice);
  const match = atOrBelow.length > 0 ? atOrBelow[atOrBelow.length - 1] : tiers[0];
  const limits = match?.limits ?? TOP_TIER_AI_DEFAULTS;

  log("price-ladder limits resolved", {
    planId,
    monthlyPrice,
    matchedTierPrice: match?.price ?? null,
    image_quota: limits.image_quota,
  });

  const { error } = await supabase.from("plan_ai_defaults").upsert(
    {
      plan_id: planId,
      chat_rpm: limits.chat_rpm ?? TOP_TIER_AI_DEFAULTS.chat_rpm,
      image_rpm: limits.image_rpm ?? TOP_TIER_AI_DEFAULTS.image_rpm,
      cost_estimate_rpm: limits.cost_estimate_rpm ?? TOP_TIER_AI_DEFAULTS.cost_estimate_rpm,
      chat_quota: limits.chat_quota ?? TOP_TIER_AI_DEFAULTS.chat_quota,
      image_quota: limits.image_quota ?? TOP_TIER_AI_DEFAULTS.image_quota,
    },
    { onConflict: "plan_id" },
  );
  if (error) log("plan_ai_defaults upsert failed", { planId, error: error.message });
}



/** Notify all agency admins (bell + email) that a plan was auto-created. */
async function notifyAdminsPlanCreated(
  supabase: SupabaseClient,
  plan: { id: string; name: string; price_monthly: number | null },
  priceId: string | null,
  productId: string | null,
) {
  const title = "New plan auto-created from Stripe";
  const message =
    `A paying subscription used a Stripe price that wasn't in the plan catalog. ` +
    `"${plan.name}" ($${plan.price_monthly ?? 0}/mo) was created automatically with full features ` +
    `and top-tier AI limits. Review it in Admin → Plans.`;

  try {
    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "agency_admin");

    if (admins?.length) {
      await supabase.from("admin_notifications").insert(
        admins.map((a: { user_id: string }) => ({
          user_id: a.user_id,
          category: "billing",
          title,
          message,
          metadata: { plan_id: plan.id, stripe_price_id: priceId, stripe_product_id: productId },
        })),
      );
    }
  } catch (e) {
    log("admin notification failed (swallowed)", { msg: e instanceof Error ? e.message : String(e) });
  }

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const adminInbox = Deno.env.get("SUPPORT_EMAIL");
  if (!resendKey || !adminInbox) return;
  const planEmailSubject = `[JewlX] Plan auto-created from Stripe — ${plan.name}`;
  try {
    const planEmailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({
        from: "JewlX <onboarding@resend.dev>",
        to: [adminInbox],
        subject: planEmailSubject,
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;color:#111;">
            <h2 style="margin:0 0 12px;">${title}</h2>
            <p style="margin:0 0 12px;line-height:1.6;">${message}</p>
            <table cellpadding="6" style="border-collapse:collapse;font-size:14px;">
              <tr><td><strong>Plan</strong></td><td>${plan.name}</td></tr>
              <tr><td><strong>Monthly</strong></td><td>$${plan.price_monthly ?? 0}</td></tr>
              <tr><td><strong>Stripe price</strong></td><td>${priceId ?? "-"}</td></tr>
              <tr><td><strong>Stripe product</strong></td><td>${productId ?? "-"}</td></tr>
            </table>
          </div>`,
      }),
    });
    let planEmailBody: { id?: string; message?: string } | null = null;
    try { planEmailBody = await planEmailRes.json(); } catch { /* body not JSON */ }
    await logEmail(supabase, {
      to: adminInbox, emailType: "plan_auto_created", subject: planEmailSubject,
      ok: planEmailRes.ok && !!planEmailBody?.id,
      resendId: planEmailBody?.id ?? null,
      error: planEmailRes.ok ? null : `HTTP ${planEmailRes.status}: ${planEmailBody?.message ?? ""}`,
      metadata: { plan_id: plan.id },
    });
  } catch (e) {
    log("admin email failed (swallowed)", { msg: e instanceof Error ? e.message : String(e) });
    await logEmail(supabase, {
      to: adminInbox, emailType: "plan_auto_created", subject: planEmailSubject,
      ok: false, error: e instanceof Error ? e.message : String(e), metadata: { plan_id: plan.id },
    });
  }
}

/**
 * Resolve (and if necessary create) the internal plan for a Stripe price.
 * Never throws — returns null only when the price can't be read at all.
 */
export async function resolveOrCreatePlan(
  supabase: SupabaseClient,
  stripe: Stripe,
  priceId: string | null,
  opts?: { productId?: string | null; amountCents?: number | null; interval?: string | null },
): Promise<ResolvedPlan | null> {
  let productId = opts?.productId ?? null;
  let amountCents = opts?.amountCents ?? null;
  let interval = opts?.interval ?? null;
  let productName: string | null = null;

  const existingFast = await findPlanByPrice(supabase, priceId, productId);
  if (existingFast) return existingFast;

  // Need Stripe detail to auto-create (and to learn the product id).
  if (priceId) {
    try {
      const price = await stripe.prices.retrieve(priceId, { expand: ["product"] });
      amountCents = price.unit_amount ?? amountCents;
      interval = price.recurring?.interval ?? interval;
      const product = price.product as Stripe.Product | string;
      if (typeof product === "string") {
        productId = product;
      } else if (product && !("deleted" in product && product.deleted)) {
        productId = product.id;
        productName = product.name ?? null;
      }
    } catch (e) {
      log("price retrieve failed", { priceId, msg: e instanceof Error ? e.message : String(e) });
    }
  }

  // Re-check by product now that we know it.
  const existing = await findPlanByPrice(supabase, null, productId);
  if (existing) {
    // Remember this price on the plan so the next lookup is a direct hit.
    if (priceId) {
      const { data: row } = await supabase
        .from("subscription_plans")
        .select("legacy_stripe_price_ids, stripe_price_id")
        .eq("id", existing.id)
        .maybeSingle();
      const legacy: string[] = row?.legacy_stripe_price_ids ?? [];
      if (row?.stripe_price_id !== priceId && !legacy.includes(priceId)) {
        await supabase
          .from("subscription_plans")
          .update({ legacy_stripe_price_ids: [...legacy, priceId] })
          .eq("id", existing.id);
      }
    }
    return existing;
  }

  if (!priceId) return null;

  const monthly =
    typeof amountCents === "number"
      ? interval === "year"
        ? Math.round((amountCents / 12) / 100 * 100) / 100
        : amountCents / 100
      : 0;

  const name = productName ? `${productName}` : `Stripe plan ${priceId.slice(-8)}`;

  const { data: created, error } = await supabase
    .from("subscription_plans")
    .insert({
      name,
      price_monthly: monthly,
      tagline: "Auto-created from Stripe",
      price_note: interval === "year" ? "/month (billed yearly)" : "/month",
      cta_text: "Contact us",
      is_visible: false,
      is_highlighted: false,
      display_order: 99,
      commission_rate: 0,
      include_license: false,
      feature_set: FULL_FEATURE_SET,
      features: ["Full platform access", "Top-tier AI limits"],
      stripe_price_id: priceId,
      stripe_product_ids: productId ? [productId] : [],
      auto_created: true,
      source: "stripe_auto",
    })
    .select(PLAN_COLUMNS + ", price_monthly")
    .single();

  if (error || !created) {
    log("plan auto-create failed", { priceId, error: error?.message });
    // Race: another worker may have just created it.
    const retry = await findPlanByPrice(supabase, priceId, productId);
    return retry;
  }

  await createAiDefaults(supabase, created.id, Number(created.price_monthly ?? monthly) || 0);
  await notifyAdminsPlanCreated(
    supabase,
    { id: created.id, name: created.name, price_monthly: created.price_monthly ?? monthly },
    priceId,
    productId,
  );

  log("plan auto-created", { planId: created.id, name: created.name, priceId, productId });
  return toResolved(created, true);
}

/** Price id of the first item on a subscription. */
export function subscriptionPriceId(sub: Stripe.Subscription): string | null {
  return sub.items?.data?.[0]?.price?.id ?? null;
}

/** Product id of the first item on a subscription (when expanded/available). */
export function subscriptionProductId(sub: Stripe.Subscription): string | null {
  const p = sub.items?.data?.[0]?.price?.product as unknown;
  if (typeof p === "string") return p;
  if (p && typeof p === "object" && "id" in (p as any)) return (p as any).id as string;
  return null;
}
