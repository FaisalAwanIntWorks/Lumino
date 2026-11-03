import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type SchedulingProvider = 'calendly' | 'cal' | 'other';

export interface ClientScheduling {
  url: string | null;
  provider: SchedulingProvider | null;
}

/**
 * Public read of a client's external scheduling link (Calendly / Cal.com / other).
 * Uses a SECURITY DEFINER RPC so it works inside anonymous embed widgets.
 */
export function useClientScheduling(clientId: string | null | undefined) {
  const [data, setData] = useState<ClientScheduling>({ url: null, provider: null });
  const [loading, setLoading] = useState<boolean>(!!clientId);

  useEffect(() => {
    let cancelled = false;
    if (!clientId) {
      setData({ url: null, provider: null });
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .rpc('get_client_scheduling', { client_uuid: clientId })
      .then(({ data: rows, error }) => {
        if (cancelled) return;
        if (error || !rows || rows.length === 0) {
          setData({ url: null, provider: null });
        } else {
          const row = rows[0] as { scheduling_url: string | null; scheduling_provider: string | null };
          setData({
            url: row.scheduling_url?.trim() || null,
            provider: (row.scheduling_provider as SchedulingProvider | null) || null,
          });
        }
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return { ...data, loading };
}

/** Detect provider from a URL string. */
export function detectSchedulingProvider(url: string): SchedulingProvider {
  const u = url.toLowerCase();
  if (u.includes('calendly.com')) return 'calendly';
  if (u.includes('cal.com')) return 'cal';
  return 'other';
}
