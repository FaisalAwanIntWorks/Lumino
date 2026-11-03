/**
 * Free lead-quality scoring. No external API, no cost per lead.
 *
 * Combines the offline phone check, a disposable-email match, and bot-like
 * timing signals into a High / Medium / Low signal the jeweler can triage on.
 * Nothing is ever blocked by the score itself — it is a hint, not a gate.
 */
import { checkPhone, type PhoneLineType } from '@/lib/phone-quality';

export type LeadQuality = 'high' | 'medium' | 'low';

export interface LeadQualityResult {
  quality: LeadQuality;
  reasons: string[];
  lineType: PhoneLineType;
  phoneE164?: string;
}

/** Domains that are throwaway or obviously fake. Mirrors form-validation.ts. */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', 'test.com', 'example.com',
  'guerrillamail.com', 'throwaway.email', 'yopmail.com',
  'sharklasers.com', 'trashmail.com', 'fakeinbox.com',
  'maildrop.cc', 'dispostable.com', 'temp-mail.org',
  'guerrillamailblock.com', 'grr.la', 'mailnesia.com',
  'tempail.com', 'trash-mail.com', '10minutemail.com',
  'mohmal.com', 'burnermail.io', 'fake.com', 'nowhere.com',
]);

export function isDisposableEmail(email: string): boolean {
  const domain = (email || '').trim().toLowerCase().split('@')[1];
  return !!domain && DISPOSABLE_DOMAINS.has(domain);
}

export interface LeadQualityInput {
  countryCode: string;
  phoneNumber: string;
  countryIso?: string;
  email?: string;
  firstName?: string;
  /** Milliseconds between the form opening and submission. */
  submissionMs?: number;
  /** Hidden honeypot field value — non-empty means a bot filled it. */
  honeypot?: string;
}

/** Minimum plausible human fill time for the estimator, in ms. */
export const MIN_HUMAN_SUBMISSION_MS = 10_000;

export function scoreLead(input: LeadQualityInput): LeadQualityResult {
  const reasons: string[] = [];
  const phone = checkPhone(input.countryCode, input.phoneNumber, input.countryIso);

  let score = 100;

  if (!phone.valid) {
    score -= 60;
    reasons.push(...phone.reasons);
  } else {
    if (phone.lineType === 'fixed_line') {
      score -= 15;
      reasons.push('landline');
    }
    if (phone.lineType === 'unknown') {
      score -= 5;
      reasons.push('line_type_unknown');
    }
  }

  if (input.email && isDisposableEmail(input.email)) {
    score -= 35;
    reasons.push('disposable_email');
  }

  const name = (input.firstName || '').trim();
  if (name && (name.length < 2 || /^(test|asdf|abc|xyz|qwerty|aaa)$/i.test(name))) {
    score -= 20;
    reasons.push('placeholder_name');
  }

  if (input.honeypot && input.honeypot.trim()) {
    score -= 100;
    reasons.push('honeypot_filled');
  }

  if (typeof input.submissionMs === 'number' && input.submissionMs > 0 && input.submissionMs < MIN_HUMAN_SUBMISSION_MS) {
    score -= 25;
    reasons.push('too_fast');
  }

  const quality: LeadQuality = score >= 85 ? 'high' : score >= 55 ? 'medium' : 'low';

  return { quality, reasons: Array.from(new Set(reasons)), lineType: phone.lineType, phoneE164: phone.e164 };
}

export const LEAD_QUALITY_LABELS: Record<LeadQuality, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/** Human-readable explanation for each reason code (used in UI tooltips/emails). */
export const LEAD_QUALITY_REASON_LABELS: Record<string, string> = {
  empty: 'No phone number provided',
  invalid_format: 'Phone number is not valid for the selected country',
  repeated_digits: 'Phone number is the same digit repeated',
  sequential_digits: 'Phone number is a sequential run of digits',
  repeated_pattern: 'Phone number repeats a short pattern',
  placeholder_555: 'Phone number uses the reserved 555 range',
  invalid_area_code: 'Phone number uses an impossible area code',
  landline: 'Phone number looks like a landline',
  line_type_unknown: 'Line type could not be determined',
  disposable_email: 'Email uses a disposable/temporary domain',
  placeholder_name: 'Name looks like placeholder text',
  honeypot_filled: 'Hidden bot-trap field was filled',
  too_fast: 'Form was completed unusually fast',
};
