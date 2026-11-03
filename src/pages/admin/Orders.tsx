import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Eye, Diamond } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import OrderDetailDialog from '@/components/orders/OrderDetailDialog';
import OrderBulkToolbar from '@/components/orders/OrderBulkToolbar';
import { getOrderRingPreviewUrl, getConfigSummary, exportOrdersCsv } from '@/lib/order-utils';

interface Order {
  id: string;
  customer_name: string;
  customer_email: string;
  total_amount: number;
  status: string;
  created_at: string;
  order_source: string | null;
  shopify_order_id: string | null;
  customer_shipping: any;
  configuration: any;
  manufacturing_cad_files: string[] | null;
  clients: { company_name: string };
}

const ADMIN_STATUS_TAGS = [
  { id: 's-pending', tag_name: 'pending', tag_color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', context: 'orders' as const, display_order: 0, is_default: true },
  { id: 's-processing', tag_name: 'processing', tag_color: 'bg-blue-500/10 text-blue-500 border-blue-500/20', context: 'orders' as const, display_order: 1, is_default: true },
  { id: 's-fulfilled', tag_name: 'fulfilled', tag_color: 'bg-green-500/10 text-green-500 border-green-500/20', context: 'orders' as const, display_order: 2, is_default: true },
  { id: 's-completed', tag_name: 'completed', tag_color: 'bg-green-500/10 text-green-500 border-green-500/20', context: 'orders' as const, display_order: 3, is_default: true },
  { id: 's-canceled', tag_name: 'canceled', tag_color: 'bg-red-500/10 text-red-500 border-red-500/20', context: 'orders' as const, display_order: 4, is_default: true },
  { id: 's-refunded', tag_name: 'refunded', tag_color: 'bg-muted text-muted-foreground border-border', context: 'orders' as const, display_order: 5, is_default: true },
];

const getAdminTagColor = (status: string) => {
  const tag = ADMIN_STATUS_TAGS.find(t => t.tag_name === status);
  return tag?.tag_color || 'bg-secondary text-secondary-foreground';
};

const getDisplayOrderNumber = (order: Order) => {
  const num = order.configuration?.shopify_order_number;
  if (num) return `#${num}`;
  return order.shopify_order_id ? `#${order.shopify_order_id}` : order.id.slice(0, 8);
};

const getDisplayAmount = (order: Order) => {
  const currency = (order.configuration?.currency as string) || 'USD';
  let amount = order.total_amount;
  if (amount === 0 && order.configuration?.line_items) {
    const items = order.configuration.line_items as Array<{ price: string; quantity: number }>;
    amount = items.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0);
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
};

export default function Orders() {
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => { fetchOrders(); }, []);

  useEffect(() => {
    const searchParam = searchParams.get('search');
    if (searchParam) setSearchQuery(searchParam);
  }, [searchParams]);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, clients(company_name)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.clients?.company_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleOrderStatusChange = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    } catch {
      toast.error('Failed to update status');
    }
  };

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredOrders.map(o => o.id)));
    }
  };

  // Bulk actions
  const handleBulkStatusChange = async (status: string) => {
    const ids = Array.from(selectedIds);
    try {
      const { error } = await supabase.from('orders').update({ status }).in('id', ids);
      if (error) throw error;
      setOrders(prev => prev.map(o => ids.includes(o.id) ? { ...o, status } : o));
      setSelectedIds(new Set());
      toast.success(`Updated ${ids.length} orders`);
    } catch {
      toast.error('Failed to update orders');
    }
  };

  const handleBulkExport = () => {
    const selected = filteredOrders.filter(o => selectedIds.has(o.id));
    exportOrdersCsv(selected);
    toast.success(`Exported ${selected.length} orders`);
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    try {
      const { error } = await supabase.from('orders').delete().in('id', ids);
      if (error) throw error;
      setOrders(prev => prev.filter(o => !ids.includes(o.id)));
      setSelectedIds(new Set());
      toast.success(`Deleted ${ids.length} orders`);
    } catch {
      toast.error('Failed to delete orders');
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <Skeleton className="h-10 w-64 mb-6" />
        <div className="space-y-4">
          {[1, 2, 3, 4].map((i) => (<Skeleton key={i} className="h-20" />))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Orders</h1>
        <p className="text-muted-foreground">Manage all platform orders</p>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by customer, client, or email..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue placeholder="Filter by status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {ADMIN_STATUS_TAGS.map(tag => (
              <SelectItem key={tag.id} value={tag.tag_name}>
                {tag.tag_name.charAt(0).toUpperCase() + tag.tag_name.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <OrderBulkToolbar
        selectedCount={selectedIds.size}
        statusTags={ADMIN_STATUS_TAGS}
        onBulkStatusChange={handleBulkStatusChange}
        onExportCsv={handleBulkExport}
        onBulkDelete={handleBulkDelete}
      />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b">
              <tr className="text-left">
                <th className="p-4 w-10">
                  <Checkbox
                    checked={selectedIds.size === filteredOrders.length && filteredOrders.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
                <th className="p-4 font-semibold">Ring</th>
                <th className="p-4 font-semibold">Order #</th>
                <th className="p-4 font-semibold">Customer</th>
                <th className="p-4 font-semibold">Client</th>
                <th className="p-4 font-semibold">Amount</th>
                <th className="p-4 font-semibold">Source</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4 font-semibold">Date</th>
                <th className="p-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => {
                const preview = getOrderRingPreviewUrl(order.configuration);
                const summary = getConfigSummary(order.configuration);
                return (
                  <tr key={order.id} className={`border-b last:border-0 hover:bg-muted/50 ${selectedIds.has(order.id) ? 'bg-primary/5' : ''}`}>
                    <td className="p-4">
                      <Checkbox
                        checked={selectedIds.has(order.id)}
                        onCheckedChange={() => toggleSelect(order.id)}
                      />
                    </td>
                    <td className="p-4">
                      <div className="w-10 h-10 rounded-md border border-border bg-muted/30 flex items-center justify-center overflow-hidden">
                        {preview ? (
                          <img src={preview} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <Diamond className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="font-mono text-sm">{getDisplayOrderNumber(order)}</p>
                      {summary && <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[160px] truncate">{summary}</p>}
                    </td>
                    <td className="p-4">
                      <div>
                        <p className="font-medium">{order.customer_name}</p>
                        <p className="text-sm text-muted-foreground">{order.customer_email}</p>
                      </div>
                    </td>
                    <td className="p-4 text-sm">{order.clients?.company_name}</td>
                    <td className="p-4 font-semibold">{getDisplayAmount(order)}</td>
                    <td className="p-4">
                      <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Ring OS</Badge>
                    </td>
                    <td className="p-4">
                      <Select value={order.status} onValueChange={(s) => handleOrderStatusChange(order.id, s)}>
                        <SelectTrigger className="w-[130px] h-8 border-0 p-0 shadow-none">
                          <Badge className={`${getAdminTagColor(order.status)} text-xs cursor-pointer`}>
                            {order.status}
                          </Badge>
                        </SelectTrigger>
                        <SelectContent>
                          {ADMIN_STATUS_TAGS.map(tag => (
                            <SelectItem key={tag.id} value={tag.tag_name}>
                              <Badge className={`${tag.tag_color} text-[10px]`}>{tag.tag_name}</Badge>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-4 text-sm">{new Date(order.created_at).toLocaleDateString()}</td>
                    <td className="p-4">
                      <Button variant="ghost" size="sm" className="gap-1" onClick={() => setSelectedOrder(order)}>
                        <Eye className="h-4 w-4" /> Details
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredOrders.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-muted-foreground">No orders found</p>
          </div>
        )}
      </Card>

      <OrderDetailDialog
        open={!!selectedOrder}
        onOpenChange={(open) => !open && setSelectedOrder(null)}
        order={selectedOrder}
        getTagColor={getAdminTagColor}
      />
    </div>
  );
}
