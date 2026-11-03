import { useEffect, useState } from 'react';
import { useClientTimezone } from '@/hooks/useClientTimezone';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { useAuth } from '@/contexts/AuthContext';
import { getPageCache, setPageCache, resolveOwnClientId } from '@/lib/page-cache';
import { MetalPriceRow, PriceAlertBanner } from '@/components/live-prices';
import {
  getCurrentPrices,
  MetalPrice,
  getAlertLevel,
} from '@/lib/metal-prices-api';
import { cn } from '@/lib/utils';

interface SnapshotPrices {
  gold: number;
  silver: number;
  platinum: number;
}

interface LivePricesCache {
  prices: MetalPrice[];
  isDemo: boolean;
  lastUpdated: Date | null;
  snapshotPrices: SnapshotPrices | null;
  catalogCreatedAt: Date | null;
}

export default function LivePrices() {
  const { impersonatedClientId } = useAdminImpersonation();
  const { user } = useAuth();
  const clientTimezone = useClientTimezone();
  // Last loaded prices for this account, shown instantly while fresh ones load.
  const cacheKey = impersonatedClientId ? `live-prices:client:${impersonatedClientId}` : user?.id ? `live-prices:user:${user.id}` : null;
  const cached = getPageCache<LivePricesCache>(cacheKey);
  const [prices, setPrices] = useState<MetalPrice[]>(() => cached?.prices ?? []);
  const [snapshotPrices, setSnapshotPrices] = useState<SnapshotPrices | null>(() => cached?.snapshotPrices ?? null);
  const [catalogCreatedAt, setCatalogCreatedAt] = useState<Date | null>(() => cached?.catalogCreatedAt ?? null);
  const [loading, setLoading] = useState(() => !cached);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(() => cached?.lastUpdated ?? null);
  const [isDemo, setIsDemo] = useState(() => cached?.isDemo ?? true);

  useEffect(() => {
    loadPriceData();
  }, [impersonatedClientId]);

  const loadSnapshot = async (): Promise<{ snapshotPrices: SnapshotPrices | null; catalogCreatedAt: Date | null } | undefined> => {
    // Local session read (no auth-server round trip); client id is cached per session.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return undefined;
    const clientId = impersonatedClientId || await resolveOwnClientId(session.user.id);
    if (!clientId) return undefined;
    const { data: snapshot } = await supabase
      .from('metal_price_snapshots')
      .select('gold_price, silver_price, platinum_price, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!snapshot) return { snapshotPrices: null, catalogCreatedAt: null };
    return {
      snapshotPrices: {
        gold: Number(snapshot.gold_price),
        silver: Number(snapshot.silver_price),
        platinum: Number(snapshot.platinum_price),
      },
      catalogCreatedAt: new Date(snapshot.created_at),
    };
  };

  const loadPriceData = async () => {
    try {
      if (!getPageCache(cacheKey)) setLoading(true);
      // Prices and the client's stored snapshot load in parallel.
      const [priceResponse, snapshot] = await Promise.all([getCurrentPrices(), loadSnapshot()]);
      setPrices(priceResponse.prices);
      setIsDemo(priceResponse.isDemo);
      setLastUpdated(priceResponse.lastUpdated);
      if (snapshot) {
        setSnapshotPrices(snapshot.snapshotPrices);
        setCatalogCreatedAt(snapshot.catalogCreatedAt);
      }
      setPageCache<LivePricesCache>(cacheKey, {
        prices: priceResponse.prices,
        isDemo: priceResponse.isDemo,
        lastUpdated: priceResponse.lastUpdated,
        snapshotPrices: snapshot ? snapshot.snapshotPrices : (getPageCache<LivePricesCache>(cacheKey)?.snapshotPrices ?? null),
        catalogCreatedAt: snapshot ? snapshot.catalogCreatedAt : (getPageCache<LivePricesCache>(cacheKey)?.catalogCreatedAt ?? null),
      });
    } catch (error) {
      console.error('Error loading price data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPriceData();
    setRefreshing(false);
  };

  const currentPricesMap = prices.reduce((acc, p) => {
    acc[p.metal] = p.pricePerOz;
    return acc;
  }, {} as Record<string, number>);

  // Calculate overall value change
  const overallChange = (() => {
    if (!snapshotPrices) return null;
    const weights = { gold: 0.6, silver: 0.2, platinum: 0.2 } as Record<string, number>;
    const metals = ['gold', 'silver', 'platinum'];
    return metals.reduce((sum, metal) => {
      const then = (snapshotPrices as any)[metal];
      const now = currentPricesMap[metal];
      if (!then || !now) return sum;
      const pct = ((now - then) / then) * 100;
      return sum + pct * (weights[metal] || 0);
    }, 0);
  })();

  const formatDate = (date: Date) =>
    date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: clientTimezone });

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-6">
        <Skeleton className="h-8 w-48 mb-2" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-8 max-w-5xl mx-auto">
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-medium">
              Vault · Market Report
            </span>
            {isDemo ? (
              <Badge variant="secondary" className="gap-1 text-[10px] py-0 px-1.5">
                <Sparkles className="w-2.5 h-2.5" />
                Demo
              </Badge>
            ) : (
              <Badge className="gap-1 text-[10px] py-0 px-1.5 bg-green-600 text-white hover:bg-green-700">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse inline-block" />
                Live
              </Badge>
            )}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Precious Metals
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {formatDate(lastUpdated)}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
            className="gap-2 text-xs uppercase tracking-wider"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", refreshing && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[1fr_1fr_100px] items-center gap-4 px-4 py-3 border-b border-border bg-muted/30">
          <span className="text-[11px] uppercase tracking-[0.15em] font-semibold text-muted-foreground">Metal</span>
          <span className="text-[11px] uppercase tracking-[0.15em] font-semibold text-muted-foreground text-right">Spot Price</span>
          <span className="text-[11px] uppercase tracking-[0.15em] font-semibold text-muted-foreground text-right">Since Catalog</span>
        </div>

        {/* Metal rows */}
        <div className="px-2">
          {prices.map(price => (
            <MetalPriceRow
              key={price.metal}
              data={price}
              priceAtCreation={snapshotPrices?.[price.metal] || null}
            />
          ))}
        </div>
      </Card>

      {/* Price Alert Banner */}
      {snapshotPrices && (
        <PriceAlertBanner
          pricesAtCreation={snapshotPrices}
          currentPrices={currentPricesMap as any}
        />
      )}

      {/* Overall Value Card */}
      {overallChange !== null && catalogCreatedAt && (
        <Card className="bg-zinc-900 dark:bg-zinc-950 text-white p-6 border-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="text-[11px] uppercase tracking-[0.2em] text-zinc-400 font-medium">
                Overall Metal Value · Since {formatDate(catalogCreatedAt)}
              </span>
              <p className="text-sm italic text-zinc-500 mt-1">
                Weighted average across Gold, Silver & Platinum
              </p>
            </div>
            <span className={cn(
              "text-3xl sm:text-4xl font-bold tabular-nums",
              overallChange >= 0 ? "text-green-400" : "text-red-400"
            )}>
              {overallChange >= 0 ? '+' : ''}{overallChange.toFixed(1)}%
            </span>
          </div>
        </Card>
      )}

      {/* Demo mode info */}
      {isDemo && (
        <Card className="p-4 bg-muted/50 border-dashed">
          <p className="text-sm text-muted-foreground text-center">
            <Sparkles className="w-4 h-4 inline mr-1.5" />
            Demo mode: Showing simulated prices. Add an API key in settings to enable live market data.
          </p>
        </Card>
      )}
    </div>
  );
}
