import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, Database, CheckCircle2, AlertCircle, Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { findQuoteGemstone } from '@/lib/quote-v3-gemstones';

/**
 * Gemstone Pool: the weekly gemstone CSV (Nivoda gemstone export) for the
 * Quote Estimator V3 "Pick your gemstone" list. Same replace / append model
 * as the Diamond Pool; nothing here touches the diamond pool.
 */

// CSV header -> DB column. Header matching ignores case, spaces and underscores
// ("Nivoda Stock Id", "nivoda_stock_id" and "NivodaStockId" all map).
const COLUMN_MAP: Record<string, string> = {
  id: 'external_id',
  reportno: 'report_no',
  gemtype: 'gem_type',
  carats: 'carats',
  carat: 'carats',
  color: 'color',
  colour: 'color',
  colorshade: 'color_shade',
  colourshade: 'color_shade',
  clarity: 'clarity',
  cut: 'cut',
  lab: 'lab',
  nivodastockid: 'stock_id',
  stockid: 'stock_id',
  treatment: 'treatment',
  mineoforigin: 'mine_of_origin',
  origin: 'mine_of_origin',
  length: 'length',
  width: 'width',
  price: 'price',
  pricepercarat: 'price_per_carat',
  video: 'video',
  image: 'image',
  markupprice: 'markup_price',
  markupcurrency: 'markup_currency',
  shape: 'shape',
  pdfurl: 'pdf_url',
  pdf: 'pdf_url',
  returndays: 'return_days',
};
const normalizeHeader = (h: string) => h.replace(/^\uFEFF/, '').toLowerCase().replace(/[^a-z0-9]/g, '');

const NUMERIC_COLS = new Set(['carats', 'length', 'width', 'price', 'price_per_carat', 'markup_price']);
const INT_COLS = new Set(['return_days']);
const UPPER_COLS = new Set(['gem_type']);

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
  if (INT_COLS.has(dbCol)) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : null;
  }
  if (NUMERIC_COLS.has(dbCol)) {
    const n = parseFloat(v.replace(/[$,]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (UPPER_COLS.has(dbCol)) return v.toUpperCase();
  return v;
}

type ImportMode = 'replace' | 'append';

interface GemTypeRow { gem_key: string; gem_type: string; stone_count: number; min_price: number | null; max_price: number | null }

export default function GemstonePool() {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [currentCount, setCurrentCount] = useState<number | null>(null);
  const [lastImport, setLastImport] = useState<string | null>(null);
  const [gemTypes, setGemTypes] = useState<GemTypeRow[]>([]);
  const [stats, setStats] = useState<{ total: number; inserted: number; errors: number } | null>(null);
  const [mode, setMode] = useState<ImportMode>('replace');
  const fileRef = useRef<HTMLInputElement>(null);

  const log = (m: string) => setLogs((p) => [...p.slice(-200), `[${new Date().toLocaleTimeString()}] ${m}`]);

  const refreshCount = async () => {
    const { count } = await supabase.from('gemstone_inventory_pool').select('id', { count: 'exact', head: true });
    setCurrentCount(count ?? 0);
    const { data } = await supabase.from('gemstone_inventory_pool').select('imported_at').order('imported_at', { ascending: false }).limit(1);
    setLastImport(data?.[0]?.imported_at ?? null);
    const { data: types } = await supabase.rpc('get_gemstone_pool_gem_types');
    setGemTypes(((types ?? []) as GemTypeRow[]).map(t => ({ ...t, stone_count: Number(t.stone_count) })));
  };

  useEffect(() => { refreshCount(); }, []);

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
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (lines.length < 2) throw new Error('CSV is empty');

      const headers = parseCSVLine(lines[0]);
      const dbCols = headers.map((h) => COLUMN_MAP[normalizeHeader(h)] || null);
      const unknownHeaders = headers.filter((h) => !COLUMN_MAP[normalizeHeader(h)]);
      if (unknownHeaders.length) log(`Ignoring unknown columns: ${unknownHeaders.join(', ')}`);
      if (!dbCols.includes('gem_type')) throw new Error('CSV has no gemType column — every row needs a gemstone name.');
      if (!dbCols.includes('price')) log('Warning: no price column found. Stones without a price are never offered to customers.');

      const total = lines.length - 1;

      const targetTable = currentMode === 'append' ? 'gemstone_inventory_pool' : 'gemstone_inventory_pool_staging';

      if (currentMode === 'replace') {
        log(`Parsed ${total} rows. Clearing staging table...`);
        const { error: delErr } = await supabase
          .from('gemstone_inventory_pool_staging')
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

        const { data: swapData, error: swapErr } = await supabase.rpc('swap_gemstone_inventory_pool', { p_batch_id: batchId });
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
          ? `Appended ${inserted} gemstones to existing pool`
          : `Imported ${inserted} gemstones successfully`
      );
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

  const money = (n: number | null) => (n === null || !Number.isFinite(Number(n)) ? '—' : `$${Math.round(Number(n)).toLocaleString()}`);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Sparkles className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Gemstone Pool</h1>
          <p className="text-sm text-muted-foreground">
            Upload the weekly gemstone inventory CSV. The Quote Estimator V3 "Pick your gemstone" screen lists these stones, grouped by gemstone, as product cards.
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
            Columns: ID, ReportNo, gemType, carats, Color, Color Shade, Clarity, Cut, Lab, Nivoda Stock Id, Treatment, Mine of Origin, length, width, price, price_per_carat, video, image, markup_price, markup_currency, shape, pdfUrl, ReturnDays. Extra columns are ignored.
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
                Truncates the existing gemstone pool and replaces it with the new CSV (atomic swap).
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" /> Stones by gemstone</CardTitle>
          <CardDescription>
            Each gemstone card on the V3 form opens the stones listed here. A gemstone without a V3 card (no match in the form's gemstone list) is uploaded but never shown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {gemTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No gemstones in the pool yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-3 font-medium">Gemstone</th>
                    <th className="text-left py-2 pr-3 font-medium">CSV gemType</th>
                    <th className="text-left py-2 pr-3 font-medium">V3 card</th>
                    <th className="text-right py-2 pr-3 font-medium">Stones</th>
                    <th className="text-right py-2 pr-3 font-medium">Min price</th>
                    <th className="text-right py-2 font-medium">Max price</th>
                  </tr>
                </thead>
                <tbody>
                  {gemTypes.map(t => {
                    const card = findQuoteGemstone(t.gem_key);
                    return (
                      <tr key={t.gem_key} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-3 font-medium">{card?.name ?? t.gem_key}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{t.gem_type}</td>
                        <td className="py-2 pr-3">{card ? <span className="text-primary">Linked</span> : <span className="text-destructive">No card</span>}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{t.stone_count.toLocaleString()}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">{money(t.min_price)}</td>
                        <td className="py-2 text-right tabular-nums">{money(t.max_price)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4" /> How it works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>1. CSV is parsed and rows are loaded into a staging table in batches of {BATCH_SIZE}.</p>
          <p>2. Once staging is complete, an atomic swap replaces all rows in the live gemstone pool with the new batch (Append mode adds rows directly).</p>
          <p>3. On the Quote Estimator V3, picking a gemstone card (Ruby, Sapphire, Beryl, …) opens that gemstone's stones from this pool, sorted by price, 10 per page by default, with the picture, carat, colour, cut, origin, treatment, lab, measurements and price on each card.</p>
          <p>4. The picked stone goes into the quote, the lead and both emails. Pool prices are USD; the markup is set per account under Quote Estimator → Configure → Diamond Configuration → Gemstone picker.</p>
        </CardContent>
      </Card>
    </div>
  );
}
