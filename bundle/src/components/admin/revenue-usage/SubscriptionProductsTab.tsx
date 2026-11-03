import { useMemo, useState } from 'react';
import { useSubscriptionOverview } from '@/hooks/useAdminRevenueUsage';
import { KpiCardStrip, kpiIcons } from './KpiCardStrip';
import { ClientSubscriptionTable } from './ClientSubscriptionTable';
import { RevenueUsageFilters } from './RevenueUsageFilters';
import { exportCsv } from './exportCsv';

const fmt = (n: number) => '$ ' + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

interface Props {
  clients: { id: string; name: string }[];
  startDate: Date;
  endDate: Date;
  setStartDate: (d: Date) => void;
  setEndDate: (d: Date) => void;
}

export function SubscriptionProductsTab({ clients, startDate, endDate, setStartDate, setEndDate }: Props) {
  const [selectedClient, setSelectedClient] = useState('all');
  const { data = [], isLoading, refetch } = useSubscriptionOverview(startDate, endDate);

  const filtered = useMemo(() => {
    return selectedClient === 'all' ? data : data.filter((x) => x.client_id === selectedClient);
  }, [data, selectedClient]);

  const totals = useMemo(() => {
    const active = filtered.filter((r) => r.status === 'active').length;
    const mrr = filtered.reduce((s, r) => s + r.mrr, 0);
    const lifetime = filtered.reduce((s, r) => s + r.lifetime_revenue, 0);
    const arpu = active === 0 ? 0 : mrr / active;
    return { active, mrr, lifetime, arpu };
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Subscription Products</h2>
        <p className="text-sm text-muted-foreground">
          Track subscription performance — active plans, monthly recurring revenue, and lifetime value across all sub-accounts.
        </p>
      </div>

      <RevenueUsageFilters
        clients={clients}
        selectedClientId={selectedClient}
        onClientChange={setSelectedClient}
        productFilter="all"
        onProductChange={() => {}}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        resoldOnly={false}
        onResoldOnlyChange={() => {}}
        onRefresh={() => refetch()}
        onExport={() => exportCsv(`subscriptions-${Date.now()}.csv`, filtered as unknown as Record<string, unknown>[])}
        showResoldToggle={false}
        showProduct={false}
      />

      <KpiCardStrip items={[
        { label: 'Active Subscriptions', value: totals.active.toLocaleString(), icon: kpiIcons.HandCoins, tone: 'positive' },
        { label: 'Monthly Recurring Revenue', value: fmt(totals.mrr), icon: kpiIcons.DollarSign, tone: 'default' },
        { label: 'Lifetime Revenue', value: fmt(totals.lifetime), icon: kpiIcons.RefreshCcw, tone: 'default' },
        { label: 'ARPU (Avg / Active)', value: fmt(totals.arpu), icon: kpiIcons.Percent, tone: 'positive' },
      ]} />

      <div>
        <div className="mb-3">
          <h3 className="text-base font-semibold">All Sub-accounts</h3>
          <p className="text-xs text-muted-foreground">{filtered.length} sub-accounts</p>
        </div>
        <ClientSubscriptionTable rows={filtered} loading={isLoading} />
      </div>
    </div>
  );
}
