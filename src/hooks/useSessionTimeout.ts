import { useEffect, useRef, useCallback, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { SESSION_TIMEOUTS, SESSION_WARNING_TIME } from '@/lib/domain-config';

type UserRole = 'agency_admin' | 'client' | 'staff' | null;

interface UseSessionTimeoutOptions {
  role: UserRole;
  rememberMe: boolean;
  onTimeout: () => void;
  enabled?: boolean;
}

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'] as const;

export function useSessionTimeout({
  role,
  rememberMe,
  onTimeout,
  enabled = true,
}: UseSessionTimeoutOptions) {
  const { toast } = useToast();
  const lastActivityRef = useRef<number>(Date.now());
  const warningShownRef = useRef<boolean>(false);
  const [showWarning, setShowWarning] = useState(false);

  // Get timeout based on role and remember me setting
  const getTimeoutMs = useCallback(() => {
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

  // Update activity timestamp
  const updateActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    // Reset warning if activity detected
    if (warningShownRef.current) {
      warningShownRef.current = false;
      setShowWarning(false);
    }
  }, []);

  // Extend session manually
  const extendSession = useCallback(() => {
    updateActivity();
    toast({
      title: 'Session Extended',
      description: 'Your session has been extended.',
    });
  }, [updateActivity, toast]);

  useEffect(() => {
    if (!enabled) return;

    // Add activity listeners
    ACTIVITY_EVENTS.forEach(event => {
      window.addEventListener(event, updateActivity, { passive: true });
    });

    const timeoutMs = getTimeoutMs();
    const checkInterval = 30 * 1000; // Check every 30 seconds

    // Session timeout checker
    const intervalId = setInterval(() => {
      const inactiveTime = Date.now() - lastActivityRef.current;
      const timeRemaining = timeoutMs - inactiveTime;

      // Show warning before timeout
      if (timeRemaining <= SESSION_WARNING_TIME && timeRemaining > 0 && !warningShownRef.current) {
        warningShownRef.current = true;
        setShowWarning(true);
        
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
        onTimeout();
      }
    }, checkInterval);

    return () => {
      ACTIVITY_EVENTS.forEach(event => {
        window.removeEventListener(event, updateActivity);
      });
      clearInterval(intervalId);
    };
  }, [enabled, getTimeoutMs, updateActivity, onTimeout, toast]);

  return {
    extendSession,
    showWarning,
    resetWarning: () => {
      warningShownRef.current = false;
      setShowWarning(false);
    },
  };
}
