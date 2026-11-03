// Shared helper to resolve license-fee payments for a client from Stripe.
// Source of truth: clients.license_fee_payment_ref (admin-curated array of
// `pi_…` / `in_…` ids). We fetch each from Stripe, classify defensively
// (exclude subscription invoices and credit_purchase top-ups), and return a
// normalized payments array + totals.

import type Stripe from "npm:stripe@18.5.0";

export interface LicensePayment {
  ref: string;
  kind: "payment_intent" | "invoice";
  amount: number; // major units (e.g. dollars)
  currency: string;
  paid_at: string | null; // ISO
  description: string | null;
  receipt_url: string | null;
  invoice_pdf: string | null;
  status: string | null;
}

export interface LicenseResolverResult {
  payments: LicensePayment[];
  total_paid: number;
  currency: string | null;
  last_paid_at: string | null;
}

const EMPTY: LicenseResolverResult = {
  payments: [],
  total_paid: 0,
  currency: null,
  last_paid_at: null,
};

function unixToIso(value: unknown): string | null {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value * 1000).toISOString()
    : null;
}

function metaIsCreditPurchase(meta: Record<string, string> | null | undefined): boolean {
  if (!meta) return false;
  return (meta.type || "").toLowerCase() === "credit_purchase";
}

export async function resolveLicensePayments(
  stripe: Stripe,
  refs: string[] | null | undefined,
): Promise<LicenseResolverResult> {
  if (!refs || refs.length === 0) return EMPTY;

  // De-dupe and normalize.
  const unique = Array.from(new Set(refs.map((r) => r.trim()).filter(Boolean)));
  if (unique.length === 0) return EMPTY;

  const results = await Promise.all(
    unique.map(async (ref): Promise<LicensePayment | null> => {
      try {
        if (ref.startsWith("pi_")) {
          const pi = await stripe.paymentIntents.retrieve(ref, {
            expand: ["latest_charge", "invoice"],
          });
          // Defensive: skip top-ups & subscription-linked PIs.
          if (metaIsCreditPurchase(pi.metadata as Record<string, string>)) return null;
          const invoice = (pi as any).invoice;
          if (invoice && typeof invoice === "object" && invoice.subscription) return null;
          if (pi.status !== "succeeded") return null;

          const charge = (pi as any).latest_charge as Stripe.Charge | string | null;
          const receiptUrl = charge && typeof charge === "object" ? charge.receipt_url ?? null : null;
          const invoicePdf = invoice && typeof invoice === "object" ? invoice.invoice_pdf ?? null : null;

          return {
            ref,
            kind: "payment_intent",
            amount: (pi.amount_received ?? pi.amount ?? 0) / 100,
            currency: (pi.currency || "usd").toUpperCase(),
            paid_at: unixToIso(pi.created),
            description: pi.description ?? (invoice && typeof invoice === "object" ? invoice.description ?? null : null),
            receipt_url: receiptUrl,
            invoice_pdf: invoicePdf,
            status: pi.status,
          };
        }

        if (ref.startsWith("in_")) {
          const inv = await stripe.invoices.retrieve(ref);
          if ((inv as any).subscription) return null; // subscription invoice — not a license fee
          if (metaIsCreditPurchase(inv.metadata as Record<string, string>)) return null;
          if (inv.status !== "paid") return null;

          return {
            ref,
            kind: "invoice",
            amount: (inv.amount_paid ?? inv.total ?? 0) / 100,
            currency: (inv.currency || "usd").toUpperCase(),
            paid_at: unixToIso((inv as any).status_transitions?.paid_at ?? inv.created),
            description: inv.description ?? inv.number ?? null,
            receipt_url: (inv as any).hosted_invoice_url ?? null,
            invoice_pdf: inv.invoice_pdf ?? null,
            status: inv.status,
          };
        }

        return null; // unknown prefix — ignore silently
      } catch (e) {
        console.warn(`[license-resolver] failed to fetch ${ref}:`, e instanceof Error ? e.message : e);
        return null;
      }
    }),
  );

  const payments = results.filter((p): p is LicensePayment => p !== null);
  if (payments.length === 0) return EMPTY;

  // Sort newest first
  payments.sort((a, b) => {
    const aT = a.paid_at ? new Date(a.paid_at).getTime() : 0;
    const bT = b.paid_at ? new Date(b.paid_at).getTime() : 0;
    return bT - aT;
  });

  const currency = payments[0].currency;
  const total_paid = payments.reduce((sum, p) => sum + (p.currency === currency ? p.amount : 0), 0);
  const last_paid_at = payments[0].paid_at;

  return { payments, total_paid, currency, last_paid_at };
}

// Suggest license payments by scanning a customer's recent paid PIs for any
// that match a known license product. Used by the admin "Auto-detect" button.
// Returns suggestions only — never auto-links.
export interface LicenseSuggestion {
  payment_intent_id: string;
  amount: number;
  currency: string;
  paid_at: string | null;
  product_id: string;
  product_label: string | null;
  description: string | null;
}

export async function suggestLicensePayments(
  stripe: Stripe,
  customerId: string,
  knownProducts: Map<string, string | null>,
  alreadyLinked: string[],
): Promise<LicenseSuggestion[]> {
  if (knownProducts.size === 0) return [];

  const linkedSet = new Set(alreadyLinked);
  const suggestions: LicenseSuggestion[] = [];

  try {
    // Look at recent payment intents on this customer
    const pis = await stripe.paymentIntents.list({ customer: customerId, limit: 50 });

    for (const pi of pis.data) {
      if (linkedSet.has(pi.id)) continue;
      if (pi.status !== "succeeded") continue;
      if (metaIsCreditPurchase(pi.metadata as Record<string, string>)) continue;

      // Pull the latest_charge to get invoice info, then walk line items.
      // Cheaper: look at invoice on the PI if any.
      let productId: string | null = null;
      try {
        const invoiceRef = (pi as any).invoice;
        if (invoiceRef) {
          const invId = typeof invoiceRef === "string" ? invoiceRef : invoiceRef.id;
          const inv = await stripe.invoices.retrieve(invId, { expand: ["lines.data.price.product"] });
          if ((inv as any).subscription) continue;
          for (const line of inv.lines.data) {
            const prod = (line as any).price?.product;
            const pid = typeof prod === "string" ? prod : prod?.id ?? null;
            if (pid && knownProducts.has(pid)) { productId = pid; break; }
          }
        }
      } catch { /* ignore */ }

      if (!productId) continue;

      suggestions.push({
        payment_intent_id: pi.id,
        amount: (pi.amount_received ?? pi.amount ?? 0) / 100,
        currency: (pi.currency || "usd").toUpperCase(),
        paid_at: unixToIso(pi.created),
        product_id: productId,
        product_label: knownProducts.get(productId) ?? null,
        description: pi.description ?? null,
      });
    }
  } catch (e) {
    console.warn("[license-resolver] suggest failed:", e instanceof Error ? e.message : e);
  }

  return suggestions;
}
