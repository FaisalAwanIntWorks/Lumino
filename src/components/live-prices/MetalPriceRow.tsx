import { METAL_CONFIG, MetalPrice } from '@/lib/metal-prices-api';
import { cn } from '@/lib/utils';

const ATOMIC_NUMBERS: Record<string, number> = {
  gold: 79,
  silver: 47,
  platinum: 78,
};

interface MetalPriceRowProps {
  data: MetalPrice;
  priceAtCreation: number | null;
}

export function MetalPriceRow({ data, priceAtCreation }: MetalPriceRowProps) {
  const config = METAL_CONFIG[data.metal];

  // Calculate since-catalog change
  const sinceCatalogPercent = priceAtCreation
    ? ((data.pricePerOz - priceAtCreation) / priceAtCreation) * 100
    : null;
  const isSinceCatalogPositive = sinceCatalogPercent !== null && sinceCatalogPercent >= 0;

  return (
    <div className="grid grid-cols-[1fr_1fr_100px] items-center gap-4 py-5 border-b border-border/50 last:border-b-0 px-2">
      {/* Metal name + symbol */}
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold tracking-tight">{config.name}</span>
          <span className="text-xs text-muted-foreground font-medium">{config.symbol}</span>
        </div>
        <span className="text-[11px] text-muted-foreground/60 tracking-widest uppercase">
          No. {ATOMIC_NUMBERS[data.metal]}
        </span>
      </div>

      {/* Spot price */}
      <div className="text-right">
        <span className="text-base font-semibold tabular-nums tracking-tight">
          ${data.pricePerOz.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <span className="text-xs text-muted-foreground ml-1">/oz</span>
      </div>

      {/* Since catalog */}
      <div className="text-right">
        {sinceCatalogPercent !== null ? (
          <span className={cn(
            "text-sm font-semibold tabular-nums",
            isSinceCatalogPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
          )}>
            {isSinceCatalogPositive ? '+' : ''}{sinceCatalogPercent.toFixed(1)}%
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
    </div>
  );
}
