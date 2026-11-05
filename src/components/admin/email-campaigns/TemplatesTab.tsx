import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Monitor, Plus, Smartphone, Trash2 } from 'lucide-react';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { buildEmailHtml, extractVariables, leadToVars, personalize, type MarketingBlock } from '@/lib/marketing-email';

const db = supabase as any;
const uid = () => Math.random().toString(36).slice(2, 10);

const NEW_BLOCK: Record<MarketingBlock['type'], () => MarketingBlock> = {
  heading: () => ({ id: uid(), type: 'heading', text: 'Hi {{first_name|there}},' }),
  text: () => ({ id: uid(), type: 'text', text: 'Write your message here.' }),
  image: () => ({ id: uid(), type: 'image', src: 'https://', alt: '' }),
  button: () => ({ id: uid(), type: 'button', label: 'Book a demo', href: 'https://aurezotech.com' }),
  divider: () => ({ id: uid(), type: 'divider' }),
  spacer: () => ({ id: uid(), type: 'spacer', height: 24 }),
};

const blank = () => ({ id: null as string | null, name: 'Untitled template', mode: 'blocks' as 'blocks' | 'html', subject: '', preview_text: '', blocks: [NEW_BLOCK.heading(), NEW_BLOCK.text(), NEW_BLOCK.button()] as MarketingBlock[], html: '' });

export function TemplatesTab() {
  const { canWrite } = useAdminAccess();
  const { user } = useAuth();
  const [templates, setTemplates] = useState<any[]>([]);
  const [draft, setDraft] = useState<ReturnType<typeof blank> | null>(null);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [sampleLead, setSampleLead] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState('');

  const load = async () => {
    const { data } = await db.from('marketing_templates').select('*').order('updated_at', { ascending: false });
    setTemplates(data ?? []);
  };
  useEffect(() => {
    load();
    db.from('marketing_leads').select('*').eq('status', 'subscribed').limit(1).maybeSingle().then(({ data }: any) => setSampleLead(data));
  }, []);
  useEffect(() => { if (user?.email && !testTo) setTestTo(user.email); }, [user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  const previewHtml = useMemo(() => {
    if (!draft) return '';
    const built = buildEmailHtml({ mode: draft.mode, blocks: draft.blocks, html: draft.html, previewText: draft.preview_text });
    const lead = sampleLead ?? { first_name: 'Alex', company: 'Sample Jewelers', city: 'New York', email: 'alex@example.com' };
    return personalize(built, leadToVars(lead, { unsubscribe_url: '#' }));
  }, [draft, sampleLead]);

  const variables = useMemo(() => draft ? extractVariables(JSON.stringify(draft.blocks) + draft.html + draft.subject) : [], [draft]);

  const update = (id: string, patch: Partial<MarketingBlock>) =>
    setDraft((d) => d && { ...d, blocks: d.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as MarketingBlock) : b)) });
  const move = (i: number, dir: -1 | 1) => setDraft((d) => {
    if (!d) return d;
    const b = [...d.blocks]; const j = i + dir;
    if (j < 0 || j >= b.length) return d;
    [b[i], b[j]] = [b[j], b[i]];
    return { ...d, blocks: b };
  });

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    const row = { name: draft.name, mode: draft.mode, subject: draft.subject, preview_text: draft.preview_text, blocks: draft.blocks, html: draft.html };
    const res = draft.id
      ? await db.from('marketing_templates').update(row).eq('id', draft.id).select().single()
      : await db.from('marketing_templates').insert({ ...row, created_by: user?.id }).select().single();
    setSaving(false);
    if (res.error) { toast.error(res.error.message); return; }
    setDraft({ ...draft, id: res.data.id });
    toast.success('Template saved');
    load();
  };

  const sendTest = async () => {
    if (!draft?.id) { toast.error('Save the template first.'); return; }
    const { data, error } = await supabase.functions.invoke('marketing-campaign-action', { body: { action: 'test', template_id: draft.id, to: testTo } });
    if (error || data?.error) toast.error(data?.error ?? error?.message ?? 'Test failed');
    else toast.success(`Test sent to ${testTo}`);
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this template?')) return;
    const { error } = await db.from('marketing_templates').delete().eq('id', id);
    if (error) toast.error(error.message); else { load(); if (draft?.id === id) setDraft(null); }
  };

  if (!draft) {
    return (
      <div className="mt-4 space-y-4">
        {canWrite && <Button onClick={() => setDraft(blank())}><Plus className="h-4 w-4 mr-1" /> New template</Button>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <Card key={t.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setDraft({ id: t.id, name: t.name, mode: t.mode, subject: t.subject, preview_text: t.preview_text, blocks: t.blocks ?? [], html: t.html ?? '' })}>
              <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                <CardTitle className="text-sm">{t.name}</CardTitle>
                {canWrite && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); remove(t.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">{t.subject || 'No subject'} · {t.mode === 'html' ? 'HTML' : 'Blocks'}</CardContent>
            </Card>
          ))}
          {templates.length === 0 && <p className="text-sm text-muted-foreground">No templates yet.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>Back</Button>
          <div className="flex-1" />
          {canWrite && <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save template'}</Button>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label className="text-xs">Template name</Label><Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
          <div className="space-y-1">
            <Label className="text-xs">Editor</Label>
            <Select value={draft.mode} onValueChange={(v: any) => setDraft({ ...draft, mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="blocks">Block builder</SelectItem><SelectItem value="html">HTML</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Default subject</Label><Input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="{{first_name|Hi}}, a faster way to sell custom rings" /></div>
          <div className="space-y-1 sm:col-span-2"><Label className="text-xs">Preview text (shown after the subject in the inbox)</Label><Input value={draft.preview_text} onChange={(e) => setDraft({ ...draft, preview_text: e.target.value })} /></div>
        </div>

        {draft.mode === 'html' ? (
          <div className="space-y-1">
            <Label className="text-xs">HTML body (an unsubscribe footer is added automatically)</Label>
            <Textarea value={draft.html} onChange={(e) => setDraft({ ...draft, html: e.target.value })} className="font-mono text-xs min-h-[420px]" />
          </div>
        ) : (
          <div className="space-y-2">
            {draft.blocks.map((b, i) => (
              <div key={b.id} className="border border-border rounded-md p-3 space-y-2">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-medium uppercase text-muted-foreground flex-1">{b.type}</span>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(i, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDraft({ ...draft, blocks: draft.blocks.filter((x) => x.id !== b.id) })}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
                {b.type === 'heading' && <Input value={b.text} onChange={(e) => update(b.id, { text: e.target.value })} />}
                {b.type === 'text' && <Textarea value={b.text} onChange={(e) => update(b.id, { text: e.target.value })} rows={4} />}
                {(b.type === 'heading' || b.type === 'text') && (
                  <Select value={b.align ?? 'left'} onValueChange={(v: any) => update(b.id, { align: v })}>
                    <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="left">Left</SelectItem><SelectItem value="center">Center</SelectItem></SelectContent>
                  </Select>
                )}
                {b.type === 'image' && (
                  <div className="grid gap-2">
                    <Input placeholder="Image URL (https://…)" value={b.src} onChange={(e) => update(b.id, { src: e.target.value })} />
                    <Input placeholder="Alt text" value={b.alt ?? ''} onChange={(e) => update(b.id, { alt: e.target.value })} />
                    <Input placeholder="Link (optional)" value={b.href ?? ''} onChange={(e) => update(b.id, { href: e.target.value })} />
                  </div>
                )}
                {b.type === 'button' && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input placeholder="Label" value={b.label} onChange={(e) => update(b.id, { label: e.target.value })} />
                    <Input placeholder="https://" value={b.href} onChange={(e) => update(b.id, { href: e.target.value })} />
                  </div>
                )}
                {b.type === 'spacer' && <Input type="number" min={4} max={120} value={b.height ?? 24} onChange={(e) => update(b.id, { height: Number(e.target.value) })} className="w-24" />}
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              {(Object.keys(NEW_BLOCK) as MarketingBlock['type'][]).map((t) => (
                <Button key={t} size="sm" variant="outline" onClick={() => setDraft({ ...draft, blocks: [...draft.blocks, NEW_BLOCK[t]()] })}>
                  <Plus className="h-3 w-3 mr-1" />{t}
                </Button>
              ))}
            </div>
          </div>
        )}
        {variables.length > 0 && <p className="text-xs text-muted-foreground">Variables used: {variables.join(', ')}</p>}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant={device === 'desktop' ? 'default' : 'outline'} onClick={() => setDevice('desktop')}><Monitor className="h-4 w-4 mr-1" />Desktop</Button>
          <Button size="sm" variant={device === 'mobile' ? 'default' : 'outline'} onClick={() => setDevice('mobile')}><Smartphone className="h-4 w-4 mr-1" />Mobile</Button>
          <span className="text-xs text-muted-foreground ml-auto">Preview uses {sampleLead ? sampleLead.email : 'sample data'}</span>
        </div>
        <div className="border border-border rounded-lg bg-muted/30 p-3 flex justify-center">
          <iframe title="Email preview" srcDoc={previewHtml} sandbox="" className="bg-card rounded" style={{ width: device === 'mobile' ? 375 : '100%', height: 640, border: 0 }} />
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@aurezotech.com" />
            <Button variant="outline" onClick={sendTest}>Send test</Button>
          </div>
        )}
      </div>
    </div>
  );
}
