import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { trackLeadConversion } from '@/lib/conversion-tracking';
import { initMetaPixel, trackMetaEvent } from '@/lib/meta-pixel';
import { trackMetaLead } from '@/lib/meta-lead';
import { supabase } from '@/integrations/supabase/client';
import { insertLeadRow } from '@/lib/lead-device';
import { uploadSingleFormImage } from '@/lib/form-image-upload';
import { toast } from 'sonner';
import { extractCheckoutErrorAsync } from '@/lib/checkout-error-utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AiVisionTextarea } from '@/components/form-wizard/AiVisionTextarea';
import { Info, Loader2 } from 'lucide-react';
import { FormWizardShell, type WizardStep } from '@/components/form-wizard/FormWizardShell';
import { StepHeading } from '@/components/form-wizard/StepHeading';
import { CardCarousel, type CarouselCard } from '@/components/form-wizard/CardCarousel';
import { WizardOptionGrid } from '@/components/form-wizard/WizardOptionGrid';
import { WizardSelectField } from '@/components/form-wizard/WizardSelectField';
import { WizardContactStep, validateContactFields } from '@/components/form-wizard/WizardContactStep';
import { WizardThankYou } from '@/components/form-wizard/WizardThankYou';
import { CustomEnquiryThankYou } from '@/components/custom-enquiry/CustomEnquiryThankYou';
import { formatPhoneE164 } from '@/lib/form-validation';
import { usePrefetchImages } from '@/hooks/usePrefetchImages';
import type { ClientCustomEnquiryConfig, CustomEnquiryQuestionConfig } from '@/hooks/useClientCustomEnquiryConfig';
import { deriveShortLabel } from '@/lib/wizard-utils';
import { ENQUIRY_DEFAULT_BUDGET_OPTIONS } from '@/lib/form-defaults';
import { buildQuestionSummaryItems } from '@/lib/question-answer-formatter';
import { getEffectiveAiImageDelivery } from '@/lib/ai-image-delivery';

// Category images — served from CDN as WebP; the carousel falls back to the .png twin on error.
const JEWELRY_CATEGORY_IMAGES: Record<string, string> = {
  'Pendant': 'https://d2lo9ju43icaaa.cloudfront.net/GrillzBuilder/Custom+Pendant-transparent.webp',
  'Chain': 'https://d2lo9ju43icaaa.cloudfront.net/GrillzBuilder/chain-transparent.webp',
  'Ring': 'https://d2lo9ju43icaaa.cloudfront.net/GrillzBuilder/Custom+ring+1.webp',
  'Earrings': 'https://d2lo9ju43icaaa.cloudfront.net/GrillzBuilder/earrings-updated-transparent.webp',
  'Grillz': 'https://d2lo9ju43icaaa.cloudfront.net/GrillzBuilder/Iced-out+Transparent-Gold+Diamond+Grillz+without+mold.webp',
  'Bracelet': 'https://d2lo9ju43icaaa.cloudfront.net/GrillzBuilder/Bracelet-transparent.webp',
  'Watches': 'https://d2lo9ju43icaaa.cloudfront.net/GrillzBuilder/iced+out+watches-transparent.webp',
  'Glasses': 'https://d2lo9ju43icaaa.cloudfront.net/GrillzBuilder/icedout-glasses-transparent.webp',
};

// Fallbacks
const FALLBACK_JEWELRY_TYPES = ['Pendant', 'Chain', 'Grillz', 'Ring', 'Bracelet', 'Earrings', 'Watches', 'Glasses', 'Other'];
const FALLBACK_BUDGETS = [...ENQUIRY_DEFAULT_BUDGET_OPTIONS];
import { CANONICAL_METALS, normalizeGoldColors, getMetalHex } from '@/lib/custom-enquiry-metals';
import { ENQUIRY_DEFAULT_TIMELINE_OPTIONS } from '@/lib/form-defaults';

const FALLBACK_GOLD_COLORS = [...CANONICAL_METALS];
const FALLBACK_KARATS = ['10K', '14K', '18K', '22K', '24K'];
const FALLBACK_DIAMONDS = ['N/A', 'Si - I', 'Si Goods', 'Si+', 'VS Goods', 'VS+', 'VVS', 'Flawless'];
const FALLBACK_SETUPS = ['No Diamonds', 'Minimal Diamonds', 'Partially Iced', 'Fully Iced'];
const FALLBACK_TIMELINES = [...ENQUIRY_DEFAULT_TIMELINE_OPTIONS];

// Legacy hex map removed — now using getMetalHex from custom-enquiry-metals

interface CustomEnquiryFormProps {
  config?: ClientCustomEnquiryConfig | null;
  clientId?: string;
  metaPixelId?: string | null;
}

function useWizardTheme(config?: ClientCustomEnquiryConfig | null) {
  const colors = config?.form_colors;
  return {
    bg: colors?.background || '#0a0a0a',
    font: colors?.fontColor || '#ffffff',
    accent: colors?.tabBorder || '#77bb41',
    submitBg: colors?.submitButtonBg || undefined,
    submitText: colors?.submitButtonText || undefined,
  };
}

export function CustomEnquiryForm({ config, clientId, metaPixelId }: CustomEnquiryFormProps) {
  const theme = useWizardTheme(config);
  const submissionMode = config?.submission_mode || 'contact';
  const depositAmount = config?.deposit_amount || null;
  const isDepositMode = submissionMode === 'deposit' && !!depositAmount;

  const jewelryTypes = config?.jewelry_types?.length ? config.jewelry_types : FALLBACK_JEWELRY_TYPES;
  const budgets = config?.budget_options?.length ? config.budget_options : FALLBACK_BUDGETS;
  // Design lists: once a client config row exists, respect it exactly (an empty
  // list means every option was deleted — never resurrect platform defaults).
  const rawGoldColors = config ? (config.gold_colors || []) : FALLBACK_GOLD_COLORS;
  const goldColors = normalizeGoldColors(rawGoldColors);
  const karats = config ? (config.karat_options || []) : FALLBACK_KARATS;
  const diamonds = config ? (config.diamond_qualities || []) : FALLBACK_DIAMONDS;
  const setups = config ? (config.diamond_setup_options || []) : FALLBACK_SETUPS;

  const timelines = config?.timeline_options?.length ? config.timeline_options : FALLBACK_TIMELINES;
  const optionNotes = (config as any)?.design_option_notes as Record<string, Record<string, string>> | null | undefined;
  const noteFor = (section: string, value: string) => optionNotes?.[section]?.[value] || undefined;
  const questions = config?.questions || [];
  const enabledSteps = config?.enabled_steps;
  const budgetSectionOn = enabledSteps?.budget_section !== false;
  const timelineSectionOn = enabledSteps?.timeline_section !== false;
  // A section is only shown when it is enabled AND still has at least one option.
  const metalColorOn = enabledSteps?.metal_color_section !== false && goldColors.length > 0;
  const karatOn = enabledSteps?.karat_section !== false && karats.length > 0;
  const diamondQualityOn = enabledSteps?.diamond_quality_section !== false && diamonds.length > 0;
  const diamondSetupOn = enabledSteps?.diamond_setup_section !== false && setups.length > 0;
  const designAnyOn = metalColorOn || karatOn || diamondQualityOn || diamondSetupOn;
  const stepLabels = config?.step_labels;
  const stepOrder = config?.step_order;

  // K1: Only eagerly prefetch the jewelry-type carousel images — question images are deferred
  // to avoid 12MB+ download before the user even picks a jewelry type.
  const categoryImageUrls = useMemo(() => Object.values(JEWELRY_CATEGORY_IMAGES), []);
  usePrefetchImages(categoryImageUrls, true, 'custom-enquiry-categories');

  // Init pixel and fire ViewContent once when metaPixelId is available
  const viewContentFired = useRef(false);
  useEffect(() => {
    if (metaPixelId) {
      initMetaPixel(metaPixelId);
    }
    if (!viewContentFired.current) {
      viewContentFired.current = true;
      trackMetaEvent('ViewContent', { content_name: 'Custom Enquiry', content_category: 'form' });
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

  // Auto-advance timer
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current); }, []);

  // State
  const [currentStep, setCurrentStep] = useState(0);
  const [jewelryType, setJewelryType] = useState('');
  const [budget, setBudget] = useState('');
  const [goldColor, setGoldColor] = useState<string[]>([]);
  const toggleGoldColor = useCallback((value: string) => {
    setGoldColor(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  }, []);
  const goldColorLabelsJoined = goldColor
    .map(v => goldColors.find(c => c.value === v)?.label || v)
    .join(', ');
  const [karat, setKarat] = useState('');
  const [diamond, setDiamond] = useState('');
  const [diamondSetup, setDiamondSetup] = useState('');
  
  const [timeline, setTimeline] = useState('');
  const [description, setDescription] = useState('');
  const [inspirationUrl, setInspirationUrl] = useState<string | null>(null);
  const [inspirationUploading, setInspirationUploading] = useState(false);
  const [inspirationFileName, setInspirationFileName] = useState<string | null>(null);
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, string>>({});
  const [questionTexts, setQuestionTexts] = useState<Record<string, string>>({});
  const [questionFileUrls, setQuestionFileUrls] = useState<Record<string, string>>({});
  const [questionFileNames, setQuestionFileNames] = useState<Record<string, string>>({});
  const [questionFileUploading, setQuestionFileUploading] = useState<Record<string, boolean>>({});
  const [engravingText, setEngravingText] = useState('');
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

  const effectiveClientId = clientId || config?.client_id;

  // Fetch client company name, terms URL, and privacy URL
  useEffect(() => {
    if (!effectiveClientId) return;
    // The clients table is not readable by anon (public widgets), so read these
    // public-safe fields via the SECURITY DEFINER get_client_branding RPC instead.
    supabase.rpc('get_client_branding', { client_uuid: effectiveClientId })
      .then(({ data, error }) => {
        if (error) {
          console.error('Failed to load client branding for enquiry form:', error);
          return;
        }
        const row = data?.[0];
        if (row) {
          setCompanyName((row as any).company_name || '');
          setTermsUrl((row as any).terms_url || '');
          setPrivacyUrl((row as any).privacy_url || '');
        }
      });
  }, [effectiveClientId]);

  // Jewelry type carousel cards
  const jewelryCards: CarouselCard[] = useMemo(() =>
    jewelryTypes.map(t => {
      const override = (config as any)?.option_image_overrides?.jewelry_type?.[t];
      return {
        value: t,
        label: t,
        image: override || JEWELRY_CATEGORY_IMAGES[t] || JEWELRY_CATEGORY_IMAGES['Chain'],
      };
    }),
    [jewelryTypes, config]
  );


  // Reset handler
  const handleReset = useCallback(() => {
    setSubmitted(false);
    setCurrentStep(0);
    setJewelryType(''); setBudget(''); setGoldColor([]); setKarat(''); setDiamond('');
    setDiamondSetup(''); setTimeline(''); setDescription('');
    setInspirationUrl(null); setInspirationFileName(null); setQuestionAnswers({}); setQuestionTexts({});
    setQuestionFileUrls({}); setQuestionFileNames({});
    setEngravingText('');
    setInspirationUploading(false); setQuestionFileUploading({});
    setContactName(''); setContactEmail(''); setContactCountryCode('+1');
    setContactPhone(''); setContactCountryIso('US'); setContactErrors({});
    setTermsAccepted(false); setSubmittedLeadId(null);
  }, []);

  // L8: ref guard — prevents double-submit before isSubmitting re-renders
  const isSubmittingRef = useRef(false);

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

  // Submit
  const handleSubmit = async () => {
    if (!effectiveClientId) { toast.error('Configuration error — no client ID'); return; }
    // L8: synchronous guard prevents double-submit before React re-renders button as disabled
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setSubmitting(true);
    try {
      const allAnswers: Record<string, any> = {};
      questions.forEach(q => {
        allAnswers[q.question_key] = {
          question: q.question_text, type: q.question_type,
          answer: questionAnswers[q.question_key] ?? null,
          text: questionTexts[q.question_key] || null,
          options: q.options || null,
        };
      });

      const formattedPhone = formatPhoneE164(contactCountryCode, contactPhone);

      // Collect already-uploaded image URLs
      const imageUrls = [
        ...(inspirationUrl ? [inspirationUrl] : []),
        ...Object.values(questionFileUrls),
      ];

      const leadId = crypto.randomUUID();
      const { error } = await insertLeadRow('custom_enquiry_leads', {
        id: leadId,
        client_id: effectiveClientId,
        jewelry_type: jewelryType || null,
        budget: (budgetSectionOn && budget) ? budget : null,
        gold_color: (metalColorOn && goldColorLabelsJoined) ? goldColorLabelsJoined : null,
        karat: (karatOn && karat) ? karat : null,
        diamond_quality: (diamondQualityOn && diamond) ? diamond : null,
        diamond_setup: (diamondSetupOn && diamondSetup) ? diamondSetup : null,
        back_option: null,
        
        description: description || null,
        timeline: (timelineSectionOn && timeline) ? timeline : null,
        question_answers: allAnswers,
        additional_notes: null,
        engraving_text: engravingText || null,
        customer_name: contactName,
        customer_email: contactEmail,
        customer_phone: formattedPhone,
        uploaded_image_urls: imageUrls.length > 0 ? imageUrls : null,
      });
      if (error) throw error;
      setSubmittedLeadId(leadId);

      // Fire-and-forget lead notification email
      const notifDetails: Record<string, string> = {};
      if (jewelryType) notifDetails['Jewelry Type'] = jewelryType;
      if (budgetSectionOn && budget) notifDetails['Budget'] = budget;
      if (metalColorOn && goldColorLabelsJoined) notifDetails['Metal Color'] = goldColorLabelsJoined;
      if (karatOn && karat) notifDetails['Karat'] = karat;
      if (diamondQualityOn && diamond) notifDetails['Diamond Quality'] = diamond;
      if (diamondSetupOn && diamondSetup) notifDetails['Diamond Setup'] = diamondSetup;
      
      if (timelineSectionOn && timeline) notifDetails['Timeline'] = timeline;
      if (engravingText) notifDetails['Personalized Inscription'] = engravingText;
      if (description) notifDetails['Vision / Description'] = description;
      if (inspirationUrl) notifDetails['Inspiration Image'] = inspirationUrl;
      const questionSummary = buildQuestionSummaryItems(questions, questionAnswers, questionTexts, questionFileUrls);
      questionSummary.forEach(({ label, value }) => { notifDetails[label] = value; });
      // L7: use retry wrapper — up to 3 attempts with backoff, non-blocking
      invokeWithRetry('notify-form-lead', {
        client_id: effectiveClientId,
        form_type: 'custom_enquiry',
        customer_name: contactName,
        customer_email: contactEmail,
        customer_phone: formattedPhone,
        details: notifDetails,
      });

      setStoredNotifDetails(notifDetails);

      // Customer confirmation email — sent unless the AI render is delivered by
      // email (the render email then carries the submission summary instead).
      if (!config?.ai_image_enabled || getEffectiveAiImageDelivery(config.ai_image_delivery, contactEmail) !== 'email') {
        invokeWithRetry('notify-customer-confirmation', {
          client_id: effectiveClientId,
          form_type: 'custom_enquiry',
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
        customData: { content_name: 'Custom Enquiry', content_category: 'form' },
      });
      trackLeadConversion('custom_inquiry', { email: contactEmail, phone: formattedPhone, leadId });

      if (isDepositMode) {
        const goldColorLabel = goldColorLabelsJoined;
        const attributes: Record<string, string> = {};
        if (jewelryType) attributes['Jewelry Type'] = jewelryType;
        if (budgetSectionOn && budget) attributes['Budget'] = budget;
        if (metalColorOn && goldColorLabel) attributes['Gold Color'] = goldColorLabel;
        if (karatOn && karat) attributes['Karat'] = karat;
        if (diamondQualityOn && diamond) attributes['Diamonds'] = diamond;
        if (diamondSetupOn && diamondSetup) attributes['Diamond Setup'] = diamondSetup;
        
        
        if (description) attributes['Description'] = description;
        attributes['Customer Name'] = contactName;
        attributes['Customer Email'] = contactEmail;
        attributes['Customer Phone'] = formattedPhone;
        if (engravingText) attributes['Personalized Inscription'] = engravingText;
        if (timelineSectionOn && timeline) attributes['Timeline'] = timeline;
        buildQuestionSummaryItems(questions, questionAnswers, questionTexts, questionFileUrls)
          .forEach(({ label, value }) => { attributes[label] = value; });
        Object.entries(questionFileUrls).forEach(([key, fileUrl]) => {
          const q = questions.find(qq => qq.question_key === key);
          if (q && fileUrl) attributes[`${q.question_text} (file)`] = fileUrl;
        });

        const aiEnabled = config?.ai_image_enabled === true;
        if (aiEnabled) {
          // Defer checkout — show AI render first, then checkout button
          setDeferredCheckoutAttributes(attributes);
        } else {
          try {
            const { data, error: checkoutError } = await supabase.functions.invoke('shopify-form-checkout', {
              body: { clientId: effectiveClientId, formType: 'custom_enquiry', attributes }
            });
            if (checkoutError) {
              const msg = await extractCheckoutErrorAsync(checkoutError, 'Could not redirect to checkout. Your enquiry was saved.');
              toast.error(msg);
              return;
            }
            if (data?.error) { toast.error(data.error); return; }
            if (data?.checkoutUrl) {
              try { if (window.top) window.top.location.href = data.checkoutUrl; else window.location.href = data.checkoutUrl; } catch { window.location.href = data.checkoutUrl; }
              return;
            }
            toast.error('Could not get checkout URL. Your enquiry was saved.');
          } catch (checkoutErr: any) {
            console.error('Checkout redirect error:', checkoutErr);
            const errMsg = await extractCheckoutErrorAsync(checkoutErr, 'Could not redirect to checkout. Your enquiry was saved.');
            toast.error(errMsg);
          }
        }
      }

      setSubmitted(true);
      toast.success('Custom enquiry submitted successfully!');
    } catch (err: any) {
      console.error('Submit error:', err);
      toast.error('Failed to submit enquiry. Please try again.');
    } finally {
      setSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  // Thank you
  if (submitted) {
    const aiEnabled = config?.ai_image_enabled === true;
    if (aiEnabled && submittedLeadId && effectiveClientId) {
      return (
        <CustomEnquiryThankYou
          onReset={handleReset}
          backgroundColor={theme.bg}
          fontColor={theme.font}
          accentColor={theme.accent}
          leadId={submittedLeadId}
          clientId={effectiveClientId}
          customerName={contactName}
          customerEmail={contactEmail}
          enquiryConfig={{
            jewelryType,
            goldColor: metalColorOn ? goldColorLabelsJoined : '',
            karat: karatOn ? karat : '',
            diamondQuality: diamondQualityOn ? diamond : '',
            diamondSetup: diamondSetupOn ? diamondSetup : '',
            backOption: '',
            
            budget: budgetSectionOn ? budget : '',
            description,
            engravingText: engravingText || undefined,
            questionAnswers: (() => {
              const allAnswers: Record<string, any> = {};
              questions.forEach(q => {
                allAnswers[q.question_key] = {
                  question: q.question_text,
                  type: q.question_type,
                  answer: questionAnswers[q.question_key] ?? null,
                  text: questionTexts[q.question_key] || null,
                };
              });
              return allAnswers;
            })(),
          }}
          depositAmount={deferredCheckoutAttributes ? (depositAmount || undefined) : undefined}
          checkoutAttributes={deferredCheckoutAttributes || undefined}
          formType="custom_enquiry"
          submissionDetails={storedNotifDetails}
          extraSummaryItems={buildQuestionSummaryItems(questions, questionAnswers, questionTexts, questionFileUrls)}
          thankYouContact={config?.thank_you_contact}
          delivery={getEffectiveAiImageDelivery(config?.ai_image_delivery, contactEmail)}
        />
      );
    }
    const summaryItems = [
      { label: 'Type', value: jewelryType || '' },
      { label: 'Metal Color', value: metalColorOn ? (goldColorLabelsJoined || '') : '' },
      { label: 'Karat', value: karatOn ? (karat || '') : '' },
      { label: 'Diamond', value: diamondQualityOn ? (diamond || '') : '' },
      { label: 'Setup', value: diamondSetupOn ? (diamondSetup || '') : '' },
      { label: 'Budget', value: (budgetSectionOn && budget) ? budget : '' },
      ...buildQuestionSummaryItems(questions, questionAnswers, questionTexts, questionFileUrls),
    ].filter(i => i.value);
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

  // Identify default questions
  const defaultTextQ = questions.find(q => q.question_key === 'description' && q.is_default);
  const defaultFileQ = questions.find(q => q.question_key === 'inspiration_upload' && q.is_default);
  const customQs = questions.filter(q => !q.is_default);

  // --- Build steps ---
  const steps: WizardStep[] = [];

  // Step 1: Jewelry Type
  if (isStepEnabled('jewelry-type')) {
    steps.push({
      key: 'jewelry-type',
      label: 'TYPE',
      content: (
        <div className="space-y-6">
          <StepHeading {...getLabel('jewelry-type', 'CHOOSE YOUR', 'JEWELRY TYPE', 'What kind of custom piece are you looking for?')} accentColor={theme.accent} fontColor={theme.font} />
          <CardCarousel cards={jewelryCards} selectedValue={jewelryType} accentColor={theme.accent} fontColor={theme.font} onSelect={(v) => {
            setJewelryType(v);
            if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
            autoAdvanceTimer.current = setTimeout(() => setCurrentStep(p => p + 1), 450);
          }} />
        </div>
      ),
    });
  }

  // Step 2: Design Details
  if (isStepEnabled('design') && designAnyOn) {
    steps.push({
      key: 'design',
      label: 'DESIGN',
      content: (
        <div className="space-y-6">
          <StepHeading {...getLabel('design', 'DESIGN', 'DETAILS', 'Customize the materials and style')} accentColor={theme.accent} fontColor={theme.font} />
          <div className="max-w-lg mx-auto w-full px-4 md:px-8 space-y-5">
            {metalColorOn && (
              <div className="space-y-2">
                <Label className={`text-sm font-semibold uppercase tracking-wider ${goldColors.length < 3 ? 'text-center block' : ''}`} style={{ color: `${theme.font}99` }}>Metal Color</Label>
                <div className={`flex flex-wrap gap-2 ${goldColors.length < 3 ? 'justify-center' : ''}`}>
                  {goldColors.map(c => {
                    const hexColor = (c as any).hex || getMetalHex(c.value) || getMetalHex(c.label) || '#888';
                    return (
                      <button key={c.value} type="button" onClick={() => toggleGoldColor(c.value)} title={noteFor('metal_color', c.value)}
                        className="px-4 py-2 rounded-lg text-sm font-semibold transition-all border-2 flex items-center gap-2"
                        style={{
                          backgroundColor: goldColor.includes(c.value) ? `${theme.accent}20` : 'transparent',
                          borderColor: goldColor.includes(c.value) ? theme.accent : 'rgba(255,255,255,0.15)',
                          color: theme.font,
                        }}
                      >
                        <span className="w-5 h-5 rounded-full border border-white/30 shrink-0" style={{ backgroundColor: hexColor }} />
                        <span className="flex flex-col items-start leading-tight">
                          <span>{c.label}</span>
                          {noteFor('metal_color', c.value) && (
                            <span className="text-[10px] font-normal opacity-70">{noteFor('metal_color', c.value)}</span>
                          )}
                        </span>
                      </button>

                    );
                  })}
                </div>
              </div>
            )}
            {karatOn && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold uppercase tracking-wider" style={{ color: `${theme.font}99` }}>Karat</Label>
                <div className="flex flex-wrap gap-2">
                  {karats.map(k => (
                    <button key={k} type="button" onClick={() => setKarat(k)} title={noteFor('karat', k)}
                      className="px-4 py-2 rounded-lg text-sm font-semibold transition-all border-2 flex flex-col items-center"
                      style={{
                        backgroundColor: karat === k ? `${theme.accent}20` : 'transparent',
                        borderColor: karat === k ? theme.accent : 'rgba(255,255,255,0.15)',
                        color: theme.font,
                      }}
                    >
                      <span>{k}</span>
                      {noteFor('karat', k) && (
                        <span className="text-[10px] font-normal opacity-70 leading-tight">{noteFor('karat', k)}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {diamondQualityOn && (
              <WizardSelectField label="Diamond Quality" value={diamond} onValueChange={setDiamond} options={diamonds.map(d => ({ value: d, label: d, note: noteFor('diamond_quality', d) }))} accentColor={theme.accent} fontColor={theme.font} />
            )}
            {diamondSetupOn && (
              <WizardSelectField label="Diamond Setup" value={diamondSetup} onValueChange={setDiamondSetup} options={setups.map(s => ({ value: s, label: s, note: noteFor('diamond_setup', s) }))} accentColor={theme.accent} fontColor={theme.font} />
            )}
            
          </div>
        </div>
      ),
    });
  }

  // Step 3: Budget & Timeline (each sub-section independently toggleable)
  if (isStepEnabled('budget') && (budgetSectionOn || timelineSectionOn)) {
    steps.push({
      key: 'budget',
      label: 'BUDGET',
      content: (
        <div className="space-y-6">
          <StepHeading {...getLabel('budget', 'BUDGET &', 'TIMELINE', 'Select your budget range and timeline')} accentColor={theme.accent} fontColor={theme.font} />
          <div className="max-w-lg mx-auto w-full px-4 md:px-8 space-y-5">
            {budgetSectionOn && (
              <WizardOptionGrid
                options={budgets.map(b => ({ value: b, label: b }))}
                selectedValue={budget}
                onSelect={(v) => {
                  setBudget(v);
                  if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
                }}
                columns={2}
                accentColor={theme.accent}
                fontColor={theme.font}
              />
            )}
            {timelineSectionOn && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold uppercase tracking-wider text-center block" style={{ color: `${theme.font}99` }}>Timeline</Label>
                <div className="flex flex-wrap gap-2 justify-center">
                  {timelines.map(t => (
                    <button key={t} type="button" onClick={() => setTimeline(t)}
                      className="px-4 py-2 rounded-lg text-sm font-semibold transition-all border-2"
                      style={{
                        backgroundColor: timeline === t ? `${theme.accent}20` : 'transparent',
                        borderColor: timeline === t ? theme.accent : 'rgba(255,255,255,0.15)',
                        color: theme.font,
                      }}
                    >{t}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ),
    });
  }


  // Step 4: Questions — render each custom question as its own step
  if (isStepEnabled('questions') && customQs.length > 0) {
    customQs.forEach(q => {
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
              subtitle={q.subtitle || undefined}
              accentColor={theme.accent}
              fontColor={theme.font}
            />
            <div className="max-w-lg mx-auto w-full px-4 md:px-8 space-y-5">
               <WizardCustomQuestion
                hideLabel
                key={q.id}
                question={q}
                answerValue={questionAnswers[q.question_key] || ''}
                textValue={questionTexts[q.question_key] || ''}
                fileUrl={questionFileUrls[q.question_key] || null}
                fileName={questionFileNames[q.question_key] || null}
                isUploading={!!questionFileUploading[q.question_key]}
                onAnswer={v => setQuestionAnswers(prev => ({ ...prev, [q.question_key]: v }))}
                onText={v => setQuestionTexts(prev => ({ ...prev, [q.question_key]: v }))}
                onFile={async (file) => {
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
              />
            </div>
          </div>
        ),
      });
    });
  }

  // Step 5a: Describe Your Vision
  if (isStepEnabled('description')) {
    steps.push({
      key: 'description',
      label: 'VISION',
      content: (
        <div className="space-y-6">
          <StepHeading {...getLabel('description', 'DESCRIBE YOUR', 'VISION', 'Tell us about your dream piece')} accentColor={theme.accent} fontColor={theme.font} />
          <div className="max-w-lg mx-auto w-full px-4 md:px-8 space-y-5">
            <AiVisionTextarea
              label={defaultTextQ?.question_text || 'Describe your vision'}
              value={description}
              onChange={setDescription}
              placeholder="Describe your dream piece..."
              rows={4}
              maxLength={1000}
              accentColor={theme.accent}
              fontColor={theme.font}
            />
          </div>
        </div>
      ),
    });
  }

  // Step 5b: Upload Inspiration
  if (isStepEnabled('inspiration')) {
    steps.push({
      key: 'inspiration',
      label: 'UPLOAD',
      content: (
        <div className="space-y-6">
          <StepHeading {...getLabel('inspiration', 'UPLOAD', 'INSPIRATION', 'Upload a reference image')} accentColor={theme.accent} fontColor={theme.font} />
          <div className="max-w-lg mx-auto w-full px-4 md:px-8 space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold uppercase tracking-wider" style={{ color: `${theme.font}99` }}>
                {defaultFileQ?.question_text || 'Upload Inspiration Image'}
              </Label>
              <p className="text-xs" style={{ color: `${theme.font}60` }}>Example Photo, Screenshot, Similar</p>
              <Input type="file" accept="image/*" onChange={async (e) => {
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

  // Step 5c: Engraving Text
  if (isStepEnabled('engraving')) {
    steps.push({
      key: 'engraving',
      label: 'INSCRIPTION',
      content: (
        <div className="space-y-6">
          <StepHeading {...getLabel('engraving', 'PERSONALIZED', 'INSCRIPTION', 'Turn this into a keepsake with your words')} accentColor={theme.accent} fontColor={theme.font} />
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
                className="bg-transparent border-2 rounded-xl"
                style={{ backgroundColor: 'transparent', borderColor: `${theme.font}26`, color: theme.font }}
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

  // Step 6: Contact (final step)
  steps.push({
    key: 'contact',
    label: 'CONTACT',
    content: (
      <div className="space-y-6">
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
      </div>
    ),
  });

  // Sort steps by step_order if configured (move BEFORE navigation labels so they reflect reorder)
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

  // Navigation — driven by sortedSteps so reorder reflects in labels & last-step detection
  const isLastStep = currentStep === sortedSteps.length - 1;
  const isContactStep = sortedSteps[currentStep]?.key === 'contact';
  const isQuestionsStep = sortedSteps[currentStep]?.key === 'questions';
  // L6: gate only on fields the jeweler marked required — not always all three
  const requiredContactConfig = config?.required_contact_fields || { name: true, email: true, phone: true };
  const contactHasValues =
    (!requiredContactConfig.name || !!contactName.trim()) &&
    (!requiredContactConfig.email || !!contactEmail.trim()) &&
    (!requiredContactConfig.phone || !!contactPhone.trim());

  // Check all required custom questions are answered
  const allRequiredQuestionsAnswered = customQs
    .filter(q => q.is_required && q.is_enabled)
    .every(q => {
      if (q.question_type === 'file') return !!questionFileUrls[q.question_key];
      if (q.question_type === 'text') return !!questionAnswers[q.question_key]?.trim();
      // yes_no, dropdown, custom_options all use questionAnswers
      return !!questionAnswers[q.question_key];
    });

  const getNextLabel = () => {
    if (isLastStep) return 'GENERATE AI RENDER >';
    return 'NEXT';
  };

  const getSelectedLabel = () => {
    if (sortedSteps[currentStep]?.key === 'jewelry-type' && jewelryType) {
      return `${jewelryType.toUpperCase()} SELECTED`;
    }
    return undefined;
  };

  const handleNext = () => {
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
      setCurrentStep(p => p + 1);
    }
  };

  // sortedSteps already computed above (before navigation labels)

  return (
    <FormWizardShell
      steps={sortedSteps}
      currentStep={currentStep}
      onNext={handleNext}
      onBack={() => setCurrentStep(p => Math.max(0, p - 1))}
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



function WizardCustomQuestion({ question, answerValue, textValue, fileUrl, fileName, isUploading, onAnswer, onText, onFile, accentColor, fontColor, hideLabel }: {
  question: CustomEnquiryQuestionConfig; answerValue: string; textValue: string; fileUrl: string | null; fileName: string | null; isUploading: boolean;
  onAnswer: (v: string) => void; onText: (v: string) => void; onFile: (file: File) => void;
  accentColor: string; fontColor: string; hideLabel?: boolean;
}) {
  const options = question.options || [];

  switch (question.question_type) {
    case 'yes_no':
      return (
        <div className="space-y-2">
          {!hideLabel && <Label className="text-sm font-medium" style={{ color: fontColor }}>{question.question_text}{question.is_required ? ' *' : ''}</Label>}
          <div className="flex gap-2">
            {['Yes', 'No'].map(v => (
              <button key={v} type="button" onClick={() => onAnswer(v)}
                className="px-5 py-2 rounded-lg text-sm font-semibold transition-all border-2"
                style={{
                  backgroundColor: answerValue === v ? accentColor : 'transparent',
                  borderColor: answerValue === v ? accentColor : 'rgba(255,255,255,0.15)',
                  color: answerValue === v ? '#fff' : fontColor,
                }}
              >{v}</button>
            ))}
          </div>
          {answerValue === 'Yes' && question.has_text_followup && (
            <Input value={textValue} onChange={e => onText(e.target.value)} placeholder="Enter details..." maxLength={200}
              className="bg-transparent border-2 rounded-lg" style={{ backgroundColor: 'transparent', borderColor: `${fontColor}26`, color: fontColor }} />
          )}
        </div>
      );

    case 'text':
      return (
        <div className="space-y-2">
          {!hideLabel && <Label className="text-sm font-medium" style={{ color: fontColor }}>{question.question_text}{question.is_required ? ' *' : ''}</Label>}
          <Textarea value={answerValue} onChange={e => onAnswer(e.target.value)} placeholder="Enter your answer..." rows={3} maxLength={500}
            className="bg-transparent border-2 rounded-xl" style={{ backgroundColor: 'transparent', borderColor: `${fontColor}26`, color: fontColor }} />
        </div>
      );

    case 'dropdown':
      return (
        <WizardSelectField label={hideLabel ? '' : question.question_text} value={answerValue} onValueChange={onAnswer}
          options={options.map(o => ({ value: o, label: o }))} accentColor={accentColor} fontColor={fontColor} />
      );

    case 'custom_options': {
      const optionImages = question.option_images;
      const hasImages = optionImages && Object.values(optionImages).some(Boolean);
      if (hasImages) {
        return (
          <div className="space-y-2">
            {!hideLabel && <Label className="text-sm font-medium" style={{ color: fontColor }}>{question.question_text}{question.is_required ? ' *' : ''}</Label>}
            <CardCarousel
              cards={options.map(opt => ({
                value: opt,
                label: opt,
                image: optionImages[opt] || undefined,
              }))}
              selectedValue={answerValue}
              onSelect={onAnswer}
              accentColor={accentColor}
              fontColor={fontColor}
            />
          </div>
        );
      }
      return (
        <div className="space-y-2">
          {!hideLabel && <Label className="text-sm font-medium" style={{ color: fontColor }}>{question.question_text}{question.is_required ? ' *' : ''}</Label>}
          <div className="flex flex-wrap gap-2">
            {options.map(opt => (
              <button key={opt} type="button" onClick={() => onAnswer(opt)}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-all border-2"
                style={{
                  backgroundColor: answerValue === opt ? accentColor : 'transparent',
                  borderColor: answerValue === opt ? accentColor : 'rgba(255,255,255,0.15)',
                  color: answerValue === opt ? '#fff' : fontColor,
                }}
              >{opt}</button>
            ))}
          </div>
        </div>
      );
    }

    case 'file':
      return (
        <div className="space-y-2">
          {!hideLabel && <Label className="text-sm font-medium" style={{ color: fontColor }}>{question.question_text}{question.is_required ? ' *' : ''}</Label>}
          <Input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} className="cursor-pointer bg-transparent border-2 rounded-xl file:text-current" style={{ backgroundColor: 'transparent', color: fontColor, borderColor: `${fontColor}26` }} />
          {isUploading && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-3 w-3 animate-spin" style={{ color: accentColor }} />
              <p className="text-xs" style={{ color: `${fontColor}80` }}>Uploading...</p>
            </div>
          )}
          {fileName && !isUploading && <p className="text-xs" style={{ color: `${fontColor}80` }}>✓ {fileName}</p>}
        </div>
      );

    default: return null;
  }
}
