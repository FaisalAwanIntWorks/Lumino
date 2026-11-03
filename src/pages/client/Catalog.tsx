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
import { getCurrencySymbol, formatCurrency } from "@/lib/pricing-utils";
import { skipsShopifyCatalog, type WidgetPricingMode } from "@/lib/widget-pricing-mode";
import { usesDiamondTypeCheckout } from "@/lib/ring-os-diamond-checkout";
import {
  RING_OS_CURRENCIES,
  RING_OS_CURRENCY_META,
  normalizeRingOsCurrency,
  readRingOsPrice,
  usesRingOsCurrency,
  type RingOsCurrency,
} from "@/lib/ring-os-currency";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  const { currency: clientCurrency, loading: currencyLoading } = useClientCurrency(clientId);
  // Ring OS catalogue currency (Sandbox only — src/lib/ring-os-currency.ts).
  // liveRingCurrency = what the widget shows now; catalogCurrency = the wizard
  // choice, saved by generate-client-catalog on (re)generate. Ring step prices
  // are typed in that currency and never converted.
  const isCurrencyClient = usesRingOsCurrency(clientId);
  const [liveRingCurrency, setLiveRingCurrency] = useState<RingOsCurrency>('USD');
  const [catalogCurrency, setCatalogCurrency] = useState<RingOsCurrency>('USD');
  const [optionPriceRows, setOptionPriceRows] = useState<any[]>([]);
  const [metalPriceRows, setMetalPriceRows] = useState<any[]>([]);
  const [fxRates, setFxRates] = useState<{ GBP: number; CAD: number } | null>(null);
  const [currencyDialogOpen, setCurrencyDialogOpen] = useState(false);
  const wizardCurrency: string = isCurrencyClient ? catalogCurrency : clientCurrency;
  const liveCurrency: string = isCurrencyClient ? liveRingCurrency : clientCurrency;
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
  const [pricingMode, setPricingMode] = useState<WidgetPricingMode>('estimates');
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

      if (usesRingOsCurrency(fetchedClientId)) {
        const [{ data: currencyRow }, { data: fxData }] = await Promise.all([
          (supabase as any).from("clients").select("ring_catalog_currency").eq("id", fetchedClientId).maybeSingle(),
          (supabase as any).rpc("get_diamond_fx_published_rates"),
        ]);
        const savedCurrency = normalizeRingOsCurrency(currencyRow?.ring_catalog_currency);
        setLiveRingCurrency(savedCurrency);
        setCatalogCurrency(savedCurrency);
        setFxRates(fxData ? { GBP: Number(fxData.gbp_effective_rate), CAD: Number(fxData.cad_effective_rate) } : null);
      }

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
        setPricingMode(((prefsData as any).widget_pricing_mode as WidgetPricingMode) || 'estimates');
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
      if (canHydratePrices) setOptionPriceRows(pricesData || []);
      if (canHydrateMetals) setMetalPriceRows(metalVariantsData || []);

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

  const selectAllKarats = (colorId: string, options: { value: string; label: string }[]) => {
    setMetalVariants(prev => {
      const existing = prev[colorId] || [];
      const next = [...existing];
      options.forEach(opt => {
        const variantName = getKaratVariantName(colorId, opt.value, opt.label);
        if (!next.find(v => v.name === variantName)) {
          next.push({ id: `${colorId}-${opt.value}`, name: variantName, price: 0 });
        }
      });
      return { ...prev, [colorId]: next };
    });
  };

  const clearAllKarats = (colorId: string) => {
    setMetalVariants(prev => ({ ...prev, [colorId]: [] }));
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
          ...(isCurrencyClient ? { currency: catalogCurrency } : {}),
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
      setCurrencyDialogOpen(false);
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
      {isCurrencyClient
        ? <span className="text-xs text-muted-foreground">{getCurrencySymbol(wizardCurrency)}</span>
        : <DollarSign className="w-3 h-3 text-muted-foreground" />}
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
                  <p className="text-sm sm:text-base font-bold text-foreground">${p.pricePerOz.toLocaleString()}<span className="text-[10px] text-muted-foreground"> USD/oz</span></p>
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
                <InfoTooltip text="How customer-facing metal add-ons are calculated. Formula: weight (g) × purity × spot (USD/g) × markup, plus a 5% rhodium surcharge on white gold. Result is added on top of the base ring (style + shank) price." />
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
              <InfoTooltip text="Fills in any variant whose price is zero using the current live spot prices and your markups. Manually-edited prices are never overwritten — clear a price to zero first if you want it recomputed." />
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
                  <div className="flex items-center justify-between gap-2 flex-wrap">
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
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => selectAllKarats(colorId, options)}
                        disabled={(metalVariants[colorId] || []).length >= options.length}
                      >
                        Select All
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => clearAllKarats(colorId)}
                        disabled={(metalVariants[colorId] || []).length === 0}
                      >
                        Clear
                      </Button>
                      <VariantCountBadge count={(metalVariants[colorId] || []).length} />
                    </div>
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
                    const spotNote = isCurrencyClient && wizardCurrency !== 'USD'
                      ? ` Spot prices are USD — type your ${wizardCurrency} price (no conversion).`
                      : '';
                    if (karatKey === 'platinum' && ptOzLive) {
                      const wt = (BLENDED_GOLD_WEIGHT_G * PLATINUM_DENSITY_FACTOR).toFixed(1);
                      const perG = (ptOzLive / OZ_TO_GRAM).toFixed(2);
                      const computed = computeMetalAddOn({ karat: 'platinum', colorFamily: 'white', spotGoldPerOz: goldOzLive ?? 0, spotPlatinumPerOz: ptOzLive, spotSilverPerOz: agOzLive ?? 0, markups: metalMarkups });
                      mathTip = `${wt}g × ${(PLATINUM_PURITY * 100).toFixed(1)}% × ${perG} USD/g × ${metalMarkups.platinum}× ≈ ${formatCurrency(computed, isCurrencyClient ? 'USD' : clientCurrency)}${spotNote}. Auto weight = 4g × 1.4 density.`;
                    } else if (colorId === 'silver' && agOzLive) {
                      const perG = (agOzLive / OZ_TO_GRAM).toFixed(2);
                      const computed = computeMetalAddOn({ karat: 'silver', colorFamily: 'silver', spotGoldPerOz: goldOzLive ?? 0, spotPlatinumPerOz: ptOzLive ?? 0, spotSilverPerOz: agOzLive, markups: metalMarkups });
                      mathTip = `${SILVER_BLENDED_WEIGHT_G}g × ${(SILVER_PURITY * 100).toFixed(1)}% × ${perG} USD/g × ${metalMarkups.silver}× ≈ ${formatCurrency(computed, isCurrencyClient ? 'USD' : clientCurrency)}${spotNote}.`;
                    } else if (KARAT_PURITY[karatKey] && goldOzLive) {
                      const purity = KARAT_PURITY[karatKey];
                      const perG = (goldOzLive / OZ_TO_GRAM).toFixed(2);
                      const isWhite = colorId === 'white';
                      const computed = computeMetalAddOn({ karat: karatKey, colorFamily: colorId as MetalColorFamily, spotGoldPerOz: goldOzLive, spotPlatinumPerOz: ptOzLive ?? 0, spotSilverPerOz: agOzLive ?? 0, markups: metalMarkups });
                      mathTip = `${BLENDED_GOLD_WEIGHT_G}g × ${(purity * 100).toFixed(1)}% × ${perG} USD/g × ${metalMarkups.gold}×${isWhite ? ` × ${(1 + RHODIUM_SURCHARGE).toFixed(2)} (rhodium)` : ''} ≈ ${formatCurrency(computed, isCurrencyClient ? 'USD' : clientCurrency)}${spotNote}.`;
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
                            {isCurrencyClient
                              ? <span className="text-xs text-muted-foreground">{getCurrencySymbol(wizardCurrency)}</span>
                              : <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />}
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

  // Switching the wizard currency never converts numbers: it loads what was
  // typed for that currency before and otherwise keeps the current numbers for
  // the jeweler to check. Nothing is saved until (Re)generate.
  const handleCatalogCurrencyChange = (next: RingOsCurrency) => {
    if (next === catalogCurrency) return;
    setCatalogCurrency(next);
    setPrices(prev => {
      const out: OptionPrices = { styles: { ...prev.styles }, shanks: { ...prev.shanks } };
      optionPriceRows.forEach((row) => {
        const type = row.option_type as keyof OptionPrices;
        const saved = readRingOsPrice(row, next);
        if (out[type] && saved !== null) out[type][row.option_id] = saved;
      });
      return out;
    });
    setMetalVariants(prev => {
      const byName = new Map(metalPriceRows.map((r) => [String(r.variant_name).toLowerCase().trim(), r]));
      const out: MetalVariantsByColor = {};
      Object.entries(prev).forEach(([family, list]) => {
        out[family] = list.map((v) => {
          const saved = readRingOsPrice(byName.get(v.name.toLowerCase().trim()), next);
          return saved !== null ? { ...v, price: saved } : v;
        });
      });
      return out;
    });
  };

  const renderCurrencyStep = () => (
    <div className="rounded-lg sm:rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm sm:text-base font-semibold text-foreground">Step 0 · Catalogue currency</p>
          <p className="text-xs sm:text-sm text-muted-foreground">
            The style, shank and metal prices you enter are in this currency (numbers are not converted). Diamonds show the
            admin-approved prices for the same currency, so the whole ring stays in one currency.
          </p>
        </div>
        {ringCatalogGenerated && (
          <Badge variant="secondary" className="shrink-0">Live: {liveRingCurrency}</Badge>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {RING_OS_CURRENCIES.map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => handleCatalogCurrencyChange(code)}
            className={`rounded-lg border px-2 py-2 sm:py-3 text-center transition-all ${
              catalogCurrency === code
                ? 'border-primary bg-primary/20 shadow-sm'
                : 'border-border/50 bg-card/50 hover:border-primary/50'
            }`}
          >
            <span className="block text-lg sm:text-xl font-bold text-foreground">{RING_OS_CURRENCY_META[code].symbol}</span>
            <span className="block text-[10px] sm:text-xs text-muted-foreground">{code} · {RING_OS_CURRENCY_META[code].label}</span>
          </button>
        ))}
      </div>
      {ringCatalogGenerated && catalogCurrency !== liveRingCurrency && (
        <Alert className="bg-amber-500/10 border-amber-500/30">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-xs sm:text-sm">
            Your live catalogue is in {liveRingCurrency}. Check every price in {catalogCurrency} on the steps below, then press
            Regenerate Catalog on Review. Until then the widget keeps {liveRingCurrency}. Regenerating rebuilds your ring products,
            the same as any regenerate.
          </AlertDescription>
        </Alert>
      )}
      {catalogCurrency !== 'USD' && !fxRates && (
        <Alert className="bg-amber-500/10 border-amber-500/30">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="text-xs sm:text-sm">
            No {catalogCurrency} diamond prices are published yet. Ring OS shows no diamonds in {catalogCurrency} until the JewlX
            admin applies exchange rates (Admin → Diamond Pool → Currency Pricing).
          </AlertDescription>
        </Alert>
      )}
    </div>
  );

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
              <div className="bg-card rounded-lg sm:rounded-xl p-4 sm:p-6 border border-border">
                <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-3 sm:mb-4">Your Selections & Pricing</h3>
                
                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1.5 sm:mb-2">Styles</p>
                    <div className="flex flex-wrap gap-1 sm:gap-2">
                      {selections.styles.map(s => {
                        const opt = styleOptions.find(o => o.style_id === s);
                        return (
                          <Badge key={s} variant="secondary" className="text-[10px] sm:text-sm py-0.5 sm:py-1 px-2 sm:px-3">
                            {opt?.style_name} - {getCurrencySymbol(wizardCurrency)}{prices.styles[s]?.toLocaleString()}
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
                            {opt?.shank_name} - {getCurrencySymbol(wizardCurrency)}{prices.shanks[s]?.toLocaleString()}
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
                            {v.name} - {getCurrencySymbol(wizardCurrency)}{v.price.toLocaleString()}
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
                  <p className="text-2xl sm:text-4xl font-bold text-emerald-500">{getCurrencySymbol(wizardCurrency)}{calculateEstimatedBasePrice().toLocaleString()}</p>
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
        {isCurrencyClient && renderCurrencyStep()}

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

  if (loading || currencyLoading) {
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
              {isCurrencyClient && canEditCatalog && (
                <Card className="p-3 sm:p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="text-sm sm:text-base font-semibold">
                        Catalogue currency: {RING_OS_CURRENCY_META[liveRingCurrency].symbol} {liveRingCurrency}
                      </p>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Ring prices and diamond prices in Ring OS use this currency. Change it to re-enter your prices in USD, GBP or CAD.
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => { handleCatalogCurrencyChange(liveRingCurrency); setCurrentStep(1); setCurrencyDialogOpen(true); }}>
                      Change currency
                    </Button>
                  </div>
                </Card>
              )}
              {isCurrencyClient && (
                <Dialog open={currencyDialogOpen} onOpenChange={setCurrencyDialogOpen}>
                  <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Change catalogue currency</DialogTitle>
                      <DialogDescription>
                        Pick the currency, review the prices on each step in that currency, then Regenerate Catalog.
                      </DialogDescription>
                    </DialogHeader>
                    {renderQuestionnaire()}
                  </DialogContent>
                </Dialog>
              )}

              {/* Widget Pricing Mode Toggle */}
              {clientId && (
                <WidgetPricingModeCard clientId={clientId} currency={liveCurrency} />
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
                                disabled={isPushingToShopify || (skipsShopifyCatalog(pricingMode) && !usesDiamondTypeCheckout(clientId))}
                                title={(skipsShopifyCatalog(pricingMode) && !usesDiamondTypeCheckout(clientId)) ? 'Disabled in Estimates / No-Deposit mode — products are not pushed to Shopify.' : undefined}
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
                              disabled={isPushingToShopify || !shopifyConnected || pendingCount === 0 || (skipsShopifyCatalog(pricingMode) && !usesDiamondTypeCheckout(clientId))}
                              title={
                                pricingMode === 'estimates'
                                  ? "Disabled in Estimates mode — ring products stay in JewlX. Only the deposit is sent to Shopify at checkout."
                                  : pricingMode === 'no_deposit'
                                  ? "Disabled in No-Deposit mode — the widget captures a lead instead of sending customers to Shopify checkout."
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
                              {!(skipsShopifyCatalog(pricingMode) && !usesDiamondTypeCheckout(clientId)) && pendingCount > 0 && ` (${pendingCount})`}
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
                    Deposit-based pricing is active. Your {clientCatalog.length} ring products stay in JewlX and are not pushed to Shopify. When a customer checks out, their full ring + diamond configuration is passed to Shopify as line item details, and the order total is your fixed deposit{depositAmount > 0 ? ` (${getCurrencySymbol(liveCurrency)}${depositAmount.toLocaleString()})` : ''}.
                  </AlertDescription>
                </Alert>
              )}

              {/* No-Deposit mode info banner */}
              {pricingMode === 'no_deposit' && canEditCatalog && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    No-Deposit mode is active. Your {clientCatalog.length} ring products stay in JewlX and are not pushed to Shopify. At the last step of the widget, customers submit a short contact form instead of checking out — each submission is saved as a lead with the full ring + diamond configuration and synced to your CRM.
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
                                  <span className="font-semibold">{formatCurrency(totalPrice, liveCurrency)}</span>
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
                              return formatCurrency(displayPrice, liveCurrency);
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
                              currency={isCurrencyClient ? liveRingCurrency : "USD"}
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
                  ringCurrency={isCurrencyClient ? liveRingCurrency : undefined}
                  fxRates={isCurrencyClient ? fxRates : null}
                  onChangeCurrency={isCurrencyClient && hasCatalog && canEditCatalog
                    ? () => { handleCatalogCurrencyChange(liveRingCurrency); setCurrentStep(1); setActiveTab("your-catalogue"); setCurrencyDialogOpen(true); }
                    : undefined}
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
