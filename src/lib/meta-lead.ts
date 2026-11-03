/**
 * Single entry point for Meta conversion events fired by the embed widgets.
 *
 * Every widget calls this helper instead of `trackMetaEvent` directly so that:
 *   - the browser Pixel event always carries an eventID,
 *   - the same event is mirrored server-side through the Conversions API
 *     (meta-capi-track) using the client's own pixel + access token,
 *   - Meta de-duplicates the two using the shared eventID.
 *
 * Accounts with no CAPI access token saved simply keep the browser event —
 * the edge function replies `capi_not_configured` and nothing breaks.
 */
import { trackMetaEvent } from './meta-pixel';
import { sendMetaCapiEvent, type MetaCapiUserData } from './meta-capi';

export interface MetaConversionOptions {
  clientId?: string | null;
  userData?: MetaCapiUserData;
  customData?: Record<string, unknown>;
  /** Reuse an existing id (e.g. the lead row id) instead of generating one. */
  eventId?: string;
}

function newEventId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function fireMetaConversion(eventName: 'Lead' | 'Schedule', opts: MetaConversionOptions = {}): string {
  const eventId = opts.eventId || newEventId(eventName.toLowerCase());
  try {
    trackMetaEvent(eventName, opts.customData as Record<string, any> | undefined, { eventID: eventId });
    if (opts.clientId) {
      void sendMetaCapiEvent({
        clientId: opts.clientId,
        eventName,
        eventId,
        userData: opts.userData,
        customData: opts.customData,
      });
    }
  } catch (err) {
    console.warn('[meta] conversion event failed', err);
  }
  return eventId;
}

/** Fire a standard `Lead` event (browser Pixel + Conversions API). */
export function trackMetaLead(opts: MetaConversionOptions = {}): string {
  return fireMetaConversion('Lead', opts);
}

/** Fire a standard `Schedule` event (browser Pixel + Conversions API). */
export function trackMetaSchedule(opts: MetaConversionOptions = {}): string {
  return fireMetaConversion('Schedule', opts);
}
