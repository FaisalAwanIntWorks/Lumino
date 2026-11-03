import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { DashboardStats } from '@/hooks/useClientDashboard';

// Raised neumorphic pill; hovering a lead/order tag swaps in its own colour.
const PILL_BASE = "neu-pill inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-foreground capitalize cursor-pointer group";

interface StatusTagsProps {
  stats: DashboardStats;
  leadTags: Array<{ id: string; tag_name: string; tag_color: string }>;
  orderTags: Array<{ id: string; tag_name: string; tag_color: string }>;
  productType: string;
  isGlass: boolean;
  animDelay: number;
}

export function StatusTags({ stats, leadTags, orderTags, productType, isGlass, animDelay }: StatusTagsProps) {
  const navigate = useNavigate();
  const hasCadStatuses = Object.keys(stats.cadStatusCounts).length > 0;

  if (leadTags.length === 0 && orderTags.length === 0 && !hasCadStatuses) return null;

  return (
    <div
      className={cn("mt-10", isGlass ? "glass-panel rounded-2xl p-6" : "neu-card neu-static p-5 sm:p-6")}
      style={{ opacity: 0, animation: `fadeUpIn 0.4s ease-out ${animDelay}s forwards` }}
    >
      {leadTags.length > 0 && (
        <div className="mb-6">
          <p className="text-[11px] font-semibold tracking-[0.1em] uppercase mb-3 text-muted-foreground/60">
            {productType === 'custom_x' ? 'Custom X' : productType === 'ring_os' ? 'Ring OS' : 'Lead Status'}
          </p>
          <div className="flex flex-wrap gap-3">
            {leadTags.map(tag => (
              <span
                key={tag.id}
                onClick={() => navigate(`/dashboard/saved-designs?status=${encodeURIComponent(tag.tag_name)}`)}
                className={PILL_BASE}
                onMouseEnter={(e) => {
                  e.currentTarget.className = cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border capitalize cursor-pointer transition-all duration-200 hover:shadow-sm group",
                    tag.tag_color
                  );
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.className = PILL_BASE;
                }}
              >
                {tag.tag_name}
                <span className="opacity-60">·</span>
                <span>{stats.leadTagCounts[tag.tag_name] || 0}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {orderTags.length > 0 && productType !== 'metal_iq' && (
        <div className={hasCadStatuses ? 'mb-6' : ''}>
          <p className="text-[11px] font-semibold tracking-[0.1em] uppercase mb-3 text-muted-foreground/60">
            {productType === 'custom_x' ? 'Custom X Orders' : productType === 'ring_os' ? 'Ring OS Orders' : 'Order Status'}
          </p>
          <div className="flex flex-wrap gap-3">
            {orderTags.map(tag => (
              <span
                key={tag.id}
                onClick={() => navigate(`/dashboard/orders?status=${encodeURIComponent(tag.tag_name)}`)}
                className={PILL_BASE}
                onMouseEnter={(e) => {
                  e.currentTarget.className = cn(
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border capitalize cursor-pointer transition-all duration-200 hover:shadow-sm group",
                    tag.tag_color
                  );
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.className = PILL_BASE;
                }}
              >
                {tag.tag_name}
                <span className="opacity-60">·</span>
                <span>{stats.orderTagCounts[tag.tag_name] || 0}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {hasCadStatuses && (
        <div>
          <p className="text-[11px] font-semibold tracking-[0.1em] uppercase mb-3 text-muted-foreground/60">
            CAD Status
          </p>
          <div className="flex flex-wrap gap-3">
            {Object.entries(stats.cadStatusCounts)
              .sort(([a], [b]) => {
                const order = ['pending', 'in_progress', 'revision', 'approved', 'completed'];
                const ai = order.indexOf(a) === -1 ? 999 : order.indexOf(a);
                const bi = order.indexOf(b) === -1 ? 999 : order.indexOf(b);
                return ai - bi;
              })
              .map(([status, count]) => (
              <span
                key={status}
                onClick={() => navigate('/dashboard/cad-requests')}
                className={PILL_BASE}
              >
                {status.replace(/_/g, ' ')}
                <span className="opacity-60">·</span>
                <span>{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
