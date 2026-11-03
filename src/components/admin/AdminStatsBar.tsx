import { DollarSign, Users, ShoppingCart, TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/pricing-utils';

interface AdminStatsBarProps {
  subscriptionRevenue: number;
  activeClients: number;
  totalOrders: number;
  avgOrderValue: number;
}

export function AdminStatsBar({
  subscriptionRevenue,
  activeClients,
  totalOrders,
  avgOrderValue,
}: AdminStatsBarProps) {
  const stats = [
    {
      label: 'Total Revenue',
      value: formatCurrency(subscriptionRevenue),
      subtext: 'from subscriptions',
      icon: DollarSign,
      iconColor: 'text-emerald-500',
    },
    {
      label: 'Active Clients',
      value: activeClients.toString(),
      subtext: 'currently subscribed',
      icon: Users,
      iconColor: 'text-blue-500',
    },
    {
      label: 'Total Orders',
      value: totalOrders.toLocaleString(),
      subtext: 'from Ring OS',
      icon: ShoppingCart,
      iconColor: 'text-violet-500',
    },
    {
      label: 'Avg Order Value',
      value: formatCurrency(avgOrderValue),
      subtext: 'across all clients',
      icon: TrendingUp,
      iconColor: 'text-amber-500',
    },
  ];

  return (
    <div className="bg-card rounded-2xl p-6 border border-border shadow-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border/30">
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={`px-4 lg:px-6 py-4 sm:py-0 ${index === 0 ? 'sm:pl-0' : ''} ${index === stats.length - 1 ? 'sm:pr-0' : ''}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-1.5 rounded-lg bg-muted/50 ${stat.iconColor}`}>
                <stat.icon className="h-4 w-4" />
              </div>
              <span className="text-[11px] uppercase tracking-widest font-medium text-muted-foreground/70">
                {stat.label}
              </span>
            </div>
            <p className="text-2xl lg:text-3xl font-semibold tracking-tight text-foreground">
              {stat.value}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {stat.subtext}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
