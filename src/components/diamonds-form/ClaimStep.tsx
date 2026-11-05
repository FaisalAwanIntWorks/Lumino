import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, Check, ChevronDown, Mail, MessageCircle, Phone, ShieldCheck } from 'lucide-react';
import { GlassCard } from '@/components/diamonds-form/glass/GlassCard';
import { CountryPhoneInput } from '@/components/ui/country-phone-input';
import { checkPhone } from '@/lib/phone-quality';
import { withAlpha } from '@/lib/color-utils';
import type { QuoteEstimatorTheme } from '@/lib/quote-estimator-theme';
import type { QuoteEstimatorContactTiles } from '@/hooks/useClientDttFormConfig';

export interface ClaimLineItem {
  label: string;
  value: string;
  price: number | null;
}

export interface ClaimStepProps {
  theme: QuoteEstimatorTheme;
  /** Customer first name; the heading falls back gracefully when absent. */
  firstName?: string;
  /** Email the estimate was sent to. */
  email?: string;
  /** Two short lines describing the ring, e.g. "Round · 1.5ct · VS1". */
  ringLines: string[];
  /** Diamond shape name, used beside the glyph. */
  shapeName?: string;
  /** Artwork for the chosen shape. */
  shapeImageUrl?: string;
  /** Estimated total, already a number in the account currency. */
  total: number;
  currency: string;
  /** The itemised breakdown behind the total — same rows the summary computes. */
  lineItems?: ClaimLineItem[];
  /** Credit figure — the incentive amount already configured for the account. */
  creditAmount: number;
  /** How many days the credit is held for. */
  creditHoldDays: number;
  /** Prefill for the claim field. */
  defaultCountryCode?: string;
  defaultPhoneNumber?: string;
  defaultCountryIso?: string;
  /** Consultation calendar; the "book a visit" tile expands this in place. */
  bookingUrl?: string;
  /** Per-account tile switches and destinations. */
  contactTiles?: QuoteEstimatorContactTiles;
  /** Who replies, used in the trust line under the button. */
  storeName?: string;
  /** Editable copy. */
  title?: string;
  message?: string;
  note?: string;
  footerNote?: string;
  /** Line under the claim button. Supports {amount}. */
  reassuranceNote?: string;
  /** Personal follow-up line. Supports {store} and {date}. */
  followUpNote?: string;
  /** SMS compliance line under the follow-up note. */
  smsDisclaimer?: string;
  /** Short helper above the phone field when the number is prefilled. */
  phoneConfirmNote?: string;
  /** Design Credit card: small label above the headline. */
  creditEyebrow?: string;
  /** Design Credit card: headline. {amount} is rendered in the highlight colour. */
  creditHeadline?: string;
  /** Design Credit card: line under the headline. Supports {date}. */
  creditHoldLine?: string;
  /** Label above the phone field. */
  phoneLabel?: string;
  /** Claim button text. Supports {amount}. */
  buttonLabel?: string;
  /**
   * Show the "With your credit" price (estimated total minus the credit).
   * Defaults to on. Off keeps only the "Estimated total", for stores whose
   * credit is a gift with purchase rather than money off the estimate.
   */
  showCreditPrice?: boolean;
  /** Strike through the pre-credit total when a "With your credit" price is shown. Defaults to on. */
  strikeThroughTotal?: boolean;
  /** Start the disclosure open — used by the theme lab to show both states. */
  defaultBreakdownOpen?: boolean;
  /**
   * Called once a valid number is confirmed, so the caller can record it.
   * `parts` carries the dial code and national digits separately, matching
   * how the lead row stores a phone (country_code + phone_number).
   */
  onPhoneConfirmed?: (
    e164: string,
    parts: { countryCode: string; phoneNumber: string },
  ) => void | Promise<void>;
}

type ClaimState = 'idle' | 'sending' | 'sent' | 'failed';

const TRANSITION = 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)';

const digitsOnly = (v: string) => v.replace(/[^\d]/g, '');

/** Built-in wording for the editable claim-screen lines. {amount} {store} {date}. */
export const DEFAULT_CLAIM_COPY = {
  /** Empty by default — the line under the claim button is hidden unless a store sets it. */
  reassuranceNote: '',
  followUpNote: '{store} will follow up personally — your credit is held until {date}.',
  smsDisclaimer: 'Message and data rates may apply. Reply STOP at any time and we will not text you again.',
  phoneConfirmNote: 'Your credit will be texted to this number — double-check it, or edit it here.',
  creditEyebrow: 'Design credit',
  creditHeadline: '{amount} toward this ring',
  creditHoldLine: 'Held for this design until {date}.',
  phoneLabel: 'Mobile number',
  buttonLabel: 'Text me my {amount} credit',
};

/** Built-in closing line under the cards; depends on the credit hold period. */
export const defaultClaimFooterNote = (creditHoldDays: number) =>
  `We keep your estimate and design on file for ${Math.max(1, creditHoldDays)} days, so you can pick up right where you left off. Any question, just reply to the email we sent.`;

/**
 * Three states for every editable line: not set (undefined) keeps the built-in
 * wording, an empty string hides the line, anything else is shown as typed.
 */
const resolveCopy = (value: string | undefined, fallback: string) => (value === undefined ? fallback : value);

/**
 * Final step of the Quote Estimator ("Claim"). Every visual value comes from
 * the theme tokens — no colour, radius, blur or shadow is hardcoded here.
 *
 * Note: no text message is sent yet. The number is validated with the same
 * offline checker used across the platform and handed back to the caller,
 * and the confirmation tells the customer the store will text them.
 */
export function ClaimStep({
  theme,
  firstName,
  email,
  ringLines,
  shapeName,
  shapeImageUrl,
  total,
  currency,
  lineItems = [],
  creditAmount,
  creditHoldDays,
  defaultCountryCode = '+1',
  defaultPhoneNumber = '',
  defaultCountryIso = 'US',
  bookingUrl,
  contactTiles,
  storeName,
  title,
  message,
  note,
  footerNote,
  reassuranceNote,
  followUpNote,
  smsDisclaimer,
  phoneConfirmNote,
  creditEyebrow,
  creditHeadline,
  creditHoldLine,
  phoneLabel,
  buttonLabel,
  showCreditPrice = true,
  strikeThroughTotal = true,
  defaultBreakdownOpen = false,
  onPhoneConfirmed,
}: ClaimStepProps) {
  const prefilled = Boolean(defaultPhoneNumber);
  const [countryCode, setCountryCode] = useState(defaultCountryCode);
  const [countryIso, setCountryIso] = useState(defaultCountryIso);
  const [phone, setPhone] = useState(defaultPhoneNumber);
  const [error, setError] = useState<string | undefined>();
  const [state, setState] = useState<ClaimState>('idle');
  const [showBooking, setShowBooking] = useState(false);
  const [openBreakdown, setOpenBreakdown] = useState(defaultBreakdownOpen);
  // A "With your credit" price only exists when the credit leaves something to
  // pay, and only when the account has not turned that line off.
  const hasCreditPrice = showCreditPrice && total > creditAmount;
  const breakdownRef = useRef<HTMLUListElement>(null);
  const [breakdownHeight, setBreakdownHeight] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Measure the breakdown so the disclosure animates to its real height — a
  // fixed maximum clipped long configurations.
  useEffect(() => {
    const el = breakdownRef.current;
    if (!el) return;
    const measure = () => setBreakdownHeight(el.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [lineItems]);

  // NOTE: iframe height is reported once, centrally, by useEmbedAutoHeight on
  // the embed page. This component must not post its own `aurezo-resize`.

  const money = useMemo(
    () => (v: number) =>
      new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(v),
    [currency]
  );

  const holdDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + Math.max(1, creditHoldDays));
    return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  }, [creditHoldDays]);

  // Editable lines support {amount}, {store} and {date}.
  const fillTokens = (s: string) =>
    s
      .replace(/\{amount\}/gi, money(creditAmount))
      .replace(/\{store\}/gi, storeName || 'Someone from the store')
      .replace(/\{date\}/gi, holdDate);

  const validate = () => {
    const result = checkPhone(countryCode, phone, countryIso);
    setError(result.valid ? undefined : result.error);
    return result;
  };

  const submit = async () => {
    const result = validate();
    if (!result.valid) return;
    setState('sending');
    const e164 = result.e164 || `${countryCode}${phone}`;
    try {
      await onPhoneConfirmed?.(e164, {
        countryCode,
        phoneNumber: result.nationalNumber || digitsOnly(phone),
      });
      if (mountedRef.current) setState('sent');
    } catch {
      if (mountedRef.current) setState('failed');
    }
  };

  const t = theme;
  const muted = { color: t.mutedTextColor };
  const displayFont = { fontFamily: t.fontFamilyDisplay };
  const bodyFont = { fontFamily: t.fontFamilyBody };
  const hairline = t.borderOpacity > 0 ? withAlpha(t.borderColor, t.borderOpacity) : withAlpha(t.mutedTextColor, 0.2);
  const tabular: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };

  // Resolved wording for every editable line (see resolveCopy).
  const titleText = resolveCopy(title, firstName ? `Your ring is saved, ${firstName}.` : 'Your ring is saved.');
  const messageText = resolveCopy(message, email ? `Your full estimate is on its way to ${email}.` : 'Your full estimate is on its way to your inbox.');
  const eyebrowText = resolveCopy(creditEyebrow, DEFAULT_CLAIM_COPY.creditEyebrow);
  const headlineText = resolveCopy(creditHeadline, DEFAULT_CLAIM_COPY.creditHeadline);
  const holdLineText = resolveCopy(creditHoldLine, DEFAULT_CLAIM_COPY.creditHoldLine);
  const phoneLabelText = resolveCopy(phoneLabel, DEFAULT_CLAIM_COPY.phoneLabel);
  const buttonLabelText = resolveCopy(buttonLabel, DEFAULT_CLAIM_COPY.buttonLabel);
  const phoneConfirmText = resolveCopy(
    phoneConfirmNote,
    prefilled ? DEFAULT_CLAIM_COPY.phoneConfirmNote : 'Enter the mobile number your credit should be texted to.',
  );
  const reassuranceText = resolveCopy(reassuranceNote, DEFAULT_CLAIM_COPY.reassuranceNote);
  const followUpText = resolveCopy(followUpNote, DEFAULT_CLAIM_COPY.followUpNote);
  const smsText = resolveCopy(smsDisclaimer, DEFAULT_CLAIM_COPY.smsDisclaimer);
  const footerText = resolveCopy(footerNote, defaultClaimFooterNote(creditHoldDays));

  // Headline keeps the credit figure in the highlight colour wherever the
  // store places {amount}; a headline without the token is plain text.
  const renderCreditHeadline = () => {
    const raw = resolveCopy(creditHeadline, DEFAULT_CLAIM_COPY.creditHeadline);
    if (!raw) return null;
    const parts = raw.split(/\{amount\}/i);
    if (parts.length === 1) return fillTokens(raw);
    return parts.map((part, i) => (
      <Fragment key={i}>
        {i > 0 && <span style={{ color: t.highlightColor, ...tabular }}>{money(creditAmount)}</span>}
        {fillTokens(part)}
      </Fragment>
    ));
  };

  const buttonStyle: React.CSSProperties = {
    backgroundColor: t.buttonColor,
    color: t.buttonTextColor,
    borderRadius: t.buttonBorderRadius,
    fontFamily: t.fontFamilyBody,
    transition: TRANSITION,
    ...(t.glowIntensity > 0
      ? { boxShadow: `0 0 ${Math.round(20 + t.glowIntensity * 30)}px ${withAlpha(t.glowColor, t.glowIntensity * 0.45)}` }
      : {}),
  };

  // Tiles: only rendered when switched on AND given a destination. Booking
  // falls back to the account's saved consultation calendar.
  const tiles = useMemo(() => {
    const c = contactTiles || {};
    const rows = [
      {
        key: 'whatsapp',
        icon: MessageCircle,
        label: c.whatsapp?.label?.trim() || 'WhatsApp',
        enabled: c.whatsapp?.enabled,
        value: c.whatsapp?.value?.trim(),
        href: (v: string) => `https://wa.me/${digitsOnly(v)}`,
      },
      {
        key: 'call',
        icon: Phone,
        label: c.call?.label?.trim() || 'Call the studio',
        enabled: c.call?.enabled,
        value: c.call?.value?.trim(),
        href: (v: string) => `tel:${v}`,
      },
      {
        key: 'email',
        icon: Mail,
        label: c.email?.label?.trim() || 'Message us',
        enabled: c.email?.enabled,
        value: c.email?.value?.trim(),
        href: (v: string) => `mailto:${v}`,
      },
      {
        key: 'booking',
        icon: CalendarDays,
        label: c.booking?.label?.trim() || 'Book a visit',
        enabled: c.booking?.enabled !== false,
        value: c.booking?.value?.trim() || bookingUrl,
        href: undefined,
      },
    ];
    return rows
      .filter((r) => r.enabled && r.value)
      .map((r) => ({ key: r.key, icon: r.icon, label: r.label, href: r.href ? r.href(r.value as string) : undefined }));
  }, [contactTiles, bookingUrl]);

  const calendarUrl = contactTiles?.booking?.value?.trim() || bookingUrl;

  return (
    <div
      className="w-full min-h-[100dvh] md:min-h-0 px-4 py-8 md:px-8 md:py-14 flex flex-col items-center overflow-x-hidden"
      style={{ backgroundColor: t.background, color: t.fontColor, ...bodyFont }}
    >
      {/* Heading — above the cards, centred, with real breathing room */}
      <header className="w-full max-w-xl text-center">
        <p className="text-[11px] md:text-xs uppercase tracking-[0.28em]" style={{ color: t.accentColor }}>
          Estimate saved
        </p>
        {titleText && (
          <h1 className="mt-3 text-[28px] leading-tight md:text-5xl md:leading-[1.1]" style={displayFont}>
            {titleText}
          </h1>
        )}
        {messageText && (
          <p className="mt-3 text-sm md:text-base" style={muted}>
            {messageText}
          </p>
        )}
        {note && (
          <p className="mt-2 text-xs md:text-sm" style={muted}>
            {note}
          </p>
        )}
      </header>

      {/* Ring estimate is the first card, so the saved design is immediately clear. */}
      <GlassCard theme={t} className="w-full max-w-xl mt-6 md:mt-8 p-5 md:p-7">
        <div className="flex items-start gap-4">
          {shapeImageUrl && (
            <img
              src={shapeImageUrl}
              alt={shapeName ? `${shapeName} diamond` : 'Diamond'}
              className="w-14 h-14 md:w-16 md:h-16 object-contain shrink-0"
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          )}
          <div className="min-w-0">
            <p className="text-lg md:text-xl leading-snug" style={displayFont}>
              {[shapeName, ringLines[0]].filter(Boolean).join(', ')}
            </p>
            {ringLines[1] && (
              <p className="mt-1 text-sm md:text-base break-words" style={muted}>
                {ringLines[1]}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${hairline}` }}>
          <button
            type="button"
            onClick={() => setOpenBreakdown((o) => !o)}
            aria-expanded={openBreakdown}
            aria-controls="claim-breakdown"
            data-qe-plain
            className="w-full flex items-center justify-between gap-3 text-left py-1"
            style={{ color: t.fontColor, transition: TRANSITION }}
          >
            <span className="inline-flex items-center gap-1.5 text-sm md:text-base">
              Estimated total
              <ChevronDown
                className="w-4 h-4"
                aria-hidden
                style={{ transform: openBreakdown ? 'rotate(180deg)' : 'none', transition: TRANSITION }}
              />
            </span>
            {hasCreditPrice ? (
              // Discount treatment: the pre-credit total is smaller (and struck
              // through unless the account turned that off), the "With your
              // credit" price below carries the weight.
              <span className={`text-base md:text-lg${strikeThroughTotal ? ' line-through decoration-1' : ''}`} style={{ ...muted, ...tabular }}>
                {money(total)}
              </span>
            ) : (
              <span className="text-2xl md:text-3xl" style={{ ...displayFont, ...tabular }}>
                {money(total)}
              </span>
            )}
          </button>

          <div
            id="claim-breakdown"
            className="overflow-hidden"
            style={{
              maxHeight: openBreakdown ? breakdownHeight : 0,
              opacity: openBreakdown ? 1 : 0,
              transition: 'max-height 180ms ease, opacity 180ms ease',
            }}
            aria-hidden={!openBreakdown}
          >
            <ul className="mt-2" ref={breakdownRef}>
              {lineItems.map((item, i) => {
                const hasPrice = typeof item.price === 'number' && Number.isFinite(item.price) && item.price > 0;
                return (
                  <li
                    key={`${item.label}-${i}`}
                    className="flex items-start justify-between gap-4 py-2 text-sm"
                    style={{ borderTop: i === 0 ? undefined : `1px solid ${hairline}` }}
                  >
                    <span className="min-w-0">
                      <span className="block text-xs" style={muted}>
                        {item.label}
                      </span>
                      <span className="block break-words">{item.value}</span>
                    </span>
                    <span className="shrink-0" style={{ ...tabular, ...(hasPrice ? undefined : muted) }}>
                      {hasPrice ? `+${money(item.price as number)}` : 'Included'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {hasCreditPrice && (
            <div className="mt-3 pt-3 flex items-center justify-between gap-3 text-sm md:text-base" style={{ borderTop: `1px solid ${hairline}` }}>
              <span style={muted}>With your credit</span>
              <span className="text-2xl md:text-3xl" style={{ color: t.highlightColor, ...displayFont, ...tabular }}>{money(total - creditAmount)}</span>
            </div>
          )}
        </div>
      </GlassCard>

      {/* Credit block — the anchor, kept above the fold */}
      <GlassCard theme={t} glow pulse className="w-full max-w-xl mt-5 md:mt-6 p-5 md:p-7">
        {eyebrowText && (
          <p className="text-[11px] uppercase tracking-[0.22em]" style={{ color: t.accentColor }}>
            {fillTokens(eyebrowText)}
          </p>
        )}
        {headlineText && (
          <p className="mt-2 text-[26px] md:text-4xl leading-tight" style={displayFont}>
            {renderCreditHeadline()}
          </p>
        )}
        {holdLineText && (
          <p className="mt-1 text-sm" style={muted}>
            {fillTokens(holdLineText)}
          </p>
        )}

        {/* The claim */}
        <div className="mt-6">
          {state === 'sent' ? (
            <div
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              style={{ borderRadius: t.borderRadius, backgroundColor: withAlpha(t.successColor, 0.12), transition: TRANSITION }}
            >
              <span className="flex items-center gap-2 text-sm" style={{ color: t.successColor }}>
                <Check className="w-4 h-4" aria-hidden />
                We&apos;ll text your credit to {countryCode} {phone}
              </span>
            </div>
          ) : (
            <>
              {phoneLabelText && (
                <label htmlFor="claim-phone" className="block text-[11px] uppercase tracking-[0.18em] mb-2" style={muted}>
                  {fillTokens(phoneLabelText)}
                </label>
              )}
              {/* One box: dial code + number share a single bordered surface. */}
              <CountryPhoneInput
                variant="unified"
                countryCode={countryCode}
                phoneNumber={phone}
                countryIso={countryIso}
                onCountryCodeChange={setCountryCode}
                onCountryIsoChange={setCountryIso}
                onPhoneNumberChange={(v) => { setPhone(v); if (error) setError(undefined); }}
                onBlur={() => { if (phone) validate(); }}
                error={error}
                fontColor={t.fontColor}
                backgroundColor={t.tileBackground}
                borderColor={t.inputBorderColor}
                disabled={state === 'sending'}
              />
              {phoneConfirmText && (
                <p className="mt-2 text-xs" style={muted}>
                  {fillTokens(phoneConfirmText)}
                </p>
              )}
              {error && (
                <p className="mt-2 text-xs" style={{ color: t.errorColor }}>
                  {error}
                </p>
              )}

              <button
                type="button"
                onClick={submit}
                disabled={state === 'sending'}
                className="mt-4 w-full h-12 md:h-14 px-6 inline-flex items-center justify-center gap-3 text-sm md:text-base font-semibold disabled:opacity-70"
                style={buttonStyle}
              >
                {state === 'sending' ? 'Sending your credit…' : fillTokens(buttonLabelText)}
                {state !== 'sending' && <ArrowRight className="w-4 h-4" aria-hidden />}
              </button>

              {reassuranceText && (
                <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-center" style={muted}>
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden />
                  {fillTokens(reassuranceText)}
                </p>
              )}
            </>
          )}
        </div>

        {state === 'failed' && (
          <p className="mt-3 text-xs" style={{ color: t.errorColor }}>
            That text did not go through to {countryCode} {phone}. Send it again, try another mobile, or use one of the
            ways to reach the store below — your credit is held either way.
          </p>
        )}

        {followUpText && (
          <p className="mt-4 text-xs" style={muted}>
            {fillTokens(followUpText)}
          </p>
        )}
        {smsText && (
          <p className={`${followUpText ? 'mt-1' : 'mt-4'} text-[11px]`} style={muted}>
            {fillTokens(smsText)}
          </p>
        )}
      </GlassCard>

      {/* Ways to reach the store — never gates the credit */}
      {tiles.length > 0 && (
        <div className="w-full max-w-xl mt-5 md:mt-6">
          <p className="text-[11px] uppercase tracking-[0.22em] mb-3 text-center" style={muted}>
            Prefer to talk it through?
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {tiles.map(({ key, icon: Icon, label, href }) =>
              href ? (
                <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="block focus:outline-none">
                  <GlassCard theme={t} className="h-full p-4 flex flex-col items-center justify-center gap-2 text-center" style={{ transition: TRANSITION }}>
                    <Icon className="w-5 h-5" style={{ color: t.accentColor }} aria-hidden />
                    <span className="text-sm leading-tight">{label}</span>
                  </GlassCard>
                </a>
              ) : (
                <button
                  key={key}
                  type="button"
                  onClick={() => setShowBooking((s) => !s)}
                  data-qe-plain
                  className="block w-full h-full focus:outline-none"
                  aria-expanded={showBooking}
                  aria-controls="claim-booking"
                >
                  <GlassCard theme={t} className="h-full p-4 flex flex-col items-center justify-center gap-2 text-center" style={{ transition: TRANSITION }}>
                    <Icon className="w-5 h-5" style={{ color: t.accentColor }} aria-hidden />
                    <span className="text-sm leading-tight">{label}</span>
                  </GlassCard>
                </button>
              )
            )}
          </div>
        </div>
      )}

      {showBooking && calendarUrl && (
        <GlassCard theme={t} id="claim-booking" className="w-full max-w-xl mt-4 overflow-hidden p-1">
          <iframe
            src={calendarUrl}
            title="Book a consultation"
            className="w-full border-none"
            style={{ height: 700, borderRadius: Math.max(0, t.borderRadius - 4) }}
          />
        </GlassCard>
      )}

      {footerText && (
        <p className="mt-7 text-xs text-center max-w-md" style={muted}>
          {fillTokens(footerText)}
        </p>
      )}
    </div>
  );
}
