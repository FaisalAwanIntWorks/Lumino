import { stickyHeaderTableClass } from "@/components/ui/table";
import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { CalendarDays, Search, Eye, Tag, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { BookingDetailView } from '@/components/bookings/BookingDetailView';

const BOOKING_STATUSES = ['pending', 'confirmed', 'completed', 'cancelled'] as const;

interface Booking {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  message: string | null;
  status: string;
  created_at: string;
  ring_configuration: any | null;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  confirmed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
};

const buildRingSummary = (config: any): string => {
  if (!config) return '—';
  const parts: string[] = [];
  const titleCase = (v: string) =>
    v.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  if (config.style) parts.push(titleCase(config.style));
  if (config.metal) parts.push(titleCase(config.metal));
  if (config.shape) parts.push(titleCase(config.shape));
  return parts.length > 0 ? parts.join(' · ') : '—';
};

export default function Bookings() {
  const { role, staffInfo } = useAuth();
  const { impersonatedClientId } = useAdminImpersonation();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchBookings();
  }, [impersonatedClientId]);

  const fetchBookings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let clientId = impersonatedClientId;

      if (!clientId) {
        if (role === 'staff' && staffInfo?.clientId) {
          clientId = staffInfo.clientId;
        } else {
          const { data: client } = await supabase
            .from('clients')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();
          clientId = client?.id;
        }
      }

      if (!clientId) return;

      const { data, error } = await supabase
        .from('appointment_bookings')
        .select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching bookings:', error);
        return;
      }

      setBookings((data as any[]) || []);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (bookingId: string, newStatus: string) => {
    const { error } = await supabase
      .from('appointment_bookings')
      .update({ status: newStatus })
      .eq('id', bookingId);

    if (!error) {
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
      if (selectedBooking?.id === bookingId) {
        setSelectedBooking(prev => prev ? { ...prev, status: newStatus } : null);
      }
    }
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const { data, error } = await supabase
        .from('appointment_bookings')
        .update({ status: newStatus })
        .in('id', ids)
        .select('id');
      if (error) throw error;
      const updated = data?.length ?? 0;
      if (updated === 0) {
        toast.error('No bookings updated — you may not have permission.');
        return;
      }
      setBookings(prev => prev.map(b => ids.includes(b.id) ? { ...b, status: newStatus } : b));
      setSelectedIds(new Set());
      toast.success(`Updated ${updated} booking${updated !== 1 ? 's' : ''}`);
    } catch (err) {
      console.error('Bulk status update failed:', err);
      toast.error('Failed to update bookings');
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const { error } = await supabase.from('appointment_bookings').delete().in('id', ids);
      if (error) throw error;
      setBookings(prev => prev.filter(b => !ids.includes(b.id)));
      setSelectedIds(new Set());
      toast.success(`Deleted ${ids.length} booking${ids.length !== 1 ? 's' : ''}`);
    } catch (err) {
      console.error('Bulk delete failed:', err);
      toast.error('Failed to delete bookings');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredBookings.length && filteredBookings.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredBookings.map(b => b.id)));
    }
  };

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      const matchesSearch =
        b.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.customer_email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [bookings, searchQuery, statusFilter]);

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-6 sm:h-8 w-32 sm:w-48" />
        </div>
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <Skeleton className="h-5 sm:h-6 w-24 sm:w-32" />
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="space-y-3 sm:space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-20 sm:h-16" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Inline detail view
  if (selectedBooking) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <BookingDetailView
          booking={selectedBooking}
          onBack={() => setSelectedBooking(null)}
          onStatusChange={updateStatus}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold">Bookings</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Appointment bookings from your widget
        </p>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by customer name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] h-9 text-sm">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  {['all', 'pending', 'confirmed', 'completed', 'cancelled'].map((s) => (
                    <SelectItem key={s} value={s} className="capitalize text-sm">
                      {s === 'all' ? 'All Status' : s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 mb-4">
              <span className="text-sm font-medium text-foreground">
                {selectedIds.size} selected
              </span>
              <div className="flex items-center gap-2 ml-auto">
                <Select onValueChange={handleBulkStatusChange}>
                  <SelectTrigger className="w-[160px] h-8 text-xs">
                    <Tag className="h-3 w-3 mr-1" />
                    <SelectValue placeholder="Change status" />
                  </SelectTrigger>
                  <SelectContent>
                    {BOOKING_STATUSES.map(s => (
                      <SelectItem key={s} value={s} className="capitalize">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="h-8 gap-1 text-xs">
                      <Trash2 className="h-3 w-3" /> Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {selectedIds.size} booking{selectedIds.size !== 1 ? 's' : ''}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. The selected bookings will be permanently removed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}
          {filteredBookings.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40 text-muted-foreground" />
              <p className="text-sm sm:text-base text-muted-foreground font-medium">
                {bookings.length === 0 ? 'No bookings yet' : 'No bookings match your filters'}
              </p>
              {bookings.length === 0 && (
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  Bookings from your widget will appear here
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Mobile Card Layout */}
              <div className="space-y-3 md:hidden">
                {filteredBookings.map((booking) => (
                  <Card key={booking.id} className="p-3 sm:p-4">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <Checkbox
                          checked={selectedIds.has(booking.id)}
                          onCheckedChange={() => toggleSelect(booking.id)}
                          className="mt-1"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{booking.customer_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{booking.customer_email}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className={`${statusColors[booking.status] || ''} capitalize shrink-0 text-[10px]`}>
                        {booking.status}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm mb-2">
                      <div>
                        <span className="text-muted-foreground">Ring:</span>
                        <p className="font-medium truncate">{buildRingSummary(booking.ring_configuration)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Date:</span>
                        <p className="font-medium">
                          {booking.preferred_date
                            ? format(new Date(booking.preferred_date), 'MMM d, yyyy')
                            : '—'}
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-border">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(booking.created_at), 'MMM d, yyyy')}
                      </span>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSelectedBooking(booking)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Desktop Table Layout */}
              <div className="hidden md:block overflow-x-auto">
                <Table containerClassName={stickyHeaderTableClass}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            filteredBookings.length > 0 &&
                            selectedIds.size === filteredBookings.length
                          }
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead className="text-xs lg:text-sm">Name</TableHead>
                      <TableHead className="text-xs lg:text-sm">Email</TableHead>
                      <TableHead className="text-xs lg:text-sm">Ring Details</TableHead>
                      <TableHead className="text-xs lg:text-sm">Date</TableHead>
                      <TableHead className="text-xs lg:text-sm">Time</TableHead>
                      <TableHead className="text-xs lg:text-sm">Status</TableHead>
                      <TableHead className="text-xs lg:text-sm">Submitted</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBookings.map((booking) => (
                      <TableRow
                        key={booking.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedBooking(booking)}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(booking.id)}
                            onCheckedChange={() => toggleSelect(booking.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium text-sm">{booking.customer_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{booking.customer_email}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {buildRingSummary(booking.ring_configuration)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {booking.preferred_date
                            ? format(new Date(booking.preferred_date), 'MMM d, yyyy')
                            : '—'}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {booking.preferred_time || '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`${statusColors[booking.status] || ''} capitalize`}>
                            {booking.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(booking.created_at), 'MMM d, yyyy')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
