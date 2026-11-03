import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/pricing-utils';

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

interface RecentOrdersProps {
  orders: any[];
  currency: string;
  isGlass: boolean;
  animDelay: number;
}

export function RecentOrders({ orders, currency, isGlass, animDelay }: RecentOrdersProps) {
  const navigate = useNavigate();

  return (
    <div className={cn(isGlass ? "glass-panel rounded-2xl p-6" : "")}
      style={{ opacity: 0, animation: `fadeUpIn 0.4s ease-out ${animDelay}s forwards` }}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/60">Recent Orders</p>
        <button onClick={() => navigate('/dashboard/orders')} className="text-xs font-semibold hover:underline" style={{ color: '#50c878' }}>
          View all →
        </button>
      </div>
      {orders.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No orders yet</p>
      ) : (
        orders.map((order: any, i: number) => (
          <div
            key={i}
            className={`flex items-center justify-between py-3.5 ${i < orders.length - 1 ? 'border-b border-border/20' : ''}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-[34px] h-[34px] rounded-full flex items-center justify-center shrink-0 bg-muted">
                <span className="text-xs font-bold text-muted-foreground">
                  {getInitials(order.customer_name || 'NA')}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{order.customer_name}</p>
                <p className="text-xs truncate text-muted-foreground">{order.customer_email}</p>
              </div>
            </div>
            <div className="flex flex-col items-end shrink-0 ml-4">
              <p className="text-sm font-semibold text-foreground">{formatCurrency(order.total_amount, currency)}</p>
              <p
                className="text-[11px] font-semibold capitalize"
                style={{ color: STATUS_COLORS[order.status] || '#d97706' }}
              >
                {order.status}
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
