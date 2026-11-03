import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/pricing-utils';
import type { LeadItem } from '@/hooks/useClientDashboard';

const SOURCE_LABELS: Record<string, string> = {
  widget: 'Ring OS',
  ring_builder: 'Ring Builder',
  diamond_form: 'Instant Quote',
  grill_form: 'Grillz',
  custom_enquiry: 'Custom',
  booking: 'Booking',
  metal_iq: 'Metal IQ',
};

const STATUS_COLORS: Record<string, string> = {
  new: '#16a34a',
  contacted: '#2563eb',
  pending: '#d97706',
  closed: '#9ca3af',
  completed: '#9ca3af',
};

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

interface RecentLeadsProps {
  leads: LeadItem[];
  currency: string;
  isGlass: boolean;
  animDelay: number;
  tick: number;
}

export function RecentLeads({ leads, currency, isGlass, animDelay, tick }: RecentLeadsProps) {
  const navigate = useNavigate();

  return (
    <div className={cn(isGlass ? "glass-panel rounded-2xl p-6" : "")}
      style={{ opacity: 0, animation: `fadeUpIn 0.4s ease-out ${animDelay}s forwards` }}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/60">Recent Leads</p>
        <button onClick={() => navigate('/dashboard/saved-designs')} className="text-xs font-semibold hover:underline" style={{ color: '#50c878' }}>
          View all →
        </button>
      </div>
      {leads.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No leads yet</p>
      ) : (
        leads.map((lead, i) => (
          <div
            key={lead.id}
            className={`flex items-center justify-between py-3.5 ${i < leads.length - 1 ? 'border-b border-border/20' : ''}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-[34px] h-[34px] rounded-full flex items-center justify-center shrink-0 bg-muted">
                <span className="text-xs font-bold text-muted-foreground">
                  {getInitials(lead.customer_name)}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{lead.customer_name}</p>
                <p className="text-xs text-muted-foreground">
                  {SOURCE_LABELS[lead.source]} · {timeAgo(lead.created_at)}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end shrink-0 ml-4">
              {lead.estimated_total ? (
                <p className="text-sm font-semibold text-foreground">{formatCurrency(lead.estimated_total, currency)}</p>
              ) : null}
              <p
                className="text-[11px] font-semibold capitalize"
                style={{ color: STATUS_COLORS[lead.follow_up_status || 'new'] || '#9ca3af' }}
              >
                {lead.follow_up_status || 'New'}
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
