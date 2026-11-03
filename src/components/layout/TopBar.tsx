import { LogOut, User, Loader2, RefreshCw, Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { DashboardSearch } from './DashboardSearch';
import { NotificationDropdown } from './NotificationDropdown';
import { AdminNotificationDropdown } from './AdminNotificationDropdown';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useSyncContext } from '@/contexts/SyncContext';

export function TopBar() {
  const { user, role, signOut, loggingOut } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const { profile } = useUserProfile();
  const navigate = useNavigate();

  // Safely try to use SyncContext (only available inside ClientLayout)
  let syncCtx: ReturnType<typeof useSyncContext> | null = null;
  try { syncCtx = useSyncContext(); } catch { /* not in SyncProvider */ }
  const isAnySyncRunning = syncCtx?.isAnySyncRunning ?? false;
  const activeJobs = syncCtx?.activeJobs ?? [];

  const getProfilePath = () => {
    if (role === 'agency_admin') return '/admin/profile';
    return '/dashboard/profile';
  };

  const initials = user?.email
    ?.split('@')[0]
    .slice(0, 2)
    .toUpperCase() || 'U';

  const displayName = profile.full_name || user?.email?.split('@')[0] || 'User';

  return (
    <>
      {/* Full-screen logout overlay */}
      {loggingOut && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
          <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
          <p className="text-lg font-medium text-foreground">Signing out...</p>
        </div>
      )}

      <header className="border-b border-border bg-card h-14 flex items-center justify-between px-4 gap-4">
        <DashboardSearch />
        <div className="flex items-center gap-2">
          {/* Sync indicator */}
          {isAnySyncRunning && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium animate-pulse">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span className="hidden sm:inline">
                {activeJobs.find(j => j.status === 'running')?.type === 'rings' ? 'Syncing Rings' : 'Syncing Diamonds'}...
              </span>
            </div>
          )}



          {/* Day / night mode */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label={resolvedTheme === 'dark' ? 'Switch to day mode' : 'Switch to night mode'}
            title={resolvedTheme === 'dark' ? 'Day mode' : 'Night mode'}
            className="hover:bg-primary/10"
          >
            {resolvedTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>

          {/* Notifications */}
          {role === 'agency_admin' ? <AdminNotificationDropdown /> : <NotificationDropdown />}

          {/* User Menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 hover:bg-primary/10">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={profile.avatar_url} alt="Profile" />
                  <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium hidden md:inline">{displayName}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-popover">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate(getProfilePath())} className="cursor-pointer">
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} disabled={loggingOut} className="text-destructive">
                {loggingOut ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LogOut className="mr-2 h-4 w-4" />}
                {loggingOut ? 'Signing out...' : 'Sign out'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </>
  );
}
