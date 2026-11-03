import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import type { UsageOverviewRow } from '@/hooks/useAdminRevenueUsage';

const fmt = (n: number) => '$' + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Tx { id: string; type: string; amount: number; balance_after: number; description: string; created_at: string }

export function ClientUsageDrawer({ row, open, onOpenChange }: { row: UsageOverviewRow | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !row) return;
    setLoading(true);
    supabase
      .from('wallet_transactions')
      .select('id,type,amount,balance_after,description,created_at')
      .eq('client_id', row.client_id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setTxs((data ?? []) as Tx[]);
        setLoading(false);
      });
  }, [open, row]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{row?.company_name}</SheetTitle>
        </SheetHeader>
        {row && (
          <div className="mt-4 space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Plan" value={row.plan_name} />
              <Stat label="Wallet Balance (purchased)" value={fmt(row.wallet_balance)} />
              <Stat label="Free Credits Left" value={fmt(row.free_credits_remaining)} />
              <Stat
                label="Purchased credits expire"
                value={row.purchased_expires_at ? format(new Date(row.purchased_expires_at), 'MMM d, yyyy') : '—'}
              />
              <Stat label="Revenue (range)" value={fmt(row.revenue_dollars)} />
              <Stat label="Cost (range)" value={fmt(row.cost_dollars)} />
              <Stat label="Profit" value={fmt(row.profit_dollars)} positive={row.profit_dollars >= 0} />
              <Stat label="Margin" value={row.margin_pct === null ? '—' : `${row.margin_pct.toFixed(1)}%`} />
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Where the numbers come from (selected range)</h3>
              <div className="border rounded-lg divide-y text-sm">
                <Line label="Paid top-ups (Stripe)" value={fmt(row.paid_dollars)} />
                <Line label="Admin-granted credits" value={fmt(row.admin_credit_dollars)} />
                <Line label="Refund claw-backs" value={row.refund_dollars > 0 ? `− ${fmt(row.refund_dollars)}` : fmt(0)} />
                <Line label="AI Chat usage" value={`${fmt(row.chat_cost_dollars)} · ${row.chat_count.toLocaleString()} chats`} />
                <Line label="AI Image usage" value={`${fmt(row.image_cost_dollars)} · ${row.image_count.toLocaleString()} images`} />
                <Line label="Cost Estimate usage" value={`${fmt(row.estimate_cost_dollars)} · ${row.estimate_count.toLocaleString()} estimates`} />
                <Line label="…of which paid with free credits" value={fmt(row.free_credit_cost_dollars)} muted />
                <Line label="Non-usage debits (expiry, admin reset) — not in cost" value={fmt(row.other_debit_dollars)} muted />
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold mb-2">Recent Wallet Transactions (all time, last 50)</h3>
              <div className="border rounded-lg divide-y max-h-[420px] overflow-y-auto">
                {loading && <div className="p-4 text-sm text-muted-foreground">Loading…</div>}
                {!loading && txs.length === 0 && <div className="p-4 text-sm text-muted-foreground">No transactions</div>}
                {txs.map((t) => (
                  <div key={t.id} className="flex items-center justify-between p-3 text-sm">
                    <div>
                      <div className="font-medium">{t.description}</div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(t.created_at), 'MMM d, yyyy HH:mm')} · {t.type}
                      </div>
                    </div>
                    <div className={`font-mono ${t.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {t.amount >= 0 ? '+' : ''}{fmt(t.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="border rounded-lg p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${positive === false ? 'text-rose-600' : positive ? 'text-emerald-600' : ''}`}>{value}</div>
    </div>
  );
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 ${muted ? 'text-muted-foreground' : ''}`}>
      <span>{label}</span>
      <span className="font-mono text-xs">{value}</span>
    </div>
  );
}
