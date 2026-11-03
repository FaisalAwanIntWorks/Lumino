import { stickyHeaderTableClass } from "@/components/ui/table";
import { useEffect, useMemo, useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowDown, ArrowUp, ArrowUpDown, TrendingDown, TrendingUp } from 'lucide-react';
import type { UsageOverviewRow } from '@/hooks/useAdminRevenueUsage';

const PAGE_SIZE = 10;
export type CostField = 'cost_dollars' | 'chat_cost_dollars' | 'image_cost_dollars' | 'estimate_cost_dollars';
type SortKey = 'company_name' | 'revenue_dollars' | CostField | 'profit_dollars' | 'margin_pct';

const fmtMoney = (n: number) =>
  '$' + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  rows: UsageOverviewRow[];
  loading: boolean;
  /** Which cost column to show: total, or one product's share. */
  costField?: CostField;
  onRowClick?: (row: UsageOverviewRow) => void;
}

export function ClientUsageTable({ rows, loading, costField = 'cost_dollars', onRowClick }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('revenue_dollars');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

  // Keep the page in range when filters shrink the list.
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = a[sortKey] as number | string | null;
      const bv = b[sortKey] as number | string | null;
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = (av as number) ?? 0;
      const bn = (bv as number) ?? 0;
      return sortDir === 'asc' ? an - bn : bn - an;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const maxRevenue = Math.max(1, ...rows.map((r) => r.revenue_dollars));
  const maxCost = Math.max(1, ...rows.map((r) => r[costField]));

  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };

  const SortIcon = ({ k }: { k: SortKey }) =>
    k !== sortKey ? <ArrowUpDown className="h-3 w-3 ml-1 inline" /> :
    sortDir === 'asc' ? <ArrowUp className="h-3 w-3 ml-1 inline" /> : <ArrowDown className="h-3 w-3 ml-1 inline" />;

  return (
    <div className="border rounded-lg overflow-hidden bg-card">
      <div className="overflow-x-auto">
        <Table containerClassName={stickyHeaderTableClass}>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="cursor-pointer" onClick={() => toggleSort('company_name')}>
                Sub-account <SortIcon k="company_name" />
              </TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort('revenue_dollars')}>
                Revenue <SortIcon k="revenue_dollars" />
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort(costField)}>
                Cost <SortIcon k={costField} />
              </TableHead>
              <TableHead className="text-right">Chats</TableHead>
              <TableHead className="text-right">Images</TableHead>
              <TableHead className="text-right">Estimates</TableHead>
              <TableHead className="text-right">Wallet</TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => toggleSort('profit_dollars')}>
                Profit <SortIcon k="profit_dollars" />
              </TableHead>
              <TableHead className="cursor-pointer text-right" onClick={() => toggleSort('margin_pct')}>
                Margin <SortIcon k="margin_pct" />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={10} className="text-center py-12 text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!loading && pageRows.length === 0 && (
              <TableRow><TableCell colSpan={10} className="text-center py-12 text-muted-foreground">No data for this range</TableCell></TableRow>
            )}
            {!loading && pageRows.map((r) => {
              const profitPositive = r.profit_dollars >= 0;
              return (
                <TableRow
                  key={r.client_id}
                  className={onRowClick ? 'cursor-pointer hover:bg-muted/40' : ''}
                  onClick={() => onRowClick?.(r)}
                >
                  <TableCell className="font-medium">
                    {r.company_name}
                    {r.is_internal && <Badge variant="outline" className="ml-2 text-[10px] py-0">internal</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{r.plan_name}</TableCell>
                  <TableCell><BarValue value={r.revenue_dollars} max={maxRevenue} color="bg-blue-500" /></TableCell>
                  <TableCell><BarValue value={r[costField]} max={maxCost} color="bg-blue-500" /></TableCell>
                  <TableCell className="text-right">{r.chat_count.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{r.image_count.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{r.estimate_count.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{fmtMoney(r.wallet_balance)}</TableCell>
                  <TableCell className={`text-right font-medium ${profitPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                    <span className="inline-flex items-center gap-1">
                      {profitPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {profitPositive ? '+' : '−'}{fmtMoney(Math.abs(r.profit_dollars))}
                    </span>
                  </TableCell>
                  <TableCell className={`text-right font-medium ${r.margin_pct === null ? 'text-muted-foreground' : profitPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {r.margin_pct === null ? '—' : `${r.margin_pct.toFixed(1)}%`}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between p-3 border-t bg-muted/20">
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {sorted.length} sub-accounts
          </span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => i + 1).map((p) => (
              <Button
                key={p}
                variant={p === page ? 'default' : 'outline'}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPage(p)}
              >{p}</Button>
            ))}
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function BarValue({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (Math.max(0, value) / max) * 100);
  return (
    <div className="flex items-center gap-3 min-w-[180px]">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-20 text-right">{fmtMoney(value)}</span>
    </div>
  );
}
