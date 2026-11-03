import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useFormAnalytics } from '@/hooks/useFormAnalytics';
import { useWizardTheme } from '@/hooks/useWizardTheme';
import { supabase } from '@/integrations/supabase/client';
import { insertLeadRow } from '@/lib/lead-device';
import { trackEmbedEvent } from '@/lib/analytics-utils';
import { uploadSingleFormImage } from '@/lib/form-image-upload';
import { toast } from 'sonner';
import { extractCheckoutErrorAsync } from '@/lib/checkout-error-utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AiVisionTextarea } from '@/components/form-wizard/AiVisionTextarea';
import { Info, Loader2, Upload } from 'lucide-react';
import { FormWizardShell, type WizardStep } from '@/components/form-wizard/FormWizardShell';
import { StepHeading } from '@/components/form-wizard/StepHeading';
import { CardCarousel, type CarouselCard } from '@/components/form-wizard/CardCarousel';
import { CardCarouselMulti } from '@/components/form-wizard/CardCarouselMulti';
import { WizardOptionGrid } from '@/components/form-wizard/WizardOptionGrid';
import { WizardContactStep, validateContactFields } from '@/components/form-wizard/WizardContactStep';
import { WizardThankYou } from '@/components/form-wizard/WizardThankYou';
import { RingThankYou } from '@/components/ring-builder-wizard/RingThankYou';
import { ThankYouErrorBoundary } from '@/components/ring-builder-wizard/ThankYouErrorBoundary';
import { WizardDynamicQuestion } from '@/components/form-wizard/WizardDynamicQuestion';
import { formatPhoneE164 } from '@/lib/form-validation';
import { buildQuestionSummaryItems } from '@/lib/question-answer-formatter';
import { getEffectiveAiImageDelivery } from '@/lib/ai-image-delivery';
import type { ClientRingFormConfig, RingFormStepOption, RingFormEnabledSteps } from '@/hooks/useClientRingFormConfig';
import { type DiamondOption } from '@/hooks/useDiamondFormOptions';
import { useAllDiamondFormOptions } from '@/hooks/useAllDiamondFormOptions';
import { useClientRingFormQuestions } from '@/hooks/useClientRingFormQuestions';
import { getRingBuilderImageUrl } from '@/lib/diamond-form-cdn';
import { quoteV3StockImageForTable, usesV3StockImages } from '@/lib/quote-v3-assets';
import { isWebpCdnUrl, toWebpImageUrl } from '@/lib/webp-image-fallback';
import { deriveShortLabel } from '@/lib/wizard-utils';
import {
  STEP_DEFS,
  DEFAULT_BUDGET_OPTIONS,
  DEFAULT_TIMELINE_OPTIONS,
  KARAT_DEFAULT_OPTIONS,
  ENGRAVING_ADVISORY_THRESHOLD,
  ENGRAVING_MAX_LENGTH,
} from './ring-builder-constants';

interface RingBuilderWizardFormProps {
  config: ClientRingFormConfig | null;
  clientId?: string;
  metaPixelId?: string | null;
}

export function RingBuilderWizardForm({ config, clientId, metaPixelId }: RingBuilderWizardFormProps) {
  const theme = useWizardTheme(config);
  const submissionMode = config?.submission_mode || 'contact';
  const depositAmount = config?.deposit_amount || null;
  // F5: Deposit mode is only active when BOTH the deposit amount AND the Shopify
  // product ID are configured — avoids creating an orphaned lead when the product
  // hasn't been pushed to Shopify yet.
  const isDepositMode = submissionMode === 'deposit' && !!depositAmount && !!config?.shopify_product_id;
  const enabledSteps = config?.enabled_steps;
  const stepLabels = config?.step_labels;
  const stepOrder = config?.step_order;
  const configStepGroups = config?.step_groups;
  const effectiveClientId = clientId || config?.client_id;

  // Fetch dynamic questions
  const { questions: ringQuestions } = useClientRingFormQuestions(effectiveClientId);

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

  const budgetOptions: string[] = (config?.budget_options as string[] | null)?.length
    ? (config!.budget_options as string[])
    : DEFAULT_BUDGET_OPTIONS;

  // Client-managed timeline list — only fall back to platform defaults when the
  // client has never configured it (column null/undefined). An empty saved list
  // means "no timeline options", so it must not resurrect the defaults.
  const timelineOptions: string[] = Array.isArray(config?.timeline_options)
    ? (config!.timeline_options as string[])
    : DEFAULT_TIMELINE_OPTIONS.map(t => t.label);

  // Load all master options in a single batched query
  const allOpts = useAllDiamondFormOptions(effectiveClientId);

  const optionsMap: Record<string, DiamondOption[] | undefined> = {
    nature: allOpts.data?.nature,
    shape: allOpts.data?.shape,
    size: allOpts.data?.size,
    quality: allOpts.data?.quality,
    setting: allOpts.data?.setting,
    holder: allOpts.data?.holder,
    band: allOpts.data?.band,
    band_width: allOpts.data?.band_width,
    metal: allOpts.data?.metal,
    personalization: allOpts.data?.personalization,
  };

  // Resolve image: client override > custom upload > V3 stock set (allowlisted accounts) > legacy swap > default Ring Builder image.
  // Stock CDN files are then requested as WebP (the card components fall back to .png on error).
  function resolveImage(tableName: string, optionValue: string, storedUrl?: string | null, stepKey?: string): string | undefined {
    return toWebpImageUrl(resolveImageSource(tableName, optionValue, storedUrl, stepKey));
  }

  const v3StockImages = usesV3StockImages(effectiveClientId);

  function resolveImageSource(tableName: string, optionValue: string, storedUrl?: string | null, stepKey?: string): string | undefined {
    // 1. Client-uploaded override wins
    if (stepKey) {
      const overrideUrl = (config as any)?.option_image_overrides?.[stepKey]?.[optionValue];
      if (overrideUrl) return overrideUrl as string;
    }
    // 2. Accounts on the V3 stock set show the same pictures as the Sandbox V3
    //    Quote Estimator, unless the option carries a jeweler-uploaded picture.
    if (v3StockImages && (!storedUrl || isWebpCdnUrl(storedUrl))) {
      const v3 = quoteV3StockImageForTable(tableName, optionValue);
      if (v3) return v3;
    }
    if (storedUrl && storedUrl.includes('DiamondsCatalog')) {
      return getRingBuilderImageUrl(tableName, optionValue) || undefined;
    }
    if (storedUrl) return storedUrl;
    return getRingBuilderImageUrl(tableName, optionValue) || undefined;
  }


  // Merge master options with client step_options overrides
  function getStepOptions(stepKey: string, tableName: string): { value: string; label: string; image?: string }[] {
    const clientStepOpts = config?.step_options?.[stepKey] as RingFormStepOption[] | undefined;
    const masterOpts = optionsMap[stepKey];
    if (clientStepOpts && clientStepOpts.length > 0) {
      const seen = new Set<string>();
      const deduped = clientStepOpts.filter(o => {
        if (seen.has(o.value)) return false;
        seen.add(o.value);
        return true;
      });
      return deduped.map(o => ({
        value: o.value, label: o.label, image: resolveImage(tableName, o.value, o.image_url, stepKey),
      }));
    }
    if (masterOpts) {
      return masterOpts.map(o => ({ value: o.option_value, label: o.name, image: resolveImage(tableName, o.option_value, o.image_url, stepKey) }));
    }

    // Karat step has no master table — fall back to built-in defaults so the
    // step is usable even when the client hasn't customized options.
    if (stepKey === 'karat') {
      return KARAT_DEFAULT_OPTIONS.map(v => ({ value: v, label: v }));
    }

    return [];
  }

  function isStepEnabled(key: string): boolean {
    if (!enabledSteps) return true;
    return (enabledSteps as unknown as Record<string, boolean>)[key] !== false;
  }

  // State
  const [currentStep, setCurrentStep] = useState(0);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [multiSelections, setMultiSelections] = useState<Record<string, string[]>>({});
  const [inspirationUrls, setInspirationUrls] = useState<string[]>([]);
  const [inspirationFileNames, setInspirationFileNames] = useState<string[]>([]);
  const [inspirationUploading, setInspirationUploading] = useState(false);
  const [ringSize, setRingSize] = useState('');
  const [otherDetails, setOtherDetails] = useState('');
  const [engravingText, setEngravingText] = useState('');
  const [budget, setBudget] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedLeadId, setSubmittedLeadId] = useState<string | null>(null);
  const [deferredCheckoutAttributes, setDeferredCheckoutAttributes] = useState<Record<string, string> | null>(null);
  const [storedNotifDetails, setStoredNotifDetails] = useState<Record<string, string>>({});

  // Dynamic question state
  const [questionAnswers, setQuestionAnswers] = useState<Record<string, boolean | null>>({});
  const [questionTexts, setQuestionTexts] = useState<Record<string, string>>({});
  const [questionFileUrls, setQuestionFileUrls] = useState<Record<string, string>>({});
  const [questionFileNames, setQuestionFileNames] = useState<Record<string, string>>({});
  const [questionFileUploading, setQuestionFileUploading] = useState<Record<string, boolean>>({});

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

  // Fetch client company name, terms URL, and privacy URL — abort if unmounted to avoid
  // setState-on-unmounted warnings when the embed page navigates away mid-fetch.
  useEffect(() => {
    if (!effectiveClientId) return;
    let cancelled = false;
    supabase.from('clients').select('company_name, terms_url, privacy_url').eq('id', effectiveClientId).single()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setCompanyName(data.company_name || '');
        setTermsUrl(data.terms_url || '');
        setPrivacyUrl((data as any).privacy_url || '');
      });
    return () => { cancelled = true; };
  }, [effectiveClientId]);

  // E3: Centralised Meta Pixel + step analytics. Hook is called unconditionally
  // here (before any conditional returns) to satisfy React's rules of hooks.
  const { trackLead } = useFormAnalytics({
    clientId: effectiveClientId,
    formType: 'ring_builder',
    metaPixelId,
    currentStep,
    submitted,
  });

  // F8: Track form abandonment when the widget unmounts before the user submits.
  // Uses refs so the cleanup always reads the latest step even in a stale closure.
  const abandonStepRef = useRef(currentStep);
  const abandonSubmittedRef = useRef(submitted);
  useEffect(() => { abandonStepRef.current = currentStep; }, [currentStep]);
  useEffect(() => { abandonSubmittedRef.current = submitted; }, [submitted]);
  useEffect(() => {
    return () => {
      if (abandonSubmittedRef.current || abandonStepRef.current === 0 || !effectiveClientId) return;
      void trackEmbedEvent(effectiveClientId, 'form_abandoned', {
        form_type: 'ring_builder',
        step_index: abandonStepRef.current,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run only on mount/unmount — reads latest values via refs

  // Track in-flight uploads so we can abort them if the user resets / unmounts (C8).
  const uploadAbortRef = useRef<AbortController | null>(null);
  useEffect(() => () => uploadAbortRef.current?.abort(), []);

  // C1: Memoised carousel-card lists, keyed by step + structural fingerprint
  // of option (value|image) pairs. Declared at top-level (not after the
  // submitted-early-return) so React Hook ordering stays stable across renders.
  const cardsCacheRef = useRef<Map<string, { fp: string; cards: CarouselCard[] }>>(new Map());

  // Auto-advance helper
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    setCurrentStep(0);
    setSelections({});
    setMultiSelections({});
    setInspirationUrls([]); setInspirationFileNames([]); setInspirationUploading(false);
    setRingSize('');
    setOtherDetails('');
    setEngravingText('');
    setBudget('');
    setAdditionalNotes('');
    setContactName('');
    setContactEmail('');
    setContactCountryCode('+1');
    setContactPhone('');
    setContactCountryIso('US');
    setContactErrors({});
    setTermsAccepted(false);
    setQuestionAnswers({});
    setQuestionTexts({});
    setQuestionFileUrls({}); setQuestionFileNames({}); setQuestionFileUploading({});
  }, []);

  // --- Submit ---
  const handleSubmit = async () => {
    if (!effectiveClientId) {
      toast.error('Configuration error — no client ID');
      return;
    }
    // Idempotency guard: ignore re-entrant calls while a submit is in flight (D1).
    if (submitting) return;
    setSubmitting(true);
    try {
      const formattedPhone = formatPhoneE164(contactCountryCode, contactPhone);

      // Build question answers map
      const questionAnswersMap: Record<string, any> = {};
      ringQuestions.forEach(q => {
        const yesNo = questionAnswers[q.question_key];
        const text = questionTexts[q.question_key];
        if (yesNo !== null && yesNo !== undefined) questionAnswersMap[q.question_key] = yesNo;
        if (text) questionAnswersMap[q.question_key] = text;
      });

      const description = JSON.stringify({
        selections,
        multiSelections,
        ringSize,
        budget,
        additionalNotes,
        otherDetails,
        engravingText,
        ...(Object.keys(questionAnswersMap).length > 0 ? { questionAnswers: questionAnswersMap } : {}),
      });

      // Use already-uploaded image URLs
      const imageUrls = [...inspirationUrls, ...Object.values(questionFileUrls)];

      const leadId = crypto.randomUUID();
      const { error } = await insertLeadRow('design_requests', {
        id: leadId,
        client_id: effectiveClientId,
        request_type: 'ring_builder',
        description,
        preferred_metal: selections.metal || null,
        preferred_stone: selections.nature || null,
        size: ringSize || null,
        timeline: selections.timeline || null,
        budget_range: budget || null,
        special_requirements: additionalNotes || null,
        reference_images: imageUrls.length > 0 ? imageUrls : null,
        status: 'pending',
        customer_name: contactName,
        customer_email: contactEmail,
        customer_phone: formattedPhone,
        engraving_text: engravingText || null,
      });
      if (error) throw error;
      setSubmittedLeadId(leadId);

      // Fire-and-forget lead notification email
      const notifDetails: Record<string, string> = {};
      if (selections.nature) notifDetails['Nature'] = selections.nature;
      if (selections.shape) notifDetails['Shape'] = selections.shape;
      if (selections.size) notifDetails['Size'] = selections.size;
      if (selections.quality) notifDetails['Quality'] = selections.quality;
      if (selections.setting) notifDetails['Setting'] = selections.setting;
      if (selections.holder) notifDetails['Holder'] = selections.holder;
      if (selections.band) notifDetails['Band'] = selections.band;
      if (selections.band_width) notifDetails['Band Width'] = selections.band_width;
      if (selections.metal) notifDetails['Metal'] = selections.metal;
      if (selections.karat) notifDetails['Karat'] = selections.karat;
      if (selections.personalization) notifDetails['Personalization'] = selections.personalization;
      if (multiSelections.personalization && multiSelections.personalization.length) notifDetails['Personalization'] = multiSelections.personalization.join(', ');
      if (selections.timeline) notifDetails['Timeline'] = selections.timeline;
      if (budget) notifDetails['Budget'] = budget;
      if (ringSize) notifDetails['Ring Size'] = ringSize;
      if (additionalNotes) notifDetails['Notes'] = additionalNotes;
      if (otherDetails) notifDetails['Vision'] = otherDetails;
      if (inspirationUrls.length > 0) notifDetails['Inspiration Image'] = inspirationUrls.join(', ');
      if (engravingText) notifDetails['Engraving'] = engravingText;
      buildQuestionSummaryItems(ringQuestions, questionAnswers, questionTexts, questionFileUrls)
        .forEach(({ label, value }) => { notifDetails[label] = value; });
      supabase.functions.invoke('notify-form-lead', {
        body: {
          client_id: effectiveClientId,
          form_type: 'ring_builder',
          customer_name: contactName,
          customer_email: contactEmail,
          customer_phone: formattedPhone,
          details: notifDetails,
        },
      }).catch(err => console.error('Lead notification error:', err));

      setStoredNotifDetails(notifDetails);

      // Fire-and-forget customer confirmation email — sent unless the AI render is
      // delivered by email (the render email then carries the submission summary).
      const aiEnabled = (config as any)?.ai_image_enabled === true;
      if (!aiEnabled || getEffectiveAiImageDelivery(config?.ai_image_delivery, contactEmail) !== 'email') {
        supabase.functions.invoke('notify-customer-confirmation', {
          body: {
            client_id: effectiveClientId,
            form_type: 'ring_builder',
            customer_name: contactName,
            customer_email: contactEmail,
            details: notifDetails,
          },
        }).catch(err => console.error('Customer confirmation error:', err));
      }

      // Conversion tracking fires BEFORE any deposit checkout redirect —
      // otherwise deposit accounts never report the lead (the redirect returns
      // out of this handler).
      trackLead({ email: contactEmail, phone: formattedPhone, firstName: contactName, externalId: contactEmail }, leadId);

      if (isDepositMode) {
        const attributes: Record<string, string> = {};
        Object.entries(selections).forEach(([k, v]) => {
          attributes[k.charAt(0).toUpperCase() + k.slice(1)] = v;
        });
        if (ringSize) attributes['Ring Size'] = ringSize;
        if (budget) attributes['Estimated Budget'] = budget;
        if (additionalNotes) attributes['Additional Notes'] = additionalNotes;
        if (otherDetails) attributes['Vision / Description'] = otherDetails;
        if (engravingText) attributes['Personalized Inscription'] = engravingText;
        if (selections.timeline) attributes['Timeline'] = selections.timeline;
        // Custom questions
        buildQuestionSummaryItems(ringQuestions, questionAnswers, questionTexts, questionFileUrls)
          .forEach(({ label, value }) => { attributes[label] = value; });
        Object.entries(questionFileUrls).forEach(([key, fileUrl]) => {
          const q = ringQuestions.find(qq => qq.question_key === key);
          if (q && fileUrl) attributes[`${q.question_text} (file)`] = fileUrl;
        });
        attributes['Customer Name'] = contactName;
        attributes['Customer Email'] = contactEmail;
        attributes['Customer Phone'] = formattedPhone;

        const aiEnabled = (config as any)?.ai_image_enabled === true;
        if (aiEnabled) {
          // Defer checkout — show AI render first, then checkout button
          setDeferredCheckoutAttributes(attributes);
        } else {
          try {
            const { data, error: checkoutError } = await supabase.functions.invoke('shopify-form-checkout', {
              body: { clientId: effectiveClientId, formType: 'ring_builder', attributes }
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

      setSubmitted(true);
      
      toast.success('Ring design submitted successfully!');
    } catch (err: any) {
      console.error('Submit error:', err);
      toast.error('Failed to submit design. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Thank you screen ---
  if (submitted) {
    const aiEnabled = (config as any)?.ai_image_enabled === true;
    if (aiEnabled && submittedLeadId && effectiveClientId) {
      // Rebuild question answers map for AI generation
      const qaMap: Record<string, any> = {};
      ringQuestions.forEach(q => {
        const yesNo = questionAnswers[q.question_key];
        const text = questionTexts[q.question_key];
        if (yesNo !== null && yesNo !== undefined) qaMap[q.question_key] = yesNo;
        if (text) qaMap[q.question_key] = text;
      });

      return (
        <ThankYouErrorBoundary
          backgroundColor={theme.bg}
          fontColor={theme.font}
          accentColor={theme.accent}
        >
          <RingThankYou
            onReset={handleReset}
            backgroundColor={theme.bg}
            fontColor={theme.font}
            accentColor={theme.accent}
            leadId={submittedLeadId}
            clientId={effectiveClientId}
            customerName={contactName}
            customerEmail={contactEmail}
            ringConfig={{
              nature: selections.nature,
              shape: selections.shape,
              size: selections.size,
              quality: selections.quality,
              setting: selections.setting,
              holder: selections.holder,
              band: selections.band,
              band_width: selections.band_width,
              metal: selections.metal,
              karat: selections.karat,
              personalization: multiSelections.personalization,
              budget,
              ringSize,
              otherDetails: otherDetails || undefined,
              engravingText: engravingText || undefined,
              ...(Object.keys(qaMap).length > 0 ? { questionAnswers: qaMap } : {}),
            }}
            depositAmount={deferredCheckoutAttributes ? (depositAmount || undefined) : undefined}
            checkoutAttributes={deferredCheckoutAttributes || undefined}
            formType="ring_builder"
            submissionDetails={storedNotifDetails}
            extraSummaryItems={buildQuestionSummaryItems(ringQuestions, questionAnswers, questionTexts, questionFileUrls)}
            thankYouContact={config?.thank_you_contact}
            delivery={getEffectiveAiImageDelivery(config?.ai_image_delivery, contactEmail)}
          />
        </ThankYouErrorBoundary>
      );
    }
    const summaryItems = [
      { label: 'Nature', value: selections.nature || '' },
      { label: 'Shape', value: selections.shape || '' },
      { label: 'Size', value: selections.size || '' },
      { label: 'Quality', value: selections.quality || '' },
      { label: 'Setting', value: selections.setting || '' },
      { label: 'Band', value: selections.band || '' },
      { label: 'Metal', value: selections.metal || '' },
      { label: 'Karat', value: selections.karat || '' },
      { label: 'Budget', value: budget || '' },
      { label: 'Ring Size', value: ringSize || '' },
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

  // --- Build steps dynamically ---
  const steps: WizardStep[] = [];

  const getCarouselCards = (stepKey: string, opts: { value: string; label: string; image?: string }[]): CarouselCard[] => {
    const filtered = opts.filter(o => o.image);
    const fp = filtered.map(o => `${o.value}|${o.image}`).join('§');
    const cache = cardsCacheRef.current;
    const cached = cache.get(stepKey);
    if (cached && cached.fp === fp) return cached.cards;
    const cards: CarouselCard[] = filtered.map(o => ({ value: o.value, label: o.label, image: o.image! }));
    cache.set(stepKey, { fp, cards });
    return cards;
  };

  // Option-based steps
  STEP_DEFS.forEach(def => {
    if (!isStepEnabled(def.key)) return;
    const opts = getStepOptions(def.key, def.table);
    if (opts.length === 0) return;

    const hasImages = def.useCarousel && opts.some(o => o.image);

    if ('multiSelect' in def && def.multiSelect) {
      const selected = multiSelections[def.key] || [];
      const multiHasImages = opts.some(o => o.image);
      const toggleMulti = (value: string) => {
        setMultiSelections(prev => {
          const cur = prev[def.key] || [];
          return { ...prev, [def.key]: cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value] };
        });
      };
      steps.push({
        key: def.key,
        label: def.label,
        content: (
          <div className="space-y-6">
            <StepHeading {...getLabel(def.key, def.heading[0], def.heading[1], def.subtitle)} accentColor={theme.accent} fontColor={theme.font} />
            {multiHasImages ? (
              <CardCarouselMulti
                cards={opts.filter(o => o.image).map(o => ({ value: o.value, label: o.label, image: o.image! }))}
                selectedValues={selected}
                onToggle={toggleMulti}
                accentColor={theme.accent}
                fontColor={theme.font}
              />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 px-4 md:px-8 max-w-3xl mx-auto w-full">
                {opts.map((opt, index) => {
                  const isSelected = selected.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => toggleMulti(opt.value)}
                      className="relative flex flex-col items-center gap-2 group transition-all duration-200 hover:scale-[1.03] animate-fade-in px-4 py-3 rounded-xl text-sm md:text-base font-semibold uppercase tracking-wide border-2"
                      style={{
                        backgroundColor: isSelected ? theme.accent : 'transparent',
                        borderColor: isSelected ? theme.accent : 'rgba(255,255,255,0.15)',
                        color: isSelected ? '#fff' : theme.font,
                        opacity: isSelected ? 1 : 0.8,
                        animationDelay: `${index * 25}ms`,
                        animationFillMode: 'both',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ),
      });
    } else if (hasImages) {
      // C1: Same opts array is rebuilt every render, but the inner card list is
      // stable for the same options. Cache by a structural key so CardCarousel
      // children don't re-mount and re-fetch images on each parent render.
      const cards: CarouselCard[] = getCarouselCards(def.key, opts);
      if (cards.length > 0) {
        steps.push({
          key: def.key,
          label: def.label,
          content: (
            <div className="space-y-6">
              <StepHeading {...getLabel(def.key, def.heading[0], def.heading[1], def.subtitle)} accentColor={theme.accent} fontColor={theme.font} />
              <CardCarousel cards={cards} selectedValue={selections[def.key] || ''} onSelect={(v) => { setSelections(prev => ({ ...prev, [def.key]: v })); autoAdvance(); }} accentColor={theme.accent} fontColor={theme.font} />
            </div>
          ),
        });
      } else {
        steps.push({
          key: def.key,
          label: def.label,
          content: (
            <div className="space-y-6">
              <StepHeading {...getLabel(def.key, def.heading[0], def.heading[1], def.subtitle)} accentColor={theme.accent} fontColor={theme.font} />
              <WizardOptionGrid
                options={opts}
                selectedValue={selections[def.key] || ''}
                onSelect={(v) => { setSelections(prev => ({ ...prev, [def.key]: v })); autoAdvance(); }}
                columns={opts.length <= 4 ? 2 : 3}
                accentColor={theme.accent}
                fontColor={theme.font}
              />
            </div>
          ),
        });
      }
    } else {
      steps.push({
        key: def.key,
        label: def.label,
        content: (
          <div className="space-y-6">
            <StepHeading {...getLabel(def.key, def.heading[0], def.heading[1], def.subtitle)} accentColor={theme.accent} fontColor={theme.font} />
            <WizardOptionGrid
              options={opts}
              selectedValue={selections[def.key] || ''}
              onSelect={(v) => { setSelections(prev => ({ ...prev, [def.key]: v })); autoAdvance(); }}
              columns={opts.length <= 4 ? 2 : 3}
              accentColor={theme.accent}
              fontColor={theme.font}
            />
          </div>
        ),
      });
    }
  });

  // Description step (Describe Your Vision)
  if (isStepEnabled('description')) {
    steps.push({
      key: 'description',
      label: 'VISION',
      content: (
        <div className="space-y-6">
          <StepHeading {...getLabel('description', 'DESCRIBE YOUR', 'VISION', 'Tell us about your dream ring')} accentColor={theme.accent} fontColor={theme.font} />
          <div className="max-w-lg mx-auto w-full px-4 md:px-8 space-y-5">
            <AiVisionTextarea
              label="Describe your vision"
              value={otherDetails}
              onChange={setOtherDetails}
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

  // Inspiration step (Upload + Ring Size)
  if (isStepEnabled('inspiration')) {
    steps.push({
      key: 'inspiration',
      label: 'INSPIRATION',
      content: (
        <div className="space-y-6">
          <StepHeading {...getLabel('inspiration', 'ADD', 'INSPIRATION', 'Upload reference images and provide details')} accentColor={theme.accent} fontColor={theme.font} />
          <div className="max-w-lg mx-auto w-full px-4 md:px-8 space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-semibold uppercase tracking-wider" style={{ color: `${theme.font}99` }}>Ring Size</Label>
              <Input
                value={ringSize}
                onChange={e => setRingSize(e.target.value)}
                placeholder="e.g. 7, 8.5"
                className="bg-transparent border-2 rounded-xl"
                style={{ backgroundColor: 'transparent', borderColor: `${theme.font}26`, color: theme.font }}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-semibold uppercase tracking-wider" style={{ color: `${theme.font}99` }}>Upload Images</Label>
              <Input
                type="file"
                accept="image/*"
                multiple
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length === 0 || !effectiveClientId) return;
                  // Refresh the AbortController for this upload batch (C8).
                  uploadAbortRef.current?.abort();
                  const controller = new AbortController();
                  uploadAbortRef.current = controller;

                  setInspirationUploading(true);
                  const urls: string[] = [];
                  const names: string[] = [];
                  const failed: string[] = [];
                  // 3× retry with linear backoff per file (D7).
                  for (const file of files) {
                    if (controller.signal.aborted) break;
                    let url: string | null = null;
                    for (let attempt = 0; attempt < 3 && !url; attempt++) {
                      if (controller.signal.aborted) break;
                      url = await uploadSingleFormImage(effectiveClientId, file);
                      if (!url && attempt < 2) {
                        await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
                      }
                    }
                    if (url) {
                      urls.push(url);
                      names.push(file.name);
                    } else {
                      failed.push(file.name);
                    }
                  }
                  if (controller.signal.aborted) return;
                  setInspirationUrls(prev => [...prev, ...urls]);
                  setInspirationFileNames(prev => [...prev, ...names]);
                  setInspirationUploading(false);
                  if (failed.length > 0) {
                    toast.error(`Failed to upload ${failed.length} file(s) after 3 retries`);
                  }
                }}
                className="cursor-pointer bg-transparent border-2 rounded-xl file:text-current"
                style={{ backgroundColor: 'transparent', color: theme.font, borderColor: `${theme.font}26` }}
              />
              {inspirationUploading && (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" style={{ color: theme.accent }} />
                  <p className="text-xs" style={{ color: `${theme.font}80` }}>Uploading...</p>
                </div>
              )}
              {inspirationFileNames.length > 0 && !inspirationUploading && (
                <p className="text-xs" style={{ color: `${theme.font}80` }}>✓ {inspirationFileNames.length} file(s) uploaded</p>
              )}
            </div>
          </div>
        </div>
      ),
    });
  }

  // Engraving step
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
                Personalized Inscription <span className="text-xs font-normal normal-case">(Optional)</span>
              </Label>
              <Input
                value={engravingText}
                onChange={e => { if (e.target.value.length <= ENGRAVING_MAX_LENGTH) setEngravingText(e.target.value); }}
                placeholder="e.g. Forever Yours, J&M"
                maxLength={ENGRAVING_MAX_LENGTH}
                className="bg-transparent border-2 rounded-xl"
                style={{ backgroundColor: 'transparent', borderColor: `${theme.font}26`, color: theme.font }}
              />
              {engravingText && (
                <p className="text-xs text-right" style={{ color: `${theme.font}60` }}>{engravingText.length}/{ENGRAVING_MAX_LENGTH}</p>
              )}
              {engravingText.length > ENGRAVING_ADVISORY_THRESHOLD && (
                <p className="text-xs" style={{ color: `${theme.font}80` }}>
                  Some thin bands may not fit longer engravings.
                </p>
              )}
            </div>
          </div>
        </div>
      ),
    });
  }

  // Budget & Timeline step (combined)
  if (isStepEnabled('budget') || isStepEnabled('timeline')) {
    steps.push({
      key: 'budget',
      label: 'BUDGET',
      content: (
        <div className="space-y-6">
          <StepHeading {...getLabel('budget', 'BUDGET &', 'TIMELINE', 'Select your budget range and timeline')} accentColor={theme.accent} fontColor={theme.font} />
          <div className="max-w-lg mx-auto w-full px-4 md:px-8 space-y-5">
            {isStepEnabled('budget') && (
              <WizardOptionGrid
                options={budgetOptions.map(b => ({ value: b, label: b }))}
                selectedValue={budget}
                onSelect={(v) => setBudget(v)}
                columns={2}
                accentColor={theme.accent}
                fontColor={theme.font}
              />
            )}
            {isStepEnabled('timeline') && timelineOptions.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-semibold uppercase tracking-wider text-center block" style={{ color: `${theme.font}99` }}>Timeline</Label>
                <WizardOptionGrid
                  options={timelineOptions.map(t => ({ value: t, label: t }))}
                  selectedValue={selections.timeline || ''}
                  onSelect={(v) => setSelections(prev => ({ ...prev, timeline: v }))}
                  columns={2}
                  accentColor={theme.accent}
                  fontColor={theme.font}
                />
              </div>
            )}
          </div>
        </div>
      ),
    });
  }

  // Questions steps (one per custom question)
  if (ringQuestions.length > 0 && isStepEnabled('questions')) {
    ringQuestions.forEach(q => {
      // Split question_text into pre-text + highlight for heading
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
              <WizardDynamicQuestion
                hideLabel
                question={q}
                answer={questionAnswers[q.question_key] ?? null}
                textValue={questionTexts[q.question_key] || ''}
                fileValue={null}
                fileUrl={questionFileUrls[q.question_key] || null}
                fileName={questionFileNames[q.question_key] || null}
                isUploading={!!questionFileUploading[q.question_key]}
                onAnswerChange={val => setQuestionAnswers(prev => ({ ...prev, [q.question_key]: val }))}
                onTextChange={val => setQuestionTexts(prev => ({ ...prev, [q.question_key]: val }))}
                onFileChange={async (file) => {
                  if (!file || !effectiveClientId) return;
                  setQuestionFileUploading(prev => ({ ...prev, [q.question_key]: true }));
                  // 3× retry with linear backoff (D7) — keeps logic identical
                  // (still resolves to a single URL or null) while no longer
                  // silently dropping transient network failures.
                  let url: string | null = null;
                  for (let attempt = 0; attempt < 3 && !url; attempt++) {
                    url = await uploadSingleFormImage(effectiveClientId, file);
                    if (!url && attempt < 2) {
                      await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
                    }
                  }
                  setQuestionFileUploading(prev => ({ ...prev, [q.question_key]: false }));
                  if (url) {
                    setQuestionFileUrls(prev => ({ ...prev, [q.question_key]: url }));
                    setQuestionFileNames(prev => ({ ...prev, [q.question_key]: file.name }));
                  } else {
                    toast.error('Failed to upload file after 3 retries');
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

  // Contact step (final step)
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

  const contactHasValues = contactName.trim() && contactEmail.trim() && contactPhone.trim();

  // Check all required questions are answered
  const allRequiredQuestionsAnswered = ringQuestions
    .filter(q => q.is_required && q.is_enabled)
    .every(q => {
      if (q.question_type === 'file') return !!questionFileUrls[q.question_key];
      if (q.question_type === 'text') return !!questionTexts[q.question_key]?.trim();
      if (q.question_type === 'dropdown' || q.question_type === 'custom_options') return !!questionTexts[q.question_key];
      // yes/no default
      return questionAnswers[q.question_key] !== null && questionAnswers[q.question_key] !== undefined;
    });

  // NOTE: getNextLabel / getSelectedLabel are defined further below after sortedSteps is built.

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
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(0, prev - 1));
  };

  // Sort steps by step_order if configured
  const orderedSteps = stepOrder
    ? [...steps].sort((a, b) => {
        const ai = stepOrder.indexOf(a.key);
        const bi = stepOrder.indexOf(b.key);
        if (ai === -1 && bi === -1) return 0;
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      })
    : steps;

  // Apply step grouping: merge grouped keys into single combined steps
  const sortedSteps: WizardStep[] = (() => {
    if (!configStepGroups || configStepGroups.length === 0) return orderedSteps;

    const stepMap = new Map(orderedSteps.map(s => [s.key, s]));
    const placed = new Set<string>();
    const result: WizardStep[] = [];

    // First, place grouped steps in order of appearance
    for (const group of configStepGroups) {
      const groupSteps = group.map(k => stepMap.get(k)).filter((s): s is WizardStep => !!s);
      if (groupSteps.length === 0) continue;
      groupSteps.forEach(s => placed.add(s.key));
      
      if (groupSteps.length === 1) {
        result.push(groupSteps[0]);
      } else {
        // Merge into a single combined step
        result.push({
          key: groupSteps.map(s => s.key).join('+'),
          label: groupSteps[0].label,
          content: (
            <div className="space-y-8">
              {groupSteps.map(s => (
                <div key={s.key}>{s.content}</div>
              ))}
            </div>
          ),
        });
      }
    }

    // Then add any remaining steps not in any group
    for (const step of orderedSteps) {
      if (!placed.has(step.key)) {
        result.push(step);
      }
    }

    return result;
  })();

  // --- Navigation labels (computed against sortedSteps so reorder + grouping reflect) ---
  const isLastStep = currentStep === sortedSteps.length - 1;
  const currentSortedKey = sortedSteps[currentStep]?.key || '';
  // A grouped step has key like "a+b+c" — treat as containing all sub-keys.
  const currentKeys = currentSortedKey.split('+');
  const isContactStep = currentKeys.includes('contact');
  const isQuestionsStep = currentKeys.includes('questions');

  const getNextLabel = () => {
    if (isLastStep) return 'GENERATE AI RENDER >';
    return 'NEXT';
  };

  const getSelectedLabel = () => {
    // For grouped steps, show the first sub-key's selection if any
    for (const k of currentKeys) {
      const sel = selections[k];
      if (sel) return `${sel.toUpperCase().replace(/-/g, ' ')} SELECTED`;
      const multi = multiSelections[k];
      if (multi?.length) return `${multi.length} SELECTED`;
    }
    return undefined;
  };

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
      aiEnabled={(config as any)?.ai_image_enabled === true}
    />
  );
}
