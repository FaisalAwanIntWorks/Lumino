import { stickyHeaderTableClass } from "@/components/ui/table";
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const db = supabase as any;
const METRICS = [
  ['Queued', null],
  ['Sent', 'sent_at'],
  ['Delivered', 'delivered_at'],
  ['Opened', 'opened_at'],
  ['Clicked', 'clicked_at'],
  ['Bounced', 'bounced_at'],
  ['Complained', 'complained_at'],
  ['Unsubscribed', 'unsubscribed_at'],
] as const;

export function ReportsTab() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [stats, setStats] = useState<Record<string, number>>({});
  const [recipients, setRecipients] = useState<any[]>([]);

  useEffect(() => {
    db.from('marketing_campaigns').select('id, name, status').neq('status', 'draft').order('created_at', { ascending: false })
      .then(({ data }: any) => { setCampaigns(data ?? []); if (data?.[0]) setSelected(data[0].id); });
  }, []);

  useEffect(() => {
    if (!selected) return;
    (async () => {
      const out: Record<string, number> = {};
      await Promise.all(METRICS.map(async ([label, col]) => {
        let q = db.from('marketing_campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', selected);
        if (col) q = q.not(col, 'is', null);
        const { count } = await q;
        out[label] = count ?? 0;
      }));
      setStats(out);
      const { data } = await db.from('marketing_campaign_recipients').select('*').eq('campaign_id', selected).order('sent_at', { ascending: false, nullsFirst: false }).limit(200);
      setRecipients(data ?? []);
    })();
  }, [selected]);

  const pct = (k: string) => (stats.Sent ? `${((100 * (stats[k] ?? 0)) / stats.Sent).toFixed(1)}%` : '');

  return (
    <div className="mt-4 space-y-4">
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="max-w-sm"><SelectValue placeholder="Choose a campaign" /></SelectTrigger>
        <SelectContent>{campaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.status})</SelectItem>)}</SelectContent>
      </Select>
      {selected && (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            {METRICS.map(([label]) => (
              <Card key={label}>
                <CardHeader className="pb-1"><CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
                <CardContent className="text-2xl font-semibold">{stats[label] ?? 0}<span className="text-xs text-muted-foreground ml-2">{label !== 'Queued' && label !== 'Sent' ? pct(label) : ''}</span></CardContent>
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">Recipients</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <Table containerClassName={stickyHeaderTableClass}>
                <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Status</TableHead><TableHead>Sent</TableHead><TableHead>Opened</TableHead><TableHead>Clicked</TableHead><TableHead>Issue</TableHead></TableRow></TableHeader>
                <TableBody>
                  {recipients.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.email}</TableCell>
                      <TableCell className="text-sm">{r.status}</TableCell>
                      <TableCell className="text-xs">{r.sent_at ? new Date(r.sent_at).toLocaleString() : ''}</TableCell>
                      <TableCell className="text-xs">{r.opened_at ? 'Yes' : ''}</TableCell>
                      <TableCell className="text-xs">{r.clicked_at ? 'Yes' : ''}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.bounced_at ? 'Bounced' : r.complained_at ? 'Spam report' : r.unsubscribed_at ? 'Unsubscribed' : r.error ?? ''}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
      {campaigns.length === 0 && <p className="text-sm text-muted-foreground">No campaigns have been sent yet.</p>}
    </div>
  );
}
