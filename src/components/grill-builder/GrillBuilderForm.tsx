import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { trackLeadConversion } from '@/lib/conversion-tracking';
import { initMetaPixel, trackMetaEvent } from '@/lib/meta-pixel';
import { trackMetaLead } from '@/lib/meta-lead';
import { WizardDynamicQuestion as WizardDynamicQuestionShared } from '@/components/form-wizard/WizardDynamicQuestion';
import { supabase } from '@/integrations/supabase/client';
import { insertLeadRow } from '@/lib/lead-device';
import { uploadSingleFormImage } from '@/lib/form-image-upload';
import { toast } from 'sonner';
import { extractCheckoutErrorAsync } from '@/lib/checkout-error-utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AiVisionTextarea } from '@/components/form-wizard/AiVisionTextarea';
import { Button } from '@/components/ui/button';
import { Info, Loader2, CheckCircle } from 'lucide-react';
import { FormWizardShell, type WizardStep } from '@/components/form-wizard/FormWizardShell';
import { StepHeading } from '@/components/form-wizard/StepHeading';
import { CardCarousel, type CarouselCard } from '@/components/form-wizard/CardCarousel';
import { WizardOptionGrid } from '@/components/form-wizard/WizardOptionGrid';
import { WizardSelectField } from '@/components/form-wizard/WizardSelectField';
import { TeethSelector } from '@/components/form-wizard/TeethSelector';
import { WizardContactStep, validateContactFields } from '@/components/form-wizard/WizardContactStep';
import { WizardThankYou } from '@/components/form-wizard/WizardThankYou';
import { GrillzThankYou } from '@/components/grill-builder/GrillzThankYou';
import { ThankYouContactButton } from '@/components/form-wizard/ThankYouContactButton';
import { formatPhoneE164 } from '@/lib/form-validation';
import type { ClientGrillConfig, GrillQuestionConfig } from '@/hooks/useClientGrillConfig';
import { deriveShortLabel } from '@/lib/wizard-utils';
import { GRILL_DEFAULT_BUDGET_OPTIONS } from '@/lib/form-defaults';
import { buildQuestionSummaryItems } from '@/lib/question-answer-formatter';
import { getEffectiveAiImageDelivery } from '@/lib/ai-image-delivery';

// CDN-hosted grillz assets
const GRILLZ_CDN = 'https://d2lo9ju43icaaa.cloudfront.net/GrillzBuilder';
// Served as WebP; every <img> that shows these falls back to the .png twin on error.
const extendedFangsImg = `${GRILLZ_CDN}/Extendedfagsgrillztransparentimage.webp`;
const openFaceImg = `${GRILLZ_CDN}/open-face-jwa6P4oA.webp`;

// Metal image map shared with the admin Grillz configurator preview.
import {
  GRILLZ_BASIC_IMAGES as BASIC_IMAGES,
  GRILLZ_ICED_IMAGES as ICED_IMAGES,
  getGrillMetalImage,
  isMasterGrillMetal,
  resolveGrillTypeOptions,
  resolveGrillTypeLabel,
  variantForGrillType,
  sortByMetalOrder,
  resolveGrillMetalImage,
} from '@/lib/grill-metal-images';
import {
  filterEnabledGrillCards,
  resolveGrillEnabledOptions,
} from '@/lib/grill-option-toggles';
import { toWebpImageUrl, fallbackToPngOnError } from '@/lib/webp-image-fallback';

const grillzGold = toWebpImageUrl(BASIC_IMAGES.gold);
const grillzGoldIced = toWebpImageUrl(ICED_IMAGES.gold);

function getMetalImage(metalValue: string, grillzType: string = 'basic'): string | undefined {
  if (!isMasterGrillMetal(metalValue)) return undefined;
  return toWebpImageUrl(getGrillMetalImage(metalValue, variantForGrillType(grillzType)));
}



// --- Fallbacks ---
const FALLBACK_METALS = [
  { value: 'gold', label: 'Gold', color: 'bg-yellow-400', purities: [{ value: '10k', label: '10K Gold' }, { value: '14k', label: '14K Gold' }, { value: '18k', label: '18K Gold' }] },
  { value: 'silver', label: 'Silver', color: 'bg-gradient-to-br from-gray-200 to-gray-400', purities: [{ value: '0.925', label: '0.925 Sterling Silver' }, { value: '0.925-18k-wgp', label: '0.925 Sterling Silver + 18K White Gold Plated' }] },
  { value: 'rose-gold', label: 'Rose Gold', color: 'custom:#B76E79', purities: [{ value: '10k-rose', label: '10K Rose Gold' }, { value: '14k-rose', label: '14K Rose Gold' }, { value: '18k-rose', label: '18K Rose Gold' }] },
];


// --- Types ---
interface GrillBuilderFormProps {
  config?: ClientGrillConfig | null;
  clientId?: string;
  metaPixelId?: string | null;
}

// --- Theme helper ---
function useWizardTheme(config?: ClientGrillConfig | null) {
  const colors = config?.form_colors;
  return {
    bg: colors?.background || '#0a0a0a',
    font: colors?.fontColor || '#ffffff',
    accent: colors?.tabBorder || '#77bb41',
    submitBg: colors?.submitButtonBg || undefined,
    submitText: colors?.submitButtonText || undefined,
  };
}

// Preload all grillz images on mount so they're fully decoded before display
const ALL_GRILLZ_IMAGES = [
  ...Object.values(BASIC_IMAGES),
  ...Object.values(ICED_IMAGES),
  extendedFangsImg,
  openFaceImg,
];


export function GrillBuilderForm({ config, clientId, metaPixelId }: GrillBuilderFormProps) {
  const theme = useWizardTheme(config);
  const submissionMode = config?.submission_mode || 'contact';
  const depositAmount = config?.deposit_amount || null;
  const isDepositMode = submissionMode === 'deposit' && !!depositAmount;
  const metals = sortByMetalOrder(
    config?.enabled_metals?.length ? config.enabled_metals : FALLBACK_METALS,
    (config as any)?.metal_order,
  );
  const questions = config?.questions || [];
  const budgetOptions: string[] = (config?.budget_options as string[] | null)?.length
    ? (config.budget_options as string[])
    : [...GRILL_DEFAULT_BUDGET_OPTIONS];
  const enabledSteps = config?.enabled_steps;
  const stepLabels = config?.step_labels;
  const stepOrder = config?.step_order;
  // Per-option card toggles (Fangs / Open Faced) — absent flag means enabled.
  const enabledOptions = useMemo(
    () => resolveGrillEnabledOptions((config as any)?.enabled_options),
    [config],
  );

  // I4: Preload grillz images on mount (moved from module-level side effect)
  useEffect(() => {
    ALL_GRILLZ_IMAGES.forEach((src) => {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
    });
  }, []);

  // Init pixel and fire ViewContent once when metaPixelId is available
  const viewContentFired = useRef(false);
  useEffect(() => {
    if (metaPixelId) {
      initMetaPixel(metaPixelId);
    }
    if (!viewContentFired.current) {
      viewContentFired.current = true;
      trackMetaEvent('ViewContent', { content_name: 'Grillz Builder', content_category: 'form' });
    }
  }, [metaPixelId]);

  function isStepEnabled(key: string): boolean {
    if (!enabledSteps) return true;
    return enabledSteps[key] !== false;
  }

  function getLabel(key: string, defaultPre: string, defaultHighlight: string, defaultSubtitle?: string): { preText: string; highlightText: string; subtitle?: string } {
    const custom = stepLabels?.[key];
    if (custom?.title) {
      const words = custom.title.trim().split(/\s+/);
      const highlight = words.pop() || custom.title;
      const pre = words.join(' ');
      return { preText: pre, highlightText: highlight, subtitle: custom.subtitle || defaultSubtitle };
    }
    return { preText: defaultPre, highlightText: defaultHighlight, subtitle: custom?.subtitle || defaultSubtitle };
  }

  // L8: ref guard — prevents double-submit even in the render-cycle gap before isSubmitting re-renders
  const isSubmittingRef = useRef(false);

  // State
  const [currentStep, setCurrentStep] = useState(0);
  const [grillzType, setGrillzType] = useState<string>('');
  const [metalType, setMetalType] = useState('');
  const [purity, setPurity] = useState('');
  const [topTeeth, setTopTeeth] = useState('');
  const [bottomTeeth, setBottomTeeth] = useState('');
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, boolean | null>>({});
  const [questionTexts, setQuestionTexts] = useState<Record<string, string>>({});
  const [questionFileUrls, setQuestionFileUrls] = useState<Record<string, string>>({});
  const [questionFileNames, setQuestionFileNames] = useState<Record<string, string>>({});
  const [questionFileUploading, setQuestionFileUploading] = useState<Record<string, boolean>>({});
  const [engravingText, setEngravingText] = useState('');
  const [descriptionText, setDescriptionText] = useState('');
  const [inspirationUrl, setInspirationUrl] = useState<string | null>(null);
  const [inspirationFileName, setInspirationFileName] = useState<string | null>(null);
  const [inspirationUploading, setInspirationUploading] = useState(false);
  const [budget, setBudget] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedLeadId, setSubmittedLeadId] = useState<string | null>(null);
  const [deferredCheckoutAttributes, setDeferredCheckoutAttributes] = useState<Record<string, string> | null>(null);
  const [storedNotifDetails, setStoredNotifDetails] = useState<Record<string, string>>({});

  // Contact state
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactCountryCode, setContactCountryCode] = useState('+1');
  const [contactPhone, setContactPhone] = useState('');
  const [contactCountryIso, setContactCountryIso] = useState('US');
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [termsUrl, setTermsUrl] = useState('');
  const [privacyUrl, setPrivacyUrl] = useState('');

  const currentMetal = metals.find(m => m.value === metalType);
  const availablePurities = currentMetal?.purities || [];
  const effectiveClientId = clientId || config?.client_id;

  // Fetch client company name, terms URL, and privacy URL
  useEffect(() => {
    if (!effectiveClientId) return;
    supabase.from('clients').select('company_name, terms_url, privacy_url').eq('id', effectiveClientId).single()
      .then(({ data }) => {
        if (data) {
          setCompanyName(data.company_name || '');
          setTermsUrl(data.terms_url || '');
          setPrivacyUrl((data as any).privacy_url || '');
        }
      });
  }, [effectiveClientId]);

  // Fallback question state
  const [fallbackAnswers, setFallbackAnswers] = useState<Record<string, boolean | null>>({});
  const [fallbackCustomMessage, setFallbackCustomMessage] = useState('');
  const [fallbackLogoUrl, setFallbackLogoUrl] = useState<string | null>(null);
  const [fallbackLogoFileName, setFallbackLogoFileName] = useState<string | null>(null);
  const [fallbackLogoUploading, setFallbackLogoUploading] = useState(false);

  // Resolve the displayed image for a given metal value: client override wins,
  // then master CDN image (master metals only). Custom metals without an
  // override fall back to a neutral placeholder — never another metal's image.
  const resolveMetalImage = (metalValue: string): string => {
    const resolved = resolveGrillMetalImage({
      metalValue,
      grillzType,
      overrides: (config as any)?.option_image_overrides,
    });
    return toWebpImageUrl(resolved) || grillzGold; // neutral last-resort placeholder
  };

  // Metal carousel cards — depend on grillzType; prefer client-uploaded override
  const metalCards: CarouselCard[] = useMemo(() =>
    metals.map(m => ({
      value: m.value,
      label: m.label,
      image: resolveMetalImage(m.value),
    })),
    [metals, grillzType, config]
  );


  // Type selection options — client-configured (falls back to the two built-ins)
  const grillTypeOptions = useMemo(
    () => resolveGrillTypeOptions((config as any)?.grill_type_options).filter(o => o.is_enabled),
    [config]
  );

  // Type selection cards — prefer client-uploaded override
  const typeCards: CarouselCard[] = useMemo(() => {
    const typeOverrides = (config as any)?.option_image_overrides?.type || {};
    return grillTypeOptions.map(o => ({
      value: o.value,
      label: o.label,
      image: typeOverrides[o.value] || (o.value === 'iced-out' ? grillzGoldIced : grillzGold),
    }));
  }, [config, grillTypeOptions]);


  // Auto-advance helper
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // K6: memoize cards that depend on metalType/grillzType to avoid recreating on every render.
  // IMPORTANT: These MUST be declared before any conditional early-return (e.g. the
  // submitted/thank-you branches below) — otherwise the hook count drops between the
  // pre-submit and post-submit renders and React throws error #300
  // ("Rendered fewer hooks than expected").
  const fangsCards: CarouselCard[] = useMemo(() => {
    const yesOverride = (config as any)?.option_image_overrides?.fangs?.yes;
    return filterEnabledGrillCards([
      { value: 'yes', label: 'Yes', image: yesOverride || extendedFangsImg },
      { value: 'no', label: 'No', image: resolveMetalImage(metalType) },
    ], enabledOptions, 'fangs');
  }, [metalType, grillzType, config, enabledOptions]);

  const openFacedCards: CarouselCard[] = useMemo(() => {
    const yesOverride = (config as any)?.option_image_overrides?.open_faced?.yes;
    return filterEnabledGrillCards([
      { value: 'yes', label: 'Yes', image: yesOverride || openFaceImg },
      { value: 'no', label: 'No', image: resolveMetalImage(metalType) },
    ], enabledOptions, 'open_faced');
  }, [metalType, grillzType, config, enabledOptions]);

  const autoAdvance = () => {
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    autoAdvanceTimer.current = setTimeout(() => {
      setCurrentStep(prev => prev + 1);
    }, 450);
  };
  useEffect(() => {
    return () => { if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current); };
  }, []);

  // Reset handler
  const handleReset = useCallback(() => {
    setSubmitted(false);
    setSubmittedLeadId(null);
    setCurrentStep(0);
    setGrillzType('');
    setMetalType('');
    setPurity('');
    setTopTeeth('');
    setBottomTeeth('');
    setQuestionAnswers({});
    setQuestionTexts({});
    setQuestionFileUrls({}); setQuestionFileNames({}); setQuestionFileUploading({});
    setEngravingText('');
    setDescriptionText('');
    setInspirationUrl(null); setInspirationFileName(null); setInspirationUploading(false);
    setBudget('');
    setFallbackAnswers({});
    setFallbackCustomMessage('');
    setFallbackLogoUrl(null); setFallbackLogoFileName(null); setFallbackLogoUploading(false);
    setContactName('');
    setContactEmail('');
    setContactCountryCode('+1');
    setContactPhone('');
    setContactCountryIso('US');
    setContactErrors({});
    setTermsAccepted(false);
  }, []);

  // L7: retry wrapper — fire-and-forget notifications with exponential backoff (non-blocking)
  const invokeWithRetry = useCallback((fnName: string, body: Record<string, any>, retries = 2, delayMs = 1000): void => {
    const attempt = (n: number) => {
      supabase.functions.invoke(fnName, { body }).catch(err => {
        if (n < retries) {
          setTimeout(() => attempt(n + 1), delayMs * (n + 1));
        } else {
          console.error(`${fnName} failed after ${retries + 1} attempts:`, err);
        }
      });
    };
    attempt(0);
  }, []);

  // --- Submit ---
  const handleSubmit = async () => {
    if (!effectiveClientId) {
      toast.error('Configuration error — no client ID');
      return;
    }
    // L8: synchronous double-submit guard (ref check runs before first React re-render)
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    try {
      const allAnswers: Record<string, any> = {};
      if (questions.length > 0) {
        questions.forEach(q => {
          allAnswers[q.question_key] = {
            answer: questionAnswers[q.question_key] ?? null,
            text: questionTexts[q.question_key] || null,
            type: q.question_type,
          };
        });
      } else {
        allAnswers.custom_message = { answer: null, text: fallbackCustomMessage || null };
        allAnswers.iced_out = { answer: fallbackAnswers.iced_out ?? null };
        allAnswers.fangs = { answer: fallbackAnswers.fangs ?? null };
        allAnswers.open_faced = { answer: fallbackAnswers.open_faced ?? null };
      }

      const formattedPhone = formatPhoneE164(contactCountryCode, contactPhone);

      // Collect already-uploaded image URLs
      const imageUrls = [
        ...(inspirationUrl ? [inspirationUrl] : []),
        ...(fallbackLogoUrl ? [fallbackLogoUrl] : []),
        ...Object.values(questionFileUrls),
      ];

      const leadId = crypto.randomUUID();
      const { error } = await insertLeadRow('grill_form_leads', {
        id: leadId,
        client_id: effectiveClientId,
        // Built-ins keep their legacy slug ('basic' / 'iced-out'); custom options
        // store their human label so lead views show exactly what the client named it.
        grillz_type: grillzType
          ? (grillzType === 'basic' || grillzType === 'iced-out'
              ? grillzType
              : resolveGrillTypeLabel(grillzType, grillTypeOptions))
          : null,
        metal_type: metalType,
        metal_purity: purity || null,
        top_teeth: topTeeth || 'none',
        bottom_teeth: bottomTeeth || 'none',
        question_answers: allAnswers,
        additional_notes: descriptionText || null,
        engraving_text: engravingText || null,
        budget: budget || null,
        customer_name: contactName,
        customer_email: contactEmail,
        customer_phone: formattedPhone,
        uploaded_image_urls: imageUrls.length > 0 ? imageUrls : null,
      });
      if (error) throw error;

      // Fire-and-forget lead notification email
      const notifDetails: Record<string, string> = {};
      if (grillzType) notifDetails['Type'] = resolveGrillTypeLabel(grillzType, grillTypeOptions);
      if (metalType) notifDetails['Metal Type'] = currentMetal?.label || metalType;
      if (purity) notifDetails['Purity'] = availablePurities.find(p => p.value === purity)?.label || purity;
      notifDetails['Top Teeth'] = topTeeth && topTeeth !== 'none' ? topTeeth : 'None';
      notifDetails['Bottom Teeth'] = bottomTeeth && bottomTeeth !== 'none' ? bottomTeeth : 'None';
      if (budget) notifDetails['Budget'] = budget;
      if (engravingText) notifDetails['Personalized Inscription'] = engravingText;
      if (descriptionText) notifDetails['Vision / Description'] = descriptionText;
      if (inspirationUrl) notifDetails['Inspiration Image'] = inspirationUrl;
      const grillzQaSummary = buildQuestionSummaryItems(questions, questionAnswers, questionTexts, questionFileUrls);
      grillzQaSummary.forEach(({ label, value }) => { notifDetails[label] = value; });
      if (questions.length === 0) {
        if (fallbackAnswers.fangs != null) notifDetails['Fangs'] = fallbackAnswers.fangs ? 'Yes' : 'No';
        if (fallbackAnswers.open_faced != null) notifDetails['Open Faced'] = fallbackAnswers.open_faced ? 'Yes' : 'No';
        if (fallbackCustomMessage) notifDetails['Custom Message'] = fallbackCustomMessage;
      }
      // L7: use retry wrapper — up to 3 attempts with backoff, non-blocking
      invokeWithRetry('notify-form-lead', {
        client_id: effectiveClientId,
        form_type: 'grillz',
        customer_name: contactName,
        customer_email: contactEmail,
        customer_phone: formattedPhone,
        details: notifDetails,
      });

      // Customer confirmation email — sent unless the AI render is delivered by
      // email (the render email then carries the submission summary instead).
      if (!config?.ai_image_enabled || getEffectiveAiImageDelivery(config.ai_image_delivery, contactEmail) !== 'email') {
        invokeWithRetry('notify-customer-confirmation', {
          client_id: effectiveClientId,
          form_type: 'grillz',
          customer_name: contactName,
          customer_email: contactEmail,
          details: notifDetails,
        });
      }

      // Conversion tracking fires BEFORE any deposit checkout redirect —
      // otherwise deposit accounts never report the lead (the redirect returns
      // out of this handler).
      trackMetaLead({
        clientId: effectiveClientId,
        eventId: leadId,
        userData: { email: contactEmail, phone: formattedPhone, firstName: contactName, externalId: contactEmail },
        customData: { content_name: 'Grillz Builder', content_category: 'form' },
      });
      trackLeadConversion('grillz_builder', { email: contactEmail, phone: formattedPhone, leadId });

      if (isDepositMode) {
        const attributes: Record<string, string> = {};
        if (metalType) attributes['Metal Type'] = currentMetal?.label || metalType;
        if (purity) attributes['Purity'] = availablePurities.find(p => p.value === purity)?.label || purity;
        attributes['Top Teeth'] = topTeeth === 'none' || !topTeeth ? 'No Top' : topTeeth;
        attributes['Bottom Teeth'] = bottomTeeth === 'none' || !bottomTeeth ? 'No Bottom' : bottomTeeth;
        if (budget) attributes['Estimated Budget'] = budget;
        attributes['Customer Name'] = contactName;
        attributes['Customer Email'] = contactEmail;
        attributes['Customer Phone'] = formattedPhone;
        if (descriptionText) attributes['Vision / Description'] = descriptionText;
        if (engravingText) attributes['Personalized Inscription'] = engravingText;
        if (inspirationUrl) attributes['Inspiration Image'] = inspirationUrl;
        buildQuestionSummaryItems(questions, questionAnswers, questionTexts, questionFileUrls)
          .forEach(({ label, value }) => { attributes[label] = value; });
        Object.entries(questionFileUrls).forEach(([key, fileUrl]) => {
          const q = questions.find(qq => qq.question_key === key);
          if (q && fileUrl) attributes[`${q.question_text} (file)`] = fileUrl;
        });
        if (questions.length === 0) {
          
          if (fallbackAnswers.fangs != null) attributes['Fangs'] = fallbackAnswers.fangs ? 'Yes' : 'No';
          if (fallbackAnswers.open_faced != null) attributes['Open Faced'] = fallbackAnswers.open_faced ? 'Yes' : 'No';
          if (fallbackCustomMessage) attributes['Custom Message'] = fallbackCustomMessage;
        }

        if (config?.ai_image_enabled) {
          // Defer checkout — show AI render first, then checkout button
          setDeferredCheckoutAttributes(attributes);
        } else {
          try {
            const { data, error: checkoutError } = await supabase.functions.invoke('shopify-form-checkout', {
              body: { clientId: effectiveClientId, formType: 'grillz', attributes }
            });
            if (checkoutError) {
              const msg = await extractCheckoutErrorAsync(checkoutError, 'Could not redirect to checkout. Your design was saved.');
              toast.error(msg);
              return;
            }
            if (data?.error) { toast.error(data.error); return; }
            if (data?.checkoutUrl) {
              try { if (window.top) window.top.location.href = data.checkoutUrl; else window.location.href = data.checkoutUrl; } catch { window.location.href = data.checkoutUrl; }
              return;
            }
          } catch (checkoutErr: any) {
            console.error('Checkout redirect error:', checkoutErr);
            const errMsg = await extractCheckoutErrorAsync(checkoutErr, 'Could not redirect to checkout. Your design was saved.');
            toast.error(errMsg);
          }
        }
      }

      setStoredNotifDetails(notifDetails);
      setSubmittedLeadId(leadId);
      setSubmitted(true);
    } catch (err: any) {
      console.error('Submit error:', err);
      toast.error('Failed to submit design. Please try again.');
    } finally {
      setSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  // --- Thank you screen ---
  if (submitted && submittedLeadId && effectiveClientId) {
    // Determine fangs/openFaced from either questions or fallback
    const fangsVal = questions.length > 0 ? questionAnswers.fangs : fallbackAnswers.fangs;
    const openFacedVal = questions.length > 0 ? questionAnswers.open_faced : fallbackAnswers.open_faced;
    const customMsgVal = questions.length > 0
      ? (questionTexts.custom_message || undefined)
      : (fallbackCustomMessage || undefined);

    // Rebuild question answers map for AI generation
    const qaMap: Record<string, any> = {};
    if (questions.length > 0) {
      questions.forEach(q => {
        qaMap[q.question_key] = {
          answer: questionAnswers[q.question_key] ?? null,
          text: questionTexts[q.question_key] || null,
          type: q.question_type,
        };
      });
    } else {
      qaMap.custom_message = { answer: null, text: fallbackCustomMessage || null };
      qaMap.iced_out = { answer: fallbackAnswers.iced_out ?? null };
      qaMap.fangs = { answer: fallbackAnswers.fangs ?? null };
      qaMap.open_faced = { answer: fallbackAnswers.open_faced ?? null };
    }

    if (config?.ai_image_enabled) {
      return (
        <GrillzThankYou
          onReset={handleReset}
          backgroundColor={theme.bg}
          fontColor={theme.font}
          accentColor={theme.accent}
          leadId={submittedLeadId}
          clientId={effectiveClientId}
          customerName={contactName}
          customerEmail={contactEmail}
          grillzConfig={{
            metalType,
            metalPurity: purity || undefined,
            grillzType: variantForGrillType(grillzType),
            topTeeth: topTeeth || 'none',
            bottomTeeth: bottomTeeth || 'none',
            fangs: fangsVal === true,
            openFaced: openFacedVal === true,
            customMessage: customMsgVal,
            engraving: engravingText || undefined,
            description: descriptionText || undefined,
            inspirationUrl: inspirationUrl || undefined,
            budget: budget || undefined,
            ...(Object.keys(qaMap).length > 0 ? { questionAnswers: qaMap } : {}),
          }}
          depositAmount={deferredCheckoutAttributes ? (depositAmount || undefined) : undefined}
          checkoutAttributes={deferredCheckoutAttributes || undefined}
          formType="grillz"
          submissionDetails={storedNotifDetails}
          extraSummaryItems={buildQuestionSummaryItems(questions, questionAnswers, questionTexts, questionFileUrls)}
          thankYouContact={config?.thank_you_contact}
          delivery={getEffectiveAiImageDelivery(config?.ai_image_delivery, contactEmail)}
        />
      );
    }

    const baseSummary = [
      { label: 'Type', value: resolveGrillTypeLabel(grillzType, grillTypeOptions) },
      { label: 'Metal', value: currentMetal?.label || metalType || '' },
      { label: 'Purity', value: availablePurities.find(p => p.value === purity)?.label || purity || '' },
      { label: 'Top Teeth', value: topTeeth && topTeeth !== 'none' ? topTeeth : '' },
      { label: 'Bottom Teeth', value: bottomTeeth && bottomTeeth !== 'none' ? bottomTeeth : '' },
      { label: 'Fangs', value: fangsVal === true ? 'Yes' : '' },
      { label: 'Open Face', value: openFacedVal === true ? 'Yes' : '' },
      { label: 'Budget', value: budget || '' },
      { label: 'Engraving', value: engravingText || '' },
      { label: 'Vision / Description', value: descriptionText || '' },
    ].filter(i => i.value);
    const seenSummary = new Set(baseSummary.map(i => i.label.toLowerCase()));
    const extraSummary = buildQuestionSummaryItems(questions, questionAnswers, questionTexts, questionFileUrls)
      .filter(i => i.value && !seenSummary.has(i.label.toLowerCase()));
    const summaryItems = [...baseSummary, ...extraSummary];
    return (
      <WizardThankYou
        onReset={handleReset}
        backgroundColor={theme.bg}
        fontColor={theme.font}
        accentColor={theme.accent}
        summaryItems={summaryItems}
        thankYouContact={config?.thank_you_contact}
      />
    );
  }

  if (submitted) {
    return (
      <div
        className="h-screen flex flex-col items-center justify-center space-y-5 animate-fade-in"
        style={{ backgroundColor: theme.bg, color: theme.font }}
      >
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg"
          style={{ backgroundColor: theme.accent }}
        >
          <CheckCircle className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-3xl font-bold tracking-tight">Thank You!</h2>
        <p
          className="text-sm text-center max-w-md px-4 leading-relaxed"
          style={{ color: `${theme.font}99` }}
        >
          Thanks for contacting us! We have received your inquiry and will be in
          touch with you shortly.
        </p>
        <ThankYouContactButton contact={config?.thank_you_contact} accentColor={theme.accent} className="px-4" />
      </div>
    );
  }

  // fangsCards / openFacedCards are declared above (must stay before early returns).

  // --- Build steps ---
  const steps: WizardStep[] = [];

  // Step 1: Type
  if (isStepEnabled('type')) {
    steps.push({
      key: 'type',
      label: 'TYPE',
      content: (
        <div className="space-y-6">
          <StepHeading {...getLabel('type', 'CHOOSE YOUR', 'STYLE', 'What type of grillz do you want?')} accentColor={theme.accent} fontColor={theme.font} />
          <CardCarousel cards={typeCards} selectedValue={grillzType} onSelect={(v) => { setGrillzType(v); autoAdvance(); }} accentColor={theme.accent} fontColor={theme.font} />
        </div>
      ),
    });
  }

  // Step 2: Metal
  if (isStepEnabled('metal')) {
    steps.push({
      key: 'metal',
      label: 'METAL',
      content: (
        <div className="space-y-6">
          <StepHeading {...getLabel('metal', 'CHOOSE YOUR', 'METAL', 'Select the metal color for your grillz')} accentColor={theme.accent} fontColor={theme.font} />
          <CardCarousel cards={metalCards} selectedValue={metalType} onSelect={(v) => { setMetalType(v); setPurity(''); autoAdvance(); }} accentColor={theme.accent} fontColor={theme.font} />
        </div>
      ),
    });
  }

  // Step 3: Teeth
  if (isStepEnabled('teeth')) {
    steps.push({
      key: 'teeth',
      label: 'TEETH',
      content: (
        <div className="space-y-6">
          <StepHeading {...getLabel('teeth', 'SELECT YOUR', 'TEETH', 'How many teeth do you want?')} accentColor={theme.accent} fontColor={theme.font} />
          <TeethSelector
            topTeeth={topTeeth}
            bottomTeeth={bottomTeeth}
            onTopTeethChange={setTopTeeth}
            onBottomTeethChange={setBottomTeeth}
            metalType={metalType}
            accentColor={theme.accent}
            fontColor={theme.font}
          />
        </div>
      ),
    });
  }

  // Step 4: Fangs
  if (isStepEnabled('fangs')) {
    steps.push({
      key: 'fangs',
      label: 'FANGS',
      content: (
        <div className="space-y-6">
          <StepHeading {...getLabel('fangs', 'WANT EXTENDED', 'FANGS', 'Would you like extended fangs on your grillz?')} accentColor={theme.accent} fontColor={theme.font} />
          <CardCarousel
            cards={fangsCards}
            selectedValue={
              questions.length > 0
                ? (questionAnswers.fangs === true ? 'yes' : questionAnswers.fangs === false ? 'no' : '')
                : (fallbackAnswers.fangs === true ? 'yes' : fallbackAnswers.fangs === false ? 'no' : '')
            }
            onSelect={(v) => {
              const boolVal = v === 'yes';
              if (questions.length > 0) {
                setQuestionAnswers(prev => ({ ...prev, fangs: boolVal }));
              } else {
                setFallbackAnswers(prev => ({ ...prev, fangs: boolVal }));
              }
              autoAdvance();
            }}
            accentColor={theme.accent}
            fontColor={theme.font}
          />
        </div>
      ),
    });
  }

  // Step 5: Open Faced
  if (isStepEnabled('open_faced')) {
    steps.push({
      key: 'open_faced',
      label: 'OPEN FACE',
      content: (
        <div className="space-y-6">
          <StepHeading {...getLabel('open_faced', 'DO YOU WANT', 'OPEN FACED', 'Would you like your grillz open faced?')} accentColor={theme.accent} fontColor={theme.font} />
          <CardCarousel
            cards={openFacedCards}
            selectedValue={
              questions.length > 0
                ? (questionAnswers.open_faced === true ? 'yes' : questionAnswers.open_faced === false ? 'no' : '')
                : (fallbackAnswers.open_faced === true ? 'yes' : fallbackAnswers.open_faced === false ? 'no' : '')
            }
            onSelect={(v) => {
              const boolVal = v === 'yes';
              if (questions.length > 0) {
                setQuestionAnswers(prev => ({ ...prev, open_faced: boolVal }));
              } else {
                setFallbackAnswers(prev => ({ ...prev, open_faced: boolVal }));
              }
              autoAdvance();
            }}
            accentColor={theme.accent}
            fontColor={theme.font}
          />
        </div>
      ),
    });
  }


  // Step: Custom questions — render each as its own step
  // L4: use is_default flag instead of a hardcoded key allowlist so new promoted steps never silently vanish
  {
    const customQuestions = questions.filter(q => !q.is_default);
    if (customQuestions.length > 0) {
      customQuestions.forEach(q => {
        const words = q.question_text.trim().split(/\s+/);
        const highlight = words.pop() || q.question_text;
        const pre = words.join(' ');

        steps.push({
          key: `custom_q_${q.question_key}`,
          label: stepLabels?.[`custom_q_${q.question_key}`]?.shortLabel?.trim() || deriveShortLabel(q.question_text),
          content: (
            <div className="space-y-6">
              <StepHeading
                preText={pre.toUpperCase()}
                highlightText={highlight.toUpperCase()}
                subtitle={(q as any).subtitle || undefined}
                accentColor={theme.accent}
                fontColor={theme.font}
              />
              <div className="max-w-lg mx-auto w-full px-4 md:px-8 space-y-5">
                <GrillzDynamicQuestion
                  overrides={(config as any)?.option_image_overrides}
                  hideLabel
                  question={q}
                  answer={questionAnswers[q.question_key] ?? null}
                  textValue={questionTexts[q.question_key] || ''}
                  fileUrl={questionFileUrls[q.question_key] || null}
                  fileName={questionFileNames[q.question_key] || null}
                  isFileUploading={!!questionFileUploading[q.question_key]}
                  onAnswerChange={val => setQuestionAnswers(prev => ({ ...prev, [q.question_key]: val }))}
                  onTextChange={val => setQuestionTexts(prev => ({ ...prev, [q.question_key]: val }))}
                  onFileSelect={async (file) => {
                    if (!file || !effectiveClientId) return;
                    setQuestionFileUploading(prev => ({ ...prev, [q.question_key]: true }));
                    const url = await uploadSingleFormImage(effectiveClientId, file);
                    setQuestionFileUploading(prev => ({ ...prev, [q.question_key]: false }));
                    if (url) {
                      setQuestionFileUrls(prev => ({ ...prev, [q.question_key]: url }));
                      setQuestionFileNames(prev => ({ ...prev, [q.question_key]: file.name }));
                    } else {
                      toast.error('Failed to upload file');
                    }
                  }}
                  accentColor={theme.accent}
                  fontColor={theme.font}
                  metalType={metalType}
                  grillzType={grillzType || undefined}
                />
              </div>
            </div>
          ),
        });
      });
    }
  }

  // Step: Describe Your Vision
  if (isStepEnabled('description')) {
    steps.push({
      key: 'description',
      label: 'VISION',
      content: (
        <div className="space-y-6">
          <StepHeading {...getLabel('description', 'DESCRIBE YOUR', 'VISION', 'Tell us about your dream piece')} accentColor={theme.accent} fontColor={theme.font} />
          <div className="max-w-lg mx-auto w-full px-4 md:px-8 space-y-5">
            <AiVisionTextarea
              label="Describe your vision"
              value={descriptionText}
              onChange={setDescriptionText}
              placeholder="Describe your dream piece..."
              rows={3}
              maxLength={500}
              accentColor={theme.accent}
              fontColor={theme.font}
            />
          </div>
        </div>
      ),
    });
  }

  // Step: Upload Inspiration Image
  if (isStepEnabled('inspiration')) {
    steps.push({
      key: 'inspiration',
      label: 'INSPIRATION',
      content: (
        <div className="space-y-6">
          <StepHeading {...getLabel('inspiration', 'UPLOAD', 'INSPIRATION', 'Share a photo or screenshot of what you\'re looking for')} accentColor={theme.accent} fontColor={theme.font} />
          <div className="max-w-lg mx-auto w-full px-4 md:px-8 space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold uppercase tracking-wider" style={{ color: `${theme.font}99` }}>
                {stepLabels?.inspiration?.title || 'Upload Inspiration Image'}
              </Label>
              <p className="text-xs" style={{ color: `${theme.font}60` }}>Example Photo, Screenshot, Similar</p>
              <Input type="file" accept="image/*" onChange={async e => {
                const file = e.target.files?.[0];
                if (!file || !effectiveClientId) return;
                setInspirationUploading(true);
                const url = await uploadSingleFormImage(effectiveClientId, file);
                setInspirationUploading(false);
                if (url) {
                  setInspirationUrl(url);
                  setInspirationFileName(file.name);
                } else {
                  toast.error('Failed to upload image');
                }
              }} className="cursor-pointer bg-transparent border-2 rounded-xl file:text-current" style={{ backgroundColor: 'transparent', color: theme.font, borderColor: `${theme.font}26` }} />
              {inspirationUploading && (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" style={{ color: theme.accent }} />
                  <p className="text-xs" style={{ color: `${theme.font}80` }}>Uploading...</p>
                </div>
              )}
              {inspirationFileName && !inspirationUploading && (
                <p className="text-xs" style={{ color: `${theme.font}80` }}>✓ {inspirationFileName}</p>
              )}
            </div>
          </div>
        </div>
      ),
    });
  }

  // Step: Engraving Text
  if (isStepEnabled('engraving')) {
    steps.push({
      key: 'engraving',
      label: 'INSCRIPTION',
      content: (
        <div className="space-y-6">
          <StepHeading {...getLabel('engraving', 'PERSONALIZED', 'INSCRIPTION', 'Optional: add text to engrave')} accentColor={theme.accent} fontColor={theme.font} />
          <div className="max-w-lg mx-auto w-full px-4 md:px-8 space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold uppercase tracking-wider" style={{ color: `${theme.font}99` }}>
                {stepLabels?.engraving?.title || 'Personalized Inscription'} <span className="text-xs font-normal normal-case">(Optional)</span>
              </Label>
              <Input
                value={engravingText}
                onChange={e => { if (e.target.value.length <= 30) setEngravingText(e.target.value); }}
                placeholder="e.g. King, Mia, J&M"
                maxLength={30}
                className="text-sm bg-transparent border-2 rounded-xl"
                style={{ backgroundColor: 'transparent', color: theme.font, borderColor: `${theme.font}26` }}
              />
              {engravingText && (
                <p className="text-xs text-right" style={{ color: `${theme.font}60` }}>{engravingText.length}/30</p>
              )}
            </div>
          </div>
        </div>
      ),
    });
  }


  // Step 7: Contact
  steps.push({
    key: 'contact',
    label: 'CONTACT',
    content: (
      <WizardContactStep
        name={contactName}
        email={contactEmail}
        countryCode={contactCountryCode}
        phoneNumber={contactPhone}
        countryIso={contactCountryIso}
        onNameChange={setContactName}
        onEmailChange={setContactEmail}
        onCountryCodeChange={setContactCountryCode}
        onPhoneNumberChange={setContactPhone}
        onCountryIsoChange={setContactCountryIso}
        errors={contactErrors}
        accentColor={theme.accent}
        fontColor={theme.font}
        requiredFields={config?.required_contact_fields}
        termsAccepted={termsAccepted}
        onTermsChange={setTermsAccepted}
        companyName={companyName}
        termsUrl={termsUrl}
        privacyUrl={privacyUrl}
      />
    ),
  });

  // Review step removed — contact is now the last step

  // Sort steps by step_order if configured (BEFORE navigation labels so reorder reflects)
  const sortedSteps = stepOrder
    ? [...steps].sort((a, b) => {
        const ai = stepOrder.indexOf(a.key);
        const bi = stepOrder.indexOf(b.key);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      })
    : steps;

  // --- Navigation (driven by sortedSteps) ---
  const isContactStep = sortedSteps[currentStep]?.key === 'contact';
  const isQuestionsStep = sortedSteps[currentStep]?.key === 'questions';
  const isLastStep = isContactStep;
  // L6: gate only on fields the jeweler actually marked required — not always all three
  const requiredContactConfig = config?.required_contact_fields || { name: true, email: true, phone: true };
  const contactHasValues =
    (!requiredContactConfig.name || !!contactName.trim()) &&
    (!requiredContactConfig.email || !!contactEmail.trim()) &&
    (!requiredContactConfig.phone || !!contactPhone.trim());

  // L10: use is_default flag — excludes fangs/open_faced/engraving etc. that have dedicated steps
  // so adding a new promoted default never silently breaks required validation
  const allRequiredQuestionsAnswered = questions
    .filter(q => q.is_required && q.is_enabled && !q.is_default)
    .every(q => {
      if (q.question_type === 'file') return !!questionFileUrls[q.question_key];
      if (q.question_type === 'text') return !!questionTexts[q.question_key]?.trim();
      if (q.question_type === 'dropdown' || q.question_type === 'custom_options') return !!questionTexts[q.question_key];
      return questionAnswers[q.question_key] !== null && questionAnswers[q.question_key] !== undefined;
    });

  const getNextLabel = () => {
    if (isContactStep) {
      return 'GENERATE AI RENDER >';
    }
    return 'NEXT';
  };

  const getSelectedLabel = () => {
    const stepKey = sortedSteps[currentStep]?.key;
    if (stepKey === 'type' && grillzType) return `${resolveGrillTypeLabel(grillzType, grillTypeOptions).toUpperCase()} SELECTED`;
    if (stepKey === 'metal' && metalType) return `${currentMetal?.label?.toUpperCase()} SELECTED`;
    if (stepKey === 'fangs') {
      const val = questions.length > 0 ? questionAnswers.fangs : fallbackAnswers.fangs;
      if (val != null) return val ? 'YES — EXTENDED FANGS' : 'NO FANGS';
    }
    if (stepKey === 'open_faced') {
      const val = questions.length > 0 ? questionAnswers.open_faced : fallbackAnswers.open_faced;
      if (val != null) return val ? 'YES — OPEN FACED' : 'NOT OPEN FACED';
    }
    return undefined;
  };

  const handleNext = () => {
    // Validate contact step
    if (isContactStep) {
      const errors = validateContactFields({
        name: contactName,
        email: contactEmail,
        countryCode: contactCountryCode,
        phoneNumber: contactPhone,
        countryIso: contactCountryIso,
      }, config?.required_contact_fields, termsAccepted);
      setContactErrors(errors);
      if (Object.keys(errors).length > 0) return;
    }

    if (isLastStep) {
      handleSubmit();
    } else {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(0, prev - 1));
  };

  // sortedSteps already computed above (before navigation labels)

  return (
    <FormWizardShell
      steps={sortedSteps}
      currentStep={currentStep}
      onNext={handleNext}
      onBack={handleBack}
      nextLabel={getNextLabel()}
      selectedLabel={getSelectedLabel()}
      isSubmitting={submitting}
      isLastStep={isLastStep}
      canProceed={isContactStep ? !!contactHasValues : isQuestionsStep ? allRequiredQuestionsAnswered : true}
      backgroundColor={theme.bg}
      fontColor={theme.font}
      accentColor={theme.accent}
      submitButtonBg={theme.submitBg}
      submitButtonText={theme.submitText}
      aiEnabled={config?.ai_image_enabled === true}
    />
  );
}

// --- Summary Row ---
function SummaryRow({ label, value, fontColor }: { label: string; value: string; fontColor: string }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-sm" style={{ color: `${fontColor}80` }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color: fontColor }}>{value}</span>
    </div>
  );
}

// --- Wizard Yes/No Toggle ---
function WizardYesNo({ label, value, onChange, accentColor, fontColor }: {
  label: string; value: boolean | null; onChange: (v: boolean) => void; accentColor: string; fontColor: string;
}) {
  const accent = accentColor;
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium" style={{ color: fontColor }}>{label}</Label>
      <div className="flex gap-2">
        {[true, false].map(v => (
          <button
            key={String(v)}
            type="button"
            onClick={() => onChange(v)}
            className="px-5 py-2 rounded-lg text-sm font-semibold transition-all border-2"
            style={{
              backgroundColor: value === v ? accent : 'transparent',
              borderColor: value === v ? accent : 'rgba(255,255,255,0.15)',
              color: value === v ? '#fff' : fontColor,
            }}
          >
            {v ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Dynamic Question Renderer (uses shared component with grillz-specific image overrides) ---
function GrillzDynamicQuestion({ question, answer, textValue, fileUrl, fileName, isFileUploading, onAnswerChange, onTextChange, onFileSelect, accentColor, fontColor, metalType, grillzType, overrides, hideLabel }: {
  question: GrillQuestionConfig; answer: boolean | null; textValue: string; fileUrl: string | null; fileName: string | null; isFileUploading: boolean;
  onAnswerChange: (v: boolean) => void; onTextChange: (v: string) => void; onFileSelect: (file: File) => void;
  accentColor: string; fontColor: string; metalType?: string; grillzType?: string; overrides?: Record<string, Record<string, string>> | null; hideLabel?: boolean;
}) {
  // For fangs/open_faced we show contextual images after the yes/no
  const questionImage = answer === true && question.question_key === 'fangs' ? extendedFangsImg
    : answer === true && question.question_key === 'open_faced' ? openFaceImg
    : answer === false && question.question_key === 'open_faced' && metalType ? (overrides ? toWebpImageUrl(resolveGrillMetalImage({ metalValue: metalType, grillzType, overrides })) : getMetalImage(metalType, grillzType))
    : null;

  // For file type questions, render inline with upload status
  if (question.question_type === 'file') {
    return (
      <div className="space-y-2">
        {!hideLabel && <Label className="text-sm font-medium" style={{ color: fontColor }}>{question.question_text}{question.is_required ? ' *' : ''}</Label>}
        <Input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) onFileSelect(f); }} className="cursor-pointer bg-transparent border-2 rounded-xl file:text-current" style={{ backgroundColor: 'transparent', color: fontColor, borderColor: `${fontColor}26` }} />
        {isFileUploading && (
          <div className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" style={{ color: accentColor }} />
            <p className="text-xs" style={{ color: `${fontColor}80` }}>Uploading...</p>
          </div>
        )}
        {fileName && !isFileUploading && <p className="text-xs" style={{ color: `${fontColor}80` }}>✓ {fileName}</p>}
      </div>
    );
  }

  return (
    <div>
      <WizardDynamicQuestionShared
        question={question}
        answer={answer}
        textValue={textValue}
        fileValue={null}
        onAnswerChange={onAnswerChange}
        onTextChange={onTextChange}
        onFileChange={(f) => { if (f) onFileSelect(f); }}
        accentColor={accentColor}
        fontColor={fontColor}
        hideLabel={hideLabel}
      />
      {questionImage && (
        <div className="flex justify-center py-3">
          <img src={questionImage} alt={question.question_text} className="h-32 w-auto object-contain" onError={fallbackToPngOnError} />
        </div>
      )}
    </div>
  );
}

// --- Fallback Questions ---
function WizardFallbackQuestions({ answers, customMessage, logoUrl, logoFileName, isLogoUploading, onAnswerChange, onCustomMessageChange, onLogoFileSelect, accentColor, fontColor, metalType, grillzType }: {
  answers: Record<string, boolean | null>; customMessage: string; logoUrl: string | null; logoFileName: string | null; isLogoUploading: boolean;
  onAnswerChange: (key: string, val: boolean) => void; onCustomMessageChange: (v: string) => void; onLogoFileSelect: (file: File) => void;
  accentColor: string; fontColor: string; metalType?: string; grillzType?: string;
}) {
  return (
    <>
      <AiVisionTextarea
        label="Describe your vision"
        value={customMessage}
        onChange={onCustomMessageChange}
        placeholder="Describe your dream piece..."
        rows={3}
        maxLength={500}
        accentColor={accentColor}
        fontColor={fontColor}
      />
      <div className="space-y-2">
        <Label className="text-sm font-medium" style={{ color: fontColor }}>Upload an inspiration image of what you're looking for</Label>
        <Input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) onLogoFileSelect(f); }} className="cursor-pointer bg-transparent border-2 rounded-xl file:text-current" style={{ backgroundColor: 'transparent', color: fontColor, borderColor: `${fontColor}26` }} />
        {isLogoUploading && (
          <div className="flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" style={{ color: accentColor }} />
            <p className="text-xs" style={{ color: `${fontColor}80` }}>Uploading...</p>
          </div>
        )}
        {logoFileName && !isLogoUploading && <p className="text-xs" style={{ color: `${fontColor}80` }}>✓ {logoFileName}</p>}
      </div>
      
    </>
  );
}
