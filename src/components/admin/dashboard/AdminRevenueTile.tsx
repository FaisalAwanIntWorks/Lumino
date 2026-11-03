import { Info } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { formatCurrency } from '@/lib/pricing-utils';

interface CurrencyAmount {
  currency: string;
  amount: number;
  orders: number;
}

interface RevenueClient extends CurrencyAmount {
  id: string;
  name: string;
}

export interface RevenueBreakdown {
  byCurrency: CurrencyAmount[];
  byProduct: { product: string; byCurrency: CurrencyAmount[]; clients: RevenueClient[] }[];
}

const PRODUCT_LABELS: Record<string, string> = {
  ring_os: 'Ring OS',
  ring_builder: 'Ring Builder',
  grillz_builder: 'Grillz Builder',
  custom_enquiry: 'Custom Enquiry',
  metal_iq: 'Metal IQ',
  other: 'Other',
};

// Intl throws on a malformed currency code; never let one bad order blank the tile.
function fmt(amount: number, currency: string) {
  try {
    return formatCurrency(amount, currency);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}

const ordersLabel = (n: number) => `${n.toLocaleString()} order${n !== 1 ? 's' : ''}`;

/**
 * Platform-wide revenue. Currencies are never added together: the tile shows
 * one figure per currency, and the hover card splits it by product, then by
 * client (bars are scaled within their own product + currency).
 */
export function AdminRevenueTile({ data }: { data: RevenueBreakdown }) {
  const [primary, ...others] = data.byCurrency;

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <div className="cursor-help">
          <div className="flex items-center gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">Total Revenue</p>
            <Info className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <p className="text-[32px] font-bold tracking-[-0.03em] text-foreground mt-1">
            {primary ? fmt(primary.amount, primary.currency) : fmt(0, 'USD')}
          </p>
          {others.length > 0 && (
            <p className="text-sm font-semibold text-muted-foreground mt-0.5">
              {others.map(c => `+ ${fmt(c.amount, c.currency)}`).join('  ')}
            </p>
          )}
        </div>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-[380px] max-h-[460px] overflow-y-auto">
        <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/60">
          Revenue by product
        </p>
        {data.byProduct.map(p => {
          const label = PRODUCT_LABELS[p.product] || p.product;
          return (
            <div key={p.product} className="mt-4 first:mt-3">
              <div className="flex items-baseline justify-between gap-2 border-b border-border/40 pb-1.5">
                <span className="text-xs font-semibold text-foreground">{label}</span>
                <span className="text-xs text-muted-foreground text-right">
                  {p.byCurrency.length === 0
                    ? 'No orders'
                    : p.byCurrency
                        .map(c => `${fmt(c.amount, c.currency)} · ${ordersLabel(c.orders)}`)
                        .join('  +  ')}
                </span>
              </div>
              {p.clients.length > 0 && (
                <div className="space-y-3 mt-3">
                  {[...p.clients]
                    .sort((a, b) => b.amount - a.amount)
                    .map(r => {
                      const max = Math.max(
                        ...p.clients.filter(c => c.currency === r.currency).map(c => c.amount),
                        1,
                      );
                      return (
                        <div key={`${r.id}-${r.currency}`}>
                          <div className="flex items-center justify-between mb-1 gap-2">
                            <span className="text-sm font-medium text-foreground truncate">{r.name}</span>
                            <span className="text-sm font-bold text-foreground whitespace-nowrap">
                              {fmt(r.amount, r.currency)}
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                {r.currency} · {ordersLabel(r.orders)}
                              </span>
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-500"
                              style={{ width: `${Math.max((r.amount / max) * 100, 2)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          );
        })}
        <p className="text-[11px] text-muted-foreground/70 mt-4 leading-snug">
          Item price only — excludes tax, shipping, refunded or cancelled orders, and internal test accounts.
          Forms count the deposit paid at checkout.
        </p>
      </HoverCardContent>
    </HoverCard>
  );
}
