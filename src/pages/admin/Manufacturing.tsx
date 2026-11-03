import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Package, Clock, FileText, Upload, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminActivityLogger } from '@/hooks/useAdminActivityLogger';

interface ManufacturingOrder {
  id: string;
  customer_name: string;
  customer_email: string;
  total_amount: number;
  status: string;
  manufacturing_status: string;
  manufacturing_notes: string | null;
  manufacturing_cad_files: string[] | null;
  configuration: any;
  created_at: string;
  product_id: string;
  products?: {
    name: string;
    category: string;
  };
}

export default function Manufacturing() {
  const [orders, setOrders] = useState<ManufacturingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<ManufacturingOrder | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const { logManufacturingStatusUpdate, logManufacturingNotesUpdate } = useAdminActivityLogger();

  useEffect(() => {
    fetchManufacturingOrders();
  }, []);

  const fetchManufacturingOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          products (
            name,
            category
          )
        `)
        .eq('customer_requested_manufacturing', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      console.error('Error fetching manufacturing orders:', error);
      toast.error('Failed to load manufacturing orders');
    } finally {
      setLoading(false);
    }
  };

  const updateManufacturingStatus = async (orderId: string, customerName: string, oldStatus: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ manufacturing_status: newStatus })
        .eq('id', orderId);

      if (error) throw error;
      
      // Log the activity
      await logManufacturingStatusUpdate(orderId, customerName, oldStatus, newStatus);
      
      toast.success('Status updated successfully');
      fetchManufacturingOrders();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const updateManufacturingNotes = async (orderId: string, customerName: string, notes: string) => {
    try {
      const { error } = await supabase
        .from('orders')
        .update({ manufacturing_notes: notes })
        .eq('id', orderId);

      if (error) throw error;
      
      // Log the activity
      await logManufacturingNotesUpdate(orderId, customerName);
      
      toast.success('Notes updated successfully');
      fetchManufacturingOrders();
    } catch (error) {
      console.error('Error updating notes:', error);
      toast.error('Failed to update notes');
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      new_request: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      under_review: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      quote_sent: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
      approved: 'bg-primary/10 text-primary border-primary/20',
      in_production: 'bg-primary/10 text-primary border-primary/20',
      completed: 'bg-primary/10 text-primary border-primary/20',
    };
    return colors[status] || 'bg-muted text-muted-foreground';
  };

  const filteredOrders = filterStatus === 'all' 
    ? orders 
    : orders.filter(o => o.manufacturing_status === filterStatus);

  const statusCounts = {
    all: orders.length,
    new_request: orders.filter(o => o.manufacturing_status === 'new_request').length,
    under_review: orders.filter(o => o.manufacturing_status === 'under_review').length,
    in_production: orders.filter(o => o.manufacturing_status === 'in_production').length,
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 sm:h-8 bg-muted rounded w-1/3 sm:w-1/4"></div>
          <div className="h-4 bg-muted rounded w-2/3 sm:w-1/3"></div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 sm:h-24 bg-muted rounded"></div>
            ))}
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-28 sm:h-32 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">Manufacturing Orders</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Manage custom manufacturing requests and production workflow</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <Card className="p-3 sm:p-4 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground mb-1">Total Orders</p>
              <p className="text-xl sm:text-2xl font-bold">{statusCounts.all}</p>
            </div>
            <Package className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
          </div>
        </Card>
        <Card className="p-3 sm:p-4 bg-gradient-to-br from-blue-500/5 to-blue-500/10 border-blue-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground mb-1">New Requests</p>
              <p className="text-xl sm:text-2xl font-bold">{statusCounts.new_request}</p>
            </div>
            <FileText className="w-6 h-6 sm:w-8 sm:h-8 text-blue-500" />
          </div>
        </Card>
        <Card className="p-3 sm:p-4 bg-gradient-to-br from-amber-500/5 to-amber-500/10 border-amber-500/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground mb-1">Under Review</p>
              <p className="text-xl sm:text-2xl font-bold">{statusCounts.under_review}</p>
            </div>
            <Clock className="w-6 h-6 sm:w-8 sm:h-8 text-amber-500" />
          </div>
        </Card>
        <Card className="p-3 sm:p-4 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs sm:text-sm text-muted-foreground mb-1">In Production</p>
              <p className="text-xl sm:text-2xl font-bold">{statusCounts.in_production}</p>
            </div>
            <Package className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
          </div>
        </Card>
      </div>

      <div className="mb-4 sm:mb-6">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orders</SelectItem>
            <SelectItem value="new_request">New Requests</SelectItem>
            <SelectItem value="under_review">Under Review</SelectItem>
            <SelectItem value="quote_sent">Quote Sent</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="in_production">In Production</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3 sm:space-y-4">
        {filteredOrders.map((order) => (
          <Card key={order.id} className="p-4 sm:p-6 hover:shadow-lg transition-shadow">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3">
                  <h3 className="font-semibold text-base sm:text-lg">{order.customer_name}</h3>
                  <Badge className={`${getStatusColor(order.manufacturing_status)} text-xs`}>
                    {order.manufacturing_status.replace(/_/g, ' ')}
                  </Badge>
                  <Badge variant="outline" className="text-xs">{order.products?.category || 'Custom'}</Badge>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 text-sm">
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm text-muted-foreground">Email</p>
                    <p className="font-medium text-xs sm:text-sm truncate">{order.customer_email}</p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Order Value</p>
                    <p className="font-medium text-xs sm:text-sm">${order.total_amount.toLocaleString()}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm text-muted-foreground">Product</p>
                    <p className="font-medium text-xs sm:text-sm truncate">{order.products?.name || 'Custom Design'}</p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">Created</p>
                    <p className="font-medium text-xs sm:text-sm">{new Date(order.created_at).toLocaleDateString()}</p>
                  </div>
                </div>

                {order.manufacturing_notes && (
                  <div className="mt-3 sm:mt-4 p-2 sm:p-3 bg-muted/50 rounded-md">
                    <p className="text-xs sm:text-sm font-medium mb-1">Notes:</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">{order.manufacturing_notes}</p>
                  </div>
                )}

                <div className="mt-3 sm:mt-4 p-2 sm:p-3 bg-muted/30 rounded-md">
                  <p className="text-xs sm:text-sm font-medium mb-2">Design Specifications:</p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs sm:text-sm">
                    {Object.entries(order.configuration).map(([key, value]) => (
                      <div key={key} className="min-w-0">
                        <span className="text-muted-foreground capitalize">{key}: </span>
                        <span className="font-medium">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex sm:ml-4 shrink-0">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setSelectedOrder(order)}
                      className="w-full sm:w-auto"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      <span className="sm:inline">View Details</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-base sm:text-lg">Manufacturing Order Details</DialogTitle>
                    </DialogHeader>
                    {selectedOrder && (
                      <div className="space-y-4">
                        <div>
                          <Label className="text-sm">Update Status</Label>
                          <Select
                            value={selectedOrder.manufacturing_status}
                            onValueChange={(value) => {
                              updateManufacturingStatus(selectedOrder.id, selectedOrder.customer_name, selectedOrder.manufacturing_status, value);
                              setSelectedOrder({ ...selectedOrder, manufacturing_status: value });
                            }}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="new_request">New Request</SelectItem>
                              <SelectItem value="under_review">Under Review</SelectItem>
                              <SelectItem value="quote_sent">Quote Sent</SelectItem>
                              <SelectItem value="approved">Approved</SelectItem>
                              <SelectItem value="in_production">In Production</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-sm">Internal Notes</Label>
                          <Textarea
                            placeholder="Add manufacturing notes..."
                            defaultValue={selectedOrder.manufacturing_notes || ''}
                            onBlur={(e) => updateManufacturingNotes(selectedOrder.id, selectedOrder.customer_name, e.target.value)}
                            rows={4}
                            className="mt-1 text-sm"
                          />
                        </div>

                        <div>
                          <Label className="text-sm">CAD Files</Label>
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-1">
                            <Input type="file" accept=".cad,.stl,.obj" className="text-sm" />
                            <Button size="sm" className="shrink-0">
                              <Upload className="w-4 h-4 mr-1" />
                              Upload
                            </Button>
                          </div>
                          {selectedOrder.manufacturing_cad_files && selectedOrder.manufacturing_cad_files.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {selectedOrder.manufacturing_cad_files.map((file, idx) => (
                                <div key={idx} className="text-xs sm:text-sm text-muted-foreground truncate">{file}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {filteredOrders.length === 0 && (
        <Card className="p-8 sm:p-12 text-center">
          <Package className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-base sm:text-lg font-semibold mb-2">No Manufacturing Orders</h3>
          <p className="text-sm sm:text-base text-muted-foreground">
            {filterStatus === 'all' 
              ? 'No custom manufacturing requests yet' 
              : `No orders with status "${filterStatus.replace(/_/g, ' ')}"`}
          </p>
        </Card>
      )}
    </div>
  );
}
