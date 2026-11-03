import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/common/StatCard';
import { DollarSign, ShoppingCart, TrendingUp, Users, Package } from 'lucide-react';
import { formatCurrency } from '@/lib/pricing-utils';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

interface AnalyticsData {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  totalClients: number;
  revenueByMonth: { month: string; revenue: number }[];
  topProducts: { name: string; count: number; revenue: number }[];
  topClients: { name: string; orders: number; revenue: number }[];
  categoryBreakdown: { category: string; revenue: number; orders: number }[];
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const { data: orders } = await supabase
        .from('orders')
        .select(`
          total_amount,
          created_at,
          client_id,
          product_id,
          clients(company_name),
          products(name, category)
        `);

      const totalRevenue = orders?.reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;
      const totalOrders = orders?.length || 0;
      const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      const { count: clientsCount } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true });

      // Category breakdown
      const categoryStats: Record<string, { revenue: number; orders: number }> = {};
      orders?.forEach((order) => {
        const category = order.products?.category || 'Other';
        if (!categoryStats[category]) {
          categoryStats[category] = { revenue: 0, orders: 0 };
        }
        categoryStats[category].revenue += Number(order.total_amount);
        categoryStats[category].orders++;
      });

      const categoryBreakdown = Object.entries(categoryStats).map(([category, stats]) => ({
        category,
        revenue: stats.revenue,
        orders: stats.orders,
      }));

      // Product stats
      const productStats: Record<string, { name: string; count: number; revenue: number }> = {};
      orders?.forEach((order) => {
        const productName = order.products?.name || 'Unknown';
        if (!productStats[productName]) {
          productStats[productName] = { name: productName, count: 0, revenue: 0 };
        }
        productStats[productName].count++;
        productStats[productName].revenue += Number(order.total_amount);
      });
      const topProducts = Object.values(productStats).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

      // Client stats
      const clientStats: Record<string, { name: string; orders: number; revenue: number }> = {};
      orders?.forEach((order) => {
        const clientName = order.clients?.company_name || 'Unknown';
        if (!clientStats[clientName]) {
          clientStats[clientName] = { name: clientName, orders: 0, revenue: 0 };
        }
        clientStats[clientName].orders++;
        clientStats[clientName].revenue += Number(order.total_amount);
      });
      const topClients = Object.values(clientStats).sort((a, b) => b.revenue - a.revenue).slice(0, 5);

      setData({
        totalRevenue,
        totalOrders,
        avgOrderValue,
        totalClients: clientsCount || 0,
        revenueByMonth: [],
        topProducts,
        topClients,
        categoryBreakdown,
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast.error('Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <Skeleton className="h-10 w-64 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Analytics</h1>
        <p className="text-muted-foreground">Platform performance and insights</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Revenue"
          value={formatCurrency(data?.totalRevenue || 0)}
          icon={DollarSign}
          gradient="from-green-500/15 to-green-500/5"
        />
        <StatCard
          title="Total Orders"
          value={data?.totalOrders || 0}
          icon={ShoppingCart}
          gradient="from-primary/15 to-primary/5"
        />
        <StatCard
          title="Avg Order Value"
          value={formatCurrency(data?.avgOrderValue || 0)}
          icon={TrendingUp}
          gradient="from-amber-500/15 to-amber-500/5"
        />
        <StatCard
          title="Active Clients"
          value={data?.totalClients || 0}
          icon={Users}
          gradient="from-primary/15 to-primary/5"
        />
      </div>

      {/* Category Breakdown */}
      <Card className="p-6 mb-8">
        <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
          <Package className="w-5 h-5" />
          Category Performance
        </h3>
        <div className="space-y-4">
          {data?.categoryBreakdown.map((cat) => (
            <div key={cat.category} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
              <div className="flex-1">
                <h4 className="font-semibold">{cat.category}</h4>
                <p className="text-sm text-muted-foreground">{cat.orders} orders</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{formatCurrency(cat.revenue)}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-4">Top Products</h3>
          <div className="space-y-4">
            {data?.topProducts.map((product) => (
              <div key={product.name} className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{product.name}</p>
                  <p className="text-sm text-muted-foreground">{product.count} orders</p>
                </div>
                <p className="font-semibold">{formatCurrency(product.revenue)}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-semibold text-lg mb-4">Top Clients</h3>
          <div className="space-y-4">
            {data?.topClients.map((client) => (
              <div key={client.name} className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{client.name}</p>
                  <p className="text-sm text-muted-foreground">{client.orders} orders</p>
                </div>
                <p className="font-semibold">{formatCurrency(client.revenue)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
