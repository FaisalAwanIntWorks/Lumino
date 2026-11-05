import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useScreenshotProtection } from '@/hooks/useScreenshotProtection';
import { useEmbedAutoHeight } from '@/hooks/useEmbedAutoHeight';

import { DiamondFormWelcome } from '@/components/diamonds-form/DiamondFormWelcome';
import { RingBuilderWizardForm } from '@/components/ring-builder-wizard/RingBuilderWizardForm';
import { useClientRingFormConfig } from '@/hooks/useClientRingFormConfig';
import { useClientDttFormConfig } from '@/hooks/useClientDttFormConfig';
import { usePrefetchDiamondFormOptions } from '@/hooks/useDiamondFormOptions';
import { initMetaPixel, trackMetaEvent } from '@/lib/meta-pixel';
import { sendMetaCapiEvent } from '@/lib/meta-capi';
import { initClientTracking } from '@/lib/conversion-tracking';
import { initGTM, pushToDataLayer } from '@/lib/google-tag';
import { DiamondTypeStep } from '@/components/diamonds-form/DiamondTypeStep';
import { DiamondShapeStep } from '@/components/diamonds-form/DiamondShapeStep';
import { DiamondSizeStep } from '@/components/diamonds-form/DiamondSizeStep';
import { DiamondQualityStep } from '@/components/diamonds-form/DiamondQualityStep';
import { DiamondSettingStep } from '@/components/diamonds-form/DiamondSettingStep';
import { DiamondHolderStep } from '@/components/diamonds-form/DiamondHolderStep';
import { DiamondBandStep } from '@/components/diamonds-form/DiamondBandStep';
import { DiamondBandWidthStep } from '@/components/diamonds-form/DiamondBandWidthStep';
import { DiamondMetalStep } from '@/components/diamonds-form/DiamondMetalStep';
import { DiamondPersonalizationStep } from '@/components/diamonds-form/DiamondPersonalizationStep';
import { DiamondInspirationStep } from '@/components/diamonds-form/DiamondInspirationStep';
import { DiamondRingSizeStep } from '@/components/diamonds-form/DiamondRingSizeStep';
import { mergeStepOrder } from '@/components/diamonds-form/step-order';
import { DiamondTimelineStep } from '@/components/diamonds-form/DiamondTimelineStep';
import { DiamondContactStep, ContactFormData } from '@/components/diamonds-form/DiamondContactStep';
import { DiamondEstimateSummary } from '@/components/diamonds-form/DiamondEstimateSummary';
import { trackWidgetView } from '@/lib/analytics-utils';
import AccessDenied from './AccessDenied';
import { isTrustedReferrer } from '@/lib/trusted-referrer';
import type { DiamondFormData, DiamondType, DiamondShape, DiamondSize, DiamondQuality, DiamondSetting, DiamondHolder, DiamondBand, DiamondBandWidth, DiamondMetal, DiamondMetalKarat, DiamondTwoToneMetals, DiamondPersonalization, DiamondTimeline } from '@/pages/client/DiamondsForm';
import { useClientCurrency } from '@/hooks/useClientCurrency';
import { buildQuoteEstimatorVars, isGlassQuoteEstimator, isQuoteThemePreview, QUOTE_THEME_META, resolveQuoteEstimatorTheme, resolveQuoteTheme } from '@/lib/quote-estimator-theme';
import { QuoteVersionContext, QuoteThemeContext, QuoteTestPreviewContext, isQuoteTestPreview, resolveQuoteVersion } from '@/lib/quote-estimator-version';
import { QuoteV3 } from '@/components/diamonds-form/QuoteV3';
import { DiamondPickerStep } from '@/components/diamonds-form/DiamondPickerStep';
import { isQuoteDiamondPickerEnabled, quoteDiamondQualityValue, resolveQuoteDiamondPickerConfig, type QuoteSelectedDiamond } from '@/lib/quote-estimator-diamonds';

/**
 * Public embeddable Diamonds Form page.
 * Routes: /embed-diamonds/:clientId (Ring Builder wizard) and
 *         /embed-quote/:clientId   (Quote Estimator Form)
 * This page is designed to be embedded in an iframe on external websites.
 */
const DTT_CLIENT_ID = 'aeec6491-bd1f-4787-97f9-6a47a2ddc8af';

export default function EmbedDiamondsForm() {
  useScreenshotProtection('full');
  useEmbedAutoHeight();
  const { clientId } = useParams();
  const [searchParams] = useSearchParams();
  const { pathname } = useLocation();
  const isDTT = clientId === DTT_CLIENT_ID;
  // Quote Estimator Form (classic step-by-step engine): always for DTT, and for
  // every other client on its own /quote (or dev /embed-quote) path. The legacy
  // `?variant=dtt` query still works so embeds already installed on client
  // websites keep rendering the Quote Estimator.
  const isQuoteRoute = /^\/(quote|embed-quote)\//.test(pathname);
  const isClassicMode = isDTT || isQuoteRoute || searchParams.get('variant') === 'dtt';
  const [domainAuthorized, setDomainAuthorized] = useState<boolean | null>(null);
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null);
  // Module is on but billing blocks it (failed payment / cancelled subscription).
  const [billingBlocked, setBillingBlocked] = useState(false);
  const [metaPixelId, setMetaPixelId] = useState<string | null>(null);
  const { currency } = useClientCurrency(clientId);
  const { config: ringFormConfig, loading: ringConfigLoading } = useClientRingFormConfig(isClassicMode ? null : (clientId || null));
  const { data: liveConfig, isLoading: liveLoading } = useClientDttFormConfig(isClassicMode ? (clientId || null) : null);
  const version = resolveQuoteVersion(clientId, liveConfig?.live_version, searchParams.get('quoteVersion'));
  const { data: v1Config, isLoading: v1Loading } = useClientDttFormConfig(isClassicMode && version === 'v1' ? (clientId || null) : null, 'v1');
  const { data: v3Config, isLoading: v3Loading } = useClientDttFormConfig(isClassicMode && version === 'v3' ? (clientId || null) : null, 'v3');
  const dttConfig = version === 'v1' ? v1Config : version === 'v3' ? v3Config : liveConfig;
  // Theme 1 · Classic or Theme 2 · Glass: the account's saved choice, or a
  // dashboard test link (?quoteTheme=). The Sandbox lab keeps V2 = glass.
  const quoteTheme = resolveQuoteTheme(clientId, version, liveConfig?.form_content, searchParams.get('quoteTheme'));
  const useGlass = quoteTheme === 'glass';
  const useQuoteScroll = isClassicMode && version !== 'v3';
  const themePreview = isQuoteThemePreview(clientId, searchParams.get('quoteTheme'));
  const testPreview = isQuoteTestPreview(clientId, searchParams.get('quoteVersion')) || themePreview;
  // Fetch the option set + warm its CDN images while the visitor is still on
  // the welcome screen, so each step renders from cache instead of downloading.
  // Prefetch is mounted inside the version provider below, so the summary,
  // option steps, and preload always use the same per-version cache key.
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<DiamondFormData>({
    diamondType: null,
    diamondShape: null,
    diamondSize: null,
    diamondQuality: null,
    diamondSetting: null,
    diamondHolder: null,
    diamondBand: null,
    diamondBandWidth: [],
    diamondMetal: null,
    diamondMetalKarat: null,
    diamondTwoToneMetals: null,
    diamondPersonalization: [],
    inspirationImages: [],
    ringSize: '',
    otherDetails: '',
    diamondTimeline: null,
    contactInfo: null,
  });

  // Feature access check — read via the SECURITY DEFINER RPC because the
  // `clients` table is not readable by the anon role used in public iframe
  // embeds. A direct `.from('clients')` read returns null for anon, which made
  // this check fail open (widget stayed enabled even when RingOS was toggled
  // off). Re-checked on an interval + tab focus so toggling the module off/on
  // takes effect on already-open widgets without a manual refresh.
  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    const checkFeatureAccess = async () => {
      try {
        const { data } = await supabase
          .rpc('get_client_branding', { client_uuid: clientId });
        if (cancelled) return;
        const features = (data?.[0]?.enabled_features ?? null) as Record<string, boolean> | null;
        // Billing gate (get_client_subscription_active): off on a failed
        // payment or cancelled subscription. Test/theme previews never write a
        // lead, so they stay viewable.
        const subscriptionActive = testPreview || data?.[0]?.subscription_active !== false;
        // Quote Estimator Form (DTT V2) — gated by explicit dtt_v2 toggle.
        // Default OFF: only enabled when admin explicitly turns it on.
        const moduleOn = isClassicMode
          ? features?.dtt_v2 === true
          : features?.diamond_form !== false;
        setBillingBlocked(moduleOn && !subscriptionActive);
        setFeatureEnabled(moduleOn && subscriptionActive);
      } catch {
        // Fail open on transient RPC errors — domain check still gates access.
        if (!cancelled) setFeatureEnabled(true);
      }
    };
    checkFeatureAccess();
    const interval = setInterval(checkFeatureAccess, 30_000);
    const onVisible = () => { if (document.visibilityState === 'visible') checkFeatureAccess(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [clientId, testPreview]);

  // Domain whitelisting check (mirrors EmbedConfigurator logic)
  useEffect(() => {
    const checkDomainAuthorization = async () => {
      if (!clientId) return;

      const referrer = document.referrer;
      const isSameOrigin = isTrustedReferrer(referrer, window.location.hostname);
      // Shared test links (Sandbox V3, and the Theme 1 / Theme 2 preview links
      // any account can send to its jeweler) may be opened from a messenger or
      // an email client. Only standalone previews bypass the referrer
      // whitelist; iframe embeds still require an allowed host. A preview never
      // saves a lead or reaches the CRM, email or ads.
      const isStandalonePreview = testPreview && window.self === window.top && (version === 'v3' || themePreview);

      if (isSameOrigin || isStandalonePreview) {
        setDomainAuthorized(true);
      }

      try {
        const { data: clientData, error } = await supabase
          .rpc('get_client_branding', { client_uuid: clientId });

        if (error && (error as any).code !== 'PGRST116') throw error;

        const client = clientData?.[0];

        if (!testPreview && client?.meta_pixel_id) {
          setMetaPixelId(client.meta_pixel_id as string);
          initMetaPixel(client.meta_pixel_id as string);
        }

        // Google Ads / GTM tags (no-op unless the client configured them)
        if (!testPreview) initClientTracking(client);

        // Initialize GTM for DTT client
        if (isDTT && !testPreview) {
          initGTM('GTM-W5ZLL4TN');
          pushToDataLayer('page_view', { page_type: 'diamond_form', client: 'dtt' });
        }

        if (isSameOrigin || isStandalonePreview) return;

        const allowedDomains = (client?.allowed_domains || []) as string[];

        if (allowedDomains.length === 0) {
          setDomainAuthorized(true);
          return;
        }

        const referrerUrl = new URL(referrer);
        const referrerDomain = referrerUrl.hostname;

        const isAuthorized = allowedDomains.some(domain =>
          referrerDomain === domain || referrerDomain.endsWith(`.${domain}`)
        );

        setDomainAuthorized(isAuthorized);
      } catch (error) {
        console.error('Domain check error:', error);
        setDomainAuthorized(true);
      }
    };

    checkDomainAuthorization();
  }, [clientId, testPreview, themePreview, version]);

  // Track widget view once domain is authorized
  useEffect(() => {
    if (domainAuthorized && featureEnabled && clientId && !testPreview) {
      void trackWidgetView(clientId, 'ring_builder');
    }
  }, [domainAuthorized, featureEnabled, clientId, testPreview]);

  // Quote Estimator: every new step starts at the top, and the host page is
  // asked to bring the widget back into view if it scrolled past it.
  useEffect(() => {
    if (!useQuoteScroll) return;
    try {
      window.scrollTo({ top: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
      window.parent?.postMessage(JSON.stringify({ type: 'aurezo-scroll-top' }), '*');
    } catch { /* cross-origin safety */ }
  }, [currentStep, useQuoteScroll]);

  // Build the ordered list of active step keys from the DTT config.
  // MUST be declared before any early return to satisfy the rules of hooks.
  const ALL_CONFIGURABLE = ['nature','shape','size','quality','setting','holder','band','band_width','metal','personalization','inspiration','ring_size','timeline'];
  const orderedStepKeys = useMemo(() => {
    const enabled = dttConfig?.enabled_steps || {};
    // Saved order first; steps added since the client last saved slot in at
    // their default position (see mergeStepOrder).
    const ordered = mergeStepOrder(dttConfig?.step_order, ALL_CONFIGURABLE);
    const active = ordered.filter(k => enabled[k] !== false);
    return ['welcome', ...active, 'contact', 'summary'];
  }, [dttConfig]);

  // Show nothing while checking
  if (domainAuthorized === null || featureEnabled === null) {
    return null;
  }

  // Block unauthorized domains or disabled feature
  if (!domainAuthorized) {
    return <AccessDenied reason="unauthorized_domain" message="This embed is not authorized to load on this domain." />;
  }
  if (!featureEnabled) {
    return billingBlocked
      ? <AccessDenied reason="billing_paused" />
      : <AccessDenied reason="unauthorized_domain" message="This widget is not enabled for this account." />;
  }



  const goNext = () => setCurrentStep(s => Math.min(s + 1, orderedStepKeys.length - 1));
  const handleStart = () => goNext();
  const handleBack = () => { if (currentStep > 0) setCurrentStep(currentStep - 1); };

  // Sandbox "mini Nivoda" picker: an exact stone is tied to the type / shape /
  // carat it was listed under, so changing any of those clears it.
  const diamondPicker = isQuoteDiamondPickerEnabled(clientId, dttConfig?.form_content);
  const diamondPickerConfig = resolveQuoteDiamondPickerConfig(dttConfig?.form_content);
  const handleSelectDiamondType = (type: DiamondType) => { setFormData(prev => ({ ...prev, diamondType: type, ...(prev.selectedDiamond && prev.diamondType !== type ? { selectedDiamond: null, diamondQuality: null } : {}) })); goNext(); };
  const handleSelectShape = (shape: DiamondShape) => { setFormData(prev => ({ ...prev, diamondShape: shape, ...(prev.selectedDiamond && prev.diamondShape !== shape ? { selectedDiamond: null, diamondQuality: null } : {}) })); goNext(); };
  const handleSelectSize = (size: DiamondSize) => { setFormData(prev => ({ ...prev, diamondSize: size, ...(prev.selectedDiamond && prev.diamondSize !== size ? { selectedDiamond: null, diamondQuality: null } : {}) })); goNext(); };
  const handleSelectQuality = (quality: DiamondQuality) => { setFormData(prev => ({ ...prev, diamondQuality: quality, selectedDiamond: null })); goNext(); };
  const handleSelectDiamond = (diamond: QuoteSelectedDiamond) => { setFormData(prev => ({ ...prev, selectedDiamond: diamond, diamondQuality: quoteDiamondQualityValue(diamond) })); goNext(); };
  const handleSelectSetting = (setting: DiamondSetting) => { setFormData(prev => ({ ...prev, diamondSetting: setting })); goNext(); };
  const handleSelectHolder = (holder: DiamondHolder) => { setFormData(prev => ({ ...prev, diamondHolder: holder })); goNext(); };
  const handleSelectBand = (band: DiamondBand) => { setFormData(prev => ({ ...prev, diamondBand: band })); goNext(); };
  const handleSelectBandWidth = (widths: DiamondBandWidth) => { setFormData(prev => ({ ...prev, diamondBandWidth: widths })); if (widths.length > 0) goNext(); };
  // Metal selection no longer advances by itself: the step calls `onNext`
  // once a karat is chosen (or immediately when the metal has no variants).
  const handleSelectMetal = (metal: DiamondMetal) => { setFormData(prev => ({ ...prev, diamondMetal: metal, diamondMetalKarat: null, diamondTwoToneMetals: null })); };
  const handleSelectMetalKarat = (karat: DiamondMetalKarat) => { setFormData(prev => ({ ...prev, diamondMetalKarat: karat })); };
  const handleSelectTwoToneMetals = (combo: DiamondTwoToneMetals) => { setFormData(prev => ({ ...prev, diamondTwoToneMetals: combo })); };
  const handleMetalNext = () => goNext();
  const handleSelectPersonalization = (features: DiamondPersonalization) => { setFormData(prev => ({ ...prev, diamondPersonalization: features })); };
  const handlePersonalizationNext = () => { goNext(); };
  const handleUpdateInspiration = (data: { inspirationImages: File[]; ringSize: string; otherDetails: string }) => {
    setFormData(prev => ({ ...prev, inspirationImages: data.inspirationImages, ringSize: data.ringSize, otherDetails: data.otherDetails }));
  };
  const handleInspirationNext = () => goNext();
  const handleRingSizeChange = (ringSize: string) => setFormData(prev => ({ ...prev, ringSize }));
  const handleRingSizeNext = () => goNext();
  const handleSelectTimeline = (timeline: DiamondTimeline) => { setFormData(prev => ({ ...prev, diamondTimeline: timeline })); goNext(); };
  const handleContactSubmit = (contactData: ContactFormData) => {
    setFormData(prev => ({ ...prev, contactInfo: contactData }));
    // DTT-only: fire Meta Pixel + CAPI Lead event when user submits contact step
    if (isDTT && clientId) {
      const leadEventId = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
        ? crypto.randomUUID()
        : `lead-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try { sessionStorage.setItem('dtt_meta_lead_event_id', leadEventId); } catch {}
      try {
        sessionStorage.setItem('dtt_meta_user_data', JSON.stringify({
          email: contactData.email,
          phone: `${contactData.countryCode}${contactData.phoneNumber}`,
          firstName: contactData.firstName,
        }));
      } catch {}

      trackMetaEvent(
        'Lead',
        { content_name: 'Ring Builder', content_category: 'diamond_form' },
        { eventID: leadEventId }
      );
      void sendMetaCapiEvent({
        clientId,
        eventName: 'Lead',
        eventId: leadEventId,
        userData: {
          email: contactData.email,
          phone: `${contactData.countryCode}${contactData.phoneNumber}`,
          firstName: contactData.firstName,
          externalId: contactData.email,
        },
        customData: { content_name: 'Ring Builder', content_category: 'diamond_form' },
      });
    }
    goNext();
  };

  const NATURAL_FLOW_SHAPES = ['ruby-sapphire-emerald'];
  const isNaturalFlow = formData.diamondType === 'natural' || NATURAL_FLOW_SHAPES.includes(formData.diamondShape || '');
  const showPrices = !isNaturalFlow;

  const renderStep = () => {
    const key = orderedStepKeys[currentStep] ?? 'welcome';
    // Per-step heading/sub-heading overrides (empty falls back to defaults).
    const sh = dttConfig?.form_content?.stepHeadings || {};
    switch (key) {
      case 'welcome': return <DiamondFormWelcome onStart={handleStart} title={dttConfig?.welcome_title} subtitle={dttConfig?.welcome_subtitle} />;
      case 'nature': return <DiamondTypeStep selected={formData.diamondType} onSelect={handleSelectDiamondType} onBack={handleBack} clientId={clientId} title={sh.nature?.title} subtitle={sh.nature?.subtitle} />;
      case 'shape': return <DiamondShapeStep selected={formData.diamondShape} onSelect={handleSelectShape} onBack={handleBack} clientId={clientId} title={sh.shape?.title} subtitle={sh.shape?.subtitle} />;
      case 'size': return <DiamondSizeStep selected={formData.diamondSize} onSelect={handleSelectSize} onBack={handleBack} showPrices={showPrices} selectedShape={formData.diamondShape} clientId={clientId} title={sh.size?.title} subtitle={sh.size?.subtitle} />;
      case 'quality': if (diamondPicker) return <DiamondPickerStep clientId={clientId} stoneType={formData.diamondType} shape={formData.diamondShape} size={formData.diamondSize} limit={diamondPickerConfig.limit} selected={formData.selectedDiamond} onSelect={handleSelectDiamond} onBack={handleBack} title={sh.quality?.title} subtitle={sh.quality?.subtitle} currency={currency} />;
        return <DiamondQualityStep selected={formData.diamondQuality} onSelect={handleSelectQuality} onBack={handleBack} showPrices={showPrices} clientId={clientId} title={sh.quality?.title} subtitle={sh.quality?.subtitle} currency={currency} />;
      case 'setting': return <DiamondSettingStep selected={formData.diamondSetting} onSelect={handleSelectSetting} onBack={handleBack} showPrices={showPrices} clientId={clientId} title={sh.setting?.title} subtitle={sh.setting?.subtitle} />;
      case 'holder': return <DiamondHolderStep selected={formData.diamondHolder} onSelect={handleSelectHolder} onBack={handleBack} showPrices={showPrices} clientId={clientId} title={sh.holder?.title} subtitle={sh.holder?.subtitle} currency={currency} />;
      case 'band': return <DiamondBandStep selected={formData.diamondBand} onSelect={handleSelectBand} onBack={handleBack} showPrices={showPrices} clientId={clientId} title={sh.band?.title} subtitle={sh.band?.subtitle} currency={currency} />;
      case 'band_width': return <DiamondBandWidthStep selected={formData.diamondBandWidth} onSelect={handleSelectBandWidth} onBack={handleBack} showPrices={showPrices} clientId={clientId} title={sh.band_width?.title} subtitle={sh.band_width?.subtitle} currency={currency} />;
      case 'metal': return <DiamondMetalStep selected={formData.diamondMetal} onSelect={handleSelectMetal} selectedKarat={formData.diamondMetalKarat} onSelectKarat={handleSelectMetalKarat} selectedCombo={formData.diamondTwoToneMetals} onSelectCombo={handleSelectTwoToneMetals} onNext={handleMetalNext} karatConfig={dttConfig?.form_content?.metalKarats} comboConfig={dttConfig?.form_content?.twoToneCombos} onBack={handleBack} showPrices={showPrices} clientId={clientId} title={sh.metal?.title} subtitle={sh.metal?.subtitle} currency={currency} />;
      case 'personalization': return <DiamondPersonalizationStep selected={formData.diamondPersonalization} onSelect={handleSelectPersonalization} onNext={handlePersonalizationNext} onBack={handleBack} showPrices={showPrices} clientId={clientId} title={sh.personalization?.title} subtitle={sh.personalization?.subtitle} currency={currency} />;
      case 'inspiration': return <DiamondInspirationStep inspirationImages={formData.inspirationImages} ringSize={formData.ringSize} otherDetails={formData.otherDetails} onUpdate={handleUpdateInspiration} onNext={handleInspirationNext} onBack={handleBack} />;
      case 'ring_size': return <DiamondRingSizeStep ringSize={formData.ringSize} onChange={handleRingSizeChange} onNext={handleRingSizeNext} onBack={handleBack} title={sh.ring_size?.title} subtitle={sh.ring_size?.subtitle} />;
      case 'timeline': return <DiamondTimelineStep selected={formData.diamondTimeline} onSelect={handleSelectTimeline} onBack={handleBack} showPrices={showPrices} currency={currency} options={dttConfig?.form_content?.timelineOptions} />;
      case 'contact': return <DiamondContactStep onSubmit={handleContactSubmit} onBack={handleBack} content={dttConfig?.form_content ?? undefined} blockDisposableEmail={dttConfig?.block_disposable_email ?? false} unifiedPhone={useGlass} />;
      case 'summary': return <DiamondEstimateSummary formData={formData} onBack={handleBack} clientId={clientId} skipEstimate={isNaturalFlow} currency={currency} submissionMode={dttConfig?.submission_mode} depositAmount={dttConfig?.deposit_amount ?? undefined} content={dttConfig?.form_content ?? undefined} formColors={dttConfig?.form_colors ?? undefined} enableQualityScoring={dttConfig?.enable_lead_quality_scoring ?? true} />;
      default: return <DiamondFormWelcome onStart={handleStart} title={dttConfig?.welcome_title} subtitle={dttConfig?.welcome_subtitle} />;
    }
  };

  const formBg = ringFormConfig?.form_colors?.background || '#ffffff';

  // Non-classic clients get the new wizard UI
  if (!isClassicMode) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: formBg }}>
        {ringConfigLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : (
          <RingBuilderWizardForm config={ringFormConfig} clientId={clientId} metaPixelId={metaPixelId} />
        )}
      </div>
    );
  }

  // Classic step-by-step engine (Quote Estimator: DTT, /quote routes, legacy `?variant=dtt`).
  // Feed per-client colors as CSS variables on the `.diamond-form-font` wrapper;
  // the theming layer in index.css maps them onto the step components.
  const dttColors = dttConfig?.form_colors || {};
  // Border color for all text fields comes from form_content (not form_colors).
  const inputBorderColor = dttConfig?.form_content?.contactBorderColor?.trim() || undefined;
  const themeVars: React.CSSProperties = {
    ['--dtt-bg' as any]: dttColors.background || undefined,
    ['--dtt-surface' as any]: dttColors.imageBg || undefined,
    ['--dtt-font' as any]: dttColors.fontColor || undefined,
    ['--dtt-accent' as any]: dttColors.tabBorder || undefined,
    ['--dtt-highlight' as any]: dttColors.highlight || undefined,
    ['--dtt-btn-bg' as any]: dttColors.submitButtonBg || undefined,
    ['--dtt-btn-text' as any]: dttColors.submitButtonText || undefined,
    ['--dtt-input-border' as any]: inputBorderColor,
  };

  // Theme 2 · Glass adds the wrapper class + `--qe-*` variables; Theme 1
  // renders exactly as before with no new wrappers or variables.
  const glassTheme = useGlass
    ? resolveQuoteEstimatorTheme(dttConfig?.form_colors, dttConfig?.form_content?.theme)
    : null;
  const wrapperVars: React.CSSProperties = glassTheme
    ? ({ ...themeVars, ...buildQuoteEstimatorVars(glassTheme) } as React.CSSProperties)
    : themeVars;

  const pageBg = glassTheme?.background || dttColors.background || '#EDE8E3';

  // Wait for the settings record before the first paint: the theme choice
  // lives in it, so rendering early would flash Theme 1 before Theme 2.
  if (liveLoading || (version === 'v1' && v1Loading) || (version === 'v3' && v3Loading)) return <div className="min-h-screen bg-background" />;
  if (isGlassQuoteEstimator(clientId) && version === 'v3') {
    if (!clientId || !v3Config) return <div role="alert" className="p-6 text-foreground">V3 settings are unavailable. Please refresh and try again.</div>;
    return <QuoteVersionContext.Provider value="v3"><QuoteTestPreviewContext.Provider value={testPreview}>
      <QuoteV3 clientId={clientId} config={v3Config} currency={currency} />
    </QuoteTestPreviewContext.Provider></QuoteVersionContext.Provider>;
  }
  return (
    <QuoteVersionContext.Provider value={version}>
    <QuoteThemeContext.Provider value={quoteTheme}>
    <QuoteTestPreviewContext.Provider value={testPreview}>
    <QuoteOptionsPrefetch clientId={isClassicMode ? clientId : null} />
    {testPreview && <div className="w-full bg-muted text-muted-foreground text-center text-xs py-1.5">Test preview ({isGlassQuoteEstimator(clientId) ? version.toUpperCase() : `${QUOTE_THEME_META[quoteTheme].label} · ${QUOTE_THEME_META[quoteTheme].title}`}) - nothing is saved or sent to your CRM, email or ads</div>}
    <div
      // Quote Estimator: the page hugs its content on phones so the
      // frame can shrink with it, instead of always reserving a full screen.
      className="qe-scroll-page min-h-0 md:min-h-screen"
      data-in-frame={window.self !== window.top}
      style={{ backgroundColor: pageBg }}
    >
      {useQuoteScroll && (
        <style>{`html,body{background-color:${pageBg};}`}</style>
      )}
      <div
        className={`max-w-2xl mx-auto p-2 md:p-6 diamond-form-font qe-content-scroll${inputBorderColor ? ' dtt-input-bordered' : ''}${useGlass ? ' qe-glass' : ''}`}
        style={wrapperVars}
      >
        {renderStep()}
      </div>
    </div>
    </QuoteTestPreviewContext.Provider>
    </QuoteThemeContext.Provider>
    </QuoteVersionContext.Provider>
  );

}

function QuoteOptionsPrefetch({ clientId }: { clientId?: string | null }) {
  usePrefetchDiamondFormOptions(clientId);
  return null;
}
