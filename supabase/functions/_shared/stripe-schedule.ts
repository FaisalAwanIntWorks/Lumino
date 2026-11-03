import Stripe from "npm:stripe@18.5.0";

export interface UpcomingSchedule {
  scheduleId: string;
  startAt: string; // ISO
  priceId: string | null;
  productId: string | null;
  amountCents: number | null;
  interval: string | null;
}

/**
 * A plan booked in Stripe to start later (subscription schedule, status
 * `not_started`). There is no subscription object until the start date, so
 * without this the client looks "canceled". Earliest valid schedule wins.
 */
export async function findUpcomingSchedule(stripe: Stripe, customerId: string): Promise<UpcomingSchedule | null> {
  try {
    const list = await stripe.subscriptionSchedules.list({ customer: customerId, limit: 20 });
    const candidates = list.data
      .filter((s) => s.status === "not_started" && (s.phases?.length ?? 0) > 0)
      .map((s) => ({ s, start: s.phases[0].start_date }))
      .filter((c) => typeof c.start === "number")
      .sort((a, b) => a.start - b.start);
    const first = candidates[0];
    if (!first) return null;
    const item = first.s.phases[0].items?.[0];
    const priceRef = item?.price as any;
    const priceId = typeof priceRef === "string" ? priceRef : priceRef?.id ?? null;
    let productId: string | null = null;
    let amountCents: number | null = null;
    let interval: string | null = null;
    if (priceId) {
      try {
        const price = await stripe.prices.retrieve(priceId);
        productId = typeof price.product === "string" ? price.product : (price.product as any)?.id ?? null;
        amountCents = price.unit_amount ?? null;
        interval = price.recurring?.interval ?? null;
      } catch { /* ignore */ }
    }
    return {
      scheduleId: first.s.id,
      startAt: new Date(first.start * 1000).toISOString(),
      priceId,
      productId,
      amountCents,
      interval,
    };
  } catch (e) {
    console.log(`[STRIPE-SCHEDULE] lookup failed - ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Fields to write into client_subscriptions for a scheduled plan. */
export function scheduledCacheFields(s: UpcomingSchedule, plan: { id: string; name: string } | null) {
  return {
    status: "scheduled",
    stripe_subscription_id: null, // no subscription yet; keeps reconcile passes off this row
    stripe_schedule_id: s.scheduleId,
    scheduled_start_at: s.startAt,
    current_period_end: s.startAt,
    trial_end: null,
    cancel_at_period_end: false,
    plan_id: plan?.id ?? null,
    plan_name: plan?.name ?? null,
    updated_at: new Date().toISOString(),
  };
}

/**
 * If the customer has a booked future plan, write status=scheduled for the
 * client and return true. Used before revoking access on cancellation.
 */
export async function applyUpcomingScheduleForClient(
  supabase: any,
  stripe: Stripe,
  clientId: string,
  customerId: string,
): Promise<UpcomingSchedule | null> {
  const s = await findUpcomingSchedule(stripe, customerId);
  if (!s) return null;
  const { resolveOrCreatePlan } = await import("./stripe-plan-resolver.ts");
  const plan = s.priceId
    ? await resolveOrCreatePlan(supabase, stripe, s.priceId, {
        productId: s.productId,
        amountCents: s.amountCents,
        interval: s.interval,
      })
    : null;
  await supabase.from("client_subscriptions").upsert(
    { client_id: clientId, stripe_customer_id: customerId, ...scheduledCacheFields(s, plan ? { id: plan.id, name: plan.name } : null) },
    { onConflict: "client_id" },
  );
  if (plan?.id) await supabase.from("clients").update({ plan_id: plan.id }).eq("id", clientId);
  return s;
}
