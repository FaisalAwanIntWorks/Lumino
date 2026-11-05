/**
 * Unified lead conversion tracking for Aurezo widgets.
 *
 * One place that fires, on a successful lead submission:
 *   1. a Google Ads conversion (with Enhanced Conversions user data), and
 *   2. a GTM `dataLayer` push so clients can build their own tags.
 *
 * Meta Pixel / CAPI tracking is untouched and keeps living in the individual
 * forms — this helper is purely additive.
 *
 * Everything here is fire-and-forget and can never throw into a submit flow.
 */

import { initGoogleAds, buildEnhancedUserData, trackGoogleConversion } from './google-ads';
import { initGTM, pushToDataLayer } from './google-tag';

export type LeadFormType =
  | 'metal_iq'
  | 'quote_estimator'
  | 'ring_builder'
  | 'grillz_builder'
  | 'custom_inquiry'
  | 'appointment_booking';

export interface ClientTrackingConfig {
  googleAdsConversionId?: string | null;
  googleAdsConversionLabels?: Record<string, string> | null;
  gtmContainerId?: string | null;
}

let config: ClientTrackingConfig = {};

/**
 * Called once from the widget bootstrap with the client's branding row.
 * Loads the Google tags when the client has configured them.
 */
export function initClientTracking(branding: any): void {
  try {
    if (!branding) return;
    config = {
      googleAdsConversionId: branding.google_ads_conversion_id || null,
      googleAdsConversionLabels: (branding.google_ads_conversion_labels || {}) as Record<string, string>,
      gtmContainerId: branding.gtm_container_id || null,
    };

    if (config.googleAdsConversionId) {
      initGoogleAds(config.googleAdsConversionId);
    }
    // Only load the client's GTM container when the widget is NOT embedded.
    // Inside an iframe the same container is already loaded on the retailer's
    // page, and we bridge the event out to it — loading it here too would make
    // their tag fire twice for one submission.
    if (config.gtmContainerId && !isEmbedded()) {
      initGTM(config.gtmContainerId);
    }
  } catch (err) {
    console.warn('[tracking] init failed', err);
  }
}

export function getTrackingConfig(): ClientTrackingConfig {
  return config;
}

function resolveSendTo(formType: LeadFormType): string | null {
  const id = config.googleAdsConversionId?.trim();
  if (!id) return null;
  const label = config.googleAdsConversionLabels?.[formType]?.trim();
  if (!label) return null;
  // Allow either a bare label or a full "AW-123/label" value.
  return label.includes('/') ? label : `${id}/${label}`;
}

export interface LeadConversionPayload {
  email?: string | null;
  phone?: string | null;
  value?: number | null;
  currency?: string | null;
  /** Lead row id — used as the Google transaction_id for de-duplication. */
  leadId?: string | null;
  /** Extra fields pushed to the GTM dataLayer only. */
  meta?: Record<string, any>;
}

/** Stable id used as the Google `transaction_id` so the in-widget conversion
 * and the retailer's own tag are de-duplicated instead of counted twice. */
/** True when this widget runs inside an iframe on a retailer's page. */
function isEmbedded(): boolean {
  try {
    return typeof window !== 'undefined' && window.parent !== window;
  } catch {
    return true;
  }
}

function newConversionId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  } catch {
    // fall through
  }
  return `lead-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Only report a real monetary amount; an empty/zero value reads as a
 * zero-value conversion in Google Ads. */
function normalizeValue(value?: number | null): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Appointments must not trigger the retailer's Lead tag, so they carry their
 * own dataLayer event name. Every other form keeps `aurezo_lead`. */
function dataLayerEventName(formType: LeadFormType): string {
  return formType === 'appointment_booking' ? 'aurezo_appointment' : 'aurezo_lead';
}

/**
 * Fire the Google Ads conversion + dataLayer push for a completed lead.
 * Safe to call unconditionally: no-ops when the client hasn't configured
 * Google tracking.
 */
export function trackLeadConversion(
  formType: LeadFormType,
  payload: LeadConversionPayload = {},
): void {
  try {
    const conversionId = payload.leadId || newConversionId();
    const value = normalizeValue(payload.value);
    const currency = value !== null ? (payload.currency ?? undefined) : undefined;
    // Bookings get their own dataLayer event name so a retailer's Lead trigger
    // does not also fire on an appointment.
    const eventName = dataLayerEventName(formType);

    // GTM dataLayer event — only when standalone; embedded widgets bridge the
    // event to the parent page instead, so their tag fires exactly once.
    if (config.gtmContainerId && !isEmbedded()) {
      pushToDataLayer(eventName, {
        form_type: formType,
        value: value ?? undefined,
        currency,
        lead_id: conversionId,
        ...(payload.meta || {}),
      });
    }

    const sendTo = resolveSendTo(formType);

    const dispatch = (userData?: Record<string, string>) => {
      // Always bridge the lead out to the host page — the client's own GTM
      // container and Google click ID live there, not inside this iframe.
      postLeadToParent(formType, { conversionId, value, currency, eventName }, userData);
      if (!sendTo) return;
      trackGoogleConversion({
        sendTo,
        value,
        currency: currency ?? null,
        transactionId: conversionId,
        userData,
      });
    };

    void buildEnhancedUserData({ email: payload.email, phone: payload.phone })
      .then(dispatch)
      .catch(() => dispatch());
  } catch (err) {
    console.warn('[tracking] lead conversion failed', err);
  }
}

/**
 * Post the lead event to the parent page so the retailer's own GTM container
 * (loaded on their domain, with their cookies and gclid) can fire its tag.
 * Only hashed identifiers cross the frame boundary.
 */
function postLeadToParent(
  formType: LeadFormType,
  event: { conversionId: string; value: number | null; currency?: string; eventName: string },
  userData?: Record<string, string>,
): void {
  try {
    if (typeof window === 'undefined' || window.parent === window) return;
    window.parent.postMessage(
      {
        type: 'aurezo-lead',
        // Older embed snippets ignore this and keep pushing `aurezo_lead`.
        event_name: event.eventName,
        form_type: formType,
        value: event.value ?? undefined,
        currency: event.currency,
        lead_id: event.conversionId,
        sha256_email_address: userData?.sha256_email_address,
        sha256_phone_number: userData?.sha256_phone_number,
      },
      '*',
    );
  } catch (err) {
    console.warn('[tracking] parent lead bridge failed', err);
  }
}

/**
 * Lightweight interaction event (no Google Ads conversion) — pushed to the
 * in-iframe dataLayer and bridged out to the retailer's page so their own GTM
 * can trigger on it. Used for "Call us" taps, which are outbound links and
 * therefore invisible to any lead tracking.
 */
export function trackInteraction(eventName: string, params: Record<string, any> = {}): void {
  try {
    if (config.gtmContainerId && !isEmbedded()) {
      pushToDataLayer(eventName, params);
    }
    if (typeof window === 'undefined' || window.parent === window) return;
    window.parent.postMessage(
      { type: 'aurezo-event', event: eventName, params },
      '*',
    );
  } catch (err) {
    console.warn('[tracking] interaction event failed', err);
  }
}
