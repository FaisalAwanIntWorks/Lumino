import { stickyHeaderTableClass } from "@/components/ui/table";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAdminAccess } from '@/hooks/useAdminAccess';
import { toast } from 'sonner';
import { AlertTriangle, Banknote, CheckCircle2, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { bufferInRange, convertPrice, effectiveRate, rateInRange, rateMove } from '@/lib/diamond-fx';

/**
 * Diamond Currency Pricing (FX) panel for the admin Diamond Pool page.
 *
 * Spec: diamondcurrencyimplemenation/Nivoda_Manual_FX_Sync_Implementation_FINAL.md
 * Backend: migration 20261028120000_sandbox_ring_os_currency_fx_pricing.sql +
 * edge function diamond-fx-sync-rates.
 *
 * Nothing here runs by itself: Sync Rates only fills the inputs, and diamonds
 * are priced only after Apply + confirmation. GBP / CAD prices are shown in
 * Ring OS for the Sandbox account only.
 */

type Version = {
  id: number; status: string;
  usd_to_gbp: number; usd_to_cad: number; gbp_buffer_pct: number; cad_buffer_pct: number;
  gbp_effective_rate: number; cad_effective_rate: number;
  rate_source: 'api' | 'api_edited' | 'manual'; api_fetched_at: string | null; approval_note: string | null;
  requested_at: string; published_at: string | null; finished_at: string | null;
  expected_count: number; scanned_count: number; processed_count: number; skipped_count: number;
  verified_count: number | null; steps_done: number; cancel_requested: boolean; error_summary: string | null;
};
type Fetch = { id: number; provider: string; usd_to_gbp: number; usd_to_cad: number; provider_timestamp: string | null; fetched_at: string };
type Overview = {
  active: Version | null; job: Version | null; versions: Version[]; last_fetch: Fetch | null;
  cron_scheduled: boolean; scoring_running?: boolean; pool_usd_rows: number; pool_last_import_at: string | null;
};
type SyncResult = { fetch_id: number; quotes: { GBP: string; CAD: string }; source: string; provider_timestamp: string | null; fetched_at: string };

const rpc = (name: string, args?: Record<string, unknown>) => (supabase as any).rpc(name, args ?? {});

const SOURCE_LABEL: Record<Version['rate_source'], string> = { api: 'API', api_edited: 'API (edited)', manual: 'Manual' };
const fmtDate = (s: string | null | undefined) => (s ? new Date(s).toLocaleString() : '—');
const money = (amount: string | null, symbol: string) =>
  amount == null ? '—' : `${symbol}${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function DiamondFxPricingPanel() {
  const { canWrite, readOnlyMessage } = useAdminAccess();
  const [ov, setOv] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [fetched, setFetched] = useState<SyncResult | null>(null);
  const [gbp, setGbp] = useState('');
  const [cad, setCad] = useState('');
  const [gbpBuffer, setGbpBuffer] = useState('2.00');
  const [cadBuffer, setCadBuffer] = useState('2.00');
  const [note, setNote] = useState('');
  const [sampleUsd, setSampleUsd] = useState('1350.00');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await rpc('get_diamond_fx_overview');
    setLoading(false);
    if (error) {
      toast.error(`FX overview failed: ${error.message}`);
      return;
    }
    setOv(data as Overview);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll only while an FX run or a scoring run is in progress (scoring blocks Apply).
  const jobActive = !!ov?.job;
  const scoringRunning = !!ov?.scoring_running;
  useEffect(() => {
    if (!jobActive && !scoringRunning) return;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [jobActive, scoringRunning, load]);

  const syncRates = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke('diamond-fx-sync-rates', { body: {} });
    setSyncing(false);
    const errMsg = error ? ((data as any)?.error || error.message) : (data as any)?.error;
    if (errMsg) {
      toast.error(`Sync Rates failed: ${errMsg}`);
      return;
    }
    const r = data as SyncResult;
    setFetched(r);
    setGbp(r.quotes.GBP);
    setCad(r.quotes.CAD);
    toast.success('Rates fetched. Review them, then Apply. No prices were changed.');
  };

  const isEdited = !fetched || gbp.trim() !== fetched.quotes.GBP || cad.trim() !== fetched.quotes.CAD;
  const source: Version['rate_source'] = !fetched ? 'manual' : isEdited ? 'api_edited' : 'api';
  const gbpEff = effectiveRate(gbp, gbpBuffer);
  const cadEff = effectiveRate(cad, cadBuffer);
  const move = useMemo(() => {
    if (!ov?.active) return null;
    const a = rateMove(gbp, ov.active.usd_to_gbp);
    const b = rateMove(cad, ov.active.usd_to_cad);
    if (a == null || b == null) return null;
    return Math.max(a, b);
  }, [gbp, cad, ov?.active]);
  const bigMove = move != null && move > 0.03;
  const noteRequired = source !== 'api' || bigMove;

  const errors: string[] = [];
  if (gbp && !rateInRange('GBP', gbp)) errors.push('GBP rate must be 0.40 – 1.20 GBP per 1 USD.');
  if (cad && !rateInRange('CAD', cad)) errors.push('CAD rate must be 1.00 – 2.00 CAD per 1 USD.');
  if (!bufferInRange(gbpBuffer) || !bufferInRange(cadBuffer)) errors.push('Buffers must be 0 – 25 %.');
  const canApply = canWrite && !jobActive && !scoringRunning && !applying && !!gbp && !!cad && errors.length === 0
    && !!gbpEff && !!cadEff && (!noteRequired || note.trim().length > 0);

  const apply = async () => {
    setConfirmOpen(false);
    setApplying(true);
    const { data, error } = await rpc('apply_diamond_fx_rates', {
      p_usd_to_gbp: gbp.trim(),
      p_usd_to_cad: cad.trim(),
      p_gbp_buffer_pct: gbpBuffer.trim(),
      p_cad_buffer_pct: cadBuffer.trim(),
      p_fetch_id: fetched?.fetch_id ?? null,
      p_note: note.trim() || null,
      p_idempotency_key: crypto.randomUUID(),
      p_confirm: true,
    });
    setApplying(false);
    if (error) {
      toast.error(`Apply failed: ${error.message}`);
      return;
    }
    if ((data as any)?.started) {
      toast.success('Pricing run started. Prices go live only after every diamond is priced and verified.');
      setNote('');
    } else {
      toast.info('That request was already submitted.');
    }
    load();
  };

  const cancelJob = async () => {
    const { error } = await rpc('cancel_diamond_fx_job');
    if (error) toast.error(`Cancel failed: ${error.message}`);
    else toast.success('Cancel requested. The published prices stay as they are.');
    load();
  };

  const job = ov?.job ?? null;
  const active = ov?.active ?? null;
  const poolChangedSincePublish = !!(active?.published_at && ov?.pool_last_import_at
    && new Date(ov.pool_last_import_at) > new Date(active.published_at));
  const jobPct = job && job.expected_count > 0
    ? Math.min(100, Math.round((job.processed_count / job.expected_count) * 100))
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Banknote className="h-5 w-5" /> Currency Pricing (GBP / CAD)</CardTitle>
        <CardDescription>
          Diamond sheets are priced in USD. Fetch the rates, review or edit them, then Apply: every USD diamond gets a
          stored GBP and CAD price, and the new prices go live together only after the whole run is verified. Nothing
          runs on upload and nothing is scheduled. Ring OS shows these prices for the Sandbox account only.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Published version */}
        <div className="rounded-md border border-border p-3 text-sm space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">Published pricing version:</span>
            {active ? (
              <>
                <Badge>FX-{String(active.id).padStart(5, '0')}</Badge>
                <span className="text-muted-foreground">
                  1 USD = {Number(active.usd_to_gbp)} GBP (+{Number(active.gbp_buffer_pct)}%) · {Number(active.usd_to_cad)} CAD (+{Number(active.cad_buffer_pct)}%)
                  · {SOURCE_LABEL[active.rate_source]} · published {fmtDate(active.published_at)}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">none yet — GBP / CAD catalogues show no diamonds until the first Apply.</span>
            )}
          </div>
          <div className="text-muted-foreground">
            USD diamonds in the pool: {(ov?.pool_usd_rows ?? 0).toLocaleString()} · last upload {fmtDate(ov?.pool_last_import_at)}
          </div>
          {poolChangedSincePublish && (
            <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>A new upload happened after the last publish. Stones that are new or re-uploaded have no GBP / CAD price yet and are hidden in GBP / CAD catalogues until you Apply again.</span>
            </div>
          )}
        </div>

        {/* Running job */}
        {job && (
          <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-medium">
                <Loader2 className="h-4 w-4 animate-spin" />
                Run FX-{String(job.id).padStart(5, '0')}: {job.status === 'verifying' ? 'verifying before publish' : 'pricing diamonds'}
                {job.cancel_requested && ' (cancelling)'}
              </span>
              <Button size="sm" variant="outline" onClick={cancelJob} disabled={!canWrite || job.cancel_requested} title={!canWrite ? readOnlyMessage : undefined}>
                <XCircle className="h-4 w-4 mr-1" /> Cancel
              </Button>
            </div>
            <Progress value={jobPct} />
            <div className="text-muted-foreground">
              {job.processed_count.toLocaleString()} of {job.expected_count.toLocaleString()} priced · {job.skipped_count.toLocaleString()} skipped (non-USD or no price) ·
              {' '}batch {job.steps_done} · one batch per minute
              {!ov?.cron_scheduled && ' · worker not scheduled — press Refresh, or Apply again if this persists'}
            </div>
          </div>
        )}

        {/* Rates form */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={syncRates} disabled={!canWrite || syncing} title={!canWrite ? readOnlyMessage : undefined}>
              {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sync Rates
            </Button>
            <span className="text-xs text-muted-foreground">
              {fetched
                ? `Fetched from ${fetched.source} · rate time ${fmtDate(fetched.provider_timestamp)} · fetched ${fmtDate(fetched.fetched_at)}. Suggested only — no prices changed.`
                : 'Fetches USD → GBP and USD → CAD now. It only fills the boxes below; you can also type rates by hand.'}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <Label>USD → GBP (GBP per 1 USD)</Label>
                {gbp && <Badge variant={fetched && gbp.trim() === fetched.quotes.GBP ? 'secondary' : 'outline'}>{fetched && gbp.trim() === fetched.quotes.GBP ? 'API' : 'Manual'}</Badge>}
              </div>
              <Input inputMode="decimal" value={gbp} onChange={(e) => setGbp(e.target.value)} placeholder="0.7450" />
              <Label className="text-xs text-muted-foreground">GBP buffer (%)</Label>
              <Input inputMode="decimal" value={gbpBuffer} onChange={(e) => setGbpBuffer(e.target.value)} />
              <p className="text-xs text-muted-foreground">Effective rate: {gbpEff ?? '—'}</p>
            </div>
            <div className="space-y-2 rounded-md border border-border p-3">
              <div className="flex items-center justify-between">
                <Label>USD → CAD (CAD per 1 USD)</Label>
                {cad && <Badge variant={fetched && cad.trim() === fetched.quotes.CAD ? 'secondary' : 'outline'}>{fetched && cad.trim() === fetched.quotes.CAD ? 'API' : 'Manual'}</Badge>}
              </div>
              <Input inputMode="decimal" value={cad} onChange={(e) => setCad(e.target.value)} placeholder="1.4015" />
              <Label className="text-xs text-muted-foreground">CAD buffer (%)</Label>
              <Input inputMode="decimal" value={cadBuffer} onChange={(e) => setCadBuffer(e.target.value)} />
              <p className="text-xs text-muted-foreground">Effective rate: {cadEff ?? '—'}</p>
            </div>
          </div>

          <div className="rounded-md border border-border p-3 text-sm space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Label className="shrink-0">Preview for a USD diamond price of $</Label>
              <Input className="h-8 w-32" inputMode="decimal" value={sampleUsd} onChange={(e) => setSampleUsd(e.target.value)} />
            </div>
            <div className="text-muted-foreground">
              GBP {money(gbpEff ? convertPrice(sampleUsd, gbpEff) : null, '£')} · CAD {money(cadEff ? convertPrice(sampleUsd, cadEff) : null, 'C$')}
              {' '}(rounded half-up to 2 decimals, before each client's markup — markup is a percentage, so it is applied once, on top)
            </div>
          </div>

          {bigMove && (
            <div className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>These rates are {(move! * 100).toFixed(1)}% away from the published version. Add a note to confirm.</span>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">
              Note {noteRequired ? '(required: rates typed / edited, or a big move)' : '(optional)'}
            </Label>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why these rates (kept in the audit history)" />
          </div>

          {errors.length > 0 && (
            <ul className="text-sm text-destructive list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setConfirmOpen(true)} disabled={!canApply} title={!canWrite ? readOnlyMessage : undefined}>
              {applying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Apply Rates &amp; Generate Prices
            </Button>
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />} Refresh
            </Button>
            {jobActive && <span className="text-xs text-muted-foreground">A run is in progress; Apply is available when it finishes.</span>}
            {!jobActive && scoringRunning && <span className="text-xs text-muted-foreground">Diamond scoring is running; Apply is available when it finishes.</span>}
          </div>
        </div>

        {/* History */}
        {(ov?.versions?.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <Table containerClassName={stickyHeaderTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>GBP (buffer)</TableHead>
                  <TableHead>CAD (buffer)</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Priced</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Note / error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ov!.versions.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>FX-{String(v.id).padStart(5, '0')}</TableCell>
                    <TableCell>
                      <Badge variant={v.status === 'published' ? 'default' : v.status === 'failed' ? 'destructive' : 'secondary'}>{v.status}</Badge>
                    </TableCell>
                    <TableCell>{Number(v.usd_to_gbp)} (+{Number(v.gbp_buffer_pct)}%)</TableCell>
                    <TableCell>{Number(v.usd_to_cad)} (+{Number(v.cad_buffer_pct)}%)</TableCell>
                    <TableCell>{SOURCE_LABEL[v.rate_source]}</TableCell>
                    <TableCell>{v.processed_count.toLocaleString()} / {v.expected_count.toLocaleString()}</TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(v.requested_at)}</TableCell>
                    <TableCell className="max-w-[320px] text-xs">{v.error_summary || v.approval_note || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply these rates to {(ov?.pool_usd_rows ?? 0).toLocaleString()} diamonds?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <p>1 USD = {gbp} GBP + {gbpBuffer}% → effective {gbpEff}</p>
                <p>1 USD = {cad} CAD + {cadBuffer}% → effective {cadEff}</p>
                <p>Source: {SOURCE_LABEL[source]}</p>
                <p>Diamonds are priced in batches (about one minute per 200,000). The current prices stay live until the whole run is verified, then all new prices go live together.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={apply}>Apply</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
