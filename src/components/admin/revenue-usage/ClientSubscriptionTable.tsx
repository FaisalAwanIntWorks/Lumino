import { stickyHeaderTableClass } from "@/components/ui/table";
import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import type { SubscriptionOverviewRow } from '@/hooks/useAdminRevenueUsage';
import { format } from 'date-fns';

const PAGE_SIZE = 10;
type SortKey = 'company_name' | 'mrr' | 'lifetime_revenue' | 'plan_price_monthly';
const fmt = (n: number) => '$' + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusColor: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  trialing: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  trial: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  scheduled: 'bg-blue-500/15 text-blue-700 border-blue-500/30',
  past_due: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  canceled: 'bg-rose-500/15 text-rose-700 border-rose-500/30',
  none: 'bg-muted text-muted-foreground border-border',
};

export function ClientSubscriptionTable({ rows, loading }: { rows: SubscriptionOverviewRow[]; loading: boolean }) {
  const [sortKey, setSortKey] = useState<SortKey>('mrr');
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

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggle = (k: SortKey) => {
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
              <TableHead className="cursor-pointer" onClick={() => toggle('company_name')}>
                Sub-account <SortIcon k="company_name" />
              </TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right cursor-pointer" onClick={() => toggle('plan_price_monthly')}>
                Price <SortIcon k="plan_price_monthly" />
              </TableHead>
              <TableHead className="text-right cursor-pointer" onClick={() => toggle('mrr')}>
                MRR <SortIcon k="mrr" />
              </TableHead>
              <TableHead className="text-right cursor-pointer" onClick={() => toggle('lifetime_revenue')}>
                <span
                  title="Estimated: plan price × billing periods since the trial ended, stopping at cancellation. Does not reflect actual Stripe invoices."
                  className="underline decoration-dotted underline-offset-2 cursor-help"
                >
                  Est. Lifetime Rev.
                </span>
                {' '}<SortIcon k="lifetime_revenue" />
              </TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Billing since</TableHead>
              <TableHead>Renews</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">Loading…</TableCell></TableRow>}
            {!loading && pageRows.length === 0 && <TableRow><TableCell colSpan={9} className="text-center py-12 text-muted-foreground">No subscriptions</TableCell></TableRow>}
            {!loading && pageRows.map((r) => (
              <TableRow key={r.client_id}>
                <TableCell className="font-medium">
                  {r.company_name}
                  {r.is_internal && <Badge variant="outline" className="ml-2 text-[10px] py-0">internal</Badge>}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{r.plan_name}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusColor[r.status] ?? statusColor.none}>
                    {r.status}{r.cancel_at_period_end ? ' · cancels' : ''}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{fmt(r.plan_price_monthly)}/mo</TableCell>
                <TableCell className="text-right font-medium text-emerald-600">{r.mrr > 0 ? fmt(r.mrr) : '—'}</TableCell>
                <TableCell className="text-right" title={r.billed_periods ? `${r.billed_periods} billing period(s)` : undefined}>
                  {r.lifetime_revenue > 0 ? fmt(r.lifetime_revenue) : '—'}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.started_at ? format(new Date(r.started_at), 'MMM d, yyyy') : '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.paid_since && r.billed_periods > 0 ? format(new Date(r.paid_since), 'MMM d, yyyy') : '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.current_period_end ? format(new Date(r.current_period_end), 'MMM d, yyyy') : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between p-3 border-t bg-muted/20">
          <span className="text-xs text-muted-foreground">Page {page} of {totalPages} · {sorted.length} sub-accounts</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => i + 1).map((p) => (
              <Button key={p} variant={p === page ? 'default' : 'outline'} size="sm" className="h-8 w-8 p-0" onClick={() => setPage(p)}>{p}</Button>
            ))}
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
