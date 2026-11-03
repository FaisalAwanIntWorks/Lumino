import { useMemo, useState } from 'react';
import { useUsageOverview, type UsageOverviewRow } from '@/hooks/useAdminRevenueUsage';
import { KpiCardStrip, kpiIcons } from './KpiCardStrip';
import { ClientUsageTable, type CostField } from './ClientUsageTable';
import { ClientUsageDrawer } from './ClientUsageDrawer';
import { RevenueUsageFilters } from './RevenueUsageFilters';
import { exportCsv } from './exportCsv';

const fmt = (n: number) => '$ ' + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmt2 = (n: number) => '$' + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PRODUCT_COST_FIELD: Record<string, CostField> = {
  all: 'cost_dollars',
  chat: 'chat_cost_dollars',
  image: 'image_cost_dollars',
  estimate: 'estimate_cost_dollars',
};
const PRODUCT_LABEL: Record<string, string> = { chat: 'AI Chat', image: 'AI Image', estimate: 'Cost Estimate' };

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
  const [includeInternal, setIncludeInternal] = useState(false);
  const [drawerRow, setDrawerRow] = useState<UsageOverviewRow | null>(null);

  const { data = [], isLoading, refetch } = useUsageOverview(startDate, endDate, resoldOnly, includeInternal);

  const costField = PRODUCT_COST_FIELD[productFilter] ?? 'cost_dollars';
  const productMode = productFilter !== 'all';

  const filtered = useMemo(() => {
    let r = data;
    if (selectedClient !== 'all') r = r.filter((x) => x.client_id === selectedClient);
    if (productMode) {
      r = r.filter((x) =>
        productFilter === 'chat' ? x.chat_count > 0 || x.chat_cost_dollars > 0 :
        productFilter === 'image' ? x.image_count > 0 || x.image_cost_dollars > 0 :
        x.estimate_count > 0 || x.estimate_cost_dollars > 0
      );
    }
    return r;
  }, [data, selectedClient, productFilter, productMode]);

  const totals = useMemo(() => {
    const sum = (k: keyof UsageOverviewRow) => filtered.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const revenue = sum('revenue_dollars');
    const cost = sum(costField);
    const profit = revenue - cost;
    const margin = revenue === 0 ? null : (profit / revenue) * 100;
    return {
      revenue, cost, profit, margin,
      paid: sum('paid_dollars'),
      adminCredits: sum('admin_credit_dollars'),
      refunds: sum('refund_dollars'),
      freeCost: sum('free_credit_cost_dollars'),
      otherDebits: sum('other_debit_dollars'),
    };
  }, [filtered, costField]);

  const costLabel = productMode ? `${PRODUCT_LABEL[productFilter]} Cost` : 'Total Cost';

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
        includeInternal={includeInternal}
        onIncludeInternalChange={setIncludeInternal}
        onRefresh={() => refetch()}
        onExport={() => exportCsv(`usage-products-${Date.now()}.csv`, filtered as unknown as Record<string, unknown>[])}
      />

      <KpiCardStrip items={[
        { label: 'Total Revenue', value: fmt(totals.revenue), icon: kpiIcons.DollarSign, tone: 'default' },
        { label: costLabel, value: fmt(totals.cost), icon: kpiIcons.RefreshCcw, tone: 'default' },
        {
          label: productMode ? 'Total Profit (all products)' : 'Total Profit',
          value: productMode ? '—' : fmt(totals.profit),
          icon: kpiIcons.HandCoins,
          tone: productMode ? 'default' : totals.profit >= 0 ? 'positive' : 'negative',
        },
        {
          label: productMode ? 'Profit Margin (all products)' : 'Profit Margin',
          value: productMode || totals.margin === null ? '—' : `${totals.margin.toFixed(2)}%`,
          icon: kpiIcons.Percent,
          tone: productMode || totals.margin === null ? 'default' : totals.margin >= 0 ? 'positive' : 'negative',
        },
      ]} />

      <p className="text-xs text-muted-foreground -mt-3">
        Revenue = paid top-ups {fmt2(totals.paid)}
        {!resoldOnly && <> + admin-granted credits {fmt2(totals.adminCredits)}</>}
        {' '}− refunds {fmt2(totals.refunds)}.
        {' '}Cost = AI usage charged to wallets at the client price; {fmt2(totals.freeCost)} of it was covered by free monthly credits.
        {totals.otherDebits > 0 && <> Non-usage debits (credit expiry, admin resets) of {fmt2(totals.otherDebits)} are not counted as cost.</>}
        {productMode && <> Profit and margin are only shown for all products, since top-ups are not tied to one product.</>}
      </p>

      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-base font-semibold">All Sub-accounts</h3>
            <p className="text-xs text-muted-foreground">{filtered.length} sub-accounts in selected range</p>
          </div>
        </div>
        <ClientUsageTable rows={filtered} loading={isLoading} costField={costField} onRowClick={(r) => setDrawerRow(r)} />
      </div>

      <ClientUsageDrawer row={drawerRow} open={!!drawerRow} onOpenChange={(o) => !o && setDrawerRow(null)} />
    </div>
  );
}
