import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';

let cachedTimezone: string | null = null;
let cachedClientId: string | null = null;

/**
 * Hook that returns the client's configured timezone.
 * Caches the result to avoid repeated fetches.
 */
export function useClientTimezone(): string {
  const { user, role, staffInfo } = useAuth();
  const { isImpersonating, impersonatedClientId } = useAdminImpersonation();
  const [timezone, setTimezone] = useState<string>(cachedTimezone || 'America/New_York');

  useEffect(() => {
    const fetchTimezone = async () => {
      if (!user && !impersonatedClientId) return;

      let clientId = impersonatedClientId || null;

      if (!clientId) {
        if (role === 'staff' && staffInfo?.clientId) {
          clientId = staffInfo.clientId;
        } else if (user) {
          const { data } = await supabase
            .from('clients')
            .select('id, timezone')
            .eq('user_id', user.id)
            .maybeSingle();
          if (data) {
            clientId = data.id;
            const tz = (data as any).timezone || 'America/New_York';
            cachedTimezone = tz;
            cachedClientId = clientId;
            setTimezone(tz);
            return;
          }
        }
      }

      if (!clientId) return;

      // Use cache if same client
      if (cachedClientId === clientId && cachedTimezone) {
        setTimezone(cachedTimezone);
        return;
      }

      const { data } = await supabase
        .from('clients')
        .select('timezone')
        .eq('id', clientId)
        .maybeSingle();

      const tz = (data as any)?.timezone || 'America/New_York';
      cachedTimezone = tz;
      cachedClientId = clientId;
      setTimezone(tz);
    };

    fetchTimezone();
  }, [user, impersonatedClientId, role, staffInfo]);

  return timezone;
}

/**
 * Format a date string using the client's timezone.
 * Returns a localized date string like "Mar 14, 2026".
 */
export function formatDateWithTimezone(dateStr: string, timezone: string, options?: Intl.DateTimeFormatOptions): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: timezone,
      ...options,
    });
  } catch {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
}

/**
 * Format a date string with time using the client's timezone.
 * Returns something like "Mar 14, 2026, 2:30 PM".
 */
export function formatDateTimeWithTimezone(dateStr: string, timezone: string): string {
  try {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone,
    });
  } catch {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
}

/**
 * Format a date for chart grouping (short format) using the client's timezone.
 */
export function formatChartDate(dateStr: string, timezone: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: timezone,
    });
  } catch {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
}

/**
 * Get a date key for grouping (e.g., revenue by day) using the client's timezone.
 */
export function getDateKey(dateStr: string, timezone: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { timeZone: timezone });
  } catch {
    return new Date(dateStr).toLocaleDateString('en-US');
  }
}
