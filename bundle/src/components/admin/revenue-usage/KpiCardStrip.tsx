import { Card } from '@/components/ui/card';
import { DollarSign, RefreshCcw, HandCoins, Percent, LucideIcon } from 'lucide-react';

export interface KpiItem {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: 'default' | 'positive' | 'negative';
}

const iconBg: Record<NonNullable<KpiItem['tone']>, string> = {
  default: 'bg-blue-500/10 text-blue-600',
  positive: 'bg-emerald-500/10 text-emerald-600',
  negative: 'bg-rose-500/10 text-rose-600',
};

export function KpiCardStrip({ items }: { items: KpiItem[] }) {
  return (
    <Card className="p-4 md:p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 divide-y sm:divide-y-0 sm:divide-x divide-border">
        {items.map((item, i) => {
          const Icon = item.icon ?? DollarSign;
          return (
            <div key={i} className="flex flex-col gap-2 sm:px-4 first:sm:pl-0 last:sm:pr-0 pt-4 sm:pt-0 first:pt-0">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className={`h-7 w-7 rounded-full flex items-center justify-center ${iconBg[item.tone ?? 'default']}`}>
                  <Icon className="h-4 w-4" />
                </span>
                {item.label}
              </div>
              <div className={`text-2xl md:text-3xl font-bold ${item.tone === 'negative' ? 'text-rose-600' : ''}`}>
                {item.value}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export const kpiIcons = { DollarSign, RefreshCcw, HandCoins, Percent };
