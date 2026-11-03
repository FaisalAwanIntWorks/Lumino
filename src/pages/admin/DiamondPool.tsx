import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, Database, CheckCircle2, AlertCircle, Loader2, Gem, RefreshCw, Play } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import DiamondOutlierPanel from '@/components/admin/DiamondOutlierPanel';
import DiamondFxPricingPanel from '@/components/admin/DiamondFxPricingPanel';

// CSV header -> DB column
const COLUMN_MAP: Record<string, string> = {
  ID: 'external_id',
  stockId: 'stock_id',
  ReportNo: 'report_no',
  diamondId: 'diamond_id',
  shape: 'shape',
  carats: 'carats',
  col: 'col',
  clar: 'clar',
  cut: 'cut',
  pol: 'pol',
  symm: 'symm',
  flo: 'flo',
  floCol: 'flo_col',
  length: 'length',
  width: 'width',
  height: 'height',
  depth: 'depth',
  table: 'table',
  culet: 'culet',
  lab: 'lab',
  girdle: 'girdle',
  eyeClean: 'eye_clean',
  brown: 'brown',
  green: 'green',
  milky: 'milky',
  discount: 'discount',
  price: 'price',
  pricePerCarat: 'price_per_carat',
  video: 'video',
  image: 'image',
  pdf: 'pdf',
  mineOfOrigin: 'mine_of_origin',
  canadaMarkEligible: 'canada_mark_eligible',
  isReturnable: 'is_returnable',
  lg: 'lg',
  markupPrice: 'markup_price',
  markupCurrency: 'markup_currency',
  deliveredPrice: 'delivered_price',
  minDeliveryDays: 'min_delivery_days',
  maxDeliveryDays: 'max_delivery_days',
  videosImageUri: 'videos_image_uri',
  videosFrame: 'videos_frame',
  country: 'country',
  labgrownType: 'labgrown_type',
};

const NUMERIC_COLS = new Set([
  'carats', 'flo_col', 'length', 'width', 'height', 'depth', 'table',
  'discount', 'price', 'price_per_carat', 'markup_price', 'delivered_price',
]);
const INT_COLS = new Set(['min_delivery_days', 'max_delivery_days', 'videos_frame']);
const BOOL_COLS = new Set(['brown', 'green', 'milky', 'canada_mark_eligible', 'is_returnable']);

const BATCH_SIZE = 500;

function parseCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; }
      else q = !q;
    } else if (c === ',' && !q) {
      out.push(cur); cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function coerce(value: string, dbCol: string): unknown {
  const v = value?.trim();
  if (v === '' || v == null || v.toLowerCase() === 'null' || v.toLowerCase() === 'nan') return null;
  if (BOOL_COLS.has(dbCol)) {
    const lv = v.toLowerCase();
    if (['true', '1', 'yes', 'y', 't'].includes(lv)) return true;
    if (['false', '0', 'no', 'n', 'f'].includes(lv)) return false;
    return null;
  }
  if (INT_COLS.has(dbCol)) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  if (NUMERIC_COLS.has(dbCol)) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return v;
}

type ImportMode = 'replace' | 'append';

export default function DiamondPool() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [currentCount, setCurrentCount] = useState<number | null>(null);
  const [lastImport, setLastImport] = useState<string | null>(null);
  const [stats, setStats] = useState<{ total: number; inserted: number; errors: number } | null>(null);
  const [mode, setMode] = useState<ImportMode>('replace');
  const fileRef = useRef<HTMLInputElement>(null);

  const log = (m: string) => setLogs((p) => [...p.slice(-200), `[${new Date().toLocaleTimeString()}] ${m}`]);

  const refreshCount = async () => {
    const { count } = await supabase.from('diamond_inventory_pool').select('id', { count: 'exact', head: true });
    setCurrentCount(count ?? 0);
    const { data } = await supabase.from('diamond_inventory_pool').select('imported_at').order('imported_at', { ascending: false }).limit(1);
    setLastImport(data?.[0]?.imported_at ?? null);
  };

  useEffect(() => { refreshCount(); }, []);

  // Manual scoring: the only way the outlier engine runs (no cron).
  const [scoring, setScoring] = useState(false);
  const [needsScoring, setNeedsScoring] = useState(false);
  useEffect(() => {
    // "pending" is set by the pool upload trigger and cleared when a run finishes.
    supabase.from('diamond_pipeline_state').select('pending').eq('id', 1).maybeSingle()
      .then(({ data }) => { if (data?.pending) setNeedsScoring(true); });
  }, []);
  const runScoreNow = async () => {
    setScoring(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('trigger_diamond_pipeline');
    setScoring(false);
    if (error) { toast.error(`Could not start scoring: ${error.message}`); return; }
    if (data?.started === false) {
      toast.info('A scoring run is already in progress; see the Outlier Engine card for its progress.');
    } else {
      toast.success('Scoring started. It runs in short batches with pauses and stops on its own; progress is shown in the Outlier Engine card.');
    }
    setNeedsScoring(false);
    window.dispatchEvent(new CustomEvent('diamond-pipeline-started'));
  };

  const handleFile = async (file: File) => {
    const currentMode = mode;
    setLoading(true);
    setProgress(0);
    setLogs([]);
    setStats(null);
    const batchId = crypto.randomUUID();
    log(`Mode: ${currentMode === 'append' ? 'APPEND to existing records' : 'REPLACE existing pool'}`);
    log(`Batch ID: ${batchId}`);
    log(`Reading ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)...`);

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
      if (lines.length < 2) throw new Error('CSV is empty');

      const headers = parseCSVLine(lines[0]);
      const dbCols = headers.map((h) => COLUMN_MAP[h.trim()] || null);
      const unknownHeaders = headers.filter((h) => !COLUMN_MAP[h.trim()]);
      if (unknownHeaders.length) log(`Ignoring unknown columns: ${unknownHeaders.join(', ')}`);

      const total = lines.length - 1;

      const targetTable = currentMode === 'append' ? 'diamond_inventory_pool' : 'diamond_inventory_pool_staging';

      if (currentMode === 'replace') {
        log(`Parsed ${total} rows. Clearing staging table...`);
        const { error: delErr } = await supabase
          .from('diamond_inventory_pool_staging')
          .delete()
          .not('id', 'is', null);
        if (delErr) log(`Staging clear warning: ${delErr.message}`);
        log(`Uploading to staging in batches of ${BATCH_SIZE}...`);
      } else {
        log(`Parsed ${total} rows. Appending directly to live pool in batches of ${BATCH_SIZE}...`);
      }

      let inserted = 0;
      let errors = 0;

      for (let i = 1; i < lines.length; i += BATCH_SIZE) {
        const chunk = lines.slice(i, i + BATCH_SIZE);
        const rows = chunk.map((line) => {
          const vals = parseCSVLine(line);
          const obj: Record<string, unknown> = { import_batch_id: batchId };
          for (let c = 0; c < dbCols.length; c++) {
            const col = dbCols[c];
            if (!col) continue;
            obj[col] = coerce(vals[c] ?? '', col);
          }
          return obj;
        });

        const { error } = await supabase.from(targetTable).insert(rows as never);
        if (error) {
          errors += rows.length;
          log(`Batch error at row ${i}: ${error.message}`);
        } else {
          inserted += rows.length;
        }
        const done = Math.min(i - 1 + BATCH_SIZE, total);
        setProgress(Math.round((done / total) * (currentMode === 'append' ? 100 : 90)));
      }

      if (currentMode === 'replace') {
        log(`Staging upload complete: ${inserted} inserted, ${errors} errors.`);
        log('Performing atomic swap into live table...');
        setProgress(95);

        const { data: swapData, error: swapErr } = await supabase.rpc('swap_diamond_inventory_pool', { p_batch_id: batchId });
        if (swapErr) {
          throw new Error(`${swapErr.message}${swapErr.details ? ` — ${swapErr.details}` : ''}${swapErr.hint ? ` (${swapErr.hint})` : ''}`);
        }

        log(`Swap complete: ${JSON.stringify(swapData)}`);
      } else {
        log(`Append complete: ${inserted} new rows added to live pool.`);
      }

      setProgress(100);
      setStats({ total, inserted, errors });
      toast.success(
        currentMode === 'append'
          ? `Appended ${inserted} diamonds to existing pool`
          : `Imported ${inserted} diamonds successfully`
      );
      log('Upload finished. Nothing is scored automatically: press "Run Score Now" below when you are done uploading.');
      toast.info('Now press "Run Score Now" to score outliers and refresh the widget picks.');
      setNeedsScoring(true);
      await refreshCount();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`FAILED: ${msg}`);
      toast.error(`Import failed: ${msg}`);
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Gem className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Diamond Pool</h1>
          <p className="text-sm text-muted-foreground">
            Upload weekly diamond inventory CSV. Existing rows are fully replaced after a successful import.
          </p>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardDescription>Current Pool Size</CardDescription></CardHeader>
          <CardContent className="flex items-center justify-between">
            <span className="text-2xl font-bold">{currentCount?.toLocaleString() ?? '—'}</span>
            <Button size="icon" variant="ghost" onClick={refreshCount}><RefreshCw className="h-4 w-4" /></Button>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader className="pb-2"><CardDescription>Last Import</CardDescription></CardHeader>
          <CardContent>
            <span className="text-sm">{lastImport ? new Date(lastImport).toLocaleString() : 'No imports yet'}</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" /> Upload CSV</CardTitle>
          <CardDescription>
            CSV must include the 43 standard columns (ID, stockId, ReportNo, shape, carats, col, clar, ...).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => setMode('replace')}
              className={`text-left rounded-md border p-3 transition ${
                mode === 'replace' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="text-sm font-semibold">Upload New File (Replace)</div>
              <div className="text-xs text-muted-foreground mt-1">
                Truncates the existing pool and replaces it with the new CSV (atomic swap).
              </div>
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => setMode('append')}
              className={`text-left rounded-md border p-3 transition ${
                mode === 'append' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="text-sm font-semibold">Append to Existing Records</div>
              <div className="text-xs text-muted-foreground mt-1">
                Adds the new CSV rows on top of the existing pool. No data is removed.
              </div>
            </button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            disabled={loading}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground hover:file:opacity-90"
          />

          {loading && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing... {progress}%
              </div>
              <Progress value={progress} />
            </div>
          )}

          {stats && (
            <div className="rounded-md border border-border p-3 flex items-center gap-3 text-sm">
              {stats.errors === 0 ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <AlertCircle className="h-5 w-5 text-destructive" />}
              <span>
                Total {stats.total.toLocaleString()} · Inserted {stats.inserted.toLocaleString()} · Errors {stats.errors.toLocaleString()}
              </span>
            </div>
          )}

          {logs.length > 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-3 max-h-64 overflow-y-auto font-mono text-xs space-y-0.5">
              {logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={needsScoring ? 'border-primary' : undefined}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Play className="h-5 w-5" /> Run Score Now</CardTitle>
          <CardDescription>
            Scoring is manual. After your uploads are done, start one run here: outlier scoring, group representatives,
            filter values and client availability are rebuilt in short batches with a pause between each step, then the
            run stops by itself. No nightly or minute-by-minute job runs any more.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button onClick={runScoreNow} disabled={scoring || loading}>
            {scoring ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Run Score Now
          </Button>
          {needsScoring && (
            <span className="text-sm text-muted-foreground">New diamonds were uploaded and have not been scored yet.</span>
          )}
        </CardContent>
      </Card>

      <DiamondOutlierPanel />

      <DiamondFxPricingPanel />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4" /> How it works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>1. CSV is parsed and rows are loaded into a staging table in batches of {BATCH_SIZE}.</p>
          <p>2. Once staging is complete, an atomic swap replaces all rows in the live pool with the new batch.</p>
          <p>2b. Nothing is scored automatically. When you have finished uploading, press "Run Score Now": the outlier engine then scores every stone in short batches with pauses in between, refreshes the cached representatives and rebuilds each client's availability (see the Outlier Engine card above).</p>
          <p>3. Old data is automatically discarded — only the latest upload is live.</p>
        </CardContent>
      </Card>
    </div>
  );
}
