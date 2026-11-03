import { stickyHeaderTableClass } from "@/components/ui/table";
import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { toast } from 'sonner';
import { Loader2, Play, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';

/**
 * Diamond Outlier Engine panel for the admin Diamond Pool page.
 *
 * Reads only through the SECURITY DEFINER RPCs added by
 * supabase/migrations/20260925090000_diamond_outlier_engine.sql (and the
 * expensive-side fix in 20260925180000_diamond_outlier_dear_side_fix.sql):
 *   get_diamond_outlier_overview, get_diamond_outlier_blocked,
 *   get_diamond_outlier_rep_changes, update_diamond_outlier_config,
 *   trigger_diamond_pipeline.
 */

type Run = {
  id: string; started_at: string; finished_at: string | null; status: string; trigger_source: string | null;
  shadow_mode: boolean | null; pool_rows: number | null; natural_rows: number | null; lab_rows: number | null;
  natural_cheap: number | null; natural_expensive: number | null; natural_emergency: number | null; natural_blocked: number | null;
  lab_cheap: number | null; lab_expensive: number | null; lab_emergency: number | null; lab_blocked: number | null;
  shelves_total: number | null; shelves_fully_blocked: number | null; reps_changed: number | null;
  refresh_mode: string | null; step_timings: Record<string, number> | null; error: string | null;
};
type Overview = {
  config: {
    shadow_mode: boolean; mode: string; dear_mode?: string; cheap_z: number; dear_z: number; spread_floor: number;
    n_target: number; n_min: number; debounce_minutes: number; updated_at: string;
    /** 'allowlist' = engine live only for live_client_ids; 'all' = every client. */
    live_scope?: string; live_client_ids?: string[];
  } | null;
  /** Names of the clients in the allow-list (from 20260928090000_diamond_outlier_client_scope.sql). */
  live_clients?: { id: string; company_name: string }[];
  state: { pending: boolean; status: string; last_pool_change_at: string | null; last_run_started_at: string | null; last_run_finished_at: string | null; last_error: string | null } | null;
  /** Latest batched job (20261026120000_diamond_pipeline_manual_batched.sql). */
  job?: {
    id: string; status: string; phase: string; stone_type: string | null; steps_done: number; rows_done: number;
    cursor_n: number; created_at: string; started_at: string | null; finished_at: string | null;
    next_step_not_before: string | null; last_step_at: string | null; last_step_ms: number | null;
    pool_rows: number | null; natural_rows: number | null; lab_rows: number | null; error: string | null;
    cancel_requested: boolean;
  } | null;
  cron_scheduled?: boolean;
  running: boolean;
  last_run: Run | null;
  runs: Run[];
  pool_rows: number;
  scored_rows: number;
  blocked_by_type: Record<string, number>;
  rep_changes: number;
  shelves_hidden: number;
  /** Shelves where every stone is blocked for any reason (old rule hid all of these). */
  shelves_all_blocked?: number;
  /** Shelves hidden although no stone on them is flagged cheap. Should be 0 after the dear-side fix. */
  shelves_hidden_expensive_only?: number;
};
type BlockedRow = {
  pool_id: string; stone_type: string; shape_id: string; carat_bucket: number; color: string; clarity: string;
  carats: number; raw_price: number; ppc: number; lab: string | null; cut: string | null; flo: string | null; discount: number | null;
  report_no: string | null; video: string | null; pdf: string | null;
  z_model: number; z_rap: number; expected_price: number | null; model_cohort_n: number | null; model_level: string | null;
  rap_rung: number | null; rap_group_n: number | null; rap_group_median_disc: number | null; shelf_n: number | null; shelf_median_ppc: number | null;
  side: string; confidence: string | null; total_count: number;
};
type RepChange = {
  stone_type: string; shape_id: string; carat_bucket: number; color: string; clarity: string; shelf_n: number | null;
  old_pool_id: string | null; old_price: number | null; old_carats: number | null; old_z_model: number | null; old_z_rap: number | null;
  new_pool_id: string | null; new_price: number | null; new_carats: number | null; uplift_pct: number | null; shelf_hidden: boolean; total_count: number;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (name: string, args?: Record<string, unknown>) => (supabase as any).rpc(name, args ?? {});

const pct = (n: number | null | undefined, d: number | null | undefined) =>
  n == null || !d ? '—' : `${((n / d) * 100).toFixed(2)}%`;
const money = (n: number | null | undefined) => (n == null ? '—' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString() : '—');
const PAGE = 50;

export default function DiamondOutlierPanel() {
  const { canWrite, readOnlyMessage } = useAdminAccess();
  const [ov, setOv] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ cheap_z: string; dear_z: string; mode: string; dear_mode: string; spread_floor: string } | null>(null);

  const [blocked, setBlocked] = useState<BlockedRow[]>([]);
  const [bType, setBType] = useState<string>('all');
  const [bSide, setBSide] = useState<string>('all');
  const [bPage, setBPage] = useState(0);
  const [bLoading, setBLoading] = useState(false);

  const [changes, setChanges] = useState<RepChange[]>([]);
  const [cLoading, setCLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await rpc('get_diamond_outlier_overview');
    setLoading(false);
    if (error) { toast.error(`Outlier engine: ${error.message}`); return; }
    const o = data as Overview;
    setOv(o);
    setForm((f) => f ?? (o.config ? {
      cheap_z: String(o.config.cheap_z), dear_z: String(o.config.dear_z), mode: o.config.mode,
      dear_mode: o.config.dear_mode ?? 'agree', spread_floor: String(o.config.spread_floor),
    } : null));
  }, []);

  const loadBlocked = useCallback(async () => {
    setBLoading(true);
    const { data, error } = await rpc('get_diamond_outlier_blocked', {
      p_stone_type: bType === 'all' ? null : bType, p_side: bSide === 'all' ? null : bSide, p_limit: PAGE, p_offset: bPage * PAGE,
    });
    setBLoading(false);
    if (error) { toast.error(error.message); return; }
    setBlocked((data ?? []) as BlockedRow[]);
  }, [bType, bSide, bPage]);

  const loadChanges = useCallback(async () => {
    setCLoading(true);
    const { data, error } = await rpc('get_diamond_outlier_rep_changes', { p_limit: 300, p_offset: 0 });
    setCLoading(false);
    if (error) { toast.error(error.message); return; }
    setChanges((data ?? []) as RepChange[]);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadBlocked(); }, [loadBlocked]);
  useEffect(() => { loadChanges(); }, [loadChanges]);

  // Poll while a run is in progress so the admin sees each step land.
  const busy = !!ov && (ov.running || ov.state?.status === 'running');
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => { load(); }, 15000);
    return () => clearInterval(t);
  }, [busy, load]);
  // The "Run Score Now" card on the Diamond Pool page starts runs too.
  useEffect(() => {
    const onStart = () => { load(); };
    window.addEventListener('diamond-pipeline-started', onStart);
    return () => window.removeEventListener('diamond-pipeline-started', onStart);
  }, [load]);

  const cancelRun = async () => {
    const { error } = await rpc('cancel_diamond_pipeline');
    if (error) { toast.error(error.message); return; }
    toast.info('Cancel requested; the run stops after the current step.');
    load();
  };

  const saveConfig = async (patch: Record<string, unknown>) => {
    setSaving(true);
    const { data, error } = await rpc('update_diamond_outlier_config', { p_patch: patch });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Outlier engine settings saved');
    setOv((o) => (o ? { ...o, config: data } : o));
    load();
  };

  const runNow = async () => {
    const { data, error } = await rpc('trigger_diamond_pipeline');
    if (error) { toast.error(error.message); return; }
    if (data?.started === false && data?.reason === 'fx_pricing_running') toast.info('FX diamond pricing is running. Run Score Now when it finishes.');
    else if (data?.started === false) toast.info('A scoring run is already in progress.');
    else toast.success('Scoring started. It runs in short batches with pauses and stops on its own.');
    load();
  };

  const st = ov?.state; const cfg = ov?.config; const lr = ov?.last_run; const job = ov?.job;
  const jobActive = !!job && (job.status === 'queued' || job.status === 'running');
  const phaseLabel = (p: string, stone: string | null) => {
    const who = stone ? `${stone} stones` : '';
    switch (p) {
      case 'init': return 'starting';
      case 'prep': return `preparing ${who}`;
      case 'shelf': return `shelf medians (${who})`;
      case 'model': return `carat model (${who})`;
      case 'fallback': return `adjacent-grade fit (${who})`;
      case 'rap': return `Rap ladder (${who})`;
      case 'decide': return `scoring ${who}`;
      case 'publish': return 'publishing scores';
      case 'refresh_grade_stats': return 'refreshing grade stats';
      case 'refresh_reps': return 'refreshing representatives';
      case 'refresh_reps_engine': return 'refreshing engine representatives';
      case 'distinct_values': return 'rebuilding filter values';
      case 'availability': return 'rebuilding client availability';
      case 'finalize': return 'finishing';
      default: return p;
    }
  };
  // Who the engine applies to once shadow mode is switched off. Until the
  // scope migration is applied live_scope is undefined, which meant "everyone".
  const scopeNames = (ov?.live_clients ?? []).map((c) => c.company_name);
  const scopeLabel = !cfg?.live_scope || cfg.live_scope === 'all'
    ? 'all client accounts'
    : scopeNames.length > 0 ? `${scopeNames.join(', ')} only` : 'no client account (allow-list is empty)';
  const statusLabel = !st ? '—'
    : ov?.running || st.status === 'running' ? 'running'
    : st.status === 'error' ? 'error'
    : st.pending ? 'new uploads, not scored' : 'idle';
  const statusVariant = statusLabel === 'error' ? 'destructive' : statusLabel === 'idle' ? 'secondary' : 'default';
  const durationS = lr?.step_timings?.total_s;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {cfg?.shadow_mode ? <ShieldAlert className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          Outlier Engine
          <Badge variant={statusVariant} className="ml-2 capitalize">{statusLabel}</Badge>
          {cfg && (
            <Badge variant={cfg.shadow_mode ? 'outline' : 'default'} className="ml-1">
              {cfg.shadow_mode ? 'Shadow mode: flags computed, not applied' : `LIVE for ${scopeLabel}`}
            </Badge>
          )}
          <Button size="icon" variant="ghost" className="ml-auto" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </CardTitle>
        <CardDescription>
          Scores every stone when an admin presses Run Score Now (carat model + Rap ratio; cheap side: either judge blocks,
          expensive side: both must agree; 3x PPC backstop), then refreshes the representatives. The run is sliced into short
          batches with a pause between steps and stops by itself; nothing runs on a schedule. A shelf is hidden only when every
          stone on it is flagged cheap; expensive-only stones stay as a fallback pick. Widget queries only read the stored flag.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ── Current run progress ───────────────────────────────────────── */}
        {job && (jobActive || job.status === 'error') && (
          <div className={`rounded-md border p-3 text-sm ${job.status === 'error' ? 'border-destructive/50 bg-destructive/10' : 'bg-muted/30'}`}>
            <div className="flex flex-wrap items-center gap-2">
              {jobActive && <Loader2 className="h-4 w-4 animate-spin" />}
              <span className="font-medium">
                {job.status === 'error' ? 'Last run failed' : job.status === 'queued' ? 'Starting…' : `Step ${job.steps_done + 1}: ${phaseLabel(job.phase, job.stone_type)}`}
              </span>
              {jobActive && job.rows_done > 0 && <span className="text-muted-foreground">· {job.rows_done.toLocaleString()} rows in this phase</span>}
              {jobActive && job.next_step_not_before && new Date(job.next_step_not_before) > new Date() && (
                <span className="text-muted-foreground">· next step at {new Date(job.next_step_not_before).toLocaleTimeString()}</span>
              )}
              {jobActive && job.cancel_requested && <Badge variant="outline">cancelling</Badge>}
              {jobActive && (
                <Button size="sm" variant="ghost" className="ml-auto" onClick={cancelRun} disabled={!canWrite || job.cancel_requested}>Cancel</Button>
              )}
            </div>
            {job.status === 'error' && job.error && <div className="text-xs mt-1">{job.error}</div>}
            {jobActive && (
              <div className="text-xs text-muted-foreground mt-1">
                Started {when(job.started_at ?? job.created_at)} · {job.steps_done} steps done · last step {job.last_step_ms != null ? `${Math.round(job.last_step_ms / 1000)}s` : '—'}
                {job.natural_rows != null ? ` · natural ${job.natural_rows.toLocaleString()}` : ''}{job.lab_rows != null ? ` · lab ${job.lab_rows.toLocaleString()}` : ''}
              </div>
            )}
          </div>
        )}
        {/* ── Pipeline state ─────────────────────────────────────────────── */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Last pool change</div>
            <div>{when(st?.last_pool_change_at)}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Last scoring run</div>
            <div>{when(lr?.finished_at ?? lr?.started_at)}{durationS != null ? ` · ${Math.round(durationS)}s` : ''}</div>
            {lr?.refresh_mode && lr.refresh_mode !== 'concurrent' && (
              <div className="text-xs text-muted-foreground mt-1">refresh: {lr.refresh_mode}</div>
            )}
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Scored / pool rows</div>
            <div>{ov?.scored_rows?.toLocaleString() ?? '—'} / {ov?.pool_rows?.toLocaleString() ?? '—'}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-xs text-muted-foreground">Representatives that change vs V1</div>
            <div>{ov?.rep_changes ?? '—'} shelves{ov ? ` · ${ov.shelves_hidden} hidden (cheap flag on every stone)` : ''}</div>
            {ov?.shelves_all_blocked != null && (
              <div className="text-xs text-muted-foreground mt-1">
                {ov.shelves_all_blocked} shelves have every stone blocked · {Math.max(0, ov.shelves_all_blocked - ov.shelves_hidden)} kept visible by the expensive-side fallback
                {ov.shelves_hidden_expensive_only ? ` · ${ov.shelves_hidden_expensive_only} hidden with no cheap flag (should be 0)` : ''}
              </div>
            )}
          </div>
        </div>
        {st?.last_error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm">
            Last run failed: {st.last_error}
          </div>
        )}

        {/* ── Per stone type numbers from the last run ───────────────────── */}
        {lr && (
          <Table containerClassName={stickyHeaderTableClass}>
            <TableHeader>
              <TableRow>
                <TableHead>Stone type</TableHead><TableHead>Stones</TableHead>
                <TableHead>Too cheap</TableHead><TableHead>Too expensive</TableHead><TableHead>3x rule only</TableHead>
                <TableHead>Blocked total</TableHead><TableHead>Backtest expectation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Natural</TableCell><TableCell>{lr.natural_rows?.toLocaleString() ?? '—'}</TableCell>
                <TableCell>{lr.natural_cheap ?? '—'} ({pct(lr.natural_cheap, lr.natural_rows)})</TableCell>
                <TableCell>{lr.natural_expensive ?? '—'} ({pct(lr.natural_expensive, lr.natural_rows)})</TableCell>
                <TableCell>{lr.natural_emergency ?? '—'}</TableCell>
                <TableCell>{lr.natural_blocked ?? '—'} ({pct(lr.natural_blocked, lr.natural_rows)})</TableCell>
                <TableCell className="text-muted-foreground">~1.5% cheap · ~2.8% expensive at Z 3.0</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Lab grown</TableCell><TableCell>{lr.lab_rows?.toLocaleString() ?? '—'}</TableCell>
                <TableCell>{lr.lab_cheap ?? '—'} ({pct(lr.lab_cheap, lr.lab_rows)})</TableCell>
                <TableCell>{lr.lab_expensive ?? '—'} ({pct(lr.lab_expensive, lr.lab_rows)})</TableCell>
                <TableCell>{lr.lab_emergency ?? '—'}</TableCell>
                <TableCell>{lr.lab_blocked ?? '—'} ({pct(lr.lab_blocked, lr.lab_rows)})</TableCell>
                <TableCell className="text-muted-foreground">~0.6% cheap · ~6.8% expensive at Z 3.0</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
        {lr?.step_timings && (
          <div className="text-xs text-muted-foreground">
            Step timings (s): {Object.entries(lr.step_timings).map(([k, v]) => `${k}=${v}`).join(' · ')}
          </div>
        )}

        {/* ── Settings ───────────────────────────────────────────────────── */}
        {cfg && form && (
          <div className="rounded-md border p-3 space-y-3">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={cfg.shadow_mode}
                  disabled={!canWrite || saving}
                  onCheckedChange={(v) => saveConfig({ shadow_mode: v })}
                />
                <Label title={!canWrite ? readOnlyMessage : undefined}>
                  Shadow mode {cfg.shadow_mode ? '(on: nothing hidden yet)' : `(off: engine applied to ${scopeLabel})`}
                </Label>
              </div>
              <Button size="sm" variant="outline" onClick={runNow} disabled={!canWrite || busy} title={!canWrite ? readOnlyMessage : undefined}>
                <Play className="h-4 w-4 mr-1" /> Run Score Now
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Live scope: when shadow mode is switched off, the new diamond picks apply to <span className="font-medium text-foreground">{scopeLabel}</span>.
              {cfg.live_scope === 'allowlist' ? ' Every other client account keeps today’s picks.' : ''}
            </p>
            <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3 items-end">
              <div>
                <Label className="text-xs">Cheap side Z (negative)</Label>
                <Input value={form.cheap_z} disabled={!canWrite} onChange={(e) => setForm({ ...form, cheap_z: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Expensive side Z</Label>
                <Input value={form.dear_z} disabled={!canWrite} onChange={(e) => setForm({ ...form, dear_z: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Spread floor (log pts)</Label>
                <Input value={form.spread_floor} disabled={!canWrite} onChange={(e) => setForm({ ...form, spread_floor: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Cheap side rule</Label>
                <Select value={form.mode} onValueChange={(v) => setForm({ ...form, mode: v })} disabled={!canWrite}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="union">Either judge blocks (recommended)</SelectItem>
                    <SelectItem value="agree">Both judges must agree</SelectItem>
                    <SelectItem value="model_only">Carat model only</SelectItem>
                    <SelectItem value="rap_only">Rap only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Expensive side rule</Label>
                <Select value={form.dear_mode} onValueChange={(v) => setForm({ ...form, dear_mode: v })} disabled={!canWrite}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agree">Both judges must agree (recommended)</SelectItem>
                    <SelectItem value="union">Either judge blocks</SelectItem>
                    <SelectItem value="model_only">Carat model only</SelectItem>
                    <SelectItem value="rap_only">Rap only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                disabled={!canWrite || saving}
                onClick={() => saveConfig({
                  cheap_z: -Math.abs(parseFloat(form.cheap_z) || 3.0),
                  dear_z: Math.abs(parseFloat(form.dear_z) || 3.5),
                  spread_floor: Math.max(0, parseFloat(form.spread_floor) || 0.05),
                  mode: form.mode,
                  dear_mode: form.dear_mode,
                })}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save & re-score'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Z 3.0 flags ~1.6% of natural stones as too cheap and lets ~13 of 100 serious cheap errors through; 2.5 flags ~3% / 10 through; 4.0 flags ~0.45% / 22 through.
              The cheap threshold sets where the displayed price lands, so it is a pricing decision.
            </p>
          </div>
        )}

        {/* ── Details ────────────────────────────────────────────────────── */}
        <Tabs defaultValue="changes">
          <TabsList>
            <TabsTrigger value="changes">Representative changes ({ov?.rep_changes ?? 0})</TabsTrigger>
            <TabsTrigger value="blocked">Blocked stones ({Object.values(ov?.blocked_by_type ?? {}).reduce((a, b) => a + b, 0)})</TabsTrigger>
          </TabsList>

          <TabsContent value="changes">
            <p className="text-xs text-muted-foreground mb-2">
              Shelves where the shown stone differs from today's 3x-rule pick. "Hidden" means every stone on the shelf is flagged
              cheap (the shelf disappears instead of showing a suspected wrong price). Stones blocked only as expensive are never
              hidden: they are shown as a fallback when nothing clean is left on the shelf.
            </p>
            {cLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <div className="max-h-96 overflow-auto rounded-md border">
                <Table containerClassName={stickyHeaderTableClass}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Shelf</TableHead><TableHead>Stones</TableHead>
                      <TableHead>Shown today</TableHead><TableHead>Z model / Rap</TableHead>
                      <TableHead>Would show</TableHead><TableHead>Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {changes.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-muted-foreground">No changes recorded yet.</TableCell></TableRow>
                    )}
                    {changes.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="whitespace-nowrap">
                          {r.stone_type} · {r.shape_id} · {Number(r.carat_bucket).toFixed(2)}–{(Number(r.carat_bucket) + 0.49).toFixed(2)} · {r.color} {r.clarity}
                        </TableCell>
                        <TableCell>{r.shelf_n ?? '—'}</TableCell>
                        <TableCell>{money(r.old_price)} · {r.old_carats} ct</TableCell>
                        <TableCell>{r.old_z_model?.toFixed(1)} / {r.old_z_rap?.toFixed(1)}</TableCell>
                        <TableCell>{r.shelf_hidden ? <Badge variant="destructive">hidden</Badge> : `${money(r.new_price)} · ${r.new_carats} ct`}</TableCell>
                        <TableCell>{r.uplift_pct == null ? '—' : `${r.uplift_pct > 0 ? '+' : ''}${r.uplift_pct}%`}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="blocked">
            <div className="flex flex-wrap gap-2 items-center mb-2">
              <Select value={bType} onValueChange={(v) => { setBType(v); setBPage(0); }}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stone types</SelectItem>
                  <SelectItem value="natural">Natural</SelectItem>
                  <SelectItem value="lab">Lab grown</SelectItem>
                </SelectContent>
              </Select>
              <Select value={bSide} onValueChange={(v) => { setBSide(v); setBPage(0); }}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All reasons</SelectItem>
                  <SelectItem value="cheap">Too cheap</SelectItem>
                  <SelectItem value="expensive">Too expensive</SelectItem>
                  <SelectItem value="emergency">3x rule only</SelectItem>
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground ml-auto">
                {blocked[0]?.total_count?.toLocaleString() ?? 0} stones · page {bPage + 1}
              </span>
              <Button size="sm" variant="outline" disabled={bPage === 0 || bLoading} onClick={() => setBPage((p) => p - 1)}>Prev</Button>
              <Button size="sm" variant="outline" disabled={bLoading || blocked.length < PAGE} onClick={() => setBPage((p) => p + 1)}>Next</Button>
            </div>
            {bLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <div className="max-h-[32rem] overflow-auto rounded-md border">
                <Table containerClassName={stickyHeaderTableClass}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stone</TableHead><TableHead>Price</TableHead><TableHead>Expected</TableHead>
                      <TableHead>Z model</TableHead><TableHead>Z Rap</TableHead><TableHead>Cohort</TableHead>
                      <TableHead>Reason</TableHead><TableHead>Links</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blocked.length === 0 && (
                      <TableRow><TableCell colSpan={8} className="text-muted-foreground">Nothing blocked for this filter.</TableCell></TableRow>
                    )}
                    {blocked.map((r) => (
                      <TableRow key={r.pool_id}>
                        <TableCell className="whitespace-nowrap">
                          <div>{r.stone_type} · {r.shape_id} {r.carats} ct · {r.color} {r.clarity}</div>
                          <div className="text-xs text-muted-foreground">{r.lab ?? ''} {r.cut && r.cut !== '-' ? r.cut : ''} {r.flo ?? ''} · disc {r.discount ?? '—'}%</div>
                        </TableCell>
                        <TableCell>{money(r.raw_price)}<div className="text-xs text-muted-foreground">{money(r.ppc)}/ct</div></TableCell>
                        <TableCell>{money(r.expected_price)}</TableCell>
                        <TableCell>{r.z_model.toFixed(1)}<div className="text-xs text-muted-foreground">{r.model_level} · n={r.model_cohort_n ?? 0}</div></TableCell>
                        <TableCell>{r.z_rap.toFixed(1)}<div className="text-xs text-muted-foreground">rung {r.rap_rung ?? 0} · n={r.rap_group_n ?? 0}</div></TableCell>
                        <TableCell>shelf {r.shelf_n}<div className="text-xs text-muted-foreground">med {money(r.shelf_median_ppc)}/ct</div></TableCell>
                        <TableCell>
                          <Badge variant={r.side === 'cheap' ? 'destructive' : 'secondary'}>{r.side}</Badge>
                          <div className="text-xs text-muted-foreground">{r.confidence}</div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          {r.pdf && <a className="underline mr-2" href={r.pdf} target="_blank" rel="noreferrer">cert</a>}
                          {r.video && <a className="underline" href={r.video} target="_blank" rel="noreferrer">video</a>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
