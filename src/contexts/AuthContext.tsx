import { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { clearPageCache } from '@/lib/page-cache';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { SESSION_TIMEOUTS, SESSION_WARNING_TIME } from '@/lib/domain-config';
import { logLoginActivity, logLogoutActivity } from '@/lib/activity-logger';
import { logAdminLoginActivity, logAdminLogoutActivity } from '@/lib/admin-activity-logger';
import { resolveRoleForPortal } from '@/lib/auth-utils';
import { installAdminWriteGuard, setAdminReadOnly } from '@/lib/admin-write-guard';

// Patch the Supabase client before any component can issue a write.
installAdminWriteGuard();

type UserRole = 'agency_admin' | 'client' | 'staff' | null;

interface StaffInfo {
  id: string;
  clientId: string;
  permissions: {
    catalog_access?: boolean | string; // 'false' | 'view' | 'edit' or legacy boolean
    custom_x_access?: boolean | string; // 'false' | 'view' | 'edit'
    metal_buying_access?: boolean | string; // 'false' | 'view' | 'edit'
    leads_access?: boolean;
    [key: string]: boolean | string | undefined;
  };
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: UserRole;
  staffInfo: StaffInfo | null;
  /** null while still unknown, true for the three platform owners. */
  isSuperAdmin: boolean | null;
  /** Agency admin without super admin rights: may look, must not touch. */
  isReadOnlyAdmin: boolean;
  loading: boolean;
  loggingOut: boolean;
  rememberMe: boolean;
  setRememberMe: (value: boolean) => void;
  signOut: () => Promise<void>;
  refreshRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Activity events for session tracking
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'] as const;
const ACTIVITY_CHECK_INTERVAL_MS = 30 * 1000; // Check every 30 seconds

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [staffInfo, setStaffInfo] = useState<StaffInfo | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => {
    // Load remember me preference from localStorage
    return localStorage.getItem('jewlx_remember_me') === 'true';
  });
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Use ref to track last activity without causing re-renders
  const lastActivityRef = useRef<number>(Date.now());
  const warningShownRef = useRef<boolean>(false);

  // Save remember me preference
  useEffect(() => {
    localStorage.setItem('jewlx_remember_me', String(rememberMe));
  }, [rememberMe]);

  // Get session timeout based on role and remember me setting
  const getSessionTimeout = useCallback(() => {
    if (rememberMe) {
      return SESSION_TIMEOUTS.remember_me;
    }
    
    switch (role) {
      case 'agency_admin':
        return SESSION_TIMEOUTS.agency_admin;
      case 'client':
        return SESSION_TIMEOUTS.client;
      case 'staff':
        return SESSION_TIMEOUTS.staff;
      default:
        return SESSION_TIMEOUTS.default;
    }
  }, [role, rememberMe]);

  const fetchStaffInfo = async (userId: string): Promise<StaffInfo | null> => {
    const { data, error } = await supabase
      .from('staff_members')
      .select('id, client_id, permissions, status')
      .eq('user_id', userId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    // Check if staff member is inactive
    if (data.status === 'inactive') {
      return null; // Return null to indicate staff cannot access
    }

    return {
      id: data.id,
      clientId: data.client_id,
      permissions: (data.permissions as StaffInfo['permissions']) || { catalog_access: true },
    };
  };

  // Super admin lookup. Anyone holding agency_admin who is not flagged as a
  // super admin (including an admin with no staff row at all) is view-only.
  const fetchIsSuperAdmin = async (userId: string): Promise<boolean> => {
    const { data, error } = await supabase
      .from('admin_staff_members')
      .select('is_super_admin, status')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error fetching super admin flag:', error);
      // If the column does not exist yet the super admin migration has not been
      // pushed. Fail open so a frontend deploy that lands before the migration
      // does not turn every owner into read-only staff.
      const notMigrated =
        error.code === '42703' || /is_super_admin/i.test(error.message ?? '');
      return notMigrated;
    }

    const row = data as { is_super_admin?: boolean; status?: string } | null;
    return row?.is_super_admin === true && row?.status === 'active';
  };

  const fetchUserRole = async (userId: string): Promise<UserRole> => {
    // A user can hold multiple roles (e.g. client owner + staff at another
    // shop). Selecting without .maybeSingle() avoids the 406 that would
    // otherwise leave role=null and bounce the user back to /login.
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    if (error) {
      console.error('Error fetching user role:', error);
      return null;
    }

    if (!data || data.length === 0) {
      console.error('User has no role assigned');
      return null;
    }

    const roles = data.map((r) => r.role as Exclude<UserRole, null>);
    return resolveRoleForPortal(roles);
  };

  const refreshRole = async () => {
    if (user) {
      const userRole = await fetchUserRole(user.id);
      setRole(userRole);
      if (userRole === 'agency_admin') {
        setIsSuperAdmin(await fetchIsSuperAdmin(user.id));
      } else {
        setIsSuperAdmin(null);
      }
      if (userRole === 'staff') {
        const info = await fetchStaffInfo(user.id);
        setStaffInfo(info);
      }
    }
  };

  const signOut = useCallback(async () => {
    setLoggingOut(true);
    clearPageCache();
    
    // Log logout activity before signing out
    if (user?.id && user?.email) {
      try {
        if (role === 'agency_admin') {
          await logAdminLogoutActivity(user.id, user.email);
        }
        if (role === 'client' || role === 'staff') {
          await logLogoutActivity(user.id, user.email);
        }
      } catch (err) {
        console.error('Failed to log logout activity:', err);
      }
    }
    
    // Add a small delay so the user sees the loading state
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRole(null);
    setStaffInfo(null);
    setIsSuperAdmin(null);
    setLoggingOut(false);
    navigate('/login');
  }, [navigate, user, role]);

  // Activity tracking for session timeout
  useEffect(() => {
    if (!session) return;

    const updateActivity = () => {
      lastActivityRef.current = Date.now();
      // Reset warning if activity detected
      if (warningShownRef.current) {
        warningShownRef.current = false;
      }
    };

    // Add activity listeners
    ACTIVITY_EVENTS.forEach(event => {
      window.addEventListener(event, updateActivity, { passive: true });
    });

    // Session timeout checker
    const checkTimeout = setInterval(() => {
      const inactiveTime = Date.now() - lastActivityRef.current;
      const timeoutMs = getSessionTimeout();
      const timeRemaining = timeoutMs - inactiveTime;

      // Show warning 2 minutes before timeout
      if (timeRemaining <= SESSION_WARNING_TIME && timeRemaining > 0 && !warningShownRef.current) {
        warningShownRef.current = true;
        toast({
          title: 'Session Expiring Soon',
          description: 'Your session will expire in 2 minutes due to inactivity. Click anywhere to stay logged in.',
          duration: 10000,
        });
      }

      // Trigger timeout
      if (inactiveTime >= timeoutMs) {
        toast({
          title: 'Session Expired',
          description: 'You have been logged out due to inactivity.',
          variant: 'default',
        });
        signOut();
      }
    }, ACTIVITY_CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach(event => {
        window.removeEventListener(event, updateActivity);
      });
      clearInterval(checkTimeout);
    };
  }, [session, signOut, toast, getSessionTimeout]);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        // Reset activity timer on auth state change
        lastActivityRef.current = Date.now();

        if (currentSession?.user) {
          // Defer role fetching and login logging with setTimeout to prevent deadlock
          setTimeout(async () => {
            const userRole = await fetchUserRole(currentSession.user.id);
            setRole(userRole);
            setIsSuperAdmin(
              userRole === 'agency_admin'
                ? await fetchIsSuperAdmin(currentSession.user.id)
                : null,
            );

            // Check if client account is inactive - force sign out
            if (userRole === 'client') {
              const { data: clientStatus } = await supabase
                .from('clients')
                .select('status')
                .eq('user_id', currentSession.user.id)
                .maybeSingle();

              if (clientStatus?.status === 'inactive') {
                toast({
                  variant: 'destructive',
                  title: 'Account Deactivated',
                  description: 'Your account has been deactivated by the administrator.',
                });
                await supabase.auth.signOut();
                setUser(null);
                setSession(null);
                setRole(null);
                setLoading(false);
                navigate('/login');
                return;
              }
            }

            if (userRole === 'staff') {
              const info = await fetchStaffInfo(currentSession.user.id);
              setStaffInfo(info);

              // Also check if parent client is inactive
              if (info) {
                const { data: parentClient } = await supabase
                  .from('clients')
                  .select('status')
                  .eq('id', info.clientId)
                  .maybeSingle();

                if (parentClient?.status === 'inactive') {
                  toast({
                    variant: 'destructive',
                    title: 'Company Account Deactivated',
                    description: 'Your company account has been deactivated.',
                  });
                  await supabase.auth.signOut();
                  setUser(null);
                  setSession(null);
                  setRole(null);
                  setStaffInfo(null);
                  setLoading(false);
                  navigate('/login');
                  return;
                }
              }
            } else {
              setStaffInfo(null);
            }
            
            // Log login activity for client and staff users
            if (event === 'SIGNED_IN' && (userRole === 'client' || userRole === 'staff')) {
              try {
                await logLoginActivity(currentSession.user.id, currentSession.user.email || '');
              } catch (err) {
                console.error('Failed to log login activity:', err);
              }
            }
            
            // Log login activity for admin users
            if (event === 'SIGNED_IN' && userRole === 'agency_admin') {
              try {
                await logAdminLoginActivity(currentSession.user.id, currentSession.user.email || '');
              } catch (err) {
                console.error('Failed to log admin login activity:', err);
              }
            }
            
            setLoading(false);
          }, 0);
        } else {
          setRole(null);
          setStaffInfo(null);
          setIsSuperAdmin(null);
          setLoading(false);
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      if (currentSession?.user) {
        setTimeout(async () => {
          const userRole = await fetchUserRole(currentSession.user.id);
          setRole(userRole);
          setIsSuperAdmin(
            userRole === 'agency_admin'
              ? await fetchIsSuperAdmin(currentSession.user.id)
              : null,
          );

          // Check inactive client on session restore
          if (userRole === 'client') {
            const { data: clientStatus } = await supabase
              .from('clients')
              .select('status')
              .eq('user_id', currentSession.user.id)
              .maybeSingle();

            if (clientStatus?.status === 'inactive') {
              toast({
                variant: 'destructive',
                title: 'Account Deactivated',
                description: 'Your account has been deactivated by the administrator.',
              });
              await supabase.auth.signOut();
              setUser(null);
              setSession(null);
              setRole(null);
              setLoading(false);
              navigate('/login');
              return;
            }
          }

          if (userRole === 'staff') {
            const info = await fetchStaffInfo(currentSession.user.id);
            setStaffInfo(info);

            if (info) {
              const { data: parentClient } = await supabase
                .from('clients')
                .select('status')
                .eq('id', info.clientId)
                .maybeSingle();

              if (parentClient?.status === 'inactive') {
                toast({
                  variant: 'destructive',
                  title: 'Company Account Deactivated',
                  description: 'Your company account has been deactivated.',
                });
                await supabase.auth.signOut();
                setUser(null);
                setSession(null);
                setRole(null);
                setStaffInfo(null);
                setLoading(false);
                navigate('/login');
                return;
              }
            }
          } else {
            setStaffInfo(null);
          }
          setLoading(false);
        }, 0);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const isReadOnlyAdmin = role === 'agency_admin' && isSuperAdmin === false;

  // Keep the Supabase write guard in sync with the resolved role.
  useEffect(() => {
    setAdminReadOnly(isReadOnlyAdmin);
  }, [isReadOnlyAdmin]);

  return (
    <AuthContext.Provider value={{ user, session, role, staffInfo, isSuperAdmin, isReadOnlyAdmin, loading, loggingOut, rememberMe, setRememberMe, signOut, refreshRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
