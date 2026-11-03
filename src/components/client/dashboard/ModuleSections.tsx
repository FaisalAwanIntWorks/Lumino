import { useMemo, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/pricing-utils';
import type { ClientFeatures } from '@/lib/feature-registry';
import type { DashboardStats } from '@/hooks/useClientDashboard';
import { sumDeviceCounts, type LeadDeviceBreakdown } from '@/hooks/useLeadDeviceBreakdown';
import {
  CLIENT_LEAD_FORMS,
  DeviceInfoHover,
  LeadDeviceCounts,
  LeadFormsDeviceTable,
  type LeadFormSource,
} from '@/components/dashboard/LeadDeviceBreakdown';

export interface ModuleMetric {
  label: string;
  value: string | number;
  note?: string;
  /** Lead sources whose device split shows in this metric's hover card. */
  deviceSources?: string[];
  /** Show a forms × devices table instead (for an all-forms total). */
  deviceForms?: LeadFormSource[];
}

export interface ModuleSectionData {
  key: string;
  title: string;
  metrics: ModuleMetric[];
}

interface CurrencyAmount {
  currency: string;
  amount: number;
  orders: number;
}

// Intl throws on a malformed currency code; never let one bad order blank a tile.
function fmt(amount: number, currency: string) {
  try {
    return formatCurrency(amount, currency);
  } catch {
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}

/** One figure per currency — currencies are never added together. */
export function formatByCurrency(rows: CurrencyAmount[] | undefined, fallbackCurrency: string) {
  if (!rows || rows.length === 0) return fmt(0, fallbackCurrency);
  return rows.map(r => fmt(r.amount, r.currency)).join(' + ');
}

export function sumCurrencyRows(groups: (CurrencyAmount[] | undefined)[]): CurrencyAmount[] {
  const m: Record<string, CurrencyAmount> = {};
  groups.forEach(rows =>
    (rows ?? []).forEach(r => {
      const c = (m[r.currency] ||= { currency: r.currency, amount: 0, orders: 0 });
      c.amount += r.amount;
      c.orders += r.orders;
    }),
  );
  return Object.values(m).sort((a, b) => b.amount - a.amount);
}

/** Which product modules a client has, following the feature registry groups. */
export function getEnabledModules(features: ClientFeatures) {
  return {
    quoteEstimator: !!features.dtt_v2,
    ringOS: !!(features.product_catalogue || features.orders),
    customX: !!(features.diamond_form || features.grillz_builder || features.custom_enquiry),
    metalIQ: !!features.metal_buying,
  };
}

/** Section/metric model for a single client, built from client-dashboard-stats. */
export function buildClientSections(
  stats: DashboardStats,
  features: ClientFeatures,
  currency: string,
  rangeLabel: string,
): ModuleSectionData[] {
  const mods = getEnabledModules(features);
  const ls = stats.leadSources || {};
  const sections: ModuleSectionData[] = [];
  const byProduct = (p: string) => stats.revenueByProduct?.find(r => r.product === p)?.byCurrency;

  if (mods.ringOS) {
    const ringRows = stats.widgetRevenueByCurrency ?? [];
    sections.push({
      key: 'ring_os',
      title: 'Ring OS',
      metrics: [
        {
          label: 'Revenue',
          value: ringRows.length > 0
            ? formatByCurrency(ringRows, currency)
            : fmt(stats.widgetRevenue, stats.widgetRevenueCurrency || currency),
          note: rangeLabel,
        },
        { label: 'Saved Designs', value: ls.widget || 0, note: rangeLabel, deviceSources: ['widget'] },
        { label: 'Bookings', value: ls.booking || 0, note: rangeLabel, deviceSources: ['booking'] },
      ],
    });
  }

  if (mods.customX) {
    const formRows = sumCurrencyRows(['ring_builder', 'grillz_builder', 'custom_enquiry'].map(byProduct));
    const metrics: ModuleMetric[] = [
      {
        label: 'Deposits',
        value: formRows.length > 0
          ? formatByCurrency(formRows, currency)
          : fmt(stats.formsRevenue, stats.formsRevenueCurrency || currency),
        note: `${stats.depositCount} deposit${stats.depositCount !== 1 ? 's' : ''}`,
      },
    ];
    if (features.diamond_form) metrics.push({ label: 'Ring Builder Leads', value: ls.ring_builder || 0, note: rangeLabel, deviceSources: ['ring_builder'] });
    if (features.grillz_builder) metrics.push({ label: 'Grillz Leads', value: ls.grill_form || 0, note: rangeLabel, deviceSources: ['grill_form'] });
    if (features.custom_enquiry) metrics.push({ label: 'Custom Enquiry Leads', value: ls.custom_enquiry || 0, note: rangeLabel, deviceSources: ['custom_enquiry'] });
    sections.push({ key: 'custom_x', title: 'Custom X', metrics });
  }

  if (mods.quoteEstimator) {
    sections.push({
      key: 'quote_estimator',
      title: 'Quote Estimator',
      metrics: [
        { label: 'Total Leads', value: stats.totalLeads, note: rangeLabel, deviceForms: CLIENT_LEAD_FORMS },
        { label: 'Bookings', value: stats.totalBookings, note: rangeLabel, deviceSources: ['booking', 'metal_iq_bookings'] },
      ],
    });
  }

  if (mods.metalIQ) {
    const metalLeads = (stats.allLeads ?? []).filter(l => l.source === 'metal_iq');
    const totalMetal = ls.metal_iq || 0;
    const bookings = ls.metal_iq_bookings || 0;
    const estimated = metalLeads.filter(l => (l.estimated_total ?? 0) > 0).length;
    const replied = metalLeads.filter(l => (l.follow_up_status || 'new').toLowerCase() !== 'new').length;
    const metrics: ModuleMetric[] = [
      { label: 'Leads', value: totalMetal, note: rangeLabel, deviceSources: ['metal_iq'] },
      { label: 'Estimates', value: estimated, note: rangeLabel },
      { label: 'Replied', value: replied, note: rangeLabel },
      { label: 'Bookings', value: bookings, note: rangeLabel, deviceSources: ['metal_iq_bookings'] },
    ];
    if (metalLeads.some(l => l.estimated_profit !== undefined)) {
      // Skip obvious data glitches (> 1M) so one bad row can't blow up the total.
      const profit = metalLeads
        .filter(l => (l.estimated_total ?? 0) <= 1_000_000)
        .reduce((sum, l) => sum + (l.estimated_profit ?? 0), 0);
      metrics.push({ label: 'Estimated Profit', value: fmt(profit, currency), note: rangeLabel });
    }
    sections.push({ key: 'metal_iq', title: 'Metal IQ', metrics });
  }

  return sections;
}

interface ModuleSectionsProps {
  sections: ModuleSectionData[];
  isGlass?: boolean;
  animDelay?: number;
  /** Extra content rendered inside a section's heading row, keyed by section key. */
  headingExtras?: Record<string, ReactNode>;
  /** Per-form device counts; metrics with deviceSources/deviceForms get a hover card. */
  deviceBreakdown?: LeadDeviceBreakdown | null;
}

/** Each product module gets its own headed block of KPIs. */
export function ModuleSections({ sections, isGlass = false, animDelay = 0.06, headingExtras, deviceBreakdown }: ModuleSectionsProps) {
  const rendered = useMemo(() => sections.filter(s => s.metrics.length > 0), [sections]);
  if (rendered.length === 0) return null;

  return (
    <div
      className="mt-10 space-y-8"
      style={{ opacity: 0, animation: `fadeUpIn 0.4s ease-out ${animDelay}s forwards` }}
    >
      {rendered.map(section => {
        const cols = section.metrics.length;
        return (
          <section key={section.key} className={cn(isGlass && 'glass-panel rounded-2xl p-6')}>
            <div className="flex items-center gap-2 border-b border-border/30 pb-2">
              <h2 className="text-[11px] font-semibold tracking-[0.1em] uppercase text-muted-foreground">
                {section.title}
              </h2>
              {headingExtras?.[section.key]}
            </div>
            <div
              className={cn(
                'grid grid-cols-1 sm:grid-cols-2 gap-6 mt-5',
                cols >= 4 ? 'lg:grid-cols-4' : cols === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2',
              )}
            >
              {section.metrics.map((m) => (
                <div key={m.label} className="neu-card p-5">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium text-muted-foreground">{m.label}</p>
                    {deviceBreakdown && m.deviceForms && (
                      <DeviceInfoHover wide>
                        <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/60 mb-2">Leads by form &amp; device</p>
                        <LeadFormsDeviceTable breakdown={deviceBreakdown} forms={m.deviceForms} />
                      </DeviceInfoHover>
                    )}
                    {deviceBreakdown && !m.deviceForms && m.deviceSources && (
                      <DeviceInfoHover>
                        <LeadDeviceCounts counts={sumDeviceCounts(deviceBreakdown, m.deviceSources)} title={`${m.label} by device`} />
                      </DeviceInfoHover>
                    )}
                  </div>
                  <p className="text-[28px] font-bold tracking-[-0.03em] text-foreground mt-2">
                    {typeof m.value === 'number' ? m.value.toLocaleString() : m.value}
                  </p>
                  {m.note && <p className="text-[11px] text-muted-foreground/60 mt-0.5">{m.note}</p>}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
