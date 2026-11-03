import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { logAuditEvent, startImpersonationSession, endImpersonationSession } from '@/lib/audit-utils';
import { supabase } from '@/integrations/supabase/client';
import { logAdminImpersonationStart, logAdminImpersonationEnd } from '@/lib/admin-activity-logger';

interface RecentImpersonation {
  clientId: string;
  clientName: string;
  timestamp: number;
}

interface ImpersonationContextType {
  impersonatedClientId: string | null;
  impersonatedClientName: string | null;
  startImpersonation: (clientId: string, clientName: string) => void;
  stopImpersonation: () => void;
  isImpersonating: boolean;
  recentImpersonations: RecentImpersonation[];
}

const AdminImpersonationContext = createContext<ImpersonationContextType | undefined>(undefined);

const STORAGE_KEY = 'admin_recent_impersonations';
const MAX_RECENT = 5;

export const AdminImpersonationProvider = ({ children }: { children: ReactNode }) => {
  const [impersonatedClientId, setImpersonatedClientId] = useState<string | null>(null);
  const [impersonatedClientName, setImpersonatedClientName] = useState<string | null>(null);
  const [recentImpersonations, setRecentImpersonations] = useState<RecentImpersonation[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Load recent impersonations from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setRecentImpersonations(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load recent impersonations:', error);
    }
  }, []);

  // No longer need URL param parsing - impersonation stays within admin domain

  const startImpersonation = async (clientId: string, clientName: string) => {
    setImpersonatedClientId(clientId);
    setImpersonatedClientName(clientName);

    // Log audit event
    await logAuditEvent({
      action_type: 'impersonate_start',
      resource_type: 'client',
      resource_id: clientId,
      metadata: { client_name: clientName },
      severity: 'info',
    });

    // Start impersonation session
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const session = await startImpersonationSession(user.id, clientId);
      if (session) {
        setCurrentSessionId(session.id);
      }
      
      // Log to admin activity logs
      await logAdminImpersonationStart(user.id, user.email || '', clientId, clientName);
    }

    // Update recent impersonations
    const newRecent: RecentImpersonation = {
      clientId,
      clientName,
      timestamp: Date.now(),
    };

    setRecentImpersonations((prev) => {
      // Remove if already exists, then add to front
      const filtered = prev.filter((item) => item.clientId !== clientId);
      const updated = [newRecent, ...filtered].slice(0, MAX_RECENT);
      
      // Save to localStorage
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch (error) {
        console.error('Failed to save recent impersonations:', error);
      }
      
      return updated;
    });
  };

  const stopImpersonation = async () => {
    const clientId = impersonatedClientId;
    const clientName = impersonatedClientName;
    const sessionId = currentSessionId;

    setImpersonatedClientId(null);
    setImpersonatedClientName(null);
    setCurrentSessionId(null);

    // Log audit event
    if (clientId && clientName) {
      await logAuditEvent({
        action_type: 'impersonate_stop',
        resource_type: 'client',
        resource_id: clientId,
        metadata: { client_name: clientName },
        severity: 'info',
      });
      
      // Log to admin activity logs
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await logAdminImpersonationEnd(user.id, user.email || '', clientId, clientName);
      }
    }

    // End impersonation session
    if (sessionId) {
      await endImpersonationSession(sessionId);
    }
  };

  const isImpersonating = impersonatedClientId !== null;

  return (
    <AdminImpersonationContext.Provider
      value={{
        impersonatedClientId,
        impersonatedClientName,
        startImpersonation,
        stopImpersonation,
        isImpersonating,
        recentImpersonations,
      }}
    >
      {children}
    </AdminImpersonationContext.Provider>
  );
};

export const useAdminImpersonation = () => {
  const context = useContext(AdminImpersonationContext);
  if (context === undefined) {
    throw new Error('useAdminImpersonation must be used within an AdminImpersonationProvider');
  }
  return context;
};
