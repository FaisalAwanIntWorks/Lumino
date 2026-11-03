import { useMemo, useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ArrowDown, ArrowUp, ArrowUpDown, TrendingDown, TrendingUp } from 'lucide-react';
import type { UsageOverviewRow } from '@/hooks/useAdminRevenueUsage';

const PAGE_SIZE = 10;
type SortKey = 'company_name' | 'revenue_dollars' | 'cost_dollars' | 'profit_dollars' | 'margin_pct';

const fmtMoney = (n: number) =>
  '$' + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props {
  rows: UsageOverviewRow[];
  loading: boolean;
  onRowClick?: (row: UsageOverviewRow) => void;
}

export function ClientUsageTable({ rows, loading, onRowClick }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('revenue_dollars');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);

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
  const maxCost = Math.max(1, ...rows.map((r) => r.cost_dollars));

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
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
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="cursor-pointer" onClick={() => toggleSort('company_name')}>
                Sub-account <SortIcon k="company_name" />
              </TableHead>
              <TableHead>Plan</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort('revenue_dollars')}>
                Revenue <SortIcon k="revenue_dollars" />
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort('cost_dollars')}>
                Cost <SortIcon k="cost_dollars" />
              </TableHead>
              <TableHead className="text-right">Chats</TableHead>
              <TableHead className="text-right">Images</TableHead>
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
              <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">Loading…</TableCell></TableRow>
            )}
            {!loading && pageRows.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">No data for this range</TableCell></TableRow>
            )}
            {!loading && pageRows.map((r) => {
              const profitPositive = r.profit_dollars >= 0;
              return (
                <TableRow
                  key={r.client_id}
                  className={onRowClick ? 'cursor-pointer hover:bg-muted/40' : ''}
                  onClick={() => onRowClick?.(r)}
                >
                  <TableCell className="font-medium">{r.company_name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{r.plan_name}</TableCell>
                  <TableCell><BarValue value={r.revenue_dollars} max={maxRevenue} color="bg-blue-500" /></TableCell>
                  <TableCell><BarValue value={r.cost_dollars} max={maxCost} color="bg-blue-500" /></TableCell>
                  <TableCell className="text-right">{r.chat_count.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{r.image_count.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{fmtMoney(r.wallet_balance)}</TableCell>
                  <TableCell className={`text-right font-medium ${profitPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                    <span className="inline-flex items-center gap-1">
                      {profitPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {profitPositive ? '+' : '−'}{fmtMoney(Math.abs(r.profit_dollars))}
                    </span>
                  </TableCell>
                  <TableCell className={`text-right font-medium ${profitPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
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
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-3 min-w-[180px]">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground w-20 text-right">{fmtMoney(value)}</span>
    </div>
  );
}
