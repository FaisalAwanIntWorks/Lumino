/**
 * Thank-you screen contact button (CustomX forms: Ring Builder, Grillz
 * Builder, Custom Enquiry).
 *
 * Stored per client in the form config table as JSONB column
 * `thank_you_contact`. The configurator asks "How would you like your leads
 * to contact you?" and the chosen method renders a button at the bottom of
 * the thank-you screen once the lead has been submitted.
 */

export type ThankYouContactMethod = 'none' | 'call' | 'contact' | 'schedule';

export interface ThankYouContact {
  method: ThankYouContactMethod;
  /** Phone number for the Call Us / Contact Us buttons. */
  phone: string;
  /** Booking / calendar link for the Schedule an Appointment button. */
  calendar_url: string;
}

export const DEFAULT_THANK_YOU_CONTACT: ThankYouContact = {
  method: 'none',
  phone: '',
  calendar_url: '',
};

export const THANK_YOU_CONTACT_OPTIONS: { value: ThankYouContactMethod; label: string; icon: string }[] = [
  { value: 'none', label: 'No button', icon: '🚫' },
  { value: 'call', label: 'Call Us', icon: '📞' },
  { value: 'contact', label: 'Contact Us', icon: '💬' },
  { value: 'schedule', label: 'Schedule an Appointment', icon: '📅' },
];

export const THANK_YOU_CONTACT_LABELS: Record<Exclude<ThankYouContactMethod, 'none'>, string> = {
  call: 'Call Us',
  contact: 'Contact Us',
  schedule: 'Schedule an Appointment',
};

const METHODS: ThankYouContactMethod[] = ['none', 'call', 'contact', 'schedule'];

/** Normalise whatever came out of the JSONB column into a safe shape. */
export function resolveThankYouContact(raw: unknown): ThankYouContact {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_THANK_YOU_CONTACT };
  const r = raw as Record<string, unknown>;
  const method = METHODS.includes(r.method as ThankYouContactMethod)
    ? (r.method as ThankYouContactMethod)
    : 'none';
  return {
    method,
    phone: typeof r.phone === 'string' ? r.phone : '',
    calendar_url: typeof r.calendar_url === 'string' ? r.calendar_url : '',
  };
}

/** Strip a phone number down to what a `tel:` link accepts. */
export function toTelHref(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '');
  return `tel:${cleaned}`;
}

/** Ensure the calendar link has a scheme so it opens as an external URL. */
export function toCalendarHref(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export interface ResolvedThankYouAction {
  label: string;
  href: string;
  kind: 'tel' | 'link';
  /** Human-readable target shown on the button (the phone number as entered). */
  display: string;
}

/**
 * Turn the stored setting into a renderable action, or null when the client
 * has not enabled a button (or left the required field empty).
 */
export function getThankYouAction(contact: ThankYouContact | null | undefined): ResolvedThankYouAction | null {
  if (!contact || contact.method === 'none') return null;
  if (contact.method === 'schedule') {
    const href = toCalendarHref(contact.calendar_url);
    if (!href) return null;
    return { label: THANK_YOU_CONTACT_LABELS.schedule, href, kind: 'link', display: href };
  }
  const phone = contact.phone.trim();
  if (!phone) return null;
  return { label: THANK_YOU_CONTACT_LABELS[contact.method], href: toTelHref(phone), kind: 'tel', display: phone };
}

/** What gets written back to the DB (JSONB-shaped). Null when nothing is configured. */
export function serializeThankYouContact(contact: ThankYouContact): Record<string, string> | null {
  if (contact.method === 'none' && !contact.phone && !contact.calendar_url) return null;
  return {
    method: contact.method,
    phone: contact.phone.trim(),
    calendar_url: contact.calendar_url.trim(),
  };
}

/** Save-time validation for the configurator. Returns an error message or null. */
export function validateThankYouContact(contact: ThankYouContact): string | null {
  if ((contact.method === 'call' || contact.method === 'contact') && !contact.phone.trim()) {
    return `"${THANK_YOU_CONTACT_LABELS[contact.method]}" needs a phone number for the thank-you button.`;
  }
  if (contact.method === 'schedule' && !contact.calendar_url.trim()) {
    return '"Schedule an Appointment" needs a calendar link for the thank-you button.';
  }
  return null;
}
