import { Card } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Circle } from 'lucide-react';
import { MetalPrice, METAL_CONFIG } from '@/lib/metal-prices-api';
import { cn } from '@/lib/utils';

interface MetalPriceCardProps {
  data: MetalPrice;
  isLoading?: boolean;
}

export function MetalPriceCard({ data, isLoading }: MetalPriceCardProps) {
  const config = METAL_CONFIG[data.metal];
  const isPositive = data.changePercent >= 0;
  
  if (isLoading) {
    return (
      <Card className="p-4 sm:p-6 animate-pulse">
        <div className="h-4 bg-muted rounded w-20 mb-3" />
        <div className="h-8 bg-muted rounded w-32 mb-2" />
        <div className="h-4 bg-muted rounded w-24" />
      </Card>
    );
  }

  return (
    <Card className={cn(
      "p-4 sm:p-6 relative overflow-hidden transition-all hover:shadow-lg",
      "bg-gradient-to-br",
      config.bgGradient
    )}>
      {/* Decorative metal circle */}
      <div 
        className="absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-20"
        style={{ backgroundColor: config.color }}
      />
      
      <div className="relative z-10">
        {/* Metal name and symbol */}
        <div className="flex items-center gap-2 mb-3">
          <Circle 
            className={cn("w-3 h-3", config.iconColor)} 
            fill={config.color}
            strokeWidth={0}
          />
          <span className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            {config.name}
          </span>
          <span className="text-xs text-muted-foreground/70">
            ({config.symbol})
          </span>
        </div>
        
        {/* Current price */}
        <div className="mb-2">
          <span className="text-2xl sm:text-3xl font-bold">
            ${data.pricePerOz.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-sm text-muted-foreground ml-1">/oz</span>
        </div>
        
        {/* Daily change */}
        <div className={cn(
          "flex items-center gap-1 text-sm font-medium",
          isPositive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
        )}>
          {isPositive ? (
            <TrendingUp className="w-4 h-4" />
          ) : (
            <TrendingDown className="w-4 h-4" />
          )}
          <span>
            {isPositive ? '+' : ''}{data.changePercent.toFixed(2)}%
          </span>
          <span className="text-muted-foreground font-normal ml-1">today</span>
        </div>
      </div>
    </Card>
  );
}
