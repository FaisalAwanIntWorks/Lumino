import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface LinkedBooking {
  id: string;
  customer_name: string;
  preferred_date: string | null;
  preferred_time: string | null;
  status: string;
  created_at: string;
  ring_configuration: any;
}

interface LinkedBookingsPanelProps {
  customerEmail: string;
  clientId: string;
}

const getBookingSourceLabel = (config: any): string => {
  if (!config) return 'Booking';
  const source = config.source;
  if (source === 'metal_iq') return 'Metal IQ';
  if (source === 'custom_enquiry') return 'Custom';
  if (source === 'ring_builder') return 'Ring Builder';
  return 'Ring OS';
};

const BOOKING_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'no_show', label: 'No Show' },
  { value: 'cancelled', label: 'Cancelled' },
];

const statusColors: Record<string, string> = {
  pending: 'border-amber-500/30 text-amber-600',
  confirmed: 'border-blue-500/30 text-blue-600',
  completed: 'border-emerald-500/30 text-emerald-600',
  no_show: 'border-red-500/30 text-red-600',
  cancelled: 'border-red-500/30 text-red-600',
};

export function LinkedBookingsPanel({ customerEmail, clientId }: LinkedBookingsPanelProps) {
  const [bookings, setBookings] = useState<LinkedBooking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!customerEmail) { setLoading(false); return; }
    const fetch = async () => {
      const { data } = await supabase
        .from('appointment_bookings')
        .select('id, customer_name, preferred_date, preferred_time, status, created_at, ring_configuration')
        .eq('client_id', clientId)
        .eq('customer_email', customerEmail)
        .order('created_at', { ascending: false });
      setBookings((data || []) as LinkedBooking[]);
      setLoading(false);
    };
    fetch();
  }, [customerEmail, clientId]);

  const handleStatusChange = async (bookingId: string, newStatus: string) => {
    const { error } = await supabase
      .from('appointment_bookings')
      .update({ status: newStatus } as any)
      .eq('id', bookingId);
    if (error) {
      toast.error('Failed to update booking status');
      return;
    }
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
    toast.success(`Booking marked as "${newStatus.replace('_', ' ')}"`);
  };

  if (loading) return null;
  if (bookings.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          Linked Bookings ({bookings.length})
        </h4>
        <div className="space-y-2">
          {bookings.map(b => (
            <div key={b.id} className="flex items-start gap-2 py-2 border-b border-border/30 last:border-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {getBookingSourceLabel(b.ring_configuration)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {b.preferred_date
                    ? `${b.preferred_date}${b.preferred_time ? ` at ${b.preferred_time}` : ''}`
                    : format(new Date(b.created_at), 'MMM d, yyyy')}
                </p>
                <div className="mt-1.5">
                  <Select value={b.status} onValueChange={(val) => handleStatusChange(b.id, val)}>
                    <SelectTrigger className="h-6 w-[120px] text-[10px] px-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BOOKING_STATUSES.map(s => (
                        <SelectItem key={s.value} value={s.value} className="text-xs">
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
