import { useMemo, useState } from 'react';
import { useUsageOverview, type UsageOverviewRow } from '@/hooks/useAdminRevenueUsage';
import { KpiCardStrip, kpiIcons } from './KpiCardStrip';
import { ClientUsageTable } from './ClientUsageTable';
import { ClientUsageDrawer } from './ClientUsageDrawer';
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

export function UsageProductsTab({ clients, startDate, endDate, setStartDate, setEndDate }: Props) {
  const [selectedClient, setSelectedClient] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [resoldOnly, setResoldOnly] = useState(false);
  const [drawerRow, setDrawerRow] = useState<UsageOverviewRow | null>(null);

  const { data = [], isLoading, refetch } = useUsageOverview(startDate, endDate, resoldOnly);

  const filtered = useMemo(() => {
    let r = data;
    if (selectedClient !== 'all') r = r.filter((x) => x.client_id === selectedClient);
    if (productFilter !== 'all') {
      r = r.filter((x) =>
        productFilter === 'chat' ? x.chat_count > 0 :
        productFilter === 'image' ? x.image_count > 0 :
        x.estimate_count > 0
      );
    }
    return r;
  }, [data, selectedClient, productFilter]);

  const totals = useMemo(() => {
    const revenue = filtered.reduce((s, r) => s + r.revenue_dollars, 0);
    const cost = filtered.reduce((s, r) => s + r.cost_dollars, 0);
    const profit = revenue - cost;
    const margin = revenue === 0 ? 0 : (profit / revenue) * 100;
    return { revenue, cost, profit, margin };
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Usage Products</h2>
        <p className="text-sm text-muted-foreground">
          Monitor AI Wallet performance with real-time insights into revenue, credit consumption, profit margins, and per-client trends.
        </p>
      </div>

      <RevenueUsageFilters
        clients={clients}
        selectedClientId={selectedClient}
        onClientChange={setSelectedClient}
        productFilter={productFilter}
        onProductChange={setProductFilter}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        resoldOnly={resoldOnly}
        onResoldOnlyChange={setResoldOnly}
        onRefresh={() => refetch()}
        onExport={() => exportCsv(`usage-products-${Date.now()}.csv`, filtered as unknown as Record<string, unknown>[])}
      />

      <KpiCardStrip items={[
        { label: 'Total Revenue', value: fmt(totals.revenue), icon: kpiIcons.DollarSign, tone: 'default' },
        { label: 'Total Cost', value: fmt(totals.cost), icon: kpiIcons.RefreshCcw, tone: 'default' },
        { label: 'Total Profit', value: fmt(totals.profit), icon: kpiIcons.HandCoins, tone: totals.profit >= 0 ? 'positive' : 'negative' },
        { label: 'Profit Margin', value: `${totals.margin.toFixed(2)}%`, icon: kpiIcons.Percent, tone: totals.margin >= 0 ? 'positive' : 'negative' },
      ]} />

      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-semibold">All Sub-accounts</h3>
            <p className="text-xs text-muted-foreground">{filtered.length} sub-accounts in selected range</p>
          </div>
        </div>
        <ClientUsageTable rows={filtered} loading={isLoading} onRowClick={(r) => setDrawerRow(r)} />
      </div>

      <ClientUsageDrawer row={drawerRow} open={!!drawerRow} onOpenChange={(o) => !o && setDrawerRow(null)} />
    </div>
  );
}
