
This bundle contains the complete source code for the end-to-end Diamond Catalog flow:

1. **Admin uploads CSV** → `Admin → Diamond Pool` page parses CSV, inserts into `diamond_inventory_pool_staging`, then atomic swap into `diamond_inventory_pool` via `swap_diamond_inventory_pool` RPC.
2. **Client sees live pool** on `Client → Catalog → Diamonds` via `DiamondCatalogLive.tsx` — pulls from pool with filters/markup live preview.
3. **Client applies filters + markup** and confirms → persisted to `client_diamond_catalog_filter` table.
4. **Ring OS widget** (`StoneStep.tsx`) reads diamonds via `useClientDiamondPresets` hook → RPC `get_diamond_presets_filtered` which streams from pool when client has confirmed filter, applying markup live. Falls back to legacy `client_diamond_presets` otherwise.

### Architecture map

| Layer | Files |
|---|---|
| **Admin CSV upload UI** | `src/pages/admin/DiamondPool.tsx` |
| **Client catalog UI** | `src/pages/client/Catalog.tsx`, `src/components/catalog/diamond-catalog/DiamondCatalogLive.tsx` |
| **Client hooks** | `src/hooks/useClientDiamondPresets.ts`, `src/hooks/useDiamondPoolOptions.ts` |
| **Normalization lib** | `src/lib/diamond-pool-normalize.ts` |
| **Ring OS widget (consumer)** | `src/components/ring-builder/steps/StoneStep.tsx`, `WizardRingBuilder.tsx`, `ElegantConfigurationPanel.tsx`, `DiamondDetailInfoDialog.tsx` |
| **Embed entry** | `src/pages/EmbedConfigurator.tsx`, `src/pages/CustomRingBuilder.tsx` |
| **Edge functions** | `supabase/functions/generate-client-diamond-presets`, `supabase/functions/reset-client-diamonds` |
| **DB migrations** | All migrations creating/altering `diamond_inventory_pool`, `client_diamond_catalog_filter`, `client_diamond_presets`, and related RPCs |

---

---

## `src/pages/admin/DiamondPool.tsx`

```tsx
import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Upload, Database, CheckCircle2, AlertCircle, Loader2, Gem, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4" /> How it works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>1. CSV is parsed and rows are loaded into a staging table in batches of {BATCH_SIZE}.</p>
          <p>2. Once staging is complete, an atomic swap replaces all rows in the live pool with the new batch.</p>
          <p>3. Old data is automatically discarded — only the latest upload is live.</p>
        </CardContent>
      </Card>
    </div>
  );
}

```

---

## `src/pages/client/Catalog.tsx`

```tsx
import { useState, useEffect, useMemo, useCallback } from "react";
import { useClientActivityLogger } from '@/hooks/useClientActivityLogger';
import { useAuth } from "@/contexts/AuthContext";
import { useAdminImpersonation } from "@/contexts/AdminImpersonationContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Package, RefreshCw, Loader2, Check, ChevronRight, ChevronLeft, DollarSign, Plus, Trash2, AlertCircle, Pencil, ShieldAlert, Upload, CheckCircle, XCircle, Clock, AlertTriangle, Info, Diamond, Search, X, Sparkles, TrendingUp } from "lucide-react";
import { ShapeIcon } from "@/components/common/ShapeIcon";
import { Checkbox } from "@/components/ui/checkbox";
import { getCurrentPrices, MetalPricesResponse, METAL_CONFIG } from '@/lib/metal-prices-api';
import { DiamondProductCard } from "@/components/catalog/DiamondProductCard";
import { DiamondCatalogLive } from "@/components/catalog/diamond-catalog/DiamondCatalogLive";
import { WidgetPricingModeCard } from "@/components/catalog/WidgetPricingModeCard";
import { ShopifySyncProgress } from "@/components/catalog/ShopifySyncProgress";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CatalogProductEditDialog } from "@/components/catalog/CatalogProductEditDialog";
import { DiamondMassEditDialog } from "@/components/catalog/DiamondMassEditDialog";
import { DiamondPagination } from "@/components/catalog/DiamondPagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getProductCdnImageUrl } from "@/lib/cdn-utils";
import { RING_OS_DEFAULT_STYLE_PRICES, RING_OS_DEFAULT_SHANK_PRICES } from "@/lib/ring-os-defaults";
import { useClientCurrency } from "@/hooks/useClientCurrency";
import { getCurrencySymbol } from "@/lib/pricing-utils";
import { normalizeMetalName } from "@/lib/ring-os-defaults";
import {
  computeMetalAddOn,
  computeMetalAddOnAtReferenceSpot,
  BLENDED_GOLD_WEIGHT_G,
  PLATINUM_DENSITY_FACTOR,
  KARAT_PURITY,
  PLATINUM_PURITY,
  SILVER_PURITY,
  SILVER_BLENDED_WEIGHT_G,
  OZ_TO_GRAM,
  RHODIUM_SURCHARGE,
  type ColorFamily as MetalColorFamily,
} from "@/lib/ring-os-metal-pricing";
import { InfoTooltip } from "@/components/ui/info-tooltip";

// Types for lookup data from database
interface LookupStyle {
  id: string;
  style_id: string;
  style_name: string;
  description: string | null;
  base_price: number | null;
  display_order: number | null;
  is_active: boolean | null;
}

interface LookupShank {
  id: string;
  shank_id: string;
  shank_name: string;
  description: string | null;
  base_price: number | null;
  display_order: number | null;
  is_active: boolean | null;
}

interface LookupShape {
  id: string;
  shape_id: string;
  shape_name: string;
  display_order: number | null;
  is_active: boolean | null;
}

interface LookupVisualColor {
  id: string;
  color_id: string;
  color_name: string;
  color_hex: string | null;
  display_order: number | null;
  is_active: boolean | null;
}

interface LookupMetal {
  id: string;
  metal_id: string;
  metal_name: string;
  color_hex: string | null;
  base_price: number | null;
  display_order: number | null;
  is_active: boolean | null;
  color_family: string | null;
}

const RING_STEPS = [
  { id: 1, title: 'Styles', description: 'Select ring styles and set prices' },
  { id: 2, title: 'Shanks', description: 'Choose band styles and pricing' },
  { id: 3, title: 'Metals', description: 'Configure metal color variants' },
  { id: 4, title: 'Shapes', description: 'Select diamond shapes' },
  { id: 5, title: 'Review', description: 'Generate your ring catalog' },
];


// Shopify variant limits
const FIXED_CARAT_OPTIONS = 8;
const SHOPIFY_VARIANT_LIMIT = 100;
const MAX_METALS_PER_FAMILY = 12; // 12 × 8 = 96 variants (safe under 100)
const WARNING_THRESHOLD = 8;     // 8 × 8 = 64 variants (show warning)

// Fixed karat options for each color family
const KARAT_OPTIONS = [
  { value: '9k', label: '9K' },
  { value: '10k', label: '10K' },
  { value: '14k', label: '14K' },
  { value: '18k', label: '18K' },
  { value: '22k', label: '22K' },
  { value: '24k', label: '24K' },
];

const WHITE_EXTRAS = [
  { value: 'white-gold-plated', label: 'White Gold Plated' },
];

// Helper component for variant count badge
const VariantCountBadge = ({ count }: { count: number }) => {
  const variants = count * FIXED_CARAT_OPTIONS;
  
  if (count === 0) return null;
  
  if (count > MAX_METALS_PER_FAMILY) {
    return (
      <Badge variant="destructive" className="gap-1 text-xs">
        <XCircle className="w-3 h-3" />
        {count} metals • {variants} variants
      </Badge>
    );
  }
  
  if (count >= WARNING_THRESHOLD) {
    return (
      <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600 text-xs">
        <AlertTriangle className="w-3 h-3" />
        {count} metals • {variants} variants
      </Badge>
    );
  }
  
  return (
    <Badge variant="outline" className="gap-1 border-primary text-primary text-xs">
      <Check className="w-3 h-3" />
      {count} metals • {variants} variants
    </Badge>
  );
};

// Type for option prices (without metals now)
interface OptionPrices {
  styles: Record<string, number>;
  shanks: Record<string, number>;
}

// Metal variant type
interface MetalVariant {
  id: string;
  name: string;
  price: number;
}

interface MetalVariantsByColor {
  [colorFamily: string]: MetalVariant[];
}

// Type for my_master_db_data entries
interface MasterDbData {
  id: string;
  unique_id: string;
  combination_id: string;
  style_id: string;
  style_name: string | null;
  shank_id: string;
  shank_name: string | null;
  visual_color: string;
  visual_color_name: string | null;
  shape_id: string;
  shape_name: string | null;
  base_price: number | null;
  image_url_0: string | null;
  image_url_1: string | null;
  image_url_2: string | null;
  image_url_3: string | null;
  image_0_filename: string | null;
  image_1_filename: string | null;
  image_2_filename: string | null;
  image_3_filename: string | null;
  folder_path: string | null;
  product_name: string | null;
}

interface ClientCatalogItem {
  id: string;
  master_db_id: string | null;
  is_enabled: boolean;
  markup_percentage: number | null;
  custom_price: number | null;
  shopify_product_id?: string | null;
  shopify_sync_status?: string | null;
  shopify_synced_at?: string | null;
  updated_at?: string | null;
  my_master_db_data: MasterDbData | null;
}

// Helper function to format combination_id: "solitaire-high-polish-yellow-pear" -> "Solitaire High Polish Yellow Pear"
const formatProductTitle = (combinationId: string): string => {
  return combinationId
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

// Helper function to get product image URL from my_master_db_data using CDN
const getProductImageUrl = (item: MasterDbData, angleIndex: number = 0): string | null => {
  return getProductCdnImageUrl(item, angleIndex);
};

const Catalog = () => {
  const { user, role, staffInfo } = useAuth();
  const { impersonatedClientId, isImpersonating } = useAdminImpersonation();
  const [activeTab, setActiveTab] = useState<string>("your-catalogue");
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState<string | null>(null);
  const { currency: clientCurrency } = useClientCurrency(clientId);
  const activityLogger = useClientActivityLogger();

  // Check if staff member has catalog access - default to false for staff if permissions not loaded
  const hasCatalogAccess = role !== 'staff' || (staffInfo?.permissions?.catalog_access ?? false);
  
  // Check if staff member can edit (reset/regenerate) the catalog
  const canEditCatalog = role !== 'staff' || 
    (staffInfo?.permissions?.catalog_access && 
     String(staffInfo.permissions.catalog_access).toLowerCase() === 'edit');

  // Show access denied for staff without catalog permission
  if (role === 'staff' && !hasCatalogAccess) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="bg-destructive/10 p-6 rounded-full mb-6">
          <ShieldAlert className="h-16 w-16 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Access Restricted</h1>
        <p className="text-muted-foreground text-center max-w-md">
          You don't have permission to access the product catalog. Please contact your administrator to request access.
        </p>
      </div>
    );
  }
  
  // Lookup data from database
  const [styleOptions, setStyleOptions] = useState<LookupStyle[]>([]);
  const [shankOptions, setShankOptions] = useState<LookupShank[]>([]);
  const [shapeOptions, setShapeOptions] = useState<LookupShape[]>([]);
  const [colorFamilies, setColorFamilies] = useState<LookupVisualColor[]>([]);
  const [lookupMetals, setLookupMetals] = useState<LookupMetal[]>([]);
  
  // All products tab - now uses my_master_db_data
  const [masterData, setMasterData] = useState<MasterDbData[]>([]);
  
  // Your catalogue tab
  const [clientCatalog, setClientCatalog] = useState<ClientCatalogItem[]>([]);
  const [hasCatalog, setHasCatalog] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isResettingDiamonds, setIsResettingDiamonds] = useState(false);
  const [diamondResetProgress, setDiamondResetProgress] = useState<{ deleted: number; total: number } | null>(null);
  const [isPushingToShopify, setIsPushingToShopify] = useState(false);
  const [shopifyConnected, setShopifyConnected] = useState(false);
  const [pricingMode, setPricingMode] = useState<'estimates' | 'custom_pricing'>('estimates');
  const [depositAmount, setDepositAmount] = useState<number>(0);
  const [editingItem, setEditingItem] = useState<ClientCatalogItem | null>(null);
  
  // Shopify push progress state
  const [pushProgress, setPushProgress] = useState<{
    processed: number;
    remaining: number;
    total: number;
    created: number;
    updated: number;
    failed: number;
  } | null>(null);
  
  // Push start times for ETA calculation
  const [pushStartTime, setPushStartTime] = useState<number | null>(null);
  
  // Warn user when navigating away during Shopify sync
  useEffect(() => {
    if (!isPushingToShopify) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isPushingToShopify]);

  // Questionnaire state - Ring Catalog
  const [currentStep, setCurrentStep] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [ringCatalogGenerated, setRingCatalogGenerated] = useState(false);
  const [showDiamondPrompt, setShowDiamondPrompt] = useState(false);
  const [generatedCatalogCount, setGeneratedCatalogCount] = useState(0);
  const [selections, setSelections] = useState({
    styles: [] as string[],
    shanks: [] as string[],
    shapes: [] as string[],
  });
  
  // Diamond Catalog state
  interface DiamondPresetItem {
    shapeId: string;
    carat: number;
    color: string;
    clarity: string;
    price: number;
    stoneType?: 'natural' | 'lab';
    caratRange?: string;
  }
  const DIAMOND_PAGE_SIZE = 50;
  const [diamondPresetPrices, setDiamondPresetPrices] = useState<DiamondPresetItem[]>([]);
  const [hasDiamondCatalog, setHasDiamondCatalog] = useState(false);

  // Server-side pagination state for diamond catalog
  const [diamondCurrentPage, setDiamondCurrentPage] = useState(0);
  const [diamondTotalCount, setDiamondTotalCount] = useState(0);   // filtered total (changes with filters)
  const [diamondGrandTotal, setDiamondGrandTotal] = useState(0);   // unfiltered total (set once on init)
  const [diamondPoolTotal, setDiamondPoolTotal] = useState(0);     // master pool unfiltered total (live)
  const [diamondPageData, setDiamondPageData] = useState<DiamondPresetItem[]>([]);
  const [diamondPageLoading, setDiamondPageLoading] = useState(false);

  // Filter options loaded from server (distinct values — no full scan needed)
  const [availableDiamondShapes, setAvailableDiamondShapes] = useState<string[]>([]);
  const [availableDiamondColors, setAvailableDiamondColors] = useState<string[]>([]);
  const [availableDiamondClarities, setAvailableDiamondClarities] = useState<string[]>([]);
  const [availableDiamondCaratRanges, setAvailableDiamondCaratRanges] = useState<string[]>([]);
  
  // Color families and metal variants state
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
   const [metalVariants, setMetalVariants] = useState<MetalVariantsByColor>({});
  
  // Live metal prices state
  const [livePrices, setLivePrices] = useState<MetalPricesResponse | null>(null);
  const [livePricesLoading, setLivePricesLoading] = useState(false);
  
  // Prices state
  const [prices, setPrices] = useState<OptionPrices>({ styles: {}, shanks: {} });

  // Metal markup state — defaults from RingOS-Metal-Pricing-Guide v2.0
  const [metalMarkups, setMetalMarkups] = useState({ gold: 2.5, platinum: 2.5, silver: 2.0 });
  
  // Ring Catalog Filters
  const [ringSearchTerm, setRingSearchTerm] = useState('');
  const [ringStyleFilter, setRingStyleFilter] = useState<string>('all');
  const [ringShankFilter, setRingShankFilter] = useState<string>('all');
  const [ringShapeFilter, setRingShapeFilter] = useState<string>('all');
  const [ringColorFilter, setRingColorFilter] = useState<string>('all');
  const [ringStatusFilter, setRingStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [ringCurrentPage, setRingCurrentPage] = useState(1);
  const RING_PAGE_SIZE = 25;
  
  // Diamond Catalog Filters
  const [diamondShapeFilter, setDiamondShapeFilter] = useState<string>('all');
  const [diamondCaratFilter, setDiamondCaratFilter] = useState<string>('all');
  const [diamondColorFilter, setDiamondColorFilter] = useState<string>('all');
  const [diamondClarityFilter, setDiamondClarityFilter] = useState<string>('all');
  const [diamondTypeFilter, setDiamondTypeFilter] = useState<'all' | 'natural' | 'lab'>('all');
  
  // Mass Edit Dialog
  const [massEditDialogOpen, setMassEditDialogOpen] = useState(false);

  // Build default metal variants — empty for karat checkbox system
  const buildDefaultMetalVariants = (_metals?: LookupMetal[]): MetalVariantsByColor => {
    return { yellow: [], rose: [], white: [], platinum: [], silver: [] };
  };

  // Build default prices from lookup tables
  // Helper: canonical System Default for a given style/shank id (constants file is the source of truth)
  const systemDefaultStylePrice = (id: string) => RING_OS_DEFAULT_STYLE_PRICES[id] ?? 0;
  const systemDefaultShankPrice = (id: string) => RING_OS_DEFAULT_SHANK_PRICES[id] ?? 0;

  const buildDefaultPrices = (styles: LookupStyle[], shanks: LookupShank[]): OptionPrices => ({
    styles: styles.reduce((acc, s) => ({
      ...acc,
      [s.style_id]: systemDefaultStylePrice(s.style_id),
    }), {}),
    shanks: shanks.reduce((acc, s) => ({
      ...acc,
      [s.shank_id]: systemDefaultShankPrice(s.shank_id),
    }), {}),
  });

  // Helper to get carat range label for display
  const getCaratRangeLabel = (carat: number): string => {
    if (carat < 0.50) return '0.20-0.49';
    if (carat < 1.00) return '0.50-0.99';
    if (carat < 1.50) return '1.00-1.49';
    if (carat < 2.00) return '1.50-1.99';
    if (carat < 2.50) return '2.00-2.49';
    if (carat < 3.00) return '2.50-2.99';
    if (carat < 3.50) return '3.00-3.49';
    if (carat < 4.00) return '3.50-3.99';
    return `${carat} ct`;
  };

  // Filtered Ring Catalog
  const filteredRingCatalog = useMemo(() => {
    return clientCatalog.filter(item => {
      const masterItem = item.my_master_db_data;
      if (!masterItem) return false;
      
      // Search term matching
      const searchMatch = !ringSearchTerm || 
        masterItem.combination_id.toLowerCase().includes(ringSearchTerm.toLowerCase()) ||
        (masterItem.product_name?.toLowerCase().includes(ringSearchTerm.toLowerCase()) ?? false);
      
      // Style filter
      const styleMatch = ringStyleFilter === 'all' || masterItem.style_id === ringStyleFilter;
      
      // Shank filter
      const shankMatch = ringShankFilter === 'all' || masterItem.shank_id === ringShankFilter;
      
      // Shape filter
      const shapeMatch = ringShapeFilter === 'all' || masterItem.shape_id === ringShapeFilter;
      
      // Color filter
      const colorMatch = ringColorFilter === 'all' || masterItem.visual_color === ringColorFilter;
      
      // Status filter
      const statusMatch = ringStatusFilter === 'all' || 
        (ringStatusFilter === 'enabled' ? item.is_enabled : !item.is_enabled);
      
      return searchMatch && styleMatch && shankMatch && shapeMatch && colorMatch && statusMatch;
    });
  }, [clientCatalog, ringSearchTerm, ringStyleFilter, ringShankFilter, ringShapeFilter, ringColorFilter, ringStatusFilter]);

  // Unique shank options for filter
  const uniqueRingShanks = useMemo(() => {
    const shanks = new Set<string>();
    clientCatalog.forEach(item => {
      if (item.my_master_db_data?.shank_id) shanks.add(item.my_master_db_data.shank_id);
    });
    return Array.from(shanks).sort();
  }, [clientCatalog]);

  // Pagination
  const ringTotalPages = Math.max(1, Math.ceil(filteredRingCatalog.length / RING_PAGE_SIZE));
  const paginatedRingCatalog = useMemo(
    () => filteredRingCatalog.slice((ringCurrentPage - 1) * RING_PAGE_SIZE, ringCurrentPage * RING_PAGE_SIZE),
    [filteredRingCatalog, ringCurrentPage]
  );

  useEffect(() => {
    setRingCurrentPage(1);
  }, [ringSearchTerm, ringStyleFilter, ringShankFilter, ringShapeFilter, ringColorFilter, ringStatusFilter]);

  useEffect(() => {
    if (ringCurrentPage > ringTotalPages) setRingCurrentPage(ringTotalPages);
  }, [ringTotalPages, ringCurrentPage]);

  // Unique filter options for rings (derived from catalog)
  const uniqueRingStyles = useMemo(() => {
    const styles = new Set<string>();
    clientCatalog.forEach(item => {
      if (item.my_master_db_data?.style_id) styles.add(item.my_master_db_data.style_id);
    });
    return Array.from(styles).sort();
  }, [clientCatalog]);

  const uniqueRingShapes = useMemo(() => {
    const shapes = new Set<string>();
    clientCatalog.forEach(item => {
      if (item.my_master_db_data?.shape_id) shapes.add(item.my_master_db_data.shape_id);
    });
    return Array.from(shapes).sort();
  }, [clientCatalog]);

  const uniqueRingColors = useMemo(() => {
    const colors = new Set<string>();
    clientCatalog.forEach(item => {
      if (item.my_master_db_data?.visual_color) colors.add(item.my_master_db_data.visual_color);
    });
    return Array.from(colors).sort();
  }, [clientCatalog]);

  // Filter options come from server — no client-side scan needed
  const uniqueDiamondShapes      = availableDiamondShapes;
  const uniqueDiamondCaratRanges = availableDiamondCaratRanges;
  const uniqueDiamondColors      = availableDiamondColors;
  const uniqueDiamondClarities   = availableDiamondClarities;

  // Clear ring filters
  const clearRingFilters = () => {
    setRingSearchTerm('');
    setRingStyleFilter('all');
    setRingShankFilter('all');
    setRingShapeFilter('all');
    setRingColorFilter('all');
    setRingStatusFilter('all');
  };

  // Clear diamond filters
  const clearDiamondFilters = () => {
    setDiamondShapeFilter('all');
    setDiamondCaratFilter('all');
    setDiamondColorFilter('all');
    setDiamondClarityFilter('all');
    setDiamondTypeFilter('all');
  };

  // Check if any filter is applied
  const hasRingFiltersApplied = ringSearchTerm || ringStyleFilter !== 'all' || ringShankFilter !== 'all' || ringShapeFilter !== 'all' || ringColorFilter !== 'all' || ringStatusFilter !== 'all';
  const hasDiamondFiltersApplied = diamondShapeFilter !== 'all' || diamondCaratFilter !== 'all' || diamondColorFilter !== 'all' || diamondClarityFilter !== 'all' || diamondTypeFilter !== 'all';


  // Mass edit diamond prices handler — uses DB-level RPC to update across all pages
  // Chunked deletion — loops until RPC returns 0 (nothing left), shows live progress
  const handleResetDiamondCatalog = async () => {
    if (!clientId) return;
    setIsResettingDiamonds(true);
    const total = diamondGrandTotal || 1;
    setDiamondResetProgress({ deleted: 0, total });
    try {
      let totalDeleted = 0;
      while (true) {
        const { data, error } = await (supabase as any).rpc('delete_client_diamond_chunk', {
          p_client_id: clientId,
        });
        if (error) throw error;
        const deletedNow = Number(data ?? 0);
        if (deletedNow === 0) break; // nothing left — all done
        totalDeleted += deletedNow;
        setDiamondResetProgress({ deleted: totalDeleted, total: Math.max(total, totalDeleted) });
      }
      // Clear wizard config
      await supabase.from('diamond_catalog_config').delete().eq('client_id', clientId);
      setHasDiamondCatalog(false);
      setDiamondPageData([]);
      setDiamondGrandTotal(0);
      setDiamondTotalCount(0);
      toast.success('Diamond catalog reset successfully');
    } catch (error: any) {
      console.error('Reset diamond catalog failed:', error);
      toast.error(error?.message || 'Failed to reset diamond catalog');
    } finally {
      setIsResettingDiamonds(false);
      setDiamondResetProgress(null);
    }
  };

  const handleMassEditDiamonds = async (
    adjustmentType: 'percentage' | 'fixed',
    adjustmentValue: number,
    applyTo: 'all' | 'filtered',
  ) => {
    if (!clientId) {
      toast.error('Client not found');
      return;
    }

    const multiplier = adjustmentType === 'percentage' ? 1 + adjustmentValue / 100 : 1.0;
    const addend = adjustmentType === 'fixed' ? adjustmentValue : 0;

    try {
      const { data: updatedCount, error } = await (supabase as any).rpc('mass_update_diamond_prices', {
        p_client_id:   clientId,
        p_multiplier:  multiplier,
        p_addend:      addend,
        p_stone_type:  applyTo === 'filtered' && diamondTypeFilter  !== 'all' ? diamondTypeFilter  : null,
        p_shape_id:    applyTo === 'filtered' && diamondShapeFilter  !== 'all' ? diamondShapeFilter  : null,
        p_color:       applyTo === 'filtered' && diamondColorFilter  !== 'all' ? diamondColorFilter  : null,
        p_clarity:     applyTo === 'filtered' && diamondClarityFilter !== 'all' ? diamondClarityFilter : null,
        p_carat_range: applyTo === 'filtered' && diamondCaratFilter  !== 'all' ? diamondCaratFilter  : null,
      });

      if (error) throw error;

      toast.success(`Updated ${updatedCount ?? 'all matching'} diamond prices`);
      activityLogger.logCustomActivity('catalog_price_update', 'catalog', `Mass updated diamond prices (${adjustmentType})`);

      // Re-fetch current page to reflect new prices
      await fetchDiamondPage(clientId, {
        page:       diamondCurrentPage,
        stoneType:  diamondTypeFilter   !== 'all' ? diamondTypeFilter   : undefined,
        shapeId:    diamondShapeFilter  !== 'all' ? diamondShapeFilter  : undefined,
        color:      diamondColorFilter  !== 'all' ? diamondColorFilter  : undefined,
        clarity:    diamondClarityFilter !== 'all' ? diamondClarityFilter : undefined,
        caratRange: diamondCaratFilter  !== 'all' ? diamondCaratFilter  : undefined,
      });
    } catch (error: any) {
      console.error('Error updating diamond prices:', error);
      toast.error('Failed to update diamond prices');
      throw error;
    }
  };

  useEffect(() => {
    fetchData();
  }, [user, role, staffInfo?.clientId, impersonatedClientId]);

  // Fetch live master pool total (used by Diamonds tab badge)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any).rpc('get_diamond_pool_preview', {
        p_filter: {} as never,
        p_markup_natural: 0,
        p_markup_lab: 0,
        p_page_size: 1,
        p_offset: 0,
      });
      if (cancelled) return;
      if (!error && Array.isArray(data) && data.length > 0) {
        setDiamondPoolTotal(Number(data[0].total_count) || 0);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Re-fetch diamonds from server whenever any filter changes (resets to page 0)
  useEffect(() => {
    if (!clientId || !hasDiamondCatalog) return;
    fetchDiamondPage(clientId, {
      page:       0,
      stoneType:  diamondTypeFilter   !== 'all' ? diamondTypeFilter   : undefined,
      shapeId:    diamondShapeFilter  !== 'all' ? diamondShapeFilter  : undefined,
      color:      diamondColorFilter  !== 'all' ? diamondColorFilter  : undefined,
      clarity:    diamondClarityFilter !== 'all' ? diamondClarityFilter : undefined,
      caratRange: diamondCaratFilter  !== 'all' ? diamondCaratFilter  : undefined,
    });
  }, [diamondTypeFilter, diamondShapeFilter, diamondColorFilter, diamondClarityFilter, diamondCaratFilter, clientId, hasDiamondCatalog]);

  // Fetch live metal prices when on step 3
  useEffect(() => {
    if (currentStep === 3 && !livePrices) {
      setLivePricesLoading(true);
      getCurrentPrices()
        .then(data => setLivePrices(data))
        .finally(() => setLivePricesLoading(false));
    }
  }, [currentStep]);

  const fetchClientCatalogData = async (fetchedClientId: string) => {
    const { data: catalogData, error: catalogError } = await supabase
      .from("client_ring_catalog")
      .select(`
          id,
          master_db_id,
          is_enabled,
          markup_percentage,
          custom_price,
          shopify_product_id,
          shopify_sync_status,
          shopify_synced_at,
          updated_at,
          my_master_db_data (*)
        `)
      .eq("client_id", fetchedClientId);

    if (catalogError) throw catalogError;

    const catalogLength = catalogData?.length || 0;
    setClientCatalog(catalogData || []);
    setHasCatalog(catalogLength > 0);
    setRingCatalogGenerated(catalogLength > 0);
  };

  const fetchDiamondPage = async (
    cId: string,
    options: {
      page?: number;
      stoneType?: string;
      shapeId?: string;
      color?: string;
      clarity?: string;
      caratRange?: string;
    } = {}
  ) => {
    const { page = 0, stoneType, shapeId, color, clarity, caratRange } = options;
    setDiamondPageLoading(true);
    try {
      const { data } = await (supabase as any).rpc('get_diamond_presets_filtered', {
        p_client_id:   cId,
        p_stone_type:  stoneType  || null,
        p_shape_id:    shapeId    || null,
        p_color:       color      || null,
        p_clarity:     clarity    || null,
        p_carat_range: caratRange || null,
        p_page_size:   DIAMOND_PAGE_SIZE,
        p_offset:      page * DIAMOND_PAGE_SIZE,
      });

      if (data && data.length > 0) {
        setDiamondTotalCount(Number(data[0].total_count));
        setDiamondPageData(
          data.map((p: any): DiamondPresetItem => ({
            shapeId:   p.shape_id,
            carat:     Number(p.carat_value),
            caratRange: p.carat_range,
            color:     p.color,
            clarity:   p.clarity,
            price:     Number(p.custom_price ?? p.base_price),
            stoneType: p.stone_type as 'natural' | 'lab',
          }))
        );
      } else {
        setDiamondPageData([]);
        setDiamondTotalCount(0);
      }
      setDiamondCurrentPage(page);
    } finally {
      setDiamondPageLoading(false);
    }
  };

  const initDiamondCatalog = async (cId: string) => {
    const { data: opts } = await (supabase as any).rpc('get_diamond_preset_filter_options', { p_client_id: cId });
    if (opts?.totalCount > 0) {
      const total = Number(opts.totalCount);
      setHasDiamondCatalog(true);
      setDiamondGrandTotal(total);
      setDiamondTotalCount(total);
      setAvailableDiamondShapes(opts.shapes      || []);
      setAvailableDiamondColors(opts.colors      || []);
      setAvailableDiamondClarities(opts.clarities   || []);
      setAvailableDiamondCaratRanges(opts.caratRanges || []);
      await fetchDiamondPage(cId, { page: 0 });
    }
  };

  const fetchData = async () => {
    if (!user) return;

    try {
      // Fetch lookup tables first
      const [
        { data: stylesData },
        { data: shanksData },
        { data: shapesData },
        { data: colorsData },
        { data: metalsData },
      ] = await Promise.all([
        supabase.from("lookup_styles").select("*").eq("is_active", true).order("display_order"),
        supabase.from("lookup_shanks").select("*").eq("is_active", true).order("display_order"),
        supabase.from("lookup_shapes").select("*").eq("is_active", true).order("display_order"),
        supabase.from("lookup_visual_colors").select("*").eq("is_active", true).order("display_order"),
        supabase.from("lookup_metals").select("*").eq("is_active", true).order("display_order"),
      ]);

      setStyleOptions(stylesData || []);
      setShankOptions(shanksData || []);
      setShapeOptions(shapesData || []);
      setColorFamilies(colorsData || []);
      setLookupMetals(metalsData || []);

      // Defaults derived from lookup data (used only if client has no overrides)
      const defaultPrices = buildDefaultPrices(stylesData || [], shanksData || []);
      const defaultMetalVariants = buildDefaultMetalVariants(metalsData || []);

      // Get client ID - priority: impersonation > staff > regular client
      let fetchedClientId: string | null = null;

      // If admin is impersonating a client, use the impersonated client ID
      if (isImpersonating && impersonatedClientId) {
        fetchedClientId = impersonatedClientId;
        // Also fetch shopify connection status for impersonated client
        const { data: impersonatedClientData } = await supabase
          .from("clients")
          .select("shopify_store_url")
          .eq("id", impersonatedClientId)
          .maybeSingle();
        setShopifyConnected(!!impersonatedClientData?.shopify_store_url);
      } else if (role === "staff" && staffInfo?.clientId) {
        fetchedClientId = staffInfo.clientId;
      } else {
        const { data: clientData } = await supabase
          .from("clients")
          .select("id, shopify_store_url")
          .eq("user_id", user.id)
          .maybeSingle();

        fetchedClientId = clientData?.id || null;
        setShopifyConnected(!!clientData?.shopify_store_url);
      }

      if (!fetchedClientId) return;
      setClientId(fetchedClientId);

      // If staff (and not impersonating), also check Shopify connection
      if (!isImpersonating && role === "staff" && staffInfo?.clientId) {
        const { data: staffClientData } = await supabase
          .from("clients")
          .select("shopify_store_url")
          .eq("id", fetchedClientId)
          .maybeSingle();

        setShopifyConnected(!!staffClientData?.shopify_store_url);
      }

      // Fetch master data for "All Products" tab from my_master_db_data
      const { data: masterDbData } = await supabase
        .from("my_master_db_data")
        .select("*")
        .order("combination_id");

      setMasterData(masterDbData || []);

      // Fetch client's catalog (does not touch questionnaire configuration state)
      await fetchClientCatalogData(fetchedClientId);

      // Fetch existing onboarding preferences to restore selections
      const { data: prefsData } = await supabase
        .from("client_onboarding_preferences")
        .select("*")
        .eq("client_id", fetchedClientId)
        .maybeSingle();

      // Hydrate widget pricing mode (deposit-based vs custom)
      if (prefsData) {
        setPricingMode(((prefsData as any).widget_pricing_mode as 'estimates' | 'custom_pricing') || 'estimates');
        setDepositAmount(Number((prefsData as any).widget_deposit_amount) || 0);
      }

      // Fetch existing prices if any (override defaults)
      const { data: pricesData, error: pricesError } = await supabase
        .from("client_option_prices")
        .select("*")
        .eq("client_id", fetchedClientId);

      // Fetch existing metal variants (client can have custom overrides)
      const { data: metalVariantsData, error: metalVariantsError } = await supabase
        .from("client_metal_variants")
        .select("*")
        .eq("client_id", fetchedClientId)
        .order("display_order");

      // If these fail due to permissions or transient errors, don't clobber the in-memory configuration.
      const canHydratePrices = !pricesError;
      const canHydrateMetals = !metalVariantsError;

      // Next selections
      const nextSelections = prefsData
        ? {
            styles: prefsData.selected_styles || [],
            shanks: prefsData.selected_shanks || [],
            shapes: prefsData.selected_shapes || [],
          }
        : { styles: [] as string[], shanks: [] as string[], shapes: [] as string[] };

      // Next prices — always start from lookup base prices, then overlay client overrides
      const nextPrices: OptionPrices = {
        styles: { ...defaultPrices.styles },
        shanks: { ...defaultPrices.shanks },
      };
      if (canHydratePrices && pricesData && pricesData.length > 0) {
        // Build quick lookup of base_price from lookup tables to detect auto-seeded (uncustomized) rows
        const lookupStyleBase: Record<string, number> = Object.fromEntries(
          (stylesData || []).map((s) => [s.style_id, Number(s.base_price ?? 0)])
        );
        const lookupShankBase: Record<string, number> = Object.fromEntries(
          (shanksData || []).map((s) => [s.shank_id, Number(s.base_price ?? 0)])
        );
        pricesData.forEach((item) => {
          const type = item.option_type as keyof OptionPrices;
          const clientPrice = Number(item.price);
          if (nextPrices[type] !== undefined && !isNaN(clientPrice)) {
            // Treat rows whose price matches the lookup base_price as auto-seeded (not a real override)
            const lookupBase =
              type === "styles"
                ? lookupStyleBase[item.option_id]
                : lookupShankBase[item.option_id];
            const isAutoSeeded =
              lookupBase !== undefined && clientPrice === lookupBase;
            if (!isAutoSeeded) {
              nextPrices[type][item.option_id] = clientPrice;
            }
          }
        });
      }

      // Next metal variants + selected color families
      let nextMetalVariants: MetalVariantsByColor = defaultMetalVariants;
      let nextSelectedColors: string[] = prefsData?.selected_metals || [];

      if (canHydrateMetals && metalVariantsData && metalVariantsData.length > 0) {
        const loadedVariants: MetalVariantsByColor = { yellow: [], rose: [], white: [], platinum: [], silver: [] };
        const loadedColors: string[] = [];

        metalVariantsData.forEach((item) => {
          const family = item.color_family;
          if (!family) return;

          if (!loadedVariants[family]) loadedVariants[family] = [];

          // Sanitise legacy names that leaked across families
          let cleanName = item.variant_name;
          if (family === 'platinum') cleanName = 'Platinum (PT950)';
          else if (family === 'silver') cleanName = 'Sterling Silver';

          loadedVariants[family].push({
            id: item.id,
            name: cleanName,
            price: Number(item.price),
          });

          if (!loadedColors.includes(family)) loadedColors.push(family);
        });

        nextMetalVariants = loadedVariants;
        nextSelectedColors = loadedColors;
      }

      // Apply hydrated state — always set prices (use defaults as fallback)
      setSelections(nextSelections);
      setPrices(nextPrices);
      if (canHydrateMetals) {
        setMetalVariants(nextMetalVariants);
        setSelectedColors(nextSelectedColors);
      }

      // If we couldn't hydrate metals (e.g., permission issue), keep UI coherent by ensuring
      // selected colors always have a variants list.
      if (!canHydrateMetals) {
        setMetalVariants((prev) => {
          const merged = { ...defaultMetalVariants, ...prev };
          return merged;
        });
      }
      
      // Note: ringCatalogGenerated state is set by fetchClientCatalogData via hasCatalog
      
      // Initialize diamond catalog with server-side pagination (fast — loads only first 50 rows)
      await initDiamondCatalog(fetchedClientId);
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast.error("Failed to load catalog");
    } finally {
      setLoading(false);
    }
  };

  const handleResetCatalog = async () => {
    if (!clientId) return;
    
    setIsResetting(true);
    try {
      const { error } = await supabase.functions.invoke('reset-client-catalog', {
        body: { clientId },
      });

      if (error) throw error;

      toast.success('Catalog reset successfully');
      activityLogger.logCustomActivity('catalog_reset', 'catalog', 'Ring catalog reset');
      setHasCatalog(false);
      setClientCatalog([]);
      setCurrentStep(1);
      setSelections({ styles: [], shanks: [], shapes: [] });
      setSelectedColors([]);
      setMetalVariants(buildDefaultMetalVariants(lookupMetals));
      setPrices(buildDefaultPrices(styleOptions, shankOptions));
    } catch (error: any) {
      console.error('Error resetting catalog:', error);
      toast.error(error.message || 'Failed to reset catalog');
    } finally {
      setIsResetting(false);
    }
  };

  // Get count of failed items for retry button (rings)
  const failedCount = clientCatalog.filter(c => c.shopify_sync_status === 'failed').length;
  // Get count of items pending sync (null or 'pending' status)
  const pendingCount = clientCatalog.filter(c => c.is_enabled && (!c.shopify_sync_status || c.shopify_sync_status === 'pending')).length;
  

  const handlePushToShopify = async (retryFailedOnly: boolean = false) => {
    if (!clientId) {
      toast.error('Client not found');
      return;
    }

    if (!shopifyConnected) {
      toast.error('Please connect your Shopify store first in Settings → Shopify');
      return;
    }

    const targetCount = retryFailedOnly ? failedCount : pendingCount;
    if (targetCount === 0) {
      toast.error(retryFailedOnly ? 'No failed products to retry' : 'No new products to push');
      return;
    }

    setIsPushingToShopify(true);
    setPushStartTime(Date.now());
    setPushProgress({ processed: 0, remaining: targetCount, total: targetCount, created: 0, updated: 0, failed: 0 });
    
    let hasMore = true;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    const batchSize = 15;
    const MAX_BATCH_RETRIES = 3;

    let outerRetries = 0;
    const MAX_OUTER_RETRIES = 5;

    while (hasMore && outerRetries <= MAX_OUTER_RETRIES) {
      try {
        while (hasMore) {
          let batchRetries = 0;
          let batchData: any = null;

          while (batchRetries < MAX_BATCH_RETRIES) {
            try {
              const { data, error } = await supabase.functions.invoke('shopify-push-catalog', {
                body: { clientId, batchSize, retryFailedOnly },
              });

              if (error) throw error;
              if (!data.success) throw new Error(data.error || 'Failed to push catalog');

              batchData = data;
              break;
            } catch (err: any) {
              batchRetries++;
              if (batchRetries >= MAX_BATCH_RETRIES) throw err;
              toast.info(`Batch failed, retrying automatically (${batchRetries}/${MAX_BATCH_RETRIES})...`);
              await new Promise(r => setTimeout(r, batchRetries * 10000));
            }
          }

          // Accumulate totals
          totalCreated += batchData.created || 0;
          totalUpdated += batchData.updated || 0;
          totalFailed += batchData.failed || 0;
          hasMore = batchData.hasMore;
          outerRetries = 0; // Reset on successful batch

          // Update progress
          setPushProgress({
            processed: batchData.total - batchData.remaining,
            remaining: batchData.remaining,
            total: batchData.total,
            created: totalCreated,
            updated: totalUpdated,
            failed: totalFailed,
          });
        }
        break; // All batches complete, exit outer loop
      } catch (error: any) {
        outerRetries++;
        if (outerRetries > MAX_OUTER_RETRIES) {
          console.error('Error pushing to Shopify:', error);
          toast.error('Shopify catalog sync stopped after multiple failures');
          break;
        }
        toast.warning(`Sync interrupted, resuming automatically (attempt ${outerRetries}/${MAX_OUTER_RETRIES})...`);
        await new Promise(r => setTimeout(r, outerRetries * 15000));
        hasMore = true; // DB still has pending items
      }
    }

    // Final summary
    if (totalCreated + totalUpdated > 0) {
      const actionVerb = retryFailedOnly ? 'retried' : 'pushed';
      toast.success(`Successfully ${actionVerb} ${totalCreated + totalUpdated} products to Shopify`);
    }
    if (totalFailed > 0) {
      toast.warning(`${totalFailed} products failed to sync`);
    }
    
    // Refresh catalog to show updated sync status
    await fetchData();
    setIsPushingToShopify(false);
    setPushProgress(null);
    setPushStartTime(null);
  };

  const toggleSelection = (category: keyof typeof selections, id: string) => {
    setSelections(prev => ({
      ...prev,
      [category]: prev[category].includes(id)
        ? prev[category].filter(item => item !== id)
        : [...prev[category], id],
    }));
  };

  const selectAll = (category: keyof typeof selections, options: { id: string }[]) => {
    setSelections(prev => ({
      ...prev,
      [category]: options.map(o => o.id),
    }));
  };

  const clearAll = (category: keyof typeof selections) => {
    setSelections(prev => ({
      ...prev,
      [category]: [],
    }));
  };

  const toggleColorFamily = (colorId: string) => {
    setSelectedColors(prev => {
      const isCurrentlySelected = prev.includes(colorId);
      if (isCurrentlySelected) {
        return prev.filter(c => c !== colorId);
      } else {
        // Initialize empty array for karat checkbox system
        if (!metalVariants[colorId] || metalVariants[colorId].length === 0) {
          setMetalVariants(prevVariants => ({
            ...prevVariants,
            [colorId]: [],
          }));
        }
        return [...prev, colorId];
      }
    });
  };

  const getKaratVariantName = (colorId: string, karatValue: string, karatLabel: string): string => {
    const isWhiteExtra = WHITE_EXTRAS.some(e => e.value === karatValue);
    if (isWhiteExtra) return karatLabel;
    // Platinum & Silver families use the karatLabel as the full variant name (PT950 / Sterling Silver)
    if (colorId === 'platinum' || colorId === 'silver') return karatLabel;
    const colorName = colorFamilies.find(c => c.color_id === colorId)?.color_name || colorId;
    return normalizeMetalName(karatLabel, colorName);
  };

  // System Default metal price (computed at the May-2026 reference spot via ring-os-metal-pricing).
  // Used as the editable-box fallback when a client has not customised a price (price === 0).
  const systemDefaultMetalPrice = (colorId: string, karatValue: string): number => {
    try {
      if (colorId === 'platinum') return computeMetalAddOnAtReferenceSpot('platinum', 'platinum');
      if (colorId === 'silver') return computeMetalAddOnAtReferenceSpot('silver', 'silver');
      const karatKey = String(karatValue).toLowerCase();
      // Only the standard karats have purity entries; non-standard (e.g. 9K/10K/22K/24K/plated) → 0
      if (!KARAT_PURITY[karatKey]) return 0;
      return computeMetalAddOnAtReferenceSpot(karatKey as any, colorId as MetalColorFamily);
    } catch {
      return 0;
    }
  };

  const toggleKarat = (colorId: string, karatValue: string, karatLabel: string) => {
    const variantName = getKaratVariantName(colorId, karatValue, karatLabel);
    setMetalVariants(prev => {
      const existing = prev[colorId] || [];
      const found = existing.find(v => v.name === variantName);
      if (found) {
        return { ...prev, [colorId]: existing.filter(v => v.name !== variantName) };
      } else {
        return { ...prev, [colorId]: [...existing, { id: `${colorId}-${karatValue}`, name: variantName, price: 0 }] };
      }
    });
  };

  const updateKaratPrice = (colorId: string, variantName: string, price: number) => {
    setMetalVariants(prev => ({
      ...prev,
      [colorId]: (prev[colorId] || []).map(v =>
        v.name === variantName ? { ...v, price } : v
      ),
    }));
  };

  /**
   * Recalculate empty (price === 0) metal variant prices using live spot
   * prices and current markups. Manually-edited prices are left alone.
   * Source: RingOS-Metal-Pricing-Guide v2.0.
   */
  const recalculateMetalPrices = () => {
    const goldOz = livePrices?.prices.find(p => p.metal === 'gold')?.pricePerOz;
    const platinumOz = livePrices?.prices.find(p => p.metal === 'platinum')?.pricePerOz;
    const silverOz = livePrices?.prices.find(p => p.metal === 'silver')?.pricePerOz;

    if (!goldOz || !platinumOz || !silverOz) {
      toast.error('Live spot prices not available yet. Please wait a moment.');
      return;
    }

    let updatedCount = 0;
    setMetalVariants(prev => {
      const next: MetalVariantsByColor = {};
      for (const [colorId, variants] of Object.entries(prev)) {
        next[colorId] = variants.map(v => {
          if (v.price > 0) return v; // preserve manual edits

          // Deterministic karat lookup driven by colorId — never sniff the
          // variant name across families (prevents PT950 leaking into White Gold).
          let karat: string;
          if (colorId === 'platinum') {
            karat = 'platinum';
          } else if (colorId === 'silver') {
            karat = 'silver';
          } else if (colorId === 'white' && /white gold plated/i.test(v.name)) {
            karat = 'white-gold-plated';
          } else {
            const m = v.name.match(/(\d{1,2})k/i);
            karat = m ? `${m[1]}k`.toLowerCase() : '';
          }

          if (!karat) return v;

          const computed = computeMetalAddOn({
            karat,
            colorFamily: colorId as MetalColorFamily,
            spotGoldPerOz: goldOz,
            spotPlatinumPerOz: platinumOz,
            spotSilverPerOz: silverOz,
            markups: metalMarkups,
          });
          if (computed > 0) updatedCount += 1;
          return { ...v, price: computed };
        });
      }
      return next;
    });

    if (updatedCount === 0) {
      toast.info('All variants already have prices. Clear a price to recalculate it.');
    } else {
      toast.success(`Filled ${updatedCount} empty variant price${updatedCount === 1 ? '' : 's'} from live spot.`);
    }
  };


  const updatePrice = (category: keyof OptionPrices, id: string, value: number) => {
    setPrices(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [id]: value,
      },
    }));
  };

  const getTotalMetalVariants = () => {
    return selectedColors.reduce((sum, color) => 
      sum + (metalVariants[color]?.length || 0), 0
    );
  };

  const calculateTotalCombinations = () => {
    const { styles, shanks, shapes } = selections;
    // Use color families count, not individual metal variants
    const colorFamilyCount = selectedColors.length;
    return styles.length * shanks.length * colorFamilyCount * shapes.length;
  };
  
  const calculateEstimatedBasePrice = () => {
    const { styles, shanks } = selections;
    
    const avgStylePrice = styles.length > 0 
      ? styles.reduce((sum, id) => sum + (prices.styles[id] || 0), 0) / styles.length 
      : 0;
    const avgShankPrice = shanks.length > 0
      ? shanks.reduce((sum, id) => sum + (prices.shanks[id] || 0), 0) / shanks.length
      : 0;
    
    // Calculate average metal price from selected color variants
    const allVariants = selectedColors.flatMap(color => metalVariants[color] || []).filter(v => v.name.trim());
    const avgMetalPrice = allVariants.length > 0
      ? allVariants.reduce((sum, v) => sum + v.price, 0) / allVariants.length
      : 0;
    
    return Math.round(avgStylePrice + avgShankPrice + avgMetalPrice);
  };

  // Check if any color family exceeds the variant limit
  const hasExceededVariantLimit = selectedColors.some(colorId => {
    const validCount = (metalVariants[colorId] || []).length;
    return validCount > MAX_METALS_PER_FAMILY;
  });

  const canProceed = () => {
    switch (currentStep) {
      case 1: return selections.styles.length > 0;
      case 2: return selections.shanks.length > 0;
      case 3: 
        return selectedColors.length > 0 && 
          selectedColors.some(color => 
            (metalVariants[color]?.length || 0) > 0
          ) &&
          !hasExceededVariantLimit;
      case 4: return selections.shapes.length > 0;
      case 5: return true;
      default: return false;
    }
  };

  const handleNext = () => {
    if (currentStep < 5) setCurrentStep(prev => prev + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(prev => prev - 1);
  };

  const handleGenerateCatalog = async () => {
    if (!clientId) {
      toast.error('Client not found');
      return;
    }

    // Validate all required selections before calling the edge function
    if (!selections.styles.length) {
      toast.error('Please select at least one style');
      setCurrentStep(1);
      return;
    }
    if (!selections.shanks.length) {
      toast.error('Please select at least one shank');
      setCurrentStep(2);
      return;
    }
    if (!selectedColors.length) {
      toast.error('Please select at least one color family');
      setCurrentStep(3);
      return;
    }
    // Check if at least one color has valid metal variants
    const hasValidMetals = selectedColors.some(color => 
      (metalVariants[color]?.length || 0) > 0
    );
    if (!hasValidMetals) {
      toast.error('Please add at least one metal variant');
      setCurrentStep(3);
      return;
    }
    if (!selections.shapes.length) {
      toast.error('Please select at least one shape');
      setCurrentStep(4);
      return;
    }

    setIsGenerating(true);
    try {
      // Filter prices to only include selected options
      const selectedPrices = {
        styles: Object.fromEntries(
          selections.styles.map(id => [id, prices.styles[id] || 0])
        ),
        shanks: Object.fromEntries(
          selections.shanks.map(id => [id, prices.shanks[id] || 0])
        ),
      };

      // Prepare metal variants for submission
      const metalVariantsPayload = selectedColors.reduce((acc, color) => {
        acc[color] = (metalVariants[color] || [])
          .filter(v => v.name.trim())
          .map((v, idx) => ({
            name: v.name.trim(),
            price: v.price,
            displayOrder: idx,
          }));
        return acc;
      }, {} as Record<string, Array<{ name: string; price: number; displayOrder: number }>>);

      const { data, error } = await supabase.functions.invoke('generate-client-catalog', {
        body: {
          clientId,
          styles: selections.styles,
          shanks: selections.shanks,
          selectedColors,
          metalVariants: metalVariantsPayload,
          shapes: selections.shapes,
          prices: selectedPrices,
        },
      });

      if (error) throw error;

      // Check if catalog actually created products
      const catalogCount = data?.catalogCount ?? 0;
      
      if (catalogCount === 0) {
        toast.warning('No matching products found. Please verify your selections match available inventory.');
        return; // Don't mark as generated - keep user on this step
      }

      setRingCatalogGenerated(true);
      setGeneratedCatalogCount(catalogCount);
      await fetchData();
      // Show diamond prompt dialog instead of auto-navigating
      setShowDiamondPrompt(true);
    } catch (error: any) {
      console.error('Error generating catalog:', error);
      toast.error(error.message || 'Failed to generate catalog');
    } finally {
      setIsGenerating(false);
    }
  };


  const toggleCatalogItem = async (itemId: string, isEnabled: boolean) => {
    try {
      const { error } = await supabase
        .from('client_ring_catalog')
        .update({ is_enabled: isEnabled })
        .eq('id', itemId);

      if (error) throw error;

      setClientCatalog(prev => 
        prev.map(item => 
          item.id === itemId ? { ...item, is_enabled: isEnabled } : item
        )
      );
    } catch (error: any) {
      toast.error('Failed to update product');
    }
  };

  const handleSaveProduct = async (itemId: string, updates: { is_enabled: boolean; custom_price: number | null }) => {
    try {
      // If price changed on a synced product, mark it pending so next Shopify push picks it up
      const updatePayload: Record<string, any> = { ...updates };
      const item = clientCatalog.find(i => i.id === itemId);
      if (item && item.shopify_product_id && item.shopify_sync_status === 'synced') {
        updatePayload.shopify_sync_status = 'pending';
      }

      const { error } = await supabase
        .from('client_ring_catalog')
        .update(updatePayload)
        .eq('id', itemId);

      if (error) throw error;

      setClientCatalog(prev => 
        prev.map(item => 
          item.id === itemId
            ? {
                ...item,
                ...updates,
                ...(updatePayload.shopify_sync_status ? { shopify_sync_status: updatePayload.shopify_sync_status } : {}),
                updated_at: new Date().toISOString(),
              }
            : item
        )
      );
      toast.success('Product updated successfully');
      activityLogger.logCustomActivity('catalog_update', 'catalog', `Updated catalog product ${itemId}`);
    } catch (error: any) {
      toast.error('Failed to update product');
      throw error;
    }
  };

  const renderPriceInput = (
    category: keyof OptionPrices,
    id: string,
    currentPrice: number
  ) => (
    <div 
      className="flex items-center gap-2 mt-2 bg-background/50 rounded-md px-2 py-1"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="text-xs text-muted-foreground whitespace-nowrap">Edit price</span>
      <DollarSign className="w-3 h-3 text-muted-foreground" />
      <Input
        type="number"
        value={currentPrice || ''}
        onChange={(e) => updatePrice(category, id, e.target.value === '' ? 0 : Number(e.target.value))}
        className="h-7 w-20 text-sm border-0 bg-transparent p-0 focus-visible:ring-0"
        min={0}
        step={50}
      />
    </div>
  );

  const renderOptionCardWithPrice = (
    option: { id: string; name: string; description?: string; color?: string; defaultPrice?: number },
    category: keyof typeof selections,
    priceCategory: keyof OptionPrices | null,
    isSelected: boolean
  ) => (
    <motion.div
      key={option.id}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => toggleSelection(category, option.id)}
      className={`
        relative cursor-pointer rounded-xl p-4 transition-all duration-200
        ${isSelected
          ? 'bg-primary/20 border-2 border-primary shadow-lg shadow-primary/20'
          : 'bg-card/50 border border-border/50 hover:border-primary/50'
        }
        backdrop-blur-sm
      `}
    >
      {isSelected && (
        <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
          <Check className="w-4 h-4 text-primary-foreground" />
        </div>
      )}
      
      {option.color && (
        <div
          className="w-8 h-8 rounded-full mb-2 border border-border/50"
          style={{ backgroundColor: option.color }}
        />
      )}
      
      <h3 className="font-semibold text-foreground">{option.name}</h3>
      {option.description && (
        <p className="text-sm text-muted-foreground mt-1">{option.description}</p>
      )}
      
      {/* Price input for styles, shanks */}
      {priceCategory && renderPriceInput(
        priceCategory,
        option.id,
        prices[priceCategory][option.id] ?? option.defaultPrice ?? 0
      )}
    </motion.div>
  );

  const renderMetalStep = () => (
    <div className="space-y-4 sm:space-y-6">
      {/* Live Metal Prices Panel */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Live Spot Prices
            </h4>
            {livePrices?.isDemo && (
              <Badge variant="outline" className="text-[10px]">Demo</Badge>
            )}
          </div>
          {livePricesLoading ? (
            <div className="flex gap-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 flex-1 rounded-lg" />)}
            </div>
          ) : livePrices ? (
            <div className="grid grid-cols-3 gap-3">
              {livePrices.prices.map(p => (
                <div key={p.metal} className="bg-background/50 rounded-lg p-2.5 text-center">
                  <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider">{METAL_CONFIG[p.metal].name}</p>
                  <p className="text-sm sm:text-base font-bold text-foreground">${p.pricePerOz.toLocaleString()}<span className="text-[10px] text-muted-foreground">/oz</span></p>
                  <p className={`text-[10px] sm:text-xs font-medium ${p.changePercent >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {p.changePercent >= 0 ? '▲' : '▼'} {Math.abs(p.changePercent).toFixed(2)}%
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Markup & Recalc Panel — RingOS Metal Pricing Guide v2.0 */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                Markup &amp; Auto-Pricing
                <InfoTooltip text="How customer-facing metal add-ons are calculated. Formula: weight (g) × purity × spot ($/g) × markup, plus a 5% rhodium surcharge on white gold. Result is added on top of the base ring (style + shank) price." />
              </h4>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <span>
                  Blended ring weight: {BLENDED_GOLD_WEIGHT_G}g gold · {(BLENDED_GOLD_WEIGHT_G * PLATINUM_DENSITY_FACTOR).toFixed(1)}g platinum (auto)
                </span>
                <InfoTooltip text={`We use one blended weight of ${BLENDED_GOLD_WEIGHT_G}g for all gold karats — Solitaire pulls down, Three-Stone pulls up, Halo and Pavé land near 4g, so the average holds. Platinum is auto-set to ${(BLENDED_GOLD_WEIGHT_G * PLATINUM_DENSITY_FACTOR).toFixed(1)}g because it's ~1.4× denser than gold. You never need to enter weight per ring.`} />
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={recalculateMetalPrices}
                disabled={!livePrices || livePricesLoading}
              >
                Recalculate empty prices from live spot
              </Button>
              <InfoTooltip text="Fills in any variant whose price is $0 using the current live spot prices and your markups. Manually-edited prices are never overwritten — clear a price to $0 first if you want it recomputed." />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {([
              { key: 'gold', label: 'Gold', tip: 'Industry-standard keystone-plus markup on raw metal cost (JCK / National Jeweler benchmarks). Covers refining, casting loss, finishing, and retail margin. Default 2.5×.' },
              { key: 'platinum', label: 'Platinum', tip: 'Same multiplier as gold — platinum costs more because of density (5.6g vs 4g) and PT950 purity, not a different markup. Default 2.5×.' },
              { key: 'silver', label: 'Silver', tip: 'Lower multiplier reflects sterling silver\'s lower base cost and faster inventory turn. Default 2.0×.' },
            ] as const).map(({ key, label, tip }) => (
              <div key={key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    {label} markup
                    <InfoTooltip text={tip} />
                  </Label>
                  <span className="text-xs font-semibold text-foreground">{metalMarkups[key].toFixed(1)}×</span>
                </div>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={metalMarkups[key]}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') {
                      setMetalMarkups(prev => ({ ...prev, [key]: 0 }));
                      return;
                    }
                    if (!/^\d*\.?\d*$/.test(raw)) return;
                    const num = parseFloat(raw);
                    setMetalMarkups(prev => ({ ...prev, [key]: isNaN(num) ? prev[key] : num }));
                  }}
                  className="h-8 text-sm"
                />
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Formula: weight × purity × spot/g × markup (+5% rhodium on white gold). Manually-edited prices are preserved.
          </p>
        </CardContent>
      </Card>

      <p className="text-sm sm:text-base text-muted-foreground text-center">
        Select color families and choose karat options with pricing
      </p>

      {/* Color Family Selection */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {colorFamilies.map(colorFamily => {
          const isSelected = selectedColors.includes(colorFamily.color_id);
          const variantCount = metalVariants[colorFamily.color_id]?.length || 0;

          return (
            <motion.div
              key={colorFamily.color_id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => toggleColorFamily(colorFamily.color_id)}
              className={`
                relative cursor-pointer rounded-lg sm:rounded-xl p-2 sm:p-4 transition-all duration-200 text-center
                ${isSelected
                  ? 'bg-primary/20 border-2 border-primary shadow-lg shadow-primary/20'
                  : 'bg-card/50 border border-border/50 hover:border-primary/50'
                }
                backdrop-blur-sm
              `}
            >
              {isSelected && (
                <div className="absolute top-1 right-1 sm:top-2 sm:right-2 w-5 h-5 sm:w-6 sm:h-6 bg-primary rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 sm:w-4 sm:h-4 text-primary-foreground" />
                </div>
              )}

              <div
                className="w-8 h-8 sm:w-12 sm:h-12 rounded-full mx-auto mb-2 sm:mb-3 border-2 border-border/50 shadow-inner"
                style={{ backgroundColor: colorFamily.color_hex || '#E8E8E8' }}
              />

              <h3 className="text-xs sm:text-base font-semibold text-foreground">{colorFamily.color_name}</h3>
              {isSelected && variantCount > 0 && (
                <Badge variant="secondary" className="mt-1 sm:mt-2 text-[10px] sm:text-xs">
                  {variantCount} selected
                </Badge>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Karat Selection for Selected Colors */}
      {selectedColors.length > 0 && (
        <div className="space-y-4 mt-6">
          {selectedColors.map(colorId => {
            const colorInfo = colorFamilies.find(c => c.color_id === colorId);
            const colorName = colorInfo?.color_name || colorId;
            const options = colorId === 'white'
              ? [...KARAT_OPTIONS, ...WHITE_EXTRAS]
              : colorId === 'platinum'
              ? [{ value: 'platinum', label: 'Platinum (PT950)' }]
              : colorId === 'silver'
              ? [{ value: 'silver', label: 'Sterling Silver' }]
              : KARAT_OPTIONS;

            const familyTip =
              colorId === 'white'
                ? 'White Gold includes a +5% rhodium-plating surcharge baked into the formula. Same purity as yellow/rose for a given karat.'
                : colorId === 'silver'
                ? 'Sterling Silver is 92.5% pure, priced off live silver spot at the silver markup (default 2.0×).'
                : colorId === 'rose'
                ? 'Rose Gold has the same purity as yellow gold for a given karat (color is alloy-driven). Price matches yellow at the same karat.'
                : 'Yellow Gold purity by karat: 14K = 58.3%, 18K = 75%. Price scales with karat × spot × markup.';

            const goldOzLive = livePrices?.prices.find(p => p.metal === 'gold')?.pricePerOz;
            const ptOzLive = livePrices?.prices.find(p => p.metal === 'platinum')?.pricePerOz;
            const agOzLive = livePrices?.prices.find(p => p.metal === 'silver')?.pricePerOz;

            return (
              <Card key={colorId} className="bg-card/50 border-border/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-5 h-5 rounded-full border border-border/50"
                        style={{ backgroundColor: colorInfo?.color_hex || '#E8E8E8' }}
                      />
                      <CardTitle className="text-lg flex items-center gap-1.5">
                        {colorName} Options
                        <InfoTooltip text={familyTip} />
                      </CardTitle>
                    </div>
                    <VariantCountBadge count={(metalVariants[colorId] || []).length} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-1">
                  {options.map(opt => {
                    const variantName = getKaratVariantName(colorId, opt.value, opt.label);
                    const variant = (metalVariants[colorId] || []).find(v => v.name === variantName);
                    const isChecked = !!variant;

                    // Build a per-variant math tooltip showing exactly how the price is derived.
                    const karatKey = String(opt.value).toLowerCase();
                    let mathTip = 'Price = weight × purity × spot/g × markup. Edit freely to override.';
                    if (karatKey === 'platinum' && ptOzLive) {
                      const wt = (BLENDED_GOLD_WEIGHT_G * PLATINUM_DENSITY_FACTOR).toFixed(1);
                      const perG = (ptOzLive / OZ_TO_GRAM).toFixed(2);
                      const computed = computeMetalAddOn({ karat: 'platinum', colorFamily: 'white', spotGoldPerOz: goldOzLive ?? 0, spotPlatinumPerOz: ptOzLive, spotSilverPerOz: agOzLive ?? 0, markups: metalMarkups });
                      mathTip = `${wt}g × ${(PLATINUM_PURITY * 100).toFixed(1)}% × $${perG}/g × ${metalMarkups.platinum}× ≈ $${computed}. Auto weight = 4g × 1.4 density.`;
                    } else if (colorId === 'silver' && agOzLive) {
                      const perG = (agOzLive / OZ_TO_GRAM).toFixed(2);
                      const computed = computeMetalAddOn({ karat: 'silver', colorFamily: 'silver', spotGoldPerOz: goldOzLive ?? 0, spotPlatinumPerOz: ptOzLive ?? 0, spotSilverPerOz: agOzLive, markups: metalMarkups });
                      mathTip = `${SILVER_BLENDED_WEIGHT_G}g × ${(SILVER_PURITY * 100).toFixed(1)}% × $${perG}/g × ${metalMarkups.silver}× ≈ $${computed}.`;
                    } else if (KARAT_PURITY[karatKey] && goldOzLive) {
                      const purity = KARAT_PURITY[karatKey];
                      const perG = (goldOzLive / OZ_TO_GRAM).toFixed(2);
                      const isWhite = colorId === 'white';
                      const computed = computeMetalAddOn({ karat: karatKey, colorFamily: colorId as MetalColorFamily, spotGoldPerOz: goldOzLive, spotPlatinumPerOz: ptOzLive ?? 0, spotSilverPerOz: agOzLive ?? 0, markups: metalMarkups });
                      mathTip = `${BLENDED_GOLD_WEIGHT_G}g × ${(purity * 100).toFixed(1)}% × $${perG}/g × ${metalMarkups.gold}×${isWhite ? ` × ${(1 + RHODIUM_SURCHARGE).toFixed(2)} (rhodium)` : ''} ≈ $${computed}.`;
                    }

                    return (
                      <div
                        key={opt.value}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${isChecked ? 'bg-primary/10' : 'hover:bg-muted/30'}`}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleKarat(colorId, opt.value, opt.label)}
                        />
                        <span className={`text-sm flex-1 ${isChecked ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                          {variantName}
                        </span>
                        {isChecked && (
                          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                            <InfoTooltip text={mathTip} />
                            <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                            <Input
                              type="number"
                              value={
                                (variant!.price && variant!.price > 0)
                                  ? variant!.price
                                  : (systemDefaultMetalPrice(colorId, opt.value) || '')
                              }
                              onChange={(e) => updateKaratPrice(colorId, variantName, e.target.value === '' ? 0 : Number(e.target.value))}
                              className="h-8 w-24 text-sm"
                              min={0}
                              step={50}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Warning when approaching limit */}
                  {(() => {
                    const validCount = (metalVariants[colorId] || []).length;
                    if (validCount >= WARNING_THRESHOLD && validCount <= MAX_METALS_PER_FAMILY) {
                      return (
                        <Alert className="mt-2 bg-amber-500/10 border-amber-500/30">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                          <AlertDescription className="text-sm">
                            <strong>Heads up:</strong> {validCount} metals × {FIXED_CARAT_OPTIONS} carats = {validCount * FIXED_CARAT_OPTIONS} Shopify variants per product. Max is {SHOPIFY_VARIANT_LIMIT}.
                          </AlertDescription>
                        </Alert>
                      );
                    }
                    if (validCount > MAX_METALS_PER_FAMILY) {
                      return (
                        <Alert variant="destructive" className="mt-2">
                          <XCircle className="h-4 w-4" />
                          <AlertDescription className="text-sm">
                            <strong>Limit exceeded:</strong> {validCount} metals × {FIXED_CARAT_OPTIONS} carats = {validCount * FIXED_CARAT_OPTIONS} variants.
                            Shopify allows max {SHOPIFY_VARIANT_LIMIT}. Please deselect {validCount - MAX_METALS_PER_FAMILY} option(s).
                          </AlertDescription>
                        </Alert>
                      );
                    }
                    return null;
                  })()}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedColors.length === 0 && (
        <p className="text-center text-muted-foreground py-8">
          Select at least one color family above to configure metal options
        </p>
      )}

      {/* Overall Variant Summary */}
      {selectedColors.length > 0 && (
        <Card className="bg-muted/30 border-border/50 mt-6">
          <CardContent className="pt-4">
            <h4 className="font-semibold mb-3 flex items-center gap-2">
              <Info className="w-4 h-4" />
              Shopify Variant Summary
            </h4>
            <div className="space-y-2 text-sm">
              {selectedColors.map(colorId => {
                const validCount = (metalVariants[colorId] || []).length;
                const variants = validCount * FIXED_CARAT_OPTIONS;
                const colorName = colorFamilies.find(c => c.color_id === colorId)?.color_name;

                return (
                  <div key={colorId} className="flex justify-between items-center">
                    <span>{colorName}:</span>
                    <span className={variants > SHOPIFY_VARIANT_LIMIT ? 'text-destructive font-bold' : ''}>
                      {validCount} metals × {FIXED_CARAT_OPTIONS} carats = {variants} variants
                      {variants > SHOPIFY_VARIANT_LIMIT && ' ❌'}
                      {variants > 64 && variants <= SHOPIFY_VARIANT_LIMIT && ' ⚠️'}
                      {variants <= 64 && validCount > 0 && ' ✓'}
                    </span>
                  </div>
                );
              })}
              <p className="text-muted-foreground pt-2 border-t border-border/50 mt-2">
                Each ring product gets variants for all metals in its color family. Max: {MAX_METALS_PER_FAMILY} metals × {FIXED_CARAT_OPTIONS} carats = {MAX_METALS_PER_FAMILY * FIXED_CARAT_OPTIONS} variants.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  const handleStartOver = () => {
    setCurrentStep(1);
    setSelections({ styles: [], shanks: [], shapes: [] });
    setSelectedColors([]);
    setMetalVariants({ yellow: [], rose: [], white: [], platinum: [], silver: [] });
    setPrices(buildDefaultPrices(styleOptions, shankOptions));
    setRingCatalogGenerated(false);
  };

  const renderQuestionnaire = () => {
    const renderStep = () => {
      switch (currentStep) {
        case 1:
          return (
            <div className="space-y-3 sm:space-y-4">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3 sm:mb-4">
                <span className="text-xs sm:text-sm text-muted-foreground">
                  {selections.styles.length} of {styleOptions.length} selected
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="text-xs sm:text-sm h-7 sm:h-9" onClick={() => selectAll('styles', styleOptions.map(s => ({ id: s.style_id })))}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs sm:text-sm h-7 sm:h-9" onClick={() => clearAll('styles')}>
                    Clear
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                {styleOptions.map(option =>
                  renderOptionCardWithPrice(
                    { id: option.style_id, name: option.style_name, description: option.description || undefined, defaultPrice: systemDefaultStylePrice(option.style_id) },
                    'styles',
                    'styles',
                    selections.styles.includes(option.style_id)
                  )
                )}
              </div>
            </div>
          );

        case 2:
          return (
            <div className="space-y-3 sm:space-y-4">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3 sm:mb-4">
                <span className="text-xs sm:text-sm text-muted-foreground">
                  {selections.shanks.length} of {shankOptions.length} selected
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="text-xs sm:text-sm h-7 sm:h-9" onClick={() => selectAll('shanks', shankOptions.map(s => ({ id: s.shank_id })))}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs sm:text-sm h-7 sm:h-9" onClick={() => clearAll('shanks')}>
                    Clear
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-4">
                {shankOptions.map(option =>
                  renderOptionCardWithPrice(
                    { id: option.shank_id, name: option.shank_name, description: option.description || undefined, defaultPrice: systemDefaultShankPrice(option.shank_id) },
                    'shanks',
                    'shanks',
                    selections.shanks.includes(option.shank_id)
                  )
                )}
              </div>
            </div>
          );

        case 3:
          return renderMetalStep();

        case 4:
          return (
            <div className="space-y-3 sm:space-y-4">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3 sm:mb-4">
                <span className="text-xs sm:text-sm text-muted-foreground">
                  {selections.shapes.length} of {shapeOptions.length} selected
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="text-xs sm:text-sm h-7 sm:h-9" onClick={() => selectAll('shapes', shapeOptions.map(s => ({ id: s.shape_id })))}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" className="text-xs sm:text-sm h-7 sm:h-9" onClick={() => clearAll('shapes')}>
                    Clear
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-4">
                {shapeOptions.map(option => (
                  <motion.div
                    key={option.shape_id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => toggleSelection('shapes', option.shape_id)}
                    className={`
                      relative cursor-pointer rounded-lg sm:rounded-xl p-3 sm:p-4 transition-all duration-200
                      ${selections.shapes.includes(option.shape_id)
                        ? 'bg-primary/20 border-2 border-primary shadow-lg shadow-primary/20'
                        : 'bg-card/50 border border-border/50 hover:border-primary/50'
                      }
                      backdrop-blur-sm
                    `}
                  >
                    {selections.shapes.includes(option.shape_id) && (
                      <div className="absolute top-1 right-1 sm:top-2 sm:right-2 w-5 h-5 sm:w-6 sm:h-6 bg-primary rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 sm:w-4 sm:h-4 text-primary-foreground" />
                      </div>
                    )}
                    <h3 className="text-xs sm:text-base font-semibold text-foreground">{option.shape_name}</h3>
                  </motion.div>
                ))}
              </div>
            </div>
          );

        case 5:
          return (
            <div className="space-y-4 sm:space-y-6">
              <div className="bg-card/50 backdrop-blur-sm rounded-lg sm:rounded-xl p-4 sm:p-6 border border-border/50">
                <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-3 sm:mb-4">Your Selections & Pricing</h3>
                
                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1.5 sm:mb-2">Styles</p>
                    <div className="flex flex-wrap gap-1 sm:gap-2">
                      {selections.styles.map(s => {
                        const opt = styleOptions.find(o => o.style_id === s);
                        return (
                          <Badge key={s} variant="secondary" className="text-[10px] sm:text-sm py-0.5 sm:py-1 px-2 sm:px-3">
                            {opt?.style_name} - {getCurrencySymbol(clientCurrency)}{prices.styles[s]?.toLocaleString()}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1.5 sm:mb-2">Shanks</p>
                    <div className="flex flex-wrap gap-1 sm:gap-2">
                      {selections.shanks.map(s => {
                        const opt = shankOptions.find(o => o.shank_id === s);
                        return (
                          <Badge key={s} variant="secondary" className="text-[10px] sm:text-sm py-0.5 sm:py-1 px-2 sm:px-3">
                            {opt?.shank_name} - {getCurrencySymbol(clientCurrency)}{prices.shanks[s]?.toLocaleString()}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1.5 sm:mb-2">Metal Variants</p>
                    <div className="flex flex-wrap gap-1 sm:gap-2">
                      {selectedColors.map(colorId => 
                        metalVariants[colorId]?.filter(v => v.name.trim()).map(v => (
                          <Badge key={v.id} variant="secondary" className="text-[10px] sm:text-sm py-0.5 sm:py-1 px-2 sm:px-3">
                            {v.name} - {getCurrencySymbol(clientCurrency)}{v.price.toLocaleString()}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1.5 sm:mb-2">Shapes</p>
                    <div className="flex flex-wrap gap-1 sm:gap-2">
                      {selections.shapes.map(s => {
                        const opt = shapeOptions.find(o => o.shape_id === s);
                        return (
                          <Badge key={s} variant="secondary" className="text-[10px] sm:text-sm py-0.5 sm:py-1 px-2 sm:px-3">
                            {opt?.shape_name}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                <div className="bg-primary/10 rounded-lg sm:rounded-xl p-4 sm:p-6 border border-primary/30 text-center">
                  <p className="text-2xl sm:text-4xl font-bold text-primary">{calculateTotalCombinations()}</p>
                  <p className="text-xs sm:text-base text-muted-foreground mt-0.5 sm:mt-1">Ring combinations</p>
                </div>
                <div className="bg-emerald-500/10 rounded-lg sm:rounded-xl p-4 sm:p-6 border border-emerald-500/30 text-center">
                  <p className="text-2xl sm:text-4xl font-bold text-emerald-500">{getCurrencySymbol(clientCurrency)}{calculateEstimatedBasePrice().toLocaleString()}</p>
                  <p className="text-xs sm:text-base text-muted-foreground mt-0.5 sm:mt-1">Avg. base price</p>
                </div>
              </div>
            </div>
          );

        default:
          return null;
      }
    };

    return (
      <div className="space-y-4 sm:space-y-6">
        {/* Progress bar */}
        <div className="w-full bg-muted/30 h-1 rounded-full">
          <div
            className="bg-primary h-full transition-all duration-300 rounded-full"
            style={{ width: `${(currentStep / 5) * 100}%` }}
          />
        </div>

        {/* Step indicators */}
        <div className="flex justify-center py-2 sm:py-4 overflow-x-auto">
          <div className="flex items-center gap-1 sm:gap-2">
            {RING_STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={`
                    w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium transition-all
                    ${currentStep > step.id
                      ? 'bg-primary text-primary-foreground'
                      : currentStep === step.id
                      ? 'bg-primary/20 text-primary border-2 border-primary'
                      : 'bg-muted text-muted-foreground'
                    }
                  `}
                >
                  {currentStep > step.id ? <Check className="w-3 h-3 sm:w-4 sm:h-4" /> : step.id}
                </div>
                {index < RING_STEPS.length - 1 && (
                  <div
                    className={`w-4 sm:w-8 h-0.5 mx-0.5 sm:mx-1 ${
                      currentStep > step.id ? 'bg-primary' : 'bg-muted'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <div className="text-center mb-4 sm:mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-foreground">
                {RING_STEPS[currentStep - 1].title}
              </h2>
              <p className="text-xs sm:text-base text-muted-foreground mt-0.5 sm:mt-1">
                {RING_STEPS[currentStep - 1].description}
              </p>
            </div>

            {renderStep()}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex justify-between pt-3 sm:pt-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              disabled={currentStep === 1}
              className="text-xs sm:text-sm"
            >
              <ChevronLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
              Back
            </Button>
            {currentStep > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleStartOver}
                className="text-xs sm:text-sm text-muted-foreground hover:text-destructive"
              >
                <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                Start Over
              </Button>
            )}
          </div>

          {currentStep < 5 ? (
            <Button size="sm" onClick={handleNext} disabled={!canProceed()} className="text-xs sm:text-sm">
              Next
              <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 ml-1 sm:ml-2" />
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleGenerateCatalog}
              disabled={isGenerating || !canProceed()}
              className="text-xs sm:text-sm"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin" />
                  Generating...
                </>
              ) : ringCatalogGenerated ? (
                <>
                  <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                  Regenerate Catalog
                </>
              ) : (
                <>
                  Generate Ring Catalog
                  <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 ml-1 sm:ml-2" />
                </>
              )}
            </Button>
          )}
        </div>

        {/* Diamond Prompt Dialog */}
        <AlertDialog open={showDiamondPrompt} onOpenChange={setShowDiamondPrompt}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <div className="flex justify-center mb-4">
                <CheckCircle className="w-12 h-12 text-emerald-500" />
              </div>
              <AlertDialogTitle className="text-center">Ring Catalog Generated!</AlertDialogTitle>
              <AlertDialogDescription className="text-center">
                Your ring catalog has been created with <span className="font-semibold text-foreground">{generatedCatalogCount}</span> products.
                Would you like to configure your diamond options now?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="sm:justify-center gap-2">
              <AlertDialogCancel onClick={() => setShowDiamondPrompt(false)}>
                Skip for now
              </AlertDialogCancel>
              <AlertDialogAction onClick={() => {
                setShowDiamondPrompt(false);
                setActiveTab('diamonds');
                setActiveTab('diamonds');
              }}>
                <Diamond className="w-4 h-4 mr-2" />
                Yes, Configure Diamonds
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
        <Skeleton className="h-7 sm:h-8 w-40 sm:w-48" />
        <Skeleton className="h-4 w-56 sm:w-72" />
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="aspect-square" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
      {/* Full-screen overlay while diamond catalog is being deleted */}
      {isResettingDiamonds && (
        <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-6 px-6 text-center max-w-md w-full">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-2 border-destructive/20" />
              <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-destructive animate-spin" />
            </div>
            <div className="space-y-3 w-full">
              <h3 className="text-lg font-semibold">Resetting Diamond Catalog</h3>
              {diamondResetProgress && diamondResetProgress.total > 0 ? (
                <>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-destructive h-2 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, (diamondResetProgress.deleted / diamondResetProgress.total) * 100)}%` }}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {diamondResetProgress.deleted.toLocaleString()} / {diamondResetProgress.total.toLocaleString()} deleted
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Starting deletion…</p>
              )}
              <p className="text-xs text-muted-foreground">Please don't close this window.</p>
            </div>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Product Catalog</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Browse all products or manage your personalized catalog
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="inline-flex h-auto w-max gap-0 rounded-none border-b border-border bg-transparent p-0">
          <TabsTrigger 
            value="your-catalogue" 
            className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap gap-2"
          >
            
            <span>Rings</span>
            {hasCatalog && (
              <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0 h-5">
                {clientCatalog.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="diamonds" 
            className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap gap-2"
          >
            
            <span>Diamonds</span>
            {(diamondPoolTotal > 0 || hasDiamondCatalog) && (
              <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0 h-5">
                {(diamondPoolTotal || diamondGrandTotal).toLocaleString()}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="your-catalogue" className="mt-4 sm:mt-6">
          {hasCatalog ? (
            <div className="space-y-4 sm:space-y-6">
              {/* Widget Pricing Mode Toggle */}
              {clientId && (
                <WidgetPricingModeCard clientId={clientId} currency={clientCurrency} />
              )}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                <div>
                  <h2 className="text-lg sm:text-xl font-semibold">Your Personalized Catalog</h2>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {clientCatalog.length} products • {clientCatalog.filter(c => c.is_enabled).length} enabled
                    {clientCatalog.some(c => c.shopify_sync_status === 'synced') && (
                      <span className="ml-1 sm:ml-2">• {clientCatalog.filter(c => c.shopify_sync_status === 'synced').length} synced</span>
                    )}
                  </p>
                </div>
                {/* Action buttons */}
                {canEditCatalog && (
                  <div className="flex flex-wrap gap-2">
                    {/* Push to Shopify button with progress - hidden during impersonation */}
                    {isPushingToShopify && pushProgress && pushStartTime ? (
                      <ShopifySyncProgress
                        processed={pushProgress.processed}
                        total={pushProgress.total}
                        remaining={pushProgress.remaining}
                        created={pushProgress.created}
                        updated={pushProgress.updated}
                        failed={pushProgress.failed}
                        label="rings"
                        startTime={pushStartTime}
                      />
                    ) : (
                      <>
                        {/* Retry Failed button - only show when there are failed items */}
                        {failedCount > 0 && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="outline" 
                                size="sm"
                                disabled={isPushingToShopify || pricingMode === 'estimates'}
                                title={pricingMode === 'estimates' ? 'Disabled in Estimates mode — products are not pushed to Shopify.' : undefined}
                                className="border-destructive text-destructive hover:bg-destructive/10 text-xs sm:text-sm"
                              >
                                <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                                Retry ({failedCount})
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Retry Failed Products?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will retry syncing {failedCount} products that previously failed. Successfully synced products will not be affected.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handlePushToShopify(true)}>
                                  Retry Failed
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}

                        {/* Push to Shopify button - only for new products (null status) */}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              variant="default" 
                              size="sm"
                              disabled={isPushingToShopify || !shopifyConnected || pendingCount === 0 || pricingMode === 'estimates'}
                              title={
                                pricingMode === 'estimates'
                                  ? "Disabled in Estimates mode — ring products stay in JewlX. Only the deposit is sent to Shopify at checkout."
                                  : !shopifyConnected
                                    ? 'Connect Shopify in Settings first'
                                    : pendingCount === 0
                                      ? 'All products already synced'
                                      : undefined
                              }
                              className="text-xs sm:text-sm"
                            >
                              <Upload className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                              <span className="hidden sm:inline">Push to Shopify</span>
                              <span className="sm:hidden">Push</span>
                              {pricingMode !== 'estimates' && pendingCount > 0 && ` (${pendingCount})`}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Push Catalog to Shopify?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will create {pendingCount} new products in your Shopify store as draft products (hidden from storefront). Products will only be accessible through your JewelX widget.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handlePushToShopify(false)}>
                                Push to Shopify
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                    
                    {/* Reset Catalogue button - always visible for canEditCatalog */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" disabled={isResetting} className="text-xs sm:text-sm">
                          {isResetting ? (
                            <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                          )}
                          <span className="hidden sm:inline">Reset Catalogue</span>
                          <span className="sm:hidden">Reset</span>
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reset Your Catalogue?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will delete all {clientCatalog.length} products in your catalogue and allow you to create a new one from scratch. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={handleResetCatalog}>
                            Reset Catalogue
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>

              {/* Shopify connection warning */}
              {!shopifyConnected && canEditCatalog && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Connect your Shopify store in Settings → Shopify to enable pushing products to your store.
                  </AlertDescription>
                </Alert>
              )}

              {/* Deposit-mode info banner */}
              {pricingMode === 'estimates' && canEditCatalog && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Deposit-based pricing is active. Your {clientCatalog.length} ring products stay in JewlX and are not pushed to Shopify. When a customer checks out, their full ring + diamond configuration is passed to Shopify as line item details, and the order total is your fixed deposit{depositAmount > 0 ? ` (${getCurrencySymbol(clientCurrency)}${depositAmount.toLocaleString()})` : ''}.
                  </AlertDescription>
                </Alert>
              )}

              {/* Ring Catalog Filter Bar */}
              <div className="space-y-3 mb-4">
                <div className="flex flex-wrap gap-2 sm:gap-3">
                  {/* Search Input */}
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search products..."
                      value={ringSearchTerm}
                      onChange={(e) => setRingSearchTerm(e.target.value)}
                      className="pl-10 h-9"
                    />
                  </div>
                  
                  {/* Style Filter */}
                  <Select value={ringStyleFilter} onValueChange={setRingStyleFilter}>
                    <SelectTrigger className="w-[130px] h-9">
                      <SelectValue placeholder="Style" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Styles</SelectItem>
                      {uniqueRingStyles.map(style => (
                        <SelectItem key={style} value={style} className="capitalize">{style}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Shank Filter */}
                  <Select value={ringShankFilter} onValueChange={setRingShankFilter}>
                    <SelectTrigger className="w-[130px] h-9">
                      <SelectValue placeholder="Shank" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Shanks</SelectItem>
                      {uniqueRingShanks.map(shank => (
                        <SelectItem key={shank} value={shank} className="capitalize">{shank}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {/* Shape Filter */}
                  <Select value={ringShapeFilter} onValueChange={setRingShapeFilter}>
                    <SelectTrigger className="w-[130px] h-9">
                      <SelectValue placeholder="Shape" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Shapes</SelectItem>
                      {uniqueRingShapes.map(shape => (
                        <SelectItem key={shape} value={shape} className="capitalize">{shape}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {/* Color Filter */}
                  <Select value={ringColorFilter} onValueChange={setRingColorFilter}>
                    <SelectTrigger className="w-[120px] h-9">
                      <SelectValue placeholder="Color" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Colors</SelectItem>
                      {uniqueRingColors.map(color => (
                        <SelectItem key={color} value={color} className="capitalize">{color}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {/* Status Filter */}
                  <Select value={ringStatusFilter} onValueChange={v => setRingStatusFilter(v as 'all' | 'enabled' | 'disabled')}>
                    <SelectTrigger className="w-[120px] h-9">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="enabled">Enabled</SelectItem>
                      <SelectItem value="disabled">Disabled</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Clear Filters */}
                  {hasRingFiltersApplied && (
                    <Button variant="ghost" size="sm" onClick={clearRingFilters} className="h-9 px-2">
                      <X className="w-4 h-4 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>
                
                {/* Results Count */}
                <p className="text-sm text-muted-foreground">
                  Showing {paginatedRingCatalog.length} of {filteredRingCatalog.length} products
                  {filteredRingCatalog.length !== clientCatalog.length && ` (filtered from ${clientCatalog.length})`}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
                {paginatedRingCatalog.map((item) => {
                  const masterItem = item.my_master_db_data;
                  return (
                    <Card 
                      key={item.id} 
                      className={`overflow-hidden transition-opacity ${!item.is_enabled ? 'opacity-50' : ''}`}
                    >
                      <div className="aspect-square relative bg-muted">
                        {masterItem && getProductImageUrl(masterItem) ? (
                          <img
                            src={getProductImageUrl(masterItem)!}
                            alt={masterItem.product_name || masterItem.combination_id}
                            className="object-cover w-full h-full"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <Package className="h-8 w-8 sm:h-12 sm:w-12 text-muted-foreground" />
                          </div>
                        )}
                        {!item.is_enabled && (
                          <Badge className="absolute top-1 left-1 sm:top-2 sm:left-2 text-[10px] sm:text-xs" variant="secondary">
                            Disabled
                          </Badge>
                        )}
                        {/* Re-sync needed badge — price changed after last Shopify sync */}
                        {item.shopify_sync_status === 'synced' && item.updated_at && item.shopify_synced_at && (new Date(item.updated_at).getTime() - new Date(item.shopify_synced_at).getTime()) > 5000 && (
                          <Badge 
                            className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 text-[10px] sm:text-xs bg-amber-500 hover:bg-amber-600 text-white border-none" 
                            variant="outline"
                          >
                            <RefreshCw className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />
                            <span className="hidden sm:inline">Re-sync</span>
                          </Badge>
                        )}
                        {/* Shopify sync status badge - only show synced/failed, not pending, and not if re-sync needed */}
                        {item.shopify_sync_status && item.shopify_sync_status !== 'pending' && !(item.shopify_sync_status === 'synced' && item.updated_at && item.shopify_synced_at && (new Date(item.updated_at).getTime() - new Date(item.shopify_synced_at).getTime()) > 5000) && (
                          <Badge 
                            className="absolute bottom-1 right-1 sm:bottom-2 sm:right-2 text-[10px] sm:text-xs" 
                            variant={
                              item.shopify_sync_status === 'synced' ? 'default' : 'destructive'
                            }
                          >
                            {item.shopify_sync_status === 'synced' && <CheckCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />}
                            {item.shopify_sync_status === 'failed' && <XCircle className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1" />}
                            <span className="hidden sm:inline">
                              {item.shopify_sync_status === 'synced' ? 'Synced' : 'Failed'}
                            </span>
                          </Badge>
                        )}
                      </div>
                      <CardContent className="p-2 sm:p-3">
                        <div className="flex items-start justify-between gap-1 sm:gap-2">
                          {/* Tile: combination_id */}
                          <h3 className="text-xs sm:text-sm font-medium line-clamp-2">
                            {masterItem ? formatProductTitle(masterItem.combination_id) : 'Unknown'}
                          </h3>
                          {/* Only show edit/toggle controls for non-staff users */}
                          {role !== 'staff' && (
                            <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 sm:h-7 sm:w-7"
                                onClick={() => setEditingItem(item)}
                              >
                                <Pencil className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                              </Button>
                              <Switch
                                checked={item.is_enabled}
                                onCheckedChange={(checked) => toggleCatalogItem(item.id, checked)}
                                className="scale-75 sm:scale-100"
                              />
                            </div>
                          )}
                        </div>
                        {/* Badges: style_id, shape_id, visual_color */}
                        <div className="flex flex-wrap gap-0.5 sm:gap-1 mt-1 sm:mt-2">
                          <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-2">
                            {masterItem?.style_id}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-2">
                            {masterItem?.shape_id}
                          </Badge>
                          {masterItem?.visual_color && (
                            <Badge 
                              variant="secondary" 
                              className="text-[10px] sm:text-xs px-1 sm:px-2 capitalize"
                              style={{
                                backgroundColor: masterItem.visual_color === 'yellow' ? '#FFD700' :
                                  masterItem.visual_color === 'rose' ? '#E8B4B8' :
                                  masterItem.visual_color === 'white' ? '#E5E5E5' : '#C0C0C0',
                                color: '#333'
                              }}
                            >
                              {masterItem.visual_color}
                            </Badge>
                          )}
                        </div>
                        
                        {/* Price: calculated from client_option_prices (styles + shanks) + metal variant prices */}
                        {masterItem?.visual_color && 
                         metalVariants[masterItem.visual_color]?.length > 0 ? (
                          <div className="mt-3 space-y-1.5 border-t pt-2">
                            <p className="text-xs text-muted-foreground font-medium">Metal Options:</p>
                            {metalVariants[masterItem.visual_color].map((variant) => {
                              // Calculate base price from client's custom style and shank prices
                              const stylePrice = masterItem?.style_id ? (prices.styles[masterItem.style_id] ?? 0) : 0;
                              const shankPrice = masterItem?.shank_id ? (prices.shanks[masterItem.shank_id] ?? 0) : 0;
                              const basePrice = item.custom_price ?? (stylePrice + shankPrice);
                              const totalPrice = basePrice + variant.price;
                              return (
                                <div key={variant.id} className="flex justify-between items-center text-xs">
                                  <span className="text-muted-foreground">{variant.name}</span>
                                  <span className="font-semibold">${totalPrice.toLocaleString()}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-sm font-medium mt-2">
                            {(() => {
                              const stylePrice = masterItem?.style_id ? (prices.styles[masterItem.style_id] ?? 0) : 0;
                              const shankPrice = masterItem?.shank_id ? (prices.shanks[masterItem.shank_id] ?? 0) : 0;
                              const displayPrice = item.custom_price ?? (stylePrice + shankPrice);
                              return `$${displayPrice.toLocaleString()}`;
                            })()}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Empty state for no filter results */}
              {filteredRingCatalog.length === 0 && clientCatalog.length > 0 && (
                <div className="text-center py-12">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    No products match your filters.
                  </p>
                  <Button variant="link" onClick={clearRingFilters} className="mt-2">
                    Clear all filters
                  </Button>
                </div>
              )}

              {/* Pagination */}
              {ringTotalPages > 1 && (
                <Pagination className="pt-4">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={(e) => { e.preventDefault(); if (ringCurrentPage > 1) setRingCurrentPage(ringCurrentPage - 1); }}
                        className={ringCurrentPage === 1 ? 'pointer-events-none opacity-50' : ''}
                      />
                    </PaginationItem>
                    {Array.from({ length: ringTotalPages }, (_, i) => i + 1)
                      .filter(p => p === 1 || p === ringTotalPages || Math.abs(p - ringCurrentPage) <= 1)
                      .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                        if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
                        acc.push(p);
                        return acc;
                      }, [])
                      .map((p, idx) =>
                        p === 'ellipsis' ? (
                          <PaginationItem key={`e-${idx}`}><PaginationEllipsis /></PaginationItem>
                        ) : (
                          <PaginationItem key={p}>
                            <PaginationLink
                              href="#"
                              isActive={p === ringCurrentPage}
                              onClick={(e) => { e.preventDefault(); setRingCurrentPage(p as number); }}
                            >
                              {p}
                            </PaginationLink>
                          </PaginationItem>
                        )
                      )}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={(e) => { e.preventDefault(); if (ringCurrentPage < ringTotalPages) setRingCurrentPage(ringCurrentPage + 1); }}
                        className={ringCurrentPage === ringTotalPages ? 'pointer-events-none opacity-50' : ''}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          ) : (
            <Card className="p-8">
              <div className="max-w-2xl mx-auto">
                {!canEditCatalog ? (
                  // Staff users without edit permission cannot create catalogs - show read-only message
                  <div className="text-center py-12">
                    <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <h2 className="text-xl font-semibold mb-2">No Catalogue Configured</h2>
                    <p className="text-muted-foreground">
                      This client has not configured a product catalogue yet. Please contact your administrator to set one up.
                    </p>
                  </div>
                ) : (
                  // Client users can create catalogs
                  <>
                    <div className="text-center mb-8">
                      <h2 className="text-2xl font-bold">Create Your Product Catalogue</h2>
                      <p className="text-muted-foreground mt-2">
                        Answer a few questions to generate a personalized catalog of ring combinations for your store.
                      </p>
                    </div>
                    {renderQuestionnaire()}
                  </>
                )}
              </div>
            </Card>
          )}
        </TabsContent>

        {/* Diamonds Tab */}
        <TabsContent value="diamonds" className="mt-4 sm:mt-6">
          <Card className="p-3 sm:p-4">
            <div className={canEditCatalog && clientId && hasCatalog ? "w-full" : "max-w-4xl mx-auto"}>
              {!hasCatalog && !hasDiamondCatalog ? (
                <div className="text-center py-12">
                  <Diamond className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <h2 className="text-xl font-semibold mb-2">Complete Ring Catalog First</h2>
                  <p className="text-muted-foreground mb-4">
                    Please configure your ring catalog before setting up diamond options.
                  </p>
                  <Button onClick={() => setActiveTab('your-catalogue')}>
                    Go to Ring Catalog
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              ) : !hasCatalog && hasDiamondCatalog ? (
                <div className="text-center py-12 space-y-6">
                  <Diamond className="h-16 w-16 mx-auto text-primary mb-4" />
                  <div>
                    <h2 className="text-xl font-semibold mb-2">Diamond Catalog Exists</h2>
                    <p className="text-muted-foreground">
                      You have {diamondGrandTotal.toLocaleString()} diamond configurations from your previous setup.
                    </p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Reset Diamond Catalog
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reset Diamond Catalog?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will delete your diamond pricing configuration and allow you to reconfigure it after completing the ring catalog.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleResetDiamondCatalog}>
                          Reset Diamond Catalog
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <p className="text-sm text-muted-foreground">
                    Complete your ring catalog first, then you can reconfigure diamond options.
                  </p>
                  <Button onClick={() => setActiveTab('your-catalogue')}>
                    Go to Ring Catalog
                    <ChevronRight className="w-4 h-4 ml-2" />
                  </Button>
                </div>
              ) : !canEditCatalog ? (
                <div className="space-y-6">
                  <div className="text-center">
                    <Diamond className="h-12 w-12 mx-auto text-primary mb-4" />
                    <h2 className="text-xl font-semibold mb-2">Diamond Catalog</h2>
                    <p className="text-muted-foreground">
                      {hasDiamondCatalog
                        ? `Diamond catalog configured with ${diamondGrandTotal.toLocaleString()} products.`
                        : 'No diamond catalog configured. Contact your administrator.'}
                    </p>
                  </div>
                  {hasDiamondCatalog && diamondGrandTotal > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold">Configured Diamond Products</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                        {diamondPageData.slice(0, 24).map((preset, idx) => {
                          const shapeName = shapeOptions.find(s => s.shape_id === preset.shapeId)?.shape_name || preset.shapeId;
                          return (
                            <DiamondProductCard
                              key={`${preset.shapeId}-${preset.carat}-${preset.color}-${preset.clarity}-${idx}`}
                              shapeId={preset.shapeId}
                              shapeName={shapeName}
                              carat={preset.carat}
                              color={preset.color}
                              clarity={preset.clarity}
                              price={preset.price}
                              stoneType={(preset.stoneType as 'natural' | 'lab') || 'natural'}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : clientId ? (
                <DiamondCatalogLive
                  clientId={clientId}
                  shapeNameLookup={Object.fromEntries(
                    shapeOptions.map((s) => [s.shape_id, s.shape_name])
                  )}
                />
              ) : null}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Product Edit Dialog */}
      {editingItem && (
        <CatalogProductEditDialog
          open={!!editingItem}
          onOpenChange={(open) => !open && setEditingItem(null)}
          item={editingItem}
          calculatedDefaultPrice={(() => {
            const masterItem = editingItem.my_master_db_data;
            const stylePrice = masterItem?.style_id ? (prices.styles[masterItem.style_id] ?? 0) : 0;
            const shankPrice = masterItem?.shank_id ? (prices.shanks[masterItem.shank_id] ?? 0) : 0;
            return stylePrice + shankPrice;
          })()}
          onSave={handleSaveProduct}
        />
      )}
    </div>
  );
};

export default Catalog;

```

---

## `src/components/catalog/diamond-catalog/DiamondCatalogLive.tsx`

```tsx
/**
 * DiamondCatalogLive
 * ------------------
 * Pool-driven Diamond Catalog (replaces the 6-step DiamondCatalogWizard).
 *
 * Behavior:
 *  - Reads master `diamond_inventory_pool` live.
 *  - Left sidebar exposes the same option groups the wizard used to ask for.
 *  - As the user toggles filters, the right grid + total count update via
 *    the `get_diamond_pool_preview` RPC.
 *  - Markup % (Natural / Lab) recomputes displayed price live.
 *  - "Confirm Catalog" upserts `client_diamond_catalog_filter` with
 *    is_confirmed=true. From that moment the widget — which reads via
 *    `get_diamond_presets_filtered` — receives this filtered, marked-up
 *    view from the pool.
 *
 * Widget compatibility: NOTHING in the widget needs to change. The RPC
 * keeps its existing return shape; when no confirmed filter exists, it
 * falls back to the legacy `client_diamond_presets` table.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { toast } from 'sonner';
import { Check, Loader2, RotateCcw, Gem, Sparkles } from 'lucide-react';
import { DiamondProductCard } from '@/components/catalog/DiamondProductCard';
import { DiamondPagination } from '@/components/catalog/DiamondPagination';
import { ShapeIcon } from '@/components/common/ShapeIcon';
import { cn } from '@/lib/utils';

interface Props {
  clientId: string;
  shapeNameLookup?: Record<string, string>;
}

interface CatalogFilter {
  stoneTypes: string[];
  shapes: string[];
  caratMin: string;
  caratMax: string;
  caratRanges: number[];
  colors: string[];
  clarities: string[];
  cuts: string[];
  polish: string[];
  symmetry: string[];
  fluorescence: string[];
  labs: string[];
  canadianOnly: boolean;
  lengthMin: string;
  lengthMax: string;
}

const EMPTY_FILTER: CatalogFilter = {
  stoneTypes: [],
  shapes: [],
  caratMin: '',
  caratMax: '',
  caratRanges: [],
  colors: [],
  clarities: [],
  cuts: [],
  polish: [],
  symmetry: [],
  fluorescence: [],
  labs: [],
  canadianOnly: false,
  lengthMin: '',
  lengthMax: '',
};

const CARAT_RANGE_OPTIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0.5, label: '0.50 - 0.99 ct' },
  { value: 1.0, label: '1.00 - 1.49 ct' },
  { value: 1.5, label: '1.50 - 1.99 ct' },
  { value: 2.0, label: '2.00 - 2.49 ct' },
  { value: 2.5, label: '2.50 - 2.99 ct' },
  { value: 3.0, label: '3.00 - 3.49 ct' },
  { value: 3.5, label: '3.50 - 3.99 ct' },
  { value: 4.0, label: '4.00 - 4.49 ct' },
  { value: 4.5, label: '4.50 - 4.99 ct' },
] as const;

const PAGE_SIZE = 25;

interface PoolDistinct {
  shapes: string[];
  colors: string[];
  clarities: string[];
  cuts: string[];
  polish: string[];
  symmetry: string[];
  fluorescence: string[];
  labs: string[];
}

const EMPTY_DISTINCT: PoolDistinct = {
  shapes: [], colors: [], clarities: [], cuts: [],
  polish: [], symmetry: [], fluorescence: [], labs: [],
};

interface PreviewRow {
  id: string;
  stone_type: string;
  shape_id: string;
  carat_value: number;
  color: string;
  clarity: string;
  base_price: number;
  total_count: number;
}

const NONE_SELECTED_SENTINEL = '__none_selected__';

const uniqueValues = (values: string[]) => Array.from(new Set(values.filter(Boolean)));

// Colors permanently hidden from the customer-facing catalog filter UI.
// Matched case-insensitively against normalized pool values.
const EXCLUDED_COLORS = new Set([
  'K FAINT',
  'K FAINT BROWN',
  'K FAINT PINKISH BROWN',
  'L FAINT BROWN',
  'M FAINT BROWN',
]);
const filterExcludedColors = (values: string[]) =>
  values.filter((v) => !EXCLUDED_COLORS.has(String(v).trim().toUpperCase()));

const shapeIdsFromDistinct = (d: PoolDistinct) => uniqueValues(d.shapes.map((s) => s.toLowerCase().split(' ')[0]));

const allOptionValues = (d: PoolDistinct): Record<keyof Pick<CatalogFilter, 'stoneTypes' | 'shapes' | 'colors' | 'clarities' | 'cuts' | 'polish' | 'symmetry' | 'fluorescence' | 'labs'>, string[]> => ({
  stoneTypes: ['natural', 'lab'],
  shapes: shapeIdsFromDistinct(d),
  colors: filterExcludedColors(uniqueValues(d.colors)),
  clarities: uniqueValues(d.clarities),
  cuts: uniqueValues(d.cuts),
  polish: uniqueValues(d.polish),
  symmetry: uniqueValues(d.symmetry),
  fluorescence: uniqueValues(d.fluorescence),
  labs: uniqueValues(d.labs),
});

const createDefaultFilter = (d: PoolDistinct): CatalogFilter => ({
  ...EMPTY_FILTER,
  ...allOptionValues(d),
});

const hydrateFilterFromServer = (saved: Partial<CatalogFilter>, d: PoolDistinct): CatalogFilter => {
  const defaults = createDefaultFilter(d);
  const hydrated: CatalogFilter = { ...defaults, ...saved };
  Object.keys(allOptionValues(d)).forEach((key) => {
    const k = key as keyof ReturnType<typeof allOptionValues>;
    const selected = saved[k];
    if (!Array.isArray(selected)) {
      hydrated[k] = defaults[k];
      return;
    }
    hydrated[k] = selected.includes(NONE_SELECTED_SENTINEL) ? [] : uniqueValues(selected);
  });
  hydrated.caratRanges = Array.isArray(saved.caratRanges)
    ? Array.from(new Set(saved.caratRanges.map(Number).filter((v) => Number.isFinite(v)))).sort((a, b) => a - b)
    : [];
  return hydrated;
};

const isSameSelection = (selected: string[], allValues: string[]) => {
  const selectedSet = new Set(selected);
  const allSet = new Set(allValues);
  return selectedSet.size === allSet.size && allValues.every((value) => selectedSet.has(value));
};

const cleanFilterForServer = (f: CatalogFilter, d: PoolDistinct): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  const allValues = allOptionValues(d);
  const setArr = (k: keyof typeof allValues) => {
    const available = allValues[k];
    const selected = uniqueValues(f[k]);
    // Empty selection = no restriction on this filter (treat as "all")
    if (available.length === 0 || selected.length === 0 || isSameSelection(selected, available)) return;
    out[k] = selected;
  };
  setArr('stoneTypes');
  setArr('shapes');
  setArr('colors');
  setArr('clarities');
  setArr('cuts');
  setArr('polish');
  setArr('symmetry');
  setArr('fluorescence');
  setArr('labs');
  if (f.caratMin) out.caratMin = f.caratMin;
  if (f.caratMax) out.caratMax = f.caratMax;
  if (Array.isArray(f.caratRanges) && f.caratRanges.length > 0) {
    out.caratRanges = f.caratRanges;
  }
  if (f.lengthMin) out.lengthMin = f.lengthMin;
  if (f.lengthMax) out.lengthMax = f.lengthMax;
  if (f.canadianOnly) out.canadianOnly = true;
  return out;
};

const toggleInArray = (arr: string[], value: string) =>
  arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];

export function DiamondCatalogLive({ clientId, shapeNameLookup }: Props) {
  const [filter, setFilter] = useState<CatalogFilter>(EMPTY_FILTER);
  const [markupNatural, setMarkupNatural] = useState<number>(0);
  const [markupLab, setMarkupLab] = useState<number>(0);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);

  const [distinct, setDistinct] = useState<PoolDistinct>(EMPTY_DISTINCT);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const previewRequestId = useRef(0);

  // ----- Load saved filter (if any) + pool distinct values -----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [savedRes, distinctRes] = await Promise.all([
        supabase
          .from('client_diamond_catalog_filter')
          .select('filter, markup_natural, markup_lab, is_confirmed, confirmed_at')
          .eq('client_id', clientId)
          .maybeSingle(),
        supabase.rpc('get_diamond_pool_distinct_values'),
      ]);
      if (cancelled) return;
      const rawDistinct: PoolDistinct = distinctRes.data
        ? { ...EMPTY_DISTINCT, ...(distinctRes.data as Partial<PoolDistinct>) }
        : EMPTY_DISTINCT;
      const d: PoolDistinct = { ...rawDistinct, colors: filterExcludedColors(rawDistinct.colors) };
      setDistinct(d);
      if (savedRes.data) {
        const f = (savedRes.data.filter as Partial<CatalogFilter>) ?? {};
        setFilter(hydrateFilterFromServer(f, d));
        setMarkupNatural(Number(savedRes.data.markup_natural) || 0);
        setMarkupLab(Number(savedRes.data.markup_lab) || 0);
        setIsConfirmed(!!savedRes.data.is_confirmed);
        setConfirmedAt(savedRes.data.confirmed_at ?? null);
      } else {
        // First-time default: ALL options checked → entire pool visible
        setFilter(createDefaultFilter(d));
      }
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  // ----- Fetch preview rows whenever filter / markup / page changes -----
  const fetchPreview = useCallback(async () => {
    const requestId = previewRequestId.current + 1;
    previewRequestId.current = requestId;
    setLoading(true);
    const { data, error } = await supabase.rpc('get_diamond_pool_preview', {
      p_filter: cleanFilterForServer(filter, distinct) as never,
      p_markup_natural: markupNatural,
      p_markup_lab: markupLab,
      p_page_size: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    });
    if (requestId !== previewRequestId.current) return;
    if (error) {
      console.error('[DiamondCatalogLive] preview error', error);
      toast.error('Failed to load diamonds');
      setRows([]);
      setTotalCount(0);
    } else {
      const list = (data ?? []) as PreviewRow[];
      setRows(list);
      setTotalCount(Number(list[0]?.total_count ?? 0));
    }
    setLoading(false);
  }, [filter, distinct, markupNatural, markupLab, page]);

  useEffect(() => { fetchPreview(); }, [fetchPreview]);

  // Reset to first page on any filter/markup change
  useEffect(() => { setPage(0); }, [filter, markupNatural, markupLab]);

  const handleConfirm = async () => {
    setSaving(true);
    const payload = {
      client_id: clientId,
      filter: cleanFilterForServer(filter, distinct) as never,
      markup_natural: markupNatural,
      markup_lab: markupLab,
      is_confirmed: true,
      confirmed_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('client_diamond_catalog_filter')
      .upsert(payload, { onConflict: 'client_id' });
    setSaving(false);
    if (error) {
      console.error('[DiamondCatalogLive] confirm error', error);
      toast.error('Failed to save catalog');
      return;
    }
    setIsConfirmed(true);
    setConfirmedAt(payload.confirmed_at);
    toast.success('Catalog confirmed — your widget is now live with these diamonds');
  };

  const handleResetFilters = () => {
    setFilter(createDefaultFilter(distinct));
    setMarkupNatural(0);
    setMarkupLab(0);
  };

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (filter.stoneTypes.length) parts.push(`${filter.stoneTypes.length} type(s)`);
    if (filter.shapes.length) parts.push(`${filter.shapes.length} shape(s)`);
    if (filter.colors.length) parts.push(`${filter.colors.length} color(s)`);
    if (filter.clarities.length) parts.push(`${filter.clarities.length} clarity`);
    if (filter.cuts.length) parts.push(`${filter.cuts.length} cut`);
    if (filter.caratRanges && filter.caratRanges.length) parts.push(`${filter.caratRanges.length} carat range(s)`);
    else if (filter.caratMin || filter.caratMax) parts.push(`carat ${filter.caratMin || '0'}–${filter.caratMax || '∞'}`);
    return parts.length ? parts.join(' · ') : 'No filters · all pool diamonds';
  }, [filter]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-4">
      {/* ===== Sidebar ===== */}
      <aside className="space-y-4 border border-border rounded-2xl p-3 bg-card h-fit lg:sticky lg:top-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-wide">Filters</h3>
          <Button variant="ghost" size="sm" onClick={handleResetFilters} className="h-7 px-2 text-xs">
            <RotateCcw className="w-3 h-3 mr-1" /> Reset
          </Button>
        </div>

        <Accordion type="multiple" defaultValue={['stoneType', 'shapes', 'carat']} className="space-y-1">
          <FilterGroup id="stoneType" label="Stone Type">
            <SelectClearBar
              allValues={['natural', 'lab']}
              current={filter.stoneTypes}
              onChange={(next) => setFilter({ ...filter, stoneTypes: next })}
            />
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'natural', label: 'Natural', Icon: Gem },
                { id: 'lab', label: 'Lab-Grown', Icon: Sparkles },
              ].map(({ id, label, Icon }) => {
                const selected = filter.stoneTypes.includes(id);
                return (
                  <OptionTile
                    key={id}
                    selected={selected}
                    onClick={() => setFilter({ ...filter, stoneTypes: toggleInArray(filter.stoneTypes, id) })}
                  >
                    <Icon className="w-5 h-5 mb-1.5 opacity-80" />
                    <span className="text-[11px] font-medium">{label}</span>
                  </OptionTile>
                );
              })}
            </div>
          </FilterGroup>

          <FilterGroup id="shapes" label={`Shapes${distinct.shapes.length ? ` (${distinct.shapes.length})` : ''}`}>
            {distinct.shapes.length >= 2 && (
              <SelectClearBar
                allValues={distinct.shapes.map((s) => s.toLowerCase().split(' ')[0])}
                current={filter.shapes}
                onChange={(next) => setFilter({ ...filter, shapes: next })}
              />
            )}
            <div className="grid grid-cols-3 gap-2">
              {distinct.shapes.map((s) => {
                const id = s.toLowerCase().split(' ')[0];
                const selected = filter.shapes.includes(id);
                return (
                  <OptionTile
                    key={s}
                    selected={selected}
                    onClick={() => setFilter({ ...filter, shapes: toggleInArray(filter.shapes, id) })}
                    className="aspect-square"
                  >
                    <ShapeIcon shapeId={id} size="sm" />
                    <span className="text-[10px] font-medium mt-1 capitalize truncate w-full text-center">
                      {shapeNameLookup?.[id] ?? s}
                    </span>
                  </OptionTile>
                );
              })}
            </div>
          </FilterGroup>

          <FilterGroup id="carat" label={`Carat Range${filter.caratRanges.length ? ` (${filter.caratRanges.length})` : ''}`}>
            <SelectClearBar
              allValues={CARAT_RANGE_OPTIONS.map((r) => String(r.value))}
              current={filter.caratRanges.map((v) => String(v))}
              onChange={(next) =>
                setFilter({
                  ...filter,
                  caratRanges: next.map(Number).filter((v) => Number.isFinite(v)).sort((a, b) => a - b),
                  caratMin: '',
                  caratMax: '',
                })
              }
            />
            <div className="grid grid-cols-2 gap-2">
              {CARAT_RANGE_OPTIONS.map((r) => {
                const selected = filter.caratRanges.includes(r.value);
                return (
                  <OptionTile
                    key={r.value}
                    selected={selected}
                    onClick={() => {
                      const exists = filter.caratRanges.includes(r.value);
                      const next = exists
                        ? filter.caratRanges.filter((v) => v !== r.value)
                        : [...filter.caratRanges, r.value].sort((a, b) => a - b);
                      setFilter({ ...filter, caratRanges: next, caratMin: '', caratMax: '' });
                    }}
                    compact
                  >
                    <span className="text-[11px] font-semibold tabular-nums">{r.label}</span>
                  </OptionTile>
                );
              })}
            </div>
          </FilterGroup>

          <FilterGroup id="colors" label={`Color${distinct.colors.length ? ` (${distinct.colors.length})` : ''}`}>
            {distinct.colors.length >= 2 && (
              <SelectClearBar
                allValues={distinct.colors}
                current={filter.colors}
                onChange={(next) => setFilter({ ...filter, colors: next })}
              />
            )}
            <div className="grid grid-cols-4 gap-1.5">
              {distinct.colors.map((c) => (
                <ChipButton
                  key={c}
                  selected={filter.colors.includes(c)}
                  onClick={() => setFilter({ ...filter, colors: toggleInArray(filter.colors, c) })}
                >{c}</ChipButton>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup id="clarities" label={`Clarity${distinct.clarities.length ? ` (${distinct.clarities.length})` : ''}`}>
            {distinct.clarities.length >= 2 && (
              <SelectClearBar
                allValues={distinct.clarities}
                current={filter.clarities}
                onChange={(next) => setFilter({ ...filter, clarities: next })}
              />
            )}
            <div className="grid grid-cols-4 gap-1.5">
              {distinct.clarities.map((c) => (
                <ChipButton
                  key={c}
                  selected={filter.clarities.includes(c)}
                  onClick={() => setFilter({ ...filter, clarities: toggleInArray(filter.clarities, c) })}
                >{c}</ChipButton>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup id="cuts" label={`Cut${distinct.cuts.length ? ` (${distinct.cuts.length})` : ''}`}>
            {distinct.cuts.length >= 2 && (
              <SelectClearBar
                allValues={distinct.cuts}
                current={filter.cuts}
                onChange={(next) => setFilter({ ...filter, cuts: next })}
              />
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {distinct.cuts.map((c) => (
                <ChipButton
                  key={c}
                  selected={filter.cuts.includes(c)}
                  onClick={() => setFilter({ ...filter, cuts: toggleInArray(filter.cuts, c) })}
                >{c}</ChipButton>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup id="polish" label={`Polish${distinct.polish.length ? ` (${distinct.polish.length})` : ''}`}>
            {distinct.polish.length >= 2 && (
              <SelectClearBar
                allValues={distinct.polish}
                current={filter.polish}
                onChange={(next) => setFilter({ ...filter, polish: next })}
              />
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {distinct.polish.map((c) => (
                <ChipButton
                  key={c}
                  selected={filter.polish.includes(c)}
                  onClick={() => setFilter({ ...filter, polish: toggleInArray(filter.polish, c) })}
                >{c}</ChipButton>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup id="symmetry" label={`Symmetry${distinct.symmetry.length ? ` (${distinct.symmetry.length})` : ''}`}>
            {distinct.symmetry.length >= 2 && (
              <SelectClearBar
                allValues={distinct.symmetry}
                current={filter.symmetry}
                onChange={(next) => setFilter({ ...filter, symmetry: next })}
              />
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {distinct.symmetry.map((c) => (
                <ChipButton
                  key={c}
                  selected={filter.symmetry.includes(c)}
                  onClick={() => setFilter({ ...filter, symmetry: toggleInArray(filter.symmetry, c) })}
                >{c}</ChipButton>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup id="fluorescence" label={`Fluorescence${distinct.fluorescence.length ? ` (${distinct.fluorescence.length})` : ''}`}>
            {distinct.fluorescence.length >= 2 && (
              <SelectClearBar
                allValues={distinct.fluorescence}
                current={filter.fluorescence}
                onChange={(next) => setFilter({ ...filter, fluorescence: next })}
              />
            )}
            <div className="grid grid-cols-2 gap-1.5">
              {distinct.fluorescence.map((c) => (
                <ChipButton
                  key={c}
                  selected={filter.fluorescence.includes(c)}
                  onClick={() => setFilter({ ...filter, fluorescence: toggleInArray(filter.fluorescence, c) })}
                >{c}</ChipButton>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup id="labs" label={`Lab / Certification${distinct.labs.length ? ` (${distinct.labs.length})` : ''}`}>
            {distinct.labs.length >= 2 && (
              <SelectClearBar
                allValues={distinct.labs}
                current={filter.labs}
                onChange={(next) => setFilter({ ...filter, labs: next })}
              />
            )}
            <div className="grid grid-cols-3 gap-1.5">
              {distinct.labs.map((c) => (
                <ChipButton
                  key={c}
                  selected={filter.labs.includes(c)}
                  onClick={() => setFilter({ ...filter, labs: toggleInArray(filter.labs, c) })}
                >{c}</ChipButton>
              ))}
            </div>
          </FilterGroup>

          <FilterGroup id="origin" label="Origin">
            <OptionTile
              selected={filter.canadianOnly}
              onClick={() => setFilter({ ...filter, canadianOnly: !filter.canadianOnly })}
              compact
              className="w-full"
            >
              <span className="text-[11px] font-medium">Canadian / Canada Mark only</span>
            </OptionTile>
          </FilterGroup>

          <FilterGroup id="measurements" label="Measurements (length mm)">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Min</Label>
                <Input
                  type="number" step="0.1" min="0"
                  value={filter.lengthMin}
                  onChange={(e) => setFilter({ ...filter, lengthMin: e.target.value })}
                  className="h-8"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Max</Label>
                <Input
                  type="number" step="0.1" min="0"
                  value={filter.lengthMax}
                  onChange={(e) => setFilter({ ...filter, lengthMax: e.target.value })}
                  className="h-8"
                />
              </div>
            </div>
          </FilterGroup>
        </Accordion>

        {/* Markup */}
        <div className="space-y-3 border-t border-border pt-4">
          <h4 className="text-sm font-semibold">Markup (%)</h4>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Natural</Label>
              <Input
                type="number" step="0.5" min="0" max="500"
                value={markupNatural}
                onChange={(e) => setMarkupNatural(Number(e.target.value) || 0)}
                className="h-8"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Lab-Grown</Label>
              <Input
                type="number" step="0.5" min="0" max="500"
                value={markupLab}
                onChange={(e) => setMarkupLab(Number(e.target.value) || 0)}
                className="h-8"
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Displayed price = pool base price × (1 + markup ÷ 100). Set to 0 to show base.
          </p>
        </div>


        <Button
          onClick={handleConfirm}
          disabled={saving || totalCount === 0}
          className="w-full"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
          {isConfirmed ? 'Update Confirmed Catalog' : 'Confirm Catalog'}
        </Button>
        {isConfirmed && confirmedAt && (
          <p className="text-[11px] text-muted-foreground text-center">
            Last confirmed {new Date(confirmedAt).toLocaleString()}
          </p>
        )}
      </aside>

      {/* ===== Main grid ===== */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold">Available Diamonds</h2>
            <p className="text-xs text-muted-foreground">{filterSummary}</p>
          </div>
          <Badge variant="secondary" className="text-xs">
            {totalCount.toLocaleString()} matching
          </Badge>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {loading
            ? Array.from({ length: PAGE_SIZE }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)
            : rows.map((row) => (
                <DiamondProductCard
                  key={row.id}
                  shapeId={row.shape_id}
                  shapeName={shapeNameLookup?.[row.shape_id] ?? row.shape_id}
                  carat={Number(row.carat_value)}
                  color={row.color}
                  clarity={row.clarity}
                  price={Number(row.base_price)}
                  stoneType={(row.stone_type as 'natural' | 'lab') || 'natural'}
                />
              ))}
        </div>

        {!loading && rows.length === 0 && (
          <div className="text-center py-8">
            <p className="text-muted-foreground">
              No diamonds match your filters. Loosen filters or wait for the next inventory upload.
            </p>
          </div>
        )}

        <DiamondPagination
          currentPage={page}
          totalCount={totalCount}
          pageSize={PAGE_SIZE}
          loading={loading}
          onPageChange={setPage}
        />
      </section>
    </div>
  );
}

// ---------- helpers ----------

function FilterGroup({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <AccordionItem value={id} className="border-b border-border/40">
      <AccordionTrigger className="text-xs font-medium py-2 hover:no-underline">{label}</AccordionTrigger>
      <AccordionContent className="pb-2 space-y-1.5">{children}</AccordionContent>
    </AccordionItem>
  );
}

function CheckboxRow({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-xs cursor-pointer py-1 hover:text-foreground">
      <Checkbox checked={checked} onCheckedChange={onChange} className="h-3.5 w-3.5" />
      <span>{label}</span>
    </label>
  );
}

function OptionTile({
  selected,
  onClick,
  children,
  className,
  compact,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-center justify-center rounded-xl border transition-all',
        'bg-background hover:bg-accent/30',
        compact ? 'px-2 py-2' : 'px-2 py-3',
        selected
          ? 'border-primary bg-primary/5 ring-1 ring-primary/30 text-foreground'
          : 'border-border text-muted-foreground hover:text-foreground',
        className,
      )}
    >
      {selected && (
        <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-primary flex items-center justify-center">
          <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />
        </span>
      )}
      {children}
    </button>
  );
}

function ChipButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-8 px-2 py-1 rounded-md text-[11px] font-semibold tabular-nums tracking-tight leading-tight transition-all border flex items-center justify-center text-center break-words hyphens-auto',
        selected
          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
          : 'bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary/40',
      )}
    >
      {children}
    </button>
  );
}

function SelectClearBar({
  allValues,
  current,
  onChange,
}: {
  allValues: string[];
  current: string[];
  onChange: (next: string[]) => void;
}) {
  const allSelected = allValues.length > 0 && allValues.every((v) => current.includes(v));
  const noneSelected = current.length === 0;
  return (
    <div className="flex items-center gap-1 mb-1.5">
      <Button
        type="button" variant="ghost" size="sm"
        className="h-6 px-2 text-[10px] uppercase tracking-wide"
        disabled={allSelected}
        onClick={() => onChange(allValues)}
      >Select all</Button>
      <span className="text-muted-foreground text-[10px]">·</span>
      <Button
        type="button" variant="ghost" size="sm"
        className="h-6 px-2 text-[10px] uppercase tracking-wide"
        disabled={noneSelected}
        onClick={() => onChange([])}
      >Clear all</Button>
    </div>
  );
}

```

---

## `src/components/catalog/diamond-wizard/steps/DiamondGradingStep.tsx`

```tsx
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Info, Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { DiamondWizardState } from '../types';
import { CLARITY_GROUPS, COLOR_GROUPS, STANDARD_CARAT_RANGES, QUALITY_GRADES, FLUORESCENCE_LEVELS } from '../defaults';
import { useDiamondPoolOptions } from '@/hooks/useDiamondPoolOptions';
import { normalizeColor, normalizeClarity, normalizeQuality, normalizeFluorescence, normalizeLab } from '@/lib/diamond-pool-normalize';

function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="w-3.5 h-3.5 text-muted-foreground hover:text-primary cursor-help inline ml-1" />
        </TooltipTrigger>
        <TooltipContent className="max-w-[250px] text-xs">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SelectAllClear({ onSelectAll, onClear }: { onSelectAll: () => void; onClear: () => void }) {
  return (
    <span className="ml-auto flex items-center gap-2 text-[11px] font-medium">
      <button
        type="button"
        onClick={onSelectAll}
        className="text-primary hover:underline"
      >
        Select all
      </button>
      <span className="text-muted-foreground/40">|</span>
      <button
        type="button"
        onClick={onClear}
        className="text-muted-foreground hover:text-primary hover:underline"
      >
        Clear all
      </button>
    </span>
  );
}

interface Props {
  state: DiamondWizardState;
  onChange: (state: DiamondWizardState) => void;
}

export function DiamondGradingStep({ state, onChange }: Props) {
  const { grading } = state;
  const { data: pool } = useDiamondPoolOptions();

  // Defensive: legacy saved states may lack these arrays. Coerce to [] so
  // .includes() never throws and the sections always render.
  const safeCutGrades = grading.cutGrades ?? [];
  const safePolish = grading.polish ?? [];
  const safeSymmetry = grading.symmetry ?? [];
  const safeFluorescence = grading.fluorescence ?? [];
  const safeLabs = grading.labs ?? [];


  // Color groups: only the standard groups (no "Other (in stock)" per product requirement)
  const colorGroups: ReadonlyArray<{ label: string; grades: readonly string[] }> = COLOR_GROUPS;

  const knownClarities = new Set<string>(CLARITY_GROUPS.flatMap(g => g.grades));
  const extraClarities = Array.from(new Set(
    (pool?.clarities ?? []).map(normalizeClarity).filter(c => c && !knownClarities.has(c))
  )).sort();
  // Exclude the "Included" group (I1, I2, I3) per product requirement
  const baseClarityGroups = CLARITY_GROUPS.filter(g => g.label !== 'Included');
  const clarityGroups: ReadonlyArray<{ label: string; grades: readonly string[] }> = extraClarities.length > 0
    ? [...baseClarityGroups, { label: 'Other (in stock)', grades: extraClarities }]
    : baseClarityGroups;

  const updateGrading = (partial: Partial<typeof grading>) => {
    onChange({ ...state, grading: { ...grading, ...partial } });
  };

  const toggleItem = (list: string[], item: string): string[] => {
    return list.includes(item) ? list.filter(i => i !== item) : [...list, item];
  };


  const toggleGroupClarities = (grades: readonly string[]) => {
    const allSelected = grades.every(g => grading.clarities.includes(g));
    if (allSelected) {
      updateGrading({ clarities: grading.clarities.filter(c => !grades.includes(c)) });
    } else {
      const newClarities = [...new Set([...grading.clarities, ...grades])];
      updateGrading({ clarities: newClarities });
    }
  };

  const toggleGroupColors = (grades: readonly string[]) => {
    const allSelected = grades.every(g => grading.colors.includes(g));
    if (allSelected) {
      updateGrading({ colors: grading.colors.filter(c => !grades.includes(c)) });
    } else {
      const newColors = [...new Set([...grading.colors, ...grades])];
      updateGrading({ colors: newColors });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">What quality grades do you carry?</h3>
        <p className="text-sm text-muted-foreground">Configure carat weight and clarity for your diamond inventory.</p>
      </div>

      {/* Carat Weight Range */}
      <div className="space-y-3">
        <div className="flex items-center">
          <Label className="text-sm font-semibold">Carat Weight Range <InfoTip text="The weight range of diamonds you carry. 1 carat = 0.2 grams. Select the carat ranges you want to offer." /></Label>
          <SelectAllClear
            onSelectAll={() => updateGrading({ caratRange: [STANDARD_CARAT_RANGES[0].min, STANDARD_CARAT_RANGES[STANDARD_CARAT_RANGES.length - 1].max] })}
            onClear={() => updateGrading({ caratRange: [0, 0] })}
          />
        </div>
        <p className="text-xs text-muted-foreground">Select the carat ranges you want to include in your catalog.</p>
        <div className="space-y-1.5">
          {STANDARD_CARAT_RANGES.map((range) => {
            const isSelected = grading.caratRange[0] <= range.min && grading.caratRange[1] >= range.max;
            return (
              <button
                key={range.label}
                onClick={() => {
                  if (isSelected) {
                    const remaining = STANDARD_CARAT_RANGES.filter(
                      r => r.label !== range.label && grading.caratRange[0] <= r.min && grading.caratRange[1] >= r.max
                    );
                    if (remaining.length > 0) {
                      updateGrading({ caratRange: [remaining[0].min, remaining[remaining.length - 1].max] });
                    }
                  } else {
                    const newMin = Math.min(grading.caratRange[0], range.min);
                    const newMax = Math.max(grading.caratRange[1], range.max);
                    updateGrading({ caratRange: [newMin, newMax] });
                  }
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                  isSelected
                    ? 'bg-primary/10 border-primary text-foreground'
                    : 'bg-muted/50 border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                  isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground border border-border'
                }`}>
                  {range.display}
                </span>
                <span className="text-sm flex-1 text-left">{range.label}</span>
                {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      <Separator />

      {/* Color Grade */}
      <div className="space-y-3">
        <div className="flex items-center">
          <Label className="text-sm font-semibold">Color Grade <InfoTip text="Color is graded D (colorless) to M (faint). D-F are colorless, G-J near colorless, K-M faint." /></Label>
          <SelectAllClear
            onSelectAll={() => updateGrading({ colors: Array.from(new Set(colorGroups.flatMap(g => g.grades as readonly string[]))) })}
            onClear={() => updateGrading({ colors: [] })}
          />
        </div>
        <p className="text-xs text-muted-foreground">Select the color grades you carry in your inventory.</p>
        <div className="space-y-2">
          {colorGroups.map(group => (
            <div key={group.label} className="flex items-center gap-2">
              <button
                onClick={() => toggleGroupColors(group.grades)}
                className="text-xs font-medium text-muted-foreground hover:text-primary w-28 text-left shrink-0"
              >
                {group.label}
              </button>
              <div className="flex flex-wrap gap-1.5">
                {group.grades.map(grade => (
                  <button
                    key={grade}
                    onClick={() => updateGrading({ colors: toggleItem(grading.colors, grade) })}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      grading.colors.includes(grade)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted text-muted-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {grade}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Clarity Grade */}
      <div className="space-y-3">
        <div className="flex items-center">
          <Label className="text-sm font-semibold">Clarity Grade <InfoTip text="Clarity measures internal inclusions. FL/IF is flawless, VVS/VS have minor inclusions, SI has noticeable ones." /></Label>
          <SelectAllClear
            onSelectAll={() => updateGrading({ clarities: Array.from(new Set(clarityGroups.flatMap(g => g.grades as readonly string[]))) })}
            onClear={() => updateGrading({ clarities: [] })}
          />
        </div>
        <div className="space-y-2">
          {clarityGroups.map(group => (
            <div key={group.label} className="flex items-center gap-2">
              <button
                onClick={() => toggleGroupClarities(group.grades)}
                className="text-xs font-medium text-muted-foreground hover:text-primary w-20 text-left shrink-0"
              >
                {group.label}
              </button>
              <div className="flex flex-wrap gap-1.5">
                {group.grades.map(grade => (
                  <button
                    key={grade}
                    onClick={() => updateGrading({ clarities: toggleItem(grading.clarities, grade) })}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      grading.clarities.includes(grade)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted text-muted-foreground border-border hover:border-primary/50'
                    }`}
                  >
                    {grade}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Cut / Polish / Symmetry */}
      {(() => {
        // Exclude Fair and Poor per product requirement
        const ALLOWED_QUALITY = QUALITY_GRADES.filter(q => q !== 'Fair' && q !== 'Poor');
        const isAllowedQuality = (q: string) => q && q !== 'Fair' && q !== 'Poor';
        const cutOptions = Array.from(new Set([
          ...ALLOWED_QUALITY,
          ...((pool?.cuts ?? []).map(normalizeQuality).filter(isAllowedQuality)),
        ]));
        const polishOptions = Array.from(new Set([
          ...ALLOWED_QUALITY,
          ...((pool?.polish ?? []).map(normalizeQuality).filter(isAllowedQuality)),
        ]));
        const symmetryOptions = Array.from(new Set([
          ...ALLOWED_QUALITY,
          ...((pool?.symmetry ?? []).map(normalizeQuality).filter(isAllowedQuality)),
        ]));

        const renderPills = (
          label: string,
          tip: string,
          options: string[],
          selected: string[],
          onToggle: (v: string) => void,
          onSetAll: (all: string[]) => void,
        ) => (
          <div className="space-y-2">
            <div className="flex items-center">
              <Label className="text-sm font-semibold">
                {label} <InfoTip text={tip} />
              </Label>
              <SelectAllClear
                onSelectAll={() => onSetAll(options)}
                onClear={() => onSetAll([])}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {options.map(opt => (
                <button
                  key={opt}
                  onClick={() => onToggle(opt)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    selected.includes(opt)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-muted-foreground border-border hover:border-primary/50'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        );

        return (
          <div className="space-y-5">
            {renderPills(
              'Cut Grade',
              'Cut quality (Round only). Filters pool by the cut column.',
              cutOptions,
              safeCutGrades,
              (v) => updateGrading({ cutGrades: toggleItem(safeCutGrades, v) }),
              (all) => updateGrading({ cutGrades: all }),
            )}
            {renderPills(
              'Polish',
              'Polish quality. Filters pool by the pol column.',
              polishOptions,
              safePolish,
              (v) => updateGrading({ polish: toggleItem(safePolish, v) }),
              (all) => updateGrading({ polish: all }),
            )}
            {renderPills(
              'Symmetry',
              'Symmetry quality. Filters pool by the symm column.',
              symmetryOptions,
              safeSymmetry,
              (v) => updateGrading({ symmetry: toggleItem(safeSymmetry, v) }),
              (all) => updateGrading({ symmetry: all }),
            )}
          </div>
        );

      })()}

      <Separator />

      {/* Lab (Certification) */}
      {(() => {
        const labOptions = ['GIA', 'IGI'];
        return (
          <div className="space-y-2">
            <div className="flex items-center">
              <Label className="text-sm font-semibold">
                Lab (Certification) <InfoTip text="Certifying lab. Filters pool by the lab column." />
              </Label>
              <SelectAllClear
                onSelectAll={() => updateGrading({ labs: labOptions })}
                onClear={() => updateGrading({ labs: [] })}
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {labOptions.map(opt => (
                <button
                  key={opt}
                  onClick={() => updateGrading({ labs: toggleItem(grading.labs ?? [], opt) })}
                  className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                    (grading.labs ?? []).includes(opt)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted text-muted-foreground border-border hover:border-primary/50'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      <Separator />


      {/* Measurements */}
      <div className="space-y-3">
        <Label className="text-sm font-semibold">
          Measurements (Length in mm)
          <InfoTip text="Optional. Filters pool stones by the length column. Leave blank to allow all lengths." />
        </Label>
        <p className="text-xs text-muted-foreground">Restrict pool matches to stones within this length range (mm).</p>
        <div className="flex items-center gap-3 max-w-sm">
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">Min</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              placeholder="e.g. 5.00"
              value={grading.measurementsMinLength ?? ''}
              onChange={(e) => updateGrading({
                measurementsMinLength: e.target.value === '' ? null : Number(e.target.value),
              })}
            />
          </div>
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">Max</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              placeholder="e.g. 8.50"
              value={grading.measurementsMaxLength ?? ''}
              onChange={(e) => updateGrading({
                measurementsMaxLength: e.target.value === '' ? null : Number(e.target.value),
              })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

```

---

## `src/components/catalog/diamond-wizard/steps/DiamondShapesStep.tsx`

```tsx
import { Check } from "lucide-react";
import { ShapeIcon } from "@/components/common/ShapeIcon";
import type { DiamondWizardState } from '../types';
import { DIAMOND_SHAPES } from '../defaults';
import { useDiamondPoolOptions } from '@/hooks/useDiamondPoolOptions';
import { normalizeShape } from '@/lib/diamond-pool-normalize';

interface Props {
  state: DiamondWizardState;
  onChange: (state: DiamondWizardState) => void;
  availableShapes?: string[];
}

export function DiamondShapesStep({ state, onChange, availableShapes }: Props) {
  const { selectedShapes } = state.shapes;
  const { data: pool } = useDiamondPoolOptions();

  // Union of hardcoded shapes + any new shape tokens discovered in pool
  const knownIds = new Set<string>(DIAMOND_SHAPES.map(s => s.id));
  const extraShapes = (pool?.shapes ?? [])
    .map(normalizeShape)
    .filter((id, i, arr) => id && !knownIds.has(id) && arr.indexOf(id) === i)
    .map(id => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1) }));
  const mergedShapes: Array<{ id: string; name: string }> = [...DIAMOND_SHAPES, ...extraShapes];

  // Filter to only show shapes the client selected during ring configuration
  const displayedShapes = availableShapes && availableShapes.length > 0
    ? mergedShapes.filter(s => availableShapes.includes(s.id))
    : mergedShapes;

  const toggleShape = (shapeId: string) => {
    const shapes = selectedShapes.includes(shapeId)
      ? selectedShapes.filter(s => s !== shapeId)
      : [...selectedShapes, shapeId];
    onChange({ ...state, shapes: { selectedShapes: shapes } });
  };

  const selectAll = () => {
    onChange({ ...state, shapes: { selectedShapes: displayedShapes.map(s => s.id) } });
  };

  const clearAll = () => {
    onChange({ ...state, shapes: { selectedShapes: [] } });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">What diamond shapes do you offer?</h3>
          <p className="text-sm text-muted-foreground">Select at least one shape to continue.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <button onClick={selectAll} className="text-primary hover:underline">Select All</button>
          <span className="text-muted-foreground">|</span>
          <button onClick={clearAll} className="text-muted-foreground hover:underline">Clear All</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {displayedShapes.map(shape => {
          const selected = selectedShapes.includes(shape.id);
          return (
            <button
              key={shape.id}
              onClick={() => toggleShape(shape.id)}
              className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                selected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                  : 'border-border hover:border-primary/40 bg-card'
              }`}
            >
              {selected && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-3 h-3 text-primary-foreground" />
                </div>
              )}
              <ShapeIcon shapeId={shape.id} size="lg" />
              <span className="text-sm font-medium">{shape.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

```

---

## `src/hooks/useClientDiamondPresets.ts`

```ts
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ClientDiamondPreset {
  id: string;
  stone_type: 'natural' | 'lab';
  shape_id: string;
  carat_range: string;
  carat_value: number;
  color: string;
  clarity: string;
  base_price: number;
  custom_price: number | null;
  is_enabled: boolean;
  cut_grade: string | null;
  fluorescence: string | null;
  report_no: string | null;
}

const rangeStart = (range: string | null | undefined) => {
  const match = String(range ?? '').match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};

const isWithinDeclaredRange = (preset: ClientDiamondPreset) => {
  const start = rangeStart(preset.carat_range);
  if (start == null || Number.isNaN(start)) return true;
  return preset.carat_value >= start && preset.carat_value < start + 0.5;
};

interface UseClientDiamondPresetsResult {
  diamondPresets: ClientDiamondPreset[];
  loading: boolean;
  error: string | null;
}

export const useClientDiamondPresets = (clientId: string | null): UseClientDiamondPresetsResult => {
  const [diamondPresets, setDiamondPresets] = useState<ClientDiamondPreset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDiamondPresets = async () => {
      if (!clientId) {
        setDiamondPresets([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const { data: allPresets, error: fetchError } = await supabase
          .rpc('get_diamond_presets_filtered', {
            p_client_id: clientId,
            p_page_size: 2000,
            p_offset: 0,
          });

        if (fetchError) {
          console.error('Error fetching diamond presets:', fetchError);
          setError(fetchError.message);
          setDiamondPresets([]);
          setLoading(false);
          return;
        }

        const typedData = (allPresets ?? []).map((preset: Record<string, unknown>) => ({
          id: preset.id as string,
          stone_type: preset.stone_type as 'natural' | 'lab',
          shape_id: preset.shape_id as string,
          carat_range: preset.carat_range as string,
          carat_value: Number(preset.carat_value),
          color: preset.color as string,
          clarity: preset.clarity as string,
          base_price: Number(preset.base_price),
          custom_price: preset.custom_price !== null ? Number(preset.custom_price) : null,
          is_enabled: preset.is_enabled as boolean,
          cut_grade: (preset.cut_grade as string) ?? null,
          fluorescence: (preset.fluorescence as string) ?? null,
          report_no: (preset.report_no as string) ?? null,
        })).filter(isWithinDeclaredRange);
        setDiamondPresets(typedData);
      } catch (err) {
        console.error('Unexpected error:', err);
        setError('Failed to fetch diamond presets');
        setDiamondPresets([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDiamondPresets();
  }, [clientId]);

  return { diamondPresets, loading, error };
};

```

---

## `src/hooks/useDiamondPoolOptions.ts`

```ts
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { DiamondPoolDistinctValues } from '@/lib/diamond-pool-normalize';

const EMPTY: DiamondPoolDistinctValues = {
  shapes: [], colors: [], clarities: [], cuts: [],
  polish: [], symmetry: [], fluorescence: [], labs: [],
};

/**
 * Returns the distinct option values currently present in
 * `diamond_inventory_pool`. Used by the Diamond Catalog wizard to union
 * pool-discovered values with its hardcoded option lists.
 */
export function useDiamondPoolOptions() {
  return useQuery<DiamondPoolDistinctValues>({
    queryKey: ['diamond-pool-distinct-values'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_diamond_pool_distinct_values');
      if (error) {
        console.warn('[useDiamondPoolOptions] RPC failed, falling back to empty:', error.message);
        return EMPTY;
      }
      const v = (data ?? {}) as Partial<DiamondPoolDistinctValues>;
      return {
        shapes:       v.shapes       ?? [],
        colors:       v.colors       ?? [],
        clarities:    v.clarities    ?? [],
        cuts:         v.cuts         ?? [],
        polish:       v.polish       ?? [],
        symmetry:     v.symmetry     ?? [],
        fluorescence: v.fluorescence ?? [],
        labs:         v.labs         ?? [],
      };
    },
    staleTime: 1000 * 60 * 30,
    gcTime: 1000 * 60 * 60,
  });
}

```

---

## `src/lib/diamond-pool-normalize.ts`

```ts
/**
 * Maps raw `diamond_inventory_pool` values into the wizard's canonical tokens
 * so distinct values can be unioned with the hardcoded option lists.
 *
 * Used by the Diamond Catalog wizard and the `generate-client-diamond-presets`
 * edge function (a sibling copy lives there).
 */

export const POOL_SHAPE_MAP: Record<string, string> = {
  'ROUND': 'round',
  'OVAL': 'oval',
  'PEAR': 'pear',
  'EMERALD': 'emerald',
  'CUSHION': 'cushion',
  'CUSHION BRILLIANT': 'cushion',
  'CUSHION MODIFIED': 'cushion',
  'PRINCESS': 'princess',
  'RADIANT': 'radiant',
  'MARQUISE': 'marquise',
  'ASSCHER': 'asscher',
  'HEART': 'heart',
};

export const POOL_QUALITY_MAP: Record<string, string> = {
  'EX': 'Excellent',
  'VG': 'Very Good',
  'G': 'Good',
  'F': 'Fair',
  'P': 'Poor',
};

// Reverse map: normalized label -> pool codes used in cut/pol/symm columns
export const QUALITY_TO_POOL_CODES: Record<string, string[]> = {
  'Excellent': ['EX'],
  'Very Good': ['VG'],
  'Good': ['G'],
  'Fair': ['F'],
  'Poor': ['P'],
};

export const POOL_FLUORESCENCE_MAP: Record<string, string> = {
  'NON': 'None',
  'NONE': 'None',
  'FNT': 'Faint',
  'VSL': 'Very Slight',
  'SL': 'Slight',
  'MED': 'Medium',
  'STG': 'Strong',
  'STR': 'Strong',
  'VST': 'Very Strong',
};

const norm = (v: string) => v.trim().toUpperCase();

export const normalizeShape       = (v: string) => POOL_SHAPE_MAP[norm(v)] ?? v.trim().toLowerCase();
export const normalizeQuality     = (v: string) => POOL_QUALITY_MAP[norm(v)] ?? v.trim();
export const normalizeFluorescence = (v: string) => POOL_FLUORESCENCE_MAP[norm(v)] ?? v.trim();
export const normalizeColor       = (v: string) => v.trim().toUpperCase();
export const normalizeClarity     = (v: string) => v.trim().toUpperCase();
export const normalizeLab         = (v: string) => v.trim().toUpperCase();

/**
 * Returns the union of `existing` and the normalized `poolValues`, preserving
 * the order of `existing` and appending any new tokens at the end (sorted).
 */
export function mergeOptions(
  existing: readonly string[],
  poolValues: readonly string[] | undefined,
  normalizer: (v: string) => string = (v) => v
): string[] {
  const set = new Set(existing);
  const extras: string[] = [];
  for (const raw of poolValues ?? []) {
    if (!raw) continue;
    const t = normalizer(raw);
    if (!t || set.has(t)) continue;
    set.add(t);
    extras.push(t);
  }
  extras.sort();
  return [...existing, ...extras];
}

export interface DiamondPoolDistinctValues {
  shapes: string[];
  colors: string[];
  clarities: string[];
  cuts: string[];
  polish: string[];
  symmetry: string[];
  fluorescence: string[];
  labs: string[];
}

```

---

## `src/components/ring-builder/steps/StoneStep.tsx`

```tsx
import { useEffect, useMemo, useState } from 'react';
import { Stone } from '@/types/ring-builder';
import { MOCK_NATURAL_STONES, MOCK_LAB_STONES } from '@/data/ring-builder-mock';
import { Card } from '@/components/ui/card';
import { StepHeader } from './StepHeader';
import { Diamond, Check, Info } from 'lucide-react';
import { StoneInfoDialog } from '../StoneInfoDialog';
import { DiamondDetailInfoDialog } from '../DiamondDetailInfoDialog';
import { ClientDiamondPreset } from '@/hooks/useClientDiamondPresets';
import { getDiamondShapeIcon } from '@/lib/diamond-shape-icons';
import { supabase } from '@/integrations/supabase/client';
const normalizeShapeId = (value?: string | null) => String(value ?? '').trim().toLowerCase();
const getBucketStart = (value: number) => Math.floor(Number(value) * 2) / 2;

interface StoneStepProps {
  selected: Stone | null;
  onSelect: (stone: Stone) => void;
  selectedShape?: string | null;
  selectedCaratRange?: number | null;
  diamondPresets?: ClientDiamondPreset[];
  clientId?: string | null;
  currency?: string;
}

export const StoneStep = ({ 
  selected, 
  onSelect, 
  selectedShape,
  selectedCaratRange,
  diamondPresets = [],
  clientId,
  currency = 'USD'
}: StoneStepProps) => {
  const [expandedType, setExpandedType] = useState<'natural' | 'lab' | null>(() => {
    if (!selected) return null;
    return selected.type === 'lab' ? 'lab' : selected.type === 'natural' ? 'natural' : null;
  });
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [infoStoneType, setInfoStoneType] = useState<'natural' | 'lab' | null>(null);
  const [detailPreset, setDetailPreset] = useState<ClientDiamondPreset | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [livePresets, setLivePresets] = useState<ClientDiamondPreset[] | null>(null);

  const handleStoneInfoClick = (e: React.MouseEvent, type: 'natural' | 'lab') => {
    e.stopPropagation();
    setInfoStoneType(type);
    setInfoDialogOpen(true);
  };

  useEffect(() => {
    let cancelled = false;

    const loadSelectedBucket = async () => {
      if (!clientId || !selectedShape || selectedCaratRange == null) {
        setLivePresets(null);
        return;
      }

      const shapeId = normalizeShapeId(selectedShape);
      const bucketStart = getBucketStart(selectedCaratRange);
      // Format must match what the RPC builds internally:
      //   TRIM(TO_CHAR(bucket,'FM0.00')) || '-' || TRIM(TO_CHAR(bucket+0.49,'FM0.00'))
      const caratRangeLabel = `${bucketStart.toFixed(2)}-${(bucketStart + 0.49).toFixed(2)}`;

      // Pass p_carat_range so the DB returns only this bucket's diamonds.
      // Without it, the RPC orders by carat_value ASC and the 2000-row limit
      // cuts off high-carat (expensive) diamonds in large catalogs.
      // Legacy unconfirmed rows with NULL carat_range will return 0 rows here,
      // which causes livePresets to stay null and the component falls back to
      // the diamondPresets prop (loaded by useClientDiamondPresets separately).
      const { data, error } = await supabase.rpc('get_diamond_presets_filtered', {
        p_client_id: clientId,
        p_shape_id: shapeId,
        p_carat_range: caratRangeLabel,
        p_page_size: 2000,
        p_offset: 0,
      });

      if (cancelled) return;

      if (error) {
        console.error('[StoneStep] RPC error', { shapeId, bucketStart, error });
        setLivePresets(null);
        return;
      }

      const rows = ((data ?? []) as Record<string, unknown>[]).map((preset) => ({
        id: preset.id as string,
        stone_type: preset.stone_type as 'natural' | 'lab',
        shape_id: preset.shape_id as string,
        carat_range: preset.carat_range as string,
        carat_value: Number(preset.carat_value),
        color: preset.color as string,
        clarity: preset.clarity as string,
        base_price: Number(preset.base_price),
        custom_price: preset.custom_price !== null ? Number(preset.custom_price) : null,
        is_enabled: preset.is_enabled as boolean,
        cut_grade: (preset.cut_grade as string) ?? null,
        fluorescence: (preset.fluorescence as string) ?? null,
        report_no: (preset.report_no as string) ?? null,
      }));

      console.log(
        `[StoneStep] loaded ${rows.length} rows for shape="${shapeId}" bucket=${bucketStart}`,
        rows.length > 0 ? { sample: rows[0] } : '(empty)',
      );

      setLivePresets(rows.length > 0 ? rows : null);
    };

    loadSelectedBucket();
    return () => {
      cancelled = true;
    };
  }, [clientId, selectedShape, selectedCaratRange]);
  
  // Filter presets by current shape and carat bucket (selectedCaratRange is
  // the bucket start, e.g. 1.5 covers all diamonds 1.50–1.99 ct).
  const filteredPresets = useMemo(() => {
    const sourcePresets = livePresets && livePresets.length > 0 ? livePresets : diamondPresets;
    if (!selectedShape || selectedCaratRange == null || sourcePresets.length === 0) return [];
    const selectedShapeId = normalizeShapeId(selectedShape);
    const bucketStart = getBucketStart(selectedCaratRange);
    return sourcePresets.filter(preset =>
      normalizeShapeId(preset.shape_id) === selectedShapeId &&
      getBucketStart(preset.carat_value) === bucketStart,
    );
  }, [diamondPresets, livePresets, selectedShape, selectedCaratRange]);

  const priceOf = (p: ClientDiamondPreset) => p.custom_price ?? p.base_price;

  // Keep only the highest-priced diamond per (color, clarity) group.
  // filteredPresets is already scoped to a single carat bucket, so color+clarity
  // is the full visible key ("D Color  IF"). Sort desc first so the first hit
  // per key is always the most expensive.
  const deduplicateByColorClarity = (presets: ClientDiamondPreset[]): ClientDiamondPreset[] => {
    const seen = new Set<string>();
    return presets.filter(p => {
      const key = `${p.color}|${p.clarity}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const naturalOptions = useMemo(
    () => deduplicateByColorClarity(
      filteredPresets.filter(p => p.stone_type === 'natural').sort((a, b) => priceOf(b) - priceOf(a))
    ),
    [filteredPresets]
  );
  const labOptions = useMemo(
    () => deduplicateByColorClarity(
      filteredPresets.filter(p => p.stone_type === 'lab').sort((a, b) => priceOf(b) - priceOf(a))
    ),
    [filteredPresets]
  );

  const presetToStone = (preset: ClientDiamondPreset): Stone => ({
    id: preset.id,
    type: preset.stone_type,
    price: preset.custom_price ?? preset.base_price,
    carat: preset.carat_value,
    color: preset.color,
    clarity: preset.clarity,
    reportNo: preset.report_no ?? null,
  });

  const naturalStone = naturalOptions.length > 0 ? presetToStone(naturalOptions[0]) : MOCK_NATURAL_STONES[0];
  const labStone = labOptions.length > 0 ? presetToStone(labOptions[0]) : MOCK_LAB_STONES[0];

  // When livePresets loads (after a stale diamondPresets selection), the
  // selected stone may have been deduplicated away. Auto-upgrade to the best
  // available option for that type so the selection stays consistent.
  useEffect(() => {
    if (!selected || !expandedType) return;
    const options = expandedType === 'natural' ? naturalOptions : labOptions;
    if (options.length === 0) return;
    const stillAvailable = options.some(o => o.id === selected.id);
    if (!stillAvailable) {
      onSelect(presetToStone(options[0]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [naturalOptions, labOptions]);

  const hasCatalogPresets = (livePresets?.length ?? 0) > 0 || diamondPresets.length > 0;
  const hasNaturalOptions = naturalOptions.length > 0 || !hasCatalogPresets;
  const hasLabOptions = labOptions.length > 0 || !hasCatalogPresets;

  const selectedType: 'natural' | 'lab' | null = (() => {
    if (!selected) return null;
    if (naturalOptions.some((s) => s.id === selected.id)) return 'natural';
    if (labOptions.some((s) => s.id === selected.id)) return 'lab';
    if (MOCK_LAB_STONES.some((s) => s.id === selected.id)) return 'lab';
    if (MOCK_NATURAL_STONES.some((s) => s.id === selected.id)) return 'natural';
    return null;
  })();

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);
  };

  const handleTypeClick = (type: 'natural' | 'lab') => {
    setExpandedType(type);
    const options = type === 'natural' ? naturalOptions : labOptions;
    if (options.length > 0) {
      onSelect(presetToStone(options[0]));
    } else {
      onSelect(type === 'natural' ? naturalStone : labStone);
    }
  };

  const expandedOptions = useMemo(() => {
    if (!expandedType) return [];
    return expandedType === 'natural' ? naturalOptions : labOptions;
  }, [expandedType, naturalOptions, labOptions]);


  const shapeIcon = selectedShape ? getDiamondShapeIcon(selectedShape) : null;

  return (
    <div className="p-3 md:p-4 space-y-3">
      <StepHeader 
        description="Choose between natural and lab-created"
      />

      <div className="grid grid-cols-2 gap-1.5 md:gap-2 max-w-xl mx-auto">
        {hasNaturalOptions && (
          <Card
            onClick={() => handleTypeClick('natural')}
            className={`p-2.5 md:p-4 cursor-pointer transition-all duration-200 active:scale-[0.98] rounded-none relative ${
              selectedType === 'natural' || expandedType === 'natural'
                ? 'border-2 border-accent bg-accent/[0.12]'
                : 'border border-white/15 bg-transparent hover:border-white/30'
            }`}
          >
            <button onClick={(e) => handleStoneInfoClick(e, 'natural')} className="absolute top-3 right-3 p-0.5 rounded-full hover:bg-white/10 transition-colors">
              <Info className="w-3.5 h-3.5 text-foreground/70" />
            </button>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {shapeIcon ? (
                  <img src={shapeIcon} alt="diamond shape" className="w-12 h-12 object-contain" />
                ) : (
                  <Diamond className={`h-10 w-10 ${selectedType === 'natural' ? 'text-foreground' : 'text-muted-foreground'}`} />
                )}
                <div className="text-sm font-semibold tracking-wide">Natural Diamond</div>
              </div>
              
            </div>

          </Card>
        )}

        {hasLabOptions && (
          <Card
            onClick={() => handleTypeClick('lab')}
            className={`p-2.5 md:p-4 cursor-pointer transition-all duration-200 active:scale-[0.98] rounded-none relative ${
              selectedType === 'lab' || expandedType === 'lab'
                ? 'border-2 border-accent bg-accent/[0.12]'
                : 'border border-white/15 bg-transparent hover:border-white/30'
            }`}
          >
            <button onClick={(e) => handleStoneInfoClick(e, 'lab')} className="absolute top-3 right-3 p-0.5 rounded-full hover:bg-white/10 transition-colors">
              <Info className="w-3.5 h-3.5 text-foreground/70" />
            </button>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {shapeIcon ? (
                  <img src={shapeIcon} alt="diamond shape" className="w-12 h-12 object-contain" />
                ) : (
                  <Diamond className={`h-10 w-10 ${selectedType === 'lab' ? 'text-foreground' : 'text-muted-foreground'}`} />
                )}
                <div className="text-sm font-semibold tracking-wide">Lab Diamond</div>
              </div>
            </div>


          </Card>
        )}
      </div>

      {/* Expanded diamond options list */}
      {expandedType && expandedOptions.length > 0 && (
        <div className="mt-4 max-w-xl mx-auto">
          <h3 className="text-sm font-semibold mb-2 text-center text-foreground">
            Available {expandedType === 'natural' ? 'Natural' : 'Lab'} Diamonds
          </h3>
          <div className="border border-white/15">
            {expandedOptions.map((preset) => {
              const isChosen = selected?.id === preset.id;
              return (
                <div
                  key={preset.id}
                  onClick={() => onSelect(presetToStone(preset))}
                  className={`flex items-center justify-between p-3 py-4 border-b border-white/15 last:border-b-0 cursor-pointer transition-all ${
                    isChosen ? 'bg-white/[0.06]' : 'hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {shapeIcon && <img src={shapeIcon} alt="diamond shape" className="w-10 h-10 object-contain" />}
                    <span className="text-sm font-medium text-foreground">{preset.color} Color</span>
                    <span className="text-sm text-muted-foreground">{preset.clarity}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {formatPrice(preset.custom_price ?? preset.base_price)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailPreset(preset);
                        setDetailOpen(true);
                      }}
                      className="p-0.5 rounded-full hover:bg-white/10 transition-colors"
                    >
                      <Info className="w-3.5 h-3.5 text-foreground/70" />
                    </button>
                    {isChosen && <Check className="w-4 h-4 text-foreground" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {diamondPresets.length > 0 && filteredPresets.length === 0 && (
        <p className="text-center text-sm text-muted-foreground mt-4">
          No diamond options available for the selected shape and carat weight.
        </p>
      )}

      <StoneInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} stoneType={infoStoneType} />
      <DiamondDetailInfoDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        preset={detailPreset}
        selectedShape={selectedShape ?? null}
        onSelectDiamond={detailPreset ? () => onSelect(presetToStone(detailPreset)) : undefined}
      />
    </div>
  );
};

```

---

## `src/components/ring-builder/WizardRingBuilder.tsx`

```tsx
import { useState, useMemo, useRef, useEffect } from 'react';
import { FormWizardShell, type WizardStep } from '@/components/form-wizard/FormWizardShell';
import { StepHeading } from '@/components/form-wizard/StepHeading';
import { WizardOptionGrid } from '@/components/form-wizard/WizardOptionGrid';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Info, Diamond, Check, Eye } from 'lucide-react';
import { useRingConfiguration } from '@/hooks/useRingConfiguration';
import { StyleOption, ShankOption, MetalOption, ShapeOption, Stone } from '@/types/ring-builder';
import { ClientCaratOption } from '@/hooks/useClientCaratOptions';
import { ClientDiamondPreset } from '@/hooks/useClientDiamondPresets';
import { getDiamondShapeIcon } from '@/lib/diamond-shape-icons';
import { MOCK_SIZES } from '@/data/ring-builder-mock';
import { StoneInfoDialog } from './StoneInfoDialog';
import { DiamondDetailInfoDialog } from './DiamondDetailInfoDialog';
import { MOCK_NATURAL_STONES, MOCK_LAB_STONES } from '@/data/ring-builder-mock';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { ClientRingFormConfig } from '@/hooks/useClientRingFormConfig';
import { CaratViewerDialog } from './CaratViewerDialog';
import { useCaratSizeImages } from '@/hooks/useCaratSizeImages';

// --- Types ---
interface WizardRingBuilderProps {
  clientId?: string;
  catalogOptions: {
    styles: StyleOption[];
    shanks: ShankOption[];
    metals: MetalOption[];
    shapes: ShapeOption[];
    caratOptions: ClientCaratOption[];
    diamondPresets: ClientDiamondPreset[];
  };
  branding?: {
    primaryColor?: string;
    secondaryColor?: string;
    themeColors?: any;
  };
  ringConfig: ReturnType<typeof useRingConfiguration>;
  ringFormConfig?: ClientRingFormConfig | null;
  onAddToCart: () => void;
  pricingMode?: string;
  depositAmount?: number;
}

// --- Band widths ---
const BAND_WIDTHS = ['2mm', '2.5mm', '3mm', '3.5mm', '4mm', '4.5mm+'];

// --- Theme helper ---
function useWizardTheme(branding?: WizardRingBuilderProps['branding']) {
  return {
    bg: '#0a0a0a',
    font: '#ffffff',
    accent: branding?.primaryColor || '#77bb41',
    submitBg: branding?.primaryColor || undefined,
    submitText: '#ffffff',
  };
}

// --- Helper to convert title ---
const toTitleCase = (value: string) =>
  value.split('-').map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : w).join(' ');

export function WizardRingBuilder({
  clientId,
  catalogOptions,
  branding,
  ringConfig,
  ringFormConfig,
  onAddToCart,
  pricingMode,
  depositAmount = 0,
}: WizardRingBuilderProps) {
  const theme = useWizardTheme(branding);
  const {
    configuration,
    currentStep,
    updateStyle,
    updateShank,
    updateMetal,
    updateShape,
    updateCaratRange,
    updateStone,
    updateEngraving,
    updateSize,
    calculatePrice,
    canAdvanceStep,
    goToNextStep,
    goToPreviousStep,
    goToStep,
  } = ringConfig;

  const [caratViewerOpen, setCaratViewerOpen] = useState(false);
  const [caratViewerInitialValue, setCaratViewerInitialValue] = useState(0.5);
  const { getCaratImage } = useCaratSizeImages();

  const handleViewCarat = (caratValue: number) => {
    setCaratViewerInitialValue(caratValue);
    setCaratViewerOpen(true);
  };

  // Auto-advance timer
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoAdvance = () => {
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    autoAdvanceTimer.current = setTimeout(() => {
      goToNextStep();
    }, 900);
  };
  useEffect(() => {
    return () => { if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current); };
  }, []);

  // Stone dialog state
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [infoStoneType, setInfoStoneType] = useState<'natural' | 'lab' | null>(null);
  const [detailPreset, setDetailPreset] = useState<ClientDiamondPreset | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [expandedType, setExpandedType] = useState<'natural' | 'lab' | null>(null);

  // Format price — WizardRingBuilder is only used internally, no embed/currency context yet
  const formatPrice = (price: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);

  // --- Stone logic ---
  // configuration.caratRange is the bucket start (e.g. 0.5 covers 0.50–0.99).
  const filteredPresets = useMemo(() => {
    if (!configuration.shape || configuration.caratRange == null || catalogOptions.diamondPresets.length === 0) return [];
    const bucketStart = Number(configuration.caratRange);
    const bucketEnd = bucketStart + 0.5; // exclusive
    return catalogOptions.diamondPresets.filter(p =>
      p.shape_id === configuration.shape &&
      p.carat_value >= bucketStart &&
      p.carat_value < bucketEnd
    );
  }, [catalogOptions.diamondPresets, configuration.shape, configuration.caratRange]);

  const naturalOptions = useMemo(() => filteredPresets.filter(p => p.stone_type === 'natural'), [filteredPresets]);
  const labOptions = useMemo(() => filteredPresets.filter(p => p.stone_type === 'lab'), [filteredPresets]);

  const presetToStone = (preset: ClientDiamondPreset): Stone => ({
    id: preset.id,
    type: preset.stone_type,
    price: preset.custom_price ?? preset.base_price,
    carat: preset.carat_value,
    color: preset.color,
    clarity: preset.clarity,
  });

  const handleTypeClick = (type: 'natural' | 'lab') => {
    setExpandedType(type);
    const options = type === 'natural' ? naturalOptions : labOptions;
    if (options.length > 0) {
      updateStone(presetToStone(options[0]));
    } else {
      updateStone(type === 'natural' ? MOCK_NATURAL_STONES[0] : MOCK_LAB_STONES[0]);
    }
  };

  const expandedOptions = useMemo(() => {
    if (!expandedType) return [];
    return expandedType === 'natural' ? naturalOptions : labOptions;
  }, [expandedType, naturalOptions, labOptions]);

  const selectedStoneType: 'natural' | 'lab' | null = (() => {
    if (!configuration.stone) return null;
    if (naturalOptions.some(s => s.id === configuration.stone?.id)) return 'natural';
    if (labOptions.some(s => s.id === configuration.stone?.id)) return 'lab';
    return null;
  })();

  const shapeIcon = configuration.shape ? getDiamondShapeIcon(configuration.shape) : null;

  // --- Build Steps ---
  const steps: WizardStep[] = [];

  // Step 1: Style
  steps.push({
    key: 'style',
    label: 'STYLE',
    content: (
      <div className="space-y-6">
        <StepHeading preText="CHOOSE YOUR" highlightText="STYLE" subtitle="Select the setting style for your ring" accentColor={theme.accent} fontColor={theme.font} />
        <WizardOptionGrid
          options={catalogOptions.styles.map(s => ({ value: s.id, label: s.name }))}
          selectedValue={configuration.style || ''}
          onSelect={(v) => { updateStyle(v); autoAdvance(); }}
          columns={2}
          accentColor={theme.accent}
          fontColor={theme.font}
        />
      </div>
    ),
  });

  // Step 2: Shank / Band Type
  steps.push({
    key: 'shank',
    label: 'BAND',
    content: (
      <div className="space-y-6">
        <StepHeading preText="SELECT YOUR" highlightText="BAND" subtitle="Choose the band type for your ring" accentColor={theme.accent} fontColor={theme.font} />
        <WizardOptionGrid
          options={catalogOptions.shanks.map(s => ({ value: s.id, label: s.name }))}
          selectedValue={configuration.shank || ''}
          onSelect={(v) => { updateShank(v); autoAdvance(); }}
          columns={2}
          accentColor={theme.accent}
          fontColor={theme.font}
        />
      </div>
    ),
  });

  // Step 3: Metal
  steps.push({
    key: 'metal',
    label: 'METAL',
    content: (
      <div className="space-y-6">
        <StepHeading preText="CHOOSE YOUR" highlightText="METAL" subtitle="Select the metal type and color" accentColor={theme.accent} fontColor={theme.font} />
        <WizardOptionGrid
          options={catalogOptions.metals.map(m => ({ value: m.id, label: m.name }))}
          selectedValue={configuration.metal || ''}
          onSelect={(v) => { updateMetal(v); autoAdvance(); }}
          columns={2}
          accentColor={theme.accent}
          fontColor={theme.font}
        />
      </div>
    ),
  });

  // Step 4: Shape
  steps.push({
    key: 'shape',
    label: 'SHAPE',
    content: (
      <div className="space-y-6">
        <StepHeading preText="SELECT DIAMOND" highlightText="SHAPE" subtitle="Choose the shape of your center stone" accentColor={theme.accent} fontColor={theme.font} />
        <WizardOptionGrid
          options={catalogOptions.shapes.map(s => ({ value: s.id, label: s.name }))}
          selectedValue={configuration.shape || ''}
          onSelect={(v) => { updateShape(v); autoAdvance(); }}
          columns={3}
          accentColor={theme.accent}
          fontColor={theme.font}
        />
      </div>
    ),
  });

  // Step 5: Carat
  steps.push({
    key: 'carat',
    label: 'CARAT',
    content: (
      <div className="space-y-6">
        <StepHeading preText="CHOOSE" highlightText="CARAT" subtitle="Select the carat weight for your diamond" accentColor={theme.accent} fontColor={theme.font} />
        <WizardOptionGrid
          options={catalogOptions.caratOptions
            .filter(c => c.is_enabled)
            .map(c => {
              const CARAT_RANGE_LABELS: Record<number, string> = { 0.5: '0.50 - 0.99', 1: '1.00 - 1.49', 1.5: '1.50 - 1.99', 2: '2.00 - 2.49', 2.5: '2.50 - 2.99', 3: '3.00 - 3.49', 3.5: '3.50 - 3.99', 4: '4.00 - 4.49', 4.5: '4.50 - 4.99' };
              const image = getCaratImage(configuration.shape, c.carat_value);
              return { value: String(c.carat_value), label: CARAT_RANGE_LABELS[c.carat_value] ?? c.display_name.replace(/carat/i, '').trim(), image };
            })}
          selectedValue={configuration.caratRange != null ? String(configuration.caratRange) : ''}
          onSelect={(v) => { updateCaratRange(Number(v)); autoAdvance(); }}
          columns={3}
          accentColor={theme.accent}
          fontColor={theme.font}
          renderExtra={(option) => (
            <button
              onClick={(e) => { e.stopPropagation(); handleViewCarat(Number(option.value)); }}
              className="absolute top-1.5 right-1.5 p-0.5 rounded-full opacity-60 hover:opacity-100 transition-opacity z-10"
              style={{ color: theme.accent }}
              aria-label="View carat on hand"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}
        />
      </div>
    ),
  });

  // Step 6: Stone
  const hasNatural = naturalOptions.length > 0 || catalogOptions.diamondPresets.length === 0;
  const hasLab = labOptions.length > 0 || catalogOptions.diamondPresets.length === 0;

  steps.push({
    key: 'stone',
    label: 'STONE',
    content: (
      <div className="space-y-6">
        <StepHeading preText="SELECT YOUR" highlightText="STONE" subtitle="Choose between natural and lab-created" accentColor={theme.accent} fontColor={theme.font} />
        <div className="grid grid-cols-2 gap-3 px-4 md:px-8 max-w-lg mx-auto">
          {hasNatural && (
            <button
              type="button"
              onClick={() => handleTypeClick('natural')}
              className="relative p-4 rounded-xl border-2 transition-all duration-200 text-left"
              style={{
                backgroundColor: selectedStoneType === 'natural' ? `${theme.accent}20` : 'transparent',
                borderColor: selectedStoneType === 'natural' ? theme.accent : 'rgba(255,255,255,0.15)',
              }}
            >
              <div className="space-y-2">
                {shapeIcon ? (
                  <img src={shapeIcon} alt="diamond" className="w-12 h-12 object-contain" />
                ) : (
                  <Diamond className="w-10 h-10" style={{ color: theme.font }} />
                )}
                <div className="text-sm font-bold uppercase tracking-wide" style={{ color: theme.font }}>Natural</div>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {naturalOptions.length > 0 ? `${naturalOptions[0].color} / ${naturalOptions[0].clarity}` : 'Traditional, mined diamond'}
                </p>
                {naturalOptions.length > 0 && (
                  <p className="text-sm font-semibold" style={{ color: theme.accent }}>
                    {formatPrice(naturalOptions[0].custom_price ?? naturalOptions[0].base_price)}
                  </p>
                )}
              </div>
            </button>
          )}
          {hasLab && (
            <button
              type="button"
              onClick={() => handleTypeClick('lab')}
              className="relative p-4 rounded-xl border-2 transition-all duration-200 text-left"
              style={{
                backgroundColor: selectedStoneType === 'lab' ? `${theme.accent}20` : 'transparent',
                borderColor: selectedStoneType === 'lab' ? theme.accent : 'rgba(255,255,255,0.15)',
              }}
            >
              <div className="space-y-2">
                {shapeIcon ? (
                  <img src={shapeIcon} alt="diamond" className="w-12 h-12 object-contain" />
                ) : (
                  <Diamond className="w-10 h-10" style={{ color: theme.font }} />
                )}
                <div className="text-sm font-bold uppercase tracking-wide" style={{ color: theme.font }}>Lab Created</div>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  {labOptions.length > 0 ? `${labOptions[0].color} / ${labOptions[0].clarity}` : 'Lab-grown, same chemistry'}
                </p>
                {labOptions.length > 0 && (
                  <p className="text-sm font-semibold" style={{ color: theme.accent }}>
                    {formatPrice(labOptions[0].custom_price ?? labOptions[0].base_price)}
                  </p>
                )}
              </div>
            </button>
          )}
        </div>

        {/* Expanded diamond list */}
        {expandedType && expandedOptions.length > 1 && (
          <div className="max-w-lg mx-auto px-4 md:px-8">
            <h3 className="text-sm font-semibold mb-2 text-center" style={{ color: `${theme.font}99` }}>
              Available {expandedType === 'natural' ? 'Natural' : 'Lab'} Diamonds
            </h3>
            <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
              {expandedOptions.map((preset) => {
                const isChosen = configuration.stone?.id === preset.id;
                return (
                  <div
                    key={preset.id}
                    onClick={() => updateStone(presetToStone(preset))}
                    className="flex items-center justify-between p-3 cursor-pointer transition-all"
                    style={{
                      backgroundColor: isChosen ? 'rgba(255,255,255,0.06)' : 'transparent',
                      borderBottom: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {shapeIcon && <img src={shapeIcon} alt="shape" className="w-8 h-8 object-contain" />}
                      <span className="text-sm font-medium" style={{ color: theme.font }}>{preset.color} Color</span>
                      <span className="text-sm" style={{ color: `${theme.font}80` }}>{preset.clarity}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" style={{ color: theme.font }}>
                        {formatPrice(preset.custom_price ?? preset.base_price)}
                      </span>
                      {isChosen && <Check className="w-4 h-4" style={{ color: theme.accent }} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {catalogOptions.diamondPresets.length > 0 && filteredPresets.length === 0 && (
          <p className="text-center text-sm" style={{ color: `${theme.font}80` }}>
            No diamond options available for the selected shape and carat.
          </p>
        )}
      </div>
    ),
  });

  // Step 7: Engraving & Size
  const maxLength = 20;
  const charCount = configuration.engraving.text.replace(/\s/g, '').length;

  steps.push({
    key: 'personalize',
    label: 'PERSONALIZE',
    content: (
      <div className="space-y-6">
        <StepHeading preText="PERSONALIZE YOUR" highlightText="RING" subtitle="Add engraving and select your ring size" accentColor={theme.accent} fontColor={theme.font} />
        <div className="max-w-lg mx-auto w-full px-4 md:px-8 space-y-5">
          {/* Engraving toggle */}
          <div className="flex items-center space-x-3 p-4 rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.15)' }}>
            <Checkbox
              id="wizard-engraving"
              checked={configuration.engraving.enabled}
              onCheckedChange={(checked) => updateEngraving({
                enabled: !!checked,
                text: configuration.engraving.text,
                bandWidth: configuration.engraving.bandWidth,
                otherRequest: configuration.engraving.otherRequest,
              })}
              className="h-5 w-5 border-white/30 data-[state=checked]:border-transparent"
              style={{ '--tw-ring-color': theme.accent } as any}
            />
            <Label htmlFor="wizard-engraving" className="text-sm font-semibold cursor-pointer" style={{ color: theme.font }}>
              Add Ring Engraving <span className="text-xs uppercase tracking-wider ml-1" style={{ color: theme.accent }}>Complimentary</span>
            </Label>
          </div>

          {configuration.engraving.enabled && (
            <div className="space-y-2">
              <Input
                placeholder="Enter your engraving text"
                value={configuration.engraving.text}
                onChange={(e) => {
                  const newText = e.target.value;
                  if (newText.replace(/\s/g, '').length <= maxLength) {
                    updateEngraving({ ...configuration.engraving, text: newText });
                  }
                }}
                className="bg-transparent border-2 rounded-xl text-sm"
                style={{ borderColor: 'rgba(255,255,255,0.15)', color: theme.font }}
              />
              <div className="flex justify-between text-xs" style={{ color: `${theme.font}60` }}>
                <span>Character limit does not include spaces</span>
                <span className="font-semibold">{charCount}/{maxLength}</span>
              </div>
            </div>
          )}

          {/* Ring Size */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold uppercase tracking-wider" style={{ color: `${theme.font}99` }}>Ring Size</Label>
            <div className="grid grid-cols-5 gap-2">
              {MOCK_SIZES.map((s) => {
                const isSelected = configuration.size === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => updateSize(s)}
                    className="h-10 rounded-xl text-sm font-semibold transition-all duration-200 border-2"
                    style={{
                      backgroundColor: isSelected ? theme.accent : 'transparent',
                      borderColor: isSelected ? theme.accent : 'rgba(255,255,255,0.15)',
                      color: isSelected ? '#fff' : theme.font,
                    }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4" style={{ color: `${theme.font}60` }} />
              <span className="text-xs" style={{ color: `${theme.font}60` }}>If between sizes, go larger. Wide bands need half size up.</span>
            </div>
          </div>
        </div>
      </div>
    ),
  });

  // Step 8: Review
  const price = calculatePrice();

  // Build summary items
  const summaryItems = useMemo(() => {
    const items: { label: string; value: string }[] = [];
    if (configuration.style) {
      const opt = catalogOptions.styles.find(s => s.id === configuration.style);
      items.push({ label: 'Style', value: opt?.name || toTitleCase(configuration.style) });
    }
    if (configuration.shank) {
      const opt = catalogOptions.shanks.find(s => s.id === configuration.shank);
      items.push({ label: 'Band', value: opt?.name || toTitleCase(configuration.shank) });
    }
    if (configuration.metal) {
      const opt = catalogOptions.metals.find(m => m.id === configuration.metal);
      items.push({ label: 'Metal', value: opt?.name || toTitleCase(configuration.metal) });
    }
    if (configuration.shape) {
      const opt = catalogOptions.shapes.find(s => s.id === configuration.shape);
      items.push({ label: 'Shape', value: opt?.name || toTitleCase(configuration.shape) });
    }
    if (configuration.caratRange != null) {
      const opt = catalogOptions.caratOptions.find(c => c.carat_value === configuration.caratRange);
      items.push({ label: 'Carat', value: opt?.display_name || `${configuration.caratRange} ct` });
    }
    if (configuration.stone) {
      items.push({ label: 'Stone', value: `${configuration.stone.type === 'natural' ? 'Natural' : 'Lab'} — ${configuration.stone.color}/${configuration.stone.clarity}` });
    }
    if (configuration.size) items.push({ label: 'Size', value: configuration.size });
    if (configuration.engraving.enabled && configuration.engraving.text) {
      items.push({ label: 'Engraving', value: `"${configuration.engraving.text}"` });
    }
    return items;
  }, [configuration, catalogOptions]);

  steps.push({
    key: 'review',
    label: 'REVIEW',
    content: (
      <div className="space-y-6">
        <StepHeading preText="REVIEW &" highlightText="SUBMIT" subtitle="Review your custom ring design" accentColor={theme.accent} fontColor={theme.font} />
        <div className="max-w-lg mx-auto w-full px-4 md:px-8 space-y-5">
          {/* Summary */}
          <div className="space-y-2 p-4 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
            {summaryItems.map((item) => (
              <div key={item.label} className="flex justify-between py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="text-sm" style={{ color: `${theme.font}80` }}>{item.label}</span>
                <span className="text-sm font-semibold" style={{ color: theme.font }}>{item.value}</span>
              </div>
            ))}
            {price > 0 && (
              <div className="flex justify-between pt-3 mt-2" style={{ borderTop: '2px solid rgba(255,255,255,0.2)' }}>
                <span className="text-base font-bold" style={{ color: theme.font }}>Total</span>
                <span className="text-base font-bold" style={{ color: theme.accent }}>{formatPrice(price)}</span>
              </div>
            )}
          </div>

          {/* Band Width */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold uppercase tracking-wider" style={{ color: `${theme.font}99` }}>Band Width</Label>
            <div className="flex flex-wrap gap-2">
              {BAND_WIDTHS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => updateEngraving({ ...configuration.engraving, bandWidth: w })}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-all border-2"
                  style={{
                    backgroundColor: configuration.engraving.bandWidth === w ? theme.accent : 'transparent',
                    borderColor: configuration.engraving.bandWidth === w ? theme.accent : 'rgba(255,255,255,0.15)',
                    color: configuration.engraving.bandWidth === w ? '#fff' : theme.font,
                  }}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          {/* Other Request */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold uppercase tracking-wider" style={{ color: `${theme.font}99` }}>Additional Notes</Label>
            <Textarea
              value={configuration.engraving.otherRequest}
              onChange={e => updateEngraving({ ...configuration.engraving, otherRequest: e.target.value.slice(0, 500) })}
              placeholder="Any special requests or preferences..."
              rows={3}
              maxLength={500}
              className="bg-transparent border-2 rounded-xl"
              style={{ borderColor: 'rgba(255,255,255,0.15)', color: theme.font }}
            />
          </div>

          <p className="text-xs text-center italic" style={{ color: `${theme.font}50` }}>
            * Prices may vary based on current gold market rates.
          </p>
        </div>
      </div>
    ),
  });

  // --- Navigation ---
  const isLastStep = currentStep === steps.length - 1;

  const isEstimates = pricingMode === 'estimates';

  const getNextLabel = () => {
    if (isLastStep) {
      if (isEstimates && depositAmount > 0) {
        return `PAY ${formatPrice(depositAmount)} DEPOSIT`;
      }
      return `ADD TO CART — ${formatPrice(price)}`;
    }
    const nextStep = steps[currentStep + 1];
    if (isEstimates) {
      const prefix = currentStep < 5 ? 'STARTING AT' : 'ESTIMATE';
      return `${prefix} ${formatPrice(price)} · ${nextStep?.label} >`;
    }
    return `NEXT: ${nextStep?.label} >`;
  };

  const getSelectedLabel = () => {
    switch (currentStep) {
      case 0: return configuration.style ? `Style: ${toTitleCase(configuration.style)}` : undefined;
      case 1: return configuration.shank ? `Band: ${toTitleCase(configuration.shank)}` : undefined;
      case 2: {
        const m = catalogOptions.metals.find(m => m.id === configuration.metal);
        return m ? `Metal: ${m.name}` : undefined;
      }
      case 3: {
        const s = catalogOptions.shapes.find(s => s.id === configuration.shape);
        return s ? `Shape: ${s.name}` : undefined;
      }
      case 4: return configuration.caratRange != null ? `Carat: ${configuration.caratRange}` : undefined;
      case 5: return configuration.stone ? `Stone: ${configuration.stone.type === 'natural' ? 'Natural' : 'Lab'}` : undefined;
      default: return undefined;
    }
  };

  const handleNext = () => {
    if (isLastStep) {
      onAddToCart();
    } else {
      goToNextStep();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) goToStep(currentStep - 1);
  };

  return (
    <>
      <FormWizardShell
        steps={steps}
        currentStep={currentStep}
        onNext={handleNext}
        onBack={handleBack}
        nextLabel={getNextLabel()
        }
        selectedLabel={getSelectedLabel()}
        isLastStep={isLastStep}
        canProceed={canAdvanceStep(currentStep)}
        backgroundColor={theme.bg}
        fontColor={theme.font}
        accentColor={theme.accent}
        submitButtonBg={theme.submitBg}
        submitButtonText={theme.submitText}
      />
      <StoneInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} stoneType={infoStoneType} />
      <DiamondDetailInfoDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        preset={detailPreset}
        selectedShape={configuration.shape ?? null}
        onSelectDiamond={detailPreset ? () => updateStone(presetToStone(detailPreset)) : undefined}
      />
      <CaratViewerDialog
        open={caratViewerOpen}
        onOpenChange={setCaratViewerOpen}
        caratOptions={catalogOptions.caratOptions}
        initialCaratValue={caratViewerInitialValue}
        onSelectCarat={(v) => updateCaratRange(v as any)}
        configuration={configuration}
      />
    </>
  );
}

```

---

## `src/components/ring-builder/ConfigurationPanel.tsx`

```tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { StepNavigation } from './StepNavigation';
import { ActionButtons } from './ActionButtons';
import { StyleStep } from './steps/StyleStep';
import { ShankStep } from './steps/ShankStep';
import { MetalStep } from './steps/MetalStep';
import { ShapeStep } from './steps/ShapeStep';
import { CaratStep } from './steps/CaratStep';
import { StoneStep } from './steps/StoneStep';
import { EngravingStep } from './steps/EngravingStep';
import { DetailsStep } from './steps/DetailsStep';
import { EstimateSummaryStep } from './steps/EstimateSummaryStep';
import { ExpertTip, STEP_TIPS } from './ExpertTip';
import { CaratViewerDialog } from './CaratViewerDialog';
import { RingStyle, RingShank, RingMetal, RingShape, CaratRange, Stone, StyleOption, ShankOption, MetalOption, ShapeOption } from '@/types/ring-builder';
import { ClientCaratOption } from '@/hooks/useClientCaratOptions';
import { ClientDiamondPreset } from '@/hooks/useClientDiamondPresets';
import { normalizeStepOrder, RING_STEP_LABELS, RingStepKey } from '@/lib/ring-step-order';

interface ConfigurationPanelProps {
  clientId?: string | null;
  ringConfig: ReturnType<typeof import('@/hooks/useRingConfiguration')['useRingConfiguration']>;
  onBookAppointment: () => void;
  onAIAssistant: () => void;
  onCompare: () => void;
  onSaveDesign: () => void;
  onAddToCart: () => void;
  currency?: string;
  showAIAssistant?: boolean;
  showComparison?: boolean;
  showSaveDesign?: boolean;
  catalogOptions?: {
    styles?: StyleOption[];
    shanks?: ShankOption[];
    metals?: MetalOption[];
    shapes?: ShapeOption[];
    caratOptions?: ClientCaratOption[];
    diamondPresets?: ClientDiamondPreset[];
    availableCaratBuckets?: number[];
  };
  pricingMode?: string;
  depositAmount?: number;
  stepOrder?: string[];
}

export const ConfigurationPanel = ({ 
  clientId,
  ringConfig, 
  onBookAppointment,
  onAIAssistant,
  onCompare,
  onSaveDesign,
  onAddToCart,
  currency = 'USD',
  showAIAssistant = true,
  showComparison = true,
  showSaveDesign = true,
  catalogOptions,
  pricingMode,
  depositAmount = 0,
  stepOrder,
}: ConfigurationPanelProps) => {
  const {
    configuration,
    currentStep,
    updateStyle,
    updateShank,
    updateMetal,
    updateShape,
    updateCaratRange,
    updateStone,
    updateEngraving,
    updateSize,
    calculatePrice,
    canAdvanceStep,
    goToNextStep,
    goToStep,
  } = ringConfig;

  const currentStepRef = useRef(currentStep);
  const [caratViewerOpen, setCaratViewerOpen] = useState(false);
  const [caratViewerInitialValue, setCaratViewerInitialValue] = useState(0.5);

  const isEstimates = pricingMode === 'estimates';

  // Build the ordered key list. The synthetic "estimate" step is appended
  // when pricing mode is estimates and is never reorderable.
  const orderedKeys = useMemo<(RingStepKey | 'estimate')[]>(() => {
    const base = normalizeStepOrder(stepOrder);
    return isEstimates ? [...base, 'estimate' as const] : base;
  }, [stepOrder, isEstimates]);

  const lastStepIndex = orderedKeys.length - 1;
  const currentKey = orderedKeys[currentStep] ?? 'style';

  const stepLabels = useMemo(
    () => orderedKeys.map((k) => (k === 'estimate' ? 'ESTIMATE' : RING_STEP_LABELS[k])),
    [orderedKeys]
  );

  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  const noDiamondsForShape =
    (Array.isArray(catalogOptions?.availableCaratBuckets) && catalogOptions.availableCaratBuckets.length === 0) ||
    (Array.isArray(catalogOptions?.caratOptions) && catalogOptions.caratOptions.length === 0);

  // Key-based completion check (independent of position).
  const isKeyComplete = (key: RingStepKey | 'estimate'): boolean => {
    switch (key) {
      case 'style': return configuration.style !== null;
      case 'shank': return configuration.shank !== null;
      case 'metal': return configuration.metal !== null;
      case 'shape': return configuration.shape !== null;
      case 'carat': return configuration.caratRange !== null || noDiamondsForShape;
      case 'stone': return configuration.stone !== null || noDiamondsForShape;
      case 'engraving': return true; // optional
      case 'details': return true;   // optional
      case 'estimate': return true;
    }
  };

  const canGoNext = isKeyComplete(currentKey);

  const handleViewCarat = (caratValue: number) => {
    setCaratViewerInitialValue(caratValue);
    setCaratViewerOpen(true);
  };

  const productTitle = useMemo(() => {
    const parts: string[] = [];
    if (configuration.style) parts.push(toTitleCase(configuration.style));
    if (configuration.shank) parts.push(toTitleCase(configuration.shank));
    if (configuration.metal) parts.push(toTitleCase(configuration.metal));
    if (configuration.shape) parts.push(toTitleCase(configuration.shape));
    return parts.filter(Boolean).join(' ') || 'Custom Ring';
  }, [configuration.metal, configuration.shape, configuration.shank, configuration.style]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || target?.isContentEditable;
      if (isTyping) return;

      if (e.key === 'ArrowUp') {
        if (currentStepRef.current > 0) {
          e.preventDefault();
          goToStep(currentStepRef.current - 1);
        }
      }

      if (e.key === 'ArrowDown') {
        if (currentStepRef.current < lastStepIndex && isKeyComplete(orderedKeys[currentStepRef.current])) {
          e.preventDefault();
          goToStep(currentStepRef.current + 1);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToStep, lastStepIndex, orderedKeys, configuration, noDiamondsForShape]);

  const handleStyleSelect = (style: RingStyle) => updateStyle(style);
  const handleShankSelect = (shank: RingShank) => updateShank(shank);
  const handleMetalSelect = (metal: RingMetal) => updateMetal(metal);
  const handleShapeSelect = (shape: RingShape) => updateShape(shape);
  const handleCaratSelect = (caratRange: CaratRange) => updateCaratRange(caratRange);
  const handleStoneSelect = (stone: Stone) => updateStone(stone);
  const handleSizeSelect = (size: string) => updateSize(size);

  const completedSteps = useMemo(
    () => orderedKeys.map((k) => isKeyComplete(k)),
    [orderedKeys, configuration, noDiamondsForShape]
  );

  const renderStep = () => {
    switch (currentKey) {
      case 'style':
        return <StyleStep selected={configuration.style} onSelect={handleStyleSelect} options={catalogOptions?.styles} />;
      case 'shank':
        return <ShankStep selected={configuration.shank} onSelect={handleShankSelect} options={catalogOptions?.shanks} />;
      case 'metal':
        return <MetalStep selected={configuration.metal} onSelect={handleMetalSelect} options={catalogOptions?.metals} />;
      case 'shape':
        return <ShapeStep selected={configuration.shape} onSelect={handleShapeSelect} options={catalogOptions?.shapes} />;
      case 'carat':
        return <CaratStep selected={configuration.caratRange} onSelect={handleCaratSelect} caratOptions={catalogOptions?.caratOptions || []} availableBuckets={catalogOptions?.availableCaratBuckets} onViewCarat={handleViewCarat} selectedShape={configuration.shape} />;
      case 'stone':
        return (
          <StoneStep
            selected={configuration.stone}
            onSelect={handleStoneSelect}
            selectedShape={configuration.shape}
            selectedCaratRange={configuration.caratRange}
            diamondPresets={catalogOptions?.diamondPresets}
            clientId={clientId}
          />
        );
      case 'engraving':
        return (
          <EngravingStep
            enabled={configuration.engraving.enabled}
            text={configuration.engraving.text}
            bandWidth={configuration.engraving.bandWidth}
            otherRequest={configuration.engraving.otherRequest}
            size={configuration.size}
            onUpdate={updateEngraving}
            onSizeSelect={handleSizeSelect}
          />
        );
      case 'details':
        return (
          <DetailsStep
            bandWidth={configuration.engraving.bandWidth}
            otherRequest={configuration.engraving.otherRequest}
            onUpdate={(data) => updateEngraving({
              enabled: configuration.engraving.enabled,
              text: configuration.engraving.text,
              bandWidth: data.bandWidth,
              otherRequest: data.otherRequest,
            })}
          />
        );
      case 'estimate':
        return (
          <EstimateSummaryStep
            estimatedPrice={calculatePrice()}
            depositAmount={depositAmount}
            currency={currency}
          />
        );
      default:
        return null;
    }
  };

  const handleGoBack = () => {
    if (currentStep > 0) goToStep(currentStep - 1);
  };

  const handleStepChange = (step: number) => {
    if (step < 0 || step > lastStepIndex) return;
    goToStep(step);
  };

  const stepCard = (
    <div className="mx-auto w-full max-w-[520px] px-2 md:px-4 pt-0 md:pt-4">
      <div className="bg-card/40 backdrop-blur-xl animate-fade-in">
        {renderStep()}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <div className="flex-shrink-0">
        <StepNavigation
          currentStep={currentStep}
          onStepChange={handleStepChange}
          completedSteps={completedSteps}
          onGoBack={handleGoBack}
          canGoNext={canGoNext}
          stepLabels={stepLabels}
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide overscroll-contain">
        {stepCard}
      </div>

      <div className="flex-shrink-0">
        <ActionButtons
          price={calculatePrice()}
          currency={currency}
          productTitle={productTitle}
          onNext={() => {
            if (currentStep < lastStepIndex) goToStep(currentStep + 1);
          }}
          onBookAppointment={onBookAppointment}
          onAIAssistant={onAIAssistant}
          onCompare={onCompare}
          onSaveDesign={onSaveDesign}
          onAddToCart={onAddToCart}
          canAdvance={canGoNext}
          isLastStep={currentStep === lastStepIndex}
          showAIAssistant={showAIAssistant}
          showComparison={showComparison}
          showSaveDesign={showSaveDesign}
          pricingMode={pricingMode}
          depositAmount={depositAmount}
        />
      </div>
      <CaratViewerDialog
        open={caratViewerOpen}
        onOpenChange={setCaratViewerOpen}
        caratOptions={catalogOptions?.caratOptions || []}
        initialCaratValue={caratViewerInitialValue}
        onSelectCarat={(v) => handleCaratSelect(v as any)}
        configuration={configuration}
      />
    </div>
  );
};

const toTitleCase = (value: string) =>
  value
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');

```

---

## `src/components/ring-builder/ElegantConfigurationPanel.tsx`

```tsx
import { useMemo, useState } from 'react';
import { ElegantStepNavigation } from './ElegantStepNavigation';
import { ActionButtons } from './ActionButtons';
import { MetalStep } from './steps/MetalStep';
import { CaratStep } from './steps/CaratStep';
import { StoneStep } from './steps/StoneStep';
import { StyleStep } from './steps/StyleStep';
import { ShankStep } from './steps/ShankStep';
import { CaratViewerDialog } from './CaratViewerDialog';
import { EngravingStep } from './steps/EngravingStep';
import { ShapeStep } from './steps/ShapeStep';
import { DetailsStep } from './steps/DetailsStep';
import { EstimateSummaryStep } from './steps/EstimateSummaryStep';
import { RingStyle, RingShank, RingMetal, RingShape, CaratRange, Stone, StyleOption, ShankOption, MetalOption, ShapeOption } from '@/types/ring-builder';
import { ClientCaratOption } from '@/hooks/useClientCaratOptions';
import { ClientDiamondPreset } from '@/hooks/useClientDiamondPresets';
import { normalizeStepOrder, RING_STEP_LABELS, RING_STEP_TITLES, RingStepKey } from '@/lib/ring-step-order';

interface ElegantConfigurationPanelProps {
  clientId?: string | null;
  ringConfig: ReturnType<typeof import('@/hooks/useRingConfiguration')['useRingConfiguration']>;
  onBookAppointment: () => void;
  onAIAssistant: () => void;
  onCompare: () => void;
  onSaveDesign: () => void;
  onAddToCart: () => void;
  currency?: string;
  showAIAssistant?: boolean;
  showComparison?: boolean;
  showSaveDesign?: boolean;
  pricingMode?: string;
  depositAmount?: number;
  stepOrder?: string[];
  catalogOptions?: {
    styles?: StyleOption[];
    shanks?: ShankOption[];
    metals?: MetalOption[];
    shapes?: ShapeOption[];
    caratOptions?: ClientCaratOption[];
    diamondPresets?: ClientDiamondPreset[];
    availableCaratBuckets?: number[];
  };
}

export const ElegantConfigurationPanel = ({
  clientId,
  ringConfig,
  onBookAppointment,
  onAIAssistant,
  onCompare,
  onSaveDesign,
  onAddToCart,
  currency = 'USD',
  showAIAssistant = true,
  showComparison = true,
  showSaveDesign = true,
  pricingMode,
  depositAmount = 0,
  stepOrder,
  catalogOptions,
}: ElegantConfigurationPanelProps) => {
  const {
    configuration,
    currentStep,
    updateStyle,
    updateShank,
    updateMetal,
    updateShape,
    updateCaratRange,
    updateStone,
    updateEngraving,
    updateSize,
    calculatePrice,
    canAdvanceStep,
    goToNextStep,
    goToStep,
  } = ringConfig;

  const [caratViewerOpen, setCaratViewerOpen] = useState(false);
  const [caratViewerInitialValue, setCaratViewerInitialValue] = useState(0.5);

  const isEstimates = pricingMode === 'estimates';

  const orderedKeys = useMemo<(RingStepKey | 'estimate')[]>(() => {
    const base = normalizeStepOrder(stepOrder);
    return isEstimates ? [...base, 'estimate' as const] : base;
  }, [stepOrder, isEstimates]);

  const lastStepIndex = orderedKeys.length - 1;
  const currentKey = orderedKeys[currentStep] ?? 'style';

  const stepLabels = useMemo(
    () => orderedKeys.map((k) => (k === 'estimate' ? 'ESTIMATE' : RING_STEP_LABELS[k])),
    [orderedKeys]
  );

  const stepTitles = useMemo(
    () => orderedKeys.map((k) => (k === 'estimate' ? 'Your Estimate' : RING_STEP_TITLES[k])),
    [orderedKeys]
  );

  const handleViewCarat = (caratValue: number) => {
    setCaratViewerInitialValue(caratValue);
    setCaratViewerOpen(true);
  };

  const noDiamondsForShape =
    (Array.isArray(catalogOptions?.availableCaratBuckets) && catalogOptions.availableCaratBuckets.length === 0) ||
    (Array.isArray(catalogOptions?.caratOptions) && catalogOptions.caratOptions.length === 0);

  const isKeyComplete = (key: RingStepKey | 'estimate'): boolean => {
    switch (key) {
      case 'style': return configuration.style !== null;
      case 'shank': return configuration.shank !== null;
      case 'metal': return configuration.metal !== null;
      case 'shape': return configuration.shape !== null;
      case 'carat': return configuration.caratRange !== null || noDiamondsForShape;
      case 'stone': return configuration.stone !== null || noDiamondsForShape;
      case 'engraving': return true;
      case 'details': return true;
      case 'estimate': return true;
    }
  };

  const completedSteps = useMemo(
    () => orderedKeys.map((k) => isKeyComplete(k)),
    [orderedKeys, configuration, noDiamondsForShape]
  );

  const productTitle = useMemo(() => {
    const parts: string[] = [];
    if (configuration.style) parts.push(toTitleCase(configuration.style));
    if (configuration.shank) parts.push(toTitleCase(configuration.shank));
    if (configuration.metal) parts.push(toTitleCase(configuration.metal));
    if (configuration.shape) parts.push(toTitleCase(configuration.shape));
    return parts.filter(Boolean).join(' ') || 'Custom Ring';
  }, [configuration.metal, configuration.shape, configuration.shank, configuration.style]);

  const handleStepChange = (step: number) => {
    if (step >= 0 && step <= lastStepIndex) goToStep(step);
  };

  const renderStep = () => {
    switch (currentKey) {
      case 'style':
        return <StyleStep selected={configuration.style} onSelect={updateStyle} options={catalogOptions?.styles} />;
      case 'shank':
        return <ShankStep selected={configuration.shank} onSelect={updateShank} options={catalogOptions?.shanks} />;
      case 'metal':
        return <MetalStep selected={configuration.metal} onSelect={updateMetal} options={catalogOptions?.metals} />;
      case 'shape':
        return <ShapeStep selected={configuration.shape} onSelect={updateShape} options={catalogOptions?.shapes} />;
      case 'carat':
        return <CaratStep selected={configuration.caratRange} onSelect={updateCaratRange} caratOptions={catalogOptions?.caratOptions || []} availableBuckets={catalogOptions?.availableCaratBuckets} onViewCarat={handleViewCarat} selectedShape={configuration.shape} />;
      case 'stone':
        return (
          <StoneStep
            selected={configuration.stone}
            onSelect={updateStone}
            selectedShape={configuration.shape}
            selectedCaratRange={configuration.caratRange}
            diamondPresets={catalogOptions?.diamondPresets}
            clientId={clientId}
          />
        );
      case 'engraving':
        return (
          <EngravingStep
            enabled={configuration.engraving.enabled}
            text={configuration.engraving.text}
            bandWidth={configuration.engraving.bandWidth}
            otherRequest={configuration.engraving.otherRequest}
            size={configuration.size}
            onUpdate={updateEngraving}
            onSizeSelect={updateSize}
          />
        );
      case 'details':
        return (
          <DetailsStep
            bandWidth={configuration.engraving.bandWidth}
            otherRequest={configuration.engraving.otherRequest}
            onUpdate={(data) => updateEngraving({
              enabled: configuration.engraving.enabled,
              text: configuration.engraving.text,
              bandWidth: data.bandWidth,
              otherRequest: data.otherRequest,
            })}
          />
        );
      case 'estimate':
        return (
          <EstimateSummaryStep
            estimatedPrice={calculatePrice()}
            depositAmount={depositAmount}
            currency={currency}
          />
        );
      default:
        return null;
    }
  };

  const canGoNext = isKeyComplete(currentKey);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <div className="flex-shrink-0">
        <ElegantStepNavigation
          currentStep={currentStep}
          onStepChange={handleStepChange}
          completedSteps={completedSteps}
          stepLabels={stepLabels}
        />
      </div>

      <div className="flex-shrink-0 px-4 pt-1 md:px-6 md:pt-3">
        <h2 className="text-lg md:text-xl font-serif text-foreground" style={{ fontFamily: "'Cormorant Garamond', serif" }}>
          {stepTitles[currentStep] || ''}
        </h2>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide overscroll-contain">
        <div className="mx-auto w-full max-w-[520px] px-2 md:px-4">
          {renderStep()}
        </div>
      </div>

      <div className="flex-shrink-0">
        <ActionButtons
          price={calculatePrice()}
          currency={currency}
          productTitle={productTitle}
          onNext={() => {
            if (currentStep < lastStepIndex) goToStep(currentStep + 1);
          }}
          onBookAppointment={onBookAppointment}
          onAIAssistant={onAIAssistant}
          onCompare={onCompare}
          onSaveDesign={onSaveDesign}
          onAddToCart={onAddToCart}
          canAdvance={canGoNext}
          currentStep={currentStep}
          isLastStep={currentStep === lastStepIndex}
          showAIAssistant={showAIAssistant}
          showComparison={showComparison}
          showSaveDesign={showSaveDesign}
          pricingMode={pricingMode}
          depositAmount={depositAmount}
        />
      </div>
      <CaratViewerDialog
        open={caratViewerOpen}
        onOpenChange={setCaratViewerOpen}
        caratOptions={catalogOptions?.caratOptions || []}
        initialCaratValue={caratViewerInitialValue}
        onSelectCarat={(v) => updateCaratRange(v as any)}
        configuration={configuration}
      />
    </div>
  );
};

const toTitleCase = (value: string) =>
  value
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');

```

---

## `src/components/ring-builder/DiamondDetailInfoDialog.tsx`

```tsx
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ClientDiamondPreset } from '@/hooks/useClientDiamondPresets';
import { ShapeIcon } from '@/components/common/ShapeIcon';
import { useWidgetTheme } from '@/contexts/WidgetThemeContext';

interface DiamondDetailInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preset: ClientDiamondPreset | null;
  selectedShape: string | null;
  onSelectDiamond?: () => void;
  currency?: string;
}

// Educational content maps

const colorDescriptions: Record<string, string> = {
  D: 'D is the highest colour grade, meaning the diamond is completely colourless. These exceptionally rare stones allow maximum light to pass through, producing unmatched brilliance and fire.',
  E: 'E colour diamonds are virtually colourless. Only a trained gemologist can detect the minutest traces of colour under controlled conditions. To the naked eye, they appear identical to D grade.',
  F: 'F colour diamonds are also in the "colourless" category. They contain minute traces of colour detectable only by an expert gemologist, making them an excellent value within the top tier.',
  G: 'G colour is the top of the "near-colourless" range. Any colour present is virtually undetectable when the diamond is mounted, offering outstanding appearance at a more accessible price point.',
  H: 'H colour diamonds are near-colourless with a very slight warm tint that is difficult to perceive face-up. They represent excellent value, as the colour is essentially invisible once set in jewellery.',
  I: 'I colour diamonds show a very slight warmth that may be faintly detectable face-up. When mounted, especially in yellow or rose gold, any warmth blends naturally with the metal tone.',
  J: 'J colour diamonds have a faint warm tone. This warmth can complement yellow and rose gold settings beautifully, and they offer significant value while remaining eye-clean in many styles.',
  K: 'K colour diamonds display a noticeable warm tint. They pair exceptionally well with vintage-inspired settings and warm-toned metals, offering distinctive character and excellent value.',
};

const clarityDescriptions: Record<string, string> = {
  FL: 'Flawless — No inclusions or blemishes visible under 10× magnification. The rarest clarity grade, representing less than 1% of all gem-quality diamonds.',
  IF: 'Internally Flawless — No inclusions visible under 10× magnification, with only insignificant surface blemishes. Exceptionally rare and highly prized by collectors.',
  VVS1: 'Very, Very Slightly Included 1 — Contains minute inclusions so small they are difficult even for a skilled grader to see under 10× magnification. Eye-clean with outstanding transparency.',
  VVS2: 'Very, Very Slightly Included 2 — Contains minute inclusions visible only under 10× magnification with effort. Virtually identical to VVS1 to the naked eye and represents superb quality.',
  VS1: 'Very Slightly Included 1 — Contains minor inclusions that range from difficult to somewhat easy to see under 10× magnification. Eye-clean in virtually all cases, offering exceptional value.',
  VS2: 'Very Slightly Included 2 — Contains minor inclusions that are somewhat easily identified under 10× magnification but are typically eye-clean. A popular choice balancing quality and value.',
  SI1: 'Slightly Included 1 — Contains noticeable inclusions under 10× magnification and may be eye-visible upon close inspection. Often still eye-clean, especially in smaller carat sizes.',
  SI2: 'Slightly Included 2 — Contains inclusions easily identified under 10× magnification and may be visible to the naked eye. Careful selection can still yield beautiful stones.',
  I1: 'Included 1 — Contains inclusions that are obvious under 10× magnification and may be visible to the unaided eye. These can affect brilliance but offer the most accessible pricing.',
  I2: 'Included 2 — Contains obvious inclusions visible to the naked eye that may affect transparency and brilliance. The most budget-friendly option for those prioritising size.',
};

const cutDescriptions: Record<string, string> = {
  Excellent: 'Excellent cut maximises the diamond\'s fire, brilliance, and scintillation. Light enters and reflects back through the top with virtually no leakage, creating the most spectacular visual performance.',
  'Very Good': 'Very Good cut reflects nearly as much light as Excellent, with only slight deviations in proportions. These diamonds offer outstanding brilliance at a more accessible price point.',
  Good: 'Good cut captures most of the diamond\'s potential light return. While slightly less brilliant than higher grades, these diamonds offer solid beauty and represent excellent value.',
  Fair: 'Fair cut allows a noticeable amount of light to escape through the sides or bottom. While still attractive, the reduced brilliance is visible compared to higher cut grades.',
  Poor: 'Poor cut allows significant light leakage, resulting in noticeably less brilliance and fire. These diamonds may appear dull or glassy compared to better-cut stones.',
};

const fluorescenceDescriptions: Record<string, string> = {
  None: 'This diamond has no fluorescence, meaning it will not emit any visible glow under ultraviolet light. This is the most common preference and ensures consistent appearance in all lighting.',
  Faint: 'Faint fluorescence produces a very slight glow under UV light, virtually undetectable in normal conditions. It has no impact on the diamond\'s visual appearance or value.',
  Medium: 'Medium fluorescence creates a noticeable glow under UV light. In some cases, it can make lower-colour diamonds appear whiter in sunlight, which can be a desirable effect.',
  Strong: 'Strong fluorescence produces a clearly visible glow under UV light. In rare cases it can create a slightly hazy or oily appearance, though it may also enhance perceived whiteness.',
  'Very Strong': 'Very Strong fluorescence creates an intense glow under UV light. This can occasionally affect the diamond\'s transparency, though some buyers appreciate the unique characteristic.',
};

export function DiamondDetailInfoDialog({
  open,
  onOpenChange,
  preset,
  selectedShape,
  onSelectDiamond,
  currency = 'USD',
}: DiamondDetailInfoDialogProps) {
  const { theme } = useWidgetTheme();
  if (!open || !preset) return null;

  const shapeName = selectedShape ? selectedShape.charAt(0).toUpperCase() + selectedShape.slice(1).toLowerCase() : '';
  const stoneLabel = preset.stone_type === 'natural' ? 'NATURAL DIAMOND' : 'LAB GROWN DIAMOND';
  const iconVariant = theme === 'luxury' ? 'white-bg' : 'transparent';

  const specParts = [
    shapeName.toUpperCase(),
    `${preset.carat_value} CARAT`,
    `${preset.color} COLOUR`,
    `${preset.clarity} CLARITY`,
  ];
  if (preset.cut_grade) specParts.push(`CUT ${preset.cut_grade.toUpperCase()}`);
  const specsLine = specParts.join('  |  ');

  const price = preset.custom_price ?? preset.base_price;
  const formatPrice = (p: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(p);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-start justify-center md:pl-[50%]" onClick={() => onOpenChange(false)}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full h-full overflow-y-auto bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 z-10 p-1 rounded-full hover:bg-white/10 transition-colors"
        >
          <X className="w-5 h-5 text-foreground" />
        </button>

        <div className="px-6 py-8 space-y-6 max-w-lg mx-auto">
          {/* Top section */}
          <div className="flex flex-col items-center text-center space-y-3">
            {selectedShape && (
              <ShapeIcon shapeId={selectedShape} size="xl" variant={iconVariant} />
            )}
            <p className="text-xs tracking-[0.2em] text-muted-foreground font-medium">{stoneLabel}</p>
            <p className="text-[10px] leading-relaxed tracking-[0.12em] text-muted-foreground">{specsLine}</p>
            <p className="text-lg font-semibold text-foreground">{formatPrice(price)}</p>
          </div>

          {/* Select button */}
          {onSelectDiamond && (
            <button
              onClick={() => {
                onSelectDiamond();
                onOpenChange(false);
              }}
              className="w-full py-3 text-sm font-semibold tracking-wider bg-foreground text-background hover:opacity-90 transition-opacity"
            >
              SELECT THIS DIAMOND
            </button>
          )}

          {/* Divider */}
          <div className="border-t border-white/15" />

          {/* Attribute sections */}
          <div className="space-y-6 text-left">
            {/* Carat */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold tracking-[0.15em] text-foreground">CARAT: {preset.carat_value}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Carat refers to the weight of the diamond, not its size. One carat equals 0.2 grams. A {preset.carat_value}-carat diamond offers a balanced combination of visual presence and brilliance. As carat weight increases, the diamond becomes rarer and more valuable, though the relationship between carat and apparent size is not linear.
              </p>
            </div>

            {/* Colour */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold tracking-[0.15em] text-foreground">COLOUR: {preset.color}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {colorDescriptions[preset.color] || `Grade ${preset.color} represents a specific position on the diamond colour scale, which ranges from D (colourless) to Z (light yellow or brown). The closer to colourless, the more rare and valuable the diamond.`}
              </p>
            </div>

            {/* Clarity */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold tracking-[0.15em] text-foreground">CLARITY: {preset.clarity}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {clarityDescriptions[preset.clarity] || `${preset.clarity} clarity indicates the presence and visibility of natural inclusions within the diamond, evaluated under 10× magnification. Higher clarity grades indicate fewer and less visible inclusions.`}
              </p>
            </div>

            {/* Cut - only if available */}
            {preset.cut_grade && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold tracking-[0.15em] text-foreground">CUT: {preset.cut_grade.toUpperCase()}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {cutDescriptions[preset.cut_grade] || `The ${preset.cut_grade} cut grade describes how well the diamond's facets interact with light. Cut is widely considered the most important factor in a diamond's beauty, as it directly determines brilliance, fire, and scintillation.`}
                </p>
              </div>
            )}

            {/* Fluorescence - only if available */}
            {preset.fluorescence && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold tracking-[0.15em] text-foreground">FLUORESCENCE: {preset.fluorescence.toUpperCase()}</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {fluorescenceDescriptions[preset.fluorescence] || `${preset.fluorescence} fluorescence describes the diamond's tendency to emit a soft glow when exposed to ultraviolet (UV) light. This is a natural characteristic and varies from diamond to diamond.`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  , document.body);
}

```

---

## `src/pages/EmbedConfigurator.tsx`

```tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { resolveDiamondFromPresets, getNextRelevantStep } from '@/lib/ring-config-helpers';
import { useScreenshotProtection } from '@/hooks/useScreenshotProtection';

import { ProductViewer } from '@/components/ring-builder/ProductViewer';
import { ConfigurationPanel } from '@/components/ring-builder/ConfigurationPanel';
import { ElegantConfigurationPanel } from '@/components/ring-builder/ElegantConfigurationPanel';
import { BookAppointmentDialog } from '@/components/ring-builder/BookAppointmentDialog';
import { ChatAssistant } from '@/components/ring-builder/ChatAssistant';
import { CompareDialog } from '@/components/ring-builder/CompareDialog';
import { SaveDesignDialog } from '@/components/ring-builder/SaveDesignDialog';
// CartDrawer kept for future use but not rendered (direct store redirect)
import { useRingConfiguration } from '@/hooks/useRingConfiguration';
import { useClientCatalogOptions } from '@/hooks/useClientCatalogOptions';
import { useClientCaratOptions } from '@/hooks/useClientCaratOptions';
import { useClientDiamondPresets } from '@/hooks/useClientDiamondPresets';
import { useClientDiamondCatalogAvailability } from '@/hooks/useClientDiamondCatalogAvailability';
import { useToast } from '@/hooks/use-toast';
import { RingConfiguration } from '@/types/ring-builder';
import { trackEmbedEvent, trackWidgetView } from '@/lib/analytics-utils';
import { initMetaPixel, trackMetaEvent } from '@/lib/meta-pixel';
import { parsePreviewBranding, hexToHSL } from '@/lib/embed-utils';
import { trackRingView } from '@/lib/tracking-utils';
import { logSecurityEvent } from '@/lib/audit-utils';
import { sanitizeHexColor, sanitizeDisplayName } from '@/lib/xss-sanitizer';
import { applyThemeColors, buildThemeColorStyles, hexToHSLRaw } from '@/lib/apply-theme-colors';
import AccessDenied from './AccessDenied';
import { isTrustedReferrer } from '@/lib/trusted-referrer';
import { EmbedConfiguratorSkeleton } from '@/components/common/EmbedConfiguratorSkeleton';
import { useDelayedLoading } from '@/hooks/useDelayedLoading';
import { WidgetThemeProvider, WidgetTheme } from '@/contexts/WidgetThemeContext';

export default function EmbedConfigurator() {
  useScreenshotProtection('full');
  const { clientId } = useParams();
  const [searchParams] = useSearchParams();
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [showChatAssistant, setShowChatAssistant] = useState(false);
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [saveDesignDialogOpen, setSaveDesignDialogOpen] = useState(false);
  const [branding, setBranding] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  // Cart drawer state removed - now redirecting directly to store cart
  const [domainAuthorized, setDomainAuthorized] = useState<boolean | null>(null);
  const [showAIAssistantButton, setShowAIAssistantButton] = useState(true);
  const [showComparisonButton, setShowComparisonButton] = useState(false);
  const [showSaveDesignButton, setShowSaveDesignButton] = useState(true);
  const [currentTheme, setCurrentTheme] = useState<WidgetTheme>('luxury');
  const [storeName, setStoreName] = useState<string | null>(null);
  const [pricingMode, setPricingMode] = useState<string>('custom_pricing');
  const [depositAmount, setDepositAmount] = useState<number>(0);
  const embedRootRef = useRef<HTMLDivElement>(null);
  const catalogOptions = useClientCatalogOptions(clientId);
  const { caratOptions, loading: caratLoading } = useClientCaratOptions(clientId || null);
  const { diamondPresets, loading: diamondLoading } = useClientDiamondPresets(clientId || null);
  const { availability: diamondAvailability, loading: availabilityLoading } = useClientDiamondCatalogAvailability(clientId || null);
  const ringConfig = useRingConfiguration({
    styles: catalogOptions.styles,
    shanks: catalogOptions.shanks,
    metals: catalogOptions.metals,
    caratOptions: caratOptions,
  });
  const { toast } = useToast();
  const showSkeleton = useDelayedLoading(loading || catalogOptions.loading || caratLoading || diamondLoading || availabilityLoading || domainAuthorized === null, 250);

  // SHAPE options come from the ring catalog only — do NOT filter by the
  // diamond catalog. Shapes here represent ring/setting shapes, which are
  // independent of the diamond inventory used by the CARAT step.
  const effectiveShapes = useMemo(() => catalogOptions.shapes, [catalogOptions.shapes]);

  const effectiveShapeIds = useMemo(
    () => new Set(effectiveShapes.map((shape) => shape.id.toLowerCase())),
    [effectiveShapes],
  );

  const effectiveCaratOptions = useMemo(() => {
    const selectedShape = ringConfig.configuration.shape?.toLowerCase();
    // For confirmed catalogs: if the selected shape has no diamonds in the
    // catalog, return [] so CaratStep shows no options for that shape.
    // For unconfirmed: fall back to all catalog buckets (legacy behaviour).
    const buckets = selectedShape
      ? (diamondAvailability.shapeCaratBuckets[selectedShape] ?? (diamondAvailability.isConfirmed ? [] : diamondAvailability.caratBuckets))
      : diamondAvailability.caratBuckets;
    if (diamondAvailability.isConfirmed) {
      const existingByValue = new Map(caratOptions.map((option) => [Number(option.carat_value), option]));
      return buckets.map((bucket) => existingByValue.get(bucket) ?? ({
        id: `catalog-${bucket}`,
        client_id: clientId || '',
        carat_value: bucket,
        display_name: `${bucket.toFixed(2)} Carat`,
        is_enabled: true,
        price_adjustment: 0,
        created_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString(),
      } as any));
    }
    if (buckets.length === 0) return caratOptions;

    const existingByValue = new Map(caratOptions.map((option) => [Number(option.carat_value), option]));
    return buckets.map((bucket) => existingByValue.get(bucket) ?? ({
      id: `catalog-${bucket}`,
      client_id: clientId || '',
      carat_value: bucket,
      display_name: `${bucket.toFixed(2)} Carat`,
      is_enabled: true,
      price_adjustment: 0,
      created_at: new Date(0).toISOString(),
      updated_at: new Date(0).toISOString(),
    } as any));
  }, [caratOptions, clientId, diamondAvailability.caratBuckets, diamondAvailability.isConfirmed, diamondAvailability.shapeCaratBuckets, ringConfig.configuration.shape]);

  const effectiveCaratValues = useMemo(
    () => new Set(effectiveCaratOptions.map((option) => Number(option.carat_value))),
    [effectiveCaratOptions],
  );

  // Bucket starts (e.g. [0.5, 1.5]) available in the client's confirmed
  // diamond catalog for the currently selected shape. Used by CaratStep to
  // hide standard carat ranges that the client did not configure.
  // For confirmed catalogs: empty array when the selected shape has no diamonds
  // (correct — CaratStep should show nothing, preventing confusion on Stone step).
  // For unconfirmed: undefined when no buckets, so CaratStep shows all ranges.
  const availableCaratBuckets = useMemo(() => {
    const selectedShape = ringConfig.configuration.shape?.toLowerCase();
    const buckets = selectedShape
      ? (diamondAvailability.shapeCaratBuckets[selectedShape] ?? (diamondAvailability.isConfirmed ? [] : diamondAvailability.caratBuckets))
      : diamondAvailability.caratBuckets;
    if (!diamondAvailability.isConfirmed && buckets.length === 0) return undefined;
    return buckets.map((value) => Number(value));
  }, [diamondAvailability.caratBuckets, diamondAvailability.isConfirmed, diamondAvailability.shapeCaratBuckets, ringConfig.configuration.shape]);

  // Allow embed body to scroll internally (rescues stale customer snippets that
  // cap iframe height — users can still scroll within the iframe to see the
  // AI render footer, regenerate panel, etc.). Also report content height to
  // parent for auto-sizing on snippets that support it.
  useEffect(() => {
    document.body.setAttribute('data-embed', 'true');

    // Set explicit height for iframe context to handle mobile Safari quirks
    const updateHeight = () => {
      const vh = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty('--embed-vh', `${vh}px`);
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    window.visualViewport?.addEventListener('resize', updateHeight);

    // Notify host page that widget is ready for height sync
    window.parent?.postMessage(JSON.stringify({ type: 'jewlx-ready' }), '*');

    // --- Auto-height reporting to parent ---
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const sendHeight = () => {
      const h = Math.max(
        document.documentElement.scrollHeight,
        document.body?.scrollHeight ?? 0
      );
      try {
        window.parent?.postMessage(JSON.stringify({ type: 'jewlx-resize', height: h }), '*');
      } catch { /* cross-origin safety */ }
    };

    const debouncedSendHeight = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(sendHeight, 100);
    };

    const resizeObserver = new ResizeObserver(debouncedSendHeight);
    resizeObserver.observe(document.documentElement);
    if (document.body) resizeObserver.observe(document.body);

    // Mutation observer catches conditional sections (AI render reveal, comments)
    const mutationObserver = new MutationObserver(debouncedSendHeight);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    const initialTimer = setTimeout(sendHeight, 300);
    const secondaryTimer = setTimeout(sendHeight, 1500);

    return () => {
      window.removeEventListener('resize', updateHeight);
      window.visualViewport?.removeEventListener('resize', updateHeight);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      if (resizeTimer) clearTimeout(resizeTimer);
      clearTimeout(initialTimer);
      clearTimeout(secondaryTimer);
      document.body.removeAttribute('data-embed');
    };
  }, []);

  // Domain whitelisting check
  useEffect(() => {
    const checkDomainAuthorization = async () => {
      if (!clientId) return;
      
      // Skip check for preview mode or same-origin
      const isPreview = searchParams.get('preview') === 'true';
      const referrer = document.referrer;
      const isSameOrigin = isTrustedReferrer(referrer, window.location.hostname);
      
      if (isPreview || isSameOrigin) {
        setDomainAuthorized(true);
        return;
      }

      try {
        // Get allowed domains for this client using secure RPC function
        const { data: clientData, error: clientErr } = await supabase
          .rpc('get_client_branding', { client_uuid: clientId });

        if (clientErr && (clientErr as any).code !== 'PGRST116') throw clientErr;

        const client = clientData?.[0];
        const allowedDomains = (client?.allowed_domains || []) as string[];
        
        // If no domains configured, allow all (backwards compatible)
        if (allowedDomains.length === 0) {
          setDomainAuthorized(true);
          return;
        }

        // Check if referrer domain is in allowed list
        const referrerUrl = new URL(referrer);
        const referrerDomain = referrerUrl.hostname;
        
        const isAuthorized = allowedDomains.some(domain => 
          referrerDomain === domain || referrerDomain.endsWith(`.${domain}`)
        );

        if (!isAuthorized) {
          await logSecurityEvent('unauthorized_embed_domain', {
            clientId,
            attemptedDomain: referrerDomain,
            allowedDomains,
          }, 'warning');
        }

        setDomainAuthorized(isAuthorized);
      } catch (error) {
        console.error('Domain check error:', error);
        setDomainAuthorized(true); // Fail open to not break existing embeds
      }
    };

    checkDomainAuthorization();
  }, [clientId, searchParams]);

  // Track widget view once domain is authorized
  useEffect(() => {
    if (domainAuthorized && clientId) {
      trackWidgetView(clientId, 'jewlx_widget');
    }
  }, [domainAuthorized, clientId]);

  useEffect(() => {
    const loadBranding = async () => {
      if (!clientId) return;
      
      const previewBranding = parsePreviewBranding(searchParams);
      
      if (previewBranding) {
        // XSS Protection: Sanitize all URL parameters before use
        const sanitizedBranding: any = {
          ...previewBranding,
          primaryColor: sanitizeHexColor(previewBranding.primaryColor) || undefined,
          secondaryColor: sanitizeHexColor(previewBranding.secondaryColor) || undefined,
          companyName: sanitizeDisplayName(previewBranding.companyName) || undefined,
        };
        
        // Also fetch themeColors from DB so per-theme branding customizations apply in preview
        try {
          const { data: rpcData } = await supabase
            .rpc('get_client_branding', { client_uuid: clientId });
          const dbConfig = (rpcData?.[0]?.branding_config || {}) as any;
          if (dbConfig.themeColors) {
            sanitizedBranding.themeColors = dbConfig.themeColors;
          }
          // stepOrder is configured in DB only (not passed via preview URL),
          // so always hydrate it from the DB so the preview reflects the saved sequence.
          if (dbConfig.stepOrder) {
            sanitizedBranding.stepOrder = dbConfig.stepOrder;
          }
        } catch (e) {
          console.warn('Could not load themeColors/stepOrder for preview:', e);
        }
        
        setBranding(sanitizedBranding);
        setShowAIAssistantButton(sanitizedBranding.showChatAssistant ?? true);
        setShowComparisonButton(sanitizedBranding.showComparison ?? true);
        setShowSaveDesignButton(sanitizedBranding.showSaveDesign ?? true);
        
        // Set theme from URL params
        if (previewBranding.theme && (previewBranding.theme === 'luxury' || previewBranding.theme === 'modern' || previewBranding.theme === 'chat' || previewBranding.theme === 'elegant')) {
          setCurrentTheme(previewBranding.theme as WidgetTheme);
          if (previewBranding.theme === 'chat') {
            setShowChatAssistant(true);
          }
        }
        
        // Per-theme colors will be applied by the consolidated useEffect below
        
        // Legacy primary/secondary colors will also be applied by the consolidated useEffect
      } else {
        // Use secure RPC function for public embed access
        const { data: rpcData, error } = await supabase
          .rpc('get_client_branding', { client_uuid: clientId });

        // Treat "0 rows" as a non-error (common for incomplete setups)
        if (error && (error as any).code !== 'PGRST116') {
          console.warn('Could not load branding, using defaults:', error);
          setBranding({ primaryColor: '#50c878', secondaryColor: '#0b6e4f' });
          setLoading(false);
          return;
        }

        const data = rpcData?.[0];
        
        if (!data) {
          setBranding({ primaryColor: '#50c878', secondaryColor: '#0b6e4f' });
        } else {
          const config = (data.branding_config || {}) as any;
          setBranding(config);
          if (data.company_name) setStoreName(data.company_name as string);
          setShowAIAssistantButton(config.showChatAssistant ?? true);
          setShowComparisonButton(config.showComparison ?? true);
          setShowSaveDesignButton(config.showSaveDesign ?? true);
          
          // Set theme from database
          if (data.widget_theme && (data.widget_theme === 'luxury' || data.widget_theme === 'modern' || data.widget_theme === 'chat' || data.widget_theme === 'elegant')) {
            setCurrentTheme(data.widget_theme as WidgetTheme);
            if (data.widget_theme === 'chat') {
              setShowChatAssistant(true);
            }
          }
          
          // Per-theme and legacy colors will be applied by the consolidated useEffect below
          
          // Init Meta Pixel if configured
          if (data.meta_pixel_id) {
            initMetaPixel(data.meta_pixel_id as string);
          }

          await trackEmbedEvent(clientId, 'embed_view');
        }
      }
      
      // Standalone ?theme= override (for testing all themes without changing DB)
      const urlThemeOverride = searchParams.get('theme');
      if (!previewBranding && urlThemeOverride && ['luxury', 'modern', 'chat', 'elegant'].includes(urlThemeOverride)) {
        setCurrentTheme(urlThemeOverride as WidgetTheme);
        if (urlThemeOverride === 'chat') {
          setShowChatAssistant(true);
        }
      }

      setLoading(false);
    };

    const loadPricingMode = async () => {
      if (!clientId) return;
      try {
        const { data } = await supabase
          .from('client_onboarding_preferences')
          .select('widget_pricing_mode, widget_deposit_amount')
          .eq('client_id', clientId)
          .maybeSingle();
        if (data) {
          setPricingMode(data.widget_pricing_mode || 'custom_pricing');
          setDepositAmount(data.widget_deposit_amount || 0);
        }
      } catch (e) {
        console.warn('Could not load pricing mode:', e);
      }
    };

    loadBranding();
    loadPricingMode();
  }, [clientId, searchParams]);

  // Real-time sync for branding changes
  useEffect(() => {
    if (!clientId || loading) return;
    
    const channel = supabase
      .channel(`client-branding-${clientId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'clients',
        filter: `id=eq.${clientId}`
      }, (payload) => {
        const config = (payload.new.branding_config || {}) as any;
        setBranding(config);
        setShowAIAssistantButton(config.showChatAssistant ?? true);
        setShowComparisonButton(config.showComparison ?? true);
        setShowSaveDesignButton(config.showSaveDesign ?? true);
        
        // Per-theme and legacy colors will be applied by the consolidated useEffect below
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [clientId, loading]);

  // Compute inline CSS variable overrides from branding (reactive, survives re-renders)
  const themeStyleOverrides = useMemo(() => {
    if (!branding) return {};
    const styles: Record<string, string> = {};

    // Per-theme custom colors
    const themeKey = currentTheme || 'luxury';
    if (branding.themeColors && branding.themeColors[themeKey]) {
      Object.assign(styles, buildThemeColorStyles(branding.themeColors[themeKey]));
    }

    // Legacy primary/secondary color overrides
    if (branding.primaryColor) {
      const hsl = hexToHSLRaw(branding.primaryColor);
      if (!styles['--client-accent']) styles['--client-accent'] = hsl;
      if (!styles['--client-subtle']) styles['--client-subtle'] = hsl;
      const lightness = parseInt(hsl.split('%')[0].split(' ').pop() || '50');
      styles['--client-accent-foreground'] = lightness > 55 ? '0 0% 0%' : '0 0% 100%';
    }
    if (branding.secondaryColor) {
      styles['--client-secondary'] = hexToHSLRaw(branding.secondaryColor);
    }

    return styles;
  }, [branding, currentTheme]);

  // Sync theme overrides to documentElement so portaled UI (dialogs) inherits them
  useEffect(() => {
    const entries = Object.entries(themeStyleOverrides);
    entries.forEach(([prop, value]) => {
      document.documentElement.style.setProperty(prop, value);
    });
    return () => {
      entries.forEach(([prop]) => {
        document.documentElement.style.removeProperty(prop);
      });
    };
  }, [themeStyleOverrides]);

  useEffect(() => {
    if (catalogOptions.loading || availabilityLoading) return;
    // Auto-select defaults for all themes including chat mode so the product viewer always shows a ring.
    
    // Auto-select first available option for each category
    if (catalogOptions.styles.length > 0 && !ringConfig.configuration.style) {
      ringConfig.updateStyle(catalogOptions.styles[0].id as any);
    }
    if (catalogOptions.shanks.length > 0 && !ringConfig.configuration.shank) {
      ringConfig.updateShank(catalogOptions.shanks[0].id as any);
    }
    if (catalogOptions.metals.length > 0 && !ringConfig.configuration.metal) {
      ringConfig.updateMetal(catalogOptions.metals[0].id as any);
    }
    const currentShape = ringConfig.configuration.shape?.toLowerCase() ?? null;
    if (effectiveShapes.length > 0 && (!currentShape || !effectiveShapeIds.has(currentShape))) {
      ringConfig.updateShape(effectiveShapes[0].id as any);
      return;
    }

    const currentCarat = ringConfig.configuration.caratRange;
    if (effectiveCaratOptions.length > 0 && (currentCarat == null || !effectiveCaratValues.has(Number(currentCarat)))) {
      ringConfig.updateCaratRange(effectiveCaratOptions[0].carat_value as any);
    }
  }, [
    availabilityLoading,
    catalogOptions.loading,
    catalogOptions.styles,
    catalogOptions.shanks,
    catalogOptions.metals,
    effectiveShapes,
    effectiveShapeIds,
    effectiveCaratOptions,
    effectiveCaratValues,
    ringConfig.configuration.style,
    ringConfig.configuration.shank,
    ringConfig.configuration.metal,
    ringConfig.configuration.shape,
    ringConfig.configuration.caratRange,
    showChatAssistant,
  ]);

  // Fire ViewContent once when widget is ready
  const viewContentFired = useRef(false);
  useEffect(() => {
    if (!loading && !viewContentFired.current) {
      viewContentFired.current = true;
      trackMetaEvent('ViewContent', { content_name: 'Ring Configurator', content_category: 'widget' });
    }
  }, [loading]);

  // Track configuration views
  useEffect(() => {
    if (clientId && ringConfig.configuration && !loading) {
      const timer = setTimeout(() => {
        trackRingView(clientId, ringConfig.configuration);
      }, 2000); // Debounce tracking
      return () => clearTimeout(timer);
    }
  }, [clientId, ringConfig.configuration, loading]);

  // Keyboard shortcuts prevention (right-click is now enabled)
  useEffect(() => {
    // Disable keyboard shortcuts for saving/inspecting
    const handleKeyDown = (e: KeyboardEvent) => {
      // Disable Ctrl+S, Ctrl+U, Ctrl+Shift+I, F12
      if (
        (e.ctrlKey && (e.key === 's' || e.key === 'S' || e.key === 'u' || e.key === 'U')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'i' || e.key === 'I')) ||
        e.key === 'F12'
      ) {
        e.preventDefault();
        return false;
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleApplyAIConfiguration = useCallback((configuration: any) => {
    if (configuration.style) ringConfig.updateStyle(configuration.style);
    if (configuration.shank) ringConfig.updateShank(configuration.shank);
    if (configuration.metal) ringConfig.updateMetal(configuration.metal);
    if (configuration.shape) ringConfig.updateShape(configuration.shape);
    if (configuration.caratRange != null) ringConfig.updateCaratRange(configuration.caratRange);

    // Resolve stone when we have enough info (carat OR stoneType changed)
    const effectiveShape = configuration.shape || ringConfig.configuration.shape;
    const effectiveCarat = configuration.caratRange ?? ringConfig.configuration.caratRange;
    const effectiveStoneType = configuration.stoneType || null;
    const rawCarat: number | undefined = configuration.rawCarat ?? undefined;
    const preferredColor: string | undefined = configuration.color ?? undefined;
    const preferredClarity: string | undefined = configuration.clarity ?? undefined;

    let resolvedStone: ReturnType<typeof resolveDiamondFromPresets> = null;
    if (effectiveShape && (effectiveCarat != null || effectiveStoneType)) {
      resolvedStone = resolveDiamondFromPresets(
        diamondPresets,
        effectiveShape,
        effectiveCarat ?? 1,
        effectiveStoneType || undefined,
        { strictStoneType: !!effectiveStoneType, rawCarat, preferredColor, preferredClarity },
      );
      if (resolvedStone) ringConfig.updateStone(resolvedStone);
    }

    // Apply optional fields
    if (configuration.size) ringConfig.updateSize(configuration.size);
    if (configuration.engraving) {
      ringConfig.updateEngraving({
        enabled: true,
        text: String(configuration.engraving).slice(0, 20),
        bandWidth: '2.5mm',
        otherRequest: '',
      });
    }

    // Auto-navigate to the right step
    const updatedConfig = {
      ...ringConfig.configuration,
      style: configuration.style || ringConfig.configuration.style,
      shank: configuration.shank || ringConfig.configuration.shank,
      metal: configuration.metal || ringConfig.configuration.metal,
      shape: configuration.shape || ringConfig.configuration.shape,
      caratRange: configuration.caratRange ?? ringConfig.configuration.caratRange,
      stone: resolvedStone || ringConfig.configuration.stone,
    };
    const isEstimates = pricingMode === 'estimates';
    const nextStep = getNextRelevantStep(updatedConfig, isEstimates);
    ringConfig.goToStep(nextStep);
  }, [ringConfig, diamondPresets, pricingMode]);

  const handleAddToCart = async () => {
    if (isAddingToCart) return;
    if (!clientId) {
      toast({
        title: "Error",
        description: "Client information not found",
        variant: "destructive"
      });
      return;
    }

    // Basic validation (prevents backend calls that cannot succeed)
    const cfg = ringConfig.configuration as RingConfiguration;
    if (!cfg.style || !cfg.shank || !cfg.metal || !cfg.shape) {
      toast({
        title: "Complete your design",
        description: "Please select style, shank, metal, and shape before adding to cart.",
        variant: "destructive",
      });
      return;
    }

    const safeRedirect = (url: string) => {
      // Prefer navigating the top window (so the parent page goes to cart),
      // but fall back safely in restrictive embed contexts.
      try {
        window.top!.location.href = url;
        return;
      } catch {
        // ignore cross-origin error
      }
      try {
        window.location.href = url;
        return;
      } catch {
        // ignore
      }
      // Last resort: open a new tab.
      window.open(url, "_blank", "noopener,noreferrer");
    };

    try {
      setIsAddingToCart(true);

      // Fire InitiateCheckout event
      trackMetaEvent('InitiateCheckout', { content_name: 'Ring Configurator' });
      
      const { data, error } = await supabase.functions.invoke('shopify-add-to-cart', {
        body: {
          clientId,
          ringConfiguration: ringConfig.configuration,
          estimatedPrice: ringConfig.calculatePrice(),
          quantity: 1
        }
      });

      if (error) {
        // Parse the error response to get the actual error message
        let errorMessage = "Failed to add ring to cart";
        try {
          if ('context' in error && error.context) {
            const errorBody = await (error.context as Response).json();
            errorMessage = errorBody.error || errorMessage;
          } else if (error.message) {
            errorMessage = error.message;
          }
        } catch {
          if (error.message) {
            errorMessage = error.message;
          }
        }
        console.error('[Add to Cart] Edge function error:', errorMessage);
        throw new Error(errorMessage);
      }

      // Redirect to Storefront API checkout URL — this is tied to the cart
      // created via the API and carries all line item attributes (ring/diamond details).
      // cartPermalinkUrl creates a new blank cart session and drops all attributes.
      if (data?.checkoutUrl) {
        toast({
          title: "Added to cart!",
          description: "Redirecting to checkout...",
        });
        safeRedirect(data.checkoutUrl);
        return;
      }

      // Fallback: cart permalink if no checkout URL
      if (data?.cartPermalinkUrl) {
        toast({
          title: "Added to cart!",
          description: "Redirecting to store cart...",
        });
        safeRedirect(data.cartPermalinkUrl);
        return;
      }
      
      if (data?.error) {
        throw new Error(data.error);
      }
      
      throw new Error('No cart URL returned');
    } catch (error) {
      console.error('Error adding to cart:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add ring to cart",
        variant: "destructive"
      });
    } finally {
      setIsAddingToCart(false);
    }
  };

  // Removed handleCheckoutRedirect and handleViewOnStore - now redirecting directly in handleAddToCart

  // Show access denied if domain not authorized
  if (domainAuthorized === false) {
    return <AccessDenied reason="unauthorized_domain" message="This embed is not authorized for this domain." />;
  }

  if (loading || catalogOptions.loading || caratLoading || diamondLoading || availabilityLoading || domainAuthorized === null) {
    // Show layout-accurate skeleton after a short delay; for very fast loads, avoid flicker.
    return showSkeleton ? (
      <EmbedConfiguratorSkeleton />
    ) : (
      <div className="min-h-screen flex items-center justify-center" />
    );
  }

  return (
    <WidgetThemeProvider theme={currentTheme}>
        
        <div 
          ref={embedRootRef}
          id="jewlx-embed-root" 
          className="bg-background flex flex-col md:flex-row overflow-hidden" 
          data-theme={currentTheme}
          style={{ height: 'var(--embed-vh, 100dvh)', ...themeStyleOverrides } as React.CSSProperties}
          
        >
          <div className="w-full md:flex-1 md:max-w-[60%] h-[50%] md:h-full relative overflow-hidden flex-shrink-0">
            <ProductViewer configuration={ringConfig.configuration} calculatePrice={ringConfig.calculatePrice} isChatMode={showChatAssistant} />
          </div>

          <div className="w-full md:flex-1 md:max-w-[40%] h-[50%] md:h-full flex flex-col overflow-hidden relative">
          {currentTheme === 'elegant' ? (
            <>
              <div className={showChatAssistant ? "hidden md:block h-full" : "h-full"}>
                <ElegantConfigurationPanel
                  clientId={clientId}
                  ringConfig={ringConfig}
                  onBookAppointment={() => setAppointmentDialogOpen(true)}
                  onAIAssistant={() => {
                    setShowChatAssistant(true);
                  }}
                  onCompare={() => setShowCompareDialog(true)}
                  onSaveDesign={() => setSaveDesignDialogOpen(true)}
                  onAddToCart={handleAddToCart}
                  currency={branding?.currency || 'USD'}
                  showAIAssistant={showAIAssistantButton}
                  showComparison={showComparisonButton}
                  showSaveDesign={showSaveDesignButton}
                  catalogOptions={{
                    styles: catalogOptions.styles,
                    shanks: catalogOptions.shanks,
                    metals: catalogOptions.metals,
                    shapes: effectiveShapes,
                    caratOptions: effectiveCaratOptions,
                    diamondPresets: diamondPresets,
                    availableCaratBuckets,
                  }}
                  pricingMode={pricingMode}
                  depositAmount={depositAmount}
                  stepOrder={(branding as any)?.stepOrder}
                />
              </div>

              {showChatAssistant && (
                <div className="h-full w-full md:hidden bg-background overflow-hidden">
                  <ChatAssistant
                    onClose={() => {
                      setShowChatAssistant(false);
                      const cfg = ringConfig.configuration;
                      if (cfg.style && cfg.shank && cfg.metal && cfg.shape) {
                        const isEst = pricingMode === 'estimates';
                        const next = getNextRelevantStep(cfg, isEst);
                        ringConfig.goToStep(next);
                      }
                    }}
                    onApplyConfiguration={handleApplyAIConfiguration}
                    clientId={clientId}
                    storeName={storeName || undefined}
                    currentConfiguration={ringConfig.configuration}
                    onUpdateStyle={ringConfig.updateStyle}
                    onUpdateShank={ringConfig.updateShank}
                    onUpdateMetal={ringConfig.updateMetal}
                    onUpdateShape={ringConfig.updateShape}
                    onUpdateCarat={ringConfig.updateCaratRange}
                    catalogOptions={{
                      styles: catalogOptions.styles.map(s => ({ id: s.id, name: s.name, price: s.price })),
                      shanks: catalogOptions.shanks.map(s => ({ id: s.id, name: s.name, price: s.price })),
                      metals: catalogOptions.metals.map(m => ({ id: m.id, name: m.name, price: m.price })),
                      shapes: effectiveShapes.map(s => ({ id: s.id, name: s.name })),
                      caratOptions: effectiveCaratOptions.map(c => ({ value: c.carat_value, displayName: c.display_name, priceAdjustment: c.price_adjustment })),
                      diamondPresets: diamondPresets,
                    }}
                    onBookAppointment={() => setAppointmentDialogOpen(true)}
                    onSaveDesign={() => setSaveDesignDialogOpen(true)}
                    onAddToCart={handleAddToCart}
                    onUpdateSize={ringConfig.updateSize}
                    onUpdateEngraving={ringConfig.updateEngraving}
                    currency={branding?.currency || 'USD'}
                    onResetConfiguration={ringConfig.resetConfiguration}
                    pricingMode={pricingMode}
                  />
                </div>
              )}

              {showChatAssistant && (
                <div className="absolute inset-0 z-20 bg-background overflow-hidden hidden md:block">
                  <ChatAssistant
                    onClose={() => {
                      setShowChatAssistant(false);
                      const cfg = ringConfig.configuration;
                      if (cfg.style && cfg.shank && cfg.metal && cfg.shape) {
                        const isEst = pricingMode === 'estimates';
                        const next = getNextRelevantStep(cfg, isEst);
                        ringConfig.goToStep(next);
                      }
                    }}
                    onApplyConfiguration={handleApplyAIConfiguration}
                    clientId={clientId}
                    storeName={storeName || undefined}
                    currentConfiguration={ringConfig.configuration}
                    onUpdateStyle={ringConfig.updateStyle}
                    onUpdateShank={ringConfig.updateShank}
                    onUpdateMetal={ringConfig.updateMetal}
                    onUpdateShape={ringConfig.updateShape}
                    onUpdateCarat={ringConfig.updateCaratRange}
                    catalogOptions={{
                      styles: catalogOptions.styles.map(s => ({ id: s.id, name: s.name, price: s.price })),
                      shanks: catalogOptions.shanks.map(s => ({ id: s.id, name: s.name, price: s.price })),
                      metals: catalogOptions.metals.map(m => ({ id: m.id, name: m.name, price: m.price })),
                      shapes: effectiveShapes.map(s => ({ id: s.id, name: s.name })),
                      caratOptions: effectiveCaratOptions.map(c => ({ value: c.carat_value, displayName: c.display_name, priceAdjustment: c.price_adjustment })),
                      diamondPresets: diamondPresets,
                    }}
                    onBookAppointment={() => setAppointmentDialogOpen(true)}
                    onSaveDesign={() => setSaveDesignDialogOpen(true)}
                    onAddToCart={handleAddToCart}
                    onUpdateSize={ringConfig.updateSize}
                    onUpdateEngraving={ringConfig.updateEngraving}
                    currency={branding?.currency || 'USD'}
                    onResetConfiguration={ringConfig.resetConfiguration}
                    pricingMode={pricingMode}
                  />
                </div>
              )}
            </>
          ) : currentTheme === 'chat' ? (
            /* Chat-First theme: ChatAssistant IS the right panel */
            <div className="h-full w-full bg-background overflow-hidden">
              <ChatAssistant 
                onClose={undefined} 
                onApplyConfiguration={handleApplyAIConfiguration} 
                clientId={clientId}
                storeName={storeName || undefined}
                currentConfiguration={ringConfig.configuration}
                onUpdateStyle={ringConfig.updateStyle}
                onUpdateShank={ringConfig.updateShank}
                onUpdateMetal={ringConfig.updateMetal}
                onUpdateShape={ringConfig.updateShape}
                onUpdateCarat={ringConfig.updateCaratRange}
                catalogOptions={{
                  styles: catalogOptions.styles.map(s => ({ id: s.id, name: s.name, price: s.price })),
                  shanks: catalogOptions.shanks.map(s => ({ id: s.id, name: s.name, price: s.price })),
                  metals: catalogOptions.metals.map(m => ({ id: m.id, name: m.name, price: m.price })),
                  shapes: effectiveShapes.map(s => ({ id: s.id, name: s.name })),
                  caratOptions: effectiveCaratOptions.map(c => ({ value: c.carat_value, displayName: c.display_name, priceAdjustment: c.price_adjustment })),
                  diamondPresets: diamondPresets,
                }}
                isChatTheme
                onBookAppointment={() => setAppointmentDialogOpen(true)}
                onSaveDesign={() => setSaveDesignDialogOpen(true)}
                onAddToCart={handleAddToCart}
                onUpdateSize={ringConfig.updateSize}
                onUpdateEngraving={ringConfig.updateEngraving}
                currency={branding?.currency || 'USD'}
                onResetConfiguration={ringConfig.resetConfiguration}
                pricingMode={pricingMode}
              />
            </div>
          ) : (
            <>
              <div className={showChatAssistant ? "hidden md:block h-full" : "h-full"}>
                <ConfigurationPanel 
                  clientId={clientId}
                  ringConfig={ringConfig}
                  onBookAppointment={() => setAppointmentDialogOpen(true)}
                  onAIAssistant={() => {
                    setShowChatAssistant(true);
                  }}
                  onCompare={() => setShowCompareDialog(true)}
                  onSaveDesign={() => setSaveDesignDialogOpen(true)}
                  onAddToCart={handleAddToCart}
                  currency={branding?.currency || 'USD'}
                  showAIAssistant={showAIAssistantButton}
                  showComparison={showComparisonButton}
                  showSaveDesign={showSaveDesignButton}
                  catalogOptions={{
                    styles: catalogOptions.styles,
                    shanks: catalogOptions.shanks,
                    metals: catalogOptions.metals,
                    shapes: effectiveShapes,
                    caratOptions: effectiveCaratOptions,
                    diamondPresets: diamondPresets,
                    availableCaratBuckets,
                  }}
                  pricingMode={pricingMode}
                  depositAmount={depositAmount}
                  stepOrder={(branding as any)?.stepOrder}
                />
              </div>

              {showChatAssistant && (
                <div className="h-full w-full md:hidden bg-background overflow-hidden">
                  <ChatAssistant 
                    onClose={() => {
                      setShowChatAssistant(false);
                      const cfg = ringConfig.configuration;
                      if (cfg.style && cfg.shank && cfg.metal && cfg.shape) {
                        const isEst = pricingMode === 'estimates';
                        const next = getNextRelevantStep(cfg, isEst);
                        ringConfig.goToStep(next);
                      }
                    }}
                    onApplyConfiguration={handleApplyAIConfiguration} 
                    clientId={clientId}
                    storeName={storeName || undefined}
                    currentConfiguration={ringConfig.configuration}
                    onUpdateStyle={ringConfig.updateStyle}
                    onUpdateShank={ringConfig.updateShank}
                    onUpdateMetal={ringConfig.updateMetal}
                    onUpdateShape={ringConfig.updateShape}
                    onUpdateCarat={ringConfig.updateCaratRange}
                    catalogOptions={{
                      styles: catalogOptions.styles.map(s => ({ id: s.id, name: s.name, price: s.price })),
                      shanks: catalogOptions.shanks.map(s => ({ id: s.id, name: s.name, price: s.price })),
                      metals: catalogOptions.metals.map(m => ({ id: m.id, name: m.name, price: m.price })),
                      shapes: effectiveShapes.map(s => ({ id: s.id, name: s.name })),
                      caratOptions: effectiveCaratOptions.map(c => ({ value: c.carat_value, displayName: c.display_name, priceAdjustment: c.price_adjustment })),
                      diamondPresets: diamondPresets,
                    }}
                    onBookAppointment={() => setAppointmentDialogOpen(true)}
                    onSaveDesign={() => setSaveDesignDialogOpen(true)}
                    onAddToCart={handleAddToCart}
                    onUpdateSize={ringConfig.updateSize}
                    onUpdateEngraving={ringConfig.updateEngraving}
                    currency={branding?.currency || 'USD'}
                     onResetConfiguration={ringConfig.resetConfiguration}
                    pricingMode={pricingMode}
                  />
                </div>
              )}
              
              {showChatAssistant && (
                <div className="absolute inset-0 bg-background overflow-hidden hidden md:block">
                  <ChatAssistant 
                    onClose={() => {
                      setShowChatAssistant(false);
                      const cfg = ringConfig.configuration;
                      if (cfg.style && cfg.shank && cfg.metal && cfg.shape) {
                        const isEst = pricingMode === 'estimates';
                        const next = getNextRelevantStep(cfg, isEst);
                        ringConfig.goToStep(next);
                      }
                    }}
                    onApplyConfiguration={handleApplyAIConfiguration} 
                    clientId={clientId}
                    storeName={storeName || undefined}
                    currentConfiguration={ringConfig.configuration}
                    onUpdateStyle={ringConfig.updateStyle}
                    onUpdateShank={ringConfig.updateShank}
                    onUpdateMetal={ringConfig.updateMetal}
                    onUpdateShape={ringConfig.updateShape}
                    onUpdateCarat={ringConfig.updateCaratRange}
                    catalogOptions={{
                      styles: catalogOptions.styles.map(s => ({ id: s.id, name: s.name, price: s.price })),
                      shanks: catalogOptions.shanks.map(s => ({ id: s.id, name: s.name, price: s.price })),
                      metals: catalogOptions.metals.map(m => ({ id: m.id, name: m.name, price: m.price })),
                      shapes: effectiveShapes.map(s => ({ id: s.id, name: s.name })),
                      caratOptions: effectiveCaratOptions.map(c => ({ value: c.carat_value, displayName: c.display_name, priceAdjustment: c.price_adjustment })),
                      diamondPresets: diamondPresets,
                    }}
                    onBookAppointment={() => setAppointmentDialogOpen(true)}
                    onSaveDesign={() => setSaveDesignDialogOpen(true)}
                    onAddToCart={handleAddToCart}
                    onUpdateSize={ringConfig.updateSize}
                    onUpdateEngraving={ringConfig.updateEngraving}
                    currency={branding?.currency || 'USD'}
                    onResetConfiguration={ringConfig.resetConfiguration}
                    pricingMode={pricingMode}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <BookAppointmentDialog open={appointmentDialogOpen} onOpenChange={setAppointmentDialogOpen} clientId={clientId} ringConfiguration={ringConfig.configuration} />
        <CompareDialog open={showCompareDialog} onOpenChange={setShowCompareDialog} currentConfiguration={ringConfig.configuration} calculatePrice={ringConfig.calculatePrice} />
        <SaveDesignDialog 
          open={saveDesignDialogOpen} 
          onOpenChange={setSaveDesignDialogOpen} 
          configuration={ringConfig.configuration} 
          clientId={clientId || ''} 
          catalogOptions={{
            styles: catalogOptions.styles.map(s => ({ id: s.id, name: s.name, price: s.price })),
            shanks: catalogOptions.shanks.map(s => ({ id: s.id, name: s.name, price: s.price })),
            metals: catalogOptions.metals.map(m => ({ id: m.id, name: m.name, price: m.price })),
            shapes: effectiveShapes.map(s => ({ id: s.id, name: s.name })),
            caratOptions: effectiveCaratOptions.map(c => ({ value: c.carat_value, displayName: c.display_name, priceAdjustment: c.price_adjustment })),
          }}
        />
        </div>
    </WidgetThemeProvider>
  );
}

```

---

## `src/pages/CustomRingBuilder.tsx`

```tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ProductViewer } from '@/components/ring-builder/ProductViewer';
import { ConfigurationPanel } from '@/components/ring-builder/ConfigurationPanel';
import { BookAppointmentDialog } from '@/components/ring-builder/BookAppointmentDialog';
import { ChatAssistant } from '@/components/ring-builder/ChatAssistant';
import { CompareDialog } from '@/components/ring-builder/CompareDialog';
import { useRingConfiguration } from '@/hooks/useRingConfiguration';
import { useClientCatalogOptions } from '@/hooks/useClientCatalogOptions';
import { useClientCaratOptions } from '@/hooks/useClientCaratOptions';
import { useClientDiamondPresets } from '@/hooks/useClientDiamondPresets';
import { useToast } from '@/hooks/use-toast';
import { RingConfiguration } from '@/types/ring-builder';
import { resolveDiamondFromPresets, getNextRelevantStep } from '@/lib/ring-config-helpers';
import { supabase } from '@/integrations/supabase/client';
import { Gem } from 'lucide-react';
import { trackRingView } from '@/lib/tracking-utils';
import { applyThemeColors } from '@/lib/apply-theme-colors';
import { hexToHSL } from '@/lib/embed-utils';

const CustomRingBuilder = () => {
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [showChatAssistant, setShowChatAssistant] = useState(false);
  const [showCompareDialog, setShowCompareDialog] = useState(false);
  const [branding, setBranding] = useState<any>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [isCelebrating, setIsCelebrating] = useState(false);
  const [frozenConfiguration, setFrozenConfiguration] = useState<RingConfiguration | null>(null);
  const [searchParams] = useSearchParams();
  const catalogOptions = useClientCatalogOptions(clientId);
  const { caratOptions } = useClientCaratOptions(clientId);
  const { diamondPresets } = useClientDiamondPresets(clientId);
  const ringConfig = useRingConfiguration({
    styles: catalogOptions.styles,
    shanks: catalogOptions.shanks,
    metals: catalogOptions.metals,
    caratOptions: caratOptions,
  });
  const { toast } = useToast();

  const snapshotConfiguration = useCallback((config: RingConfiguration): RingConfiguration => {
    return {
      ...config,
      engraving: {
        enabled: config.engraving?.enabled ?? false,
        text: config.engraving?.text ?? '',
        bandWidth: config.engraving?.bandWidth ?? '2.5mm',
        otherRequest: config.engraving?.otherRequest ?? '',
      },
      stone: config.stone ? { ...config.stone } : null,
    };
  }, []);

  // Load branding configuration from client
  useEffect(() => {
    const clientIdParam = searchParams.get('clientId');
    if (clientIdParam) {
      setClientId(clientIdParam);
      loadBranding(clientIdParam);
    }
  }, [searchParams]);

  const loadBranding = async (clientId: string) => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('branding_config, company_name, logo_url')
        .eq('id', clientId)
        .maybeSingle();
      
      if (error) throw error;
      
      if (data && data.branding_config) {
        setBranding(data.branding_config);
        if (data.company_name) setStoreName(data.company_name);

        // C3: hexToHSL is a tiny pure function — import statically so we don't
        // pay a dynamic-import / parse cost on every theme apply, and batch all
        // CSS variable writes into a single style mutation to avoid layout
        // thrashing + FOUC.
        const config = data.branding_config as any;
        const cssVars: Record<string, string> = {};
        if (config.primaryColor) {
          const hsl = hexToHSL(config.primaryColor);
          const lightness = parseInt(hsl.split('%')[0].split(' ').pop() || '50');
          cssVars['--client-accent'] = hsl;
          cssVars['--client-accent-foreground'] = lightness > 55 ? '0 0% 0%' : '0 0% 100%';
          cssVars['--client-subtle'] = hsl;
        }
        if (config.secondaryColor) {
          cssVars['--client-secondary'] = hexToHSL(config.secondaryColor);
        }
        const root = document.documentElement;
        for (const [name, value] of Object.entries(cssVars)) {
          root.style.setProperty(name, value);
        }
        // Apply per-theme custom colors
        if (config.themeColors) {
          const themeKey = (data as any).widget_theme || 'luxury';
          if (config.themeColors[themeKey]) {
            applyThemeColors(config.themeColors[themeKey]);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load branding:', error);
    }
  };

  // Track configuration views
  useEffect(() => {
    if (clientId && ringConfig.configuration) {
      const timer = setTimeout(() => {
        trackRingView(clientId, ringConfig.configuration);
      }, 2000); // Debounce tracking
      return () => clearTimeout(timer);
    }
  }, [clientId, ringConfig.configuration]);
  useEffect(() => {
    const configParam = searchParams.get('config');
    if (configParam) {
      try {
        const config: RingConfiguration = JSON.parse(atob(configParam));
        // Apply configuration
        if (config.style) ringConfig.updateStyle(config.style);
        if (config.shank) ringConfig.updateShank(config.shank);
        if (config.metal) ringConfig.updateMetal(config.metal);
        if (config.shape) ringConfig.updateShape(config.shape);
        if (config.caratRange) ringConfig.updateCaratRange(config.caratRange);
        if (config.stone) ringConfig.updateStone(config.stone);
        if (config.engraving) ringConfig.updateEngraving({
          enabled: config.engraving.enabled,
          text: config.engraving.text,
          bandWidth: config.engraving.bandWidth || '2.5mm',
          otherRequest: config.engraving.otherRequest || ''
        });
        if (config.size) ringConfig.updateSize(config.size);
        
        toast({
          title: "Design loaded!",
          description: "Shared design has been loaded into the builder"
        });
      } catch (error) {
        console.error('Failed to load shared config:', error);
      }
    }
  }, []);

  const handleApplyAIConfiguration = useCallback((configuration: any) => {
    // If the user has completed a design and we're in the post-celebration freeze window,
    // do NOT apply background AI updates that would drift the live configuration.
    if (frozenConfiguration || isCelebrating) return;

    // Apply all recommendations to the configuration
    if (configuration.style) ringConfig.updateStyle(configuration.style);
    if (configuration.shank) ringConfig.updateShank(configuration.shank);
    if (configuration.metal) ringConfig.updateMetal(configuration.metal);
    if (configuration.shape) ringConfig.updateShape(configuration.shape);
    if (configuration.caratRange != null) ringConfig.updateCaratRange(configuration.caratRange);

    // Resolve stone — lab-safe: only enforce stone type when explicitly provided
    const effectiveShape = configuration.shape || ringConfig.configuration.shape;
    const effectiveCarat = configuration.caratRange ?? ringConfig.configuration.caratRange;
    const effectiveStoneType = configuration.stoneType || null;
    const rawCarat: number | undefined = configuration.rawCarat ?? undefined;
    const preferredColor: string | undefined = configuration.color ?? undefined;
    const preferredClarity: string | undefined = configuration.clarity ?? undefined;

    let resolvedStone: ReturnType<typeof resolveDiamondFromPresets> = null;
    if (effectiveShape && (effectiveCarat != null || effectiveStoneType)) {
      resolvedStone = resolveDiamondFromPresets(
        diamondPresets,
        effectiveShape,
        effectiveCarat ?? 1,
        effectiveStoneType || undefined,
        { strictStoneType: !!effectiveStoneType, rawCarat, preferredColor, preferredClarity },
      );
      if (resolvedStone) ringConfig.updateStone(resolvedStone);
    }

    // Apply optional fields
    if (configuration.size) ringConfig.updateSize(configuration.size);
    if (configuration.engraving) {
      ringConfig.updateEngraving({
        enabled: true,
        text: String(configuration.engraving).slice(0, 20),
        bandWidth: '2.5mm',
        otherRequest: '',
      });
    }

    // Navigate to the first missing step instead of always step 0
    const updatedConfig = {
      ...ringConfig.configuration,
      style: configuration.style || ringConfig.configuration.style,
      shank: configuration.shank || ringConfig.configuration.shank,
      metal: configuration.metal || ringConfig.configuration.metal,
      shape: configuration.shape || ringConfig.configuration.shape,
      caratRange: configuration.caratRange ?? ringConfig.configuration.caratRange,
      stone: resolvedStone || ringConfig.configuration.stone,
    };
    const nextStep = getNextRelevantStep(updatedConfig, false);
    ringConfig.goToStep(nextStep);
  }, [frozenConfiguration, isCelebrating, ringConfig, diamondPresets]);

  // Handle celebration state changes - freeze configuration when celebration starts
  const handleCelebrationChange = (celebrating: boolean) => {
    setIsCelebrating(celebrating);
    if (celebrating) {
      // Freeze the configuration at the moment celebration starts
      setFrozenConfiguration(snapshotConfiguration(ringConfig.configuration));
    }
    // Don't clear on celebration end - keep showing the frozen config until user makes new changes
  };

  // Clear frozen configuration when user makes new selections
  const clearFrozenConfiguration = useCallback(() => {
    setFrozenConfiguration(null);
  }, []);

  // Wrap ringConfig so *any* manual UI selection clears the frozen state first.
  // This ensures the product viewer only updates when the user explicitly changes something.
  const ringConfigWithFreezeAwareness = useMemo(() => {
    return {
      ...ringConfig,
      updateStyle: (style: any) => {
        clearFrozenConfiguration();
        ringConfig.updateStyle(style);
      },
      updateShank: (shank: any) => {
        clearFrozenConfiguration();
        ringConfig.updateShank(shank);
      },
      updateMetal: (metal: any) => {
        clearFrozenConfiguration();
        ringConfig.updateMetal(metal);
      },
      updateShape: (shape: any) => {
        clearFrozenConfiguration();
        ringConfig.updateShape(shape);
      },
      updateCaratRange: (carat: any) => {
        clearFrozenConfiguration();
        ringConfig.updateCaratRange(carat);
      },
      updateStone: (stone: any) => {
        clearFrozenConfiguration();
        ringConfig.updateStone(stone);
      },
      updateEngraving: (data: any) => {
        clearFrozenConfiguration();
        ringConfig.updateEngraving(data);
      },
      updateSize: (size: any) => {
        clearFrozenConfiguration();
        ringConfig.updateSize(size);
      },
      resetConfiguration: () => {
        clearFrozenConfiguration();
        ringConfig.resetConfiguration();
      },
    };
  }, [ringConfig, clearFrozenConfiguration]);

  return (
    <div className="min-h-screen flex flex-col relative">
      <Header />
      
      <main className="flex-1 pt-16 md:pt-20">
        <div className="flex flex-col lg:grid lg:grid-cols-2 lg:gap-4 xl:gap-6 h-[calc(100vh-64px)] md:h-[calc(100vh-80px)]">
          <div className="h-[40vh] lg:h-full">
            <ProductViewer 
              configuration={ringConfig.configuration}
              calculatePrice={ringConfig.calculatePrice}
              isChatMode={showChatAssistant}
              isCelebrating={isCelebrating}
              frozenConfiguration={frozenConfiguration}
            />
          </div>
          <div className="h-[60vh] lg:h-full overflow-hidden relative">
            {/*
              Mobile: when AI Agent is open, dock it inline here (directly under the image) and
              hide the configuration/options panel.
              Desktop: keep the configuration panel visible; AI Agent floats as an overlay.
            */}
            <div className={showChatAssistant ? "hidden lg:block h-full" : "h-full"}>
              <ConfigurationPanel 
                ringConfig={ringConfigWithFreezeAwareness}
                onBookAppointment={() => setAppointmentDialogOpen(true)}
                onAIAssistant={() => {
                  clearFrozenConfiguration();
                  setShowChatAssistant(true);
                }}
                onCompare={() => setShowCompareDialog(true)}
                onSaveDesign={() => {}}
                onAddToCart={() => {}}
              />
            </div>

            {showChatAssistant && (
              <div className="h-full w-full lg:hidden bg-background overflow-hidden">
                <ChatAssistant 
                  onApplyConfiguration={handleApplyAIConfiguration}
                  onClose={() => {
                    setShowChatAssistant(false);
                    const cfg = ringConfig.configuration;
                    if (cfg.style && cfg.shank && cfg.metal && cfg.shape) {
                      ringConfig.goToStep(8);
                    }
                  }}
                   clientId={clientId || undefined}
                   storeName={storeName || undefined}
                  currentConfiguration={ringConfig.configuration}
                  onUpdateStyle={(style, meta?) => {
                    if (meta?.source === 'user') clearFrozenConfiguration();
                    ringConfig.updateStyle(style);
                  }}
                  onUpdateShank={(shank, meta?) => {
                    if (meta?.source === 'user') clearFrozenConfiguration();
                    ringConfig.updateShank(shank);
                  }}
                  onUpdateMetal={(metal, meta?) => {
                    if (meta?.source === 'user') clearFrozenConfiguration();
                    ringConfig.updateMetal(metal);
                  }}
                  onUpdateShape={(shape, meta?) => {
                    if (meta?.source === 'user') clearFrozenConfiguration();
                    ringConfig.updateShape(shape);
                  }}
                  onUpdateCarat={(carat, meta?) => {
                    if (meta?.source === 'user') clearFrozenConfiguration();
                    ringConfig.updateCaratRange(carat);
                  }}
                   onCelebrationChange={handleCelebrationChange}
                   catalogOptions={{
                     styles: catalogOptions.styles.map(s => ({ id: s.id, name: s.name, price: s.price })),
                     shanks: catalogOptions.shanks.map(s => ({ id: s.id, name: s.name, price: s.price })),
                     metals: catalogOptions.metals.map(m => ({ id: m.id, name: m.name, price: m.price })),
                     shapes: catalogOptions.shapes.map(s => ({ id: s.id, name: s.name })),
                     caratOptions: caratOptions.map(c => ({ value: c.carat_value, displayName: c.display_name, priceAdjustment: c.price_adjustment })),
                     diamondPresets,
                   }}
                   onUpdateSize={ringConfig.updateSize}
                   onUpdateEngraving={ringConfig.updateEngraving}
                   onResetConfiguration={ringConfigWithFreezeAwareness.resetConfiguration}
                />
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Desktop-only: ChatAssistant takes the full right column */}
      {showChatAssistant && (
        <div className="fixed z-50 top-16 md:top-20 right-0 w-1/2 h-[calc(100vh-64px)] md:h-[calc(100vh-80px)] overflow-hidden bg-background border-l border-border hidden lg:block">
          <ChatAssistant 
            onApplyConfiguration={handleApplyAIConfiguration}
            onClose={() => {
              setShowChatAssistant(false);
              const cfg = ringConfig.configuration;
              if (cfg.style && cfg.shank && cfg.metal && cfg.shape) {
                ringConfig.goToStep(8);
              }
            }}
            clientId={clientId || undefined}
            storeName={storeName || undefined}
            currentConfiguration={ringConfig.configuration}
            onUpdateStyle={(style, meta?) => {
              if (meta?.source === 'user') clearFrozenConfiguration();
              ringConfig.updateStyle(style);
            }}
            onUpdateShank={(shank, meta?) => {
              if (meta?.source === 'user') clearFrozenConfiguration();
              ringConfig.updateShank(shank);
            }}
            onUpdateMetal={(metal, meta?) => {
              if (meta?.source === 'user') clearFrozenConfiguration();
              ringConfig.updateMetal(metal);
            }}
            onUpdateShape={(shape, meta?) => {
              if (meta?.source === 'user') clearFrozenConfiguration();
              ringConfig.updateShape(shape);
            }}
            onUpdateCarat={(carat, meta?) => {
              if (meta?.source === 'user') clearFrozenConfiguration();
              ringConfig.updateCaratRange(carat);
            }}
            onCelebrationChange={handleCelebrationChange}
            catalogOptions={{
              styles: catalogOptions.styles.map(s => ({ id: s.id, name: s.name, price: s.price })),
              shanks: catalogOptions.shanks.map(s => ({ id: s.id, name: s.name, price: s.price })),
              metals: catalogOptions.metals.map(m => ({ id: m.id, name: m.name, price: m.price })),
              shapes: catalogOptions.shapes.map(s => ({ id: s.id, name: s.name })),
              caratOptions: caratOptions.map(c => ({ value: c.carat_value, displayName: c.display_name, priceAdjustment: c.price_adjustment })),
              diamondPresets,
            }}
            onUpdateSize={ringConfig.updateSize}
            onUpdateEngraving={ringConfig.updateEngraving}
            onResetConfiguration={ringConfigWithFreezeAwareness.resetConfiguration}
          />
        </div>
      )}


      <BookAppointmentDialog
        open={appointmentDialogOpen}
        onOpenChange={setAppointmentDialogOpen}
        clientId={clientId || undefined}
        ringConfiguration={ringConfig.configuration}
      />

      <CompareDialog
        open={showCompareDialog}
        onOpenChange={setShowCompareDialog}
        currentConfiguration={ringConfig.configuration}
        calculatePrice={ringConfig.calculatePrice}
      />
    </div>
  );
};

export default CustomRingBuilder;

```

---

## `supabase/functions/generate-client-diamond-presets/index.ts`

```ts
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Shape display names
const SHAPE_NAMES: Record<string, string> = {
  round: 'Round', princess: 'Princess', oval: 'Oval', cushion: 'Cushion',
  emerald: 'Emerald', pear: 'Pear', marquise: 'Marquise', radiant: 'Radiant',
  asscher: 'Asscher', heart: 'Heart',
};

// Pool shape tokens (uppercase) → wizard shape ids
const POOL_SHAPE_MAP: Record<string, string> = {
  'ROUND': 'round',
  'OVAL': 'oval',
  'PEAR': 'pear',
  'EMERALD': 'emerald',
  'CUSHION': 'cushion',
  'CUSHION BRILLIANT': 'cushion',
  'CUSHION MODIFIED': 'cushion',
  'PRINCESS': 'princess',
  'RADIANT': 'radiant',
  'MARQUISE': 'marquise',
  'ASSCHER': 'asscher',
  'HEART': 'heart',
};

function normalizeShape(v: string): string {
  return POOL_SHAPE_MAP[v.trim().toUpperCase()] ?? v.trim().toLowerCase();
}

function getShapeName(id: string): string {
  return SHAPE_NAMES[id] || id.charAt(0).toUpperCase() + id.slice(1);
}

// Apply rounding
function applyRounding(price: number, rounding: string): number {
  if (rounding === 'none' || !rounding) return price;
  const r = parseInt(rounding);
  if (isNaN(r)) return price;
  return Math.round(price / r) * r;
}

// Generate title from template
function generateTitle(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

// Generate carat range label
function getCaratRange(carat: number): string {
  if (carat < 1.00) return '0.50-0.99';
  if (carat < 1.50) return '1.00-1.49';
  if (carat < 2.00) return '1.50-1.99';
  if (carat < 2.50) return '2.00-2.49';
  if (carat < 3.00) return '2.50-2.99';
  if (carat < 3.50) return '3.00-3.49';
  if (carat < 4.00) return '3.50-3.99';
  if (carat < 4.50) return '4.00-4.49';
  if (carat < 5.00) return '4.50-4.99';
  return '5.00+';
}

// Ring OS Master Cheat Sheet (May 2026) — fallback multipliers used when wizardConfig
// doesn't carry per-stone-type maps (older saved states).
const FALLBACK_CLARITY_NATURAL: Record<string, number> = {
  FL: 1.95, IF: 1.75, VVS1: 1.45, VVS2: 1.32, VS1: 1.15, VS2: 1.00,
  SI1: 0.82, SI2: 0.65, I1: 0.45, I2: 0.30, I3: 0.20,
};
const FALLBACK_CLARITY_LAB: Record<string, number> = {
  FL: 1.95, IF: 1.75, VVS1: 1.15, VVS2: 1.08, VS1: 1.04, VS2: 1.00,
  SI1: 0.88, SI2: 0.78, I1: 0.60, I2: 0.45, I3: 0.30,
};
const FALLBACK_COLOR_NATURAL: Record<string, number> = {
  D: 1.35, E: 1.24, F: 1.14, G: 1.00, H: 0.90, I: 0.78, J: 0.66, K: 0.55,
  L: 0.48, M: 0.42,
};
const FALLBACK_COLOR_LAB: Record<string, number> = {
  D: 1.15, E: 1.10, F: 1.05, G: 1.00, H: 0.94, I: 0.85, J: 0.75, K: 0.65,
  L: 0.58, M: 0.52,
};
const FALLBACK_SHAPE_DISCOUNTS: Record<string, number> = {
  round: 1.00, oval: 0.83, pear: 0.78, cushion: 0.75, princess: 0.70,
  radiant: 0.70, marquise: 0.70, emerald: 0.68, asscher: 0.62, heart: 0.75,
};

// Get markup for a carat value from tiers
function getMarkup(carat: number, tiers: any[]): number {
  for (const tier of tiers) {
    const from = tier.caratFrom ?? 0;
    const to = tier.caratTo;
    if (carat >= from && (to === null || carat <= to)) {
      return tier.markup ?? 0;
    }
  }
  return 0;
}

// Get purchasing price for a carat value from tiers
function getPurchasingPrice(carat: number, tiers: any[]): number {
  for (const tier of tiers) {
    const from = tier.caratFrom ?? 0;
    const to = tier.caratTo;
    if (carat >= from && (to === null || carat <= to)) {
      return tier.purchasingPrice ?? 0;
    }
  }
  return 0;
}

// Generate discrete carat values from a range
function generateCaratValues(min: number, max: number): number[] {
  const values: number[] = [];
  // Standard carat points
  const standardCarats = [
    0.50, 1.00, 1.50, 2.00, 2.50, 3.00, 3.50, 4.00, 4.50, 5.00,
  ];
  for (const c of standardCarats) {
    if (c >= min && c <= max) values.push(c);
  }
  return values;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { clientId, wizardConfig } = body;

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: 'Client ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authorization check
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const isAgencyAdmin = roleData?.role === 'agency_admin';

    if (!isAgencyAdmin) {
      const { data: clientData } = await supabaseAdmin
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('user_id', user.id)
        .single();

      if (!clientData) {
        const { data: staffData } = await supabaseAdmin
          .from('staff_members')
          .select('permissions')
          .eq('user_id', user.id)
          .eq('client_id', clientId)
          .single();

        const catalogAccess = staffData?.permissions?.catalog_access;
        if (!staffData || (catalogAccess !== 'edit' && catalogAccess !== true)) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    if (!wizardConfig) {
      return new Response(
        JSON.stringify({ error: 'Wizard configuration is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Keep the edge function lightweight: the large catalogue build now runs
    // inside the database, avoiding edge CPU limits while preserving auth checks.
    const { data: generationResult, error: generationError } = await supabaseClient.rpc(
      'generate_client_diamond_presets_db' as any,
      {
        p_client_id: clientId,
        p_wizard_config: wizardConfig,
      }
    );

    if (generationError) {
      console.error('Database generation error:', generationError);
      return new Response(
        JSON.stringify({ error: generationError.message || 'Failed to generate diamond presets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(generationResult ?? { success: true, presetsCount: 0, source: 'database' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    const { diamondType, shapes, grading, pricing, productSettings } = wizardConfig;

    // Delete existing diamond presets for this client
    await supabaseAdmin
      .from('client_diamond_presets')
      .delete()
      .eq('client_id', clientId);

    // If no types enabled or no shapes selected, we're done
    if ((!diamondType?.naturalEnabled && !diamondType?.labGrownEnabled) || !shapes?.selectedShapes?.length) {
      return new Response(
        JSON.stringify({ success: true, presetsCount: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract configuration
    const selectedShapes: string[] = shapes.selectedShapes || [];
    const colors: string[] = grading?.colors || [];
    const clarities: string[] = grading?.clarities || [];
    const cutGrades: string[] = grading?.cutGrades || ['Excellent'];
    const polishGrades: string[] = grading?.polish || ['Excellent'];
    const symmetryGrades: string[] = grading?.symmetry || ['Excellent'];
    const fluorescenceLevels: string[] = grading?.fluorescence || ['None'];
    const caratRange: [number, number] = grading?.caratRange || [0.50, 5.00];
    const currency = pricing?.currency || 'USD';
    const pricingMethod = pricing?.pricingMethod || 'percentage';
    const priceRounding = pricing?.priceRounding || 'none';
    const titleTemplate = productSettings?.titleTemplate || '{carat}ct {shape} Diamond - {clarity}';
    const skuTemplate = productSettings?.skuTemplate || 'DIA-{shape}-{clarity}-{carat}';
    const certifications: string[] = diamondType?.certifications || ['GIA'];

    // Cheat-sheet multipliers from wizard (jeweler-editable) with fallback to Ring OS defaults
    const clarityNat = pricing?.clarityMultipliersNatural || FALLBACK_CLARITY_NATURAL;
    const clarityLab = pricing?.clarityMultipliersLab || FALLBACK_CLARITY_LAB;
    const colorNat = pricing?.colorMultipliersNatural || FALLBACK_COLOR_NATURAL;
    const colorLab = pricing?.colorMultipliersLab || FALLBACK_COLOR_LAB;
    const shapeDiscounts = pricing?.shapeDiscounts || FALLBACK_SHAPE_DISCOUNTS;

    // Generate carat values from range
    const caratValues = generateCaratValues(caratRange[0], caratRange[1]);

    // Build presets
    const presets: any[] = [];
    const stoneTypes: string[] = [];
    if (diamondType.naturalEnabled) stoneTypes.push('natural');
    if (diamondType.labGrownEnabled) stoneTypes.push('lab');

    // ----- Pre-fetch pool rows. We materialize ONE preset per individual pool row
    // so that e.g. 18 separate 1.50ct stones become 18 distinct presets, each
    // priced from its own `price` column + jeweler markup.
    // Group key: `stoneType|shape|color|clarity`. Value: array of {carat, price}.
    const poolRowsByGroup = new Map<string, Array<{ carat: number; price: number }>>();

    try {
      const caratMin = caratRange[0];
      const caratMax = caratRange[1];
      const colorTargets = Array.from(new Set(colors.map((c) => c.toUpperCase())));
      const clarityTargets = Array.from(new Set(clarities.map((c) => c.toUpperCase())));

      const QUALITY_TO_CODES: Record<string, string[]> = {
        'Excellent': ['EX'], 'Very Good': ['VG'], 'Good': ['G'], 'Fair': ['F'], 'Poor': ['P'],
      };
      const toCodes = (labels: string[]) => Array.from(new Set(
        labels.flatMap((l) => QUALITY_TO_CODES[l] ?? [l.toUpperCase()])
      ));
      const cutCodes = toCodes(cutGrades);
      const polCodes = toCodes(polishGrades);
      const symmCodes = toCodes(symmetryGrades);

      const measMin = grading?.measurementsMinLength;
      const measMax = grading?.measurementsMaxLength;

      const FLUOR_TO_CODES: Record<string, string[]> = {
        'None': ['NON', 'NONE'],
        'Faint': ['FNT'],
        'Very Slight': ['VSL'],
        'Slight': ['SL'],
        'Medium': ['MED'],
        'Strong': ['STG', 'STR'],
        'Very Strong': ['VST'],
      };
      const fluorCodes = Array.from(new Set(
        fluorescenceLevels.flatMap((l) => FLUOR_TO_CODES[l] ?? [l.toUpperCase()])
      ));
      const labTargets: string[] = Array.from(new Set(
        (grading?.labs ?? []).map((l: string) => String(l).trim().toUpperCase())
      ));

      const PAGE = 1000;
      let from = 0;
      while (true) {
        let q = supabaseAdmin
          .from('diamond_inventory_pool')
          .select('shape, col, clar, carats, price, lg, cut, pol, symm, length, flo, lab')
          .gte('carats', caratMin)
          .lte('carats', caratMax)
          .in('col', colorTargets)
          .in('clar', clarityTargets);

        const wantsRound = selectedShapes.includes('round');
        if (cutCodes.length > 0 && wantsRound) {
          q = q.or(`cut.in.(${cutCodes.join(',')}),cut.eq.-`);
        }
        if (polCodes.length > 0) q = q.in('pol', polCodes);
        if (symmCodes.length > 0) q = q.in('symm', symmCodes);
        if (fluorCodes.length > 0) q = q.in('flo', fluorCodes);
        if (labTargets.length > 0) q = q.in('lab', labTargets);
        if (typeof measMin === 'number' && !isNaN(measMin)) q = q.gte('length', measMin);
        if (typeof measMax === 'number' && !isNaN(measMax)) q = q.lte('length', measMax);

        const { data: poolRows, error: poolErr } = await q.range(from, from + PAGE - 1);
        if (poolErr) {
          console.warn('[generate-client-diamond-presets] pool lookup failed:', poolErr.message);
          break;
        }
        if (!poolRows || poolRows.length === 0) break;
        for (const r of poolRows) {
          if (!r.shape || !r.col || !r.clar || r.carats == null) continue;
          const shapeId = normalizeShape(String(r.shape));
          const exact = Number(Number(r.carats).toFixed(2));
          const stoneType = String(r.lg ?? '').toLowerCase() === 'natural' ? 'natural' : 'lab';
          const groupKey = `${stoneType}|${shapeId}|${String(r.col).toUpperCase()}|${String(r.clar).toUpperCase()}`;
          const priceNum = r.price != null && !isNaN(Number(r.price)) ? Number(r.price) : 0;
          let arr = poolRowsByGroup.get(groupKey);
          if (!arr) { arr = []; poolRowsByGroup.set(groupKey, arr); }
          arr.push({ carat: exact, price: priceNum });
        }
        if (poolRows.length < PAGE) break;
        from += PAGE;
      }
    } catch (e) {
      console.warn('[generate-client-diamond-presets] pool prefetch skipped:', (e as Error)?.message);
    }

    for (const stoneType of stoneTypes) {
      const markupTiers = stoneType === 'natural'
        ? (pricing?.naturalMarkupTiers || [])
        : (pricing?.labMarkupTiers || []);
      const clarityMap = stoneType === 'natural' ? clarityNat : clarityLab;
      const colorMap = stoneType === 'natural' ? colorNat : colorLab;

      for (const shapeId of selectedShapes) {
        const shapeName = getShapeName(shapeId);
        const isRound = shapeId === 'round';
        const shapeMult = shapeDiscounts[shapeId] ?? 1.0;

        // Determine applicable cut grades for metadata
        const applicableCutGrades = isRound ? cutGrades : [];

        for (const color of colors) {
          for (const clarity of clarities) {
            const groupKey = `${stoneType}|${shapeId}|${color.toUpperCase()}|${clarity.toUpperCase()}`;
            const poolRows = poolRowsByGroup.get(groupKey) ?? [];

            // Build per-row entries. When pool has matches, emit ONE preset per
            // individual pool stone (so 18 separate 1.50ct stones → 18 presets,
            // each priced from its own pool `price` + markup). When pool empty,
            // fall back to standard discrete carats with cheat-sheet pricing.
            type RowEntry = { carat: number; basePrice: number; fromPool: boolean };
            const entries: RowEntry[] = poolRows.length > 0
              ? poolRows
                  .filter((r) => r.price > 0)
                  .map((r) => ({ carat: r.carat, basePrice: r.price, fromPool: true }))
              : caratValues.map((c) => {
                  const wholesale = getPurchasingPrice(c, markupTiers);
                  const clarityMult = clarityMap[clarity] ?? 1.0;
                  const colorMult = colorMap[color] ?? 1.0;
                  return { carat: c, basePrice: wholesale * clarityMult * colorMult * shapeMult, fromPool: false };
                });

            for (const entry of entries) {
              const { carat, basePrice, fromPool } = entry;

              let markupPercentage = 0;
              let finalPrice = basePrice;
              if (pricingMethod === 'percentage') {
                markupPercentage = getMarkup(carat, markupTiers);
                finalPrice = basePrice * (1 + markupPercentage / 100);
              } else if (pricingMethod === 'fixed_margin') {
                const margin = getMarkup(carat, markupTiers);
                finalPrice = basePrice + (margin * carat);
                markupPercentage = basePrice > 0 ? ((finalPrice - basePrice) / basePrice) * 100 : 0;
              }

              const templateValues = {
                carat: carat.toFixed(2),
                shape: shapeName,
                color,
                clarity,
                cut: applicableCutGrades[0] || '',
                origin: stoneType === 'natural' ? 'Natural' : 'Lab-Grown',
                lab: certifications[0] || 'GIA',
                report_number: '',
              };

              const productTitle = generateTitle(titleTemplate, templateValues);
              const sku = generateTitle(skuTemplate, templateValues).toUpperCase().replace(/\s+/g, '-');

              presets.push({
                client_id: clientId,
                stone_type: stoneType,
                shape_id: shapeId,
                carat_range: getCaratRange(carat),
                carat_value: carat,
                color,
                clarity,
                base_price: Math.round(basePrice),
                custom_price: Math.round(finalPrice),
                is_enabled: true,
                cut_grade: applicableCutGrades.length > 0 ? applicableCutGrades.join(', ') : null,
                polish: polishGrades.length > 0 ? polishGrades.join(', ') : null,
                symmetry: symmetryGrades.length > 0 ? symmetryGrades.join(', ') : null,
                fluorescence: fluorescenceLevels.length > 0 ? fluorescenceLevels.join(', ') : null,
                certification: certifications[0] || null,
                origin: stoneType,
                sku,
                product_title: productTitle,
                currency,
                markup_percentage: markupPercentage > 0 ? markupPercentage : null,
                compare_at_price: null,
                pool_stock_count: fromPool ? 1 : 0,
              });
            }
          }
        }
      }
    }

    // Insert in batches, running multiple batches in parallel to stay under
    // the edge function CPU time limit when the catalog is large (20K+ rows).
    const BATCH_SIZE = 1000;
    const CONCURRENCY = 5;

    const batches: any[][] = [];
    for (let i = 0; i < presets.length; i += BATCH_SIZE) {
      batches.push(presets.slice(i, i + BATCH_SIZE));
    }

    const runInserts = async () => {
      for (let i = 0; i < batches.length; i += CONCURRENCY) {
        const slice = batches.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          slice.map((batch) =>
            supabaseAdmin.from('client_diamond_presets').insert(batch)
          )
        );
        for (const { error } of results) {
          if (error) console.error('Batch insert error:', error.message);
        }
      }

      await supabaseAdmin.from('client_activity_logs').insert({
        client_id: clientId,
        user_id: user.id,
        action_type: 'diamond_presets_generated',
        action_category: 'catalog',
        description: `Generated ${presets.length} diamond presets (${selectedShapes.length} shapes, ${colors.length} colors, ${clarities.length} clarities)`,
        metadata: {
          stone_types: stoneTypes,
          shapes_count: selectedShapes.length,
          presets_count: presets.length,
          pricing_method: pricingMethod,
          currency,
        },
      });
    };

    // For large catalogs, run inserts in the background so we don't hit the
    // edge function CPU/wall-clock cap. Client gets success immediately;
    // presets stream into the table over the next few seconds.
    const LARGE_THRESHOLD = 2000;
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (presets.length > LARGE_THRESHOLD && typeof edgeRuntime?.waitUntil === 'function') {
      edgeRuntime.waitUntil(runInserts());
      return new Response(
        JSON.stringify({ success: true, presetsCount: presets.length, background: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await runInserts();

    return new Response(
      JSON.stringify({ success: true, presetsCount: presets.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-client-diamond-presets:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

```

---

## `supabase/functions/reset-client-diamonds/index.ts`

```ts
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { clientId } = await req.json();
    if (!clientId) throw new Error('Client ID is required');

    // Authorization check: agency admin, client owner, or staff with edit perm
    const [{ data: adminRole }, { data: clientData }, { data: staffData }] = await Promise.all([
      supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'agency_admin').maybeSingle(),
      supabase.from('clients').select('id').eq('id', clientId).eq('user_id', user.id).maybeSingle(),
      supabase.from('staff_members').select('id, client_id, permissions').eq('user_id', user.id).maybeSingle(),
    ]);

    let authorized = false;
    if (adminRole) authorized = true;
    if (clientData) authorized = true;
    if (staffData && staffData.client_id === clientId) {
      const perms = staffData.permissions as { catalog_access?: string } | null;
      if (String(perms?.catalog_access ?? '').toLowerCase() === 'edit') authorized = true;
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: 'Not authorized to reset this diamond catalog' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Resetting diamond catalog for client: ${clientId}`);

    // Single DB call — runs DELETE in one SQL statement, no serial batching.
    // The reset_client_diamond_presets function also clears diamond_catalog_config.
    const { data: deletedCount, error: rpcErr } = await supabase
      .rpc('reset_client_diamond_presets', { p_client_id: clientId });

    if (rpcErr) {
      // RPC not deployed yet (migration pending) — fall back to direct deletes
      console.warn('RPC not available, falling back to direct delete:', rpcErr.message);

      const { error: delErr } = await supabase
        .from('client_diamond_presets')
        .delete()
        .eq('client_id', clientId);
      if (delErr) throw delErr;

      const { error: cfgErr } = await supabase
        .from('diamond_catalog_config')
        .delete()
        .eq('client_id', clientId);
      if (cfgErr) console.error('config delete error:', cfgErr);

      console.log(`Reset complete for ${clientId} (fallback path)`);
      return new Response(JSON.stringify({ success: true, deleted: 'unknown' }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Reset complete for ${clientId}, deleted ${deletedCount} presets`);

    return new Response(JSON.stringify({ success: true, deleted: deletedCount }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('reset-client-diamonds error:', error);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

```

---

## `supabase/migrations/20260519190449_0d42561c-2e32-4450-8f8a-f14950a5cdad.sql`

```sql
CREATE OR REPLACE FUNCTION public.swap_diamond_inventory_pool(p_batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '600s'
AS $function$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'agency_admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.diamond_inventory_pool_staging;
  IF v_count < 1 THEN
    RAISE EXCEPTION 'staging_empty';
  END IF;

  TRUNCATE TABLE public.diamond_inventory_pool;

  INSERT INTO public.diamond_inventory_pool
  SELECT * FROM public.diamond_inventory_pool_staging;

  UPDATE public.diamond_inventory_pool SET import_batch_id = p_batch_id WHERE import_batch_id IS NULL;

  TRUNCATE TABLE public.diamond_inventory_pool_staging;

  RETURN jsonb_build_object('success', true, 'row_count', v_count);
END;
$function$;
```

---

## `supabase/migrations/20260521073632_b080872b-5d05-4907-a730-3f758d60b72c.sql`

```sql
ALTER TABLE public.client_diamond_presets
  ADD COLUMN IF NOT EXISTS pool_stock_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_client_diamond_presets_pool_stock
  ON public.client_diamond_presets (client_id, pool_stock_count);

CREATE OR REPLACE FUNCTION public.get_diamond_pool_distinct_values()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'shapes',       (SELECT COALESCE(jsonb_agg(v ORDER BY v), '[]'::jsonb) FROM (SELECT DISTINCT NULLIF(TRIM(shape),'') v FROM diamond_inventory_pool WHERE shape IS NOT NULL) s WHERE v IS NOT NULL),
    'colors',       (SELECT COALESCE(jsonb_agg(v ORDER BY v), '[]'::jsonb) FROM (SELECT DISTINCT NULLIF(TRIM(col),'')   v FROM diamond_inventory_pool WHERE col   IS NOT NULL) s WHERE v IS NOT NULL),
    'clarities',    (SELECT COALESCE(jsonb_agg(v ORDER BY v), '[]'::jsonb) FROM (SELECT DISTINCT NULLIF(TRIM(clar),'')  v FROM diamond_inventory_pool WHERE clar  IS NOT NULL) s WHERE v IS NOT NULL),
    'cuts',         (SELECT COALESCE(jsonb_agg(v ORDER BY v), '[]'::jsonb) FROM (SELECT DISTINCT NULLIF(TRIM(cut),'')   v FROM diamond_inventory_pool WHERE cut   IS NOT NULL AND cut <> '-') s WHERE v IS NOT NULL),
    'polish',       (SELECT COALESCE(jsonb_agg(v ORDER BY v), '[]'::jsonb) FROM (SELECT DISTINCT NULLIF(TRIM(pol),'')   v FROM diamond_inventory_pool WHERE pol   IS NOT NULL AND pol <> '-') s WHERE v IS NOT NULL),
    'symmetry',     (SELECT COALESCE(jsonb_agg(v ORDER BY v), '[]'::jsonb) FROM (SELECT DISTINCT NULLIF(TRIM(symm),'')  v FROM diamond_inventory_pool WHERE symm  IS NOT NULL AND symm <> '-') s WHERE v IS NOT NULL),
    'fluorescence', (SELECT COALESCE(jsonb_agg(v ORDER BY v), '[]'::jsonb) FROM (SELECT DISTINCT NULLIF(TRIM(flo),'')   v FROM diamond_inventory_pool WHERE flo   IS NOT NULL) s WHERE v IS NOT NULL),
    'labs',         (SELECT COALESCE(jsonb_agg(v ORDER BY v), '[]'::jsonb) FROM (SELECT DISTINCT NULLIF(TRIM(lab),'')   v FROM diamond_inventory_pool WHERE lab   IS NOT NULL) s WHERE v IS NOT NULL)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_diamond_pool_distinct_values() TO authenticated;
```

---

## `supabase/migrations/20260522053557_84078401-5a2d-45a4-b82a-7e602b55becf.sql`

```sql
CREATE INDEX IF NOT EXISTS idx_diamond_inventory_pool_generation_filters
  ON public.diamond_inventory_pool (carats, col, clar, lg);

CREATE INDEX IF NOT EXISTS idx_diamond_inventory_pool_grading_filters
  ON public.diamond_inventory_pool (pol, symm, flo, lab);

CREATE INDEX IF NOT EXISTS idx_diamond_inventory_pool_shape_upper
  ON public.diamond_inventory_pool ((upper(trim(shape))));

CREATE OR REPLACE FUNCTION public._diamond_preset_shape_id(p_shape text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE upper(trim(COALESCE(p_shape, '')))
    WHEN 'ROUND' THEN 'round'
    WHEN 'OVAL' THEN 'oval'
    WHEN 'PEAR' THEN 'pear'
    WHEN 'EMERALD' THEN 'emerald'
    WHEN 'CUSHION' THEN 'cushion'
    WHEN 'CUSHION BRILLIANT' THEN 'cushion'
    WHEN 'CUSHION MODIFIED' THEN 'cushion'
    WHEN 'PRINCESS' THEN 'princess'
    WHEN 'RADIANT' THEN 'radiant'
    WHEN 'MARQUISE' THEN 'marquise'
    WHEN 'ASSCHER' THEN 'asscher'
    WHEN 'HEART' THEN 'heart'
    ELSE lower(trim(COALESCE(p_shape, '')))
  END;
$$;

CREATE OR REPLACE FUNCTION public._diamond_preset_shape_name(p_shape_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE COALESCE(p_shape_id, '')
    WHEN 'round' THEN 'Round'
    WHEN 'princess' THEN 'Princess'
    WHEN 'oval' THEN 'Oval'
    WHEN 'cushion' THEN 'Cushion'
    WHEN 'emerald' THEN 'Emerald'
    WHEN 'pear' THEN 'Pear'
    WHEN 'marquise' THEN 'Marquise'
    WHEN 'radiant' THEN 'Radiant'
    WHEN 'asscher' THEN 'Asscher'
    WHEN 'heart' THEN 'Heart'
    ELSE initcap(COALESCE(p_shape_id, ''))
  END;
$$;

CREATE OR REPLACE FUNCTION public._diamond_preset_carat_range(p_carat numeric)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_carat < 1.00 THEN '0.50-0.99'
    WHEN p_carat < 1.50 THEN '1.00-1.49'
    WHEN p_carat < 2.00 THEN '1.50-1.99'
    WHEN p_carat < 2.50 THEN '2.00-2.49'
    WHEN p_carat < 3.00 THEN '2.50-2.99'
    WHEN p_carat < 3.50 THEN '3.00-3.49'
    WHEN p_carat < 4.00 THEN '3.50-3.99'
    WHEN p_carat < 4.50 THEN '4.00-4.49'
    WHEN p_carat < 5.00 THEN '4.50-4.99'
    ELSE '5.00+'
  END;
$$;

CREATE OR REPLACE FUNCTION public._diamond_preset_tier_value(p_carat numeric, p_tiers jsonb, p_field text)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT COALESCE(NULLIF(tier ->> p_field, '')::numeric, 0)
    FROM jsonb_array_elements(COALESCE(p_tiers, '[]'::jsonb)) AS tier
    WHERE p_carat >= COALESCE(NULLIF(tier ->> 'caratFrom', '')::numeric, 0)
      AND (
        tier ->> 'caratTo' IS NULL
        OR NULLIF(tier ->> 'caratTo', '') IS NULL
        OR p_carat <= NULLIF(tier ->> 'caratTo', '')::numeric
      )
    ORDER BY COALESCE(NULLIF(tier ->> 'caratFrom', '')::numeric, 0) DESC
    LIMIT 1
  ), 0);
$$;

CREATE OR REPLACE FUNCTION public.generate_client_diamond_presets_db(
  p_client_id uuid,
  p_wizard_config jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '600s'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_diamond_type jsonb := COALESCE(p_wizard_config -> 'diamondType', '{}'::jsonb);
  v_shapes_config jsonb := COALESCE(p_wizard_config -> 'shapes', '{}'::jsonb);
  v_grading jsonb := COALESCE(p_wizard_config -> 'grading', '{}'::jsonb);
  v_pricing jsonb := COALESCE(p_wizard_config -> 'pricing', '{}'::jsonb);
  v_product jsonb := COALESCE(p_wizard_config -> 'productSettings', '{}'::jsonb);
  v_shapes text[];
  v_colors text[];
  v_clarities text[];
  v_cut_labels text[];
  v_polish_labels text[];
  v_symmetry_labels text[];
  v_fluor_labels text[];
  v_lab_targets text[];
  v_certifications text[];
  v_stone_types text[] := ARRAY[]::text[];
  v_cut_codes text[];
  v_polish_codes text[];
  v_symmetry_codes text[];
  v_fluor_codes text[];
  v_carat_min numeric := COALESCE(NULLIF(v_grading #>> '{caratRange,0}', '')::numeric, 0.50);
  v_carat_max numeric := COALESCE(NULLIF(v_grading #>> '{caratRange,1}', '')::numeric, 5.00);
  v_currency text := COALESCE(NULLIF(v_pricing ->> 'currency', ''), 'USD');
  v_pricing_method text := COALESCE(NULLIF(v_pricing ->> 'pricingMethod', ''), 'percentage');
  v_title_template text := COALESCE(NULLIF(v_product ->> 'titleTemplate', ''), '{carat}ct {shape} Diamond - {clarity}');
  v_sku_template text := COALESCE(NULLIF(v_product ->> 'skuTemplate', ''), 'DIA-{shape}-{clarity}-{carat}');
  v_standard_carats numeric[] := ARRAY[0.50, 1.00, 1.50, 2.00, 2.50, 3.00, 3.50, 4.00, 4.50, 5.00];
  v_pool_count integer := 0;
  v_fallback_count integer := 0;
  v_total_count integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT (
    public.has_role(v_actor, 'agency_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.user_id = v_actor)
    OR EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.user_id = v_actor
        AND sm.client_id = p_client_id
        AND sm.status = 'active'
        AND (sm.permissions ->> 'catalog_access' = 'edit' OR sm.permissions ->> 'catalog_access' = 'true')
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_shapes := COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_shapes_config -> 'selectedShapes')), ARRAY[]::text[]);
  v_colors := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'colors')))), ARRAY[]::text[]);
  v_clarities := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'clarities')))), ARRAY[]::text[]);
  v_cut_labels := COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'cutGrades')), ARRAY['Excellent']::text[]);
  v_polish_labels := COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'polish')), ARRAY['Excellent']::text[]);
  v_symmetry_labels := COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'symmetry')), ARRAY['Excellent']::text[]);
  v_fluor_labels := COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'fluorescence')), ARRAY['None']::text[]);
  v_lab_targets := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'labs')))), ARRAY[]::text[]);
  v_certifications := COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_diamond_type -> 'certifications')), ARRAY['GIA']::text[]);

  v_cut_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'Excellent' THEN 'EX' WHEN 'Very Good' THEN 'VG' WHEN 'Good' THEN 'G' WHEN 'Fair' THEN 'F' WHEN 'Poor' THEN 'P' ELSE upper(label) END FROM unnest(v_cut_labels) AS label);
  v_polish_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'Excellent' THEN 'EX' WHEN 'Very Good' THEN 'VG' WHEN 'Good' THEN 'G' WHEN 'Fair' THEN 'F' WHEN 'Poor' THEN 'P' ELSE upper(label) END FROM unnest(v_polish_labels) AS label);
  v_symmetry_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'Excellent' THEN 'EX' WHEN 'Very Good' THEN 'VG' WHEN 'Good' THEN 'G' WHEN 'Fair' THEN 'F' WHEN 'Poor' THEN 'P' ELSE upper(label) END FROM unnest(v_symmetry_labels) AS label);
  v_fluor_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'None' THEN 'NON' WHEN 'Faint' THEN 'FNT' WHEN 'Very Slight' THEN 'VSL' WHEN 'Slight' THEN 'SL' WHEN 'Medium' THEN 'MED' WHEN 'Strong' THEN 'STG' WHEN 'Very Strong' THEN 'VST' ELSE upper(label) END FROM unnest(v_fluor_labels) AS label);

  IF COALESCE((v_diamond_type ->> 'naturalEnabled')::boolean, false) THEN
    v_stone_types := array_append(v_stone_types, 'natural');
  END IF;
  IF COALESCE((v_diamond_type ->> 'labGrownEnabled')::boolean, false) THEN
    v_stone_types := array_append(v_stone_types, 'lab');
  END IF;

  DELETE FROM public.client_diamond_presets WHERE client_id = p_client_id;

  IF cardinality(v_stone_types) = 0 OR cardinality(v_shapes) = 0 OR cardinality(v_colors) = 0 OR cardinality(v_clarities) = 0 THEN
    RETURN jsonb_build_object('success', true, 'presetsCount', 0, 'source', 'database');
  END IF;

  WITH pool_source AS (
    SELECT
      CASE WHEN lower(COALESCE(dip.lg, '')) = 'natural' THEN 'natural' ELSE 'lab' END AS stone_type,
      public._diamond_preset_shape_id(dip.shape) AS shape_id,
      round(dip.carats::numeric, 2) AS carat,
      upper(trim(dip.col)) AS color,
      upper(trim(dip.clar)) AS clarity,
      COALESCE(dip.price, 0)::numeric AS base_price
    FROM public.diamond_inventory_pool dip
    WHERE dip.carats >= v_carat_min
      AND dip.carats <= v_carat_max
      AND upper(trim(dip.col)) = ANY(v_colors)
      AND upper(trim(dip.clar)) = ANY(v_clarities)
      AND public._diamond_preset_shape_id(dip.shape) = ANY(v_shapes)
      AND (CASE WHEN lower(COALESCE(dip.lg, '')) = 'natural' THEN 'natural' ELSE 'lab' END) = ANY(v_stone_types)
      AND (
        public._diamond_preset_shape_id(dip.shape) <> 'round'
        OR cardinality(v_cut_codes) = 0
        OR dip.cut = ANY(v_cut_codes)
        OR dip.cut = '-'
      )
      AND (cardinality(v_polish_codes) = 0 OR dip.pol = ANY(v_polish_codes))
      AND (cardinality(v_symmetry_codes) = 0 OR dip.symm = ANY(v_symmetry_codes))
      AND (cardinality(v_fluor_codes) = 0 OR dip.flo = ANY(v_fluor_codes))
      AND (cardinality(v_lab_targets) = 0 OR upper(trim(dip.lab)) = ANY(v_lab_targets))
      AND (
        v_grading ->> 'measurementsMinLength' IS NULL
        OR dip.length >= NULLIF(v_grading ->> 'measurementsMinLength', '')::numeric
      )
      AND (
        v_grading ->> 'measurementsMaxLength' IS NULL
        OR dip.length <= NULLIF(v_grading ->> 'measurementsMaxLength', '')::numeric
      )
      AND COALESCE(dip.price, 0) > 0
  ), priced AS (
    SELECT
      ps.*,
      public._diamond_preset_tier_value(ps.carat, CASE WHEN ps.stone_type = 'natural' THEN v_pricing -> 'naturalMarkupTiers' ELSE v_pricing -> 'labMarkupTiers' END, 'markup') AS markup_value
    FROM pool_source ps
  ), final_rows AS (
    SELECT
      p.*,
      CASE
        WHEN v_pricing_method = 'percentage' THEN p.base_price * (1 + p.markup_value / 100)
        WHEN v_pricing_method = 'fixed_margin' THEN p.base_price + (p.markup_value * p.carat)
        ELSE p.base_price
      END AS final_price
    FROM priced p
  )
  INSERT INTO public.client_diamond_presets (
    client_id, stone_type, shape_id, carat_range, carat_value, color, clarity,
    base_price, custom_price, is_enabled, cut_grade, polish, symmetry, fluorescence,
    certification, origin, sku, product_title, currency, markup_percentage,
    compare_at_price, pool_stock_count
  )
  SELECT
    p_client_id,
    fr.stone_type,
    fr.shape_id,
    public._diamond_preset_carat_range(fr.carat),
    fr.carat,
    fr.color,
    fr.clarity,
    round(fr.base_price),
    round(fr.final_price),
    true,
    CASE WHEN fr.shape_id = 'round' AND cardinality(v_cut_labels) > 0 THEN array_to_string(v_cut_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_polish_labels) > 0 THEN array_to_string(v_polish_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_symmetry_labels) > 0 THEN array_to_string(v_symmetry_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_fluor_labels) > 0 THEN array_to_string(v_fluor_labels, ', ') ELSE NULL END,
    COALESCE(v_certifications[1], 'GIA'),
    fr.stone_type,
    upper(regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(replace(
        v_sku_template,
        '{carat}', to_char(fr.carat, 'FM999990.00')),
        '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
        '{color}', fr.color),
        '{clarity}', fr.clarity),
        '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
        '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
        '{lab}', COALESCE(v_certifications[1], 'GIA')),
        '{report_number}', ''),
      '\s+', '-', 'g'
    )),
    replace(replace(replace(replace(replace(replace(replace(replace(
      v_title_template,
      '{carat}', to_char(fr.carat, 'FM999990.00')),
      '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
      '{color}', fr.color),
      '{clarity}', fr.clarity),
      '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
      '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
      '{lab}', COALESCE(v_certifications[1], 'GIA')),
      '{report_number}', ''),
    v_currency,
    CASE
      WHEN v_pricing_method = 'percentage' AND fr.markup_value > 0 THEN fr.markup_value
      WHEN v_pricing_method = 'fixed_margin' AND fr.base_price > 0 THEN ((fr.final_price - fr.base_price) / fr.base_price) * 100
      ELSE NULL
    END,
    NULL,
    1
  FROM final_rows fr;

  GET DIAGNOSTICS v_pool_count = ROW_COUNT;

  WITH selected_groups AS (
    SELECT stone_type, shape_id, color, clarity
    FROM unnest(v_stone_types) stone_type
    CROSS JOIN unnest(v_shapes) shape_id
    CROSS JOIN unnest(v_colors) color
    CROSS JOIN unnest(v_clarities) clarity
  ), pool_groups AS (
    SELECT DISTINCT
      CASE WHEN lower(COALESCE(dip.lg, '')) = 'natural' THEN 'natural' ELSE 'lab' END AS stone_type,
      public._diamond_preset_shape_id(dip.shape) AS shape_id,
      upper(trim(dip.col)) AS color,
      upper(trim(dip.clar)) AS clarity
    FROM public.diamond_inventory_pool dip
    WHERE dip.carats >= v_carat_min
      AND dip.carats <= v_carat_max
      AND upper(trim(dip.col)) = ANY(v_colors)
      AND upper(trim(dip.clar)) = ANY(v_clarities)
      AND public._diamond_preset_shape_id(dip.shape) = ANY(v_shapes)
      AND (CASE WHEN lower(COALESCE(dip.lg, '')) = 'natural' THEN 'natural' ELSE 'lab' END) = ANY(v_stone_types)
      AND COALESCE(dip.price, 0) > 0
  ), fallback_source AS (
    SELECT sg.stone_type, sg.shape_id, sg.color, sg.clarity, c.carat
    FROM selected_groups sg
    CROSS JOIN unnest(v_standard_carats) c(carat)
    WHERE c.carat >= v_carat_min
      AND c.carat <= v_carat_max
      AND NOT EXISTS (
        SELECT 1 FROM pool_groups pg
        WHERE pg.stone_type = sg.stone_type
          AND pg.shape_id = sg.shape_id
          AND pg.color = sg.color
          AND pg.clarity = sg.clarity
      )
  ), priced AS (
    SELECT
      fs.*,
      public._diamond_preset_tier_value(fs.carat, CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'naturalMarkupTiers' ELSE v_pricing -> 'labMarkupTiers' END, 'markup') AS markup_value,
      public._diamond_preset_tier_value(fs.carat, CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'naturalMarkupTiers' ELSE v_pricing -> 'labMarkupTiers' END, 'purchasingPrice')
      * COALESCE((CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'clarityMultipliersNatural' ELSE v_pricing -> 'clarityMultipliersLab' END ->> fs.clarity)::numeric,
        CASE WHEN fs.stone_type = 'natural' THEN
          CASE fs.clarity WHEN 'FL' THEN 1.95 WHEN 'IF' THEN 1.75 WHEN 'VVS1' THEN 1.45 WHEN 'VVS2' THEN 1.32 WHEN 'VS1' THEN 1.15 WHEN 'VS2' THEN 1.00 WHEN 'SI1' THEN 0.82 WHEN 'SI2' THEN 0.65 WHEN 'I1' THEN 0.45 WHEN 'I2' THEN 0.30 WHEN 'I3' THEN 0.20 ELSE 1.00 END
        ELSE
          CASE fs.clarity WHEN 'FL' THEN 1.95 WHEN 'IF' THEN 1.75 WHEN 'VVS1' THEN 1.15 WHEN 'VVS2' THEN 1.08 WHEN 'VS1' THEN 1.04 WHEN 'VS2' THEN 1.00 WHEN 'SI1' THEN 0.88 WHEN 'SI2' THEN 0.78 WHEN 'I1' THEN 0.60 WHEN 'I2' THEN 0.45 WHEN 'I3' THEN 0.30 ELSE 1.00 END
        END)
      * COALESCE((CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'colorMultipliersNatural' ELSE v_pricing -> 'colorMultipliersLab' END ->> fs.color)::numeric,
        CASE WHEN fs.stone_type = 'natural' THEN
          CASE fs.color WHEN 'D' THEN 1.35 WHEN 'E' THEN 1.24 WHEN 'F' THEN 1.14 WHEN 'G' THEN 1.00 WHEN 'H' THEN 0.90 WHEN 'I' THEN 0.78 WHEN 'J' THEN 0.66 WHEN 'K' THEN 0.55 WHEN 'L' THEN 0.48 WHEN 'M' THEN 0.42 ELSE 1.00 END
        ELSE
          CASE fs.color WHEN 'D' THEN 1.15 WHEN 'E' THEN 1.10 WHEN 'F' THEN 1.05 WHEN 'G' THEN 1.00 WHEN 'H' THEN 0.94 WHEN 'I' THEN 0.85 WHEN 'J' THEN 0.75 WHEN 'K' THEN 0.65 WHEN 'L' THEN 0.58 WHEN 'M' THEN 0.52 ELSE 1.00 END
        END)
      * COALESCE((v_pricing -> 'shapeDiscounts' ->> fs.shape_id)::numeric,
          CASE fs.shape_id WHEN 'round' THEN 1.00 WHEN 'oval' THEN 0.83 WHEN 'pear' THEN 0.78 WHEN 'cushion' THEN 0.75 WHEN 'princess' THEN 0.70 WHEN 'radiant' THEN 0.70 WHEN 'marquise' THEN 0.70 WHEN 'emerald' THEN 0.68 WHEN 'asscher' THEN 0.62 WHEN 'heart' THEN 0.75 ELSE 1.00 END
        ) AS base_price
    FROM fallback_source fs
  ), final_rows AS (
    SELECT
      p.*,
      CASE
        WHEN v_pricing_method = 'percentage' THEN p.base_price * (1 + p.markup_value / 100)
        WHEN v_pricing_method = 'fixed_margin' THEN p.base_price + (p.markup_value * p.carat)
        ELSE p.base_price
      END AS final_price
    FROM priced p
  )
  INSERT INTO public.client_diamond_presets (
    client_id, stone_type, shape_id, carat_range, carat_value, color, clarity,
    base_price, custom_price, is_enabled, cut_grade, polish, symmetry, fluorescence,
    certification, origin, sku, product_title, currency, markup_percentage,
    compare_at_price, pool_stock_count
  )
  SELECT
    p_client_id,
    fr.stone_type,
    fr.shape_id,
    public._diamond_preset_carat_range(fr.carat),
    fr.carat,
    fr.color,
    fr.clarity,
    round(fr.base_price),
    round(fr.final_price),
    true,
    CASE WHEN fr.shape_id = 'round' AND cardinality(v_cut_labels) > 0 THEN array_to_string(v_cut_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_polish_labels) > 0 THEN array_to_string(v_polish_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_symmetry_labels) > 0 THEN array_to_string(v_symmetry_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_fluor_labels) > 0 THEN array_to_string(v_fluor_labels, ', ') ELSE NULL END,
    COALESCE(v_certifications[1], 'GIA'),
    fr.stone_type,
    upper(regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(replace(
        v_sku_template,
        '{carat}', to_char(fr.carat, 'FM999990.00')),
        '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
        '{color}', fr.color),
        '{clarity}', fr.clarity),
        '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
        '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
        '{lab}', COALESCE(v_certifications[1], 'GIA')),
        '{report_number}', ''),
      '\s+', '-', 'g'
    )),
    replace(replace(replace(replace(replace(replace(replace(replace(
      v_title_template,
      '{carat}', to_char(fr.carat, 'FM999990.00')),
      '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
      '{color}', fr.color),
      '{clarity}', fr.clarity),
      '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
      '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
      '{lab}', COALESCE(v_certifications[1], 'GIA')),
      '{report_number}', ''),
    v_currency,
    CASE
      WHEN v_pricing_method = 'percentage' AND fr.markup_value > 0 THEN fr.markup_value
      WHEN v_pricing_method = 'fixed_margin' AND fr.base_price > 0 THEN ((fr.final_price - fr.base_price) / fr.base_price) * 100
      ELSE NULL
    END,
    NULL,
    0
  FROM final_rows fr;

  GET DIAGNOSTICS v_fallback_count = ROW_COUNT;
  v_total_count := v_pool_count + v_fallback_count;

  INSERT INTO public.client_activity_logs (
    client_id,
    user_id,
    action_type,
    action_category,
    description,
    metadata
  ) VALUES (
    p_client_id,
    v_actor,
    'diamond_presets_generated',
    'catalog',
    'Generated ' || v_total_count || ' diamond presets from database generation',
    jsonb_build_object(
      'stone_types', v_stone_types,
      'shapes_count', cardinality(v_shapes),
      'presets_count', v_total_count,
      'pool_count', v_pool_count,
      'fallback_count', v_fallback_count,
      'pricing_method', v_pricing_method,
      'currency', v_currency
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'presetsCount', v_total_count,
    'poolCount', v_pool_count,
    'fallbackCount', v_fallback_count,
    'source', 'database'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_client_diamond_presets_db(uuid, jsonb) TO authenticated;
```

---

## `supabase/migrations/20260522053849_b232858f-13c5-47c6-adb6-06d9c38bb231.sql`

```sql
CREATE OR REPLACE FUNCTION public.generate_client_diamond_presets_db(
  p_client_id uuid,
  p_wizard_config jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '600s'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_diamond_type jsonb := COALESCE(p_wizard_config -> 'diamondType', '{}'::jsonb);
  v_shapes_config jsonb := COALESCE(p_wizard_config -> 'shapes', '{}'::jsonb);
  v_grading jsonb := COALESCE(p_wizard_config -> 'grading', '{}'::jsonb);
  v_pricing jsonb := COALESCE(p_wizard_config -> 'pricing', '{}'::jsonb);
  v_product jsonb := COALESCE(p_wizard_config -> 'productSettings', '{}'::jsonb);
  v_shapes text[];
  v_colors text[];
  v_clarities text[];
  v_cut_labels text[];
  v_polish_labels text[];
  v_symmetry_labels text[];
  v_fluor_labels text[];
  v_lab_targets text[];
  v_certifications text[];
  v_stone_types text[] := ARRAY[]::text[];
  v_cut_codes text[];
  v_polish_codes text[];
  v_symmetry_codes text[];
  v_fluor_codes text[];
  v_carat_min numeric := COALESCE(NULLIF(v_grading #>> '{caratRange,0}', '')::numeric, 0.50);
  v_carat_max numeric := COALESCE(NULLIF(v_grading #>> '{caratRange,1}', '')::numeric, 5.00);
  v_currency text := COALESCE(NULLIF(v_pricing ->> 'currency', ''), 'USD');
  v_pricing_method text := COALESCE(NULLIF(v_pricing ->> 'pricingMethod', ''), 'percentage');
  v_title_template text := COALESCE(NULLIF(v_product ->> 'titleTemplate', ''), '{carat}ct {shape} Diamond - {clarity}');
  v_sku_template text := COALESCE(NULLIF(v_product ->> 'skuTemplate', ''), 'DIA-{shape}-{clarity}-{carat}');
  v_standard_carats numeric[] := ARRAY[0.50, 1.00, 1.50, 2.00, 2.50, 3.00, 3.50, 4.00, 4.50, 5.00];
  v_pool_count integer := 0;
  v_fallback_count integer := 0;
  v_total_count integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT (
    public.has_role(v_actor, 'agency_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.user_id = v_actor)
    OR EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.user_id = v_actor
        AND sm.client_id = p_client_id
        AND sm.status = 'active'
        AND (sm.permissions ->> 'catalog_access' = 'edit' OR sm.permissions ->> 'catalog_access' = 'true')
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_shapes := COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_shapes_config -> 'selectedShapes')), ARRAY[]::text[]);
  v_colors := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'colors')))), ARRAY[]::text[]);
  v_clarities := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'clarities')))), ARRAY[]::text[]);
  v_cut_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'cutGrades'));
  v_polish_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'polish'));
  v_symmetry_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'symmetry'));
  v_fluor_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'fluorescence'));
  v_lab_targets := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'labs')))), ARRAY[]::text[]);
  v_certifications := ARRAY(SELECT jsonb_array_elements_text(v_diamond_type -> 'certifications'));

  IF cardinality(v_cut_labels) = 0 THEN v_cut_labels := ARRAY['Excellent']::text[]; END IF;
  IF cardinality(v_polish_labels) = 0 THEN v_polish_labels := ARRAY['Excellent']::text[]; END IF;
  IF cardinality(v_symmetry_labels) = 0 THEN v_symmetry_labels := ARRAY['Excellent']::text[]; END IF;
  IF cardinality(v_fluor_labels) = 0 THEN v_fluor_labels := ARRAY['None']::text[]; END IF;
  IF cardinality(v_certifications) = 0 THEN v_certifications := ARRAY['GIA']::text[]; END IF;

  v_cut_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'Excellent' THEN 'EX' WHEN 'Very Good' THEN 'VG' WHEN 'Good' THEN 'G' WHEN 'Fair' THEN 'F' WHEN 'Poor' THEN 'P' ELSE upper(label) END FROM unnest(v_cut_labels) AS label);
  v_polish_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'Excellent' THEN 'EX' WHEN 'Very Good' THEN 'VG' WHEN 'Good' THEN 'G' WHEN 'Fair' THEN 'F' WHEN 'Poor' THEN 'P' ELSE upper(label) END FROM unnest(v_polish_labels) AS label);
  v_symmetry_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'Excellent' THEN 'EX' WHEN 'Very Good' THEN 'VG' WHEN 'Good' THEN 'G' WHEN 'Fair' THEN 'F' WHEN 'Poor' THEN 'P' ELSE upper(label) END FROM unnest(v_symmetry_labels) AS label);
  v_fluor_codes := ARRAY(SELECT DISTINCT code FROM unnest(v_fluor_labels) AS label CROSS JOIN LATERAL unnest(CASE label WHEN 'None' THEN ARRAY['NON','NONE'] WHEN 'Faint' THEN ARRAY['FNT'] WHEN 'Very Slight' THEN ARRAY['VSL'] WHEN 'Slight' THEN ARRAY['SL'] WHEN 'Medium' THEN ARRAY['MED'] WHEN 'Strong' THEN ARRAY['STG','STR'] WHEN 'Very Strong' THEN ARRAY['VST'] ELSE ARRAY[upper(label)] END) AS code);

  IF COALESCE((v_diamond_type ->> 'naturalEnabled')::boolean, false) THEN
    v_stone_types := array_append(v_stone_types, 'natural');
  END IF;
  IF COALESCE((v_diamond_type ->> 'labGrownEnabled')::boolean, false) THEN
    v_stone_types := array_append(v_stone_types, 'lab');
  END IF;

  DELETE FROM public.client_diamond_presets WHERE client_id = p_client_id;

  IF cardinality(v_stone_types) = 0 OR cardinality(v_shapes) = 0 OR cardinality(v_colors) = 0 OR cardinality(v_clarities) = 0 THEN
    RETURN jsonb_build_object('success', true, 'presetsCount', 0, 'source', 'database');
  END IF;

  WITH filtered_pool AS (
    SELECT
      CASE WHEN lower(COALESCE(dip.lg, '')) = 'natural' THEN 'natural' ELSE 'lab' END AS stone_type,
      public._diamond_preset_shape_id(dip.shape) AS shape_id,
      round(dip.carats::numeric, 2) AS carat,
      upper(trim(dip.col)) AS color,
      upper(trim(dip.clar)) AS clarity,
      COALESCE(dip.price, 0)::numeric AS base_price
    FROM public.diamond_inventory_pool dip
    WHERE dip.carats >= v_carat_min
      AND dip.carats <= v_carat_max
      AND upper(trim(dip.col)) = ANY(v_colors)
      AND upper(trim(dip.clar)) = ANY(v_clarities)
      AND public._diamond_preset_shape_id(dip.shape) = ANY(v_shapes)
      AND (CASE WHEN lower(COALESCE(dip.lg, '')) = 'natural' THEN 'natural' ELSE 'lab' END) = ANY(v_stone_types)
      AND (
        public._diamond_preset_shape_id(dip.shape) <> 'round'
        OR cardinality(v_cut_codes) = 0
        OR dip.cut = ANY(v_cut_codes)
        OR dip.cut = '-'
      )
      AND (cardinality(v_polish_codes) = 0 OR dip.pol = ANY(v_polish_codes))
      AND (cardinality(v_symmetry_codes) = 0 OR dip.symm = ANY(v_symmetry_codes))
      AND (cardinality(v_fluor_codes) = 0 OR dip.flo = ANY(v_fluor_codes))
      AND (cardinality(v_lab_targets) = 0 OR upper(trim(dip.lab)) = ANY(v_lab_targets))
      AND (
        v_grading ->> 'measurementsMinLength' IS NULL
        OR dip.length >= NULLIF(v_grading ->> 'measurementsMinLength', '')::numeric
      )
      AND (
        v_grading ->> 'measurementsMaxLength' IS NULL
        OR dip.length <= NULLIF(v_grading ->> 'measurementsMaxLength', '')::numeric
      )
      AND COALESCE(dip.price, 0) > 0
  ), priced AS (
    SELECT
      fp.*,
      public._diamond_preset_tier_value(fp.carat, CASE WHEN fp.stone_type = 'natural' THEN v_pricing -> 'naturalMarkupTiers' ELSE v_pricing -> 'labMarkupTiers' END, 'markup') AS markup_value
    FROM filtered_pool fp
  ), final_rows AS (
    SELECT
      p.*,
      CASE
        WHEN v_pricing_method = 'percentage' THEN p.base_price * (1 + p.markup_value / 100)
        WHEN v_pricing_method = 'fixed_margin' THEN p.base_price + (p.markup_value * p.carat)
        ELSE p.base_price
      END AS final_price
    FROM priced p
  )
  INSERT INTO public.client_diamond_presets (
    client_id, stone_type, shape_id, carat_range, carat_value, color, clarity,
    base_price, custom_price, is_enabled, cut_grade, polish, symmetry, fluorescence,
    certification, origin, sku, product_title, currency, markup_percentage,
    compare_at_price, pool_stock_count
  )
  SELECT
    p_client_id,
    fr.stone_type,
    fr.shape_id,
    public._diamond_preset_carat_range(fr.carat),
    fr.carat,
    fr.color,
    fr.clarity,
    round(fr.base_price),
    round(fr.final_price),
    true,
    CASE WHEN fr.shape_id = 'round' AND cardinality(v_cut_labels) > 0 THEN array_to_string(v_cut_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_polish_labels) > 0 THEN array_to_string(v_polish_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_symmetry_labels) > 0 THEN array_to_string(v_symmetry_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_fluor_labels) > 0 THEN array_to_string(v_fluor_labels, ', ') ELSE NULL END,
    COALESCE(v_certifications[1], 'GIA'),
    fr.stone_type,
    upper(regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(replace(
        v_sku_template,
        '{carat}', to_char(fr.carat, 'FM999990.00')),
        '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
        '{color}', fr.color),
        '{clarity}', fr.clarity),
        '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
        '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
        '{lab}', COALESCE(v_certifications[1], 'GIA')),
        '{report_number}', ''),
      '\s+', '-', 'g'
    )),
    replace(replace(replace(replace(replace(replace(replace(replace(
      v_title_template,
      '{carat}', to_char(fr.carat, 'FM999990.00')),
      '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
      '{color}', fr.color),
      '{clarity}', fr.clarity),
      '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
      '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
      '{lab}', COALESCE(v_certifications[1], 'GIA')),
      '{report_number}', ''),
    v_currency,
    CASE
      WHEN v_pricing_method = 'percentage' AND fr.markup_value > 0 THEN fr.markup_value
      WHEN v_pricing_method = 'fixed_margin' AND fr.base_price > 0 THEN ((fr.final_price - fr.base_price) / fr.base_price) * 100
      ELSE NULL
    END,
    NULL,
    1
  FROM final_rows fr;

  GET DIAGNOSTICS v_pool_count = ROW_COUNT;

  WITH selected_groups AS (
    SELECT stone_type, shape_id, color, clarity
    FROM unnest(v_stone_types) stone_type
    CROSS JOIN unnest(v_shapes) shape_id
    CROSS JOIN unnest(v_colors) color
    CROSS JOIN unnest(v_clarities) clarity
  ), pool_groups AS (
    SELECT DISTINCT stone_type, shape_id, color, clarity
    FROM public.client_diamond_presets
    WHERE client_id = p_client_id
      AND pool_stock_count = 1
  ), fallback_source AS (
    SELECT sg.stone_type, sg.shape_id, sg.color, sg.clarity, c.carat
    FROM selected_groups sg
    CROSS JOIN unnest(v_standard_carats) c(carat)
    WHERE c.carat >= v_carat_min
      AND c.carat <= v_carat_max
      AND NOT EXISTS (
        SELECT 1 FROM pool_groups pg
        WHERE pg.stone_type = sg.stone_type
          AND pg.shape_id = sg.shape_id
          AND pg.color = sg.color
          AND pg.clarity = sg.clarity
      )
  ), priced AS (
    SELECT
      fs.*,
      public._diamond_preset_tier_value(fs.carat, CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'naturalMarkupTiers' ELSE v_pricing -> 'labMarkupTiers' END, 'markup') AS markup_value,
      public._diamond_preset_tier_value(fs.carat, CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'naturalMarkupTiers' ELSE v_pricing -> 'labMarkupTiers' END, 'purchasingPrice')
      * COALESCE((CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'clarityMultipliersNatural' ELSE v_pricing -> 'clarityMultipliersLab' END ->> fs.clarity)::numeric,
        CASE WHEN fs.stone_type = 'natural' THEN
          CASE fs.clarity WHEN 'FL' THEN 1.95 WHEN 'IF' THEN 1.75 WHEN 'VVS1' THEN 1.45 WHEN 'VVS2' THEN 1.32 WHEN 'VS1' THEN 1.15 WHEN 'VS2' THEN 1.00 WHEN 'SI1' THEN 0.82 WHEN 'SI2' THEN 0.65 WHEN 'I1' THEN 0.45 WHEN 'I2' THEN 0.30 WHEN 'I3' THEN 0.20 ELSE 1.00 END
        ELSE
          CASE fs.clarity WHEN 'FL' THEN 1.95 WHEN 'IF' THEN 1.75 WHEN 'VVS1' THEN 1.15 WHEN 'VVS2' THEN 1.08 WHEN 'VS1' THEN 1.04 WHEN 'VS2' THEN 1.00 WHEN 'SI1' THEN 0.88 WHEN 'SI2' THEN 0.78 WHEN 'I1' THEN 0.60 WHEN 'I2' THEN 0.45 WHEN 'I3' THEN 0.30 ELSE 1.00 END
        END)
      * COALESCE((CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'colorMultipliersNatural' ELSE v_pricing -> 'colorMultipliersLab' END ->> fs.color)::numeric,
        CASE WHEN fs.stone_type = 'natural' THEN
          CASE fs.color WHEN 'D' THEN 1.35 WHEN 'E' THEN 1.24 WHEN 'F' THEN 1.14 WHEN 'G' THEN 1.00 WHEN 'H' THEN 0.90 WHEN 'I' THEN 0.78 WHEN 'J' THEN 0.66 WHEN 'K' THEN 0.55 WHEN 'L' THEN 0.48 WHEN 'M' THEN 0.42 ELSE 1.00 END
        ELSE
          CASE fs.color WHEN 'D' THEN 1.15 WHEN 'E' THEN 1.10 WHEN 'F' THEN 1.05 WHEN 'G' THEN 1.00 WHEN 'H' THEN 0.94 WHEN 'I' THEN 0.85 WHEN 'J' THEN 0.75 WHEN 'K' THEN 0.65 WHEN 'L' THEN 0.58 WHEN 'M' THEN 0.52 ELSE 1.00 END
        END)
      * COALESCE((v_pricing -> 'shapeDiscounts' ->> fs.shape_id)::numeric,
          CASE fs.shape_id WHEN 'round' THEN 1.00 WHEN 'oval' THEN 0.83 WHEN 'pear' THEN 0.78 WHEN 'cushion' THEN 0.75 WHEN 'princess' THEN 0.70 WHEN 'radiant' THEN 0.70 WHEN 'marquise' THEN 0.70 WHEN 'emerald' THEN 0.68 WHEN 'asscher' THEN 0.62 WHEN 'heart' THEN 0.75 ELSE 1.00 END
        ) AS base_price
    FROM fallback_source fs
  ), final_rows AS (
    SELECT
      p.*,
      CASE
        WHEN v_pricing_method = 'percentage' THEN p.base_price * (1 + p.markup_value / 100)
        WHEN v_pricing_method = 'fixed_margin' THEN p.base_price + (p.markup_value * p.carat)
        ELSE p.base_price
      END AS final_price
    FROM priced p
  )
  INSERT INTO public.client_diamond_presets (
    client_id, stone_type, shape_id, carat_range, carat_value, color, clarity,
    base_price, custom_price, is_enabled, cut_grade, polish, symmetry, fluorescence,
    certification, origin, sku, product_title, currency, markup_percentage,
    compare_at_price, pool_stock_count
  )
  SELECT
    p_client_id,
    fr.stone_type,
    fr.shape_id,
    public._diamond_preset_carat_range(fr.carat),
    fr.carat,
    fr.color,
    fr.clarity,
    round(fr.base_price),
    round(fr.final_price),
    true,
    CASE WHEN fr.shape_id = 'round' AND cardinality(v_cut_labels) > 0 THEN array_to_string(v_cut_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_polish_labels) > 0 THEN array_to_string(v_polish_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_symmetry_labels) > 0 THEN array_to_string(v_symmetry_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_fluor_labels) > 0 THEN array_to_string(v_fluor_labels, ', ') ELSE NULL END,
    COALESCE(v_certifications[1], 'GIA'),
    fr.stone_type,
    upper(regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(replace(
        v_sku_template,
        '{carat}', to_char(fr.carat, 'FM999990.00')),
        '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
        '{color}', fr.color),
        '{clarity}', fr.clarity),
        '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
        '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
        '{lab}', COALESCE(v_certifications[1], 'GIA')),
        '{report_number}', ''),
      '\s+', '-', 'g'
    )),
    replace(replace(replace(replace(replace(replace(replace(replace(
      v_title_template,
      '{carat}', to_char(fr.carat, 'FM999990.00')),
      '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
      '{color}', fr.color),
      '{clarity}', fr.clarity),
      '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
      '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
      '{lab}', COALESCE(v_certifications[1], 'GIA')),
      '{report_number}', ''),
    v_currency,
    CASE
      WHEN v_pricing_method = 'percentage' AND fr.markup_value > 0 THEN fr.markup_value
      WHEN v_pricing_method = 'fixed_margin' AND fr.base_price > 0 THEN ((fr.final_price - fr.base_price) / fr.base_price) * 100
      ELSE NULL
    END,
    NULL,
    0
  FROM final_rows fr;

  GET DIAGNOSTICS v_fallback_count = ROW_COUNT;
  v_total_count := v_pool_count + v_fallback_count;

  INSERT INTO public.client_activity_logs (
    client_id,
    user_id,
    action_type,
    action_category,
    description,
    metadata
  ) VALUES (
    p_client_id,
    v_actor,
    'diamond_presets_generated',
    'catalog',
    'Generated ' || v_total_count || ' diamond presets from database generation',
    jsonb_build_object(
      'stone_types', v_stone_types,
      'shapes_count', cardinality(v_shapes),
      'presets_count', v_total_count,
      'pool_count', v_pool_count,
      'fallback_count', v_fallback_count,
      'pricing_method', v_pricing_method,
      'currency', v_currency
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'presetsCount', v_total_count,
    'poolCount', v_pool_count,
    'fallbackCount', v_fallback_count,
    'source', 'database'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_client_diamond_presets_db(uuid, jsonb) TO authenticated;
```

---

## `supabase/migrations/20260522055550_f0f761d0-2d62-459b-a472-8d5fa4cd2f42.sql`

```sql
CREATE INDEX IF NOT EXISTS idx_diamond_inventory_pool_chunk_filters
  ON public.diamond_inventory_pool (
    (public._diamond_preset_shape_id(shape)),
    ((CASE WHEN lower(COALESCE(lg, '')) = 'natural' THEN 'natural' ELSE 'lab' END)),
    carats,
    (upper(trim(col))),
    (upper(trim(clar)))
  )
  WHERE COALESCE(price, 0) > 0;

CREATE OR REPLACE FUNCTION public.generate_client_diamond_presets_chunk_db(
  p_client_id uuid,
  p_wizard_config jsonb,
  p_shape_ids text[] DEFAULT NULL,
  p_stone_types_filter text[] DEFAULT NULL,
  p_clear_existing boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '55s'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_diamond_type jsonb := COALESCE(p_wizard_config -> 'diamondType', '{}'::jsonb);
  v_shapes_config jsonb := COALESCE(p_wizard_config -> 'shapes', '{}'::jsonb);
  v_grading jsonb := COALESCE(p_wizard_config -> 'grading', '{}'::jsonb);
  v_pricing jsonb := COALESCE(p_wizard_config -> 'pricing', '{}'::jsonb);
  v_product jsonb := COALESCE(p_wizard_config -> 'productSettings', '{}'::jsonb);
  v_shapes text[];
  v_colors text[];
  v_clarities text[];
  v_cut_labels text[];
  v_polish_labels text[];
  v_symmetry_labels text[];
  v_fluor_labels text[];
  v_lab_targets text[];
  v_certifications text[];
  v_stone_types text[] := ARRAY[]::text[];
  v_cut_codes text[];
  v_polish_codes text[];
  v_symmetry_codes text[];
  v_fluor_codes text[];
  v_carat_min numeric := COALESCE(NULLIF(v_grading #>> '{caratRange,0}', '')::numeric, 0.50);
  v_carat_max numeric := COALESCE(NULLIF(v_grading #>> '{caratRange,1}', '')::numeric, 5.00);
  v_currency text := COALESCE(NULLIF(v_pricing ->> 'currency', ''), 'USD');
  v_pricing_method text := COALESCE(NULLIF(v_pricing ->> 'pricingMethod', ''), 'percentage');
  v_title_template text := COALESCE(NULLIF(v_product ->> 'titleTemplate', ''), '{carat}ct {shape} Diamond - {clarity}');
  v_sku_template text := COALESCE(NULLIF(v_product ->> 'skuTemplate', ''), 'DIA-{shape}-{clarity}-{carat}');
  v_standard_carats numeric[] := ARRAY[0.50, 1.00, 1.50, 2.00, 2.50, 3.00, 3.50, 4.00, 4.50, 5.00];
  v_pool_count integer := 0;
  v_fallback_count integer := 0;
  v_total_count integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT (
    public.has_role(v_actor, 'agency_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.user_id = v_actor)
    OR EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.user_id = v_actor
        AND sm.client_id = p_client_id
        AND sm.status = 'active'
        AND (sm.permissions ->> 'catalog_access' = 'edit' OR sm.permissions ->> 'catalog_access' = 'true')
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_shapes := COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_shapes_config -> 'selectedShapes')), ARRAY[]::text[]);
  IF p_shape_ids IS NOT NULL AND cardinality(p_shape_ids) > 0 THEN
    v_shapes := ARRAY(SELECT s FROM unnest(v_shapes) s WHERE s = ANY(p_shape_ids));
  END IF;

  v_colors := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'colors')))), ARRAY[]::text[]);
  v_clarities := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'clarities')))), ARRAY[]::text[]);
  v_cut_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'cutGrades'));
  v_polish_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'polish'));
  v_symmetry_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'symmetry'));
  v_fluor_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'fluorescence'));
  v_lab_targets := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'labs')))), ARRAY[]::text[]);
  v_certifications := ARRAY(SELECT jsonb_array_elements_text(v_diamond_type -> 'certifications'));

  IF cardinality(v_cut_labels) = 0 THEN v_cut_labels := ARRAY['Excellent']::text[]; END IF;
  IF cardinality(v_polish_labels) = 0 THEN v_polish_labels := ARRAY['Excellent']::text[]; END IF;
  IF cardinality(v_symmetry_labels) = 0 THEN v_symmetry_labels := ARRAY['Excellent']::text[]; END IF;
  IF cardinality(v_fluor_labels) = 0 THEN v_fluor_labels := ARRAY['None']::text[]; END IF;
  IF cardinality(v_certifications) = 0 THEN v_certifications := ARRAY['GIA']::text[]; END IF;

  v_cut_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'Excellent' THEN 'EX' WHEN 'Very Good' THEN 'VG' WHEN 'Good' THEN 'G' WHEN 'Fair' THEN 'F' WHEN 'Poor' THEN 'P' ELSE upper(label) END FROM unnest(v_cut_labels) AS label);
  v_polish_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'Excellent' THEN 'EX' WHEN 'Very Good' THEN 'VG' WHEN 'Good' THEN 'G' WHEN 'Fair' THEN 'F' WHEN 'Poor' THEN 'P' ELSE upper(label) END FROM unnest(v_polish_labels) AS label);
  v_symmetry_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'Excellent' THEN 'EX' WHEN 'Very Good' THEN 'VG' WHEN 'Good' THEN 'G' WHEN 'Fair' THEN 'F' WHEN 'Poor' THEN 'P' ELSE upper(label) END FROM unnest(v_symmetry_labels) AS label);
  v_fluor_codes := ARRAY(SELECT DISTINCT code FROM unnest(v_fluor_labels) AS label CROSS JOIN LATERAL unnest(CASE label WHEN 'None' THEN ARRAY['NON','NONE'] WHEN 'Faint' THEN ARRAY['FNT'] WHEN 'Very Slight' THEN ARRAY['VSL'] WHEN 'Slight' THEN ARRAY['SL'] WHEN 'Medium' THEN ARRAY['MED'] WHEN 'Strong' THEN ARRAY['STG','STR'] WHEN 'Very Strong' THEN ARRAY['VST'] ELSE ARRAY[upper(label)] END) AS code);

  IF COALESCE((v_diamond_type ->> 'naturalEnabled')::boolean, false) THEN
    v_stone_types := array_append(v_stone_types, 'natural');
  END IF;
  IF COALESCE((v_diamond_type ->> 'labGrownEnabled')::boolean, false) THEN
    v_stone_types := array_append(v_stone_types, 'lab');
  END IF;
  IF p_stone_types_filter IS NOT NULL AND cardinality(p_stone_types_filter) > 0 THEN
    v_stone_types := ARRAY(SELECT st FROM unnest(v_stone_types) st WHERE st = ANY(p_stone_types_filter));
  END IF;

  IF p_clear_existing THEN
    DELETE FROM public.client_diamond_presets WHERE client_id = p_client_id;
  END IF;

  IF cardinality(v_stone_types) = 0 OR cardinality(v_shapes) = 0 OR cardinality(v_colors) = 0 OR cardinality(v_clarities) = 0 THEN
    RETURN jsonb_build_object('success', true, 'presetsCount', 0, 'poolCount', 0, 'fallbackCount', 0, 'source', 'database_chunk');
  END IF;

  WITH filtered_pool AS (
    SELECT
      CASE WHEN lower(COALESCE(dip.lg, '')) = 'natural' THEN 'natural' ELSE 'lab' END AS stone_type,
      public._diamond_preset_shape_id(dip.shape) AS shape_id,
      round(dip.carats::numeric, 2) AS carat,
      upper(trim(dip.col)) AS color,
      upper(trim(dip.clar)) AS clarity,
      COALESCE(dip.price, 0)::numeric AS base_price
    FROM public.diamond_inventory_pool dip
    WHERE dip.carats >= v_carat_min
      AND dip.carats <= v_carat_max
      AND upper(trim(dip.col)) = ANY(v_colors)
      AND upper(trim(dip.clar)) = ANY(v_clarities)
      AND public._diamond_preset_shape_id(dip.shape) = ANY(v_shapes)
      AND (CASE WHEN lower(COALESCE(dip.lg, '')) = 'natural' THEN 'natural' ELSE 'lab' END) = ANY(v_stone_types)
      AND (
        public._diamond_preset_shape_id(dip.shape) <> 'round'
        OR cardinality(v_cut_codes) = 0
        OR dip.cut = ANY(v_cut_codes)
        OR dip.cut = '-'
      )
      AND (cardinality(v_polish_codes) = 0 OR dip.pol = ANY(v_polish_codes))
      AND (cardinality(v_symmetry_codes) = 0 OR dip.symm = ANY(v_symmetry_codes))
      AND (cardinality(v_fluor_codes) = 0 OR dip.flo = ANY(v_fluor_codes))
      AND (cardinality(v_lab_targets) = 0 OR upper(trim(dip.lab)) = ANY(v_lab_targets))
      AND (
        v_grading ->> 'measurementsMinLength' IS NULL
        OR dip.length >= NULLIF(v_grading ->> 'measurementsMinLength', '')::numeric
      )
      AND (
        v_grading ->> 'measurementsMaxLength' IS NULL
        OR dip.length <= NULLIF(v_grading ->> 'measurementsMaxLength', '')::numeric
      )
      AND COALESCE(dip.price, 0) > 0
  ), priced AS (
    SELECT
      fp.*,
      public._diamond_preset_tier_value(fp.carat, CASE WHEN fp.stone_type = 'natural' THEN v_pricing -> 'naturalMarkupTiers' ELSE v_pricing -> 'labMarkupTiers' END, 'markup') AS markup_value
    FROM filtered_pool fp
  ), final_rows AS (
    SELECT
      p.*,
      CASE
        WHEN v_pricing_method = 'percentage' THEN p.base_price * (1 + p.markup_value / 100)
        WHEN v_pricing_method = 'fixed_margin' THEN p.base_price + (p.markup_value * p.carat)
        ELSE p.base_price
      END AS final_price
    FROM priced p
  )
  INSERT INTO public.client_diamond_presets (
    client_id, stone_type, shape_id, carat_range, carat_value, color, clarity,
    base_price, custom_price, is_enabled, cut_grade, polish, symmetry, fluorescence,
    certification, origin, sku, product_title, currency, markup_percentage,
    compare_at_price, pool_stock_count
  )
  SELECT
    p_client_id,
    fr.stone_type,
    fr.shape_id,
    public._diamond_preset_carat_range(fr.carat),
    fr.carat,
    fr.color,
    fr.clarity,
    round(fr.base_price),
    round(fr.final_price),
    true,
    CASE WHEN fr.shape_id = 'round' AND cardinality(v_cut_labels) > 0 THEN array_to_string(v_cut_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_polish_labels) > 0 THEN array_to_string(v_polish_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_symmetry_labels) > 0 THEN array_to_string(v_symmetry_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_fluor_labels) > 0 THEN array_to_string(v_fluor_labels, ', ') ELSE NULL END,
    COALESCE(v_certifications[1], 'GIA'),
    fr.stone_type,
    upper(regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(replace(
        v_sku_template,
        '{carat}', to_char(fr.carat, 'FM999990.00')),
        '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
        '{color}', fr.color),
        '{clarity}', fr.clarity),
        '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
        '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
        '{lab}', COALESCE(v_certifications[1], 'GIA')),
        '{report_number}', ''),
      '\s+', '-', 'g'
    )),
    replace(replace(replace(replace(replace(replace(replace(replace(
      v_title_template,
      '{carat}', to_char(fr.carat, 'FM999990.00')),
      '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
      '{color}', fr.color),
      '{clarity}', fr.clarity),
      '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
      '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
      '{lab}', COALESCE(v_certifications[1], 'GIA')),
      '{report_number}', ''),
    v_currency,
    CASE
      WHEN v_pricing_method = 'percentage' AND fr.markup_value > 0 THEN fr.markup_value
      WHEN v_pricing_method = 'fixed_margin' AND fr.base_price > 0 THEN ((fr.final_price - fr.base_price) / fr.base_price) * 100
      ELSE NULL
    END,
    NULL,
    1
  FROM final_rows fr;

  GET DIAGNOSTICS v_pool_count = ROW_COUNT;

  WITH selected_groups AS (
    SELECT stone_type, shape_id, color, clarity
    FROM unnest(v_stone_types) stone_type
    CROSS JOIN unnest(v_shapes) shape_id
    CROSS JOIN unnest(v_colors) color
    CROSS JOIN unnest(v_clarities) clarity
  ), pool_groups AS (
    SELECT DISTINCT stone_type, shape_id, color, clarity
    FROM public.client_diamond_presets
    WHERE client_id = p_client_id
      AND pool_stock_count = 1
      AND shape_id = ANY(v_shapes)
      AND stone_type = ANY(v_stone_types)
  ), fallback_source AS (
    SELECT sg.stone_type, sg.shape_id, sg.color, sg.clarity, c.carat
    FROM selected_groups sg
    CROSS JOIN unnest(v_standard_carats) c(carat)
    WHERE c.carat >= v_carat_min
      AND c.carat <= v_carat_max
      AND NOT EXISTS (
        SELECT 1 FROM pool_groups pg
        WHERE pg.stone_type = sg.stone_type
          AND pg.shape_id = sg.shape_id
          AND pg.color = sg.color
          AND pg.clarity = sg.clarity
      )
  ), priced AS (
    SELECT
      fs.*,
      public._diamond_preset_tier_value(fs.carat, CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'naturalMarkupTiers' ELSE v_pricing -> 'labMarkupTiers' END, 'markup') AS markup_value,
      public._diamond_preset_tier_value(fs.carat, CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'naturalMarkupTiers' ELSE v_pricing -> 'labMarkupTiers' END, 'purchasingPrice')
      * COALESCE((CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'clarityMultipliersNatural' ELSE v_pricing -> 'clarityMultipliersLab' END ->> fs.clarity)::numeric,
        CASE WHEN fs.stone_type = 'natural' THEN
          CASE fs.clarity WHEN 'FL' THEN 1.95 WHEN 'IF' THEN 1.75 WHEN 'VVS1' THEN 1.45 WHEN 'VVS2' THEN 1.32 WHEN 'VS1' THEN 1.15 WHEN 'VS2' THEN 1.00 WHEN 'SI1' THEN 0.82 WHEN 'SI2' THEN 0.65 WHEN 'I1' THEN 0.45 WHEN 'I2' THEN 0.30 WHEN 'I3' THEN 0.20 ELSE 1.00 END
        ELSE
          CASE fs.clarity WHEN 'FL' THEN 1.95 WHEN 'IF' THEN 1.75 WHEN 'VVS1' THEN 1.15 WHEN 'VVS2' THEN 1.08 WHEN 'VS1' THEN 1.04 WHEN 'VS2' THEN 1.00 WHEN 'SI1' THEN 0.88 WHEN 'SI2' THEN 0.78 WHEN 'I1' THEN 0.60 WHEN 'I2' THEN 0.45 WHEN 'I3' THEN 0.30 ELSE 1.00 END
        END)
      * COALESCE((CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'colorMultipliersNatural' ELSE v_pricing -> 'colorMultipliersLab' END ->> fs.color)::numeric,
        CASE WHEN fs.stone_type = 'natural' THEN
          CASE fs.color WHEN 'D' THEN 1.35 WHEN 'E' THEN 1.24 WHEN 'F' THEN 1.14 WHEN 'G' THEN 1.00 WHEN 'H' THEN 0.90 WHEN 'I' THEN 0.78 WHEN 'J' THEN 0.66 WHEN 'K' THEN 0.55 WHEN 'L' THEN 0.48 WHEN 'M' THEN 0.42 ELSE 1.00 END
        ELSE
          CASE fs.color WHEN 'D' THEN 1.15 WHEN 'E' THEN 1.10 WHEN 'F' THEN 1.05 WHEN 'G' THEN 1.00 WHEN 'H' THEN 0.94 WHEN 'I' THEN 0.85 WHEN 'J' THEN 0.75 WHEN 'K' THEN 0.65 WHEN 'L' THEN 0.58 WHEN 'M' THEN 0.52 ELSE 1.00 END
        END)
      * COALESCE((v_pricing -> 'shapeDiscounts' ->> fs.shape_id)::numeric,
          CASE fs.shape_id WHEN 'round' THEN 1.00 WHEN 'oval' THEN 0.83 WHEN 'pear' THEN 0.78 WHEN 'cushion' THEN 0.75 WHEN 'princess' THEN 0.70 WHEN 'radiant' THEN 0.70 WHEN 'marquise' THEN 0.70 WHEN 'emerald' THEN 0.68 WHEN 'asscher' THEN 0.62 WHEN 'heart' THEN 0.75 ELSE 1.00 END
        ) AS base_price
    FROM fallback_source fs
  ), final_rows AS (
    SELECT
      p.*,
      CASE
        WHEN v_pricing_method = 'percentage' THEN p.base_price * (1 + p.markup_value / 100)
        WHEN v_pricing_method = 'fixed_margin' THEN p.base_price + (p.markup_value * p.carat)
        ELSE p.base_price
      END AS final_price
    FROM priced p
  )
  INSERT INTO public.client_diamond_presets (
    client_id, stone_type, shape_id, carat_range, carat_value, color, clarity,
    base_price, custom_price, is_enabled, cut_grade, polish, symmetry, fluorescence,
    certification, origin, sku, product_title, currency, markup_percentage,
    compare_at_price, pool_stock_count
  )
  SELECT
    p_client_id,
    fr.stone_type,
    fr.shape_id,
    public._diamond_preset_carat_range(fr.carat),
    fr.carat,
    fr.color,
    fr.clarity,
    round(fr.base_price),
    round(fr.final_price),
    true,
    CASE WHEN fr.shape_id = 'round' AND cardinality(v_cut_labels) > 0 THEN array_to_string(v_cut_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_polish_labels) > 0 THEN array_to_string(v_polish_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_symmetry_labels) > 0 THEN array_to_string(v_symmetry_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_fluor_labels) > 0 THEN array_to_string(v_fluor_labels, ', ') ELSE NULL END,
    COALESCE(v_certifications[1], 'GIA'),
    fr.stone_type,
    upper(regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(replace(
        v_sku_template,
        '{carat}', to_char(fr.carat, 'FM999990.00')),
        '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
        '{color}', fr.color),
        '{clarity}', fr.clarity),
        '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
        '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
        '{lab}', COALESCE(v_certifications[1], 'GIA')),
        '{report_number}', ''),
      '\s+', '-', 'g'
    )),
    replace(replace(replace(replace(replace(replace(replace(replace(
      v_title_template,
      '{carat}', to_char(fr.carat, 'FM999990.00')),
      '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
      '{color}', fr.color),
      '{clarity}', fr.clarity),
      '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
      '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
      '{lab}', COALESCE(v_certifications[1], 'GIA')),
      '{report_number}', ''),
    v_currency,
    CASE
      WHEN v_pricing_method = 'percentage' AND fr.markup_value > 0 THEN fr.markup_value
      WHEN v_pricing_method = 'fixed_margin' AND fr.base_price > 0 THEN ((fr.final_price - fr.base_price) / fr.base_price) * 100
      ELSE NULL
    END,
    NULL,
    0
  FROM final_rows fr;

  GET DIAGNOSTICS v_fallback_count = ROW_COUNT;
  v_total_count := v_pool_count + v_fallback_count;

  RETURN jsonb_build_object(
    'success', true,
    'presetsCount', v_total_count,
    'poolCount', v_pool_count,
    'fallbackCount', v_fallback_count,
    'source', 'database_chunk'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_client_diamond_presets_chunk_db(uuid, jsonb, text[], text[], boolean) TO authenticated;
```

---

## `supabase/migrations/20260522084012_78766370-4d68-4922-b24d-84080574ffa5.sql`

```sql
-- Diamond catalog: server-side pagination, filter options, and mass price update

CREATE INDEX IF NOT EXISTS idx_cdp_client_filters
  ON public.client_diamond_presets (
    client_id,
    stone_type,
    shape_id,
    color,
    clarity,
    carat_range,
    carat_value
  );

CREATE OR REPLACE FUNCTION public.get_diamond_presets_filtered(
  p_client_id    uuid,
  p_stone_type   text DEFAULT NULL,
  p_shape_id     text DEFAULT NULL,
  p_color        text DEFAULT NULL,
  p_clarity      text DEFAULT NULL,
  p_carat_range  text DEFAULT NULL,
  p_page_size    int  DEFAULT 50,
  p_offset       int  DEFAULT 0
)
RETURNS TABLE (
  id            uuid,
  stone_type    text,
  shape_id      text,
  carat_range   text,
  carat_value   numeric,
  color         text,
  clarity       text,
  base_price    numeric,
  custom_price  numeric,
  is_enabled    bool,
  total_count   bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    id,
    stone_type,
    shape_id,
    carat_range,
    carat_value,
    color,
    clarity,
    base_price,
    custom_price,
    is_enabled,
    COUNT(*) OVER () AS total_count
  FROM public.client_diamond_presets
  WHERE client_id = p_client_id
    AND (p_stone_type  IS NULL OR stone_type  = p_stone_type)
    AND (p_shape_id    IS NULL OR shape_id    = p_shape_id)
    AND (p_color       IS NULL OR color       = p_color)
    AND (p_clarity     IS NULL OR clarity     = p_clarity)
    AND (p_carat_range IS NULL OR carat_range = p_carat_range)
  ORDER BY stone_type, shape_id, carat_value, color, clarity
  LIMIT  p_page_size
  OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_diamond_presets_filtered(uuid, text, text, text, text, text, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_diamond_preset_filter_options(p_client_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'shapes',      ARRAY(SELECT DISTINCT shape_id   FROM public.client_diamond_presets WHERE client_id = p_client_id ORDER BY 1),
    'colors',      ARRAY(SELECT DISTINCT color       FROM public.client_diamond_presets WHERE client_id = p_client_id ORDER BY 1),
    'clarities',   ARRAY(SELECT DISTINCT clarity     FROM public.client_diamond_presets WHERE client_id = p_client_id ORDER BY 1),
    'caratRanges', ARRAY(SELECT DISTINCT carat_range FROM public.client_diamond_presets WHERE client_id = p_client_id ORDER BY 1),
    'stoneTypes',  ARRAY(SELECT DISTINCT stone_type  FROM public.client_diamond_presets WHERE client_id = p_client_id ORDER BY 1),
    'totalCount',  (SELECT COUNT(*) FROM public.client_diamond_presets WHERE client_id = p_client_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_diamond_preset_filter_options(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mass_update_diamond_prices(
  p_client_id    uuid,
  p_multiplier   numeric DEFAULT 1.0,
  p_addend       numeric DEFAULT 0,
  p_stone_type   text DEFAULT NULL,
  p_shape_id     text DEFAULT NULL,
  p_color        text DEFAULT NULL,
  p_clarity      text DEFAULT NULL,
  p_carat_range  text DEFAULT NULL
)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_count int;
BEGIN
  UPDATE public.client_diamond_presets
  SET custom_price = GREATEST(0, round(custom_price * p_multiplier + p_addend))
  WHERE client_id = p_client_id
    AND (p_stone_type  IS NULL OR stone_type  = p_stone_type)
    AND (p_shape_id    IS NULL OR shape_id    = p_shape_id)
    AND (p_color       IS NULL OR color       = p_color)
    AND (p_clarity     IS NULL OR clarity     = p_clarity)
    AND (p_carat_range IS NULL OR carat_range = p_carat_range);
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mass_update_diamond_prices(uuid, numeric, numeric, text, text, text, text, text) TO authenticated;
```

---

## `supabase/migrations/20260522102633_f1108189-96b4-4a00-9092-1b1538da517c.sql`

```sql
CREATE OR REPLACE FUNCTION public.count_diamond_presets_estimate(
  p_wizard_config jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_diamond_type jsonb := COALESCE(p_wizard_config -> 'diamondType', '{}'::jsonb);
  v_shapes_config jsonb := COALESCE(p_wizard_config -> 'shapes', '{}'::jsonb);
  v_grading jsonb := COALESCE(p_wizard_config -> 'grading', '{}'::jsonb);
  v_shapes text[];
  v_colors text[];
  v_clarities text[];
  v_lab_targets text[];
  v_stone_types text[] := ARRAY[]::text[];
  v_cut_labels text[];
  v_polish_labels text[];
  v_symmetry_labels text[];
  v_fluor_labels text[];
  v_cut_codes text[];
  v_polish_codes text[];
  v_symmetry_codes text[];
  v_fluor_codes text[];
  v_carat_min numeric := COALESCE(NULLIF(v_grading #>> '{caratRange,0}', '')::numeric, 0.50);
  v_carat_max numeric := COALESCE(NULLIF(v_grading #>> '{caratRange,1}', '')::numeric, 5.00);
  v_standard_carats numeric[] := ARRAY[0.50, 1.00, 1.50, 2.00, 2.50, 3.00, 3.50, 4.00, 4.50, 5.00];
  v_pool_count integer := 0;
  v_pool_groups integer := 0;
  v_standard_count integer := 0;
  v_fallback_count integer := 0;
  v_total integer := 0;
BEGIN
  v_shapes := COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_shapes_config -> 'selectedShapes')), ARRAY[]::text[]);
  v_colors := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'colors')))), ARRAY[]::text[]);
  v_clarities := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'clarities')))), ARRAY[]::text[]);
  v_cut_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'cutGrades'));
  v_polish_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'polish'));
  v_symmetry_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'symmetry'));
  v_fluor_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'fluorescence'));
  v_lab_targets := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'labs')))), ARRAY[]::text[]);

  IF cardinality(v_cut_labels) = 0 THEN v_cut_labels := ARRAY['Excellent']::text[]; END IF;
  IF cardinality(v_polish_labels) = 0 THEN v_polish_labels := ARRAY['Excellent']::text[]; END IF;
  IF cardinality(v_symmetry_labels) = 0 THEN v_symmetry_labels := ARRAY['Excellent']::text[]; END IF;
  IF cardinality(v_fluor_labels) = 0 THEN v_fluor_labels := ARRAY['None']::text[]; END IF;

  v_cut_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'Excellent' THEN 'EX' WHEN 'Very Good' THEN 'VG' WHEN 'Good' THEN 'G' WHEN 'Fair' THEN 'F' WHEN 'Poor' THEN 'P' ELSE upper(label) END FROM unnest(v_cut_labels) AS label);
  v_polish_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'Excellent' THEN 'EX' WHEN 'Very Good' THEN 'VG' WHEN 'Good' THEN 'G' WHEN 'Fair' THEN 'F' WHEN 'Poor' THEN 'P' ELSE upper(label) END FROM unnest(v_polish_labels) AS label);
  v_symmetry_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'Excellent' THEN 'EX' WHEN 'Very Good' THEN 'VG' WHEN 'Good' THEN 'G' WHEN 'Fair' THEN 'F' WHEN 'Poor' THEN 'P' ELSE upper(label) END FROM unnest(v_symmetry_labels) AS label);
  v_fluor_codes := ARRAY(SELECT DISTINCT code FROM unnest(v_fluor_labels) AS label CROSS JOIN LATERAL unnest(CASE label WHEN 'None' THEN ARRAY['NON','NONE'] WHEN 'Faint' THEN ARRAY['FNT'] WHEN 'Very Slight' THEN ARRAY['VSL'] WHEN 'Slight' THEN ARRAY['SL'] WHEN 'Medium' THEN ARRAY['MED'] WHEN 'Strong' THEN ARRAY['STG','STR'] WHEN 'Very Strong' THEN ARRAY['VST'] ELSE ARRAY[upper(label)] END) AS code);

  IF COALESCE((v_diamond_type ->> 'naturalEnabled')::boolean, false) THEN
    v_stone_types := array_append(v_stone_types, 'natural');
  END IF;
  IF COALESCE((v_diamond_type ->> 'labGrownEnabled')::boolean, false) THEN
    v_stone_types := array_append(v_stone_types, 'lab');
  END IF;

  IF cardinality(v_stone_types) = 0 OR cardinality(v_shapes) = 0 OR cardinality(v_colors) = 0 OR cardinality(v_clarities) = 0 THEN
    RETURN jsonb_build_object('total', 0, 'poolCount', 0, 'fallbackCount', 0);
  END IF;

  WITH filtered_pool AS (
    SELECT
      CASE WHEN lower(COALESCE(dip.lg, '')) = 'natural' THEN 'natural' ELSE 'lab' END AS stone_type,
      public._diamond_preset_shape_id(dip.shape) AS shape_id,
      upper(trim(dip.col)) AS color,
      upper(trim(dip.clar)) AS clarity
    FROM public.diamond_inventory_pool dip
    WHERE dip.carats >= v_carat_min
      AND dip.carats <= v_carat_max
      AND upper(trim(dip.col)) = ANY(v_colors)
      AND upper(trim(dip.clar)) = ANY(v_clarities)
      AND public._diamond_preset_shape_id(dip.shape) = ANY(v_shapes)
      AND (CASE WHEN lower(COALESCE(dip.lg, '')) = 'natural' THEN 'natural' ELSE 'lab' END) = ANY(v_stone_types)
      AND (
        public._diamond_preset_shape_id(dip.shape) <> 'round'
        OR cardinality(v_cut_codes) = 0
        OR dip.cut = ANY(v_cut_codes)
        OR dip.cut = '-'
      )
      AND (cardinality(v_polish_codes) = 0 OR dip.pol = ANY(v_polish_codes))
      AND (cardinality(v_symmetry_codes) = 0 OR dip.symm = ANY(v_symmetry_codes))
      AND (cardinality(v_fluor_codes) = 0 OR dip.flo = ANY(v_fluor_codes))
      AND (cardinality(v_lab_targets) = 0 OR upper(trim(dip.lab)) = ANY(v_lab_targets))
      AND COALESCE(dip.price, 0) > 0
  )
  SELECT count(*), count(DISTINCT (stone_type, shape_id, color, clarity))
  INTO v_pool_count, v_pool_groups
  FROM filtered_pool;

  SELECT count(*) INTO v_standard_count
  FROM unnest(v_standard_carats) c(carat)
  WHERE c.carat >= v_carat_min AND c.carat <= v_carat_max;

  v_fallback_count := GREATEST(
    (cardinality(v_stone_types) * cardinality(v_shapes) * cardinality(v_colors) * cardinality(v_clarities) - v_pool_groups) * v_standard_count,
    0
  );

  v_total := v_pool_count + v_fallback_count;

  RETURN jsonb_build_object(
    'total', v_total,
    'poolCount', v_pool_count,
    'fallbackCount', v_fallback_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.count_diamond_presets_estimate(jsonb) TO authenticated;
```

---

## `supabase/migrations/20260522120000_diamond_paginated_fetch.sql`

```sql
-- Diamond catalog: server-side pagination, filter options, and mass price update

-- Index for fast server-side filtering and pagination on client_diamond_presets
CREATE INDEX IF NOT EXISTS idx_cdp_client_filters
  ON public.client_diamond_presets (
    client_id,
    stone_type,
    shape_id,
    color,
    clarity,
    carat_range,
    carat_value
  );

-- Paginated, filtered fetch — returns one page of presets + total_count in every row
CREATE OR REPLACE FUNCTION public.get_diamond_presets_filtered(
  p_client_id    uuid,
  p_stone_type   text DEFAULT NULL,
  p_shape_id     text DEFAULT NULL,
  p_color        text DEFAULT NULL,
  p_clarity      text DEFAULT NULL,
  p_carat_range  text DEFAULT NULL,
  p_page_size    int  DEFAULT 50,
  p_offset       int  DEFAULT 0
)
RETURNS TABLE (
  id            uuid,
  stone_type    text,
  shape_id      text,
  carat_range   text,
  carat_value   numeric,
  color         text,
  clarity       text,
  base_price    numeric,
  custom_price  numeric,
  is_enabled    bool,
  total_count   bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    id,
    stone_type,
    shape_id,
    carat_range,
    carat_value,
    color,
    clarity,
    base_price,
    custom_price,
    is_enabled,
    COUNT(*) OVER () AS total_count
  FROM public.client_diamond_presets
  WHERE client_id = p_client_id
    AND (p_stone_type  IS NULL OR stone_type  = p_stone_type)
    AND (p_shape_id    IS NULL OR shape_id    = p_shape_id)
    AND (p_color       IS NULL OR color       = p_color)
    AND (p_clarity     IS NULL OR clarity     = p_clarity)
    AND (p_carat_range IS NULL OR carat_range = p_carat_range)
  ORDER BY stone_type, shape_id, carat_value, color, clarity
  LIMIT  p_page_size
  OFFSET p_offset;
$$;

GRANT EXECUTE ON FUNCTION public.get_diamond_presets_filtered(uuid, text, text, text, text, text, int, int) TO authenticated;

-- Distinct filter option values + total count — one lightweight query for dropdown population
CREATE OR REPLACE FUNCTION public.get_diamond_preset_filter_options(p_client_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT jsonb_build_object(
    'shapes',      ARRAY(SELECT DISTINCT shape_id   FROM public.client_diamond_presets WHERE client_id = p_client_id ORDER BY 1),
    'colors',      ARRAY(SELECT DISTINCT color       FROM public.client_diamond_presets WHERE client_id = p_client_id ORDER BY 1),
    'clarities',   ARRAY(SELECT DISTINCT clarity     FROM public.client_diamond_presets WHERE client_id = p_client_id ORDER BY 1),
    'caratRanges', ARRAY(SELECT DISTINCT carat_range FROM public.client_diamond_presets WHERE client_id = p_client_id ORDER BY 1),
    'stoneTypes',  ARRAY(SELECT DISTINCT stone_type  FROM public.client_diamond_presets WHERE client_id = p_client_id ORDER BY 1),
    'totalCount',  (SELECT COUNT(*) FROM public.client_diamond_presets WHERE client_id = p_client_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_diamond_preset_filter_options(uuid) TO authenticated;

-- Mass price update — applies a multiplier and/or addend to all matching presets
CREATE OR REPLACE FUNCTION public.mass_update_diamond_prices(
  p_client_id    uuid,
  p_multiplier   numeric DEFAULT 1.0,
  p_addend       numeric DEFAULT 0,
  p_stone_type   text DEFAULT NULL,
  p_shape_id     text DEFAULT NULL,
  p_color        text DEFAULT NULL,
  p_clarity      text DEFAULT NULL,
  p_carat_range  text DEFAULT NULL
)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  updated_count int;
BEGIN
  UPDATE public.client_diamond_presets
  SET custom_price = GREATEST(0, round(custom_price * p_multiplier + p_addend))
  WHERE client_id = p_client_id
    AND (p_stone_type  IS NULL OR stone_type  = p_stone_type)
    AND (p_shape_id    IS NULL OR shape_id    = p_shape_id)
    AND (p_color       IS NULL OR color       = p_color)
    AND (p_clarity     IS NULL OR clarity     = p_clarity)
    AND (p_carat_range IS NULL OR carat_range = p_carat_range);
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mass_update_diamond_prices(uuid, numeric, numeric, text, text, text, text, text) TO authenticated;

```

---

## `supabase/migrations/20260522130000_diamond_reset_fn.sql`

```sql
-- Fast single-statement reset for client diamond presets.
-- Called by the reset-client-diamonds edge function to avoid the slow
-- batch-loop approach that times out on large catalogs (100k+ rows).
CREATE OR REPLACE FUNCTION public.reset_client_diamond_presets(p_client_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  deleted_count int;
BEGIN
  DELETE FROM public.client_diamond_presets WHERE client_id = p_client_id;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  DELETE FROM public.diamond_catalog_config WHERE client_id = p_client_id;

  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_client_diamond_presets(uuid) TO service_role;

```

---

## `supabase/migrations/20260522140000_delete_diamond_chunk.sql`

```sql
-- Chunked delete for client diamond presets.
-- Each call deletes up to 10,000 rows and returns the remaining count.
-- The frontend loops until remaining = 0, avoiding any statement timeout.
CREATE OR REPLACE FUNCTION public.delete_client_diamond_chunk(p_client_id uuid)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_authorized bool := false;
  remaining     bigint;
BEGIN
  -- Authorization: agency admin, client owner, or staff with catalog edit
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'agency_admin'
  ) THEN v_authorized := true; END IF;

  IF EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND user_id = auth.uid()
  ) THEN v_authorized := true; END IF;

  IF EXISTS (
    SELECT 1 FROM public.staff_members
    WHERE user_id = auth.uid()
      AND client_id = p_client_id
      AND (permissions->>'catalog_access') ILIKE 'edit'
  ) THEN v_authorized := true; END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized to reset this diamond catalog';
  END IF;

  -- Delete one chunk
  DELETE FROM public.client_diamond_presets
  WHERE id IN (
    SELECT id FROM public.client_diamond_presets
    WHERE client_id = p_client_id
    LIMIT 10000
  );

  -- Return how many rows are left
  SELECT COUNT(*) INTO remaining
  FROM public.client_diamond_presets
  WHERE client_id = p_client_id;

  RETURN remaining;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_client_diamond_chunk(uuid) TO authenticated;

```

---

## `supabase/migrations/20260522150000_delete_diamond_chunk_v2.sql`

```sql
-- v2: removes the expensive COUNT(*) that caused statement timeouts.
-- Returns rows deleted in THIS chunk (not remaining count).
-- Returns 0 when nothing left → frontend stops the loop.
-- SET LOCAL statement_timeout overrides the 8-second PostgREST default
-- for the duration of this function call only.

CREATE OR REPLACE FUNCTION public.delete_client_diamond_chunk(p_client_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_authorized      bool := false;
  deleted_in_chunk  int;
BEGIN
  -- Give this function 60 seconds — far more than any single 5k-row DELETE needs
  SET LOCAL statement_timeout = '60000';

  -- Authorization: agency admin, client owner, or staff with catalog edit
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'agency_admin'
  ) THEN v_authorized := true; END IF;

  IF EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND user_id = auth.uid()
  ) THEN v_authorized := true; END IF;

  IF EXISTS (
    SELECT 1 FROM public.staff_members
    WHERE user_id    = auth.uid()
      AND client_id  = p_client_id
      AND (permissions->>'catalog_access') ILIKE 'edit'
  ) THEN v_authorized := true; END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized to reset this diamond catalog';
  END IF;

  -- Delete one chunk — cheap index seek, no full scan
  DELETE FROM public.client_diamond_presets
  WHERE id IN (
    SELECT id FROM public.client_diamond_presets
    WHERE client_id = p_client_id
    LIMIT 5000
  );

  -- GET DIAGNOSTICS is instant (reads a counter, no table scan)
  GET DIAGNOSTICS deleted_in_chunk = ROW_COUNT;

  -- 0 → nothing was deleted → caller stops the loop
  RETURN deleted_in_chunk;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_client_diamond_chunk(uuid) TO authenticated;

```

---

## `supabase/migrations/20260522160000_delete_diamond_chunk_v3.sql`

```sql
-- v3: definitive fix for statement timeout.
--
-- SET LOCAL inside the function body cannot override the session-level
-- statement_timeout that PostgREST already set before the function runs.
--
-- The correct approach is the SET clause on CREATE FUNCTION itself — PostgreSQL
-- applies this BEFORE the session setting, so it always wins regardless of what
-- PostgREST configured at the connection level.
--
-- Also ensures the index exists so the subquery uses an index seek, not a full scan.

-- Index (idempotent — skipped if already exists from earlier migration)
CREATE INDEX IF NOT EXISTS idx_cdp_client_filters
  ON public.client_diamond_presets (
    client_id, stone_type, shape_id, color, clarity, carat_range, carat_value
  );

-- Drop old versions first so we can change the function-level SET attribute
DROP FUNCTION IF EXISTS public.delete_client_diamond_chunk(uuid);

CREATE OR REPLACE FUNCTION public.delete_client_diamond_chunk(p_client_id uuid)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout = '120s'   -- overrides PostgREST session limit (8 s default)
SET lock_timeout     = '30s'
AS $$
DECLARE
  v_authorized      bool := false;
  deleted_in_chunk  int;
BEGIN
  -- Authorization: agency admin, client owner, or staff with catalog edit
  IF EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'agency_admin'
  ) THEN v_authorized := true; END IF;

  IF EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND user_id = auth.uid()
  ) THEN v_authorized := true; END IF;

  IF EXISTS (
    SELECT 1 FROM public.staff_members
    WHERE user_id    = auth.uid()
      AND client_id  = p_client_id
      AND (permissions->>'catalog_access') ILIKE 'edit'
  ) THEN v_authorized := true; END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized to reset this diamond catalog';
  END IF;

  -- Delete one chunk using the client_id index (idx_cdp_client_filters)
  -- GET DIAGNOSTICS is instant — no table scan, no COUNT(*)
  DELETE FROM public.client_diamond_presets
  WHERE id IN (
    SELECT id FROM public.client_diamond_presets
    WHERE client_id = p_client_id
    LIMIT 5000
  );

  GET DIAGNOSTICS deleted_in_chunk = ROW_COUNT;

  -- Return 0 when nothing was deleted → caller knows it is done
  RETURN deleted_in_chunk;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_client_diamond_chunk(uuid) TO authenticated;

```

---

## `supabase/migrations/20260525105716_70975300-33b6-4800-b906-d15977cd9a53.sql`

```sql

CREATE TABLE IF NOT EXISTS public.client_diamond_catalog_filter (
  client_id      uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  filter         jsonb NOT NULL DEFAULT '{}'::jsonb,
  markup_natural numeric NOT NULL DEFAULT 0,
  markup_lab     numeric NOT NULL DEFAULT 0,
  is_confirmed   boolean NOT NULL DEFAULT false,
  confirmed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_diamond_catalog_filter ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cdcf_client_select" ON public.client_diamond_catalog_filter;
DROP POLICY IF EXISTS "cdcf_client_insert" ON public.client_diamond_catalog_filter;
DROP POLICY IF EXISTS "cdcf_client_update" ON public.client_diamond_catalog_filter;
DROP POLICY IF EXISTS "cdcf_client_delete" ON public.client_diamond_catalog_filter;
DROP POLICY IF EXISTS "cdcf_agency_admin_all" ON public.client_diamond_catalog_filter;
DROP POLICY IF EXISTS "cdcf_admin_staff_all"  ON public.client_diamond_catalog_filter;

CREATE POLICY "cdcf_client_select"
  ON public.client_diamond_catalog_filter FOR SELECT
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

CREATE POLICY "cdcf_client_insert"
  ON public.client_diamond_catalog_filter FOR INSERT
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

CREATE POLICY "cdcf_client_update"
  ON public.client_diamond_catalog_filter FOR UPDATE
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

CREATE POLICY "cdcf_client_delete"
  ON public.client_diamond_catalog_filter FOR DELETE
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

CREATE POLICY "cdcf_agency_admin_all"
  ON public.client_diamond_catalog_filter FOR ALL
  USING (public.has_role(auth.uid(), 'agency_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'agency_admin'::public.app_role));

CREATE POLICY "cdcf_admin_staff_all"
  ON public.client_diamond_catalog_filter FOR ALL
  USING (EXISTS (SELECT 1 FROM public.admin_staff_members
                 WHERE user_id = auth.uid() AND status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_staff_members
                      WHERE user_id = auth.uid() AND status = 'active'));

CREATE TRIGGER cdcf_set_updated_at
  BEFORE UPDATE ON public.client_diamond_catalog_filter
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
CREATE OR REPLACE FUNCTION public.diamond_pool_row_matches(
  p_row public.diamond_inventory_pool,
  p_filter jsonb
) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_arr jsonb;
BEGIN
  IF p_filter IS NULL OR p_filter = '{}'::jsonb THEN RETURN true; END IF;

  v_arr := p_filter -> 'stoneTypes';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF (CASE WHEN COALESCE(p_row.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END)
       NOT IN (SELECT jsonb_array_elements_text(v_arr)) THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'shapes';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF LOWER(REGEXP_REPLACE(COALESCE(p_row.shape,''),'\s+',' ','g'))
       NOT IN (SELECT LOWER(jsonb_array_elements_text(v_arr))) THEN
      IF SPLIT_PART(LOWER(COALESCE(p_row.shape,'')),' ',1)
         NOT IN (SELECT LOWER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
    END IF;
  END IF;

  IF (p_filter ? 'caratMin') AND (p_filter->>'caratMin') <> '' THEN
    IF COALESCE(p_row.carats,0) < (p_filter->>'caratMin')::numeric THEN RETURN false; END IF;
  END IF;
  IF (p_filter ? 'caratMax') AND (p_filter->>'caratMax') <> '' THEN
    IF COALESCE(p_row.carats,0) > (p_filter->>'caratMax')::numeric THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'colors';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF UPPER(COALESCE(p_row.col,'')) NOT IN (SELECT UPPER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'clarities';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF UPPER(COALESCE(p_row.clar,'')) NOT IN (SELECT UPPER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'cuts';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF UPPER(COALESCE(p_row.cut,'')) NOT IN (SELECT UPPER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'polish';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF UPPER(COALESCE(p_row.pol,'')) NOT IN (SELECT UPPER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'symmetry';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF UPPER(COALESCE(p_row.symm,'')) NOT IN (SELECT UPPER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'fluorescence';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF UPPER(COALESCE(p_row.flo,'')) NOT IN (SELECT UPPER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
  END IF;

  v_arr := p_filter -> 'labs';
  IF v_arr IS NOT NULL AND jsonb_array_length(v_arr) > 0 THEN
    IF UPPER(COALESCE(p_row.lab,'')) NOT IN (SELECT UPPER(jsonb_array_elements_text(v_arr))) THEN RETURN false; END IF;
  END IF;

  IF COALESCE((p_filter->>'canadianOnly')::boolean, false) THEN
    IF NOT COALESCE(p_row.canada_mark_eligible, false) THEN RETURN false; END IF;
  END IF;

  IF (p_filter ? 'lengthMin') AND (p_filter->>'lengthMin') <> '' THEN
    IF COALESCE(p_row.length,0) < (p_filter->>'lengthMin')::numeric THEN RETURN false; END IF;
  END IF;
  IF (p_filter ? 'lengthMax') AND (p_filter->>'lengthMax') <> '' THEN
    IF COALESCE(p_row.length,0) > (p_filter->>'lengthMax')::numeric THEN RETURN false; END IF;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_diamond_presets_filtered(
  p_client_id uuid,
  p_stone_type text DEFAULT NULL,
  p_shape_id text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_clarity text DEFAULT NULL,
  p_carat_range text DEFAULT NULL,
  p_page_size integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  stone_type text,
  shape_id text,
  carat_range text,
  carat_value numeric,
  color text,
  clarity text,
  base_price numeric,
  custom_price numeric,
  is_enabled boolean,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filter_row public.client_diamond_catalog_filter%ROWTYPE;
BEGIN
  SELECT * INTO v_filter_row
  FROM public.client_diamond_catalog_filter
  WHERE client_id = p_client_id AND is_confirmed = true;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      cdp.id, cdp.stone_type, cdp.shape_id, cdp.carat_range, cdp.carat_value,
      cdp.color, cdp.clarity, cdp.base_price, cdp.custom_price, cdp.is_enabled,
      COUNT(*) OVER ()::bigint AS total_count
    FROM public.client_diamond_presets cdp
    WHERE cdp.client_id = p_client_id
      AND (p_stone_type  IS NULL OR cdp.stone_type  = p_stone_type)
      AND (p_shape_id    IS NULL OR cdp.shape_id    = p_shape_id)
      AND (p_color       IS NULL OR cdp.color       = p_color)
      AND (p_clarity     IS NULL OR cdp.clarity     = p_clarity)
      AND (p_carat_range IS NULL OR cdp.carat_range = p_carat_range)
    ORDER BY cdp.stone_type, cdp.shape_id, cdp.carat_value, cdp.color, cdp.clarity
    LIMIT p_page_size OFFSET p_offset;
    RETURN;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id,
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END AS stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
      p.carats AS carat_value,
      UPPER(COALESCE(p.col,'')) AS color,
      UPPER(COALESCE(p.clar,'')) AS clarity,
      ROUND(
        COALESCE(p.price,0) *
        (1 + (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN v_filter_row.markup_lab ELSE v_filter_row.markup_natural END) / 100.0)
      , 2) AS base_price
    FROM public.diamond_inventory_pool p
    WHERE public.diamond_pool_row_matches(p, v_filter_row.filter)
  ),
  filtered AS (
    SELECT *,
      FLOOR(carat_value * 2) / 2 AS carat_bucket
    FROM base
    WHERE (p_stone_type IS NULL OR stone_type = p_stone_type)
      AND (p_shape_id   IS NULL OR shape_id   = p_shape_id)
      AND (p_color      IS NULL OR color      = UPPER(p_color))
      AND (p_clarity    IS NULL OR clarity    = UPPER(p_clarity))
  ),
  ranged AS (
    SELECT *,
      TRIM(TO_CHAR(carat_bucket, 'FM0.00')) || '-' ||
      TRIM(TO_CHAR(carat_bucket + 0.49, 'FM0.00')) AS carat_range_str
    FROM filtered
  )
  SELECT
    r.id, r.stone_type, r.shape_id,
    r.carat_range_str AS carat_range,
    r.carat_value, r.color, r.clarity, r.base_price,
    NULL::numeric AS custom_price,
    true AS is_enabled,
    COUNT(*) OVER ()::bigint AS total_count
  FROM ranged r
  WHERE (p_carat_range IS NULL OR r.carat_range_str = p_carat_range)
  ORDER BY r.stone_type, r.shape_id, r.carat_value, r.color, r.clarity
  LIMIT p_page_size OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_diamond_pool_filter_count(
  p_filter jsonb
)
RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.diamond_inventory_pool p
  WHERE public.diamond_pool_row_matches(p, p_filter);
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.diamond_pool_row_matches(public.diamond_inventory_pool, jsonb) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_diamond_pool_filter_count(jsonb) TO authenticated, service_role;

```

---

## `supabase/migrations/20260525105751_8a74c5a3-88f2-4843-853f-e3724a38a937.sql`

```sql

CREATE OR REPLACE FUNCTION public.get_diamond_pool_preview(
  p_filter jsonb,
  p_markup_natural numeric DEFAULT 0,
  p_markup_lab numeric DEFAULT 0,
  p_page_size integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  stone_type text,
  shape_id text,
  carat_range text,
  carat_value numeric,
  color text,
  clarity text,
  base_price numeric,
  custom_price numeric,
  is_enabled boolean,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      p.id,
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END AS stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
      p.carats AS carat_value,
      UPPER(COALESCE(p.col,'')) AS color,
      UPPER(COALESCE(p.clar,'')) AS clarity,
      ROUND(
        COALESCE(p.price,0) *
        (1 + (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN p_markup_lab ELSE p_markup_natural END) / 100.0)
      , 2) AS base_price,
      FLOOR(p.carats * 2) / 2 AS carat_bucket
    FROM public.diamond_inventory_pool p
    WHERE public.diamond_pool_row_matches(p, p_filter)
  )
  SELECT
    b.id, b.stone_type, b.shape_id,
    TRIM(TO_CHAR(b.carat_bucket, 'FM0.00')) || '-' || TRIM(TO_CHAR(b.carat_bucket + 0.49, 'FM0.00')) AS carat_range,
    b.carat_value, b.color, b.clarity, b.base_price,
    NULL::numeric AS custom_price,
    true AS is_enabled,
    COUNT(*) OVER ()::bigint AS total_count
  FROM base b
  ORDER BY b.stone_type, b.shape_id, b.carat_value, b.color, b.clarity
  LIMIT p_page_size OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_diamond_pool_preview(jsonb, numeric, numeric, integer, integer) TO authenticated, service_role;

```

---

## `supabase/migrations/20260525112742_a95edd7f-c1c6-4bfb-ad6a-8dcee05558e6.sql`

```sql

CREATE OR REPLACE FUNCTION public.get_diamond_pool_preview(
  p_filter jsonb,
  p_markup_natural numeric DEFAULT 0,
  p_markup_lab numeric DEFAULT 0,
  p_page_size integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, stone_type text, shape_id text, carat_range text, carat_value numeric,
  color text, clarity text, base_price numeric, custom_price numeric,
  is_enabled boolean, total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stone text[];
  v_shapes text[];
  v_colors text[];
  v_clar text[];
  v_cuts text[];
  v_pol text[];
  v_symm text[];
  v_flo text[];
  v_labs text[];
  v_carat_min numeric;
  v_carat_max numeric;
  v_len_min numeric;
  v_len_max numeric;
  v_canadian boolean;
BEGIN
  IF p_filter IS NULL THEN p_filter := '{}'::jsonb; END IF;

  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(p_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(p_filter->'shapes')))     INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'colors')))     INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'clarities')))  INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'cuts')))       INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'polish')))     INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'symmetry')))   INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'labs')))       INTO v_labs;

  v_carat_min := NULLIF(p_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(p_filter->>'caratMax','')::numeric;
  v_len_min   := NULLIF(p_filter->>'lengthMin','')::numeric;
  v_len_max   := NULLIF(p_filter->>'lengthMax','')::numeric;
  v_canadian  := COALESCE((p_filter->>'canadianOnly')::boolean, false);

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id,
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END AS stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
      p.carats AS carat_value,
      UPPER(COALESCE(p.col,'')) AS color,
      UPPER(COALESCE(p.clar,'')) AS clarity,
      ROUND(
        COALESCE(p.price,0) *
        (1 + (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN p_markup_lab ELSE p_markup_natural END) / 100.0)
      , 2) AS base_price,
      FLOOR(p.carats * 2) / 2 AS carat_bucket
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0)  = 0 OR (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,''))  = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0)   = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0)   = 0 OR UPPER(COALESCE(p.cut,''))  = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0)    = 0 OR UPPER(COALESCE(p.pol,''))  = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0)   = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0)    = 0 OR UPPER(COALESCE(p.flo,''))  = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0)   = 0 OR UPPER(COALESCE(p.lab,''))  = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (v_len_min   IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max   IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
  )
  SELECT
    b.id, b.stone_type, b.shape_id,
    TRIM(TO_CHAR(b.carat_bucket, 'FM0.00')) || '-' || TRIM(TO_CHAR(b.carat_bucket + 0.49, 'FM0.00')) AS carat_range,
    b.carat_value, b.color, b.clarity, b.base_price,
    NULL::numeric AS custom_price,
    true AS is_enabled,
    COUNT(*) OVER ()::bigint AS total_count
  FROM base b
  ORDER BY b.stone_type, b.shape_id, b.carat_value, b.color, b.clarity
  LIMIT p_page_size OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_diamond_pool_filter_count(p_filter jsonb)
RETURNS bigint
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stone text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts text[]; v_pol text[]; v_symm text[]; v_flo text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric; v_len_min numeric; v_len_max numeric;
  v_canadian boolean;
  v_count bigint;
BEGIN
  IF p_filter IS NULL THEN p_filter := '{}'::jsonb; END IF;

  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(p_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(p_filter->'shapes')))     INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'colors')))     INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'clarities')))  INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'cuts')))       INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'polish')))     INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'symmetry')))   INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'labs')))       INTO v_labs;
  v_carat_min := NULLIF(p_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(p_filter->>'caratMax','')::numeric;
  v_len_min   := NULLIF(p_filter->>'lengthMin','')::numeric;
  v_len_max   := NULLIF(p_filter->>'lengthMax','')::numeric;
  v_canadian  := COALESCE((p_filter->>'canadianOnly')::boolean, false);

  SELECT COUNT(*) INTO v_count
  FROM public.diamond_inventory_pool p
  WHERE
    (COALESCE(array_length(v_stone,1),0)  = 0 OR (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
    AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
    AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,''))  = ANY(v_colors))
    AND (COALESCE(array_length(v_clar,1),0)   = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
    AND (COALESCE(array_length(v_cuts,1),0)   = 0 OR UPPER(COALESCE(p.cut,''))  = ANY(v_cuts))
    AND (COALESCE(array_length(v_pol,1),0)    = 0 OR UPPER(COALESCE(p.pol,''))  = ANY(v_pol))
    AND (COALESCE(array_length(v_symm,1),0)   = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
    AND (COALESCE(array_length(v_flo,1),0)    = 0 OR UPPER(COALESCE(p.flo,''))  = ANY(v_flo))
    AND (COALESCE(array_length(v_labs,1),0)   = 0 OR UPPER(COALESCE(p.lab,''))  = ANY(v_labs))
    AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
    AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
    AND (v_len_min   IS NULL OR COALESCE(p.length,0) >= v_len_min)
    AND (v_len_max   IS NULL OR COALESCE(p.length,0) <= v_len_max)
    AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false));

  RETURN v_count;
END;
$function$;

```

---

## `supabase/migrations/20260525120630_eff64517-7d77-4462-999b-48b6f2bcd714.sql`

```sql
CREATE OR REPLACE FUNCTION public.get_diamond_presets_filtered(
  p_client_id uuid,
  p_stone_type text DEFAULT NULL,
  p_shape_id text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_clarity text DEFAULT NULL,
  p_carat_range text DEFAULT NULL,
  p_page_size integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  stone_type text,
  shape_id text,
  carat_range text,
  carat_value numeric,
  color text,
  clarity text,
  base_price numeric,
  custom_price numeric,
  is_enabled boolean,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filter_row public.client_diamond_catalog_filter%ROWTYPE;
  v_filter jsonb;
  v_stone text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts text[]; v_pol text[]; v_symm text[]; v_flo text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric; v_len_min numeric; v_len_max numeric;
  v_canadian boolean;
BEGIN
  SELECT * INTO v_filter_row
  FROM public.client_diamond_catalog_filter
  WHERE client_id = p_client_id AND is_confirmed = true;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      cdp.id, cdp.stone_type, cdp.shape_id, cdp.carat_range, cdp.carat_value,
      cdp.color, cdp.clarity, cdp.base_price, cdp.custom_price, cdp.is_enabled,
      COUNT(*) OVER ()::bigint AS total_count
    FROM public.client_diamond_presets cdp
    WHERE cdp.client_id = p_client_id
      AND cdp.is_enabled = true
      AND (p_stone_type  IS NULL OR cdp.stone_type  = LOWER(p_stone_type))
      AND (p_shape_id    IS NULL OR cdp.shape_id    = LOWER(p_shape_id))
      AND (p_color       IS NULL OR UPPER(cdp.color) = UPPER(p_color))
      AND (p_clarity     IS NULL OR UPPER(cdp.clarity) = UPPER(p_clarity))
      AND (p_carat_range IS NULL OR cdp.carat_range = p_carat_range)
    ORDER BY cdp.stone_type, cdp.shape_id, cdp.carat_value, cdp.color, cdp.clarity
    LIMIT p_page_size OFFSET p_offset;
    RETURN;
  END IF;

  v_filter := COALESCE(v_filter_row.filter, '{}'::jsonb);
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'shapes'))) INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'colors'))) INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'clarities'))) INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'cuts'))) INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'polish'))) INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'symmetry'))) INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'labs'))) INTO v_labs;
  v_carat_min := NULLIF(v_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(v_filter->>'caratMax','')::numeric;
  v_len_min := NULLIF(v_filter->>'lengthMin','')::numeric;
  v_len_max := NULLIF(v_filter->>'lengthMax','')::numeric;
  v_canadian := COALESCE((v_filter->>'canadianOnly')::boolean, false);

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id,
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END AS stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
      p.carats AS carat_value,
      UPPER(COALESCE(p.col,'')) AS color,
      UPPER(COALESCE(p.clar,'')) AS clarity,
      ROUND(
        COALESCE(p.price,0) *
        (1 + (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN v_filter_row.markup_lab ELSE v_filter_row.markup_natural END) / 100.0)
      , 2) AS base_price,
      FLOOR(COALESCE(p.carats,0) * 2) / 2 AS carat_bucket
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0) = 0 OR (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,'')) = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0) = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0) = 0 OR UPPER(COALESCE(p.cut,'')) = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0) = 0 OR UPPER(COALESCE(p.pol,'')) = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0) = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0) = 0 OR UPPER(COALESCE(p.flo,'')) = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0) = 0 OR UPPER(COALESCE(p.lab,'')) = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
  ), filtered AS (
    SELECT * FROM base
    WHERE (p_stone_type IS NULL OR stone_type = LOWER(p_stone_type))
      AND (p_shape_id IS NULL OR shape_id = LOWER(p_shape_id))
      AND (p_color IS NULL OR color = UPPER(p_color))
      AND (p_clarity IS NULL OR clarity = UPPER(p_clarity))
  ), ranged AS (
    SELECT *, TRIM(TO_CHAR(carat_bucket, 'FM0.00')) || '-' || TRIM(TO_CHAR(carat_bucket + 0.49, 'FM0.00')) AS carat_range_str
    FROM filtered
  )
  SELECT
    r.id, r.stone_type, r.shape_id, r.carat_range_str AS carat_range,
    r.carat_value, r.color, r.clarity, r.base_price,
    NULL::numeric AS custom_price,
    true AS is_enabled,
    COUNT(*) OVER ()::bigint AS total_count
  FROM ranged r
  WHERE (p_carat_range IS NULL OR r.carat_range_str = p_carat_range)
  ORDER BY r.stone_type, r.shape_id, r.carat_value, r.color, r.clarity
  LIMIT p_page_size OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_diamond_catalog_availability(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filter_row public.client_diamond_catalog_filter%ROWTYPE;
  v_filter jsonb;
  v_stone text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts text[]; v_pol text[]; v_symm text[]; v_flo text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric; v_len_min numeric; v_len_max numeric;
  v_canadian boolean;
  v_result jsonb;
BEGIN
  SELECT * INTO v_filter_row
  FROM public.client_diamond_catalog_filter
  WHERE client_id = p_client_id AND is_confirmed = true;

  IF NOT FOUND THEN
    WITH rows AS (
      SELECT shape_id, stone_type, FLOOR(carat_value * 2) / 2 AS carat_bucket
      FROM public.client_diamond_presets
      WHERE client_id = p_client_id AND is_enabled = true
    ), shape_buckets AS (
      SELECT shape_id, jsonb_agg(carat_bucket ORDER BY carat_bucket) AS buckets
      FROM (SELECT DISTINCT shape_id, carat_bucket FROM rows) d
      GROUP BY shape_id
    )
    SELECT jsonb_build_object(
      'isConfirmed', false,
      'shapes', COALESCE((SELECT jsonb_agg(shape_id ORDER BY shape_id) FROM (SELECT DISTINCT shape_id FROM rows) s), '[]'::jsonb),
      'stoneTypes', COALESCE((SELECT jsonb_agg(stone_type ORDER BY stone_type) FROM (SELECT DISTINCT stone_type FROM rows) s), '[]'::jsonb),
      'caratBuckets', COALESCE((SELECT jsonb_agg(carat_bucket ORDER BY carat_bucket) FROM (SELECT DISTINCT carat_bucket FROM rows) c), '[]'::jsonb),
      'shapeCaratBuckets', COALESCE((SELECT jsonb_object_agg(shape_id, buckets) FROM shape_buckets), '{}'::jsonb)
    ) INTO v_result;
    RETURN v_result;
  END IF;

  v_filter := COALESCE(v_filter_row.filter, '{}'::jsonb);
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'shapes'))) INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'colors'))) INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'clarities'))) INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'cuts'))) INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'polish'))) INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'symmetry'))) INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'labs'))) INTO v_labs;
  v_carat_min := NULLIF(v_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(v_filter->>'caratMax','')::numeric;
  v_len_min := NULLIF(v_filter->>'lengthMin','')::numeric;
  v_len_max := NULLIF(v_filter->>'lengthMax','')::numeric;
  v_canadian := COALESCE((v_filter->>'canadianOnly')::boolean, false);

  WITH rows AS (
    SELECT
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END AS stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
      FLOOR(COALESCE(p.carats,0) * 2) / 2 AS carat_bucket
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0) = 0 OR (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,'')) = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0) = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0) = 0 OR UPPER(COALESCE(p.cut,'')) = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0) = 0 OR UPPER(COALESCE(p.pol,'')) = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0) = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0) = 0 OR UPPER(COALESCE(p.flo,'')) = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0) = 0 OR UPPER(COALESCE(p.lab,'')) = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
  ), shape_buckets AS (
    SELECT shape_id, jsonb_agg(carat_bucket ORDER BY carat_bucket) AS buckets
    FROM (SELECT DISTINCT shape_id, carat_bucket FROM rows) d
    GROUP BY shape_id
  )
  SELECT jsonb_build_object(
    'isConfirmed', true,
    'shapes', COALESCE((SELECT jsonb_agg(shape_id ORDER BY shape_id) FROM (SELECT DISTINCT shape_id FROM rows) s), '[]'::jsonb),
    'stoneTypes', COALESCE((SELECT jsonb_agg(stone_type ORDER BY stone_type) FROM (SELECT DISTINCT stone_type FROM rows) s), '[]'::jsonb),
    'caratBuckets', COALESCE((SELECT jsonb_agg(carat_bucket ORDER BY carat_bucket) FROM (SELECT DISTINCT carat_bucket FROM rows) c), '[]'::jsonb),
    'shapeCaratBuckets', COALESCE((SELECT jsonb_object_agg(shape_id, buckets) FROM shape_buckets), '{}'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_diamond_presets_filtered(uuid, text, text, text, text, text, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_client_diamond_catalog_availability(uuid) TO anon, authenticated, service_role;
```

---

## `supabase/migrations/20260525121841_7063fef8-0418-4a81-a831-aa9c79477644.sql`

```sql
CREATE OR REPLACE FUNCTION public.get_diamond_presets_filtered(
  p_client_id uuid,
  p_stone_type text DEFAULT NULL,
  p_shape_id text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_clarity text DEFAULT NULL,
  p_carat_range text DEFAULT NULL,
  p_page_size integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  stone_type text,
  shape_id text,
  carat_range text,
  carat_value numeric,
  color text,
  clarity text,
  base_price numeric,
  custom_price numeric,
  is_enabled boolean,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filter_row public.client_diamond_catalog_filter%ROWTYPE;
  v_filter jsonb;
  v_stone text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts text[]; v_pol text[]; v_symm text[]; v_flo text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric; v_len_min numeric; v_len_max numeric;
  v_canadian boolean;
BEGIN
  SELECT * INTO v_filter_row
  FROM public.client_diamond_catalog_filter
  WHERE client_id = p_client_id AND is_confirmed = true;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      cdp.id, cdp.stone_type, cdp.shape_id, cdp.carat_range, cdp.carat_value,
      cdp.color, cdp.clarity, cdp.base_price, cdp.custom_price, cdp.is_enabled,
      COUNT(*) OVER ()::bigint AS total_count
    FROM public.client_diamond_presets cdp
    WHERE cdp.client_id = p_client_id
      AND cdp.is_enabled = true
      AND (p_stone_type  IS NULL OR cdp.stone_type  = LOWER(p_stone_type))
      AND (p_shape_id    IS NULL OR cdp.shape_id    = LOWER(p_shape_id))
      AND (p_color       IS NULL OR UPPER(cdp.color) = UPPER(p_color))
      AND (p_clarity     IS NULL OR UPPER(cdp.clarity) = UPPER(p_clarity))
      AND (p_carat_range IS NULL OR cdp.carat_range = p_carat_range)
    ORDER BY cdp.stone_type, cdp.shape_id, cdp.carat_value, cdp.color, cdp.clarity
    LIMIT p_page_size OFFSET p_offset;
    RETURN;
  END IF;

  v_filter := COALESCE(v_filter_row.filter, '{}'::jsonb);
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'shapes'))) INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'colors'))) INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'clarities'))) INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'cuts'))) INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'polish'))) INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'symmetry'))) INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'labs'))) INTO v_labs;
  v_carat_min := NULLIF(v_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(v_filter->>'caratMax','')::numeric;
  v_len_min := NULLIF(v_filter->>'lengthMin','')::numeric;
  v_len_max := NULLIF(v_filter->>'lengthMax','')::numeric;
  v_canadian := COALESCE((v_filter->>'canadianOnly')::boolean, false);

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id,
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END AS diamond_stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS diamond_shape_id,
      p.carats AS diamond_carat_value,
      UPPER(COALESCE(p.col,'')) AS diamond_color,
      UPPER(COALESCE(p.clar,'')) AS diamond_clarity,
      ROUND(
        COALESCE(p.price,0) *
        (1 + (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN v_filter_row.markup_lab ELSE v_filter_row.markup_natural END) / 100.0)
      , 2) AS diamond_base_price,
      FLOOR(COALESCE(p.carats,0) * 2) / 2 AS diamond_carat_bucket
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0) = 0 OR (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,'')) = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0) = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0) = 0 OR UPPER(COALESCE(p.cut,'')) = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0) = 0 OR UPPER(COALESCE(p.pol,'')) = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0) = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0) = 0 OR UPPER(COALESCE(p.flo,'')) = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0) = 0 OR UPPER(COALESCE(p.lab,'')) = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
  ), filtered AS (
    SELECT * FROM base b
    WHERE (p_stone_type IS NULL OR b.diamond_stone_type = LOWER(p_stone_type))
      AND (p_shape_id IS NULL OR b.diamond_shape_id = LOWER(p_shape_id))
      AND (p_color IS NULL OR b.diamond_color = UPPER(p_color))
      AND (p_clarity IS NULL OR b.diamond_clarity = UPPER(p_clarity))
  ), ranged AS (
    SELECT
      f.*,
      TRIM(TO_CHAR(f.diamond_carat_bucket, 'FM0.00')) || '-' || TRIM(TO_CHAR(f.diamond_carat_bucket + 0.49, 'FM0.00')) AS diamond_carat_range
    FROM filtered f
  )
  SELECT
    r.id,
    r.diamond_stone_type AS stone_type,
    r.diamond_shape_id AS shape_id,
    r.diamond_carat_range AS carat_range,
    r.diamond_carat_value AS carat_value,
    r.diamond_color AS color,
    r.diamond_clarity AS clarity,
    r.diamond_base_price AS base_price,
    NULL::numeric AS custom_price,
    true AS is_enabled,
    COUNT(*) OVER ()::bigint AS total_count
  FROM ranged r
  WHERE (p_carat_range IS NULL OR r.diamond_carat_range = p_carat_range)
  ORDER BY r.diamond_stone_type, r.diamond_shape_id, r.diamond_carat_value, r.diamond_color, r.diamond_clarity
  LIMIT p_page_size OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_diamond_presets_filtered(uuid, text, text, text, text, text, integer, integer) TO anon, authenticated, service_role;
```

---

## `supabase/migrations/20260525124435_3db7d719-6b21-46b6-be75-e54bd23bfb31.sql`

```sql
-- get_diamond_pool_preview: add caratRanges support
CREATE OR REPLACE FUNCTION public.get_diamond_pool_preview(p_filter jsonb, p_markup_natural numeric DEFAULT 0, p_markup_lab numeric DEFAULT 0, p_page_size integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, stone_type text, shape_id text, carat_range text, carat_value numeric, color text, clarity text, base_price numeric, custom_price numeric, is_enabled boolean, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stone text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts text[]; v_pol text[]; v_symm text[]; v_flo text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric;
  v_carat_ranges numeric[];
  v_len_min numeric; v_len_max numeric; v_canadian boolean;
BEGIN
  IF p_filter IS NULL THEN p_filter := '{}'::jsonb; END IF;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(p_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(p_filter->'shapes')))     INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'colors')))     INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'clarities')))  INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'cuts')))       INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'polish')))     INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'symmetry')))   INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'labs')))       INTO v_labs;
  v_carat_min := NULLIF(p_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(p_filter->>'caratMax','')::numeric;
  SELECT ARRAY(SELECT (jsonb_array_elements_text(p_filter->'caratRanges'))::numeric) INTO v_carat_ranges;
  v_len_min   := NULLIF(p_filter->>'lengthMin','')::numeric;
  v_len_max   := NULLIF(p_filter->>'lengthMax','')::numeric;
  v_canadian  := COALESCE((p_filter->>'canadianOnly')::boolean, false);

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id,
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END AS stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
      p.carats AS carat_value,
      UPPER(COALESCE(p.col,'')) AS color,
      UPPER(COALESCE(p.clar,'')) AS clarity,
      ROUND(
        COALESCE(p.price,0) *
        (1 + (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN p_markup_lab ELSE p_markup_natural END) / 100.0)
      , 2) AS base_price,
      FLOOR(COALESCE(p.carats,0) * 2) / 2 AS carat_bucket
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0) = 0 OR (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,'')) = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0) = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0) = 0 OR UPPER(COALESCE(p.cut,'')) = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0) = 0 OR UPPER(COALESCE(p.pol,'')) = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0) = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0) = 0 OR UPPER(COALESCE(p.flo,'')) = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0) = 0 OR UPPER(COALESCE(p.lab,'')) = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (COALESCE(array_length(v_carat_ranges,1),0) = 0 OR (FLOOR(COALESCE(p.carats,0) * 2) / 2) = ANY(v_carat_ranges))
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
  )
  SELECT
    b.id, b.stone_type, b.shape_id,
    TRIM(TO_CHAR(b.carat_bucket, 'FM0.00')) || '-' || TRIM(TO_CHAR(b.carat_bucket + 0.49, 'FM0.00')) AS carat_range,
    b.carat_value, b.color, b.clarity, b.base_price,
    NULL::numeric AS custom_price, true AS is_enabled,
    COUNT(*) OVER ()::bigint AS total_count
  FROM base b
  ORDER BY b.stone_type, b.shape_id, b.carat_value, b.color, b.clarity
  LIMIT p_page_size OFFSET p_offset;
END;
$function$;

-- get_client_diamond_catalog_availability: respect caratRanges
CREATE OR REPLACE FUNCTION public.get_client_diamond_catalog_availability(p_client_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_filter_row public.client_diamond_catalog_filter%ROWTYPE;
  v_filter jsonb;
  v_stone text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts text[]; v_pol text[]; v_symm text[]; v_flo text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric;
  v_carat_ranges numeric[];
  v_len_min numeric; v_len_max numeric; v_canadian boolean;
  v_result jsonb;
BEGIN
  SELECT * INTO v_filter_row
  FROM public.client_diamond_catalog_filter
  WHERE client_id = p_client_id AND is_confirmed = true;

  IF NOT FOUND THEN
    WITH rows AS (
      SELECT shape_id, stone_type, FLOOR(carat_value * 2) / 2 AS carat_bucket
      FROM public.client_diamond_presets
      WHERE client_id = p_client_id AND is_enabled = true
    ), shape_buckets AS (
      SELECT shape_id, jsonb_agg(carat_bucket ORDER BY carat_bucket) AS buckets
      FROM (SELECT DISTINCT shape_id, carat_bucket FROM rows) d
      GROUP BY shape_id
    )
    SELECT jsonb_build_object(
      'isConfirmed', false,
      'shapes', COALESCE((SELECT jsonb_agg(shape_id ORDER BY shape_id) FROM (SELECT DISTINCT shape_id FROM rows) s), '[]'::jsonb),
      'stoneTypes', COALESCE((SELECT jsonb_agg(stone_type ORDER BY stone_type) FROM (SELECT DISTINCT stone_type FROM rows) s), '[]'::jsonb),
      'caratBuckets', COALESCE((SELECT jsonb_agg(carat_bucket ORDER BY carat_bucket) FROM (SELECT DISTINCT carat_bucket FROM rows) c), '[]'::jsonb),
      'shapeCaratBuckets', COALESCE((SELECT jsonb_object_agg(shape_id, buckets) FROM shape_buckets), '{}'::jsonb)
    ) INTO v_result;
    RETURN v_result;
  END IF;

  v_filter := COALESCE(v_filter_row.filter, '{}'::jsonb);
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'shapes'))) INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'colors'))) INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'clarities'))) INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'cuts'))) INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'polish'))) INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'symmetry'))) INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'labs'))) INTO v_labs;
  v_carat_min := NULLIF(v_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(v_filter->>'caratMax','')::numeric;
  SELECT ARRAY(SELECT (jsonb_array_elements_text(v_filter->'caratRanges'))::numeric) INTO v_carat_ranges;
  v_len_min := NULLIF(v_filter->>'lengthMin','')::numeric;
  v_len_max := NULLIF(v_filter->>'lengthMax','')::numeric;
  v_canadian := COALESCE((v_filter->>'canadianOnly')::boolean, false);

  WITH rows AS (
    SELECT
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END AS stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
      FLOOR(COALESCE(p.carats,0) * 2) / 2 AS carat_bucket
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0) = 0 OR (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,'')) = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0) = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0) = 0 OR UPPER(COALESCE(p.cut,'')) = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0) = 0 OR UPPER(COALESCE(p.pol,'')) = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0) = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0) = 0 OR UPPER(COALESCE(p.flo,'')) = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0) = 0 OR UPPER(COALESCE(p.lab,'')) = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (COALESCE(array_length(v_carat_ranges,1),0) = 0 OR (FLOOR(COALESCE(p.carats,0) * 2) / 2) = ANY(v_carat_ranges))
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
  ), shape_buckets AS (
    SELECT shape_id, jsonb_agg(carat_bucket ORDER BY carat_bucket) AS buckets
    FROM (SELECT DISTINCT shape_id, carat_bucket FROM rows) d
    GROUP BY shape_id
  )
  SELECT jsonb_build_object(
    'isConfirmed', true,
    'shapes', COALESCE((SELECT jsonb_agg(shape_id ORDER BY shape_id) FROM (SELECT DISTINCT shape_id FROM rows) s), '[]'::jsonb),
    'stoneTypes', COALESCE((SELECT jsonb_agg(stone_type ORDER BY stone_type) FROM (SELECT DISTINCT stone_type FROM rows) s), '[]'::jsonb),
    'caratBuckets', COALESCE((SELECT jsonb_agg(carat_bucket ORDER BY carat_bucket) FROM (SELECT DISTINCT carat_bucket FROM rows) c), '[]'::jsonb),
    'shapeCaratBuckets', COALESCE((SELECT jsonb_object_agg(shape_id, buckets) FROM shape_buckets), '{}'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

-- get_diamond_presets_filtered: respect caratRanges
CREATE OR REPLACE FUNCTION public.get_diamond_presets_filtered(p_client_id uuid, p_stone_type text DEFAULT NULL::text, p_shape_id text DEFAULT NULL::text, p_color text DEFAULT NULL::text, p_clarity text DEFAULT NULL::text, p_carat_range text DEFAULT NULL::text, p_page_size integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, stone_type text, shape_id text, carat_range text, carat_value numeric, color text, clarity text, base_price numeric, custom_price numeric, is_enabled boolean, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_filter_row public.client_diamond_catalog_filter%ROWTYPE;
  v_filter jsonb;
  v_stone text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts text[]; v_pol text[]; v_symm text[]; v_flo text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric;
  v_carat_ranges numeric[];
  v_len_min numeric; v_len_max numeric; v_canadian boolean;
BEGIN
  SELECT * INTO v_filter_row
  FROM public.client_diamond_catalog_filter
  WHERE client_id = p_client_id AND is_confirmed = true;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      cdp.id, cdp.stone_type, cdp.shape_id, cdp.carat_range, cdp.carat_value,
      cdp.color, cdp.clarity, cdp.base_price, cdp.custom_price, cdp.is_enabled,
      COUNT(*) OVER ()::bigint AS total_count
    FROM public.client_diamond_presets cdp
    WHERE cdp.client_id = p_client_id
      AND cdp.is_enabled = true
      AND (p_stone_type  IS NULL OR cdp.stone_type  = LOWER(p_stone_type))
      AND (p_shape_id    IS NULL OR cdp.shape_id    = LOWER(p_shape_id))
      AND (p_color       IS NULL OR UPPER(cdp.color) = UPPER(p_color))
      AND (p_clarity     IS NULL OR UPPER(cdp.clarity) = UPPER(p_clarity))
      AND (p_carat_range IS NULL OR cdp.carat_range = p_carat_range)
    ORDER BY cdp.stone_type, cdp.shape_id, cdp.carat_value, cdp.color, cdp.clarity
    LIMIT p_page_size OFFSET p_offset;
    RETURN;
  END IF;

  v_filter := COALESCE(v_filter_row.filter, '{}'::jsonb);
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'shapes'))) INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'colors'))) INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'clarities'))) INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'cuts'))) INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'polish'))) INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'symmetry'))) INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'labs'))) INTO v_labs;
  v_carat_min := NULLIF(v_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(v_filter->>'caratMax','')::numeric;
  SELECT ARRAY(SELECT (jsonb_array_elements_text(v_filter->'caratRanges'))::numeric) INTO v_carat_ranges;
  v_len_min := NULLIF(v_filter->>'lengthMin','')::numeric;
  v_len_max := NULLIF(v_filter->>'lengthMax','')::numeric;
  v_canadian := COALESCE((v_filter->>'canadianOnly')::boolean, false);

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id,
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END AS diamond_stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS diamond_shape_id,
      p.carats AS diamond_carat_value,
      UPPER(COALESCE(p.col,'')) AS diamond_color,
      UPPER(COALESCE(p.clar,'')) AS diamond_clarity,
      ROUND(
        COALESCE(p.price,0) *
        (1 + (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN v_filter_row.markup_lab ELSE v_filter_row.markup_natural END) / 100.0)
      , 2) AS diamond_base_price,
      FLOOR(COALESCE(p.carats,0) * 2) / 2 AS diamond_carat_bucket
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0) = 0 OR (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,'')) = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0) = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0) = 0 OR UPPER(COALESCE(p.cut,'')) = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0) = 0 OR UPPER(COALESCE(p.pol,'')) = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0) = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0) = 0 OR UPPER(COALESCE(p.flo,'')) = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0) = 0 OR UPPER(COALESCE(p.lab,'')) = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (COALESCE(array_length(v_carat_ranges,1),0) = 0 OR (FLOOR(COALESCE(p.carats,0) * 2) / 2) = ANY(v_carat_ranges))
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
  ), filtered AS (
    SELECT * FROM base b
    WHERE (p_stone_type IS NULL OR b.diamond_stone_type = LOWER(p_stone_type))
      AND (p_shape_id IS NULL OR b.diamond_shape_id = LOWER(p_shape_id))
      AND (p_color IS NULL OR b.diamond_color = UPPER(p_color))
      AND (p_clarity IS NULL OR b.diamond_clarity = UPPER(p_clarity))
  ), ranged AS (
    SELECT
      f.*,
      TRIM(TO_CHAR(f.diamond_carat_bucket, 'FM0.00')) || '-' || TRIM(TO_CHAR(f.diamond_carat_bucket + 0.49, 'FM0.00')) AS diamond_carat_range
    FROM filtered f
  )
  SELECT
    r.id,
    r.diamond_stone_type AS stone_type,
    r.diamond_shape_id AS shape_id,
    r.diamond_carat_range AS carat_range,
    r.diamond_carat_value AS carat_value,
    r.diamond_color AS color,
    r.diamond_clarity AS clarity,
    r.diamond_base_price AS base_price,
    NULL::numeric AS custom_price,
    true AS is_enabled,
    COUNT(*) OVER ()::bigint AS total_count
  FROM ranged r
  WHERE (p_carat_range IS NULL OR r.diamond_carat_range = p_carat_range)
  ORDER BY r.diamond_stone_type, r.diamond_shape_id, r.diamond_carat_value, r.diamond_color, r.diamond_clarity
  LIMIT p_page_size OFFSET p_offset;
END;
$function$
```

---

## `supabase/migrations/20260525152107_032e4265-d4f4-4ce8-9bfa-b4275147b742.sql`

```sql
CREATE OR REPLACE FUNCTION public.get_diamond_pool_preview(p_filter jsonb, p_markup_natural numeric DEFAULT 0, p_markup_lab numeric DEFAULT 0, p_page_size integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, stone_type text, shape_id text, carat_range text, carat_value numeric, color text, clarity text, base_price numeric, custom_price numeric, is_enabled boolean, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stone text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts text[]; v_pol text[]; v_symm text[]; v_flo text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric;
  v_carat_ranges numeric[];
  v_len_min numeric; v_len_max numeric; v_canadian boolean;
BEGIN
  IF p_filter IS NULL THEN p_filter := '{}'::jsonb; END IF;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(p_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(p_filter->'shapes')))     INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'colors')))     INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'clarities')))  INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'cuts')))       INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'polish')))     INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'symmetry')))   INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'labs')))       INTO v_labs;
  v_carat_min := NULLIF(p_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(p_filter->>'caratMax','')::numeric;
  SELECT ARRAY(SELECT (jsonb_array_elements_text(p_filter->'caratRanges'))::numeric) INTO v_carat_ranges;
  v_len_min   := NULLIF(p_filter->>'lengthMin','')::numeric;
  v_len_max   := NULLIF(p_filter->>'lengthMax','')::numeric;
  v_canadian  := COALESCE((p_filter->>'canadianOnly')::boolean, false);

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id,
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END AS stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
      p.carats AS carat_value,
      UPPER(COALESCE(p.col,'')) AS color,
      UPPER(COALESCE(p.clar,'')) AS clarity,
      ROUND(
        COALESCE(p.price,0) *
        (1 + (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN p_markup_lab ELSE p_markup_natural END) / 100.0)
      , 2) AS base_price,
      FLOOR(COALESCE(p.carats,0) * 2) / 2 AS carat_bucket
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0) = 0 OR (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,'')) = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0) = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0) = 0 OR UPPER(COALESCE(p.cut,'')) = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0) = 0 OR UPPER(COALESCE(p.pol,'')) = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0) = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0) = 0 OR UPPER(COALESCE(p.flo,'')) = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0) = 0 OR UPPER(COALESCE(p.lab,'')) = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (COALESCE(array_length(v_carat_ranges,1),0) = 0 OR (FLOOR(COALESCE(p.carats,0) * 2) / 2) = ANY(v_carat_ranges))
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
  )
  SELECT
    b.id, b.stone_type, b.shape_id,
    TRIM(TO_CHAR(b.carat_bucket, 'FM0.00')) || '-' || TRIM(TO_CHAR(b.carat_bucket + 0.49, 'FM0.00')) AS carat_range,
    b.carat_value, b.color, b.clarity, b.base_price,
    NULL::numeric AS custom_price, true AS is_enabled,
    COUNT(*) OVER ()::bigint AS total_count
  FROM base b
  ORDER BY b.stone_type, b.shape_id, b.carat_value, b.color, b.clarity
  LIMIT p_page_size OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_client_diamond_catalog_availability(p_client_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_filter_row public.client_diamond_catalog_filter%ROWTYPE;
  v_filter jsonb;
  v_stone text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts text[]; v_pol text[]; v_symm text[]; v_flo text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric;
  v_carat_ranges numeric[];
  v_len_min numeric; v_len_max numeric; v_canadian boolean;
  v_result jsonb;
BEGIN
  SELECT * INTO v_filter_row
  FROM public.client_diamond_catalog_filter
  WHERE client_id = p_client_id AND is_confirmed = true;

  IF NOT FOUND THEN
    WITH rows AS (
      SELECT shape_id, stone_type, FLOOR(carat_value * 2) / 2 AS carat_bucket
      FROM public.client_diamond_presets
      WHERE client_id = p_client_id AND is_enabled = true
    ), shape_buckets AS (
      SELECT shape_id, jsonb_agg(carat_bucket ORDER BY carat_bucket) AS buckets
      FROM (SELECT DISTINCT shape_id, carat_bucket FROM rows) d
      GROUP BY shape_id
    )
    SELECT jsonb_build_object(
      'isConfirmed', false,
      'shapes', COALESCE((SELECT jsonb_agg(shape_id ORDER BY shape_id) FROM (SELECT DISTINCT shape_id FROM rows) s), '[]'::jsonb),
      'stoneTypes', COALESCE((SELECT jsonb_agg(stone_type ORDER BY stone_type) FROM (SELECT DISTINCT stone_type FROM rows) s), '[]'::jsonb),
      'caratBuckets', COALESCE((SELECT jsonb_agg(carat_bucket ORDER BY carat_bucket) FROM (SELECT DISTINCT carat_bucket FROM rows) c), '[]'::jsonb),
      'shapeCaratBuckets', COALESCE((SELECT jsonb_object_agg(shape_id, buckets) FROM shape_buckets), '{}'::jsonb)
    ) INTO v_result;
    RETURN v_result;
  END IF;

  v_filter := COALESCE(v_filter_row.filter, '{}'::jsonb);
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'shapes'))) INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'colors'))) INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'clarities'))) INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'cuts'))) INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'polish'))) INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'symmetry'))) INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'labs'))) INTO v_labs;
  v_carat_min := NULLIF(v_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(v_filter->>'caratMax','')::numeric;
  SELECT ARRAY(SELECT (jsonb_array_elements_text(v_filter->'caratRanges'))::numeric) INTO v_carat_ranges;
  v_len_min := NULLIF(v_filter->>'lengthMin','')::numeric;
  v_len_max := NULLIF(v_filter->>'lengthMax','')::numeric;
  v_canadian := COALESCE((v_filter->>'canadianOnly')::boolean, false);

  WITH rows AS (
    SELECT
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END AS stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
      FLOOR(COALESCE(p.carats,0) * 2) / 2 AS carat_bucket
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0) = 0 OR (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,'')) = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0) = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0) = 0 OR UPPER(COALESCE(p.cut,'')) = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0) = 0 OR UPPER(COALESCE(p.pol,'')) = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0) = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0) = 0 OR UPPER(COALESCE(p.flo,'')) = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0) = 0 OR UPPER(COALESCE(p.lab,'')) = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (COALESCE(array_length(v_carat_ranges,1),0) = 0 OR (FLOOR(COALESCE(p.carats,0) * 2) / 2) = ANY(v_carat_ranges))
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
  ), shape_buckets AS (
    SELECT shape_id, jsonb_agg(carat_bucket ORDER BY carat_bucket) AS buckets
    FROM (SELECT DISTINCT shape_id, carat_bucket FROM rows) d
    GROUP BY shape_id
  )
  SELECT jsonb_build_object(
    'isConfirmed', true,
    'shapes', COALESCE((SELECT jsonb_agg(shape_id ORDER BY shape_id) FROM (SELECT DISTINCT shape_id FROM rows) s), '[]'::jsonb),
    'stoneTypes', COALESCE((SELECT jsonb_agg(stone_type ORDER BY stone_type) FROM (SELECT DISTINCT stone_type FROM rows) s), '[]'::jsonb),
    'caratBuckets', COALESCE((SELECT jsonb_agg(carat_bucket ORDER BY carat_bucket) FROM (SELECT DISTINCT carat_bucket FROM rows) c), '[]'::jsonb),
    'shapeCaratBuckets', COALESCE((SELECT jsonb_object_agg(shape_id, buckets) FROM shape_buckets), '{}'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_diamond_presets_filtered(p_client_id uuid, p_stone_type text DEFAULT NULL::text, p_shape_id text DEFAULT NULL::text, p_color text DEFAULT NULL::text, p_clarity text DEFAULT NULL::text, p_carat_range text DEFAULT NULL::text, p_page_size integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, stone_type text, shape_id text, carat_range text, carat_value numeric, color text, clarity text, base_price numeric, custom_price numeric, is_enabled boolean, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_filter_row public.client_diamond_catalog_filter%ROWTYPE;
  v_filter jsonb;
  v_stone text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts text[]; v_pol text[]; v_symm text[]; v_flo text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric;
  v_carat_ranges numeric[];
  v_len_min numeric; v_len_max numeric; v_canadian boolean;
BEGIN
  SELECT * INTO v_filter_row
  FROM public.client_diamond_catalog_filter
  WHERE client_id = p_client_id AND is_confirmed = true;

  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      cdp.id, cdp.stone_type, cdp.shape_id, cdp.carat_range, cdp.carat_value,
      cdp.color, cdp.clarity, cdp.base_price, cdp.custom_price, cdp.is_enabled,
      COUNT(*) OVER ()::bigint AS total_count
    FROM public.client_diamond_presets cdp
    WHERE cdp.client_id = p_client_id
      AND cdp.is_enabled = true
      AND (p_stone_type  IS NULL OR cdp.stone_type  = LOWER(p_stone_type))
      AND (p_shape_id    IS NULL OR cdp.shape_id    = LOWER(p_shape_id))
      AND (p_color       IS NULL OR UPPER(cdp.color) = UPPER(p_color))
      AND (p_clarity     IS NULL OR UPPER(cdp.clarity) = UPPER(p_clarity))
      AND (p_carat_range IS NULL OR cdp.carat_range = p_carat_range)
    ORDER BY cdp.stone_type, cdp.shape_id, cdp.carat_value, cdp.color, cdp.clarity
    LIMIT p_page_size OFFSET p_offset;
    RETURN;
  END IF;

  v_filter := COALESCE(v_filter_row.filter, '{}'::jsonb);
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'shapes'))) INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'colors'))) INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'clarities'))) INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'cuts'))) INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'polish'))) INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'symmetry'))) INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'labs'))) INTO v_labs;
  v_carat_min := NULLIF(v_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(v_filter->>'caratMax','')::numeric;
  SELECT ARRAY(SELECT (jsonb_array_elements_text(v_filter->'caratRanges'))::numeric) INTO v_carat_ranges;
  v_len_min := NULLIF(v_filter->>'lengthMin','')::numeric;
  v_len_max := NULLIF(v_filter->>'lengthMax','')::numeric;
  v_canadian := COALESCE((v_filter->>'canadianOnly')::boolean, false);

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id,
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END AS diamond_stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS diamond_shape_id,
      p.carats AS diamond_carat_value,
      UPPER(COALESCE(p.col,'')) AS diamond_color,
      UPPER(COALESCE(p.clar,'')) AS diamond_clarity,
      ROUND(
        COALESCE(p.price,0) *
        (1 + (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN v_filter_row.markup_lab ELSE v_filter_row.markup_natural END) / 100.0)
      , 2) AS diamond_base_price,
      FLOOR(COALESCE(p.carats,0) * 2) / 2 AS diamond_carat_bucket
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0) = 0 OR (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,'')) = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0) = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0) = 0 OR UPPER(COALESCE(p.cut,'')) = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0) = 0 OR UPPER(COALESCE(p.pol,'')) = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0) = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0) = 0 OR UPPER(COALESCE(p.flo,'')) = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0) = 0 OR UPPER(COALESCE(p.lab,'')) = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (COALESCE(array_length(v_carat_ranges,1),0) = 0 OR (FLOOR(COALESCE(p.carats,0) * 2) / 2) = ANY(v_carat_ranges))
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
  ), filtered AS (
    SELECT * FROM base b
    WHERE (p_stone_type IS NULL OR b.diamond_stone_type = LOWER(p_stone_type))
      AND (p_shape_id IS NULL OR b.diamond_shape_id = LOWER(p_shape_id))
      AND (p_color IS NULL OR b.diamond_color = UPPER(p_color))
      AND (p_clarity IS NULL OR b.diamond_clarity = UPPER(p_clarity))
  ), ranged AS (
    SELECT
      f.*,
      TRIM(TO_CHAR(f.diamond_carat_bucket, 'FM0.00')) || '-' || TRIM(TO_CHAR(f.diamond_carat_bucket + 0.49, 'FM0.00')) AS diamond_carat_range
    FROM filtered f
  )
  SELECT
    r.id,
    r.diamond_stone_type AS stone_type,
    r.diamond_shape_id AS shape_id,
    r.diamond_carat_range AS carat_range,
    r.diamond_carat_value AS carat_value,
    r.diamond_color AS color,
    r.diamond_clarity AS clarity,
    r.diamond_base_price AS base_price,
    NULL::numeric AS custom_price,
    true AS is_enabled,
    COUNT(*) OVER ()::bigint AS total_count
  FROM ranged r
  WHERE (p_carat_range IS NULL OR r.diamond_carat_range = p_carat_range)
  ORDER BY r.diamond_stone_type, r.diamond_shape_id, r.diamond_carat_value, r.diamond_color, r.diamond_clarity
  LIMIT p_page_size OFFSET p_offset;
END;
$function$;
```

---

## `supabase/migrations/20260526184801_5bb2e357-aa69-496d-8ba8-530a3f3ff2d1.sql`

```sql
CREATE OR REPLACE FUNCTION public.get_diamond_presets_filtered(
  p_client_id   uuid,
  p_stone_type  text    DEFAULT NULL::text,
  p_shape_id    text    DEFAULT NULL::text,
  p_color       text    DEFAULT NULL::text,
  p_clarity     text    DEFAULT NULL::text,
  p_carat_range text    DEFAULT NULL::text,
  p_page_size   integer DEFAULT 50,
  p_offset      integer DEFAULT 0
)
RETURNS TABLE(
  id           uuid,
  stone_type   text,
  shape_id     text,
  carat_range  text,
  carat_value  numeric,
  color        text,
  clarity      text,
  base_price   numeric,
  custom_price numeric,
  is_enabled   boolean,
  total_count  bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_filter_row public.client_diamond_catalog_filter%ROWTYPE;
  v_filter     jsonb;
  v_stone  text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts   text[]; v_pol    text[]; v_symm   text[]; v_flo  text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric;
  v_carat_ranges numeric[];
  v_len_min numeric; v_len_max numeric; v_canadian boolean;
BEGIN
  SELECT * INTO v_filter_row
  FROM public.client_diamond_catalog_filter
  WHERE client_id = p_client_id AND is_confirmed = true;

  IF NOT FOUND THEN
    RETURN QUERY
    WITH raw AS (
      SELECT
        cdp.id, cdp.stone_type, cdp.shape_id, cdp.carat_range, cdp.carat_value,
        cdp.color, cdp.clarity, cdp.base_price, cdp.custom_price, cdp.is_enabled
      FROM public.client_diamond_presets cdp
      WHERE cdp.client_id = p_client_id
        AND cdp.is_enabled = true
        AND (p_stone_type  IS NULL OR cdp.stone_type        = LOWER(p_stone_type))
        AND (p_shape_id    IS NULL OR cdp.shape_id          = LOWER(p_shape_id))
        AND (p_color       IS NULL OR UPPER(cdp.color)      = UPPER(p_color))
        AND (p_clarity     IS NULL OR UPPER(cdp.clarity)    = UPPER(p_clarity))
        AND (p_carat_range IS NULL OR cdp.carat_range       = p_carat_range)
    ),
    deduped AS (
      SELECT DISTINCT ON (r.stone_type, r.shape_id, r.carat_range, r.color, r.clarity)
        r.*
      FROM raw r
      ORDER BY r.stone_type, r.shape_id, r.carat_range, r.color, r.clarity,
               COALESCE(r.custom_price, r.base_price) DESC
    )
    SELECT
      d.id, d.stone_type, d.shape_id, d.carat_range, d.carat_value,
      d.color, d.clarity, d.base_price, d.custom_price, d.is_enabled,
      COUNT(*) OVER ()::bigint AS total_count
    FROM deduped d
    ORDER BY d.stone_type, COALESCE(d.custom_price, d.base_price) DESC, d.color, d.clarity
    LIMIT p_page_size OFFSET p_offset;
    RETURN;
  END IF;

  v_filter := COALESCE(v_filter_row.filter, '{}'::jsonb);
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'shapes')))     INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'colors')))     INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'clarities')))  INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'cuts')))       INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'polish')))     INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'symmetry')))   INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'labs')))       INTO v_labs;
  v_carat_min    := NULLIF(v_filter->>'caratMin','')::numeric;
  v_carat_max    := NULLIF(v_filter->>'caratMax','')::numeric;
  SELECT ARRAY(SELECT (jsonb_array_elements_text(v_filter->'caratRanges'))::numeric) INTO v_carat_ranges;
  v_len_min      := NULLIF(v_filter->>'lengthMin','')::numeric;
  v_len_max      := NULLIF(v_filter->>'lengthMax','')::numeric;
  v_canadian     := COALESCE((v_filter->>'canadianOnly')::boolean, false);

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id,
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END          AS diamond_stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1))    AS diamond_shape_id,
      p.carats                                                                         AS diamond_carat_value,
      UPPER(COALESCE(p.col,''))                                                        AS diamond_color,
      UPPER(COALESCE(p.clar,''))                                                       AS diamond_clarity,
      ROUND(
        COALESCE(p.price,0) *
        (1 + (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%'
                   THEN v_filter_row.markup_lab
                   ELSE v_filter_row.markup_natural END) / 100.0)
      , 2)                                                                             AS diamond_base_price,
      FLOOR(COALESCE(p.carats,0) * 2) / 2                                             AS diamond_carat_bucket
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0)  = 0 OR (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,''))  = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0)   = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0)   = 0 OR UPPER(COALESCE(p.cut,''))  = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0)    = 0 OR UPPER(COALESCE(p.pol,''))  = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0)   = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0)    = 0 OR UPPER(COALESCE(p.flo,''))  = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0)   = 0 OR UPPER(COALESCE(p.lab,''))  = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (COALESCE(array_length(v_carat_ranges,1),0) = 0 OR (FLOOR(COALESCE(p.carats,0) * 2) / 2) = ANY(v_carat_ranges))
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
  ),
  filtered AS (
    SELECT * FROM base b
    WHERE (p_stone_type IS NULL OR b.diamond_stone_type = LOWER(p_stone_type))
      AND (p_shape_id   IS NULL OR b.diamond_shape_id   = LOWER(p_shape_id))
      AND (p_color      IS NULL OR b.diamond_color       = UPPER(p_color))
      AND (p_clarity    IS NULL OR b.diamond_clarity     = UPPER(p_clarity))
  ),
  ranged AS (
    SELECT
      f.*,
      TRIM(TO_CHAR(f.diamond_carat_bucket, 'FM0.00')) || '-' || TRIM(TO_CHAR(f.diamond_carat_bucket + 0.49, 'FM0.00')) AS diamond_carat_range
    FROM filtered f
  ),
  deduped AS (
    SELECT DISTINCT ON (r.diamond_stone_type, r.diamond_shape_id, r.diamond_carat_range, r.diamond_color, r.diamond_clarity)
      r.id,
      r.diamond_stone_type,
      r.diamond_shape_id,
      r.diamond_carat_range,
      r.diamond_carat_value,
      r.diamond_color,
      r.diamond_clarity,
      r.diamond_base_price
    FROM ranged r
    WHERE (p_carat_range IS NULL OR r.diamond_carat_range = p_carat_range)
    ORDER BY r.diamond_stone_type, r.diamond_shape_id, r.diamond_carat_range,
             r.diamond_color, r.diamond_clarity, r.diamond_base_price DESC
  )
  SELECT
    d.id,
    d.diamond_stone_type  AS stone_type,
    d.diamond_shape_id    AS shape_id,
    d.diamond_carat_range AS carat_range,
    d.diamond_carat_value AS carat_value,
    d.diamond_color       AS color,
    d.diamond_clarity     AS clarity,
    d.diamond_base_price  AS base_price,
    NULL::numeric         AS custom_price,
    true                  AS is_enabled,
    COUNT(*) OVER ()::bigint AS total_count
  FROM deduped d
  ORDER BY d.diamond_stone_type, d.diamond_base_price DESC, d.diamond_color, d.diamond_clarity
  LIMIT p_page_size OFFSET p_offset;
END;
$function$;
```

---

## `supabase/migrations/20260526204215_e9b761aa-7cf2-4da0-8c0e-d43682f37a88.sql`

```sql

-- Performance + correctness fix for diamond pool preview (now 880k+ rows)

-- 1. Functional indexes to support the predicates used by the RPC.
CREATE INDEX IF NOT EXISTS idx_diamond_pool_lg_lower
  ON public.diamond_inventory_pool (lower(lg));

CREATE INDEX IF NOT EXISTS idx_diamond_pool_shape_token
  ON public.diamond_inventory_pool (lower(split_part(regexp_replace(coalesce(shape,''),'\s+',' ','g'),' ',1)));

CREATE INDEX IF NOT EXISTS idx_diamond_pool_col_upper
  ON public.diamond_inventory_pool (upper(col));

CREATE INDEX IF NOT EXISTS idx_diamond_pool_clar_upper
  ON public.diamond_inventory_pool (upper(clar));

-- 2. Replace the preview function:
--    * Correct stone_type mapping (lg = 'lab' | 'natural', not 'Y%').
--    * Compute count and data separately so an unfiltered query doesn't
--      have to materialise+sort all 880k rows just to populate
--      COUNT(*) OVER ().
--    * Keep the same return shape so the client code is unchanged.
CREATE OR REPLACE FUNCTION public.get_diamond_pool_preview(
  p_filter jsonb,
  p_markup_natural numeric DEFAULT 0,
  p_markup_lab numeric DEFAULT 0,
  p_page_size integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  stone_type text,
  shape_id text,
  carat_range text,
  carat_value numeric,
  color text,
  clarity text,
  base_price numeric,
  custom_price numeric,
  is_enabled boolean,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stone text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts text[]; v_pol text[]; v_symm text[]; v_flo text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric;
  v_carat_ranges numeric[];
  v_len_min numeric; v_len_max numeric; v_canadian boolean;
  v_total bigint;
BEGIN
  IF p_filter IS NULL THEN p_filter := '{}'::jsonb; END IF;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(p_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(p_filter->'shapes')))     INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'colors')))     INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'clarities')))  INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'cuts')))       INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'polish')))     INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'symmetry')))   INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'labs')))       INTO v_labs;
  v_carat_min := NULLIF(p_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(p_filter->>'caratMax','')::numeric;
  SELECT ARRAY(SELECT (jsonb_array_elements_text(p_filter->'caratRanges'))::numeric) INTO v_carat_ranges;
  v_len_min   := NULLIF(p_filter->>'lengthMin','')::numeric;
  v_len_max   := NULLIF(p_filter->>'lengthMax','')::numeric;
  v_canadian  := COALESCE((p_filter->>'canadianOnly')::boolean, false);

  -- Single CTE expressing every predicate, reused for count + page.
  RETURN QUERY
  WITH filtered AS (
    SELECT
      p.id,
      CASE WHEN LOWER(COALESCE(p.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END AS stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
      p.carats AS carat_value,
      UPPER(COALESCE(p.col,'')) AS color,
      UPPER(COALESCE(p.clar,'')) AS clarity,
      ROUND(
        COALESCE(p.price,0) *
        (1 + (CASE WHEN LOWER(COALESCE(p.lg,'')) = 'lab' THEN p_markup_lab ELSE p_markup_natural END) / 100.0)
      , 2) AS base_price,
      FLOOR(COALESCE(p.carats,0) * 2) / 2 AS carat_bucket
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0) = 0 OR (CASE WHEN LOWER(COALESCE(p.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,'')) = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0)   = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0)   = 0 OR UPPER(COALESCE(p.cut,''))  = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0)    = 0 OR UPPER(COALESCE(p.pol,''))  = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0)   = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0)    = 0 OR UPPER(COALESCE(p.flo,''))  = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0)   = 0 OR UPPER(COALESCE(p.lab,''))  = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (COALESCE(array_length(v_carat_ranges,1),0) = 0 OR (FLOOR(COALESCE(p.carats,0) * 2) / 2) = ANY(v_carat_ranges))
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
  ),
  cnt AS (
    SELECT COUNT(*)::bigint AS c FROM filtered
  )
  SELECT
    f.id,
    f.stone_type,
    f.shape_id,
    TRIM(TO_CHAR(f.carat_bucket, 'FM0.00')) || '-' || TRIM(TO_CHAR(f.carat_bucket + 0.49, 'FM0.00')) AS carat_range,
    f.carat_value,
    f.color,
    f.clarity,
    f.base_price,
    NULL::numeric AS custom_price,
    true          AS is_enabled,
    (SELECT c FROM cnt) AS total_count
  FROM filtered f
  ORDER BY f.id
  LIMIT p_page_size OFFSET p_offset;
END;
$function$;

ANALYZE public.diamond_inventory_pool;

```

---

## `supabase/migrations/20260526204317_e5f7aac8-44b1-4849-90c0-c6ccde7fe49f.sql`

```sql

CREATE OR REPLACE FUNCTION public.get_diamond_pool_preview(
  p_filter jsonb,
  p_markup_natural numeric DEFAULT 0,
  p_markup_lab numeric DEFAULT 0,
  p_page_size integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  stone_type text,
  shape_id text,
  carat_range text,
  carat_value numeric,
  color text,
  clarity text,
  base_price numeric,
  custom_price numeric,
  is_enabled boolean,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stone text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts text[]; v_pol text[]; v_symm text[]; v_flo text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric;
  v_carat_ranges numeric[];
  v_len_min numeric; v_len_max numeric; v_canadian boolean;
  v_total bigint;
BEGIN
  IF p_filter IS NULL THEN p_filter := '{}'::jsonb; END IF;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(p_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(p_filter->'shapes')))     INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'colors')))     INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'clarities')))  INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'cuts')))       INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'polish')))     INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'symmetry')))   INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'labs')))       INTO v_labs;
  v_carat_min := NULLIF(p_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(p_filter->>'caratMax','')::numeric;
  SELECT ARRAY(SELECT (jsonb_array_elements_text(p_filter->'caratRanges'))::numeric) INTO v_carat_ranges;
  v_len_min   := NULLIF(p_filter->>'lengthMin','')::numeric;
  v_len_max   := NULLIF(p_filter->>'lengthMax','')::numeric;
  v_canadian  := COALESCE((p_filter->>'canadianOnly')::boolean, false);

  -- Fast path: when no filters are applied, use the table's planner estimate
  -- for the count and skip the COUNT(*) entirely.
  IF COALESCE(array_length(v_stone,1),0) = 0
     AND COALESCE(array_length(v_shapes,1),0) = 0
     AND COALESCE(array_length(v_colors,1),0) = 0
     AND COALESCE(array_length(v_clar,1),0) = 0
     AND COALESCE(array_length(v_cuts,1),0) = 0
     AND COALESCE(array_length(v_pol,1),0) = 0
     AND COALESCE(array_length(v_symm,1),0) = 0
     AND COALESCE(array_length(v_flo,1),0) = 0
     AND COALESCE(array_length(v_labs,1),0) = 0
     AND v_carat_min IS NULL AND v_carat_max IS NULL
     AND COALESCE(array_length(v_carat_ranges,1),0) = 0
     AND v_len_min IS NULL AND v_len_max IS NULL
     AND NOT v_canadian THEN
    SELECT COUNT(*)::bigint INTO v_total FROM public.diamond_inventory_pool;
  ELSE
    SELECT COUNT(*)::bigint INTO v_total
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0) = 0 OR (CASE WHEN LOWER(COALESCE(p.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,'')) = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0)   = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0)   = 0 OR UPPER(COALESCE(p.cut,''))  = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0)    = 0 OR UPPER(COALESCE(p.pol,''))  = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0)   = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0)    = 0 OR UPPER(COALESCE(p.flo,''))  = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0)   = 0 OR UPPER(COALESCE(p.lab,''))  = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (COALESCE(array_length(v_carat_ranges,1),0) = 0 OR (FLOOR(COALESCE(p.carats,0) * 2) / 2) = ANY(v_carat_ranges))
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false));
  END IF;

  -- Page query: filter -> order -> limit BEFORE computing display expressions
  RETURN QUERY
  WITH page AS (
    SELECT p.*
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0) = 0 OR (CASE WHEN LOWER(COALESCE(p.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,'')) = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0)   = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0)   = 0 OR UPPER(COALESCE(p.cut,''))  = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0)    = 0 OR UPPER(COALESCE(p.pol,''))  = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0)   = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0)    = 0 OR UPPER(COALESCE(p.flo,''))  = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0)   = 0 OR UPPER(COALESCE(p.lab,''))  = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (COALESCE(array_length(v_carat_ranges,1),0) = 0 OR (FLOOR(COALESCE(p.carats,0) * 2) / 2) = ANY(v_carat_ranges))
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
    ORDER BY p.id
    LIMIT p_page_size OFFSET p_offset
  )
  SELECT
    pg.id,
    CASE WHEN LOWER(COALESCE(pg.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END                                     AS stone_type,
    LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(pg.shape,''),'\s+',' ','g'),' ',1))                                  AS shape_id,
    TRIM(TO_CHAR(FLOOR(COALESCE(pg.carats,0) * 2) / 2, 'FM0.00')) || '-' ||
      TRIM(TO_CHAR(FLOOR(COALESCE(pg.carats,0) * 2) / 2 + 0.49, 'FM0.00'))                                        AS carat_range,
    pg.carats                                                                                                     AS carat_value,
    UPPER(COALESCE(pg.col,''))                                                                                    AS color,
    UPPER(COALESCE(pg.clar,''))                                                                                   AS clarity,
    ROUND(
      COALESCE(pg.price,0) *
      (1 + (CASE WHEN LOWER(COALESCE(pg.lg,'')) = 'lab' THEN p_markup_lab ELSE p_markup_natural END) / 100.0)
    , 2)                                                                                                          AS base_price,
    NULL::numeric AS custom_price,
    true          AS is_enabled,
    v_total       AS total_count
  FROM page pg;
END;
$function$;

```

---

## `supabase/migrations/20260526204425_fe305321-1cc2-4c4f-bdf2-0f5b3af2d364.sql`

```sql

CREATE OR REPLACE FUNCTION public.get_diamond_pool_preview(
  p_filter jsonb,
  p_markup_natural numeric DEFAULT 0,
  p_markup_lab numeric DEFAULT 0,
  p_page_size integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  stone_type text,
  shape_id text,
  carat_range text,
  carat_value numeric,
  color text,
  clarity text,
  base_price numeric,
  custom_price numeric,
  is_enabled boolean,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stone text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts text[]; v_pol text[]; v_symm text[]; v_flo text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric;
  v_carat_ranges numeric[];
  v_len_min numeric; v_len_max numeric; v_canadian boolean;
  v_total bigint;
  v_no_filter boolean;
BEGIN
  IF p_filter IS NULL THEN p_filter := '{}'::jsonb; END IF;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(p_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(p_filter->'shapes')))     INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'colors')))     INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'clarities')))  INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'cuts')))       INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'polish')))     INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'symmetry')))   INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'labs')))       INTO v_labs;
  v_carat_min := NULLIF(p_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(p_filter->>'caratMax','')::numeric;
  SELECT ARRAY(SELECT (jsonb_array_elements_text(p_filter->'caratRanges'))::numeric) INTO v_carat_ranges;
  v_len_min   := NULLIF(p_filter->>'lengthMin','')::numeric;
  v_len_max   := NULLIF(p_filter->>'lengthMax','')::numeric;
  v_canadian  := COALESCE((p_filter->>'canadianOnly')::boolean, false);

  v_no_filter := COALESCE(array_length(v_stone,1),0) = 0
     AND COALESCE(array_length(v_shapes,1),0) = 0
     AND COALESCE(array_length(v_colors,1),0) = 0
     AND COALESCE(array_length(v_clar,1),0) = 0
     AND COALESCE(array_length(v_cuts,1),0) = 0
     AND COALESCE(array_length(v_pol,1),0) = 0
     AND COALESCE(array_length(v_symm,1),0) = 0
     AND COALESCE(array_length(v_flo,1),0) = 0
     AND COALESCE(array_length(v_labs,1),0) = 0
     AND v_carat_min IS NULL AND v_carat_max IS NULL
     AND COALESCE(array_length(v_carat_ranges,1),0) = 0
     AND v_len_min IS NULL AND v_len_max IS NULL
     AND NOT v_canadian;

  IF v_no_filter THEN
    -- Fast path: no filters. Pull a page by primary key and use the
    -- table-wide count which is cheap (index-only scan, ~100ms).
    SELECT COUNT(*)::bigint INTO v_total FROM public.diamond_inventory_pool;

    RETURN QUERY
    SELECT
      pg.id,
      CASE WHEN LOWER(COALESCE(pg.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END AS stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(pg.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
      TRIM(TO_CHAR(FLOOR(COALESCE(pg.carats,0) * 2) / 2, 'FM0.00')) || '-' ||
        TRIM(TO_CHAR(FLOOR(COALESCE(pg.carats,0) * 2) / 2 + 0.49, 'FM0.00')) AS carat_range,
      pg.carats AS carat_value,
      UPPER(COALESCE(pg.col,'')) AS color,
      UPPER(COALESCE(pg.clar,'')) AS clarity,
      ROUND(
        COALESCE(pg.price,0) *
        (1 + (CASE WHEN LOWER(COALESCE(pg.lg,'')) = 'lab' THEN p_markup_lab ELSE p_markup_natural END) / 100.0)
      , 2) AS base_price,
      NULL::numeric AS custom_price,
      true          AS is_enabled,
      v_total       AS total_count
    FROM public.diamond_inventory_pool pg
    ORDER BY pg.id
    LIMIT p_page_size OFFSET p_offset;
    RETURN;
  END IF;

  -- Filtered path: a single CTE materialises the matching ids, then we
  -- compute the count and page rows from it. This avoids scanning the
  -- inventory twice.
  RETURN QUERY
  WITH filtered AS MATERIALIZED (
    SELECT p.id
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0) = 0 OR (CASE WHEN LOWER(COALESCE(p.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,'')) = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0)   = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0)   = 0 OR UPPER(COALESCE(p.cut,''))  = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0)    = 0 OR UPPER(COALESCE(p.pol,''))  = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0)   = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0)    = 0 OR UPPER(COALESCE(p.flo,''))  = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0)   = 0 OR UPPER(COALESCE(p.lab,''))  = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (COALESCE(array_length(v_carat_ranges,1),0) = 0 OR (FLOOR(COALESCE(p.carats,0) * 2) / 2) = ANY(v_carat_ranges))
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
  ),
  cnt AS (SELECT COUNT(*)::bigint AS c FROM filtered),
  page AS (
    SELECT id FROM filtered ORDER BY id LIMIT p_page_size OFFSET p_offset
  )
  SELECT
    pg.id,
    CASE WHEN LOWER(COALESCE(d.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END AS stone_type,
    LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(d.shape,''),'\s+',' ','g'),' ',1)) AS shape_id,
    TRIM(TO_CHAR(FLOOR(COALESCE(d.carats,0) * 2) / 2, 'FM0.00')) || '-' ||
      TRIM(TO_CHAR(FLOOR(COALESCE(d.carats,0) * 2) / 2 + 0.49, 'FM0.00')) AS carat_range,
    d.carats AS carat_value,
    UPPER(COALESCE(d.col,'')) AS color,
    UPPER(COALESCE(d.clar,'')) AS clarity,
    ROUND(
      COALESCE(d.price,0) *
      (1 + (CASE WHEN LOWER(COALESCE(d.lg,'')) = 'lab' THEN p_markup_lab ELSE p_markup_natural END) / 100.0)
    , 2) AS base_price,
    NULL::numeric AS custom_price,
    true          AS is_enabled,
    (SELECT c FROM cnt) AS total_count
  FROM page pg
  JOIN public.diamond_inventory_pool d ON d.id = pg.id
  ORDER BY pg.id;
END;
$function$;

```

---

## `supabase/migrations/20260526204502_6c6950bd-de58-4aa4-bb29-0ee8545ff8df.sql`

```sql

CREATE OR REPLACE FUNCTION public.get_diamond_pool_preview(
  p_filter jsonb,
  p_markup_natural numeric DEFAULT 0,
  p_markup_lab numeric DEFAULT 0,
  p_page_size integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  stone_type text,
  shape_id text,
  carat_range text,
  carat_value numeric,
  color text,
  clarity text,
  base_price numeric,
  custom_price numeric,
  is_enabled boolean,
  total_count bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stone text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts text[]; v_pol text[]; v_symm text[]; v_flo text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric;
  v_carat_ranges numeric[];
  v_len_min numeric; v_len_max numeric; v_canadian boolean;
  v_total bigint;
  v_no_filter boolean;
BEGIN
  IF p_filter IS NULL THEN p_filter := '{}'::jsonb; END IF;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(p_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(p_filter->'shapes')))     INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'colors')))     INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'clarities')))  INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'cuts')))       INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'polish')))     INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'symmetry')))   INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(p_filter->'labs')))       INTO v_labs;
  v_carat_min := NULLIF(p_filter->>'caratMin','')::numeric;
  v_carat_max := NULLIF(p_filter->>'caratMax','')::numeric;
  SELECT ARRAY(SELECT (jsonb_array_elements_text(p_filter->'caratRanges'))::numeric) INTO v_carat_ranges;
  v_len_min   := NULLIF(p_filter->>'lengthMin','')::numeric;
  v_len_max   := NULLIF(p_filter->>'lengthMax','')::numeric;
  v_canadian  := COALESCE((p_filter->>'canadianOnly')::boolean, false);

  v_no_filter := COALESCE(array_length(v_stone,1),0) = 0
     AND COALESCE(array_length(v_shapes,1),0) = 0
     AND COALESCE(array_length(v_colors,1),0) = 0
     AND COALESCE(array_length(v_clar,1),0) = 0
     AND COALESCE(array_length(v_cuts,1),0) = 0
     AND COALESCE(array_length(v_pol,1),0) = 0
     AND COALESCE(array_length(v_symm,1),0) = 0
     AND COALESCE(array_length(v_flo,1),0) = 0
     AND COALESCE(array_length(v_labs,1),0) = 0
     AND v_carat_min IS NULL AND v_carat_max IS NULL
     AND COALESCE(array_length(v_carat_ranges,1),0) = 0
     AND v_len_min IS NULL AND v_len_max IS NULL
     AND NOT v_canadian;

  IF v_no_filter THEN
    SELECT COUNT(*)::bigint INTO v_total FROM public.diamond_inventory_pool;

    RETURN QUERY
    SELECT
      pg.id,
      (CASE WHEN LOWER(COALESCE(pg.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END)::text,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(pg.shape,''),'\s+',' ','g'),' ',1))::text,
      (TRIM(TO_CHAR(FLOOR(COALESCE(pg.carats,0) * 2) / 2, 'FM0.00')) || '-' ||
        TRIM(TO_CHAR(FLOOR(COALESCE(pg.carats,0) * 2) / 2 + 0.49, 'FM0.00')))::text,
      pg.carats,
      UPPER(COALESCE(pg.col,''))::text,
      UPPER(COALESCE(pg.clar,''))::text,
      ROUND(
        COALESCE(pg.price,0) *
        (1 + (CASE WHEN LOWER(COALESCE(pg.lg,'')) = 'lab' THEN p_markup_lab ELSE p_markup_natural END) / 100.0)
      , 2),
      NULL::numeric,
      true,
      v_total
    FROM public.diamond_inventory_pool pg
    ORDER BY pg.id
    LIMIT p_page_size OFFSET p_offset;
    RETURN;
  END IF;

  RETURN QUERY
  WITH filtered AS MATERIALIZED (
    SELECT p.id AS pid
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0) = 0 OR (CASE WHEN LOWER(COALESCE(p.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,'')) = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0)   = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0)   = 0 OR UPPER(COALESCE(p.cut,''))  = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0)    = 0 OR UPPER(COALESCE(p.pol,''))  = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0)   = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0)    = 0 OR UPPER(COALESCE(p.flo,''))  = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0)   = 0 OR UPPER(COALESCE(p.lab,''))  = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (COALESCE(array_length(v_carat_ranges,1),0) = 0 OR (FLOOR(COALESCE(p.carats,0) * 2) / 2) = ANY(v_carat_ranges))
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
  ),
  cnt AS (SELECT COUNT(*)::bigint AS c FROM filtered),
  page AS (
    SELECT f.pid FROM filtered f ORDER BY f.pid LIMIT p_page_size OFFSET p_offset
  )
  SELECT
    d.id,
    (CASE WHEN LOWER(COALESCE(d.lg,'')) = 'lab' THEN 'lab' ELSE 'natural' END)::text,
    LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(d.shape,''),'\s+',' ','g'),' ',1))::text,
    (TRIM(TO_CHAR(FLOOR(COALESCE(d.carats,0) * 2) / 2, 'FM0.00')) || '-' ||
      TRIM(TO_CHAR(FLOOR(COALESCE(d.carats,0) * 2) / 2 + 0.49, 'FM0.00')))::text,
    d.carats,
    UPPER(COALESCE(d.col,''))::text,
    UPPER(COALESCE(d.clar,''))::text,
    ROUND(
      COALESCE(d.price,0) *
      (1 + (CASE WHEN LOWER(COALESCE(d.lg,'')) = 'lab' THEN p_markup_lab ELSE p_markup_natural END) / 100.0)
    , 2),
    NULL::numeric,
    true,
    (SELECT c FROM cnt)
  FROM page pg
  JOIN public.diamond_inventory_pool d ON d.id = pg.pid
  ORDER BY d.id;
END;
$function$;

```

---

## `supabase/migrations/20260526234350_fix-diamond-presets-dedup-by-price.sql`

```sql
-- Fix get_diamond_presets_filtered: deduplicate by (stone_type, shape_id, carat_range, color, clarity)
-- returning only the highest-priced diamond per group.
--
-- Root cause of the $4,294 vs $7,948 bug:
--   The previous version ordered by carat_value ASC and applied LIMIT p_page_size.
--   For a 12,000+ row bucket (e.g. round 0.50-0.99), the 0.98ct $7,948 D/IF diamond
--   was beyond row 2000 so it never reached the widget. The widget then displayed a
--   cheaper 0.7ct diamond instead.
--
-- Fix: add a DISTINCT ON CTE that picks the most expensive row per color/clarity group
--   BEFORE applying LIMIT. At most N_colors × N_clarities × N_stone_types rows are
--   returned (≤ ~300), so the page_size cap is irrelevant.

CREATE OR REPLACE FUNCTION public.get_diamond_presets_filtered(
  p_client_id   uuid,
  p_stone_type  text    DEFAULT NULL::text,
  p_shape_id    text    DEFAULT NULL::text,
  p_color       text    DEFAULT NULL::text,
  p_clarity     text    DEFAULT NULL::text,
  p_carat_range text    DEFAULT NULL::text,
  p_page_size   integer DEFAULT 50,
  p_offset      integer DEFAULT 0
)
RETURNS TABLE(
  id           uuid,
  stone_type   text,
  shape_id     text,
  carat_range  text,
  carat_value  numeric,
  color        text,
  clarity      text,
  base_price   numeric,
  custom_price numeric,
  is_enabled   boolean,
  total_count  bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_filter_row public.client_diamond_catalog_filter%ROWTYPE;
  v_filter     jsonb;
  v_stone  text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts   text[]; v_pol    text[]; v_symm   text[]; v_flo  text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric;
  v_carat_ranges numeric[];
  v_len_min numeric; v_len_max numeric; v_canadian boolean;
BEGIN
  SELECT * INTO v_filter_row
  FROM public.client_diamond_catalog_filter
  WHERE client_id = p_client_id AND is_confirmed = true;

  -- ── Legacy path (no confirmed filter) ──────────────────────────────────────
  IF NOT FOUND THEN
    RETURN QUERY
    WITH raw AS (
      SELECT
        cdp.id, cdp.stone_type, cdp.shape_id, cdp.carat_range, cdp.carat_value,
        cdp.color, cdp.clarity, cdp.base_price, cdp.custom_price, cdp.is_enabled
      FROM public.client_diamond_presets cdp
      WHERE cdp.client_id = p_client_id
        AND cdp.is_enabled = true
        AND (p_stone_type  IS NULL OR cdp.stone_type        = LOWER(p_stone_type))
        AND (p_shape_id    IS NULL OR cdp.shape_id          = LOWER(p_shape_id))
        AND (p_color       IS NULL OR UPPER(cdp.color)      = UPPER(p_color))
        AND (p_clarity     IS NULL OR UPPER(cdp.clarity)    = UPPER(p_clarity))
        AND (p_carat_range IS NULL OR cdp.carat_range       = p_carat_range)
    ),
    deduped AS (
      SELECT DISTINCT ON (r.stone_type, r.shape_id, r.carat_range, r.color, r.clarity)
        r.*
      FROM raw r
      ORDER BY r.stone_type, r.shape_id, r.carat_range, r.color, r.clarity,
               COALESCE(r.custom_price, r.base_price) DESC
    )
    SELECT
      d.id, d.stone_type, d.shape_id, d.carat_range, d.carat_value,
      d.color, d.clarity, d.base_price, d.custom_price, d.is_enabled,
      COUNT(*) OVER ()::bigint AS total_count
    FROM deduped d
    ORDER BY d.stone_type, COALESCE(d.custom_price, d.base_price) DESC, d.color, d.clarity
    LIMIT p_page_size OFFSET p_offset;
    RETURN;
  END IF;

  -- ── Pool path (confirmed catalog filter) ───────────────────────────────────
  v_filter := COALESCE(v_filter_row.filter, '{}'::jsonb);
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'shapes')))     INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'colors')))     INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'clarities')))  INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'cuts')))       INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'polish')))     INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'symmetry')))   INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'labs')))       INTO v_labs;
  v_carat_min    := NULLIF(v_filter->>'caratMin','')::numeric;
  v_carat_max    := NULLIF(v_filter->>'caratMax','')::numeric;
  SELECT ARRAY(SELECT (jsonb_array_elements_text(v_filter->'caratRanges'))::numeric) INTO v_carat_ranges;
  v_len_min      := NULLIF(v_filter->>'lengthMin','')::numeric;
  v_len_max      := NULLIF(v_filter->>'lengthMax','')::numeric;
  v_canadian     := COALESCE((v_filter->>'canadianOnly')::boolean, false);

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id,
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END          AS diamond_stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1))    AS diamond_shape_id,
      p.carats                                                                         AS diamond_carat_value,
      UPPER(COALESCE(p.col,''))                                                        AS diamond_color,
      UPPER(COALESCE(p.clar,''))                                                       AS diamond_clarity,
      ROUND(
        COALESCE(p.price,0) *
        (1 + (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%'
                   THEN v_filter_row.markup_lab
                   ELSE v_filter_row.markup_natural END) / 100.0)
      , 2)                                                                             AS diamond_base_price,
      FLOOR(COALESCE(p.carats,0) * 2) / 2                                             AS diamond_carat_bucket
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0)  = 0 OR (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,''))  = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0)   = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0)   = 0 OR UPPER(COALESCE(p.cut,''))  = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0)    = 0 OR UPPER(COALESCE(p.pol,''))  = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0)   = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0)    = 0 OR UPPER(COALESCE(p.flo,''))  = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0)   = 0 OR UPPER(COALESCE(p.lab,''))  = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (COALESCE(array_length(v_carat_ranges,1),0) = 0 OR (FLOOR(COALESCE(p.carats,0) * 2) / 2) = ANY(v_carat_ranges))
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
  ),
  filtered AS (
    SELECT * FROM base b
    WHERE (p_stone_type IS NULL OR b.diamond_stone_type = LOWER(p_stone_type))
      AND (p_shape_id   IS NULL OR b.diamond_shape_id   = LOWER(p_shape_id))
      AND (p_color      IS NULL OR b.diamond_color       = UPPER(p_color))
      AND (p_clarity    IS NULL OR b.diamond_clarity     = UPPER(p_clarity))
  ),
  ranged AS (
    SELECT
      f.*,
      TRIM(TO_CHAR(f.diamond_carat_bucket, 'FM0.00')) || '-' || TRIM(TO_CHAR(f.diamond_carat_bucket + 0.49, 'FM0.00')) AS diamond_carat_range
    FROM filtered f
  ),
  -- Pick the highest-priced diamond per (stone_type, shape, carat_range, color, clarity).
  -- This eliminates the LIMIT problem: a bucket with 12 000 rows reduces to at most
  -- N_stone_types × N_colors × N_clarities (≤ ~300) rows before LIMIT is applied.
  deduped AS (
    SELECT DISTINCT ON (r.diamond_stone_type, r.diamond_shape_id, r.diamond_carat_range, r.diamond_color, r.diamond_clarity)
      r.id,
      r.diamond_stone_type,
      r.diamond_shape_id,
      r.diamond_carat_range,
      r.diamond_carat_value,
      r.diamond_color,
      r.diamond_clarity,
      r.diamond_base_price
    FROM ranged r
    WHERE (p_carat_range IS NULL OR r.diamond_carat_range = p_carat_range)
    -- DISTINCT ON requires ORDER BY to start with the same expressions,
    -- then base_price DESC so the first (kept) row is the most expensive.
    ORDER BY r.diamond_stone_type, r.diamond_shape_id, r.diamond_carat_range,
             r.diamond_color, r.diamond_clarity, r.diamond_base_price DESC
  )
  SELECT
    d.id,
    d.diamond_stone_type  AS stone_type,
    d.diamond_shape_id    AS shape_id,
    d.diamond_carat_range AS carat_range,
    d.diamond_carat_value AS carat_value,
    d.diamond_color       AS color,
    d.diamond_clarity     AS clarity,
    d.diamond_base_price  AS base_price,
    NULL::numeric         AS custom_price,
    true                  AS is_enabled,
    COUNT(*) OVER ()::bigint AS total_count
  FROM deduped d
  -- Display order: most expensive first within each stone type, so the widget's
  -- own sort (price DESC) and dedup produce stable, consistent results.
  ORDER BY d.diamond_stone_type, d.diamond_base_price DESC, d.diamond_color, d.diamond_clarity
  LIMIT p_page_size OFFSET p_offset;
END;
$function$;

```

---

## `supabase/migrations/20260528060728_8d222d3d-cfad-4d99-a1dc-23a321148c1c.sql`

```sql
CREATE OR REPLACE FUNCTION public.generate_client_diamond_presets_db(
  p_client_id uuid,
  p_wizard_config jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '600s'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_diamond_type jsonb := COALESCE(p_wizard_config -> 'diamondType', '{}'::jsonb);
  v_shapes_config jsonb := COALESCE(p_wizard_config -> 'shapes', '{}'::jsonb);
  v_grading jsonb := COALESCE(p_wizard_config -> 'grading', '{}'::jsonb);
  v_pricing jsonb := COALESCE(p_wizard_config -> 'pricing', '{}'::jsonb);
  v_product jsonb := COALESCE(p_wizard_config -> 'productSettings', '{}'::jsonb);
  v_shapes text[];
  v_colors text[];
  v_clarities text[];
  v_cut_labels text[];
  v_polish_labels text[];
  v_symmetry_labels text[];
  v_fluor_labels text[];
  v_lab_targets text[];
  v_certifications text[];
  v_stone_types text[] := ARRAY[]::text[];
  v_cut_codes text[];
  v_polish_codes text[];
  v_symmetry_codes text[];
  v_fluor_codes text[];
  v_carat_min numeric := COALESCE(NULLIF(v_grading #>> '{caratRange,0}', '')::numeric, 0.50);
  v_carat_max numeric := COALESCE(NULLIF(v_grading #>> '{caratRange,1}', '')::numeric, 5.00);
  v_currency text := COALESCE(NULLIF(v_pricing ->> 'currency', ''), 'USD');
  v_pricing_method text := COALESCE(NULLIF(v_pricing ->> 'pricingMethod', ''), 'percentage');
  v_title_template text := COALESCE(NULLIF(v_product ->> 'titleTemplate', ''), '{carat}ct {shape} Diamond - {clarity}');
  v_sku_template text := COALESCE(NULLIF(v_product ->> 'skuTemplate', ''), 'DIA-{shape}-{clarity}-{carat}');
  v_standard_carats numeric[] := ARRAY[0.50, 1.00, 1.50, 2.00, 2.50, 3.00, 3.50, 4.00, 4.50, 5.00];
  v_pool_count integer := 0;
  v_fallback_count integer := 0;
  v_total_count integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT (
    public.has_role(v_actor, 'agency_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.user_id = v_actor)
    OR EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.user_id = v_actor
        AND sm.client_id = p_client_id
        AND sm.status = 'active'
        AND (sm.permissions ->> 'catalog_access' = 'edit' OR sm.permissions ->> 'catalog_access' = 'true')
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_shapes := COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_shapes_config -> 'selectedShapes')), ARRAY[]::text[]);
  v_colors := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'colors')))), ARRAY[]::text[]);
  v_clarities := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'clarities')))), ARRAY[]::text[]);
  v_cut_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'cutGrades'));
  v_polish_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'polish'));
  v_symmetry_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'symmetry'));
  v_fluor_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'fluorescence'));
  v_lab_targets := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'labs')))), ARRAY[]::text[]);
  v_certifications := ARRAY(SELECT jsonb_array_elements_text(v_diamond_type -> 'certifications'));

  IF cardinality(v_cut_labels) = 0 THEN v_cut_labels := ARRAY['Excellent']::text[]; END IF;
  IF cardinality(v_polish_labels) = 0 THEN v_polish_labels := ARRAY['Excellent']::text[]; END IF;
  IF cardinality(v_symmetry_labels) = 0 THEN v_symmetry_labels := ARRAY['Excellent']::text[]; END IF;
  IF cardinality(v_fluor_labels) = 0 THEN v_fluor_labels := ARRAY['None']::text[]; END IF;
  IF cardinality(v_certifications) = 0 THEN v_certifications := ARRAY['GIA']::text[]; END IF;

  v_cut_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'Excellent' THEN 'EX' WHEN 'Very Good' THEN 'VG' WHEN 'Good' THEN 'G' WHEN 'Fair' THEN 'F' WHEN 'Poor' THEN 'P' ELSE upper(label) END FROM unnest(v_cut_labels) AS label);
  v_polish_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'Excellent' THEN 'EX' WHEN 'Very Good' THEN 'VG' WHEN 'Good' THEN 'G' WHEN 'Fair' THEN 'F' WHEN 'Poor' THEN 'P' ELSE upper(label) END FROM unnest(v_polish_labels) AS label);
  v_symmetry_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'Excellent' THEN 'EX' WHEN 'Very Good' THEN 'VG' WHEN 'Good' THEN 'G' WHEN 'Fair' THEN 'F' WHEN 'Poor' THEN 'P' ELSE upper(label) END FROM unnest(v_symmetry_labels) AS label);
  v_fluor_codes := ARRAY(SELECT DISTINCT code FROM unnest(v_fluor_labels) AS label CROSS JOIN LATERAL unnest(CASE label WHEN 'None' THEN ARRAY['NON','NONE'] WHEN 'Faint' THEN ARRAY['FNT'] WHEN 'Very Slight' THEN ARRAY['VSL'] WHEN 'Slight' THEN ARRAY['SL'] WHEN 'Medium' THEN ARRAY['MED'] WHEN 'Strong' THEN ARRAY['STG','STR'] WHEN 'Very Strong' THEN ARRAY['VST'] ELSE ARRAY[upper(label)] END) AS code);

  IF COALESCE((v_diamond_type ->> 'naturalEnabled')::boolean, false) THEN
    v_stone_types := array_append(v_stone_types, 'natural');
  END IF;
  IF COALESCE((v_diamond_type ->> 'labGrownEnabled')::boolean, false) THEN
    v_stone_types := array_append(v_stone_types, 'lab');
  END IF;

  DELETE FROM public.client_diamond_presets WHERE client_id = p_client_id;

  IF cardinality(v_stone_types) = 0 OR cardinality(v_shapes) = 0 OR cardinality(v_colors) = 0 OR cardinality(v_clarities) = 0 THEN
    RETURN jsonb_build_object('success', true, 'presetsCount', 0, 'source', 'database');
  END IF;

  WITH filtered_pool AS (
    SELECT
      CASE WHEN lower(COALESCE(dip.lg, '')) = 'natural' THEN 'natural' ELSE 'lab' END AS stone_type,
      public._diamond_preset_shape_id(dip.shape) AS shape_id,
      round(dip.carats::numeric, 2) AS carat,
      upper(trim(dip.col)) AS color,
      upper(trim(dip.clar)) AS clarity,
      COALESCE(dip.price, 0)::numeric AS base_price,
      dip.id AS pool_id,
      dip.report_no
    FROM public.diamond_inventory_pool dip
    WHERE dip.carats >= v_carat_min
      AND dip.carats <= v_carat_max
      AND upper(trim(dip.col)) = ANY(v_colors)
      AND upper(trim(dip.clar)) = ANY(v_clarities)
      AND public._diamond_preset_shape_id(dip.shape) = ANY(v_shapes)
      AND (CASE WHEN lower(COALESCE(dip.lg, '')) = 'natural' THEN 'natural' ELSE 'lab' END) = ANY(v_stone_types)
      AND (
        public._diamond_preset_shape_id(dip.shape) <> 'round'
        OR cardinality(v_cut_codes) = 0
        OR dip.cut = ANY(v_cut_codes)
        OR dip.cut = '-'
      )
      AND (cardinality(v_polish_codes) = 0 OR dip.pol = ANY(v_polish_codes))
      AND (cardinality(v_symmetry_codes) = 0 OR dip.symm = ANY(v_symmetry_codes))
      AND (cardinality(v_fluor_codes) = 0 OR dip.flo = ANY(v_fluor_codes))
      AND (cardinality(v_lab_targets) = 0 OR upper(trim(dip.lab)) = ANY(v_lab_targets))
      AND (
        v_grading ->> 'measurementsMinLength' IS NULL
        OR dip.length >= NULLIF(v_grading ->> 'measurementsMinLength', '')::numeric
      )
      AND (
        v_grading ->> 'measurementsMaxLength' IS NULL
        OR dip.length <= NULLIF(v_grading ->> 'measurementsMaxLength', '')::numeric
      )
      AND COALESCE(dip.price, 0) > 0
  ), priced AS (
    SELECT
      fp.*,
      public._diamond_preset_tier_value(fp.carat, CASE WHEN fp.stone_type = 'natural' THEN v_pricing -> 'naturalMarkupTiers' ELSE v_pricing -> 'labMarkupTiers' END, 'markup') AS markup_value
    FROM filtered_pool fp
  ), final_rows AS (
    SELECT
      p.*,
      CASE
        WHEN v_pricing_method = 'percentage' THEN p.base_price * (1 + p.markup_value / 100)
        WHEN v_pricing_method = 'fixed_margin' THEN p.base_price + (p.markup_value * p.carat)
        ELSE p.base_price
      END AS final_price
    FROM priced p
  )
  INSERT INTO public.client_diamond_presets (
    client_id, stone_type, shape_id, carat_range, carat_value, color, clarity,
    base_price, custom_price, is_enabled, cut_grade, polish, symmetry, fluorescence,
    certification, origin, sku, product_title, currency, markup_percentage,
    compare_at_price, pool_stock_count,
    source_pool_id, report_no
  )
  SELECT
    p_client_id,
    fr.stone_type,
    fr.shape_id,
    public._diamond_preset_carat_range(fr.carat),
    fr.carat,
    fr.color,
    fr.clarity,
    round(fr.base_price),
    round(fr.final_price),
    true,
    CASE WHEN fr.shape_id = 'round' AND cardinality(v_cut_labels) > 0 THEN array_to_string(v_cut_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_polish_labels) > 0 THEN array_to_string(v_polish_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_symmetry_labels) > 0 THEN array_to_string(v_symmetry_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_fluor_labels) > 0 THEN array_to_string(v_fluor_labels, ', ') ELSE NULL END,
    COALESCE(v_certifications[1], 'GIA'),
    fr.stone_type,
    upper(regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(replace(
        v_sku_template,
        '{carat}', to_char(fr.carat, 'FM999990.00')),
        '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
        '{color}', fr.color),
        '{clarity}', fr.clarity),
        '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
        '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
        '{lab}', COALESCE(v_certifications[1], 'GIA')),
        '{report_number}', ''),
      '\s+', '-', 'g'
    )),
    replace(replace(replace(replace(replace(replace(replace(replace(
      v_title_template,
      '{carat}', to_char(fr.carat, 'FM999990.00')),
      '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
      '{color}', fr.color),
      '{clarity}', fr.clarity),
      '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
      '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
      '{lab}', COALESCE(v_certifications[1], 'GIA')),
      '{report_number}', ''),
    v_currency,
    CASE
      WHEN v_pricing_method = 'percentage' AND fr.markup_value > 0 THEN fr.markup_value
      WHEN v_pricing_method = 'fixed_margin' AND fr.base_price > 0 THEN ((fr.final_price - fr.base_price) / fr.base_price) * 100
      ELSE NULL
    END,
    NULL,
    1,
    fr.pool_id,
    fr.report_no
  FROM final_rows fr;

  GET DIAGNOSTICS v_pool_count = ROW_COUNT;

  WITH selected_groups AS (
    SELECT stone_type, shape_id, color, clarity
    FROM unnest(v_stone_types) stone_type
    CROSS JOIN unnest(v_shapes) shape_id
    CROSS JOIN unnest(v_colors) color
    CROSS JOIN unnest(v_clarities) clarity
  ), pool_groups AS (
    SELECT DISTINCT stone_type, shape_id, color, clarity
    FROM public.client_diamond_presets
    WHERE client_id = p_client_id
      AND pool_stock_count = 1
  ), fallback_source AS (
    SELECT sg.stone_type, sg.shape_id, sg.color, sg.clarity, c.carat
    FROM selected_groups sg
    CROSS JOIN unnest(v_standard_carats) c(carat)
    WHERE c.carat >= v_carat_min
      AND c.carat <= v_carat_max
      AND NOT EXISTS (
        SELECT 1 FROM pool_groups pg
        WHERE pg.stone_type = sg.stone_type
          AND pg.shape_id = sg.shape_id
          AND pg.color = sg.color
          AND pg.clarity = sg.clarity
      )
  ), priced AS (
    SELECT
      fs.*,
      public._diamond_preset_tier_value(fs.carat, CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'naturalMarkupTiers' ELSE v_pricing -> 'labMarkupTiers' END, 'markup') AS markup_value,
      public._diamond_preset_tier_value(fs.carat, CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'naturalMarkupTiers' ELSE v_pricing -> 'labMarkupTiers' END, 'purchasingPrice')
      * COALESCE((CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'clarityMultipliersNatural' ELSE v_pricing -> 'clarityMultipliersLab' END ->> fs.clarity)::numeric,
        CASE WHEN fs.stone_type = 'natural' THEN
          CASE fs.clarity WHEN 'FL' THEN 1.95 WHEN 'IF' THEN 1.75 WHEN 'VVS1' THEN 1.45 WHEN 'VVS2' THEN 1.32 WHEN 'VS1' THEN 1.15 WHEN 'VS2' THEN 1.00 WHEN 'SI1' THEN 0.82 WHEN 'SI2' THEN 0.65 WHEN 'I1' THEN 0.45 WHEN 'I2' THEN 0.30 WHEN 'I3' THEN 0.20 ELSE 1.00 END
        ELSE
          CASE fs.clarity WHEN 'FL' THEN 1.95 WHEN 'IF' THEN 1.75 WHEN 'VVS1' THEN 1.15 WHEN 'VVS2' THEN 1.08 WHEN 'VS1' THEN 1.04 WHEN 'VS2' THEN 1.00 WHEN 'SI1' THEN 0.88 WHEN 'SI2' THEN 0.78 WHEN 'I1' THEN 0.60 WHEN 'I2' THEN 0.45 WHEN 'I3' THEN 0.30 ELSE 1.00 END
        END)
      * COALESCE((CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'colorMultipliersNatural' ELSE v_pricing -> 'colorMultipliersLab' END ->> fs.color)::numeric,
        CASE WHEN fs.stone_type = 'natural' THEN
          CASE fs.color WHEN 'D' THEN 1.35 WHEN 'E' THEN 1.24 WHEN 'F' THEN 1.14 WHEN 'G' THEN 1.00 WHEN 'H' THEN 0.90 WHEN 'I' THEN 0.78 WHEN 'J' THEN 0.66 WHEN 'K' THEN 0.55 WHEN 'L' THEN 0.48 WHEN 'M' THEN 0.42 ELSE 1.00 END
        ELSE
          CASE fs.color WHEN 'D' THEN 1.15 WHEN 'E' THEN 1.10 WHEN 'F' THEN 1.05 WHEN 'G' THEN 1.00 WHEN 'H' THEN 0.94 WHEN 'I' THEN 0.85 WHEN 'J' THEN 0.75 WHEN 'K' THEN 0.65 WHEN 'L' THEN 0.58 WHEN 'M' THEN 0.52 ELSE 1.00 END
        END)
      * COALESCE((v_pricing -> 'shapeDiscounts' ->> fs.shape_id)::numeric,
          CASE fs.shape_id WHEN 'round' THEN 1.00 WHEN 'oval' THEN 0.83 WHEN 'pear' THEN 0.78 WHEN 'cushion' THEN 0.75 WHEN 'princess' THEN 0.70 WHEN 'radiant' THEN 0.70 WHEN 'marquise' THEN 0.70 WHEN 'emerald' THEN 0.68 WHEN 'asscher' THEN 0.62 WHEN 'heart' THEN 0.75 ELSE 1.00 END
        ) AS base_price
    FROM fallback_source fs
  ), final_rows AS (
    SELECT
      p.*,
      CASE
        WHEN v_pricing_method = 'percentage' THEN p.base_price * (1 + p.markup_value / 100)
        WHEN v_pricing_method = 'fixed_margin' THEN p.base_price + (p.markup_value * p.carat)
        ELSE p.base_price
      END AS final_price
    FROM priced p
  )
  INSERT INTO public.client_diamond_presets (
    client_id, stone_type, shape_id, carat_range, carat_value, color, clarity,
    base_price, custom_price, is_enabled, cut_grade, polish, symmetry, fluorescence,
    certification, origin, sku, product_title, currency, markup_percentage,
    compare_at_price, pool_stock_count,
    source_pool_id, report_no
  )
  SELECT
    p_client_id,
    fr.stone_type,
    fr.shape_id,
    public._diamond_preset_carat_range(fr.carat),
    fr.carat,
    fr.color,
    fr.clarity,
    round(fr.base_price),
    round(fr.final_price),
    true,
    CASE WHEN fr.shape_id = 'round' AND cardinality(v_cut_labels) > 0 THEN array_to_string(v_cut_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_polish_labels) > 0 THEN array_to_string(v_polish_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_symmetry_labels) > 0 THEN array_to_string(v_symmetry_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_fluor_labels) > 0 THEN array_to_string(v_fluor_labels, ', ') ELSE NULL END,
    COALESCE(v_certifications[1], 'GIA'),
    fr.stone_type,
    upper(regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(replace(
        v_sku_template,
        '{carat}', to_char(fr.carat, 'FM999990.00')),
        '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
        '{color}', fr.color),
        '{clarity}', fr.clarity),
        '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
        '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
        '{lab}', COALESCE(v_certifications[1], 'GIA')),
        '{report_number}', ''),
      '\s+', '-', 'g'
    )),
    replace(replace(replace(replace(replace(replace(replace(replace(
      v_title_template,
      '{carat}', to_char(fr.carat, 'FM999990.00')),
      '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
      '{color}', fr.color),
      '{clarity}', fr.clarity),
      '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
      '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
      '{lab}', COALESCE(v_certifications[1], 'GIA')),
      '{report_number}', ''),
    v_currency,
    CASE
      WHEN v_pricing_method = 'percentage' AND fr.markup_value > 0 THEN fr.markup_value
      WHEN v_pricing_method = 'fixed_margin' AND fr.base_price > 0 THEN ((fr.final_price - fr.base_price) / fr.base_price) * 100
      ELSE NULL
    END,
    NULL,
    0,
    NULL::uuid,
    NULL::text
  FROM final_rows fr;

  GET DIAGNOSTICS v_fallback_count = ROW_COUNT;
  v_total_count := v_pool_count + v_fallback_count;

  INSERT INTO public.client_activity_logs (
    client_id,
    user_id,
    action_type,
    action_category,
    description,
    metadata
  ) VALUES (
    p_client_id,
    v_actor,
    'diamond_presets_generated',
    'catalog',
    'Generated ' || v_total_count || ' diamond presets from database generation',
    jsonb_build_object(
      'stone_types', v_stone_types,
      'shapes_count', cardinality(v_shapes),
      'presets_count', v_total_count,
      'pool_count', v_pool_count,
      'fallback_count', v_fallback_count,
      'pricing_method', v_pricing_method,
      'currency', v_currency
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'presetsCount', v_total_count,
    'poolCount', v_pool_count,
    'fallbackCount', v_fallback_count,
    'source', 'database'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_client_diamond_presets_db(uuid, jsonb) TO authenticated;
```

---

## `supabase/migrations/20260528061648_a8eb3302-6952-4d0f-8ed4-a5062f5c923a.sql`

```sql
DROP FUNCTION IF EXISTS public.get_diamond_presets_filtered(uuid,text,text,text,text,text,integer,integer);

CREATE OR REPLACE FUNCTION public.get_diamond_presets_filtered(
  p_client_id   uuid,
  p_stone_type  text    DEFAULT NULL::text,
  p_shape_id    text    DEFAULT NULL::text,
  p_color       text    DEFAULT NULL::text,
  p_clarity     text    DEFAULT NULL::text,
  p_carat_range text    DEFAULT NULL::text,
  p_page_size   integer DEFAULT 50,
  p_offset      integer DEFAULT 0
)
RETURNS TABLE(
  id           uuid,
  stone_type   text,
  shape_id     text,
  carat_range  text,
  carat_value  numeric,
  color        text,
  clarity      text,
  base_price   numeric,
  custom_price numeric,
  is_enabled   boolean,
  total_count  bigint,
  pool_id      uuid,
  report_no    text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_filter_row public.client_diamond_catalog_filter%ROWTYPE;
  v_filter     jsonb;
  v_stone  text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts   text[]; v_pol    text[]; v_symm   text[]; v_flo  text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric;
  v_carat_ranges numeric[];
  v_len_min numeric; v_len_max numeric; v_canadian boolean;
BEGIN
  SELECT * INTO v_filter_row
  FROM public.client_diamond_catalog_filter
  WHERE client_id = p_client_id AND is_confirmed = true;

  IF NOT FOUND THEN
    RETURN QUERY
    WITH raw AS (
      SELECT
        cdp.id, cdp.stone_type, cdp.shape_id, cdp.carat_range, cdp.carat_value,
        cdp.color, cdp.clarity, cdp.base_price, cdp.custom_price, cdp.is_enabled,
        cdp.source_pool_id, cdp.report_no
      FROM public.client_diamond_presets cdp
      WHERE cdp.client_id = p_client_id
        AND cdp.is_enabled = true
        AND (p_stone_type  IS NULL OR cdp.stone_type        = LOWER(p_stone_type))
        AND (p_shape_id    IS NULL OR cdp.shape_id          = LOWER(p_shape_id))
        AND (p_color       IS NULL OR UPPER(cdp.color)      = UPPER(p_color))
        AND (p_clarity     IS NULL OR UPPER(cdp.clarity)    = UPPER(p_clarity))
        AND (p_carat_range IS NULL OR cdp.carat_range       = p_carat_range)
    ),
    deduped AS (
      SELECT DISTINCT ON (r.stone_type, r.shape_id, r.carat_range, r.color, r.clarity)
        r.*
      FROM raw r
      ORDER BY r.stone_type, r.shape_id, r.carat_range, r.color, r.clarity,
               COALESCE(r.custom_price, r.base_price) DESC,
               r.report_no NULLS LAST
    )
    SELECT
      d.id, d.stone_type, d.shape_id, d.carat_range, d.carat_value,
      d.color, d.clarity, d.base_price, d.custom_price, d.is_enabled,
      COUNT(*) OVER ()::bigint AS total_count,
      d.source_pool_id AS pool_id,
      d.report_no
    FROM deduped d
    ORDER BY d.stone_type, COALESCE(d.custom_price, d.base_price) DESC, d.color, d.clarity
    LIMIT p_page_size OFFSET p_offset;
    RETURN;
  END IF;

  v_filter := COALESCE(v_filter_row.filter, '{}'::jsonb);
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'shapes')))     INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'colors')))     INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'clarities')))  INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'cuts')))       INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'polish')))     INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'symmetry')))   INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'labs')))       INTO v_labs;
  v_carat_min    := NULLIF(v_filter->>'caratMin','')::numeric;
  v_carat_max    := NULLIF(v_filter->>'caratMax','')::numeric;
  SELECT ARRAY(SELECT (jsonb_array_elements_text(v_filter->'caratRanges'))::numeric) INTO v_carat_ranges;
  v_len_min      := NULLIF(v_filter->>'lengthMin','')::numeric;
  v_len_max      := NULLIF(v_filter->>'lengthMax','')::numeric;
  v_canadian     := COALESCE((v_filter->>'canadianOnly')::boolean, false);

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id,
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END          AS diamond_stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1))    AS diamond_shape_id,
      p.carats                                                                         AS diamond_carat_value,
      UPPER(COALESCE(p.col,''))                                                        AS diamond_color,
      UPPER(COALESCE(p.clar,''))                                                       AS diamond_clarity,
      ROUND(
        COALESCE(p.price,0) *
        (1 + (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%'
                   THEN v_filter_row.markup_lab
                   ELSE v_filter_row.markup_natural END) / 100.0)
      , 2)                                                                             AS diamond_base_price,
      FLOOR(COALESCE(p.carats,0) * 2) / 2                                             AS diamond_carat_bucket,
      p.report_no                                                                      AS diamond_report_no
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0)  = 0 OR (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,''))  = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0)   = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0)   = 0 OR UPPER(COALESCE(p.cut,''))  = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0)    = 0 OR UPPER(COALESCE(p.pol,''))  = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0)   = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0)    = 0 OR UPPER(COALESCE(p.flo,''))  = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0)   = 0 OR UPPER(COALESCE(p.lab,''))  = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (COALESCE(array_length(v_carat_ranges,1),0) = 0 OR (FLOOR(COALESCE(p.carats,0) * 2) / 2) = ANY(v_carat_ranges))
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
  ),
  filtered AS (
    SELECT * FROM base b
    WHERE (p_stone_type IS NULL OR b.diamond_stone_type = LOWER(p_stone_type))
      AND (p_shape_id   IS NULL OR b.diamond_shape_id   = LOWER(p_shape_id))
      AND (p_color      IS NULL OR b.diamond_color       = UPPER(p_color))
      AND (p_clarity    IS NULL OR b.diamond_clarity     = UPPER(p_clarity))
  ),
  ranged AS (
    SELECT
      f.*,
      TRIM(TO_CHAR(f.diamond_carat_bucket, 'FM0.00')) || '-' || TRIM(TO_CHAR(f.diamond_carat_bucket + 0.49, 'FM0.00')) AS diamond_carat_range
    FROM filtered f
  ),
  deduped AS (
    SELECT DISTINCT ON (r.diamond_stone_type, r.diamond_shape_id, r.diamond_carat_range, r.diamond_color, r.diamond_clarity)
      r.id,
      r.diamond_stone_type,
      r.diamond_shape_id,
      r.diamond_carat_range,
      r.diamond_carat_value,
      r.diamond_color,
      r.diamond_clarity,
      r.diamond_base_price,
      r.diamond_report_no
    FROM ranged r
    WHERE (p_carat_range IS NULL OR r.diamond_carat_range = p_carat_range)
    ORDER BY r.diamond_stone_type, r.diamond_shape_id, r.diamond_carat_range,
             r.diamond_color, r.diamond_clarity,
             r.diamond_base_price DESC,
             r.diamond_report_no NULLS LAST
  )
  SELECT
    d.id,
    d.diamond_stone_type  AS stone_type,
    d.diamond_shape_id    AS shape_id,
    d.diamond_carat_range AS carat_range,
    d.diamond_carat_value AS carat_value,
    d.diamond_color       AS color,
    d.diamond_clarity     AS clarity,
    d.diamond_base_price  AS base_price,
    NULL::numeric         AS custom_price,
    true                  AS is_enabled,
    COUNT(*) OVER ()::bigint AS total_count,
    d.id                  AS pool_id,
    d.diamond_report_no   AS report_no
  FROM deduped d
  ORDER BY d.diamond_stone_type, d.diamond_base_price DESC, d.diamond_color, d.diamond_clarity
  LIMIT p_page_size OFFSET p_offset;
END;
$function$;
```

---

## `supabase/migrations/20260528100000_add-source-pool-fields-to-client-diamond-presets.sql`

```sql
-- Add source_pool_id and report_no to client_diamond_presets so every
-- pool-derived preset row carries the exact physical diamond identity.
-- These two columns are the key that makes report_no lookup 100% accurate.

ALTER TABLE public.client_diamond_presets
  ADD COLUMN IF NOT EXISTS source_pool_id uuid
    REFERENCES public.diamond_inventory_pool(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS report_no text;

CREATE INDEX IF NOT EXISTS idx_client_diamond_presets_source_pool_id
  ON public.client_diamond_presets(source_pool_id)
  WHERE source_pool_id IS NOT NULL;

```

---

## `supabase/migrations/20260528100001_update-generate-presets-with-pool-ref.sql`

```sql
-- Update generate_client_diamond_presets_db to persist source_pool_id and
-- report_no on every pool-derived preset row inserted into client_diamond_presets.
-- Fallback (non-pool) rows continue to get NULL for both columns.

CREATE OR REPLACE FUNCTION public.generate_client_diamond_presets_db(
  p_client_id uuid,
  p_wizard_config jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '600s'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_diamond_type jsonb := COALESCE(p_wizard_config -> 'diamondType', '{}'::jsonb);
  v_shapes_config jsonb := COALESCE(p_wizard_config -> 'shapes', '{}'::jsonb);
  v_grading jsonb := COALESCE(p_wizard_config -> 'grading', '{}'::jsonb);
  v_pricing jsonb := COALESCE(p_wizard_config -> 'pricing', '{}'::jsonb);
  v_product jsonb := COALESCE(p_wizard_config -> 'productSettings', '{}'::jsonb);
  v_shapes text[];
  v_colors text[];
  v_clarities text[];
  v_cut_labels text[];
  v_polish_labels text[];
  v_symmetry_labels text[];
  v_fluor_labels text[];
  v_lab_targets text[];
  v_certifications text[];
  v_stone_types text[] := ARRAY[]::text[];
  v_cut_codes text[];
  v_polish_codes text[];
  v_symmetry_codes text[];
  v_fluor_codes text[];
  v_carat_min numeric := COALESCE(NULLIF(v_grading #>> '{caratRange,0}', '')::numeric, 0.50);
  v_carat_max numeric := COALESCE(NULLIF(v_grading #>> '{caratRange,1}', '')::numeric, 5.00);
  v_currency text := COALESCE(NULLIF(v_pricing ->> 'currency', ''), 'USD');
  v_pricing_method text := COALESCE(NULLIF(v_pricing ->> 'pricingMethod', ''), 'percentage');
  v_title_template text := COALESCE(NULLIF(v_product ->> 'titleTemplate', ''), '{carat}ct {shape} Diamond - {clarity}');
  v_sku_template text := COALESCE(NULLIF(v_product ->> 'skuTemplate', ''), 'DIA-{shape}-{clarity}-{carat}');
  v_standard_carats numeric[] := ARRAY[0.50, 1.00, 1.50, 2.00, 2.50, 3.00, 3.50, 4.00, 4.50, 5.00];
  v_pool_count integer := 0;
  v_fallback_count integer := 0;
  v_total_count integer := 0;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT (
    public.has_role(v_actor, 'agency_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.user_id = v_actor)
    OR EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.user_id = v_actor
        AND sm.client_id = p_client_id
        AND sm.status = 'active'
        AND (sm.permissions ->> 'catalog_access' = 'edit' OR sm.permissions ->> 'catalog_access' = 'true')
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_shapes := COALESCE(ARRAY(SELECT jsonb_array_elements_text(v_shapes_config -> 'selectedShapes')), ARRAY[]::text[]);
  v_colors := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'colors')))), ARRAY[]::text[]);
  v_clarities := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'clarities')))), ARRAY[]::text[]);
  v_cut_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'cutGrades'));
  v_polish_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'polish'));
  v_symmetry_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'symmetry'));
  v_fluor_labels := ARRAY(SELECT jsonb_array_elements_text(v_grading -> 'fluorescence'));
  v_lab_targets := COALESCE(ARRAY(SELECT upper(trim(jsonb_array_elements_text(v_grading -> 'labs')))), ARRAY[]::text[]);
  v_certifications := ARRAY(SELECT jsonb_array_elements_text(v_diamond_type -> 'certifications'));

  IF cardinality(v_cut_labels) = 0 THEN v_cut_labels := ARRAY['Excellent']::text[]; END IF;
  IF cardinality(v_polish_labels) = 0 THEN v_polish_labels := ARRAY['Excellent']::text[]; END IF;
  IF cardinality(v_symmetry_labels) = 0 THEN v_symmetry_labels := ARRAY['Excellent']::text[]; END IF;
  IF cardinality(v_fluor_labels) = 0 THEN v_fluor_labels := ARRAY['None']::text[]; END IF;
  IF cardinality(v_certifications) = 0 THEN v_certifications := ARRAY['GIA']::text[]; END IF;

  v_cut_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'Excellent' THEN 'EX' WHEN 'Very Good' THEN 'VG' WHEN 'Good' THEN 'G' WHEN 'Fair' THEN 'F' WHEN 'Poor' THEN 'P' ELSE upper(label) END FROM unnest(v_cut_labels) AS label);
  v_polish_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'Excellent' THEN 'EX' WHEN 'Very Good' THEN 'VG' WHEN 'Good' THEN 'G' WHEN 'Fair' THEN 'F' WHEN 'Poor' THEN 'P' ELSE upper(label) END FROM unnest(v_polish_labels) AS label);
  v_symmetry_codes := ARRAY(SELECT DISTINCT CASE label WHEN 'Excellent' THEN 'EX' WHEN 'Very Good' THEN 'VG' WHEN 'Good' THEN 'G' WHEN 'Fair' THEN 'F' WHEN 'Poor' THEN 'P' ELSE upper(label) END FROM unnest(v_symmetry_labels) AS label);
  v_fluor_codes := ARRAY(SELECT DISTINCT code FROM unnest(v_fluor_labels) AS label CROSS JOIN LATERAL unnest(CASE label WHEN 'None' THEN ARRAY['NON','NONE'] WHEN 'Faint' THEN ARRAY['FNT'] WHEN 'Very Slight' THEN ARRAY['VSL'] WHEN 'Slight' THEN ARRAY['SL'] WHEN 'Medium' THEN ARRAY['MED'] WHEN 'Strong' THEN ARRAY['STG','STR'] WHEN 'Very Strong' THEN ARRAY['VST'] ELSE ARRAY[upper(label)] END) AS code);

  IF COALESCE((v_diamond_type ->> 'naturalEnabled')::boolean, false) THEN
    v_stone_types := array_append(v_stone_types, 'natural');
  END IF;
  IF COALESCE((v_diamond_type ->> 'labGrownEnabled')::boolean, false) THEN
    v_stone_types := array_append(v_stone_types, 'lab');
  END IF;

  DELETE FROM public.client_diamond_presets WHERE client_id = p_client_id;

  IF cardinality(v_stone_types) = 0 OR cardinality(v_shapes) = 0 OR cardinality(v_colors) = 0 OR cardinality(v_clarities) = 0 THEN
    RETURN jsonb_build_object('success', true, 'presetsCount', 0, 'source', 'database');
  END IF;

  -- Pool-derived rows: each pool diamond gets its own preset row and we carry
  -- its UUID (source_pool_id) and certificate number (report_no) through so
  -- checkout can do an exact 1-to-1 lookup without any fuzzy matching.
  WITH filtered_pool AS (
    SELECT
      CASE WHEN lower(COALESCE(dip.lg, '')) = 'natural' THEN 'natural' ELSE 'lab' END AS stone_type,
      public._diamond_preset_shape_id(dip.shape) AS shape_id,
      round(dip.carats::numeric, 2) AS carat,
      upper(trim(dip.col)) AS color,
      upper(trim(dip.clar)) AS clarity,
      COALESCE(dip.price, 0)::numeric AS base_price,
      dip.id   AS pool_id,     -- NEW: physical diamond UUID
      dip.report_no             -- NEW: certificate number
    FROM public.diamond_inventory_pool dip
    WHERE dip.carats >= v_carat_min
      AND dip.carats <= v_carat_max
      AND upper(trim(dip.col)) = ANY(v_colors)
      AND upper(trim(dip.clar)) = ANY(v_clarities)
      AND public._diamond_preset_shape_id(dip.shape) = ANY(v_shapes)
      AND (CASE WHEN lower(COALESCE(dip.lg, '')) = 'natural' THEN 'natural' ELSE 'lab' END) = ANY(v_stone_types)
      AND (
        public._diamond_preset_shape_id(dip.shape) <> 'round'
        OR cardinality(v_cut_codes) = 0
        OR dip.cut = ANY(v_cut_codes)
        OR dip.cut = '-'
      )
      AND (cardinality(v_polish_codes) = 0 OR dip.pol = ANY(v_polish_codes))
      AND (cardinality(v_symmetry_codes) = 0 OR dip.symm = ANY(v_symmetry_codes))
      AND (cardinality(v_fluor_codes) = 0 OR dip.flo = ANY(v_fluor_codes))
      AND (cardinality(v_lab_targets) = 0 OR upper(trim(dip.lab)) = ANY(v_lab_targets))
      AND (
        v_grading ->> 'measurementsMinLength' IS NULL
        OR dip.length >= NULLIF(v_grading ->> 'measurementsMinLength', '')::numeric
      )
      AND (
        v_grading ->> 'measurementsMaxLength' IS NULL
        OR dip.length <= NULLIF(v_grading ->> 'measurementsMaxLength', '')::numeric
      )
      AND COALESCE(dip.price, 0) > 0
  ), priced AS (
    SELECT
      fp.*,
      public._diamond_preset_tier_value(fp.carat, CASE WHEN fp.stone_type = 'natural' THEN v_pricing -> 'naturalMarkupTiers' ELSE v_pricing -> 'labMarkupTiers' END, 'markup') AS markup_value
    FROM filtered_pool fp
  ), final_rows AS (
    SELECT
      p.*,
      CASE
        WHEN v_pricing_method = 'percentage' THEN p.base_price * (1 + p.markup_value / 100)
        WHEN v_pricing_method = 'fixed_margin' THEN p.base_price + (p.markup_value * p.carat)
        ELSE p.base_price
      END AS final_price
    FROM priced p
  )
  INSERT INTO public.client_diamond_presets (
    client_id, stone_type, shape_id, carat_range, carat_value, color, clarity,
    base_price, custom_price, is_enabled, cut_grade, polish, symmetry, fluorescence,
    certification, origin, sku, product_title, currency, markup_percentage,
    compare_at_price, pool_stock_count,
    source_pool_id, report_no
  )
  SELECT
    p_client_id,
    fr.stone_type,
    fr.shape_id,
    public._diamond_preset_carat_range(fr.carat),
    fr.carat,
    fr.color,
    fr.clarity,
    round(fr.base_price),
    round(fr.final_price),
    true,
    CASE WHEN fr.shape_id = 'round' AND cardinality(v_cut_labels) > 0 THEN array_to_string(v_cut_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_polish_labels) > 0 THEN array_to_string(v_polish_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_symmetry_labels) > 0 THEN array_to_string(v_symmetry_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_fluor_labels) > 0 THEN array_to_string(v_fluor_labels, ', ') ELSE NULL END,
    COALESCE(v_certifications[1], 'GIA'),
    fr.stone_type,
    upper(regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(replace(
        v_sku_template,
        '{carat}', to_char(fr.carat, 'FM999990.00')),
        '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
        '{color}', fr.color),
        '{clarity}', fr.clarity),
        '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
        '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
        '{lab}', COALESCE(v_certifications[1], 'GIA')),
        '{report_number}', ''),
      '\s+', '-', 'g'
    )),
    replace(replace(replace(replace(replace(replace(replace(replace(
      v_title_template,
      '{carat}', to_char(fr.carat, 'FM999990.00')),
      '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
      '{color}', fr.color),
      '{clarity}', fr.clarity),
      '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
      '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
      '{lab}', COALESCE(v_certifications[1], 'GIA')),
      '{report_number}', ''),
    v_currency,
    CASE
      WHEN v_pricing_method = 'percentage' AND fr.markup_value > 0 THEN fr.markup_value
      WHEN v_pricing_method = 'fixed_margin' AND fr.base_price > 0 THEN ((fr.final_price - fr.base_price) / fr.base_price) * 100
      ELSE NULL
    END,
    NULL,
    1,
    fr.pool_id,    -- NEW
    fr.report_no   -- NEW
  FROM final_rows fr;

  GET DIAGNOSTICS v_pool_count = ROW_COUNT;

  WITH selected_groups AS (
    SELECT stone_type, shape_id, color, clarity
    FROM unnest(v_stone_types) stone_type
    CROSS JOIN unnest(v_shapes) shape_id
    CROSS JOIN unnest(v_colors) color
    CROSS JOIN unnest(v_clarities) clarity
  ), pool_groups AS (
    SELECT DISTINCT stone_type, shape_id, color, clarity
    FROM public.client_diamond_presets
    WHERE client_id = p_client_id
      AND pool_stock_count = 1
  ), fallback_source AS (
    SELECT sg.stone_type, sg.shape_id, sg.color, sg.clarity, c.carat
    FROM selected_groups sg
    CROSS JOIN unnest(v_standard_carats) c(carat)
    WHERE c.carat >= v_carat_min
      AND c.carat <= v_carat_max
      AND NOT EXISTS (
        SELECT 1 FROM pool_groups pg
        WHERE pg.stone_type = sg.stone_type
          AND pg.shape_id = sg.shape_id
          AND pg.color = sg.color
          AND pg.clarity = sg.clarity
      )
  ), priced AS (
    SELECT
      fs.*,
      public._diamond_preset_tier_value(fs.carat, CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'naturalMarkupTiers' ELSE v_pricing -> 'labMarkupTiers' END, 'markup') AS markup_value,
      public._diamond_preset_tier_value(fs.carat, CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'naturalMarkupTiers' ELSE v_pricing -> 'labMarkupTiers' END, 'purchasingPrice')
      * COALESCE((CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'clarityMultipliersNatural' ELSE v_pricing -> 'clarityMultipliersLab' END ->> fs.clarity)::numeric,
        CASE WHEN fs.stone_type = 'natural' THEN
          CASE fs.clarity WHEN 'FL' THEN 1.95 WHEN 'IF' THEN 1.75 WHEN 'VVS1' THEN 1.45 WHEN 'VVS2' THEN 1.32 WHEN 'VS1' THEN 1.15 WHEN 'VS2' THEN 1.00 WHEN 'SI1' THEN 0.82 WHEN 'SI2' THEN 0.65 WHEN 'I1' THEN 0.45 WHEN 'I2' THEN 0.30 WHEN 'I3' THEN 0.20 ELSE 1.00 END
        ELSE
          CASE fs.clarity WHEN 'FL' THEN 1.95 WHEN 'IF' THEN 1.75 WHEN 'VVS1' THEN 1.15 WHEN 'VVS2' THEN 1.08 WHEN 'VS1' THEN 1.04 WHEN 'VS2' THEN 1.00 WHEN 'SI1' THEN 0.88 WHEN 'SI2' THEN 0.78 WHEN 'I1' THEN 0.60 WHEN 'I2' THEN 0.45 WHEN 'I3' THEN 0.30 ELSE 1.00 END
        END)
      * COALESCE((CASE WHEN fs.stone_type = 'natural' THEN v_pricing -> 'colorMultipliersNatural' ELSE v_pricing -> 'colorMultipliersLab' END ->> fs.color)::numeric,
        CASE WHEN fs.stone_type = 'natural' THEN
          CASE fs.color WHEN 'D' THEN 1.35 WHEN 'E' THEN 1.24 WHEN 'F' THEN 1.14 WHEN 'G' THEN 1.00 WHEN 'H' THEN 0.90 WHEN 'I' THEN 0.78 WHEN 'J' THEN 0.66 WHEN 'K' THEN 0.55 WHEN 'L' THEN 0.48 WHEN 'M' THEN 0.42 ELSE 1.00 END
        ELSE
          CASE fs.color WHEN 'D' THEN 1.15 WHEN 'E' THEN 1.10 WHEN 'F' THEN 1.05 WHEN 'G' THEN 1.00 WHEN 'H' THEN 0.94 WHEN 'I' THEN 0.85 WHEN 'J' THEN 0.75 WHEN 'K' THEN 0.65 WHEN 'L' THEN 0.58 WHEN 'M' THEN 0.52 ELSE 1.00 END
        END)
      * COALESCE((v_pricing -> 'shapeDiscounts' ->> fs.shape_id)::numeric,
          CASE fs.shape_id WHEN 'round' THEN 1.00 WHEN 'oval' THEN 0.83 WHEN 'pear' THEN 0.78 WHEN 'cushion' THEN 0.75 WHEN 'princess' THEN 0.70 WHEN 'radiant' THEN 0.70 WHEN 'marquise' THEN 0.70 WHEN 'emerald' THEN 0.68 WHEN 'asscher' THEN 0.62 WHEN 'heart' THEN 0.75 ELSE 1.00 END
        ) AS base_price
    FROM fallback_source fs
  ), final_rows AS (
    SELECT
      p.*,
      CASE
        WHEN v_pricing_method = 'percentage' THEN p.base_price * (1 + p.markup_value / 100)
        WHEN v_pricing_method = 'fixed_margin' THEN p.base_price + (p.markup_value * p.carat)
        ELSE p.base_price
      END AS final_price
    FROM priced p
  )
  INSERT INTO public.client_diamond_presets (
    client_id, stone_type, shape_id, carat_range, carat_value, color, clarity,
    base_price, custom_price, is_enabled, cut_grade, polish, symmetry, fluorescence,
    certification, origin, sku, product_title, currency, markup_percentage,
    compare_at_price, pool_stock_count,
    source_pool_id, report_no
  )
  SELECT
    p_client_id,
    fr.stone_type,
    fr.shape_id,
    public._diamond_preset_carat_range(fr.carat),
    fr.carat,
    fr.color,
    fr.clarity,
    round(fr.base_price),
    round(fr.final_price),
    true,
    CASE WHEN fr.shape_id = 'round' AND cardinality(v_cut_labels) > 0 THEN array_to_string(v_cut_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_polish_labels) > 0 THEN array_to_string(v_polish_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_symmetry_labels) > 0 THEN array_to_string(v_symmetry_labels, ', ') ELSE NULL END,
    CASE WHEN cardinality(v_fluor_labels) > 0 THEN array_to_string(v_fluor_labels, ', ') ELSE NULL END,
    COALESCE(v_certifications[1], 'GIA'),
    fr.stone_type,
    upper(regexp_replace(
      replace(replace(replace(replace(replace(replace(replace(replace(
        v_sku_template,
        '{carat}', to_char(fr.carat, 'FM999990.00')),
        '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
        '{color}', fr.color),
        '{clarity}', fr.clarity),
        '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
        '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
        '{lab}', COALESCE(v_certifications[1], 'GIA')),
        '{report_number}', ''),
      '\s+', '-', 'g'
    )),
    replace(replace(replace(replace(replace(replace(replace(replace(
      v_title_template,
      '{carat}', to_char(fr.carat, 'FM999990.00')),
      '{shape}', public._diamond_preset_shape_name(fr.shape_id)),
      '{color}', fr.color),
      '{clarity}', fr.clarity),
      '{cut}', CASE WHEN fr.shape_id = 'round' THEN COALESCE(v_cut_labels[1], '') ELSE '' END),
      '{origin}', CASE WHEN fr.stone_type = 'natural' THEN 'Natural' ELSE 'Lab-Grown' END),
      '{lab}', COALESCE(v_certifications[1], 'GIA')),
      '{report_number}', ''),
    v_currency,
    CASE
      WHEN v_pricing_method = 'percentage' AND fr.markup_value > 0 THEN fr.markup_value
      WHEN v_pricing_method = 'fixed_margin' AND fr.base_price > 0 THEN ((fr.final_price - fr.base_price) / fr.base_price) * 100
      ELSE NULL
    END,
    NULL,
    0,
    NULL::uuid,  -- fallback rows have no pool identity
    NULL::text
  FROM final_rows fr;

  GET DIAGNOSTICS v_fallback_count = ROW_COUNT;
  v_total_count := v_pool_count + v_fallback_count;

  INSERT INTO public.client_activity_logs (
    client_id,
    user_id,
    action_type,
    action_category,
    description,
    metadata
  ) VALUES (
    p_client_id,
    v_actor,
    'diamond_presets_generated',
    'catalog',
    'Generated ' || v_total_count || ' diamond presets from database generation',
    jsonb_build_object(
      'stone_types', v_stone_types,
      'shapes_count', cardinality(v_shapes),
      'presets_count', v_total_count,
      'pool_count', v_pool_count,
      'fallback_count', v_fallback_count,
      'pricing_method', v_pricing_method,
      'currency', v_currency
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'presetsCount', v_total_count,
    'poolCount', v_pool_count,
    'fallbackCount', v_fallback_count,
    'source', 'database'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_client_diamond_presets_db(uuid, jsonb) TO authenticated;

```

---

## `supabase/migrations/20260528100002_backfill-client-presets-pool-ref.sql`

```sql
-- One-time backfill: match existing pool-derived client_diamond_presets rows
-- to their source diamond_inventory_pool row and fill source_pool_id + report_no.
--
-- Matching key: stone_type + shape_id + color + clarity + carat_value + base_price (rounded).
-- When multiple pool rows share the same specs/price (rare), we pick the one whose
-- price is closest to base_price to maximise accuracy.
-- Only rows with pool_stock_count = 1 are backfilled (fallback rows stay NULL).

UPDATE public.client_diamond_presets cdp
SET
  source_pool_id = match.pool_id,
  report_no      = match.report_no
FROM (
  SELECT DISTINCT ON (cdp2.id)
    cdp2.id AS preset_id,
    dip.id  AS pool_id,
    dip.report_no
  FROM public.client_diamond_presets cdp2
  JOIN public.diamond_inventory_pool dip
    ON round(dip.carats::numeric, 2) = cdp2.carat_value
    AND UPPER(TRIM(dip.col))  = cdp2.color
    AND UPPER(TRIM(dip.clar)) = cdp2.clarity
    AND public._diamond_preset_shape_id(dip.shape) = cdp2.shape_id
    AND (CASE WHEN lower(COALESCE(dip.lg, '')) = 'natural' THEN 'natural' ELSE 'lab' END) = cdp2.stone_type
    AND ABS(COALESCE(dip.price, 0) - cdp2.base_price::numeric) < 1.0
    AND dip.report_no IS NOT NULL
  WHERE cdp2.source_pool_id IS NULL
    AND cdp2.pool_stock_count = 1
  ORDER BY cdp2.id, ABS(COALESCE(dip.price, 0) - cdp2.base_price::numeric)
) match
WHERE cdp.id = match.preset_id;

```

---

## `supabase/migrations/20260528100003_diamond-presets-return-report-no.sql`

```sql
-- Update get_diamond_presets_filtered to return report_no and pool_id.
--
-- Pool (confirmed catalog) path: report_no comes directly from diamond_inventory_pool.
-- Legacy path: report_no comes from client_diamond_presets.report_no (populated by
--   the backfill migration or future regenerations).
--
-- The widget maps report_no → Stone.reportNo which shopify-add-to-cart then uses
-- for an exact eq('report_no', ...) lookup — no fuzzy scoring needed.

CREATE OR REPLACE FUNCTION public.get_diamond_presets_filtered(
  p_client_id   uuid,
  p_stone_type  text    DEFAULT NULL::text,
  p_shape_id    text    DEFAULT NULL::text,
  p_color       text    DEFAULT NULL::text,
  p_clarity     text    DEFAULT NULL::text,
  p_carat_range text    DEFAULT NULL::text,
  p_page_size   integer DEFAULT 50,
  p_offset      integer DEFAULT 0
)
RETURNS TABLE(
  id           uuid,
  stone_type   text,
  shape_id     text,
  carat_range  text,
  carat_value  numeric,
  color        text,
  clarity      text,
  base_price   numeric,
  custom_price numeric,
  is_enabled   boolean,
  total_count  bigint,
  pool_id      uuid,   -- NEW: diamond_inventory_pool.id (NULL for non-pool rows)
  report_no    text    -- NEW: certificate number (NULL when no pool match)
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_filter_row public.client_diamond_catalog_filter%ROWTYPE;
  v_filter     jsonb;
  v_stone  text[]; v_shapes text[]; v_colors text[]; v_clar text[];
  v_cuts   text[]; v_pol    text[]; v_symm   text[]; v_flo  text[]; v_labs text[];
  v_carat_min numeric; v_carat_max numeric;
  v_carat_ranges numeric[];
  v_len_min numeric; v_len_max numeric; v_canadian boolean;
BEGIN
  SELECT * INTO v_filter_row
  FROM public.client_diamond_catalog_filter
  WHERE client_id = p_client_id AND is_confirmed = true;

  -- ── Legacy path (no confirmed filter) ──────────────────────────────────────
  IF NOT FOUND THEN
    RETURN QUERY
    WITH raw AS (
      SELECT
        cdp.id, cdp.stone_type, cdp.shape_id, cdp.carat_range, cdp.carat_value,
        cdp.color, cdp.clarity, cdp.base_price, cdp.custom_price, cdp.is_enabled,
        cdp.source_pool_id, cdp.report_no   -- NEW
      FROM public.client_diamond_presets cdp
      WHERE cdp.client_id = p_client_id
        AND cdp.is_enabled = true
        AND (p_stone_type  IS NULL OR cdp.stone_type        = LOWER(p_stone_type))
        AND (p_shape_id    IS NULL OR cdp.shape_id          = LOWER(p_shape_id))
        AND (p_color       IS NULL OR UPPER(cdp.color)      = UPPER(p_color))
        AND (p_clarity     IS NULL OR UPPER(cdp.clarity)    = UPPER(p_clarity))
        AND (p_carat_range IS NULL OR cdp.carat_range       = p_carat_range)
    ),
    deduped AS (
      SELECT DISTINCT ON (r.stone_type, r.shape_id, r.carat_range, r.color, r.clarity)
        r.*
      FROM raw r
      ORDER BY r.stone_type, r.shape_id, r.carat_range, r.color, r.clarity,
               COALESCE(r.custom_price, r.base_price) DESC,
               r.report_no NULLS LAST   -- prefer rows that have a cert number
    )
    SELECT
      d.id, d.stone_type, d.shape_id, d.carat_range, d.carat_value,
      d.color, d.clarity, d.base_price, d.custom_price, d.is_enabled,
      COUNT(*) OVER ()::bigint AS total_count,
      d.source_pool_id AS pool_id,   -- NEW
      d.report_no                    -- NEW
    FROM deduped d
    ORDER BY d.stone_type, COALESCE(d.custom_price, d.base_price) DESC, d.color, d.clarity
    LIMIT p_page_size OFFSET p_offset;
    RETURN;
  END IF;

  -- ── Pool path (confirmed catalog filter) ───────────────────────────────────
  v_filter := COALESCE(v_filter_row.filter, '{}'::jsonb);
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'stoneTypes'))) INTO v_stone;
  SELECT ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter->'shapes')))     INTO v_shapes;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'colors')))     INTO v_colors;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'clarities')))  INTO v_clar;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'cuts')))       INTO v_cuts;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'polish')))     INTO v_pol;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'symmetry')))   INTO v_symm;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'fluorescence'))) INTO v_flo;
  SELECT ARRAY(SELECT UPPER(jsonb_array_elements_text(v_filter->'labs')))       INTO v_labs;
  v_carat_min    := NULLIF(v_filter->>'caratMin','')::numeric;
  v_carat_max    := NULLIF(v_filter->>'caratMax','')::numeric;
  SELECT ARRAY(SELECT (jsonb_array_elements_text(v_filter->'caratRanges'))::numeric) INTO v_carat_ranges;
  v_len_min      := NULLIF(v_filter->>'lengthMin','')::numeric;
  v_len_max      := NULLIF(v_filter->>'lengthMax','')::numeric;
  v_canadian     := COALESCE((v_filter->>'canadianOnly')::boolean, false);

  RETURN QUERY
  WITH base AS (
    SELECT
      p.id,
      CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END          AS diamond_stone_type,
      LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1))    AS diamond_shape_id,
      p.carats                                                                         AS diamond_carat_value,
      UPPER(COALESCE(p.col,''))                                                        AS diamond_color,
      UPPER(COALESCE(p.clar,''))                                                       AS diamond_clarity,
      ROUND(
        COALESCE(p.price,0) *
        (1 + (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%'
                   THEN v_filter_row.markup_lab
                   ELSE v_filter_row.markup_natural END) / 100.0)
      , 2)                                                                             AS diamond_base_price,
      FLOOR(COALESCE(p.carats,0) * 2) / 2                                             AS diamond_carat_bucket,
      p.report_no                                                                      AS diamond_report_no  -- NEW
    FROM public.diamond_inventory_pool p
    WHERE
      (COALESCE(array_length(v_stone,1),0)  = 0 OR (CASE WHEN COALESCE(p.lg,'') ILIKE 'Y%' THEN 'lab' ELSE 'natural' END) = ANY(v_stone))
      AND (COALESCE(array_length(v_shapes,1),0) = 0 OR LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) = ANY(v_shapes))
      AND (COALESCE(array_length(v_colors,1),0) = 0 OR UPPER(COALESCE(p.col,''))  = ANY(v_colors))
      AND (COALESCE(array_length(v_clar,1),0)   = 0 OR UPPER(COALESCE(p.clar,'')) = ANY(v_clar))
      AND (COALESCE(array_length(v_cuts,1),0)   = 0 OR UPPER(COALESCE(p.cut,''))  = ANY(v_cuts))
      AND (COALESCE(array_length(v_pol,1),0)    = 0 OR UPPER(COALESCE(p.pol,''))  = ANY(v_pol))
      AND (COALESCE(array_length(v_symm,1),0)   = 0 OR UPPER(COALESCE(p.symm,'')) = ANY(v_symm))
      AND (COALESCE(array_length(v_flo,1),0)    = 0 OR UPPER(COALESCE(p.flo,''))  = ANY(v_flo))
      AND (COALESCE(array_length(v_labs,1),0)   = 0 OR UPPER(COALESCE(p.lab,''))  = ANY(v_labs))
      AND (v_carat_min IS NULL OR COALESCE(p.carats,0) >= v_carat_min)
      AND (v_carat_max IS NULL OR COALESCE(p.carats,0) <= v_carat_max)
      AND (COALESCE(array_length(v_carat_ranges,1),0) = 0 OR (FLOOR(COALESCE(p.carats,0) * 2) / 2) = ANY(v_carat_ranges))
      AND (v_len_min IS NULL OR COALESCE(p.length,0) >= v_len_min)
      AND (v_len_max IS NULL OR COALESCE(p.length,0) <= v_len_max)
      AND (NOT v_canadian OR COALESCE(p.canada_mark_eligible,false))
  ),
  filtered AS (
    SELECT * FROM base b
    WHERE (p_stone_type IS NULL OR b.diamond_stone_type = LOWER(p_stone_type))
      AND (p_shape_id   IS NULL OR b.diamond_shape_id   = LOWER(p_shape_id))
      AND (p_color      IS NULL OR b.diamond_color       = UPPER(p_color))
      AND (p_clarity    IS NULL OR b.diamond_clarity     = UPPER(p_clarity))
  ),
  ranged AS (
    SELECT
      f.*,
      TRIM(TO_CHAR(f.diamond_carat_bucket, 'FM0.00')) || '-' || TRIM(TO_CHAR(f.diamond_carat_bucket + 0.49, 'FM0.00')) AS diamond_carat_range
    FROM filtered f
  ),
  -- Pick the highest-priced diamond per (stone_type, shape, carat_range, color, clarity).
  -- Prefer rows with a non-null report_no so that the cert is always available.
  deduped AS (
    SELECT DISTINCT ON (r.diamond_stone_type, r.diamond_shape_id, r.diamond_carat_range, r.diamond_color, r.diamond_clarity)
      r.id,
      r.diamond_stone_type,
      r.diamond_shape_id,
      r.diamond_carat_range,
      r.diamond_carat_value,
      r.diamond_color,
      r.diamond_clarity,
      r.diamond_base_price,
      r.diamond_report_no   -- NEW
    FROM ranged r
    WHERE (p_carat_range IS NULL OR r.diamond_carat_range = p_carat_range)
    ORDER BY r.diamond_stone_type, r.diamond_shape_id, r.diamond_carat_range,
             r.diamond_color, r.diamond_clarity,
             r.diamond_base_price DESC,
             r.diamond_report_no NULLS LAST   -- prefer cert-bearing rows at equal price
  )
  SELECT
    d.id,
    d.diamond_stone_type  AS stone_type,
    d.diamond_shape_id    AS shape_id,
    d.diamond_carat_range AS carat_range,
    d.diamond_carat_value AS carat_value,
    d.diamond_color       AS color,
    d.diamond_clarity     AS clarity,
    d.diamond_base_price  AS base_price,
    NULL::numeric         AS custom_price,
    true                  AS is_enabled,
    COUNT(*) OVER ()::bigint AS total_count,
    d.id                  AS pool_id,          -- NEW: same as id in pool path
    d.diamond_report_no   AS report_no         -- NEW: certificate number
  FROM deduped d
  ORDER BY d.diamond_stone_type, d.diamond_base_price DESC, d.diamond_color, d.diamond_clarity
  LIMIT p_page_size OFFSET p_offset;
END;
$function$;

```

---

## `supabase/migrations/20260529033626_f5c764e4-0fa9-4741-9b08-a278e323b1ea.sql`

```sql
-- Harden sync_client_diamond_catalog_from_filter against DB wedging.
-- Changes vs current definition (identity-preserving):
--   1. statement_timeout lowered from 600s -> 45s. A single bad call can no longer
--      hold a connection for 10 minutes; it will fail fast and free the slot.
--   2. Per-client advisory transaction lock so concurrent saves for the same client
--      serialize instead of stacking up and pinning multiple connections.
--   3. On lock contention we return a clean { success:false, reason:'sync_in_progress' }
--      instead of piling on.
-- Body logic is byte-for-byte the same as the existing function below the guard;
-- RPC signature and return shape are unchanged.

CREATE OR REPLACE FUNCTION public.sync_client_diamond_catalog_from_filter(p_client_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '45s'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_filter jsonb;
  v_markup_natural numeric := 0;
  v_markup_lab numeric := 0;
  v_wizard jsonb;
  v_version uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_presets_count integer := 0;
  v_carat_ranges numeric[];
  v_stone_types text[];
  v_shapes text[];
  v_coverage numeric := 0;
  v_missing integer := 0;
  v_filter_hash text;
  v_got_lock boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF NOT (
    public.has_role(v_actor, 'agency_admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = p_client_id AND c.user_id = v_actor)
    OR EXISTS (
      SELECT 1 FROM public.staff_members sm
      WHERE sm.user_id = v_actor AND sm.client_id = p_client_id AND sm.status = 'active'
        AND (sm.permissions ->> 'catalog_access' = 'edit' OR sm.permissions ->> 'catalog_access' = 'true')
    )
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Per-client advisory lock (transaction-scoped). Prevents stacking saves
  -- for the same client from pinning multiple connections.
  v_got_lock := pg_try_advisory_xact_lock(
    hashtext('sync_client_diamond_catalog_from_filter'),
    hashtextextended(p_client_id::text, 0)
  );
  IF NOT v_got_lock THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'sync_in_progress',
      'message', 'Another catalog sync for this client is already running. Try again in a few seconds.'
    );
  END IF;

  SELECT filter, markup_natural, markup_lab
    INTO v_filter, v_markup_natural, v_markup_lab
    FROM public.client_diamond_catalog_filter
   WHERE client_id = p_client_id;

  IF v_filter IS NULL THEN
    RAISE EXCEPTION 'no_filter_to_sync';
  END IF;

  v_stone_types := COALESCE(ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter -> 'stoneTypes'))), ARRAY[]::text[]);
  v_shapes := COALESCE(ARRAY(SELECT LOWER(jsonb_array_elements_text(v_filter -> 'shapes'))), ARRAY[]::text[]);
  v_carat_ranges := COALESCE(ARRAY(SELECT (jsonb_array_elements_text(v_filter -> 'caratRanges'))::numeric), ARRAY[]::numeric[]);

  v_wizard := jsonb_build_object(
    'diamondType', jsonb_build_object(
      'naturalEnabled', 'natural' = ANY(v_stone_types),
      'labGrownEnabled', 'lab' = ANY(v_stone_types),
      'certifications', '["GIA"]'::jsonb
    ),
    'shapes', jsonb_build_object('selectedShapes', COALESCE(v_filter -> 'shapes', '[]'::jsonb)),
    'grading', jsonb_build_object(
      'colors', COALESCE(v_filter -> 'colors', '[]'::jsonb),
      'clarities', COALESCE(v_filter -> 'clarities', '[]'::jsonb),
      'cutGrades', COALESCE(v_filter -> 'cuts', '[]'::jsonb),
      'polish', COALESCE(v_filter -> 'polish', '[]'::jsonb),
      'symmetry', COALESCE(v_filter -> 'symmetry', '[]'::jsonb),
      'fluorescence', COALESCE(v_filter -> 'fluorescence', '[]'::jsonb),
      'labs', COALESCE(v_filter -> 'labs', '[]'::jsonb),
      'caratRange', jsonb_build_array(
        COALESCE(NULLIF(v_filter ->> 'caratMin','')::numeric, 0.50),
        COALESCE(NULLIF(v_filter ->> 'caratMax','')::numeric, 5.00)
      )
    ),
    'pricing', jsonb_build_object(
      'pricingMethod','percentage',
      'currency','USD',
      'naturalMarkupTiers', jsonb_build_array(jsonb_build_object('caratMin',0,'caratMax',999,'markup',v_markup_natural)),
      'labMarkupTiers', jsonb_build_array(jsonb_build_object('caratMin',0,'caratMax',999,'markup',v_markup_lab))
    ),
    'productSettings', '{}'::jsonb
  );

  BEGIN
    PERFORM public.generate_client_diamond_presets_db(p_client_id, v_wizard);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.client_catalog_health AS h
      (client_id, catalog_version, presets_count, last_error, last_refresh_at, updated_at)
    VALUES (p_client_id, v_version, 0, SQLERRM, v_now, v_now)
    ON CONFLICT (client_id) DO UPDATE SET
      catalog_version = v_version, presets_count = 0, last_error = SQLERRM,
      last_refresh_at = v_now, updated_at = v_now;
    RAISE;
  END;

  UPDATE public.client_diamond_presets
     SET catalog_version = v_version
   WHERE client_id = p_client_id;

  UPDATE public.client_diamond_catalog_filter
     SET catalog_version = v_version, applied_at = v_now, updated_at = v_now
   WHERE client_id = p_client_id;

  SELECT COUNT(*) INTO v_presets_count
    FROM public.client_diamond_presets WHERE client_id = p_client_id;

  DELETE FROM public.client_carat_options WHERE client_id = p_client_id;
  IF v_carat_ranges IS NULL OR cardinality(v_carat_ranges) = 0 THEN
    v_carat_ranges := ARRAY(
      SELECT b FROM unnest(ARRAY[0.5,1.0,1.5,2.0,2.5,3.0,3.5,4.0,4.5,5.0]::numeric[]) b
      WHERE (NULLIF(v_filter->>'caratMin','')::numeric IS NULL
             OR b >= floor((v_filter->>'caratMin')::numeric * 2)/2)
        AND (NULLIF(v_filter->>'caratMax','')::numeric IS NULL
             OR b <= (v_filter->>'caratMax')::numeric)
    );
  END IF;
  IF v_carat_ranges IS NOT NULL AND cardinality(v_carat_ranges) > 0 THEN
    INSERT INTO public.client_carat_options (client_id, carat_value, display_name, is_enabled, price_adjustment)
    SELECT p_client_id, bucket,
           trim(to_char(bucket, 'FM0.00')) || ' - ' || trim(to_char(bucket + 0.49, 'FM0.00')),
           true, 0
      FROM unnest(v_carat_ranges) bucket;
  END IF;

  IF cardinality(v_shapes) > 0 AND cardinality(v_stone_types) > 0 AND cardinality(v_carat_ranges) > 0 THEN
    WITH selected AS (
      SELECT s AS shape, st AS stone_type, c AS carat_bucket
        FROM unnest(v_shapes) s
        CROSS JOIN unnest(v_stone_types) st
        CROSS JOIN unnest(v_carat_ranges) c
    ), stocked AS (
      SELECT DISTINCT
        LOWER(SPLIT_PART(REGEXP_REPLACE(COALESCE(p.shape,''),'\s+',' ','g'),' ',1)) AS shape,
        public.diamond_pool_stone_type(p.lg) AS stone_type,
        FLOOR(COALESCE(p.carats,0) * 2) / 2 AS carat_bucket
      FROM public.diamond_inventory_pool p
    )
    SELECT
      COALESCE(ROUND(100.0 * SUM(CASE WHEN st.shape IS NOT NULL THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 2), 0),
      COUNT(*) - SUM(CASE WHEN st.shape IS NOT NULL THEN 1 ELSE 0 END)
      INTO v_coverage, v_missing
    FROM selected sel
    LEFT JOIN stocked st
      ON st.shape = sel.shape AND st.stone_type = sel.stone_type AND st.carat_bucket = sel.carat_bucket;
  END IF;

  v_filter_hash := md5(v_filter::text);

  INSERT INTO public.client_catalog_health AS h
    (client_id, catalog_version, filter_hash, presets_count, pool_coverage_pct,
     missing_combinations, last_error, last_refresh_at, updated_at)
  VALUES (p_client_id, v_version, v_filter_hash, v_presets_count, COALESCE(v_coverage,0),
          COALESCE(v_missing,0), NULL, v_now, v_now)
  ON CONFLICT (client_id) DO UPDATE SET
    catalog_version = v_version, filter_hash = v_filter_hash,
    presets_count = v_presets_count, pool_coverage_pct = COALESCE(v_coverage,0),
    missing_combinations = COALESCE(v_missing,0), last_error = NULL,
    last_refresh_at = v_now, updated_at = v_now;

  RETURN jsonb_build_object(
    'success', true,
    'catalogVersion', v_version,
    'presetsCount', v_presets_count,
    'poolCoveragePct', COALESCE(v_coverage,0),
    'missingCombinations', COALESCE(v_missing,0)
  );
END;
$function$;
```

---

## `.lovable/changelog-diamond-pool-catalog.md`

```md
# Diamond Catalog — Pool-Driven Rewrite

**Date:** 2026-05-25

## What changed
Replaced the 6-step `DiamondCatalogWizard` in **Client → Catalog → Diamonds** with a live, pool-driven catalog (`DiamondCatalogLive`). Clients now see every diamond from `diamond_inventory_pool` immediately. A left sidebar with the same option groups the wizard used to ask for narrows the grid in real time. Two markup % inputs (Natural / Lab) recompute displayed prices live. **Confirm Catalog** persists the filter + markup; from then on the Ring OS widget shows exactly that filtered, marked-up slice — and it auto-refreshes when admin uploads new matching stock.

## Files
**Added**
- `supabase/migrations/2026...client_diamond_catalog_filter` — table + RPC rewrite + preview RPC
- `src/components/catalog/diamond-catalog/DiamondCatalogLive.tsx`

**Edited**
- `src/pages/client/Catalog.tsx` — Diamonds tab: replaced editable branch (wizard + dropdown filters + grid) with `<DiamondCatalogLive />`. Import swapped.

**Untouched (deliberately, for widget liveness)**
- All Ring OS widget files (`StoneStep`, `WizardRingBuilder`, `ElegantConfigurationPanel`, `DiamondDetailInfoDialog`, `EmbedConfigurator`, `CustomRingBuilder`, `ring-chat`, `shopify-add-to-cart`, `estimate-lead-cost`)
- `useClientDiamondPresets` hook
- Legacy `DiamondCatalogWizard` files (kept on disk, no longer imported)
- Legacy `client_diamond_presets` table (kept for fallback)

## DB changes
1. New table `client_diamond_catalog_filter (client_id PK, filter jsonb, markup_natural, markup_lab, is_confirmed, confirmed_at)` with RLS mirroring `client_diamond_presets`.
2. New helper `diamond_pool_row_matches(row, filter)`.
3. **Rewrote** `get_diamond_presets_filtered` — same signature, same return shape. When the client has `is_confirmed = true`, streams from pool with markup applied; otherwise falls back to legacy `client_diamond_presets` (zero downtime).
4. New RPC `get_diamond_pool_preview(filter, markup_natural, markup_lab, page_size, offset)` for in-progress preview.
5. New RPC `get_diamond_pool_filter_count(filter)` for badge counts.

## Backward compatibility / widget liveness
- Widget RPC signature **unchanged**; widget never knows the source switched.
- Clients with no filter row continue to see their legacy generated presets.
- Once a client confirms a new filter, only that path is used.
- Rollback = revert this migration (drops new table, restores old RPC body) + restore the wizard branch in `Catalog.tsx`.

## Rollback steps
1. `DROP TABLE public.client_diamond_catalog_filter CASCADE;`
2. Restore the previous `get_diamond_presets_filtered` body (see migration `20260522112834...`).
3. Revert `src/pages/client/Catalog.tsx` (re-import `DiamondCatalogWizard`, restore the `hasDiamondCatalog ? ... : <Wizard/>` branch).
4. Delete `src/components/catalog/diamond-catalog/DiamondCatalogLive.tsx`.

## Known follow-ups (not done in this pass)
- Mass Edit Prices dialog is no longer reachable from the new UI (replaced by markup %). Files still on disk.
- Currency conversion: pool `price` is assumed to already be in client currency. Multi-currency clients may need a conversion factor in the RPC later.
- Legacy `client_diamond_presets` + chunk RPCs can be dropped after one release.

```
