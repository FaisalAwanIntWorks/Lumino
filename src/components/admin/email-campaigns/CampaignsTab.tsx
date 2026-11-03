import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { useAdminAccess } from '@/hooks/useAdminAccess';

const db = supabase as any;
const TIMEZONES = ['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Karachi', 'Australia/Sydney'];

const empty = () => ({
  id: null as string | null, name: '', template_id: '', list_ids: [] as string[], subject: '', preview_text: '',
  batch_size: 50, interval_minutes: 30, daily_cap: '' as string | number, window_start: '', window_end: '', timezone: 'UTC', start_at: '',
});

export function CampaignsTab() {
  const { canWrite } = useAdminAccess();
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [lists, setLists] = useState<any[]>([]);
  const [counts, setCounts] = useState<Record<string, { queued: number; sent: number }>>({});
  const [form, setForm] = useState<ReturnType<typeof empty> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: c }, { data: t }, { data: l }] = await Promise.all([
      db.from('marketing_campaigns').select('*').order('created_at', { ascending: false }),
      db.from('marketing_templates').select('id, name, subject, preview_text').order('name'),
      db.from('marketing_lists').select('id, name, marketing_list_members(count)').order('name'),
    ]);
    setCampaigns(c ?? []); setTemplates(t ?? []); setLists(l ?? []);
    const next: Record<string, { queued: number; sent: number }> = {};
    await Promise.all((c ?? []).filter((x: any) => x.status !== 'draft').map(async (x: any) => {
      const [{ count: q }, { count: s }] = await Promise.all([
        db.from('marketing_campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', x.id),
        db.from('marketing_campaign_recipients').select('id', { count: 'exact', head: true }).eq('campaign_id', x.id).not('sent_at', 'is', null),
      ]);
      next[x.id] = { queued: q ?? 0, sent: s ?? 0 };
    }));
    setCounts(next);
  };
  useEffect(() => { load(); const t = setInterval(load, 45000); return () => clearInterval(t); }, []);

  const save = async (start: boolean) => {
    if (!form) return;
    if (!form.name || !form.template_id || !form.list_ids.length || !form.subject) { toast.error('Name, template, list and subject are required.'); return; }
    setBusy(true);
    const row = {
      name: form.name, template_id: form.template_id, list_ids: form.list_ids, subject: form.subject, preview_text: form.preview_text,
      batch_size: Math.min(100, Math.max(1, Number(form.batch_size) || 50)),
      interval_minutes: Math.max(1, Number(form.interval_minutes) || 30),
      daily_cap: form.daily_cap === '' ? null : Math.max(1, Number(form.daily_cap)),
      window_start: form.window_start || null, window_end: form.window_end || null, timezone: form.timezone,
      start_at: form.start_at ? new Date(form.start_at).toISOString() : null,
    };
    const res = form.id
      ? await db.from('marketing_campaigns').update(row).eq('id', form.id).select().single()
      : await db.from('marketing_campaigns').insert({ ...row, created_by: user?.id }).select().single();
    if (res.error) { setBusy(false); toast.error(res.error.message); return; }
    if (start) {
      const { data, error } = await supabase.functions.invoke('marketing-campaign-action', { body: { action: 'start', campaign_id: res.data.id } });
      if (error || data?.error) toast.error(data?.error ?? error?.message);
      else toast.success(`Campaign scheduled for ${data.queued} leads.`);
    } else toast.success('Draft saved');
    setBusy(false); setForm(null); load();
  };

  const setStatus = async (c: any, status: string) => {
    if (status === 'scheduled') {
      const { data, error } = await supabase.functions.invoke('marketing-campaign-action', { body: { action: 'start', campaign_id: c.id } });
      if (error || data?.error) toast.error(data?.error ?? error?.message);
    } else {
      if (status === 'cancelled' && !confirm('Cancel this campaign? Unsent emails will not go out.')) return;
      const { error } = await db.from('marketing_campaigns').update({ status }).eq('id', c.id);
      if (error) toast.error(error.message);
    }
    load();
  };

  const edit = (c: any) => setForm({
    id: c.id, name: c.name, template_id: c.template_id ?? '', list_ids: c.list_ids ?? [], subject: c.subject, preview_text: c.preview_text,
    batch_size: c.batch_size, interval_minutes: c.interval_minutes, daily_cap: c.daily_cap ?? '',
    window_start: c.window_start?.slice(0, 5) ?? '', window_end: c.window_end?.slice(0, 5) ?? '', timezone: c.timezone,
    start_at: c.start_at ? new Date(c.start_at).toISOString().slice(0, 16) : '',
  });

  return (
    <div className="mt-4 space-y-4">
      {canWrite && <Button onClick={() => setForm(empty())}><Plus className="h-4 w-4 mr-1" />New campaign</Button>}
      <div className="grid gap-3">
        {campaigns.map((c) => {
          const n = counts[c.id];
          return (
            <Card key={c.id}>
              <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="text-base truncate">{c.name}</CardTitle>
                  <p className="text-xs text-muted-foreground truncate">{c.subject}</p>
                </div>
                <Badge variant={c.status === 'sending' ? 'default' : 'outline'}>{c.status}</Badge>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {c.batch_size} emails every {c.interval_minutes} min
                  {c.daily_cap ? ` · max ${c.daily_cap}/day` : ''}
                  {c.window_start && c.window_end ? ` · ${c.window_start.slice(0, 5)}–${c.window_end.slice(0, 5)} ${c.timezone}` : ''}
                  {c.start_at ? ` · starts ${new Date(c.start_at).toLocaleString()}` : ''}
                  {n ? ` · ${n.sent}/${n.queued} sent` : ''}
                </p>
                {c.pause_reason && <p className="text-xs text-destructive">{c.pause_reason}</p>}
                {canWrite && (
                  <div className="flex flex-wrap gap-2">
                    {c.status === 'draft' && <Button size="sm" variant="outline" onClick={() => edit(c)}>Edit</Button>}
                    {['scheduled', 'sending'].includes(c.status) && <Button size="sm" variant="outline" onClick={() => setStatus(c, 'paused')}>Pause</Button>}
                    {c.status === 'paused' && <Button size="sm" variant="outline" onClick={() => edit(c)}>Edit pacing</Button>}
                    {c.status === 'paused' && <Button size="sm" onClick={() => setStatus(c, 'scheduled')}>Resume</Button>}
                    {['scheduled', 'sending', 'paused'].includes(c.status) && <Button size="sm" variant="ghost" onClick={() => setStatus(c, 'cancelled')}>Cancel</Button>}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {campaigns.length === 0 && <p className="text-sm text-muted-foreground">No campaigns yet.</p>}
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form?.id ? 'Edit campaign' : 'New campaign'}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid gap-4">
              <div className="space-y-1"><Label className="text-xs">Campaign name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1">
                <Label className="text-xs">Template</Label>
                <Select value={form.template_id} onValueChange={(v) => {
                  const t = templates.find((x) => x.id === v);
                  setForm({ ...form, template_id: v, subject: form.subject || t?.subject || '', preview_text: form.preview_text || t?.preview_text || '' });
                }}>
                  <SelectTrigger><SelectValue placeholder="Choose a template" /></SelectTrigger>
                  <SelectContent>{templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Lists (each lead gets the email once, even if in several lists)</Label>
                <div className="grid gap-2 sm:grid-cols-2 border border-border rounded-md p-3">
                  {lists.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={form.list_ids.includes(l.id)} onCheckedChange={(v) => setForm({ ...form, list_ids: v ? [...form.list_ids, l.id] : form.list_ids.filter((x) => x !== l.id) })} />
                      {l.name} <span className="text-xs text-muted-foreground">({l.marketing_list_members?.[0]?.count ?? 0})</span>
                    </label>
                  ))}
                  {lists.length === 0 && <p className="text-xs text-muted-foreground">Upload a lead list first.</p>}
                </div>
              </div>
              <div className="space-y-1"><Label className="text-xs">Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Preview text</Label><Input value={form.preview_text} onChange={(e) => setForm({ ...form, preview_text: e.target.value })} /></div>

              <div className="border-t border-border pt-4">
                <p className="text-sm font-medium mb-3">Sending pace</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1"><Label className="text-xs">Emails per batch (max 100)</Label><Input type="number" min={1} max={100} value={form.batch_size} onChange={(e) => setForm({ ...form, batch_size: Number(e.target.value) })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Minutes between batches</Label><Input type="number" min={1} value={form.interval_minutes} onChange={(e) => setForm({ ...form, interval_minutes: Number(e.target.value) })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Daily cap (optional)</Label><Input type="number" min={1} value={form.daily_cap} onChange={(e) => setForm({ ...form, daily_cap: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Send from (optional)</Label><Input type="time" value={form.window_start} onChange={(e) => setForm({ ...form, window_start: e.target.value })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Send until</Label><Input type="time" value={form.window_end} onChange={(e) => setForm({ ...form, window_end: e.target.value })} /></div>
                  <div className="space-y-1">
                    <Label className="text-xs">Timezone</Label>
                    <Select value={form.timezone} onValueChange={(v) => setForm({ ...form, timezone: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{TIMEZONES.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 sm:col-span-3"><Label className="text-xs">Start at (optional, your local time)</Label><Input type="datetime-local" value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} className="max-w-xs" /></div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Campaigns auto-pause if bounces pass 5% or spam complaints pass 0.3%.
                </p>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            {form?.id && campaigns.find((c) => c.id === form.id)?.status === 'paused' ? (
              <Button onClick={() => save(false)} disabled={busy}>Save pacing</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => save(false)} disabled={busy}>Save draft</Button>
                <Button onClick={() => save(true)} disabled={busy}>Schedule & send</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
