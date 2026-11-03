import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { CalendarDays } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface BookingItem {
  id: string;
  customer_name: string;
  customer_email: string;
  preferred_date: string | null;
  preferred_time: string | null;
  status: string;
}

interface UpcomingBookingsProps {
  bookings: BookingItem[];
  isGlass: boolean;
  animDelay: number;
}

const statusColor = (status: string) => {
  switch (status.toLowerCase()) {
    case 'confirmed': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'completed': return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'cancelled':
    case 'no_show': return 'bg-red-500/10 text-red-600 border-red-500/20';
    default: return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
  }
};

export function UpcomingBookings({ bookings, isGlass, animDelay }: UpcomingBookingsProps) {
  const navigate = useNavigate();

  if (bookings.length === 0) return null;

  return (
    <div
      className={cn(isGlass ? "glass-panel rounded-2xl p-6" : "")}
      style={{ opacity: 0, animation: `fadeUpIn 0.4s ease-out ${animDelay}s forwards` }}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/60">
          Upcoming Bookings
        </p>
        <button
          onClick={() => navigate('/dashboard/saved-designs')}
          className="text-[11px] font-medium text-primary hover:underline"
        >
          View all →
        </button>
      </div>

      <div className="space-y-3">
        {bookings.map((b) => (
          <div key={b.id} className="flex items-start gap-3 group">
            <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 mt-0.5">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{b.customer_name}</p>
              <p className="text-xs text-muted-foreground">
                {b.preferred_date ? new Date(b.preferred_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No date'}
                {b.preferred_time ? ` at ${b.preferred_time}` : ''}
              </p>
            </div>
            <Badge className={cn("text-[10px] shrink-0", statusColor(b.status))}>
              {b.status}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
