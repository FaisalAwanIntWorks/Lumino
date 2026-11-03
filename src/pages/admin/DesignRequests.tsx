import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Search, Eye, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { useAdminActivityLogger } from '@/hooks/useAdminActivityLogger';

interface DesignRequest {
  id: string;
  client_id: string;
  request_type: string;
  description: string;
  preferred_style: string | null;
  preferred_metal: string | null;
  budget_range: string | null;
  status: string;
  priority: string;
  admin_notes: string | null;
  created_at: string;
  clients: { company_name: string };
}

export default function DesignRequests() {
  const [requests, setRequests] = useState<DesignRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState<DesignRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const { logDesignRequestStatusUpdate, logDesignRequestNotesUpdate } = useAdminActivityLogger();

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('design_requests')
        .select('*, clients(company_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error fetching design requests:', error);
      toast.error('Failed to load design requests');
    } finally {
      setLoading(false);
    }
  };

  const updateRequestStatus = async (requestId: string, clientName: string, oldStatus: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('design_requests')
        .update({ status: newStatus })
        .eq('id', requestId);

      if (error) throw error;
      
      // Log the activity
      await logDesignRequestStatusUpdate(requestId, clientName, oldStatus, newStatus);
      
      toast.success('Status updated successfully');
      fetchRequests();
      if (selectedRequest?.id === requestId) {
        setSelectedRequest({ ...selectedRequest, status: newStatus });
      }
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Failed to update status');
    }
  };

  const saveAdminNotes = async () => {
    if (!selectedRequest) return;

    try {
      const { error } = await supabase
        .from('design_requests')
        .update({ admin_notes: adminNotes })
        .eq('id', selectedRequest.id);

      if (error) throw error;
      
      // Log the activity
      await logDesignRequestNotesUpdate(selectedRequest.id, selectedRequest.clients.company_name);
      
      toast.success('Notes saved successfully');
      fetchRequests();
    } catch (error) {
      console.error('Error saving notes:', error);
      toast.error('Failed to save notes');
    }
  };

  const filteredRequests = requests.filter((req) => {
    const matchesSearch = 
      req.clients.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      req.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || req.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-500/10 dark:text-blue-400',
      under_review: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/10 dark:text-yellow-400',
      in_progress: 'bg-purple-100 text-purple-800 dark:bg-purple-500/10 dark:text-purple-400',
      completed: 'bg-primary/10 text-primary',
      cancelled: 'bg-gray-100 text-gray-800 dark:bg-gray-500/10 dark:text-gray-400',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getPriorityColor = (priority: string) => {
    const colors: Record<string, string> = {
      low: 'bg-gray-100 text-gray-800',
      normal: 'bg-blue-100 text-blue-800',
      high: 'bg-orange-100 text-orange-800',
      urgent: 'bg-red-100 text-red-800',
    };
    return colors[priority] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-8 sm:h-10 w-48 sm:w-64 mb-4 sm:mb-6" />
        <Skeleton className="h-4 w-64 mb-6" />
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-full sm:w-[200px]" />
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 sm:h-36" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">Design Requests</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Manage custom design requests from clients</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by client or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="under_review">Under Review</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Requests List */}
      <div className="space-y-4">
        {filteredRequests.map((request) => (
          <Card key={request.id} className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                  <h3 className="font-semibold text-base sm:text-lg">{request.clients.company_name}</h3>
                  <Badge className={`text-xs ${getStatusColor(request.status)}`}>
                    {request.status.replace('_', ' ')}
                  </Badge>
                  <Badge className={`text-xs ${getPriorityColor(request.priority)}`}>
                    {request.priority}
                  </Badge>
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                  {request.request_type.replace('_', ' ')} • {new Date(request.created_at).toLocaleDateString()}
                </p>
                <p className="text-xs sm:text-sm line-clamp-2 sm:line-clamp-none">{request.description}</p>
                {request.budget_range && (
                  <p className="text-xs sm:text-sm text-muted-foreground mt-2">Budget: {request.budget_range}</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto shrink-0"
                onClick={() => {
                  setSelectedRequest(request);
                  setAdminNotes(request.admin_notes || '');
                }}
              >
                <Eye className="h-4 w-4 mr-2" />
                View Details
              </Button>
            </div>
          </Card>
        ))}

        {filteredRequests.length === 0 && (
          <Card className="p-8 sm:p-12 text-center">
            <MessageSquare className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 text-muted-foreground" />
            <p className="text-sm sm:text-base text-muted-foreground">No design requests found</p>
          </Card>
        )}
      </div>

      {/* Request Details Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent className="max-w-2xl max-w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl">Design Request Details</DialogTitle>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4 sm:space-y-6">
              <div>
                <Label className="text-xs sm:text-sm">Client</Label>
                <p className="text-base sm:text-lg font-semibold">{selectedRequest.clients.company_name}</p>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label className="text-xs sm:text-sm">Request Type</Label>
                  <p className="text-xs sm:text-sm">{selectedRequest.request_type.replace('_', ' ')}</p>
                </div>
                <div>
                  <Label className="text-xs sm:text-sm">Budget Range</Label>
                  <p className="text-xs sm:text-sm">{selectedRequest.budget_range || 'Not specified'}</p>
                </div>
                {selectedRequest.preferred_style && (
                  <div>
                    <Label className="text-xs sm:text-sm">Preferred Style</Label>
                    <p className="text-xs sm:text-sm capitalize">{selectedRequest.preferred_style}</p>
                  </div>
                )}
                {selectedRequest.preferred_metal && (
                  <div>
                    <Label className="text-xs sm:text-sm">Preferred Metal</Label>
                    <p className="text-xs sm:text-sm capitalize">{selectedRequest.preferred_metal}</p>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs sm:text-sm">Description</Label>
                <p className="text-xs sm:text-sm whitespace-pre-wrap">{selectedRequest.description}</p>
              </div>

              <div>
                <Label className="text-xs sm:text-sm">Status</Label>
                <Select
                  value={selectedRequest.status}
                  onValueChange={(value) => updateRequestStatus(selectedRequest.id, selectedRequest.clients.company_name, selectedRequest.status, value)}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="under_review">Under Review</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs sm:text-sm">Admin Notes</Label>
                <Textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Add internal notes about this request..."
                  rows={4}
                  className="text-sm"
                />
                <Button onClick={saveAdminNotes} className="mt-2 w-full sm:w-auto">
                  Save Notes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
