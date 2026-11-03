import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Plug, CheckCircle2, XCircle, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { CRM_FORMS, CRM_FORM_BY_TYPE, questionKeyLabel } from '@/lib/crm-form-registry';
import { canProvision, catalogFor } from '@/lib/crm-field-catalog';


const DTT_CLIENT_ID = 'aeec6491-bd1f-4787-97f9-6a47a2ddc8af';

interface Mapping {
  question_key: string;
  ghl_custom_field_id: string;
  label: string;
}

interface FormConfig {
  enabled: boolean;
  pipeline_id: string;
  stage_id: string;
  opportunity_name_template: string;
  opportunity_status: string;
  value_source: string;
  fixed_value: string;
  create_opportunity: boolean;
  create_note: boolean;
  contact_source: string;
  contact_tags: string;
}

interface GhlPipeline { id: string; name: string; stages: { id: string; name: string }[] }
interface GhlField { id: string; name: string; fieldKey?: string; dataType?: string }

interface Props {
  clientId: string | null | undefined;
}

const defaultConfig = (formType: string): FormConfig => {
  const def = CRM_FORM_BY_TYPE[formType];
  return {
    enabled: false,
    pipeline_id: '',
    stage_id: '',
    opportunity_name_template: def?.defaultOppTemplate || '{customer_name}',
    opportunity_status: 'open',
    value_source: def?.valueColumns[0] || 'none',
    fixed_value: '',
    create_opportunity: true,
    create_note: true,
    contact_source: '',
    contact_tags: '',
  };
};

export function GoHighLevelIntegrationCard({ clientId }: Props) {
  const { role } = useAuth();
  const isDtt = clientId === DTT_CLIENT_ID;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadingPipelines, setLoadingPipelines] = useState(false);
  const [loadingFields, setLoadingFields] = useState(false);
  const [pipelines, setPipelines] = useState<GhlPipeline[]>([]);
  const [ghlFields, setGhlFields] = useState<GhlField[]>([]);
  const [provisioning, setProvisioning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [includeOptional, setIncludeOptional] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);


  // Connection is per client (one CRM MVMNT sub-account), so the token and
  // Location ID live outside the per-form tabs and are shared by all of them.
  const [locationId, setLocationId] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [tokenLast4, setTokenLast4] = useState('');

  const [activeForm, setActiveForm] = useState<string>('diamond');
  const [configs, setConfigs] = useState<Record<string, FormConfig>>({});
  const [mappings, setMappings] = useState<Record<string, Mapping[]>>({});

  useEffect(() => {
    // Skip the fetch entirely when the card will not render (see gate below).
    if (!clientId || (!isDtt && role !== 'agency_admin')) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const [cfgRes, mapRes] = await Promise.all([
        supabase.from('client_ghl_integrations' as any).select('*').eq('client_id', clientId),
        supabase.from('client_ghl_field_mappings' as any).select('*').eq('client_id', clientId).order('display_order'),
      ]);

      const rows = ((cfgRes as any).data || []) as any[];
      const nextConfigs: Record<string, FormConfig> = {};
      for (const f of CRM_FORMS) nextConfigs[f.formType] = defaultConfig(f.formType);
      for (const row of rows) {
        const formType = row.form_type || 'diamond';
        if (!CRM_FORM_BY_TYPE[formType]) continue;
        nextConfigs[formType] = {
          enabled: !!row.enabled,
          pipeline_id: row.pipeline_id || '',
          stage_id: row.stage_id || '',
          opportunity_name_template: row.opportunity_name_template || CRM_FORM_BY_TYPE[formType].defaultOppTemplate,
          opportunity_status: row.opportunity_status || 'open',
          value_source: row.value_source || 'none',
          fixed_value: row.fixed_value != null ? String(row.fixed_value) : '',
          create_opportunity: row.create_opportunity !== false,
          create_note: row.create_note !== false,
          contact_source: row.contact_source || '',
          contact_tags: Array.isArray(row.contact_tags) ? row.contact_tags.join(', ') : '',
        };
      }
      setConfigs(nextConfigs);

      // One connection per client: take the Location ID / token hint from the
      // Diamond row when present, otherwise from whichever row has one.
      const connectionRow =
        rows.find(r => (r.form_type || 'diamond') === 'diamond' && r.location_id) ||
        rows.find(r => r.location_id) ||
        rows[0];
      setLocationId(connectionRow?.location_id || '');
      setTokenLast4(rows.find(r => r.token_last4)?.token_last4 || '');

      const nextMappings: Record<string, Mapping[]> = {};
      for (const f of CRM_FORMS) nextMappings[f.formType] = [];
      for (const row of ((mapRes as any).data || []) as any[]) {
        const formType = row.form_type || 'diamond';
        if (!nextMappings[formType]) nextMappings[formType] = [];
        nextMappings[formType].push({
          question_key: row.question_key,
          ghl_custom_field_id: row.ghl_custom_field_id,
          label: row.label || '',
        });
      }
      setMappings(nextMappings);

      setLoading(false);
    })();
  }, [clientId, isDtt, role]);

  // DTT keeps rendering for every role, exactly as before. For every other
  // client the card is agency-admin only, because connecting requires the
  // admin-gated edge functions (test / metadata / save-credentials).
  if (!isDtt && role !== 'agency_admin') return null;

  const cfg = configs[activeForm] ?? defaultConfig(activeForm);
  const activeDef = CRM_FORM_BY_TYPE[activeForm];
  const activeMappings = mappings[activeForm] ?? [];

  const patchConfig = (patch: Partial<FormConfig>) =>
    setConfigs(c => ({ ...c, [activeForm]: { ...(c[activeForm] ?? defaultConfig(activeForm)), ...patch } }));

  const addMapping = () =>
    setMappings(m => ({
      ...m,
      [activeForm]: [...(m[activeForm] || []), { question_key: activeDef.questionKeys[0], ghl_custom_field_id: '', label: '' }],
    }));
  const removeMapping = (i: number) =>
    setMappings(m => ({ ...m, [activeForm]: (m[activeForm] || []).filter((_, idx) => idx !== i) }));
  const updateMapping = (i: number, patch: Partial<Mapping>) =>
    setMappings(m => ({
      ...m,
      [activeForm]: (m[activeForm] || []).map((row, idx) => (idx === i ? { ...row, ...patch } : row)),
    }));

  const save = async () => {
    if (!clientId) return;
    setSaving(true);
    try {
      const location = locationId.trim() || null;

      const { error: cfgErr } = await supabase
        .from('client_ghl_integrations' as any)
        .upsert({
          client_id: clientId,
          form_type: activeForm,
          enabled: cfg.enabled,
          location_id: location,
          pipeline_id: cfg.pipeline_id.trim() || null,
          stage_id: cfg.stage_id.trim() || null,
          opportunity_name_template: cfg.opportunity_name_template.trim() || activeDef.defaultOppTemplate,
          opportunity_status: cfg.opportunity_status,
          value_source: cfg.value_source,
          fixed_value: cfg.value_source === 'fixed' && cfg.fixed_value ? Number(cfg.fixed_value) : null,
          create_opportunity: cfg.create_opportunity,
          create_note: cfg.create_note,
          contact_source: cfg.contact_source.trim() || null,
          contact_tags: cfg.contact_tags.split(',').map(t => t.trim()).filter(Boolean),
        }, { onConflict: 'client_id,form_type' });
      if (cfgErr) throw cfgErr;

      // The card exposes a single Location ID, so keep every form row pointing
      // at the same sub-account rather than leaving stale ones behind.
      if (location) {
        await supabase
          .from('client_ghl_integrations' as any)
          .update({ location_id: location })
          .eq('client_id', clientId);
      }

      // Replace this form's mappings only — other tabs keep theirs.
      await supabase
        .from('client_ghl_field_mappings' as any)
        .delete()
        .eq('client_id', clientId)
        .eq('form_type', activeForm);
      const rows = activeMappings
        .filter(m => m.question_key && m.ghl_custom_field_id.trim())
        .map((m, i) => ({
          client_id: clientId,
          form_type: activeForm,
          question_key: m.question_key,
          ghl_custom_field_id: m.ghl_custom_field_id.trim(),
          label: m.label?.trim() || null,
          display_order: i,
        }));
      if (rows.length) {
        const { error: mErr } = await supabase.from('client_ghl_field_mappings' as any).insert(rows);
        if (mErr) throw mErr;
      }

      // Token goes through an edge function so the secret is never stored from
      // (or readable by) the browser. Only sent when the admin typed a new one.
      if (tokenInput.trim()) {
        const { data, error: tokErr } = await supabase.functions.invoke('save-ghl-credentials', {
          body: {
            client_id: clientId,
            token: tokenInput.trim(),
            location_id: location || undefined,
          },
        });
        if (tokErr) throw tokErr;
        if (!data?.ok) throw new Error(data?.error || 'Failed to save token');
        setTokenLast4(data.token_last4 || '');
        setTokenInput('');
      }

      toast.success(`${activeDef.label} settings saved`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to save CRM MVMNT settings');
    } finally {
      setSaving(false);
    }
  };

  // Lets the backend pick the right token: an unsaved one the admin just typed,
  // otherwise the one already stored for this client.
  const credentialBody = () => ({
    client_id: clientId,
    ...(tokenInput.trim() ? { token: tokenInput.trim() } : {}),
  });

  const hasCredential = !!tokenInput.trim() || !!tokenLast4 || isDtt;

  const testConnection = async () => {
    if (!locationId.trim()) {
      toast.error('Enter a Location ID first');
      return;
    }
    if (!hasCredential) {
      toast.error('Paste the CRM MVMNT Private Token first');
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('test-ghl-connection', {
        body: { location_id: locationId.trim(), ...credentialBody() },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success('Connection OK', { icon: <CheckCircle2 className="h-4 w-4" /> });
      } else {
        toast.error(`Failed: HTTP ${data?.status ?? '?'} — ${data?.body?.message || data?.error || 'check token & location'}`, {
          icon: <XCircle className="h-4 w-4" />,
        });
      }
    } catch (e: any) {
      toast.error(e?.message || 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const loadPipelines = async () => {
    if (!locationId.trim()) { toast.error('Enter a Location ID first'); return; }
    setLoadingPipelines(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghl-fetch-metadata', {
        body: { location_id: locationId.trim(), resource: 'pipelines', ...credentialBody() },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.raw?.message || data?.error || `HTTP ${data?.status}`);
      setPipelines(data.pipelines || []);
      toast.success(`Loaded ${data.pipelines?.length || 0} pipeline(s)`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load pipelines');
    } finally {
      setLoadingPipelines(false);
    }
  };

  const loadCustomFields = async () => {
    if (!locationId.trim()) { toast.error('Enter a Location ID first'); return; }
    setLoadingFields(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghl-fetch-metadata', {
        body: { location_id: locationId.trim(), resource: 'custom_fields', ...credentialBody() },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.raw?.message || data?.error || `HTTP ${data?.status}`);
      setGhlFields(data.fields || []);
      toast.success(`Loaded ${data.fields?.length || 0} custom field(s)`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load custom fields');
    } finally {
      setLoadingFields(false);
    }
  };

  // ── Auto-provision the JewlX standard custom fields in the CRM ───────────
  const startProvision = async () => {
    if (!clientId) return;
    if (!locationId.trim()) { toast.error('Enter a Location ID first'); return; }
    if (!hasCredential) { toast.error('Paste the CRM MVMNT Private Token first'); return; }
    setProvisioning(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghl-provision-fields', {
        body: {
          location_id: locationId.trim(),
          form_type: activeForm,
          include_optional: includeOptional,
          dry_run: true,
          ...credentialBody(),
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Preview failed');
      setPreview(data);
    } catch (e: any) {
      toast.error(e?.message || 'Could not preview the field setup');
    } finally {
      setProvisioning(false);
    }
  };

  const applyProvision = async () => {
    if (!clientId) return;
    setApplying(true);
    try {
      const { data, error } = await supabase.functions.invoke('ghl-provision-fields', {
        body: {
          location_id: locationId.trim(),
          form_type: activeForm,
          include_optional: includeOptional,
          dry_run: false,
          ...credentialBody(),
        },
      });
      if (error) throw error;
      if (!data?.ok && !data?.plan) throw new Error(data?.error || 'Provisioning failed');

      const s = data.summary || {};
      if (data.warning) toast.warning(data.warning);
      if (data.error) toast.error(data.error);

      // Reflect the NEW mappings in the card without a page reload. Rows the
      // admin already has (mapped or manual) are left untouched and in place;
      // only answers that were just created / newly mapped are appended.
      const rows: Mapping[] = (data.plan || [])
        .filter((p: any) => p.ghl_custom_field_id && !p.error && (p.action === 'created' || p.action === 'reuse'))
        .map((p: any) => ({
          question_key: p.question_key,
          ghl_custom_field_id: p.ghl_custom_field_id,
          label: p.name,
        }));
      setMappings(m => {
        const current = m[activeForm] || [];
        const have = new Set(current.map(r => r.question_key));
        const added = rows.filter(r => !have.has(r.question_key));
        return { ...m, [activeForm]: [...current, ...added] };
      });

      setPreview(null);
      await loadCustomFields().catch(() => {});
      toast.success(
        `Created ${s.created ?? 0}, reused ${s.reused ?? 0}, mapped ${s.mappings_written ?? rows.length}` +
        (s.failed ? ` — ${s.failed} failed` : ''),
      );
    } catch (e: any) {
      toast.error(e?.message || 'Provisioning failed');
    } finally {
      setApplying(false);
    }
  };

  const enabledCount = useMemo(
    () => CRM_FORMS.filter(f => configs[f.formType]?.enabled).length,
    [configs],
  );

  // Catalog answers for this form that have no mapping yet.
  const unmappedCount = useMemo(() => {
    const mappedKeys = new Set(
      (mappings[activeForm] || []).filter(m => m.ghl_custom_field_id?.trim()).map(m => m.question_key),
    );
    return catalogFor(activeForm).filter(d => !d.optional && !mappedKeys.has(d.questionKey)).length;
  }, [mappings, activeForm]);


  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-lg">CRM MVMNT Integration</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-32 w-full" /></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="text-lg flex items-center gap-2">
          <Plug className="h-5 w-5" />
          CRM MVMNT Integration
        </CardTitle>
        <CardDescription>
          Push leads from every JewlX form and from Ring OS straight into this client's CRM MVMNT
          sub-account. Connect the sub-account once below, then enable and map each form on its own tab.
          {enabledCount > 0 && ` ${enabledCount} of ${CRM_FORMS.length} surfaces enabled.`}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6 p-4 sm:p-6 pt-0">
        {/* ── Connection (shared by every form) ───────────────────────────── */}
        <div className="space-y-3">
          <div>
            <Label className="text-base">Connection</Label>
            <p className="text-xs text-muted-foreground">
              One CRM MVMNT sub-account per client — these two values are shared by all the tabs below.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ghl-token">Private Integration Token</Label>
              <Input
                id="ghl-token"
                type="password"
                autoComplete="off"
                value={tokenInput}
                onChange={e => setTokenInput(e.target.value)}
                placeholder={
                  tokenLast4
                    ? `Saved — •••• ${tokenLast4} (paste a new one to replace)`
                    : isDtt
                    ? 'Using the platform token — paste one here to override'
                    : 'pit-xxxxxxxx…'
                }
              />
              <p className="text-xs text-muted-foreground">
                CRM MVMNT → sub-account → Settings → Private Integrations. Scopes needed:
                contacts.readonly, contacts.write, opportunities.readonly, opportunities.write,
                locations/customFields.readonly, locations.readonly. Stored server-side only — it is never sent back to the browser.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ghl-location">Location ID</Label>
              <Input id="ghl-location" value={locationId} onChange={e => setLocationId(e.target.value)} placeholder="loc_xxx" />
              <Button type="button" variant="outline" size="sm" onClick={testConnection} disabled={testing}>
                {testing ? 'Testing…' : 'Test connection'}
              </Button>
            </div>
          </div>
        </div>

        {/* ── Per-form configuration ──────────────────────────────────────── */}
        <Tabs value={activeForm} onValueChange={setActiveForm} className="space-y-4">
          <TabsList className="flex flex-wrap h-auto justify-start gap-1">
            {CRM_FORMS.map(f => (
              <TabsTrigger key={f.formType} value={f.formType} className="text-xs sm:text-sm">
                <span
                  className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                    configs[f.formType]?.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                  }`}
                  aria-hidden
                />
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Only the active tab is rendered, so `cfg` / `activeMappings` below
              always belong to `f`. */}
          {CRM_FORMS.filter(x => x.formType === activeForm).map(f => (
            <TabsContent key={f.formType} value={f.formType} className="space-y-6 mt-0">
              <div className="flex items-start justify-between gap-3 border rounded-md p-3 bg-muted/20">
                <div>
                  <p className="text-sm font-medium">{f.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.description} Source table: <code className="text-xs">{f.table}</code>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Label htmlFor={`ghl-enabled-${f.formType}`} className="text-sm">Enabled</Label>
                  <Switch
                    id={`ghl-enabled-${f.formType}`}
                    checked={cfg.enabled}
                    onCheckedChange={v => patchConfig({ enabled: v })}
                  />
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="ghl-pipeline">Pipeline</Label>
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-xs" onClick={loadPipelines} disabled={loadingPipelines}>
                      {loadingPipelines ? 'Loading…' : 'Load from CRM MVMNT'}
                    </Button>
                  </div>
                  {pipelines.length > 0 ? (
                    <Select value={cfg.pipeline_id} onValueChange={v => patchConfig({ pipeline_id: v, stage_id: '' })}>
                      <SelectTrigger><SelectValue placeholder="Select pipeline" /></SelectTrigger>
                      <SelectContent>
                        {pipelines.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input id="ghl-pipeline" value={cfg.pipeline_id} onChange={e => patchConfig({ pipeline_id: e.target.value })} placeholder="Click 'Load from CRM MVMNT' or paste ID" />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ghl-stage">Pipeline Stage</Label>
                  {(() => {
                    const stages = pipelines.find(p => p.id === cfg.pipeline_id)?.stages || [];
                    return stages.length > 0 ? (
                      <Select value={cfg.stage_id} onValueChange={v => patchConfig({ stage_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                        <SelectContent>
                          {stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input id="ghl-stage" value={cfg.stage_id} onChange={e => patchConfig({ stage_id: e.target.value })} placeholder="Load pipelines first, or paste ID" />
                    );
                  })()}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ghl-opp-name">Opportunity Name Template</Label>
                  <Input id="ghl-opp-name" value={cfg.opportunity_name_template} onChange={e => patchConfig({ opportunity_name_template: e.target.value })} />
                  <p className="text-xs text-muted-foreground">
                    Tokens: {'{customer_name}'}, {'{email}'}, {'{lead_id}'}, or any column on{' '}
                    <code className="text-xs">{f.table}</code>.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Opportunity Status</Label>
                  <Select value={cfg.opportunity_status} onValueChange={v => patchConfig({ opportunity_status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="won">Won</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                      <SelectItem value="abandoned">Abandoned</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Monetary Value Source</Label>
                  <Select value={cfg.value_source} onValueChange={v => patchConfig({ value_source: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {f.valueColumns.map(col => (
                        <SelectItem key={col} value={col}>From {col}</SelectItem>
                      ))}
                      <SelectItem value="fixed">Fixed value</SelectItem>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                  {f.valueColumns.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      This form has no price column — use a fixed value or none.
                    </p>
                  )}
                </div>

                {cfg.value_source === 'fixed' && (
                  <div className="space-y-2">
                    <Label htmlFor="ghl-fixed">Fixed Value</Label>
                    <Input id="ghl-fixed" type="number" value={cfg.fixed_value} onChange={e => patchConfig({ fixed_value: e.target.value })} />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="ghl-source">Contact Source</Label>
                  <Input
                    id="ghl-source"
                    value={cfg.contact_source}
                    onChange={e => patchConfig({ contact_source: e.target.value })}
                    placeholder={f.defaultSource}
                  />
                  <p className="text-xs text-muted-foreground">Shown as the contact's Source in CRM MVMNT.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ghl-tags">Contact Tags</Label>
                  <Input
                    id="ghl-tags"
                    value={cfg.contact_tags}
                    onChange={e => patchConfig({ contact_tags: e.target.value })}
                    placeholder="ring-os, web-lead"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma separated. Added on contact creation — handy for triggering a CRM MVMNT workflow.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-2">
                  <Switch
                    id={`ghl-opp-${f.formType}`}
                    checked={cfg.create_opportunity}
                    onCheckedChange={v => patchConfig({ create_opportunity: v })}
                  />
                  <Label htmlFor={`ghl-opp-${f.formType}`} className="text-sm">Create opportunity</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id={`ghl-note-${f.formType}`}
                    checked={cfg.create_note}
                    onCheckedChange={v => patchConfig({ create_note: v })}
                  />
                  <Label htmlFor={`ghl-note-${f.formType}`} className="text-sm">Attach full submission as a note</Label>
                </div>
              </div>

              {/* ── Field mapping ─────────────────────────────────────────── */}
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <Label className="text-base">Custom Field Mapping</Label>
                    <p className="text-xs text-muted-foreground">
                      Map {f.label} answers to CRM MVMNT custom fields. Name, email and phone are sent as
                      native contact fields already.
                    </p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {canProvision(f.formType) && (
                      <Button type="button" variant="secondary" size="sm" onClick={startProvision} disabled={provisioning}>
                        <Wand2 className="h-4 w-4 mr-1" />
                        {provisioning ? 'Checking…' : 'Auto-create & map fields'}
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="sm" onClick={loadCustomFields} disabled={loadingFields}>
                      {loadingFields ? 'Loading…' : 'Load fields from CRM MVMNT'}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={addMapping}>
                      <Plus className="h-4 w-4 mr-1" /> Add mapping
                    </Button>
                  </div>
                </div>

                {canProvision(f.formType) && unmappedCount > 0 && (
                  <p className="text-xs rounded-md border border-dashed p-3">
                    {unmappedCount} {f.label} answer{unmappedCount === 1 ? ' is' : 's are'} not mapped yet.
                    Use “Auto-create & map fields” to create them in the CRM and map them in one go.
                  </p>
                )}

                {activeMappings.length === 0 && (
                  <p className="text-sm text-muted-foreground border border-dashed rounded-md p-4 text-center">
                    No custom field mappings yet.
                  </p>
                )}


                {activeMappings.map((m, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end border rounded-md p-3">
                    <div className="col-span-12 sm:col-span-4 space-y-1">
                      <Label className="text-xs">Form Question</Label>
                      <Select value={m.question_key} onValueChange={v => updateMapping(i, { question_key: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {f.questionKeys.map(k => (
                            <SelectItem key={k} value={k}>
                              {k.includes('.') ? `${questionKeyLabel(k)} · ${k}` : k}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-12 sm:col-span-4 space-y-1">
                      <Label className="text-xs">CRM MVMNT Custom Field</Label>
                      {ghlFields.length > 0 ? (
                        <Select
                          value={m.ghl_custom_field_id}
                          onValueChange={v => {
                            const field = ghlFields.find(x => x.id === v);
                            updateMapping(i, { ghl_custom_field_id: v, label: m.label || field?.name || '' });
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
                          <SelectContent>
                            {ghlFields.map(field => (
                              <SelectItem key={field.id} value={field.id}>
                                {field.name}{field.dataType ? ` (${field.dataType})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input value={m.ghl_custom_field_id} onChange={e => updateMapping(i, { ghl_custom_field_id: e.target.value })} placeholder="Load fields, or paste ID" />
                      )}
                    </div>
                    <div className="col-span-10 sm:col-span-3 space-y-1">
                      <Label className="text-xs">Label (optional)</Label>
                      <Input value={m.label || ''} onChange={e => updateMapping(i, { label: e.target.value })} />
                    </div>
                    <div className="col-span-2 sm:col-span-1 flex justify-end">
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeMapping(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 justify-end pt-2 border-t">
                <Button type="button" onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : `Save ${f.label} settings`}
                </Button>
              </div>

              {/* Backfill is a DTT + Diamond Form recovery tool (the edge function guards to DTT). */}
              {isDtt && f.formType === 'diamond' && (
                <BackfillSection enabled={cfg.enabled} hasMappings={activeMappings.length > 0} hasLocation={!!locationId.trim()} />
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>

      {/* ── Auto-provision preview ─────────────────────────────────────────── */}
      <Dialog open={!!preview} onOpenChange={o => { if (!o) setPreview(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create &amp; map CRM MVMNT fields</DialogTitle>
            <DialogDescription>
              Nothing has been written yet. This is what will happen in{' '}
              <span className="font-medium">{preview?.location_name || preview?.location_id}</span>.
              New fields are created as Single Line text on the Contact object, inside the{' '}
              “{preview?.folder}” folder.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-3 text-sm">
            <span>To create: <span className="font-medium">{preview?.summary?.create ?? 0}</span></span>
            <span>Reuse existing: <span className="font-medium">{preview?.summary?.reuse ?? 0}</span></span>
            <span>Already mapped: <span className="font-medium">{preview?.summary?.mapped ?? 0}</span></span>
            {!!preview?.summary?.manual && (
              <span>Kept manual: <span className="font-medium">{preview.summary.manual}</span></span>
            )}
          </div>


          <div className="max-h-72 overflow-y-auto border rounded-md divide-y">
            {(preview?.plan || []).map((p: any) => (
              <div key={p.question_key} className="flex items-start justify-between gap-3 p-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {p.question_key} · {`{{contact.${p.field_key}}}`}
                  </div>
                  {p.conflict && (
                    <div className="text-xs text-amber-600">
                      A field named the same already exists with a different key — left untouched.
                    </div>
                  )}
                </div>
                <span className="text-xs shrink-0 rounded border px-2 py-0.5">
                  {p.action === 'create' ? 'Create'
                    : p.action === 'reuse' ? 'Reuse'
                    : p.action === 'manual' ? 'Kept manual'
                    : 'Mapped'}
                </span>

              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="ghl-include-optional"
              checked={includeOptional}
              onCheckedChange={v => { setIncludeOptional(v); setTimeout(startProvision, 0); }}
            />
            <Label htmlFor="ghl-include-optional" className="text-sm">
              Also include optional fields (consent flags)
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setPreview(null)} disabled={applying}>Cancel</Button>
            <Button type="button" onClick={applyProvision} disabled={applying}>
              {applying ? 'Working…' : 'Create & map'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}


interface BackfillResult {
  ok?: boolean;
  dry_run?: boolean;
  batch?: number;
  window_total?: number;
  eligible?: number;
  matched?: number;
  updated?: number;
  tagged?: number;
  no_match?: number;
  no_contact_info?: number;
  errors?: number;
  offset?: number;
  next_offset?: number | null;
  sample_errors?: Array<{ lead_id: string; contact?: string; response?: unknown }>;
  error?: string;
}

interface RunTotals {
  batches: number;
  processed: number;
  matched: number;
  updated: number;
  tagged: number;
  no_match: number;
  no_contact_info: number;
  errors: number;
  sample_errors: Array<{ lead_id: string; contact?: string; response?: unknown }>;
}

const BATCH_PAUSE_MS = 7000; // 7s between batches as agreed
const BATCH_LIMIT = 100;

const isoDaysAgo = (d: number) => {
  const dt = new Date(Date.now() - d * 24 * 60 * 60 * 1000);
  return dt.toISOString().slice(0, 10);
};
const todayIso = () => new Date().toISOString().slice(0, 10);

function BackfillSection({ enabled, hasMappings, hasLocation }: { enabled: boolean; hasMappings: boolean; hasLocation: boolean }) {
  // Default window = last 21 days (typical outage window). User can change.
  const [fromDate, setFromDate] = useState(isoDaysAgo(21));
  const [toDate, setToDate] = useState(todayIso());
  const [dryRun, setDryRun] = useState(true);
  const [singleLeadId, setSingleLeadId] = useState('');
  const [singleRunning, setSingleRunning] = useState(false);
  const [singleResult, setSingleResult] = useState<BackfillResult | null>(null);

  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const pauseRef = useState({ value: false })[0];
  const abortRef = useState({ value: false })[0];
  const [currentBatch, setCurrentBatch] = useState(0);
  const [expectedBatches, setExpectedBatches] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [lastResult, setLastResult] = useState<BackfillResult | null>(null);
  const [totals, setTotals] = useState<RunTotals>({
    batches: 0, processed: 0, matched: 0, updated: 0, tagged: 0,
    no_match: 0, no_contact_info: 0, errors: 0, sample_errors: [],
  });
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const ready = enabled && hasMappings && hasLocation;

  const toBody = (offset: number) => ({
    from: new Date(`${fromDate}T00:00:00.000Z`).toISOString(),
    to: new Date(`${toDate}T23:59:59.999Z`).toISOString(),
    dry_run: dryRun,
    offset,
    limit: BATCH_LIMIT,
  });

  const resetTotals = () => setTotals({
    batches: 0, processed: 0, matched: 0, updated: 0, tagged: 0,
    no_match: 0, no_contact_info: 0, errors: 0, sample_errors: [],
  });

  const accumulate = (r: BackfillResult) => {
    setTotals(t => ({
      batches: t.batches + 1,
      processed: t.processed + (r.batch || 0),
      matched: t.matched + (r.matched || 0),
      updated: t.updated + (r.updated || 0),
      tagged: t.tagged + (r.tagged || 0),
      no_match: t.no_match + (r.no_match || 0),
      no_contact_info: t.no_contact_info + (r.no_contact_info || 0),
      errors: t.errors + (r.errors || 0),
      sample_errors: [...t.sample_errors, ...(r.sample_errors || [])].slice(0, 10),
    }));
  };

  const runBatch = async (offset: number): Promise<BackfillResult | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('backfill-dtt-ghl-leads', {
        body: toBody(offset),
      });
      if (error) throw error;
      return data as BackfillResult;
    } catch (e: any) {
      toast.error(e?.message || 'Batch failed');
      return null;
    }
  };

  const sleep = (ms: number) => new Promise<void>((res) => {
    const start = Date.now();
    const tick = () => {
      if (abortRef.value) return res();
      if (Date.now() - start >= ms) return res();
      setTimeout(tick, 250);
    };
    tick();
  });

  const loopFrom = async (startOffset: number) => {
    let offset: number | null = startOffset;
    let batchNum = Math.floor(startOffset / BATCH_LIMIT);
    try {
      while (offset !== null) {
        if (abortRef.value) { toast.message('Backfill aborted'); break; }
        if (pauseRef.value) { toast.message('Paused after current batch'); break; }
        batchNum += 1;
        setCurrentBatch(batchNum);
        const r = await runBatch(offset);
        if (!r || !r.ok) break;
        setLastResult(r);
        accumulate(r);
        if (batchNum === 1 && r.window_total) {
          setExpectedBatches(Math.max(1, Math.ceil(r.window_total / BATCH_LIMIT)));
        }
        offset = r.next_offset ?? null;
        setNextOffset(offset);
        if (offset === null) {
          toast.success(dryRun ? 'Dry run complete' : 'Backfill complete');
          break;
        }
        await sleep(BATCH_PAUSE_MS);
      }
    } finally {
      setRunning(false);
    }
  };

  const startRun = async () => {
    if (!ready) return;
    abortRef.value = false;
    pauseRef.value = false;
    setPaused(false);
    setRunning(true);
    resetTotals();
    setLastResult(null);
    setCurrentBatch(0);
    setExpectedBatches(0);
    setStartedAt(Date.now());
    await loopFrom(0);
  };

  const pauseRun = () => { pauseRef.value = true; setPaused(true); };
  const resumeRun = async () => {
    if (nextOffset === null) return;
    pauseRef.value = false;
    setPaused(false);
    setRunning(true);
    await loopFrom(nextOffset);
  };
  const abortRun = () => { abortRef.value = true; pauseRef.value = false; setPaused(false); };

  const runSingleLead = async () => {
    const id = singleLeadId.trim();
    if (!id) { toast.error('Paste a lead ID first'); return; }
    setSingleRunning(true);
    setSingleResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-dtt-ghl-leads', {
        body: { lead_ids: [id], dry_run: false, limit: 1, offset: 0 },
      });
      if (error) throw error;
      setSingleResult(data as BackfillResult);
      const d = data as BackfillResult;
      if (d.ok && (d.updated || d.tagged)) toast.success('Lead processed — check CRM MVMNT contact + tag');
      else if (d.ok && d.no_match) toast.error('No matching CRM MVMNT contact (email/phone)');
      else toast.error(d.error || 'Test run failed');
    } catch (e: any) {
      toast.error(e?.message || 'Test failed');
    } finally {
      setSingleRunning(false);
    }
  };

  const elapsed = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  const etaSec = (() => {
    if (!startedAt || totals.batches === 0 || !expectedBatches) return null;
    const perBatch = (Date.now() - startedAt) / totals.batches;
    const remaining = Math.max(0, expectedBatches - totals.batches);
    return Math.round((remaining * perBatch + remaining * BATCH_PAUSE_MS) / 1000);
  })();

  return (
    <div className="space-y-4 pt-4 border-t">
      <div>
        <Label className="text-base">Backfill past leads</Label>
        <p className="text-xs text-muted-foreground">
          Re-push Diamond Form custom fields to CRM MVMNT contacts for leads created during the Pabbly outage, and
          add a <code className="text-xs">backfill-retrigger</code> tag so your CRM MVMNT workflow re-sends the email.
          Runs in batches of {BATCH_LIMIT} with a {BATCH_PAUSE_MS / 1000}s pause between batches to stay under CRM MVMNT rate limits.
        </p>
      </div>

      {/* Single-lead test */}
      <div className="rounded-md border p-3 space-y-2 bg-muted/20">
        <Label className="text-sm">Test on 1 lead first (recommended)</Label>
        <p className="text-xs text-muted-foreground">
          Paste a known affected lead ID. Writes fields + tag for just that one contact so you can verify your CRM MVMNT workflow.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="diamond_form_leads.id (UUID)"
            value={singleLeadId}
            onChange={e => setSingleLeadId(e.target.value)}
          />
          <Button type="button" variant="outline" onClick={runSingleLead} disabled={!ready || singleRunning}>
            {singleRunning ? 'Testing…' : 'Test lead'}
          </Button>
        </div>
        {singleResult && (
          <div className="text-xs space-y-1 pt-1">
            <div>Matched: {singleResult.matched ?? 0} · Updated: {singleResult.updated ?? 0} · Tagged: {singleResult.tagged ?? 0} · No match: {singleResult.no_match ?? 0} · Errors: {singleResult.errors ?? 0}</div>
            {singleResult.sample_errors?.length ? (
              <pre className="bg-background border rounded p-2 overflow-x-auto">{JSON.stringify(singleResult.sample_errors, null, 2)}</pre>
            ) : null}
          </div>
        )}
      </div>

      {/* Date range + dry run */}
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] items-end">
        <div className="space-y-1">
          <Label htmlFor="bf-from" className="text-xs">From (inclusive)</Label>
          <Input id="bf-from" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} max={toDate} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="bf-to" className="text-xs">To (inclusive)</Label>
          <Input id="bf-to" type="date" value={toDate} onChange={e => setToDate(e.target.value)} min={fromDate} max={todayIso()} />
        </div>
        <div className="flex items-center gap-2 h-9">
          <Switch id="bf-dry" checked={dryRun} onCheckedChange={setDryRun} disabled={running} />
          <Label htmlFor="bf-dry" className="text-sm">Dry run</Label>
        </div>
        {!running ? (
          <Button type="button" onClick={startRun} disabled={!ready}>
            {dryRun ? 'Preview window' : 'Run backfill'}
          </Button>
        ) : (
          <div className="flex gap-2">
            {!paused ? (
              <Button type="button" variant="outline" onClick={pauseRun}>Pause</Button>
            ) : (
              <Button type="button" variant="outline" onClick={resumeRun}>Resume</Button>
            )}
            <Button type="button" variant="destructive" onClick={abortRun}>Abort</Button>
          </div>
        )}
      </div>
      {!ready && (
        <p className="text-xs text-muted-foreground">Save an enabled config with Location ID + at least one mapping first.</p>
      )}

      {/* Progress + running totals */}
      {(running || totals.batches > 0) && (
        <div className="text-xs border rounded-md p-3 bg-muted/30 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <strong>Batch {currentBatch}{expectedBatches ? ` of ~${expectedBatches}` : ''}</strong>
              {lastResult?.window_total != null && <> · Window total: {lastResult.window_total}</>}
            </div>
            <div className="text-muted-foreground">
              Elapsed: {elapsed}s {etaSec != null && !paused && running ? `· ETA: ~${etaSec}s` : ''}
              {paused && ' · Paused'}
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div><span className="text-muted-foreground">Processed:</span> {totals.processed}</div>
            <div><span className="text-muted-foreground">Matched:</span> {totals.matched}</div>
            <div><span className="text-muted-foreground">Updated:</span> {totals.updated}</div>
            <div><span className="text-muted-foreground">Tagged:</span> {totals.tagged}</div>
            <div><span className="text-muted-foreground">No match:</span> {totals.no_match}</div>
            <div><span className="text-muted-foreground">No email/phone:</span> {totals.no_contact_info}</div>
            <div><span className="text-muted-foreground">Errors:</span> {totals.errors}</div>
            <div><span className="text-muted-foreground">Next offset:</span> {nextOffset ?? '—'}</div>
          </div>
          {dryRun && <div className="text-amber-600">Dry run — no CRM MVMNT calls were made.</div>}
          {totals.sample_errors.length > 0 && (
            <details className="pt-1">
              <summary className="cursor-pointer text-muted-foreground">Sample errors ({totals.sample_errors.length})</summary>
              <pre className="bg-background border rounded p-2 mt-1 overflow-x-auto">{JSON.stringify(totals.sample_errors, null, 2)}</pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
