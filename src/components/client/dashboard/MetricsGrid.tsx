import { useMemo } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/pricing-utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { DashboardStats } from '@/hooks/useClientDashboard';
import { sumDeviceCounts, type LeadDeviceBreakdown } from '@/hooks/useLeadDeviceBreakdown';
import { CLIENT_LEAD_FORMS, DeviceInfoHover, LeadDeviceCounts, LeadFormsDeviceTable } from '@/components/dashboard/LeadDeviceBreakdown';

interface MetricsGridProps {
  stats: DashboardStats;
  productType: string;
  rangeLabel: string;
  currency: string;
  hasMetalBuying: boolean;
  isQuoteEstimator?: boolean;
  isGlass: boolean;
  animDelay: number;
  /** Per-form device counts for the Total Leads / Bookings hover cards. */
  deviceBreakdown?: LeadDeviceBreakdown | null;
}

export function MetricsGrid({ stats, productType, rangeLabel, currency, hasMetalBuying, isQuoteEstimator = false, isGlass, animDelay, deviceBreakdown }: MetricsGridProps) {
  const metrics = useMemo(() => {
    const metalIQMetric = hasMetalBuying ? [
      { label: 'Metal IQ Leads', value: stats.leadSources.metal_iq || 0, note: rangeLabel, noteColor: '#9ca3af' },
    ] : [];

    // Ring OS revenue is reported in the Shopify order currency. A store
    // normally has one; any extra currency is appended rather than summed in.
    const ringOsByCurrency = stats.widgetRevenueByCurrency ?? [];
    const ringOsRevenueValue = ringOsByCurrency.length > 1
      ? ringOsByCurrency.map(r => formatCurrency(r.amount, r.currency)).join(' + ')
      : formatCurrency(stats.widgetRevenue, stats.widgetRevenueCurrency || currency);

    // Metal IQ-only accounts: no Ring OS revenue or deposits exist for them.
    if (productType === 'metal_iq') {
      const metalLeads = (stats.allLeads ?? []).filter(l => l.source === 'metal_iq');
      const estimated = metalLeads.filter(l => (l.estimated_total ?? 0) > 0);
      // Replied = anyone moved past the untouched "new" status.
      const replied = metalLeads.filter(l => (l.follow_up_status || 'new').toLowerCase() !== 'new').length;
      const totalMetal = stats.leadSources.metal_iq || 0;
      const bookings = stats.leadSources.metal_iq_bookings || 0;
      const pct = (n: number) => `${totalMetal > 0 ? Math.round((n / totalMetal) * 100) : 0}%`;
      // Skip rows whose offer is an obvious data glitch (> 1M) so one bad row can't blow up the total.
      const estimatedProfit = metalLeads
        .filter(l => (l.estimated_total ?? 0) <= 1_000_000)
        .reduce((sum, l) => sum + (l.estimated_profit ?? 0), 0);
      const hasProfitData = metalLeads.some(l => l.estimated_profit !== undefined);
      return [
        { label: 'Total Leads', value: totalMetal, note: rangeLabel, noteColor: '#9ca3af' },
        { label: 'Estimates', value: estimated.length, note: rangeLabel, noteColor: '#9ca3af' },
        { label: 'Replied', value: replied, note: rangeLabel, noteColor: '#9ca3af' },
        { label: 'Reply Rate', value: pct(replied), note: rangeLabel, noteColor: '#9ca3af' },
        { label: 'Bookings', value: bookings, note: rangeLabel, noteColor: '#9ca3af' },
        { label: 'Booking Rate', value: pct(bookings), note: rangeLabel, noteColor: '#9ca3af' },
        ...(hasProfitData
          ? [{ label: 'Estimated Profit', value: formatCurrency(estimatedProfit, currency), note: rangeLabel, noteColor: '#9ca3af' }]
          : []),
      ];
    }

    // Quote Estimator clients have no Ring OS orders or deposits to report.
    if (isQuoteEstimator) {
      return [
        { label: 'Total Leads', value: stats.totalLeads, note: rangeLabel, noteColor: '#9ca3af' },
        { label: 'Bookings', value: stats.totalBookings, note: rangeLabel, noteColor: '#9ca3af' },
        ...metalIQMetric,
      ];
    }

    if (productType === 'ring_os') {
      return [
        { label: 'RingOS Revenue', value: ringOsRevenueValue, note: rangeLabel, noteColor: '#9ca3af' },
        { label: 'Total Leads', value: stats.totalLeads, note: rangeLabel, noteColor: '#9ca3af' },
        { label: 'Bookings', value: stats.totalBookings, note: rangeLabel, noteColor: '#9ca3af' },
        { label: 'Saved Designs', value: stats.totalSavedDesigns, note: rangeLabel, noteColor: '#9ca3af' },
        ...metalIQMetric,
      ];
    }

    if (productType === 'custom_x') {
      return [
        { label: 'Deposits', value: formatCurrency(stats.formsRevenue, stats.formsRevenueCurrency || currency), note: `${stats.depositCount} deposit${stats.depositCount !== 1 ? 's' : ''}`, noteColor: '#9ca3af' },
        { label: 'Total Inquiries', value: stats.totalInquiries, note: rangeLabel, noteColor: '#9ca3af' },
        { label: 'Avg Lead Value', value: formatCurrency(stats.avgLeadValue, currency), note: rangeLabel, noteColor: '#9ca3af' },
        ...metalIQMetric,
      ];
    }

    return [
      { label: 'RingOS Revenue', value: ringOsRevenueValue, note: rangeLabel, noteColor: '#9ca3af' },
      { label: 'Deposits', value: formatCurrency(stats.formsRevenue, stats.formsRevenueCurrency || currency), note: `${stats.depositCount} deposit${stats.depositCount !== 1 ? 's' : ''}`, noteColor: '#9ca3af' },
      { label: 'Total Leads', value: stats.totalLeads, note: rangeLabel, noteColor: '#9ca3af' },
      { label: 'Bookings', value: stats.totalBookings, note: rangeLabel, noteColor: '#9ca3af' },
      ...metalIQMetric,
    ];
  }, [stats, productType, rangeLabel, currency, hasMetalBuying, isQuoteEstimator]);

  // Per-form split of the Deposits tile (absent on older edge-function deploys).
  const formBreakdown = useMemo(() => {
    const labels: Record<string, string> = {
      ring_builder: 'Ring Builder',
      grillz_builder: 'Grillz Builder',
      custom_enquiry: 'Custom Enquiry',
    };
    return (stats.revenueByProduct ?? [])
      .filter(p => labels[p.product])
      .map(p => ({
        label: labels[p.product],
        value: p.byCurrency.length === 0
          ? formatCurrency(0, stats.formsRevenueCurrency || currency)
          : p.byCurrency.map(c => `${formatCurrency(c.amount, c.currency)} (${c.orders})`).join(' + '),
      }));
  }, [stats.revenueByProduct, stats.formsRevenueCurrency, currency]);

  return (
    <div className={cn("mt-10", isGlass ? "glass-panel rounded-2xl p-6" : "")}
      style={{ opacity: 0, animation: `fadeUpIn 0.4s ease-out ${animDelay}s forwards` }}
    >
      <div className={cn(
        "grid grid-cols-1 gap-6",
        metrics.length <= 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3",
      )}>
        {metrics.map((m) => {
          return (
            <div key={m.label} className="neu-card p-5 sm:p-6">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground">{m.label}</p>
                  {m.label === 'Deposits' && formBreakdown.length > 0 && (
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="min-w-[220px]">
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground mb-1.5">Deposits by Form</p>
                            {formBreakdown.map(item => (
                              <div key={item.label} className="flex justify-between gap-4 text-xs">
                                <span className="text-foreground">{item.label}</span>
                                <span className="font-medium text-foreground">{item.value}</span>
                              </div>
                            ))}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {m.label === 'Total Leads' && deviceBreakdown && (
                    <DeviceInfoHover wide>
                      <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/60 mb-2">Leads by form &amp; device</p>
                      <LeadFormsDeviceTable
                        breakdown={deviceBreakdown}
                        forms={productType === 'metal_iq' ? CLIENT_LEAD_FORMS.filter(f => f.label === 'Metal IQ') : CLIENT_LEAD_FORMS}
                      />
                    </DeviceInfoHover>
                  )}
                  {(m.label === 'Bookings' || m.label === 'Metal IQ Leads') && deviceBreakdown && (
                    <DeviceInfoHover>
                      <LeadDeviceCounts
                        title={`${m.label} by device`}
                        counts={sumDeviceCounts(deviceBreakdown, m.label === 'Metal IQ Leads'
                          ? ['metal_iq']
                          : productType === 'metal_iq' ? ['metal_iq_bookings'] : ['booking', 'metal_iq_bookings'])}
                      />
                    </DeviceInfoHover>
                  )}
                  {m.label === 'Total Leads' && !deviceBreakdown && (
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="min-w-[180px]">
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground mb-1.5">Lead Breakdown</p>
                            {(() => {
                              const ls = stats.leadSources || {};
                              const items = [
                                { label: 'Ring OS', value: (ls.widget || 0) + (ls.booking || 0) },
                                { label: 'Ring Builder', value: ls.ring_builder || 0 },
                                { label: 'Grillz Builder', value: ls.grill_form || 0 },
                                { label: 'Custom Enquiry', value: ls.custom_enquiry || 0 },
                                { label: 'Metal IQ', value: ls.metal_iq || 0 },
                              ];
                              return items.map(item => (
                                <div key={item.label} className="flex justify-between text-xs">
                                  <span className="text-foreground">{item.label}</span>
                                  <span className="font-medium text-foreground">{item.value.toLocaleString()}</span>
                                </div>
                              ));
                            })()}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
                <p className="text-[32px] font-bold tracking-[-0.03em] text-foreground mt-2">
                  {typeof m.value === 'number' ? m.value.toLocaleString() : m.value}
                </p>
                {m.note && <p className="text-[11px] text-muted-foreground/70 mt-1">{m.note}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
