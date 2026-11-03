import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  AvailabilitySchedule,
  DEFAULT_SCHEDULE,
  DayKey,
} from '@/lib/availability';

/**
 * Public read of a client's availability schedule via SECURITY DEFINER RPC.
 * Returns null when no schedule has been configured (callers should fall back
 * to legacy behavior — full calendar / generic time list).
 */
export function useClientAvailability(clientId: string | null | undefined) {
  const [schedule, setSchedule] = useState<AvailabilitySchedule | null>(null);
  const [loading, setLoading] = useState<boolean>(!!clientId);

  useEffect(() => {
    let cancelled = false;
    if (!clientId) {
      setSchedule(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .rpc('get_client_availability', { client_uuid: clientId })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data || (Array.isArray(data) && data.length === 0)) {
          setSchedule(null);
        } else {
          const row: any = Array.isArray(data) ? data[0] : data;
          setSchedule({
            timezone: row.timezone || DEFAULT_SCHEDULE.timezone,
            slot_duration_minutes: row.slot_duration_minutes || 30,
            weekly_hours: (row.weekly_hours || DEFAULT_SCHEDULE.weekly_hours) as Record<DayKey, any>,
            date_overrides: Array.isArray(row.date_overrides) ? row.date_overrides : [],
          });
        }
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [clientId]);

  return { schedule, loading };
}
