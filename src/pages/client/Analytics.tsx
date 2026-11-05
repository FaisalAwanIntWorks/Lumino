import { useEffect, useState } from 'react';
import { useClientTimezone, getDateKey } from '@/hooks/useClientTimezone';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getAnalyticsData, calculateConversionFunnel } from '@/lib/analytics-utils';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, Users, Eye, ShoppingCart } from 'lucide-react';

export default function ClientAnalyticsPage() {
  const { user } = useAuth();
  const { isImpersonating, impersonatedClientId } = useAdminImpersonation();
  const clientTimezone = useClientTimezone();
  const [dateRange, setDateRange] = useState(30);
  const [funnel, setFunnel] = useState<any>(null);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'Client • Analytics | Aurezo';
    if (isImpersonating && !impersonatedClientId) return;
    loadAnalytics();
  }, [user, dateRange, isImpersonating, impersonatedClientId]);

  const loadAnalytics = async () => {
    if (!user) return;

    let clientId: string | null = null;

    if (isImpersonating && impersonatedClientId) {
      clientId = impersonatedClientId;
    } else {
      const { data: clientData, error } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') console.error('Error fetching client:', error);
      clientId = clientData?.id || null;
    }

    if (!clientId) {
      setLoading(false);
      return;
    }

    // Load events
    const events = await getAnalyticsData(clientId, dateRange);
    const funnelData = calculateConversionFunnel(events);
    setFunnel(funnelData);

    // Load orders for revenue
    const { data: orders } = await supabase
      .from('orders')
      .select('total_amount, created_at')
      .eq('client_id', clientId)
      .gte('created_at', new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at');

    // Group by day
    const revenueByDay: Record<string, number> = {};
    orders?.forEach(order => {
      const date = getDateKey(order.created_at, clientTimezone);
      revenueByDay[date] = (revenueByDay[date] || 0) + order.total_amount;
    });

    const chartData = Object.entries(revenueByDay).map(([date, revenue]) => ({
      date,
      revenue,
    }));

    setRevenueData(chartData);
    setLoading(false);
  };

  const funnelChartData = funnel
    ? [
          { name: 'Views', value: funnel.views, color: 'hsl(var(--primary))' },
        { name: 'Started', value: funnel.started, color: 'hsl(var(--muted-foreground))' },
        { name: 'Completed', value: funnel.completed, color: 'hsl(var(--primary) / 0.6)' },
        { name: 'Saved', value: funnel.saved, color: 'hsl(var(--foreground))' },
      ]
    : [];

  if (loading) {
    return <div className="flex items-center justify-center p-8"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground mt-1">Track performance and conversions</p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map(days => (
            <Button
              key={days}
              variant={dateRange === days ? 'default' : 'outline'}
              onClick={() => setDateRange(days)}
            >
              {days} days
            </Button>
          ))}
        </div>
      </div>

      {funnel && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-6 bg-gradient-to-br from-primary/20 to-primary/5 border-primary/20">
            <Eye className="w-8 h-8 text-primary mb-3" />
            <div className="text-sm text-muted-foreground mb-1">Embed Views</div>
            <div className="text-3xl font-bold text-foreground">{funnel.views}</div>
          </Card>
          <Card className="p-6 bg-gradient-to-br from-primary/15 to-primary/5 border-primary/20">
            <Users className="w-8 h-8 text-primary mb-3" />
            <div className="text-sm text-muted-foreground mb-1">Started</div>
            <div className="text-3xl font-bold text-foreground">{funnel.started}</div>
            <div className="text-xs text-muted-foreground mt-1">{funnel.startRate}% of views</div>
          </Card>
        <Card className="p-6 bg-gradient-to-br from-primary/15 to-primary/5 border-primary/20">
            <TrendingUp className="w-8 h-8 text-primary mb-3" />
            <div className="text-sm text-muted-foreground mb-1">Completed</div>
            <div className="text-3xl font-bold text-foreground">{funnel.completed}</div>
            <div className="text-xs text-primary mt-1">{funnel.completeRate}% completion</div>
          </Card>
          <Card className="p-6 bg-gradient-to-br from-primary/20 to-primary/5 border-primary/20">
            <ShoppingCart className="w-8 h-8 text-primary mb-3" />
            <div className="text-sm text-muted-foreground mb-1">Saved</div>
            <div className="text-3xl font-bold text-foreground">{funnel.saved}</div>
            <div className="text-xs text-muted-foreground mt-1">{funnel.saveRate}% saved</div>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">Conversion Funnel</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={funnelChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">Revenue Trend</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">Funnel Distribution</h2>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={funnelChartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius={100}
              label
            >
              {funnelChartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
