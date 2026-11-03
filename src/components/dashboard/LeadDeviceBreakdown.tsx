import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { LeadDeviceIcon } from '@/components/leads/LeadDeviceRow';
import { LEAD_DEVICE_CATEGORIES, LEAD_DEVICE_LABELS, type LeadDeviceCategory } from '@/lib/lead-device';
import { sumDeviceCounts, type LeadDeviceBreakdown } from '@/hooks/useLeadDeviceBreakdown';

type Counts = Partial<Record<LeadDeviceCategory, number>>;

const total = (c: Counts) => Object.values(c).reduce((a, b) => a + (b ?? 0), 0);

/** Device split for one metric: icon, name, count and a share bar. */
export function LeadDeviceCounts({ counts, title = 'Leads by device' }: { counts: Counts; title?: string }) {
  const sum = total(counts);
  const rows = LEAD_DEVICE_CATEGORIES.filter(d => (counts[d] ?? 0) > 0);
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/60 mb-2">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No leads in this range</p>
      ) : (
        <div className="space-y-2">
          {rows.map(d => {
            const n = counts[d] ?? 0;
            const pct = sum > 0 ? Math.round((n / sum) * 100) : 0;
            return (
              <div key={d}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-foreground">
                    <LeadDeviceIcon category={d} />
                    {LEAD_DEVICE_LABELS[d]}
                  </span>
                  <span className="font-medium text-foreground tabular-nums">
                    {n.toLocaleString()} <span className="text-muted-foreground font-normal">({pct}%)</span>
                  </span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export interface LeadFormSource {
  label: string;
  /** Source keys summed into this row (e.g. Ring OS = widget + booking). */
  sources: string[];
}

/** Forms × devices matrix: each form's lead count, then how many came from each device. */
export function LeadFormsDeviceTable({ breakdown, forms }: { breakdown: LeadDeviceBreakdown; forms: LeadFormSource[] }) {
  const rows = forms
    .map(f => ({ ...f, counts: sumDeviceCounts(breakdown, f.sources) }))
    .map(f => ({ ...f, total: total(f.counts) }))
    .filter(f => f.total > 0);
  const grand = sumDeviceCounts(breakdown, forms.flatMap(f => f.sources));
  const devices = LEAD_DEVICE_CATEGORIES.filter(d => (grand[d] ?? 0) > 0);
  const grandTotal = total(grand);

  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">No leads in this range</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
        <thead>
          <tr className="border-b border-border/40 text-muted-foreground">
            <th className="text-left font-medium py-1.5 pr-3">Form</th>
            <th className="text-right font-semibold py-1.5 px-2 text-foreground">Leads</th>
            {devices.map(d => (
              <th key={d} className="text-right font-medium py-1.5 px-2 whitespace-nowrap">
                <span className="inline-flex items-center gap-1">
                  <LeadDeviceIcon category={d} className="h-3 w-3" />
                  {LEAD_DEVICE_LABELS[d]}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.label} className="border-b border-border/20">
              <td className="py-1.5 pr-3 text-foreground whitespace-nowrap">{r.label}</td>
              <td className="py-1.5 px-2 text-right font-semibold text-foreground">{r.total.toLocaleString()}</td>
              {devices.map(d => (
                <td key={d} className="py-1.5 px-2 text-right text-foreground">
                  {(r.counts[d] ?? 0) > 0 ? (r.counts[d] ?? 0).toLocaleString() : <span className="text-muted-foreground/40">–</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {rows.length > 1 && (
          <tfoot>
            <tr className="font-semibold text-foreground">
              <td className="pt-2 pr-3">Total</td>
              <td className="pt-2 px-2 text-right">{grandTotal.toLocaleString()}</td>
              {devices.map(d => (
                <td key={d} className="pt-2 px-2 text-right">
                  {(grand[d] ?? 0).toLocaleString()}
                  <span className="block text-[10px] font-normal text-muted-foreground">
                    {grandTotal > 0 ? Math.round(((grand[d] ?? 0) / grandTotal) * 100) : 0}%
                  </span>
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {devices.includes('unknown') && (
        <p className="mt-2 text-[10px] text-muted-foreground/70">“Not tracked” = leads submitted before device capture was added.</p>
      )}
    </div>
  );
}

/** Info icon that opens a hover card — used next to KPI labels. */
export function DeviceInfoHover({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button type="button" aria-label="Show device breakdown" className="inline-flex cursor-help">
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="start" className={wide ? 'w-auto min-w-[320px] max-w-[min(640px,calc(100vw-32px))]' : 'w-[260px]'}>
        {children}
      </HoverCardContent>
    </HoverCard>
  );
}

/** Client dashboard forms list (leadSources keys). */
export const CLIENT_LEAD_FORMS: LeadFormSource[] = [
  { label: 'Ring OS', sources: ['widget', 'booking'] },
  { label: 'Ring Builder', sources: ['ring_builder'] },
  { label: 'Quote Estimator', sources: ['diamond_form'] },
  { label: 'Grillz Builder', sources: ['grill_form'] },
  { label: 'Custom Enquiry', sources: ['custom_enquiry'] },
  { label: 'Metal IQ', sources: ['metal_iq'] },
];

/** Admin "Total Leads" covers every lead table, bookings split by product. */
export const ADMIN_LEAD_FORMS: LeadFormSource[] = [
  { label: 'Ring OS — Saved Designs', sources: ['widget'] },
  { label: 'Ring OS — Bookings', sources: ['booking'] },
  { label: 'Ring Builder', sources: ['ring_builder'] },
  { label: 'Quote Estimator', sources: ['diamond_form'] },
  { label: 'Grillz Builder', sources: ['grill_form'] },
  { label: 'Custom Enquiry', sources: ['custom_enquiry'] },
  { label: 'Metal IQ', sources: ['metal_iq'] },
  { label: 'Metal IQ — Bookings', sources: ['metal_iq_bookings'] },
];
