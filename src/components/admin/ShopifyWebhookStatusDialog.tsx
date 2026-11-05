import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Store } from 'lucide-react';
import { toast } from 'sonner';

type WebhookStatus = 'ok' | 'missing' | 'wrong_client' | 'no_token' | 'api_error';

interface WebhookRow {
  client_id: string;
  company_name: string;
  store: string;
  status: WebhookStatus;
  detail: string | null;
}

const STATUS_LABEL: Record<WebhookStatus, { label: string; className: string }> = {
  ok: { label: 'Registered', className: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30' },
  missing: { label: 'Missing', className: 'bg-red-500/15 text-red-500 border-red-500/30' },
  wrong_client: { label: 'Wrong client', className: 'bg-red-500/15 text-red-500 border-red-500/30' },
  no_token: { label: 'No API token', className: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
  api_error: { label: 'Shopify error', className: 'bg-amber-500/15 text-amber-500 border-amber-500/30' },
};

/** Read-only check of which connected Shopify stores really send orders to Aurezo. */
export function ShopifyWebhookStatusDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<WebhookRow[] | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('shopify-webhook-status');
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setRows(data.rows as WebhookRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Webhook check failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && !rows && !loading) run();
  };

  const okCount = rows?.filter(r => r.status === 'ok').length ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Store className="h-4 w-4 mr-2" />
          Shopify webhooks
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Shopify order webhooks</DialogTitle>
          <DialogDescription>
            Asks each connected store whether an ORDERS_CREATE webhook points at Aurezo. Without it, paid orders never
            reach the dashboard revenue. Read-only — nothing is changed.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-9" />)}
          </div>
        )}

        {!loading && rows && (
          <>
            <p className="text-sm text-muted-foreground">
              {okCount} of {rows.length} stores registered
            </p>
            <ScrollArea className="max-h-[60vh] pr-3">
              <div className="divide-y divide-border/40">
                {[...rows]
                  .sort((a, b) => Number(a.status === 'ok') - Number(b.status === 'ok') || a.company_name.localeCompare(b.company_name))
                  .map(r => (
                    <div key={r.client_id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{r.company_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{r.detail ? `${r.store} · ${r.detail}` : r.store}</p>
                      </div>
                      <Badge variant="outline" className={STATUS_LABEL[r.status].className}>
                        {STATUS_LABEL[r.status].label}
                      </Badge>
                    </div>
                  ))}
              </div>
            </ScrollArea>
          </>
        )}

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={run} disabled={loading}>
            {loading ? 'Checking…' : 'Re-check'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
