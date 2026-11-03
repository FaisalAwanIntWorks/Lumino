import { Card } from '@/components/ui/card';
import { METAL_CONFIG, getAlertLevel } from '@/lib/metal-prices-api';
import { TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ValueProgressCardProps {
  catalogCreatedAt: Date | null;
  pricesAtCreation: {
    gold: number;
    silver: number;
    platinum: number;
  } | null;
  currentPrices: {
    gold: number;
    silver: number;
    platinum: number;
  };
}

export function ValueProgressCard({ 
  catalogCreatedAt, 
  pricesAtCreation, 
  currentPrices 
}: ValueProgressCardProps) {
  if (!catalogCreatedAt || !pricesAtCreation) {
    return (
      <Card className="p-6">
        <div className="text-center py-8">
          <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="font-medium mb-2">No Catalog History</h3>
          <p className="text-sm text-muted-foreground">
            Create your first catalog to track metal price changes over time.
          </p>
        </div>
      </Card>
    );
  }

  const metals = ['gold', 'silver', 'platinum'] as const;
  
  // Calculate changes for each metal
  const changes = metals.map(metal => {
    const then = pricesAtCreation[metal];
    const now = currentPrices[metal];
    const change = now - then;
    const changePercent = ((now - then) / then) * 100;
    return {
      metal,
      then,
      now,
      change,
      changePercent,
      alertLevel: getAlertLevel(changePercent),
    };
  });

  // Calculate weighted average change (gold-heavy since it's most valuable)
  const weights = { gold: 0.6, silver: 0.2, platinum: 0.2 };
  const overallChange = changes.reduce((sum, c) => 
    sum + c.changePercent * weights[c.metal], 0
  );

  const formatCurrency = (value: number, metal: string) => {
    if (metal === 'silver') {
      return `$${value.toFixed(2)}`;
    }
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="w-5 h-5 text-muted-foreground" />
        <div>
          <h3 className="font-semibold">Value Progress Since Catalog Creation</h3>
          <p className="text-sm text-muted-foreground">
            Catalog created on {catalogCreatedAt.toLocaleDateString('en-US', { 
              month: 'long', 
              day: 'numeric', 
              year: 'numeric' 
            })}
          </p>
        </div>
      </div>

      {/* Metal breakdown */}
      <div className="space-y-4 mb-6">
        {changes.map(({ metal, then, now, changePercent }) => {
          const config = METAL_CONFIG[metal];
          const isPositive = changePercent >= 0;
          
          return (
            <div key={metal} className="flex items-center gap-4">
              <div 
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: config.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{config.name}</span>
                  <div className={cn(
                    "flex items-center gap-1 text-sm font-medium",
                    isPositive 
                      ? "text-green-600 dark:text-green-400" 
                      : "text-red-600 dark:text-red-400"
                  )}>
                    {isPositive ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5" />
                    )}
                    <span>{isPositive ? '+' : ''}{changePercent.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span>{formatCurrency(then, metal)}</span>
                  <span>→</span>
                  <span className="font-medium text-foreground">{formatCurrency(now, metal)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Overall change */}
      <div className={cn(
        "rounded-lg p-4",
        overallChange >= 0 
          ? "bg-green-500/10 border border-green-500/20" 
          : "bg-red-500/10 border border-red-500/20"
      )}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Overall Metal Value Change</span>
          <span className={cn(
            "text-lg font-bold",
            overallChange >= 0 
              ? "text-green-600 dark:text-green-400" 
              : "text-red-600 dark:text-red-400"
          )}>
            {overallChange >= 0 ? '+' : ''}{overallChange.toFixed(1)}%
          </span>
        </div>
      </div>
    </Card>
  );
}
