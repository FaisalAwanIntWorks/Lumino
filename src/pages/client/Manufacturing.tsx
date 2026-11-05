import { stickyHeaderTableClass } from "@/components/ui/table";
import { useEffect, useState } from 'react';
import { useClientTimezone, formatDateWithTimezone } from '@/hooks/useClientTimezone';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Factory, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/pricing-utils';
import { StatCard } from '@/components/common/StatCard';
import { useClientCurrency } from '@/hooks/useClientCurrency';

export default function Manufacturing() {
  const { user } = useAuth();
  const clientTimezone = useClientTimezone();
  const { isImpersonating, impersonatedClientId } = useAdminImpersonation();
  const { currency } = useClientCurrency(impersonatedClientId);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = 'Manufacturing Requests | Aurezo';
    if (isImpersonating && !impersonatedClientId) return;
    loadManufacturingOrders();
  }, [user, isImpersonating, impersonatedClientId]);

  const loadManufacturingOrders = async () => {
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

    const { data } = await supabase
      .from('orders')
      .select('*, products(name, manufacturing_cost)')
      .eq('client_id', clientId)
      .eq('customer_requested_manufacturing', true)
      .order('created_at', { ascending: false });

    setOrders(data || []);
    setLoading(false);
  };

  const getStatusInfo = (status: string) => {
    switch (status) {
      case 'new_request':
        return { color: 'bg-muted text-muted-foreground border-border', label: 'Pending Review', icon: Clock };
      case 'in_production':
        return { color: 'bg-primary/10 text-primary border-primary/20', label: 'In Production', icon: Factory };
      case 'completed':
        return { color: 'bg-muted text-foreground border-border', label: 'Completed', icon: CheckCircle };
      default:
        return { color: 'bg-muted text-muted-foreground border-border', label: status, icon: AlertCircle };
    }
  };

  const stats = {
    pending: orders.filter(o => o.manufacturing_status === 'new_request').length,
    inProduction: orders.filter(o => o.manufacturing_status === 'in_production').length,
    completed: orders.filter(o => o.manufacturing_status === 'completed').length,
    total: orders.length,
  };

  if (loading) {
    return <div className="flex items-center justify-center p-8"><div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Manufacturing Requests</h1>
        <p className="text-muted-foreground mt-1">Track orders being manufactured by Aurezo</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard
          title="Pending Review"
          value={stats.pending}
          icon={Clock}
          gradient="from-muted/20 to-muted/5"
        />
        <StatCard
          title="In Production"
          value={stats.inProduction}
          icon={Factory}
          gradient="from-primary/20 to-primary/5"
        />
        <StatCard
          title="Completed"
          value={stats.completed}
          icon={CheckCircle}
          gradient="from-muted/15 to-muted/5"
        />
        <StatCard
          title="Total Requests"
          value={stats.total}
          icon={Factory}
          gradient="from-primary/15 to-primary/5"
        />
      </div>

      {orders.length === 0 ? (
        <Card className="p-12 text-center">
          <Factory className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">No Manufacturing Requests Yet</h3>
          <p className="text-muted-foreground">
            When you request Aurezo to manufacture orders, they'll appear here
          </p>
        </Card>
      ) : (
        <Card className="p-6">
          <Table containerClassName={stickyHeaderTableClass}>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => {
                const statusInfo = getStatusInfo(order.manufacturing_status);
                const StatusIcon = statusInfo.icon;
                
                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-mono text-sm">
                      {order.id.slice(0, 8)}...
                    </TableCell>
                    <TableCell>{order.products?.name || 'N/A'}</TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{order.customer_name}</div>
                        <div className="text-sm text-muted-foreground">{order.customer_email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusInfo.color}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {statusInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateWithTimezone(order.created_at, clientTimezone)}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(order.total_amount, currency)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                      {order.manufacturing_notes || 'No notes'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
