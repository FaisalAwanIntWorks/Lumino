import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { METAL_CONFIG, getAlertLevel } from '@/lib/metal-prices-api';
import { useNavigate } from 'react-router-dom';

interface PriceAlertBannerProps {
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

export function PriceAlertBanner({ pricesAtCreation, currentPrices }: PriceAlertBannerProps) {
  const navigate = useNavigate();

  if (!pricesAtCreation) return null;

  const metals = ['gold', 'silver', 'platinum'] as const;
  let maxChange = 0;
  let maxMetal: typeof metals[number] = 'gold';

  metals.forEach(metal => {
    const changePercent = ((currentPrices[metal] - pricesAtCreation[metal]) / pricesAtCreation[metal]) * 100;
    if (changePercent > maxChange) {
      maxChange = changePercent;
      maxMetal = metal;
    }
  });

  const alertLevel = getAlertLevel(maxChange);
  if (alertLevel === 'none' || alertLevel === 'minor') return null;

  const config = METAL_CONFIG[maxMetal];

  return (
    <Card className="border-l-4 border-l-yellow-500 bg-amber-50/80 dark:bg-amber-950/20 p-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
          <div>
            <span className="text-[11px] uppercase tracking-[0.15em] font-semibold text-yellow-700 dark:text-yellow-400">
              Price Alert
            </span>
            <p className="text-sm italic text-foreground/80 mt-1">
              {config.name} is up <strong>{maxChange.toFixed(0)}%</strong> since your catalog was created.
              Consider updating your product prices.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate('/dashboard/catalog')}
          className="gap-2 shrink-0"
        >
          Update Prices
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}
