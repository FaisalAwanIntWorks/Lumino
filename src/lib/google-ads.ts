/**
 * Google Ads (gtag) conversion tracking utility.
 *
 * Mirrors the Meta Pixel helper: injects gtag.js once per conversion ID,
 * queues events fired before the script is ready, and never throws into the
 * calling flow. Consent Mode v2 defaults are set BEFORE the tag loads.
 *
 * Nothing loads unless the client has a Google Ads Conversion ID configured.
 */

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer: Record<string, any>[];
  }
}

let gtagLoaded = false;
let currentConversionId: string | null = null;
let consentDefaultsSet = false;

type PendingConversion = {
  sendTo: string;
  params: Record<string, any>;
  userData?: Record<string, string>;
};

const pendingConversions: PendingConversion[] = [];

function ensureGtagStub(): void {
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== 'function') {
    // Must push the raw `arguments` object exactly like Google's official
    // snippet — gtag.js reads it as an arguments-like value.
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer.push(arguments as any);
    };
  }
}

/**
 * Consent Mode v2 defaults. Ad signals are denied by default in the EEA/UK
 * (Google's region codes) and granted elsewhere. No banner is shown — EU/UK
 * measurement degrades to Google's modeled estimates by design.
 */
const CONSENT_DENY_REGIONS = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU', 'MT', 'NL', 'NO', 'PL', 'PT', 'RO',
  'SK', 'SI', 'ES', 'SE', 'GB', 'CH',
];

export function setConsentDefaults(): void {
  if (consentDefaultsSet) return;
  try {
    ensureGtagStub();
    window.gtag!('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
      region: CONSENT_DENY_REGIONS,
    });
    window.gtag!('consent', 'default', {
      ad_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
      analytics_storage: 'granted',
    });
    consentDefaultsSet = true;
  } catch (err) {
    console.warn('[google-ads] consent defaults failed', err);
  }
}

function flushPending(): void {
  while (pendingConversions.length > 0) {
    const evt = pendingConversions.shift()!;
    fire(evt);
  }
}

function fire(evt: PendingConversion): void {
  try {
    if (typeof window.gtag !== 'function') return;
    if (evt.userData && Object.keys(evt.userData).length > 0) {
      window.gtag('set', 'user_data', evt.userData);
    }
    window.gtag('event', 'conversion', { send_to: evt.sendTo, ...evt.params });
  } catch (err) {
    console.warn('[google-ads] conversion failed', err);
  }
}

/**
 * Inject gtag.js for a Google Ads Conversion ID (AW-XXXXXXXXX).
 * Safe to call repeatedly — only loads once per ID.
 */
export function initGoogleAds(conversionId: string): void {
  if (!conversionId) return;
  const id = conversionId.trim();
  if (!/^AW-[\w-]+$/i.test(id)) {
    console.warn('[google-ads] ignoring malformed conversion ID');
    return;
  }
  if (gtagLoaded && currentConversionId === id) {
    flushPending();
    return;
  }

  try {
    setConsentDefaults();
    ensureGtagStub();

    // Only inject the loader once; a second Ads ID is configured via config().
    if (!gtagLoaded) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
      script.onload = () => flushPending();
      script.onerror = () => {
        console.warn('[google-ads] gtag.js failed to load — conversions will not fire');
        pendingConversions.length = 0;
      };
      (document.head || document.documentElement).appendChild(script);
    }

    window.gtag!('js', new Date());
    window.gtag!('config', id, { allow_enhanced_conversions: true });

    gtagLoaded = true;
    currentConversionId = id;
    flushPending();
  } catch (err) {
    console.warn('[google-ads] init failed', err);
  }
}

export function isGoogleAdsReady(): boolean {
  return gtagLoaded && typeof window.gtag === 'function';
}

async function sha256Hex(value: string): Promise<string | null> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return null;
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  if (!digits) return '';
  return phone.trim().startsWith('+') ? `+${digits}` : `+${digits}`;
}

/**
 * Build the hashed `user_data` payload for Enhanced Conversions.
 * Returns an empty object when nothing usable is available.
 */
export async function buildEnhancedUserData(input: {
  email?: string | null;
  phone?: string | null;
}): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const email = input.email?.trim().toLowerCase();
    if (email && email.includes('@')) {
      const hashed = await sha256Hex(email);
      if (hashed) out.sha256_email_address = hashed;
    }
    const phone = input.phone ? normalizePhone(input.phone) : '';
    if (phone && phone.length > 7) {
      const hashed = await sha256Hex(phone);
      if (hashed) out.sha256_phone_number = hashed;
    }
  } catch {
    // Enhanced conversions are best-effort only.
  }
  return out;
}

export interface GoogleConversionParams {
  /** Full `AW-XXXXXXXXX/AbC-D_efGh` send_to value. */
  sendTo: string;
  value?: number | null;
  currency?: string | null;
  transactionId?: string | null;
  userData?: Record<string, string>;
}

/**
 * Fire a Google Ads conversion. Queued if gtag.js has not finished loading.
 * Never throws.
 */
export function trackGoogleConversion(params: GoogleConversionParams): void {
  if (!params?.sendTo) return;
  const payload: Record<string, any> = {};
  if (typeof params.value === 'number' && Number.isFinite(params.value)) {
    payload.value = params.value;
    payload.currency = params.currency || 'USD';
  }
  if (params.transactionId) payload.transaction_id = params.transactionId;

  const evt: PendingConversion = {
    sendTo: params.sendTo,
    params: payload,
    userData: params.userData,
  };

  if (!isGoogleAdsReady()) {
    pendingConversions.push(evt);
    return;
  }
  fire(evt);
}
