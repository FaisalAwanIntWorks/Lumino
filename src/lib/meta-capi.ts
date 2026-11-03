/**
 * Meta CAPI helper (DTT only).
 * Sends server-side events via the meta-capi-track edge function and
 * deduplicates with the browser Pixel using a shared eventID.
 *
 * Usage:
 *   const eventId = crypto.randomUUID();
 *   trackMetaEvent('Lead', params, { eventID: eventId });
 *   sendMetaCapiEvent({ clientId, eventName: 'Lead', eventId, userData: {...} });
 */
import { supabase } from '@/integrations/supabase/client';

export interface MetaCapiUserData {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  country?: string | null;
  externalId?: string | null;
  fbc?: string | null;
  fbp?: string | null;
}

export interface SendMetaCapiEventParams {
  clientId: string;
  eventName: 'Lead' | 'Schedule';
  eventId: string;
  userData?: MetaCapiUserData;
  customData?: Record<string, unknown>;
  eventSourceUrl?: string;
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&') + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : undefined;
}

export async function sendMetaCapiEvent(params: SendMetaCapiEventParams): Promise<void> {
  try {
    const fbp = readCookie('_fbp');
    const fbc = readCookie('_fbc');
    const eventSourceUrl = params.eventSourceUrl || (typeof window !== 'undefined' ? window.location.href : undefined);

    await supabase.functions.invoke('meta-capi-track', {
      body: {
        clientId: params.clientId,
        eventName: params.eventName,
        eventId: params.eventId,
        eventSourceUrl,
        userData: {
          ...params.userData,
          fbp: params.userData?.fbp ?? fbp,
          fbc: params.userData?.fbc ?? fbc,
        },
        customData: params.customData ?? {},
      },
    });
  } catch (err) {
    // Non-blocking — never break the user flow if CAPI fails.
    console.warn('[meta-capi] send failed', err);
  }
}
