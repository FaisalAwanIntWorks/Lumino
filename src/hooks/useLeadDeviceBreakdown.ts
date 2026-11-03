import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { LeadDeviceCategory } from '@/lib/lead-device';

/** { source: { device: count } } — source keys match client-dashboard-stats leadSources. */
export type LeadDeviceBreakdown = Record<string, Partial<Record<LeadDeviceCategory, number>>>;

interface Options {
  /** null = all clients (agency admins only). */
  clientId: string | null;
  from?: Date;
  to?: Date;
  enabled?: boolean;
}

/**
 * Lead counts per form per device for the dashboard tooltips
 * (get_lead_device_breakdown). Returns null while loading or if the RPC is
 * not deployed yet, so callers simply hide the device breakdown.
 */
export function useLeadDeviceBreakdown({ clientId, from, to, enabled = true }: Options) {
  const [data, setData] = useState<LeadDeviceBreakdown | null>(null);
  const startISO = from ? from.toISOString() : null;
  const endISO = to
    ? new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999).toISOString()
    : null;

  useEffect(() => {
    if (!enabled) {
      setData(null);
      return;
    }
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .rpc('get_lead_device_breakdown', { p_client_id: clientId, p_start: startISO, p_end: endISO })
      .then(({ data: rows, error }: { data: LeadDeviceBreakdown | null; error: unknown }) => {
        if (cancelled) return;
        if (error) {
          console.warn('get_lead_device_breakdown failed:', error);
          setData(null);
          return;
        }
        setData(rows ?? {});
      });
    return () => { cancelled = true; };
  }, [clientId, startISO, endISO, enabled]);

  return data;
}

/** Sum device counts across one or more sources. */
export function sumDeviceCounts(
  breakdown: LeadDeviceBreakdown | null | undefined,
  sources: string[],
): Partial<Record<LeadDeviceCategory, number>> {
  const out: Partial<Record<LeadDeviceCategory, number>> = {};
  for (const s of sources) {
    for (const [device, n] of Object.entries(breakdown?.[s] ?? {})) {
      const k = device as LeadDeviceCategory;
      out[k] = (out[k] ?? 0) + Number(n ?? 0);
    }
  }
  return out;
}
