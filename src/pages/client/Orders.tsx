import { stickyHeaderTableClass } from "@/components/ui/table";
import { useState, useEffect, useMemo } from "react";
import { useClientTimezone, formatDateWithTimezone } from "@/hooks/useClientTimezone";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminImpersonation } from "@/contexts/AdminImpersonationContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Search, Eye, ShoppingCart, Diamond, Wallet } from "lucide-react";
import { usePageSearchRegistration } from '@/hooks/usePageSearchRegistration';
import OrderDetailView from "@/components/orders/OrderDetailView";
import RingImagePreviewDialog from "@/components/orders/RingImagePreviewDialog";
import OrderBulkToolbar from "@/components/orders/OrderBulkToolbar";
import { useClientStatusTags } from "@/hooks/useClientStatusTags";
import { StatusTagSelector } from "@/components/status/StatusTagSelector";
import { getOrderRingPreviewUrl, getOrderRingAssetLookup, getConfigSummary, exportOrdersCsv } from "@/lib/order-utils";
import { constructCdnImageUrl } from "@/lib/cdn-utils";

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
}

const getDisplayOrderNumber = (order: Order) => {
  const num = order.configuration?.shopify_order_number;
  if (num) return `#${num}`;
  return order.shopify_order_id ? `#${order.shopify_order_id}` : order.id.slice(0, 8);
};

const SOURCE_BADGE_MAP: Record<string, { label: string; className: string }> = {
  'jewlx-widget': { label: 'Ring OS', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
  'ring-builder': { label: 'Ring Builder', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  'grillz-builder': { label: 'Grillz', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  'custom-inquiry': { label: 'Custom', className: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
};

const getSourceBadge = (order: Order) => {
  const source = order.order_source || 'jewlx-widget';
  const info = SOURCE_BADGE_MAP[source] || { label: 'Ring OS', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20' };
  const isDeposit = ['ring-builder', 'grillz-builder', 'custom-inquiry'].includes(source);
  return { ...info, isDeposit };
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

const Orders = () => {
  const { user, role, staffInfo } = useAuth();
  const clientTimezone = useClientTimezone();
  const { isImpersonating, impersonatedClientId } = useAdminImpersonation();
  const [searchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientCompanyName, setClientCompanyName] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [ringImageMap, setRingImageMap] = useState<Record<string, string>>({});
  const [ringPreviewOrder, setRingPreviewOrder] = useState<Order | null>(null);

  const { tags: orderStatusTags, addTag: addOrderTag, deleteTag: deleteOrderTag, getTagColor: getOrderTagColor } = useClientStatusTags(clientId, 'orders');

  const orderSearchItems = useMemo(() =>
    orders.map(o => ({
      id: o.id,
      label: o.customer_name || getDisplayOrderNumber(o),
      description: `${o.customer_email} · ${getDisplayAmount(o)}`,
      icon: ShoppingCart,
      category: o.status,
      action: () => setSelectedOrder(o),
    })),
    [orders]
  );
  usePageSearchRegistration('Orders', orderSearchItems);

  useEffect(() => {
    if (isImpersonating && !impersonatedClientId) return;
    fetchOrders();
  }, [user, isImpersonating, impersonatedClientId]);

  useEffect(() => {
    const searchParam = searchParams.get('search');
    if (searchParam) setSearchQuery(searchParam);
  }, [searchParams]);

  useEffect(() => {
    const setupRealtimeSubscription = async () => {
      let cId: string | null = null;
      if (isImpersonating && impersonatedClientId) {
        cId = impersonatedClientId;
      } else if (role === 'staff' && staffInfo?.clientId) {
        cId = staffInfo.clientId;
      } else if (user) {
        const { data: clientData } = await supabase
          .from("clients").select("id").eq("user_id", user.id).maybeSingle();
        cId = clientData?.id || null;
      }
      if (!cId) return;
      const channel = supabase
        .channel(`orders-${cId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `client_id=eq.${cId}` },
          (payload) => {
            setOrders(prev => [payload.new as Order, ...prev]);
            toast.success('New order received!');
          })
        .subscribe();
      return () => { supabase.removeChannel(channel); };
    };
    const cleanup = setupRealtimeSubscription();
    return () => { cleanup.then(fn => fn?.()); };
  }, [user, isImpersonating, impersonatedClientId]);

  const fetchOrders = async () => {
    try {
      let cId: string | null = null;
      if (isImpersonating && impersonatedClientId) {
        cId = impersonatedClientId;
      } else if (role === 'staff' && staffInfo?.clientId) {
        cId = staffInfo.clientId;
      } else {
        const { data: clientData, error } = await supabase
          .from("clients").select("id, company_name").eq("user_id", user?.id).maybeSingle();
        if (error && error.code !== 'PGRST116') throw error;
        cId = clientData?.id || null;
        if (clientData?.company_name) setClientCompanyName(clientData.company_name);
      }
      // Fetch company name if not already set
      if (cId && !clientCompanyName) {
        const { data: cn } = await supabase.from("clients").select("company_name").eq("id", cId).maybeSingle();
        if (cn?.company_name) setClientCompanyName(cn.company_name);
      }
      if (!cId) { setLoading(false); return; }
      setClientId(cId);

      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .eq("client_id", cId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      setOrders(data || []);
    } catch (error: any) {
      toast.error("Failed to load orders");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };
  // Fetch ring images from DB for all orders
  useEffect(() => {
    if (orders.length === 0) return;
    const fetchRingImages = async () => {
      const lookups = orders.map(o => ({
        id: o.id,
        lookup: getOrderRingAssetLookup(o.configuration),
      })).filter(l => l.lookup?.combinationId);

      const uniqueCombos = [...new Set(lookups.map(l => l.lookup!.combinationId!))];
      if (uniqueCombos.length === 0) return;

      const { data } = await supabase
        .from('my_master_db_data')
        .select('combination_id, folder_path, image_0_filename')
        .in('combination_id', uniqueCombos);

      if (!data) return;
      const comboToUrl: Record<string, string> = {};
      data.forEach(row => {
        if (row.folder_path && row.image_0_filename) {
          const url = constructCdnImageUrl(row.folder_path, row.image_0_filename);
          if (url) comboToUrl[row.combination_id!] = url;
        }
      });

      const map: Record<string, string> = {};
      lookups.forEach(l => {
        const url = comboToUrl[l.lookup!.combinationId!];
        if (url) map[l.id] = url;
      });
      setRingImageMap(map);
    };
    fetchRingImages();
  }, [orders]);

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleOrderStatusChange = async (orderId: string, newStatus: string) => {
    try {
      const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', orderId);
      if (error) throw error;
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    } catch (err) {
      // Show the database's reason (e.g. a constraint or permission error)
      // instead of a bare "Failed" so the cause is visible from the UI.
      const detail = (err as { message?: string } | null)?.message;
      toast.error(detail ? `Failed to update status: ${detail}` : 'Failed to update status');
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
    } catch (err) {
      const detail = (err as { message?: string } | null)?.message;
      toast.error(detail ? `Failed to update orders: ${detail}` : 'Failed to update orders');
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
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-6 sm:h-8 w-32 sm:w-48" />
        </div>
        <Card>
          <CardHeader className="p-4 sm:p-6"><Skeleton className="h-5 sm:h-6 w-24 sm:w-32" /></CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="space-y-3 sm:space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (<Skeleton key={i} className="h-20 sm:h-16" />))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (selectedOrder) {
    return (
      <OrderDetailView
        order={selectedOrder}
        onBack={() => setSelectedOrder(null)}
        onStatusChange={handleOrderStatusChange}
        orderStatusTags={orderStatusTags}
        getOrderTagColor={getOrderTagColor}
        addOrderTag={addOrderTag}
        deleteOrderTag={deleteOrderTag}
        clientCompanyName={clientCompanyName}
      />
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Deposit & Orders</h1>
          <p className="text-sm sm:text-base text-muted-foreground">View and manage customer deposits & orders</p>
        </div>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by customer name, email, or order #..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 text-sm" />
            </div>
            <div className="flex gap-2 sm:gap-4">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-48 text-xs sm:text-sm">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {orderStatusTags.map(tag => (
                    <SelectItem key={tag.id} value={tag.tag_name}>
                      {tag.tag_name.charAt(0).toUpperCase() + tag.tag_name.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          <OrderBulkToolbar
            selectedCount={selectedIds.size}
            statusTags={orderStatusTags}
            onBulkStatusChange={handleBulkStatusChange}
            onExportCsv={handleBulkExport}
            onBulkDelete={handleBulkDelete}
          />

          {filteredOrders.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <p className="text-sm sm:text-base text-muted-foreground">No orders found</p>
            </div>
          ) : (
            <>
              {/* Mobile Card Layout */}
              <div className="space-y-3 md:hidden">
                {filteredOrders.map((order) => {
                  const preview = ringImageMap[order.id] || getOrderRingPreviewUrl(order.configuration);
                  const summary = getConfigSummary(order.configuration);
                  return (
                    <Card key={order.id} className="p-3 sm:p-4 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setSelectedOrder(order)}>
                      <div className="flex gap-3 items-start mb-2">
                        <div onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(order.id)}
                            onCheckedChange={() => toggleSelect(order.id)}
                            className="mt-1"
                          />
                        </div>
                        <div
                          className="w-12 h-12 rounded-md border border-border bg-muted/30 flex items-center justify-center overflow-hidden shrink-0 cursor-pointer hover:border-primary transition-colors"
                          onClick={(e) => { e.stopPropagation(); setRingPreviewOrder(order); }}
                        >
                          {preview ? (
                            <img src={preview} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                          ) : (
                            <Diamond className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-mono text-xs text-muted-foreground">{getDisplayOrderNumber(order)}</p>
                          <p className="font-medium text-sm truncate">{order.customer_name || "N/A"}</p>
                          <p className="text-xs text-muted-foreground truncate">{order.customer_email}</p>
                          {summary && <p className="text-[10px] text-muted-foreground mt-0.5">{summary}</p>}
                        </div>
                        <div onClick={(e) => e.stopPropagation()}>
                          <StatusTagSelector
                            currentStatus={order.status}
                            tags={orderStatusTags}
                            onStatusChange={(s) => handleOrderStatusChange(order.id, s)}
                            onCreateTag={addOrderTag}
                            onDeleteTag={deleteOrderTag}
                            getTagColor={getOrderTagColor}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm mb-2 ml-[60px]">
                        <div>
                          <span className="text-muted-foreground">Amount:</span>
                          <p className="font-semibold">{getDisplayAmount(order)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Source:</span>
                          {(() => {
                            const sb = getSourceBadge(order);
                            return (
                              <div className="flex items-center gap-1 mt-0.5">
                                <Badge className={cn(sb.className, "text-xs")}>{sb.label}</Badge>
                                {sb.isDeposit && <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]"><Wallet className="h-2.5 w-2.5 mr-0.5" />Deposit</Badge>}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                      <div className="flex justify-end items-center pt-2 border-t border-border ml-[60px]">
                        <span className="text-xs text-muted-foreground">{formatDateWithTimezone(order.created_at, clientTimezone)}</span>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* Desktop Table Layout */}
              <div className="hidden md:block overflow-x-auto">
                <Table containerClassName={stickyHeaderTableClass}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={selectedIds.size === filteredOrders.length && filteredOrders.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="text-xs lg:text-sm">Ring</TableHead>
                      <TableHead className="text-xs lg:text-sm">Order #</TableHead>
                      <TableHead className="text-xs lg:text-sm">Customer</TableHead>
                      <TableHead className="text-xs lg:text-sm">Amount</TableHead>
                      <TableHead className="text-xs lg:text-sm">Source</TableHead>
                      <TableHead className="text-xs lg:text-sm">Status</TableHead>
                      <TableHead className="text-xs lg:text-sm">Date</TableHead>
                      
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((order) => {
                      const preview = ringImageMap[order.id] || getOrderRingPreviewUrl(order.configuration);
                      const summary = getConfigSummary(order.configuration);
                      return (
                        <TableRow key={order.id} data-state={selectedIds.has(order.id) ? 'selected' : undefined} className="cursor-pointer" onClick={() => setSelectedOrder(order)}>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(order.id)}
                              onCheckedChange={() => toggleSelect(order.id)}
                            />
                          </TableCell>
                          <TableCell>
                            <div
                              className="w-10 h-10 rounded-md border border-border bg-muted/30 flex items-center justify-center overflow-hidden cursor-pointer hover:border-primary transition-colors"
                              onClick={(e) => { e.stopPropagation(); setRingPreviewOrder(order); }}
                            >
                              {preview ? (
                                <img src={preview} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              ) : (
                                <Diamond className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <p className="font-mono text-xs lg:text-sm">{getDisplayOrderNumber(order)}</p>
                            {summary && <p className="text-[10px] text-muted-foreground mt-0.5 max-w-[160px] truncate">{summary}</p>}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{order.customer_name || "N/A"}</p>
                              <p className="text-xs text-muted-foreground">{order.customer_email}</p>
                            </div>
                          </TableCell>
                          <TableCell className="font-semibold text-sm">{getDisplayAmount(order)}</TableCell>
                          <TableCell>
                          {(() => {
                            const sb = getSourceBadge(order);
                            return (
                              <div className="flex items-center gap-1">
                                <Badge className={cn(sb.className, "text-xs")}>{sb.label}</Badge>
                                {sb.isDeposit && <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]"><Wallet className="h-2.5 w-2.5 mr-0.5" />Deposit</Badge>}
                              </div>
                            );
                          })()}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <StatusTagSelector
                              currentStatus={order.status}
                              tags={orderStatusTags}
                              onStatusChange={(s) => handleOrderStatusChange(order.id, s)}
                              onCreateTag={addOrderTag}
                              onDeleteTag={deleteOrderTag}
                              getTagColor={getOrderTagColor}
                            />
                          </TableCell>
                          <TableCell className="text-sm">{formatDateWithTimezone(order.created_at, clientTimezone)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>



      <RingImagePreviewDialog
        open={!!ringPreviewOrder}
        onOpenChange={(open) => !open && setRingPreviewOrder(null)}
        configuration={ringPreviewOrder?.configuration ?? null}
      />
    </div>
  );
};

export default Orders;
