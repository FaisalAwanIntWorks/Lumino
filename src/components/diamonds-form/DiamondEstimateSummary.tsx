import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Heart } from 'lucide-react';
import { useDiamondFormOptions, DiamondOption } from '@/hooks/useDiamondFormOptions';
import { DiamondFormData } from '@/pages/client/DiamondsForm';
import { ContactFormData } from './DiamondContactStep';
import { supabase } from '@/integrations/supabase/client';
import { insertLeadRow } from '@/lib/lead-device';
import { toast } from 'sonner';
import { pushToDataLayer } from '@/lib/google-tag';
import { trackMetaEvent } from '@/lib/meta-pixel';
import { sendMetaCapiEvent } from '@/lib/meta-capi';
import { trackMetaLead } from '@/lib/meta-lead';
import { trackLeadConversion } from '@/lib/conversion-tracking';
import { DEFAULT_DTT_FORM_CONTENT, type DttFormContent, type DttFormColors } from '@/hooks/useClientDttFormConfig';
import { findMetalKarat, findTwoToneCombo, toMetalPriceMap } from '@/lib/dtt-metal-karats';
import { findTimelineOption } from '@/lib/dtt-timeline-options';
import { scoreLead } from '@/lib/lead-quality';
import { ClaimStep } from '@/components/diamonds-form/ClaimStep';
import { isGlassQuoteEstimator, resolveQuoteEstimatorTheme } from '@/lib/quote-estimator-theme';
import { useQuoteVersion, useQuoteTestPreview, useQuoteTheme } from '@/lib/quote-estimator-version';
import { getDiamondShapeIcon } from '@/lib/diamond-shape-icons';
import { quoteV3Breakdown } from '@/lib/quote-v3-pricing';
import { useAllDiamondFormOptions } from '@/hooks/useAllDiamondFormOptions';
import { formatQuoteDiamondCertificate, formatQuoteDiamondLabel, formatQuoteDiamondPrice } from '@/lib/quote-estimator-diamonds';
import { COLORED_DIAMOND_SHAPE_VALUE, GEMSTONE_SHAPE_VALUE, quoteGemstoneLabel } from '@/lib/quote-v3-gemstones';
import { formatQuoteGemstoneLabel, formatQuoteGemstonePrice, quoteGemstoneDetailRows } from '@/lib/quote-estimator-gemstones';

/**
 * Quote Estimator V3 stone extras (Colored Diamond silhouette, or the
 * gemstone). The lead table has no columns for them, so they travel as
 * readable lines in other_details and as their own rows on the quote and in
 * both emails. Empty for every other path and version.
 */
function stoneExtras(formData: DiamondFormData, shapeOptions: DiamondOption[]): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (formData.diamondShape === COLORED_DIAMOND_SHAPE_VALUE) {
    const shapeName = formData.diamondColoredShape ? (shapeOptions.find(o => o.option_value === formData.diamondColoredShape)?.name || formData.diamondColoredShape) : '';
    if (shapeName) out.push({ label: 'Colored Diamond Shape', value: shapeName });
  }
  if (formData.diamondShape === GEMSTONE_SHAPE_VALUE && formData.diamondGemstone) out.push({ label: 'Gemstone', value: quoteGemstoneLabel(formData.diamondGemstone) });
  return out;
}

const DTT_CLIENT_ID = 'aeec6491-bd1f-4787-97f9-6a47a2ddc8af';

interface DiamondEstimateSummaryProps {
  formData: DiamondFormData;
  onBack: () => void;
  onClose?: () => void;
  clientId?: string;
  skipEstimate?: boolean;
  currency?: string;
  /** Quote Estimator submission mode from client_dtt_form_config. */
  submissionMode?: 'deposit' | 'contact';
  /** Deposit amount shown when submissionMode === 'deposit'. */
  depositAmount?: number;
  /** Editable Summary + Thank-You copy; empty fields fall back to defaults. */
  content?: DttFormContent | null;
  /** Saved palette, so the claim screen matches the rest of the form. */
  formColors?: DttFormColors | null;
  /** When off, no lead quality score is computed or stored. */
  enableQualityScoring?: boolean;
}

interface SummaryLineItem {
  label: string;
  value: string;
  price: number | null;
}

function useAllDiamondOptions(clientId?: string | null) {
  const version = useQuoteVersion();
  const v3 = useAllDiamondFormOptions(clientId || undefined, 'v3', false, version === 'v3');
  const legacyClient = version === 'v3' ? null : clientId;
  const nature = useDiamondFormOptions('diamond_nature_options', legacyClient);
  const shape = useDiamondFormOptions('diamond_shape_options', legacyClient);
  const size = useDiamondFormOptions('diamond_size_options', legacyClient);
  const quality = useDiamondFormOptions('diamond_quality_options', legacyClient);
  const setting = useDiamondFormOptions('ring_setting_options', legacyClient);
  const holder = useDiamondFormOptions('diamond_holder_options', legacyClient);
  const band = useDiamondFormOptions('band_type_options', legacyClient);
  const bandWidth = useDiamondFormOptions('band_width_options', legacyClient);
  const metal = useDiamondFormOptions('ring_metal_options', legacyClient);
  const personalization = useDiamondFormOptions('personalization_options', legacyClient);

  const isLoading = version === 'v3' ? v3.isLoading : nature.isLoading || shape.isLoading || size.isLoading || quality.isLoading ||
    setting.isLoading || holder.isLoading || band.isLoading || bandWidth.isLoading ||
    metal.isLoading || personalization.isLoading;

  if (version === 'v3') return {
    nature: v3.data?.nature ?? [], shape: v3.data?.shape ?? [], size: v3.data?.size ?? [],
    quality: v3.data?.quality ?? [], setting: v3.data?.setting ?? [], holder: v3.data?.holder ?? [],
    band: v3.data?.band ?? [], bandWidth: v3.data?.band_width ?? [], metal: v3.data?.metal ?? [],
    personalization: v3.data?.personalization ?? [], isLoading,
  };
  return {
    nature: nature.data ?? [],
    shape: shape.data ?? [],
    size: size.data ?? [],
    quality: quality.data ?? [],
    setting: setting.data ?? [],
    holder: holder.data ?? [],
    band: band.data ?? [],
    bandWidth: bandWidth.data ?? [],
    metal: metal.data ?? [],
    personalization: personalization.data ?? [],
    isLoading,
  };
}

function findOption(options: DiamondOption[], value: string | null): DiamondOption | undefined {
  if (!value) return undefined;
  return options.find(o => o.option_value === value);
}

export const DiamondEstimateSummary = ({ formData, onBack, onClose, clientId: clientIdProp, skipEstimate = false, currency = 'USD', submissionMode = 'contact', depositAmount, content, formColors, enableQualityScoring = true }: DiamondEstimateSummaryProps) => {
  const quoteVersion = useQuoteVersion();
  const testPreview = useQuoteTestPreview();
  // Theme 2 · Glass replaces the thank-you screen with the Claim step.
  const useGlass = useQuoteTheme() === 'glass';
  // Resolve editable copy. Three states per line: not set keeps the built-in
  // wording, an empty string hides that line, anything else is shown as typed.
  const D = DEFAULT_DTT_FORM_CONTENT;
  const pick = (value: string | undefined | null, fallback: string) => (value === undefined || value === null ? fallback : value);
  const copy = {
    summaryTitle: pick(content?.summaryTitle, D.summaryTitle),
    summaryDisclaimer: pick(content?.summaryDisclaimer, D.summaryDisclaimer),
    thankYouTitle: pick(content?.thankYouTitle, D.thankYouTitle),
    thankYouMessage: pick(content?.thankYouMessage, D.thankYouMessage),
    thankYouNaturalNote: pick(content?.thankYouNaturalNote, D.thankYouNaturalNote),
    thankYouLabNote: pick(content?.thankYouLabNote, D.thankYouLabNote),
  };
  // Incentive banner: show the client's text (or the built-in wording), swap
  // the `{amount}` token for the configured incentive amount formatted in the
  // client's account currency, and tint only the money amount(s).
  const rawIncentive = pick(content?.incentiveText, D.incentiveText);
  const incentiveAmount =
    typeof content?.incentiveAmount === 'number' && !Number.isNaN(content.incentiveAmount)
      ? content.incentiveAmount
      : D.incentiveAmount;
  const formatMoney = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(value);
  const incentiveMessage = rawIncentive.replace(/\{amount\}/gi, formatMoney(incentiveAmount));
  const incentiveHighlightColor = content?.incentiveHighlightColor?.trim() || D.incentiveHighlightColor;
  // Matches money figures with any leading currency symbol/code (e.g. $1,000,
  // £1,000, A$1,000, CHF 1,000, ₹1,000).
  const MONEY_RE = /((?:[^\sA-Za-z\d,.]{1,3}\s?|\b[A-Z]{2,3}\s)\d[\d,]*(?:\.\d+)?)/g;
  const renderIncentive = (text: string) =>
    text.split(MONEY_RE).map((part, i) =>
      new RegExp(`^${MONEY_RE.source}$`).test(part)
        ? <span key={i} style={{ color: incentiveHighlightColor }}>{part}</span>
        : part
    );
  const { clientId: clientIdParam } = useParams();
  const clientId = clientIdProp || clientIdParam;
  // Consultation calendar on the thank-you screen. Only shown when this client
  // has actually saved a booking URL — a new client must never inherit another
  // store's calendar. The built-in DTT link stays as a fallback for the legacy
  // DTT client alone, which relies on it instead of a stored value.
  const bookingUrl = content?.bookingUrl?.trim() || (clientId === DTT_CLIENT_ID ? D.bookingUrl : '');
  const opts = useAllDiamondOptions(clientId);
  const hasSaved = useRef(false);
  const scheduleFiredRef = useRef(false);
  const leadFiredRef = useRef(false);
  // Accounts on the new design go straight to the thank-you screen — the
  // itemised breakdown lives behind the "Estimated total" disclosure there.
  const startOnThankYou = (quoteVersion !== 'v3' && skipEstimate) || useGlass;
  const [showThankYou, setShowThankYou] = useState(startOnThankYou || quoteVersion === 'v3');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(quoteVersion === 'v3' ? 'idle' : startOnThankYou ? 'saved' : 'idle');
  const [retryCount, setRetryCount] = useState(0);
  // Kept so the claim screen can attach the confirmed mobile number to the
  // lead row that was just written.
  const savedLeadIdRef = useRef<string | null>(null);

  // Fire Meta Pixel `Lead` when the thank-you screen is shown. Works for every
  // Quote Estimator client. DTT already fires Lead on the contact step, so we
  // reuse the stored event ID there and Meta de-duplicates the two hits.
  useEffect(() => {
    if (!showThankYou || saveStatus !== 'saved' || leadFiredRef.current || !clientId || testPreview) return;
    leadFiredRef.current = true;

    let storedUser: { email?: string; phone?: string; firstName?: string } = {};
    let eventId = '';
    try {
      const raw = sessionStorage.getItem('dtt_meta_user_data');
      if (raw) storedUser = JSON.parse(raw);
      eventId = sessionStorage.getItem('dtt_meta_lead_event_id') || '';
    } catch {}

    const contact = formData.contactInfo;
    const userData = {
      email: storedUser.email || contact?.email,
      phone: storedUser.phone || (contact ? `${contact.countryCode}${contact.phoneNumber}` : undefined),
      firstName: storedUser.firstName || contact?.firstName,
      externalId: storedUser.email || contact?.email,
    };

    const customData = { content_name: 'Ring Builder', content_category: 'diamond_form' };

    // Shared helper: browser Pixel + Conversions API with one event id.
    // `eventId` may be empty (non-DTT) — the helper then generates one.
    const firedEventId = trackMetaLead({ clientId, eventId: eventId || undefined, userData, customData });

    // Clear the shared id so a second submission in the same browser session
    // gets a fresh one instead of being discarded by Meta as a duplicate.
    // `dtt_meta_user_data` is kept — the Schedule handler below still needs it
    // and the contact step overwrites it on every submission.
    try { sessionStorage.removeItem('dtt_meta_lead_event_id'); } catch {}

    // Google Ads conversion + GTM dataLayer (no-op unless configured)
    trackLeadConversion('quote_estimator', {
      email: userData.email,
      phone: userData.phone,
      leadId: firedEventId,
    });
  }, [showThankYou, saveStatus, clientId, formData.contactInfo, testPreview]);


  // DTT-only: fire Meta Pixel `Schedule` when LeadConnector booking iframe
  // posts an appointment-booked message.
  useEffect(() => {
    if (clientId !== DTT_CLIENT_ID || !showThankYou) return;

    const isBookingOrigin = (origin: string) => {
      try {
        const host = new URL(origin).hostname;
        return (
          host === 'link.crmmvmnt.com' ||
          host.endsWith('.leadconnectorhq.com') ||
          host === 'msgsndr.com' ||
          host.endsWith('.msgsndr.com')
        );
      } catch {
        return false;
      }
    };

    const matchesBooked = (data: unknown): boolean => {
      if (!data) return false;
      if (typeof data === 'string') return /appointment[_.]?booked|booking[_.]?(success|completed|confirmed)/i.test(data);
      if (typeof data === 'object') {
        const d = data as Record<string, unknown>;
        const t = String(d.type || d.event || d.eventName || d.action || '');
        if (/appointment[_.]?booked|booking[_.]?(success|completed|confirmed)/i.test(t)) return true;
        try { return matchesBooked(JSON.stringify(d)); } catch { return false; }
      }
      return false;
    };

    const onMessage = (e: MessageEvent) => {
      if (scheduleFiredRef.current) return;
      if (!isBookingOrigin(e.origin)) return;
      if (!matchesBooked(e.data)) return;
      scheduleFiredRef.current = true;

      const scheduleEventId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `sched-${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // Recover contact info captured on the contact step (for CAPI matching)
      let storedUser: { email?: string; phone?: string; firstName?: string } = {};
      try {
        const raw = sessionStorage.getItem('dtt_meta_user_data');
        if (raw) storedUser = JSON.parse(raw);
      } catch {}

      trackMetaEvent(
        'Schedule',
        { content_name: 'Diamond Consultation', content_category: 'diamond_form' },
        { eventID: scheduleEventId }
      );

      if (clientId) {
        void sendMetaCapiEvent({
          clientId,
          eventName: 'Schedule',
          eventId: scheduleEventId,
          userData: {
            ...storedUser,
            externalId: storedUser.email,
          },
          customData: { content_name: 'Diamond Consultation', content_category: 'diamond_form' },
        });
      }

      trackLeadConversion('appointment_booking', {
        email: storedUser.email,
        phone: storedUser.phone,
        leadId: scheduleEventId,
      });
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [clientId, showThankYou]);

  // Save lead to database once (hook must be before any early return)
  useEffect(() => {
    if (hasSaved.current || opts.isLoading || (quoteVersion === 'v3' && !opts.nature.length) || !clientId || !formData.contactInfo) return;
    hasSaved.current = true;
    setSaveStatus('saving');

    // Compute estimated total from loaded options
    let total = 0;
    const addPrice = (options: DiamondOption[], val: string | null) => {
      const opt = val ? options.find(o => o.option_value === val) : undefined;
      if (opt?.price) total += opt.price;
    };
    addPrice(opts.nature, formData.diamondType);
    addPrice(opts.shape, formData.diamondShape);
    // V3 gemstone path: the size card is only the carat window of the stone list, so it carries no price of its own.
    if (formData.diamondShape !== GEMSTONE_SHAPE_VALUE) addPrice(opts.size, formData.diamondSize);
    // Sandbox diamond picker: the exact stone's price replaces the quality card.
    const pickedDiamond = formData.selectedDiamond ?? null;
    if (pickedDiamond) total += pickedDiamond.price;
    else addPrice(opts.quality, formData.diamondQuality);
    // V3 gemstone picker: the exact stone from the gemstone pool (the gemstone path has no quality cards).
    const pickedGemstone = formData.diamondShape === GEMSTONE_SHAPE_VALUE ? formData.selectedGemstone ?? null : null;
    if (pickedGemstone) total += pickedGemstone.price;
    const gemstoneRows = pickedGemstone ? quoteGemstoneDetailRows(pickedGemstone).filter(r => r.label !== 'Gemstone') : [];
    const gemstoneNote = pickedGemstone
      ? `Selected Gemstone: ${formatQuoteGemstoneLabel(pickedGemstone)} — ${formatQuoteGemstonePrice(pickedGemstone.price, currency)}${gemstoneRows.length ? ` (${gemstoneRows.map(r => `${r.label} ${r.value}`).join(', ')})` : ''}`
      : '';
    addPrice(opts.setting, formData.diamondSetting);
    addPrice(opts.holder, formData.diamondHolder);
    addPrice(opts.band, formData.diamondBand);
    addPrice(opts.metal, formData.diamondMetal);
    // Karat / purity add-on sits on top of the metal price.
    const karatOpt = findMetalKarat(formData.diamondMetal, formData.diamondMetalKarat, content?.metalKarats);
    if (karatOpt?.price) total += karatOpt.price;
    const comboOpt = formData.diamondMetal === 'two-tone'
      ? findTwoToneCombo(formData.diamondTwoToneMetals, content?.twoToneCombos, toMetalPriceMap(opts.metal))
      : undefined;
    if (comboOpt?.price) total += comboOpt.price;
    formData.diamondBandWidth.forEach(bw => addPrice(opts.bandWidth, bw));
    formData.diamondPersonalization.forEach(p => addPrice(opts.personalization, p));
    const timelineOpt = findTimelineOption(formData.diamondTimeline, content?.timelineOptions);
    if (timelineOpt?.price) total += timelineOpt.price;
    if (quoteVersion === 'v3') total = quoteV3Breakdown(formData, {
      nature: opts.nature, shape: opts.shape, size: opts.size, quality: opts.quality,
      setting: opts.setting, holder: opts.holder, band: opts.band,
      band_width: opts.bandWidth, metal: opts.metal, personalization: opts.personalization,
    }, content).total;

    const saveLead = async () => {
      // The Sandbox V3 test link is a rehearsal, not a customer request.
      // Do not upload images or write a lead: database triggers would otherwise
      // create notifications and send the test lead to the configured CRM.
      if (testPreview) {
        setSaveStatus('saved');
        return;
      }
      try {
        // Upload inspiration images to storage
        const imageUrls: string[] = [];
        if (formData.inspirationImages && formData.inspirationImages.length > 0) {
          for (const file of formData.inspirationImages) {
            const fileName = `${clientId}/${Date.now()}_${crypto.randomUUID()}_${file.name}`;
            const { error: uploadError } = await supabase.storage
              .from('diamond-inspiration')
              .upload(fileName, file, { cacheControl: '3600', upsert: false });
            if (!uploadError) {
              const { data: urlData } = supabase.storage
                .from('diamond-inspiration')
                .getPublicUrl(fileName);
              if (urlData?.publicUrl) imageUrls.push(urlData.publicUrl);
            } else {
              console.error('Failed to upload inspiration image:', uploadError);
            }
          }
        }

        const leadId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

        // Zero-cost quality signals (offline phone parsing, disposable email,
        // honeypot, fill time). Never blocks the submission — the lead is
        // always saved; the score just tells the jeweler what to trust.
        const contact = formData.contactInfo!;
        const quality = enableQualityScoring
          ? scoreLead({
              countryCode: contact.countryCode,
              phoneNumber: contact.phoneNumber,
              countryIso: contact.countryIso,
              email: contact.email,
              firstName: contact.firstName,
              submissionMs: contact.submissionMs,
              honeypot: contact.honeypot,
            })
          : null;

        const { error } = await insertLeadRow('diamond_form_leads', {
          id: leadId,
          client_id: clientId,
          first_name: formData.contactInfo!.firstName,
          email: formData.contactInfo!.email,
          country_code: formData.contactInfo!.countryCode,
          phone_number: formData.contactInfo!.phoneNumber,
          sms_consent: formData.contactInfo!.smsConsent,
          marketing_consent: formData.contactInfo!.marketingConsent,
          diamond_type: formData.diamondType,
          diamond_shape: formData.diamondShape,
          diamond_size: formData.diamondSize,
          diamond_quality: formData.diamondQuality,
          diamond_setting: formData.diamondSetting,
          diamond_holder: formData.diamondHolder,
          diamond_band: formData.diamondBand,
          diamond_band_width: formData.diamondBandWidth,
          diamond_metal: formData.diamondMetal,
          diamond_metal_karat: formData.diamondMetalKarat,
          diamond_two_tone_metals: formData.diamondTwoToneMetals,
          diamond_personalization: formData.diamondPersonalization,
          ring_size: formData.ringSize || null,
          other_details: [...stoneExtras(formData, opts.shape).map(x => `${x.label}: ${x.value}`), gemstoneNote, formData.otherDetails].filter(Boolean).join('\n') || null,
          diamond_timeline: formData.diamondTimeline,
          estimated_total: total,
          inspiration_image_urls: imageUrls.length > 0 ? imageUrls : null,
          phone_quality: quality?.quality ?? null,
          phone_quality_reasons: quality && quality.reasons.length ? quality.reasons : null,
          submission_ms: contact.submissionMs ?? null,
          quote_version: isGlassQuoteEstimator(clientId) ? quoteVersion : null,
          is_test_preview: testPreview,
          selected_diamond: pickedDiamond ? JSON.parse(JSON.stringify(pickedDiamond)) : null,
          selected_gemstone: pickedGemstone ? JSON.parse(JSON.stringify(pickedGemstone)) : null,
        });
        if (error) {
          console.error('Failed to save diamond form lead:', error);
          setSaveStatus('error');
          toast.error('We could not save your request. Please try again.');
          return;
        }
        savedLeadIdRef.current = leadId;

        // DTT CRM sync is invoked by the database insert trigger so a browser
        // networking issue cannot prevent the lead from being saved first.

        // Instant Quote notification emails — jeweler copy always (subject to
        // their New Lead preference) and the customer copy unless they've
        // switched it off (e.g. their CRM already sends one). Fire-and-forget:
        // an email failure must never block the thank-you screen.
        try {
          const nameOf = (options: DiamondOption[], val: string | null) =>
            (val ? options.find(o => o.option_value === val)?.name : undefined) || val || '';
          const namesOf = (options: DiamondOption[], vals: string[]) =>
            (vals || []).map(v => nameOf(options, v)).filter(Boolean).join(', ');
          const rawDetails: Record<string, string> = {
            'Diamond Type': nameOf(opts.nature, formData.diamondType),
            'Diamond Shape': nameOf(opts.shape, formData.diamondShape),
            ...Object.fromEntries(stoneExtras(formData, opts.shape).map(x => [x.label, x.value])),
            'Diamond Size': nameOf(opts.size, formData.diamondSize),
            'Diamond Quality': nameOf(opts.quality, formData.diamondQuality),
            // Sandbox diamond picker: the exact stone + certificate. The PDF
            // link travels separately (`selected_diamond`) so the email can
            // render it as a certificate link instead of an image link.
            'Selected Diamond': pickedDiamond ? `${formatQuoteDiamondLabel(pickedDiamond)} — ${formatQuoteDiamondPrice(pickedDiamond.price, currency)}` : '',
            'Diamond Certificate': pickedDiamond ? formatQuoteDiamondCertificate(pickedDiamond) : '',
            // V3 gemstone picker: the exact stone + its details. The picture,
            // video and certificate links travel separately (`selected_gemstone`).
            'Selected Gemstone': pickedGemstone ? `${formatQuoteGemstoneLabel(pickedGemstone)} — ${formatQuoteGemstonePrice(pickedGemstone.price, currency)}` : '',
            'Gemstone Details': gemstoneRows.map(r => `${r.label}: ${r.value}`).join(', '),
            'Ring Setting': nameOf(opts.setting, formData.diamondSetting),
            'Stone Holder': nameOf(opts.holder, formData.diamondHolder),
            'Type of Band': nameOf(opts.band, formData.diamondBand),
            'Band Width': namesOf(opts.bandWidth, formData.diamondBandWidth),
            'Ring Metal': nameOf(opts.metal, formData.diamondMetal),
            'Metal Karat': karatOpt?.name ?? (formData.diamondMetalKarat || ''),
            'Two Tone Metals': comboOpt?.name ?? (formData.diamondTwoToneMetals || ''),
            'Personalization': namesOf(opts.personalization, formData.diamondPersonalization),
            'Ring Size': formData.ringSize || '',
            'Timeline': timelineOpt?.label ?? (formData.diamondTimeline || ''),
            'Other Details': formData.otherDetails || '',
            'Inspiration Images': imageUrls.join(', '),
          };
          const emailDetails = Object.fromEntries(
            Object.entries(rawDetails).filter(([, v]) => v && v.trim())
          );
          const formattedEstimate = new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
          }).format(total);
          const customerName = formData.contactInfo!.firstName;
          const customerEmail = formData.contactInfo!.email;
          const customerPhone = formData.contactInfo!.phoneNumber
            ? `${formData.contactInfo!.countryCode}${formData.contactInfo!.phoneNumber}`
            : '';
          // Exact stone block for both emails (label, price, certificate + PDF link).
          const selectedDiamondEmail = pickedDiamond ? {
            label: `${pickedDiamond.stoneType === 'lab' ? 'Lab' : 'Natural'} · ${formatQuoteDiamondLabel(pickedDiamond)}`,
            price: formatQuoteDiamondPrice(pickedDiamond.price, currency),
            certificate: formatQuoteDiamondCertificate(pickedDiamond) || null,
            lab: pickedDiamond.lab,
            report_no: pickedDiamond.reportNo,
            pdf: pickedDiamond.pdf,
          } : null;
          // Exact gemstone block for both emails (picture, label, price, details, video + certificate links).
          const selectedGemstoneEmail = pickedGemstone ? {
            label: formatQuoteGemstoneLabel(pickedGemstone),
            price: formatQuoteGemstonePrice(pickedGemstone.price, currency),
            details: Object.fromEntries(gemstoneRows.map(r => [r.label, r.value])),
            image: pickedGemstone.image,
            video: pickedGemstone.video,
            pdf: pickedGemstone.pdf,
          } : null;

          supabase.functions.invoke('notify-form-lead', {
            body: {
              client_id: clientId,
              form_type: 'instant_quote',
              customer_name: customerName,
              customer_email: customerEmail,
              customer_phone: customerPhone,
              details: emailDetails,
              estimate_amount: skipEstimate ? null : formattedEstimate,
              selected_diamond: selectedDiamondEmail,
              selected_gemstone: selectedGemstoneEmail,
            },
          }).catch(err => console.error('notify-form-lead failed:', err));

          supabase.functions.invoke('notify-customer-confirmation', {
            body: {
              client_id: clientId,
              form_type: 'instant_quote',
              customer_name: customerName,
              customer_email: customerEmail,
              details: emailDetails,
              estimate_amount: skipEstimate ? null : formattedEstimate,
              diamond_type: skipEstimate ? 'natural' : formData.diamondType,
              selected_diamond: selectedDiamondEmail,
              selected_gemstone: selectedGemstoneEmail,
            },
          }).catch(err => console.error('notify-customer-confirmation failed:', err));
         } catch (emailErr) {
          console.error('Failed to trigger Instant Quote notification emails:', emailErr);
         }


        // Send data to Pabbly webhook (only for Diamond Touch Toronto)
        if (clientId === 'aeec6491-bd1f-4787-97f9-6a47a2ddc8af') {
          try {
            await fetch('https://connect.pabbly.com/workflow/sendwebhookdata/IjU3NjcwNTZjMDYzMDA0MzE1MjZjNTUzZDUxMzYi_pc', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                first_name: formData.contactInfo!.firstName || '-',
                email: formData.contactInfo!.email || '-',
                phone_number: formData.contactInfo!.phoneNumber
                  ? `${formData.contactInfo!.countryCode}${formData.contactInfo!.phoneNumber}`
                  : '-',
                sms_consent: formData.contactInfo!.smsConsent ?? '-',
                marketing_consent: formData.contactInfo!.marketingConsent ?? '-',
                diamond_type: formData.diamondType || '-',
                diamond_shape: formData.diamondShape || '-',
                diamond_size: formData.diamondSize || '-',
                diamond_quality: formData.diamondQuality || '-',
                diamond_setting: formData.diamondSetting || '-',
                diamond_holder: formData.diamondHolder || '-',
                diamond_band: formData.diamondBand || '-',
                diamond_band_width: formData.diamondBandWidth?.length > 0 ? formData.diamondBandWidth : '-',
                diamond_metal: formData.diamondMetal || '-',
                diamond_metal_karat: karatOpt?.name ?? (formData.diamondMetalKarat || '-'),
                diamond_two_tone_metals: comboOpt?.name ?? (formData.diamondTwoToneMetals || '-'),
                diamond_personalization: formData.diamondPersonalization?.length > 0 ? formData.diamondPersonalization : '-',
                ring_size: formData.ringSize || '-',
                other_details: formData.otherDetails || '-',
                diamond_timeline: formData.diamondTimeline || '-',
                estimated_total: total ?? '-',
                inspiration_image_urls: imageUrls.length > 0 ? imageUrls : '-',
              }),
            });
          } catch (webhookErr) {
            console.error('Failed to send webhook:', webhookErr);
          }

          // Push conversion event to GTM dataLayer
          if (!testPreview) pushToDataLayer('form_submission', {
            form_type: 'diamond_ring_builder',
            estimated_total: total,
            diamond_type: formData.diamondType,
          });
        }
        setSaveStatus('saved');
      } catch (err) {
        console.error('Error saving diamond form lead:', err);
        setSaveStatus('error');
        toast.error('We could not save your request. Please try again.');
      }
    };
    saveLead();
  }, [clientId, formData, opts.isLoading, retryCount]);

  if (opts.isLoading) {
    return (
      <div className="min-h-[100dvh] md:min-h-[600px] bg-[#EDE8E3] rounded-lg p-6 md:p-10 flex items-center justify-center">
        <div className="text-gray-600 text-lg">Loading your estimate...</div>
      </div>
    );
  }

  if (saveStatus === 'error' && quoteVersion === 'v3') {
    return <div className="v3-complete-inner" role="alert"><h1>We could not save your request</h1><p>Your design is still here. Please try again.</p><Button onClick={() => { hasSaved.current = false; setSaveStatus('idle'); setRetryCount(n => n + 1); }}>Try again</Button><Button variant="outline" onClick={onBack}>Back to your design</Button></div>;
  }
  if (saveStatus === 'error') {
    return (
      <div className="min-h-[100dvh] md:min-h-[600px] bg-[#EDE8E3] rounded-lg p-6 md:p-10 flex flex-col items-center justify-center text-center">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
          We could not save your request
        </h2>
        <p className="text-gray-600 text-sm md:text-base max-w-md mb-6">
          Please go back and submit again so our team receives your details.
        </p>
        <Button
          onClick={() => {
            hasSaved.current = false;
            setSaveStatus('idle');
            onBack();
          }}
          className="bg-black text-white hover:bg-gray-900 px-8 border border-black"
        >
          Back
        </Button>
      </div>
    );
  }

  const lineItems: SummaryLineItem[] = [];

  const natureOpt = findOption(opts.nature, formData.diamondType);
  if (natureOpt) lineItems.push({ label: 'Diamond Type', value: natureOpt.name, price: natureOpt.price });

  const shapeOpt = findOption(opts.shape, formData.diamondShape);
  if (shapeOpt) lineItems.push({ label: 'Diamond Shape', value: shapeOpt.name, price: shapeOpt.price });
  stoneExtras(formData, opts.shape).forEach(x => lineItems.push({ label: x.label, value: x.value, price: null }));

  const sizeOpt = findOption(opts.size, formData.diamondSize);
  if (sizeOpt) lineItems.push({ label: 'Diamond Size', value: sizeOpt.name, price: sizeOpt.price });

  const qualityOpt = findOption(opts.quality, formData.diamondQuality);
  // Sandbox diamond picker: the exact stone (with certificate) replaces the quality card line.
  const pickedStone = formData.selectedDiamond ?? null;
  const pickedStoneLabel = pickedStone
    ? [formatQuoteDiamondLabel(pickedStone), formatQuoteDiamondCertificate(pickedStone)].filter(Boolean).join(' · ')
    : '';
  if (pickedStone) lineItems.push({ label: 'Diamond', value: pickedStoneLabel, price: pickedStone.price });
  // V3 gemstone picker: the exact stone from the gemstone pool, with its details on the next line.
  const pickedGem = formData.diamondShape === GEMSTONE_SHAPE_VALUE ? formData.selectedGemstone ?? null : null;
  if (pickedGem) {
    const gemRows = quoteGemstoneDetailRows(pickedGem).filter(r => r.label !== 'Gemstone');
    lineItems.push({ label: 'Selected Gemstone', value: formatQuoteGemstoneLabel(pickedGem), price: pickedGem.price });
    if (gemRows.length) lineItems.push({ label: 'Gemstone Details', value: gemRows.map(r => `${r.label}: ${r.value}`).join(' · '), price: null });
  }
  else if (qualityOpt) lineItems.push({ label: 'Diamond Quality', value: qualityOpt.name, price: qualityOpt.price });

  const settingOpt = findOption(opts.setting, formData.diamondSetting);
  if (settingOpt) lineItems.push({ label: 'Ring Setting', value: settingOpt.name, price: settingOpt.price });

  const holderOpt = findOption(opts.holder, formData.diamondHolder);
  if (holderOpt) lineItems.push({ label: 'Stone Holder', value: holderOpt.name, price: holderOpt.price });

  const bandOpt = findOption(opts.band, formData.diamondBand);
  if (bandOpt) lineItems.push({ label: 'Type of Band', value: bandOpt.name, price: bandOpt.price });

  // Band widths (multi-select)
  if (formData.diamondBandWidth.length > 0) {
    formData.diamondBandWidth.forEach(bw => {
      const bwOpt = findOption(opts.bandWidth, bw);
      if (bwOpt) lineItems.push({ label: 'Band Width', value: bwOpt.name, price: bwOpt.price });
    });
  }

  const metalOpt = findOption(opts.metal, formData.diamondMetal);
  if (metalOpt) lineItems.push({ label: 'Ring Metal', value: metalOpt.name, price: metalOpt.price });

  // Two Tone: which two metals are combined (Quote Estimator only).
  if (formData.diamondMetal === 'two-tone') {
    const comboLine = findTwoToneCombo(formData.diamondTwoToneMetals, content?.twoToneCombos, toMetalPriceMap(opts.metal));
    if (comboLine) lineItems.push({ label: 'Two Tone Metals', value: comboLine.name, price: comboLine.price });
  }

  // Karat / purity variant of the chosen metal (Quote Estimator only).
  const metalKaratOpt = findMetalKarat(formData.diamondMetal, formData.diamondMetalKarat, content?.metalKarats);
  if (metalKaratOpt) lineItems.push({ label: 'Metal Karat', value: metalKaratOpt.name, price: metalKaratOpt.price });

  // Personalization (multi-select)
  if (formData.diamondPersonalization.length > 0) {
    formData.diamondPersonalization.forEach(p => {
      const pOpt = findOption(opts.personalization, p);
      if (pOpt) lineItems.push({ label: 'Personalization', value: pOpt.name, price: pOpt.price });
    });
  }

  // Additional info
  if (formData.ringSize) {
    lineItems.push({ label: 'Ring Size', value: formData.ringSize, price: null });
  }
  if (formData.otherDetails) {
    lineItems.push({ label: 'Other Details', value: formData.otherDetails, price: null });
  }
  if (formData.diamondTimeline) {
    const tl = findTimelineOption(formData.diamondTimeline, content?.timelineOptions);
    lineItems.push({ label: 'Timeline', value: tl?.label ?? formData.diamondTimeline, price: tl?.price ?? null });
  }

  const totalPrice = quoteVersion === 'v3' ? quoteV3Breakdown(formData, {
    nature: opts.nature, shape: opts.shape, size: opts.size, quality: opts.quality,
    setting: opts.setting, holder: opts.holder, band: opts.band,
    band_width: opts.bandWidth, metal: opts.metal, personalization: opts.personalization,
  }, content).total : lineItems.reduce((sum, item) => sum + (item.price ?? 0), 0);


  const formatPrice = (price: number) => {
    if (price === 0) return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(0).replace(/[\d.,]/g, '') + '0';
    return '+' + new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(price);
  };

  // Sandbox V3 stays on its own "Saving…" screen until the lead row exists, so
  // the claim screen below always has a lead id to attach the number to.
  if (quoteVersion === 'v3' && showThankYou && saveStatus !== 'saved') {
    return <div className="v3-complete-inner" role="status">Saving your request…</div>;
  }

  // Theme 2 · Glass: the thank-you screen is replaced by the token-driven
  // Claim step. Theme 1 keeps the screen below. Sandbox V3 shows the very same
  // claim screen as Sandbox V2, drawn from V3's own saved palette and copy.
  if (showThankYou && (useGlass || quoteVersion === 'v3')) {
    // Same palette the rest of the form already renders with — passing null
    // here made the claim screen ignore the client's saved colours.
    const glassTheme = resolveQuoteEstimatorTheme(formColors ?? null, content?.theme);
    const contact = formData.contactInfo;
    const ringLines = [
      pickedStone ? pickedStoneLabel : [sizeOpt?.name, qualityOpt?.name].filter(Boolean).join(' · '),
      [metalOpt?.name, settingOpt?.name].filter(Boolean).join(' · '),
    ].filter(Boolean) as string[];
    const handlePhoneConfirmed = async (
      e164: string,
      parts: { countryCode: string; phoneNumber: string },
    ) => {
      const leadId = savedLeadIdRef.current;
      if (!leadId || !clientId) return;
      // Leads cannot be updated anonymously, so a service-role function does
      // the write, scoped to this lead and client. When the number differs
      // from the one given on the contact step, the function also replaces
      // the lead's phone (Leads & Bookings) and pushes it to the CRM contact.
      const { data, error } = await supabase.functions.invoke('claim-quote-credit', {
        body: {
          leadId,
          clientId,
          phone: e164,
          countryCode: parts.countryCode,
          phoneNumber: parts.phoneNumber,
        },
      });
      if (error || (data && (data as any).error)) {
        throw new Error('claim-quote-credit failed');
      }
    };
    return (
      <ClaimStep
        theme={glassTheme}
        firstName={contact?.firstName}
        email={contact?.email}
        shapeName={shapeOpt?.name}
        shapeImageUrl={
          formData.diamondShape
            ? getDiamondShapeIcon(formData.diamondShape) || undefined
            : undefined
        }
        ringLines={ringLines}
        total={totalPrice}
        currency={currency}
        lineItems={lineItems}
        creditAmount={incentiveAmount}
        creditHoldDays={content?.creditHoldDays ?? 7}
        defaultCountryCode={contact?.countryCode || '+1'}
        defaultPhoneNumber={contact?.phoneNumber || ''}
        defaultCountryIso={contact?.countryIso || 'US'}
        bookingUrl={bookingUrl || undefined}
        contactTiles={content?.contactTiles}
        title={content?.thankYouTitle ?? undefined}
        message={content?.thankYouMessage ?? undefined}
        note={formData.diamondType === 'natural' ? copy.thankYouNaturalNote : copy.thankYouLabNote}
        footerNote={content?.claimFooterNote ?? undefined}
        reassuranceNote={content?.claimReassuranceNote ?? undefined}
        followUpNote={content?.claimFollowUpNote ?? undefined}
        smsDisclaimer={content?.claimSmsDisclaimer ?? undefined}
        phoneConfirmNote={content?.claimPhoneConfirmNote ?? undefined}
        creditEyebrow={content?.claimCreditEyebrow ?? undefined}
        creditHeadline={content?.claimCreditHeadline ?? undefined}
        creditHoldLine={content?.claimCreditHoldLine ?? undefined}
        phoneLabel={content?.claimPhoneLabel ?? undefined}
        buttonLabel={content?.claimButtonLabel ?? undefined}
        showCreditPrice={content?.claimShowCreditPrice !== false}
        strikeThroughTotal={content?.claimStrikeThroughTotal !== false}
        onPhoneConfirmed={handlePhoneConfirmed}
      />
    );
  }

  if (showThankYou) {
    return (
      <div className="min-h-[100dvh] md:min-h-0 bg-[#EDE8E3] rounded-lg p-4 md:p-10 flex flex-col items-center text-center overflow-y-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 bg-black rounded-full mb-4 md:mb-6 mt-4 md:mt-8 shrink-0">
          <Heart className="w-8 h-8 md:w-10 md:h-10 text-white fill-white" />
        </div>
        {copy.thankYouTitle && (
          <h2 className="text-2xl md:text-4xl font-bold text-gray-900 mb-2 md:mb-3">
            {copy.thankYouTitle}
          </h2>
        )}
        {copy.thankYouMessage && (
          <p className="text-gray-600 text-sm md:text-lg max-w-md mb-1 md:mb-2">
            {copy.thankYouMessage}
          </p>
        )}
        {(formData.diamondType === 'natural' ? copy.thankYouNaturalNote : copy.thankYouLabNote) && (
          <p className="text-gray-500 text-xs md:text-sm max-w-sm mb-4 md:mb-6">
            {formData.diamondType === 'natural' ? copy.thankYouNaturalNote : copy.thankYouLabNote}
          </p>
        )}

        {/* Incentive Banner — shows the client's text (or the default wording),
            tinting only the money amount(s) with the configured color. Hidden
            when the client cleared the box. */}
        {incentiveMessage && (
          <div className="rounded-xl px-4 py-3 md:px-6 md:py-4 max-w-md w-full mb-4 md:mb-6">
            <p className="text-sm md:text-base font-bold leading-snug text-black whitespace-pre-line">
              {renderIncentive(incentiveMessage)}
            </p>
          </div>
        )}

        {/* Booking Calendar — hidden when the client has no booking URL set */}
        {bookingUrl && (
          <div className="w-full max-w-md mb-4">
            <iframe
              src={bookingUrl}
              className="w-full border-none rounded-lg"
              style={{ height: '700px' }}
              title="Book a consultation"
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] md:min-h-[600px] bg-[#EDE8E3] rounded-lg p-6 md:p-10 relative">
      {/* Header */}
      <div className="text-center mb-8">
        {copy.summaryTitle && (
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
            {copy.summaryTitle}
          </h2>
        )}
        {formData.contactInfo && (
          <p className="text-gray-600 text-sm">
            Prepared for {formData.contactInfo.firstName} • {formData.contactInfo.email}
          </p>
        )}
      </div>

      {/* Summary Table */}
      <div className="max-w-lg mx-auto bg-white rounded-xl overflow-hidden shadow-lg">
        <div className="divide-y divide-gray-100">
          {lineItems.map((item, index) => (
            <div key={index} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 uppercase tracking-wider">{item.label}</p>
                <p className="text-sm font-medium text-gray-800 truncate">{item.value}</p>
              </div>
              {item.price !== null && (
                <span className={`text-sm font-semibold ml-4 shrink-0 ${item.price === 0 ? 'text-gray-400' : 'text-gray-800'}`}>
                  {formatPrice(item.price)}
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Total — background follows the form background (--dtt-bg via the
            .bg-[#EDE8E3] theming token) instead of the white card surface, and
            the text follows the form font color. Falls back to the built-in
            look when no client theme is set. */}
        <div className="border-t-2 border-gray-300 bg-[#EDE8E3] px-5 py-4 flex items-center justify-between">
          <span className="text-base font-bold text-gray-800">Estimated Total</span>
          <span className="text-xl font-bold text-gray-900">
            {new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(totalPrice)}
          </span>
        </div>
      </div>

      {/* Deposit — shown when the Quote Estimator is in deposit mode */}
      {submissionMode === 'deposit' && depositAmount != null && depositAmount > 0 && (
        <div className="max-w-lg mx-auto mt-4 rounded-xl bg-white border-2 border-gray-300 px-5 py-4 text-center">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Deposit to reserve your order</p>
          <p className="text-2xl font-bold text-gray-900">
            {new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(depositAmount)}
          </p>
          <p className="text-gray-500 text-xs mt-1">
            A specialist will confirm your details and send a secure link to place your deposit.
          </p>
        </div>
      )}

      {/* Disclaimer */}
      {copy.summaryDisclaimer && (
        <p className="text-gray-500 text-xs text-center mt-4 max-w-md mx-auto">
          {copy.summaryDisclaimer}
        </p>
      )}

      {/* Actions */}
      <div className="max-w-lg mx-auto mt-6 space-y-3">
        <Button
          onClick={() => setShowThankYou(true)}
          disabled={saveStatus !== 'saved'}
          className="w-full bg-black text-white hover:bg-gray-900 h-14 text-lg font-semibold rounded-lg border border-black disabled:opacity-60"
        >
          {saveStatus === 'saving' ? 'Saving...' : (quoteVersion === 'v3' ? 'View confirmation' : submissionMode === 'deposit' ? 'Reserve My Order' : 'Next')}
        </Button>
        <div className="flex justify-center">
          <Button
            variant="secondary"
            onClick={onBack}
            className="bg-black text-white hover:bg-gray-900 px-6 md:px-8 border border-black"
          >
            Back
          </Button>
        </div>
      </div>
    </div>
  );
};