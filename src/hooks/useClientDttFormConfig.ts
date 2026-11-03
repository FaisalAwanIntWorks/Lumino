import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MetalKaratsConfig, TwoToneCombosConfig } from '@/lib/dtt-metal-karats';
import type { DttTimelineOption } from '@/lib/dtt-timeline-options';
import type { QuoteEstimatorThemeOverrides, QuoteTheme } from '@/lib/quote-estimator-theme';
import type { QuoteDiamondPickerConfig } from '@/lib/quote-estimator-diamonds';
import type { QuoteGemstonePickerConfig } from '@/lib/quote-estimator-gemstones';
import { getQuoteStorage, type QuoteVersion } from '@/lib/quote-estimator-version';

export interface DttFormColors {
  background?: string;
  tabBorder?: string;
  fontColor?: string;
  imageBg?: string;
  submitButtonBg?: string;
  submitButtonText?: string;
  /** Fill colour of a selected option card (Personalization step). */
  highlight?: string;
}

/** Built-in selected-card fill when no Highlight Color is configured. */
export const DEFAULT_DTT_HIGHLIGHT_COLOR = '#cfd3d9';

/**
 * Editable copy for the Summary + Thank-You screens. Every field is optional;
 * an empty/missing value falls back to the built-in wording (so the existing
 * DTT look is preserved when nothing is customized).
 */
export interface DttFormContent {
  /** "Your Ring Builder Estimate" heading on the summary screen. */
  summaryTitle?: string;
  /** Fine-print disclaimer under the estimate total. */
  summaryDisclaimer?: string;
  /** "Thank You!" heading on the confirmation screen. */
  thankYouTitle?: string;
  /** Primary confirmation line. */
  thankYouMessage?: string;
  /** Sub-note shown at the end of the natural-diamond flow. */
  thankYouNaturalNote?: string;
  /** Sub-note shown at the end of the lab-diamond (default) flow. */
  thankYouLabNote?: string;
  /** Incentive banner text. Empty/missing keeps the built-in DTT banner. */
  incentiveText?: string;
  /**
   * Incentive amount shown in the banner. Rendered in the client's account
   * currency wherever the text contains the `{amount}` token. Missing falls
   * back to 1000 so existing clients keep the current "$1,000" wording.
   */
  incentiveAmount?: number;
  /**
   * Font color for the money amount(s) inside the incentive banner (e.g.
   * "$1,000"). Only the amount is tinted; the rest stays the normal color.
   * Empty/missing falls back to the built-in DTT gold.
   */
  incentiveHighlightColor?: string;
  /**
   * Placeholder font color for the final contact form (First Name, Email,
   * Phone). Empty/missing keeps the built-in gray placeholder.
   */
  contactPlaceholderColor?: string;
  /**
   * Border color for the final contact form fields (First Name, Email, Phone).
   * Empty/missing keeps the built-in borderless look.
   */
  contactBorderColor?: string;
  /** Consultation booking calendar iframe URL. */
  bookingUrl?: string;
  /**
   * Per-step heading + sub-heading overrides, keyed by step key
   * (nature, shape, size, quality, setting, holder, band, band_width, metal,
   * personalization). Empty/missing falls back to the built-in DTT wording.
   */
  stepHeadings?: Record<string, { title?: string; subtitle?: string }>;
  /**
   * Ring Metal karat / purity variants: per metal option value, which
   * variants are enabled and their add-on price. Only deviations from the
   * built-in defaults are stored (see `src/lib/dtt-metal-karats.ts`).
   */
  metalKarats?: MetalKaratsConfig;
  /**
   * Two Tone metal combinations (Yellow + White, Yellow + Rose, …): which are
   * enabled and their add-on price. Only deviations from the defaults are stored.
   */
  twoToneCombos?: TwoToneCombosConfig;
  /**
   * Timeline step choices (label, add-on price, on/off), in display order.
   * Missing/empty keeps the built-in choices (see `src/lib/dtt-timeline-options.ts`).
   */
  timelineOptions?: DttTimelineOption[];
  /**
   * Design tokens for the opt-in glass skin (colour, radius, blur, border,
   * glow, type). Stored inside the existing settings record — no new database
   * column. Missing/empty means the account keeps today's appearance.
   */
  theme?: QuoteEstimatorThemeOverrides;
  /**
   * Which skin the live form renders: 'classic' (Theme 1, the default) or
   * 'glass' (Theme 2). Missing means Theme 1. Ignored by the Sandbox lab
   * account, whose V2 is always glass.
   */
  quoteTheme?: QuoteTheme;
  /** How many days the thank-you credit is held for. Defaults to 7. */
  creditHoldDays?: number;
  /** Footer line on the claim screen. Unset keeps the built-in wording; "" hides it. */
  claimFooterNote?: string;
  /** Line under the claim button. Supports {amount}. */
  claimReassuranceNote?: string;
  /** Personal follow-up line. Supports {store} and {date}. */
  claimFollowUpNote?: string;
  /** SMS compliance line. */
  claimSmsDisclaimer?: string;
  /** Helper under the phone field on the claim screen. */
  claimPhoneConfirmNote?: string;
  /** Design Credit card: small label above the headline. */
  claimCreditEyebrow?: string;
  /** Design Credit card: headline. Supports {amount}, shown in the highlight colour. */
  claimCreditHeadline?: string;
  /** Design Credit card: line under the headline. Supports {date}. */
  claimCreditHoldLine?: string;
  /** Design Credit card: label above the phone field. */
  claimPhoneLabel?: string;
  /** Design Credit card: claim button text. Supports {amount}. */
  claimButtonLabel?: string;
  /**
   * Theme 2 thank-you page: strike through the pre-credit "Estimated total"
   * when a "With your credit" price is shown. Missing means on; only `false`
   * is ever stored.
   */
  claimStrikeThroughTotal?: boolean;
  /**
   * Theme 2 thank-you page: show the "With your credit" price (estimated
   * total minus the credit) under the "Estimated total". Missing means on;
   * only `false` is ever stored. Off leaves just the "Estimated total" for
   * stores whose credit is a gift with purchase rather than money off.
   */
  claimShowCreditPrice?: boolean;
  /** "Prefer to talk it through?" tiles on the thank-you screen. */
  contactTiles?: QuoteEstimatorContactTiles;
  /**
   * Sandbox-only "mini Nivoda" diamond picker on the Quality step: which
   * colour / clarity grades a customer may see, how many stones are listed
   * and the pool markup (see `src/lib/quote-estimator-diamonds.ts`).
   */
  diamondPicker?: QuoteDiamondPickerConfig;
  /**
   * V3 gemstone picker: after the gemstone card, the real stones of that
   * gemstone from the gemstone pool as product cards (see
   * `src/lib/quote-estimator-gemstones.ts`).
   */
  gemstonePicker?: QuoteGemstonePickerConfig;
}

/** One tile on the thank-you screen. A tile with no destination never renders. */
export interface QuoteEstimatorContactTile {
  enabled?: boolean;
  /** Phone number, WhatsApp number, email address or booking URL. */
  value?: string;
  /** Overrides the built-in tile label. */
  label?: string;
}

export interface QuoteEstimatorContactTiles {
  whatsapp?: QuoteEstimatorContactTile;
  call?: QuoteEstimatorContactTile;
  email?: QuoteEstimatorContactTile;
  booking?: QuoteEstimatorContactTile;
}

/**
 * Built-in wording for the Summary + Thank-You screens. Used as admin
 * placeholders and as the runtime fallback when a client hasn't customized a
 * field — keeping the current DTT copy intact by default.
 * NOTE: the incentive banner's default is rendered as styled JSX in the
 * summary component; `incentiveText` here is only the admin placeholder.
 */
export const DEFAULT_DTT_FORM_CONTENT = {
  summaryTitle: 'Your Ring Builder Estimate',
  summaryDisclaimer: 'This is an estimate only. Final pricing may vary based on market conditions. A specialist will reach out to confirm details.',
  thankYouTitle: 'Thank You!',
  thankYouMessage: 'Your Ring Builder estimate has been saved successfully.',
  thankYouNaturalNote: 'Since this is a natural diamond choice, one of our specialist will reach out soon. Please book your consultation to get the exact quote.',
  thankYouLabNote: 'One of our diamond specialists will reach out to you shortly to discuss your dream ring and next steps.',
  incentiveText: 'Incentive worth {amount} if order is placed within 72h of receiving quote — ask us about it during your consultation!',
  incentiveHighlightColor: '#C7A17A',
  // Default incentive figure. Rendered in the client's account currency.
  incentiveAmount: 1000,
  // Contact-form styling defaults — used only as admin colour-picker starting
  // values / placeholders. They are NOT applied at render time unless a client
  // actually saves a value, so the borderless gray-placeholder DTT look stays.
  contactPlaceholderColor: '#6B7280',
  contactBorderColor: '#D1D5DB',
  // Legacy DTT booking calendar. NOT a global fallback — it is only rendered
  // for the original DTT client. Every other client shows no calendar until a
  // booking URL is saved in Configure → Consultation Booking URL.
  bookingUrl: 'https://link.crmmvmnt.com/widget/booking/vWU1weTuLodz1Hr0BPDb',
} as const;

export interface ClientDttFormConfig {
  live_version?: QuoteVersion;
  id: string;
  client_id: string;
  form_colors: DttFormColors | null;
  enabled_steps: Record<string, boolean> | null;
  step_order: string[] | null;
  submission_mode: 'deposit' | 'contact';
  deposit_amount: number | null;
  onboarding_completed: boolean;
  /** Welcome screen copy. Null falls back to the built-in wording. */
  welcome_title: string | null;
  welcome_subtitle: string | null;
  /** Editable Summary + Thank-You copy. Null falls back to built-in wording. */
  form_content: DttFormContent | null;
  /** Lead quality gate (zero-cost, no SMS). */
  enable_lead_quality_scoring: boolean;
  block_disposable_email: boolean;
  /** Minutes within which a repeat phone submission updates the same lead. */
  dedupe_window_minutes: number;
}

export function useClientDttFormConfig(clientId: string | null, version: QuoteVersion = 'v2') {
  return useQuery<ClientDttFormConfig | null>({
    queryKey: ['client-dtt-form-config', clientId, version],
    queryFn: async () => {
      if (!clientId) return null;
      const { data, error } = await (supabase as any)
        .from(getQuoteStorage(clientId, version).config)
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();
      if (error) throw error;
      return (data as ClientDttFormConfig | null) ?? null;
    },
    enabled: !!clientId,
    staleTime: 1000 * 30,
  });
}
