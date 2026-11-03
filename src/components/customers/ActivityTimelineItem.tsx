import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Wallet, ChevronDown, ChevronUp } from 'lucide-react';
import type { CustomerActivity } from '@/hooks/useCustomerHub';

const SOURCE_LABELS: Record<string, string> = {
  widget: 'Ring OS',
  grill_form: 'Grillz',
  custom_enquiry: 'Custom Enquiry',
  ring_builder: 'Ring Builder',
  diamond_form: 'Diamond Form',
  booking: 'Booking',
  metal_iq: 'Metal IQ',
  order: 'Order',
  cad_request: 'CAD Request',
  cad_resize: 'CAD Resize',
};

const SOURCE_COLORS: Record<string, string> = {
  widget: 'border-muted-foreground/30 text-muted-foreground',
  grill_form: 'border-amber-500/30 text-amber-600',
  custom_enquiry: 'border-emerald-500/30 text-emerald-600',
  ring_builder: 'border-violet-500/30 text-violet-600',
  diamond_form: 'border-primary/30 text-primary',
  booking: 'border-blue-500/30 text-blue-600',
  metal_iq: 'border-orange-500/30 text-orange-600',
  order: 'border-emerald-500/30 text-emerald-600',
  cad_request: 'border-pink-500/30 text-pink-600',
  cad_resize: 'border-pink-500/30 text-pink-600',
};

const TYPE_EMOJIS: Record<string, string> = {
  lead: '🔷',
  booking: '📅',
  order: '💰',
  metal_iq: '🪙',
  cad: '🔧',
};

interface ActivityTimelineItemProps {
  activity: CustomerActivity;
  getStatusColor: (status: string) => string;
  isExpanded: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}

export function ActivityTimelineItem({ activity, getStatusColor, isExpanded, onToggle, children }: ActivityTimelineItemProps) {
  const isDeposit = activity.type === 'order' && ['grillz-builder', 'custom-inquiry'].includes(activity.orderSource || '');

  return (
    <div className={`rounded-lg border transition-colors ${isExpanded ? 'border-primary/30 bg-muted/30' : 'border-transparent hover:border-border/50 hover:bg-muted/50'}`}>
      <button
        className="w-full text-left flex items-center gap-3 py-3 px-3 group"
        onClick={onToggle}
      >
        <span className="text-base shrink-0">{TYPE_EMOJIS[activity.type] || '📋'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{activity.productName}</span>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${SOURCE_COLORS[activity.source] || ''}`}>
              {SOURCE_LABELS[activity.source] || activity.source}
            </Badge>
            {isDeposit && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-600">
                <Wallet className="h-2.5 w-2.5 mr-0.5" />
                Deposit
              </Badge>
            )}
            {activity.amount != null && activity.amount > 0 && (
              <span className="text-xs font-medium text-foreground">${activity.amount.toLocaleString()}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(new Date(activity.created_at), 'MMM d, yyyy · h:mm a')}
          </p>
        </div>
        <Badge 
          variant="outline" 
          className="text-[10px] px-1.5 py-0 capitalize shrink-0"
          style={{ borderColor: getStatusColor(activity.status) + '40', color: getStatusColor(activity.status) }}
        >
          {activity.status}
        </Badge>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        )}
      </button>
      {isExpanded && children && (
        <div className="px-3 pb-3 pt-1 border-t border-border/30">
          {children}
        </div>
      )}
    </div>
  );
}
