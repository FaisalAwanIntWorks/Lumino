import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, User, Mail, Phone, CalendarDays, Clock, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';

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

const ConfigField = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium capitalize">
      {String(value).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
    </p>
  </div>
);

const buildProductNameFromConfig = (config: any): string | null => {
  if (!config) return null;
  const parts: string[] = [];
  const titleCase = (v: string) =>
    v.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  if (config.style) parts.push(titleCase(config.style));
  if (config.shank) parts.push(titleCase(config.shank));
  if (config.metal) parts.push(titleCase(config.metal));
  if (config.shape) parts.push(titleCase(config.shape));
  if (config.caratRange) parts.push(`${config.caratRange}ct`);
  return parts.length > 0 ? parts.join(' ') : null;
};

interface BookingDetailViewProps {
  booking: Booking;
  onBack: () => void;
  onStatusChange: (bookingId: string, newStatus: string) => void;
}

export const BookingDetailView = ({ booking, onBack, onStatusChange }: BookingDetailViewProps) => {
  const config = booking.ring_configuration;
  const productName = buildProductNameFromConfig(config);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex-1" />
        <Badge variant="outline" className={`${statusColors[booking.status] || ''} capitalize`}>
          {booking.status}
        </Badge>
      </div>

      <div>
        <h2 className="text-xl font-semibold">{booking.customer_name}</h2>
        {productName && (
          <p className="text-sm text-muted-foreground mt-0.5">{productName}</p>
        )}
        <p className="text-xs text-muted-foreground mt-1">
          Submitted {format(new Date(booking.created_at), 'MMMM d, yyyy · h:mm a')}
        </p>
      </div>

      <Separator />

      {/* Customer Info */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Customer Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm">{booking.customer_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm">{booking.customer_email}</span>
          </div>
          {booking.customer_phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm">{booking.customer_phone}</span>
            </div>
          )}
        </div>
      </div>

      {/* Appointment Details */}
      {(booking.preferred_date || booking.preferred_time) && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold mb-3">Appointment Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {booking.preferred_date && (
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">
                    {format(new Date(booking.preferred_date), 'MMMM d, yyyy')}
                  </span>
                </div>
              )}
              {booking.preferred_time && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm">{booking.preferred_time}</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Message */}
      {booking.message && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold mb-3">Message</h3>
            <div className="flex items-start gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-sm">{booking.message}</p>
            </div>
          </div>
        </>
      )}

      {/* Ring Configuration */}
      {config && Object.keys(config).length > 0 && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold mb-3">Ring Configuration</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {config.style && <ConfigField label="Style" value={config.style} />}
              {config.shank && <ConfigField label="Shank" value={config.shank} />}
              {config.metal && <ConfigField label="Metal" value={config.metal} />}
              {config.shape && <ConfigField label="Shape" value={config.shape} />}
              {config.caratRange && <ConfigField label="Carat" value={`${config.caratRange}ct`} />}
              {config.stone?.name && <ConfigField label="Stone" value={config.stone.name} />}
              {config.size && <ConfigField label="Size" value={String(config.size)} />}
              {config.engraving?.enabled && config.engraving?.text && (
                <ConfigField label="Engraving" value={config.engraving.text} />
              )}
            </div>
          </div>
        </>
      )}

      {/* Status Update */}
      <Separator />
      <div>
        <h3 className="text-sm font-semibold mb-3">Update Status</h3>
        <div className="flex flex-wrap gap-2">
          {['pending', 'confirmed', 'completed', 'cancelled'].map((s) => (
            <Button
              key={s}
              size="sm"
              variant={booking.status === s ? 'default' : 'outline'}
              onClick={() => onStatusChange(booking.id, s)}
              className="capitalize text-xs"
            >
              {s}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};
