import { Bell, Package, Calendar, ShoppingCart, Users, Settings, Monitor, Check, CheckCheck, Trash2, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

import { useNotifications, type ClientNotification } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

function getNotificationLink(category: string): string {
  switch (category) {
    case 'lead':
    case 'booking':
      return '/dashboard/saved-designs';
    case 'order':
      return '/dashboard/orders';
    case 'cad_chat':
    case 'cad':
      return '/dashboard/cad-requests';
    default:
      return '/dashboard/settings';
  }
}

const categoryConfig: Record<string, { icon: typeof Bell; color: string }> = {
  lead: { icon: Package, color: 'text-blue-500' },
  booking: { icon: Calendar, color: 'text-green-500' },
  order: { icon: ShoppingCart, color: 'text-amber-500' },
  staff: { icon: Users, color: 'text-purple-500' },
  account: { icon: Settings, color: 'text-muted-foreground' },
  system: { icon: Monitor, color: 'text-muted-foreground' },
  cad_chat: { icon: MessageSquare, color: 'text-indigo-500' },
  cad: { icon: Package, color: 'text-indigo-500' },
};

function NotificationItem({ notification, onMarkRead, onNavigate }: { notification: ClientNotification; onMarkRead: (id: string) => void; onNavigate: (path: string) => void }) {
  const config = categoryConfig[notification.category] || categoryConfig.system;
  const Icon = config.icon;
  const timeAgo = formatDistanceToNow(new Date(notification.created_at), { addSuffix: true });

  const handleClick = () => {
    if (!notification.is_read) {
      onMarkRead(notification.id);
    }
    onNavigate(getNotificationLink(notification.category));
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 cursor-pointer',
        !notification.is_read && 'bg-primary/5'
      )}
    >
      <div className={cn('mt-0.5 shrink-0', config.color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <p className={cn('text-sm truncate', !notification.is_read ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground')}>
            {notification.title}
          </p>
          {!notification.is_read && (
            <span className="shrink-0 h-2 w-2 rounded-full bg-primary" />
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{notification.message}</p>
        <p className="text-[11px] text-muted-foreground/60">{timeAgo}</p>
      </div>
    </button>
  );
}

export function NotificationDropdown() {
  const { notifications, unreadCount, loading, markAsRead, markAllAsRead, clearAll } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleNavigate = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative hover:bg-primary/10">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0 bg-popover">
        <div className="flex items-center justify-between px-4 py-3">
          <DropdownMenuLabel className="p-0 text-base">Notifications</DropdownMenuLabel>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                onClick={markAllAsRead}
              >
                <CheckCheck className="h-3.5 w-3.5 mr-1" />
                Mark all read
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-2 py-1 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={clearAll}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Clear all
              </Button>
            )}
          </div>
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="overflow-y-auto" style={{ maxHeight: 'min(70vh, 500px)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Bell className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map(notif => (
                <NotificationItem
                  key={notif.id}
                  notification={notif}
                  onMarkRead={markAsRead}
                  onNavigate={handleNavigate}
                />
              ))}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
