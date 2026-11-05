import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import { useClientFeatures } from '@/hooks/useClientFeatures';
import { DiamondFormWelcome } from '@/components/diamonds-form/DiamondFormWelcome';
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
import { isGlassQuoteEstimator, QUOTE_THEME_META, resolveQuoteTheme } from '@/lib/quote-estimator-theme';
import { QUOTE_VERSION_META, quoteVersionName, resolveQuoteVersion } from '@/lib/quote-estimator-version';
import { QuoteEstimatorVersionPanels } from '@/components/dtt-form-config/QuoteEstimatorVersionPanels';
import type { QuoteSelectedDiamond } from '@/lib/quote-estimator-diamonds';
import type { QuoteSelectedGemstone } from '@/lib/quote-estimator-gemstones';
import { DiamondEstimateSummary } from '@/components/diamonds-form/DiamondEstimateSummary';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, Copy, Check, Settings2, Upload, Loader2, RefreshCw, Info, Monitor, Smartphone } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { generateDiamondsFormEmbedCode, getDiamondsFormUrl, getQuoteEstimatorThemePreviewUrl, getQuoteEstimatorUrl, getQuoteEstimatorVersionPreviewUrl } from '@/lib/diamond-form-embed';
import { generateGrillBuilderEmbedCode, getGrillBuilderUrl } from '@/lib/grill-form-embed';
import { generateCustomEnquiryEmbedCode, getCustomEnquiryUrl } from '@/lib/custom-enquiry-embed';
import { GrillBuilderForm } from '@/components/grill-builder/GrillBuilderForm';
import { RingBuilderWizardForm } from '@/components/ring-builder-wizard/RingBuilderWizardForm';
import { CustomEnquiryForm } from '@/components/custom-enquiry/CustomEnquiryForm';
import { useClientGrillConfig } from '@/hooks/useClientGrillConfig';
import { useClientCustomEnquiryConfig } from '@/hooks/useClientCustomEnquiryConfig';
import { useClientRingFormConfig } from '@/hooks/useClientRingFormConfig';
import { useClientDttFormConfig } from '@/hooks/useClientDttFormConfig';
import { usePrefetchDiamondFormOptions } from '@/hooks/useDiamondFormOptions';
import { DttFormConfigure } from '@/components/dtt-form-config/DttFormConfigure';
import { useClientCurrency } from '@/hooks/useClientCurrency';
import { canView } from '@/lib/staff-permissions';
import { AccessDenied } from '@/components/access/AccessDenied';

// Diamond Touch Toronto keeps the classic step-by-step form; all others get the wizard.
const DTT_CLIENT_ID = 'aeec6491-bd1f-4787-97f9-6a47a2ddc8af';

// Helper: Color field with info tooltip
function ColorFieldWithTooltip({ label, tooltip, value, onChange, placeholder }: { label: string; tooltip: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-sm">{label}</Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" className="inline-flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors">
              <Info className="h-3.5 w-3.5" />
              <span className="sr-only">Info about {label}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[220px] text-xs">{tooltip}</TooltipContent>
        </Tooltip>
      </div>
      <div className="flex gap-2 items-center">
        <Input type="color" value={value} onChange={e => onChange(e.target.value)} className="w-10 h-10 p-1 cursor-pointer" />
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="flex-1" />
      </div>
    </div>
  );
}

export type DiamondType = 'natural' | 'lab' | null;
export type DiamondShape = string | null;
export type DiamondSize = string | null;
export type DiamondQuality = string | null;
export type DiamondSetting = string | null;
export type DiamondHolder = string | null;
export type DiamondBand = string | null;
export type DiamondBandWidth = string[];
export type DiamondMetal = string | null;
/** Karat / purity variant of the chosen ring metal (Quote Estimator only). */
export type DiamondMetalKarat = string | null;
/** Two Tone only: which two metals are combined (Quote Estimator only). */
export type DiamondTwoToneMetals = string | null;
export type DiamondPersonalization = string[];
export type DiamondTimeline = string | null;

export interface DiamondFormData {
  diamondType: DiamondType;
  diamondShape: DiamondShape;
  diamondSize: DiamondSize;
  diamondQuality: DiamondQuality;
  diamondSetting: DiamondSetting;
  diamondHolder: DiamondHolder;
  diamondBand: DiamondBand;
  diamondBandWidth: DiamondBandWidth;
  diamondMetal: DiamondMetal;
  diamondMetalKarat: DiamondMetalKarat;
  diamondTwoToneMetals: DiamondTwoToneMetals;
  diamondPersonalization: DiamondPersonalization;
  inspirationImages: File[];
  ringSize: string;
  otherDetails: string;
  diamondTimeline: DiamondTimeline;
  contactInfo: ContactFormData | null;
  /** Exact stone picked on the Quote Estimator diamond picker (Sandbox only); null = quality card chosen. */
  selectedDiamond?: QuoteSelectedDiamond | null;
  /** Gemstone picked on the Quote Estimator V3 gemstone screen (only when the Gemstone shape is chosen). */
  diamondGemstone?: string | null;
  /** Exact stone picked on the Quote Estimator V3 gemstone list (gemstone pool); null = gemstone card only. */
  selectedGemstone?: QuoteSelectedGemstone | null;
  /** Silhouette picked on the Quote Estimator V3 colored-diamond shape screen (only when the Colored Diamond shape is chosen). */
  diamondColoredShape?: string | null;
}

export default function DiamondsForm() {
  const { user, role, staffInfo } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { impersonatedClientId, isImpersonating } = useAdminImpersonation();
  const { toast } = useToast();
  const routePrefix = isImpersonating ? '/admin/view-as' : '/client';
  const { isFeatureEnabled } = useClientFeatures();

  // Determine active tab from query param or default
  const tabParam = searchParams.get('tab');
  const defaultTab = tabParam || (isFeatureEnabled('diamond_form') ? 'ring-builder' : isFeatureEnabled('grillz_builder') ? 'grill-builder' : isFeatureEnabled('custom_enquiry') ? 'custom-enquiry' : isFeatureEnabled('dtt_v2') ? 'dtt-form' : 'custom-enquiry');
  const [diamondCopied, setDiamondCopied] = useState(false);
  const [grillCopied, setGrillCopied] = useState(false);
  const [enquiryCopied, setEnquiryCopied] = useState(false);
  const [effectiveClientId, setEffectiveClientId] = useState<string | null>(null);
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [isPushingGrill, setIsPushingGrill] = useState(false);
  const [isPushingEnquiry, setIsPushingEnquiry] = useState(false);
  const [isPushingRing, setIsPushingRing] = useState(false);
  const [grillPreviewKey, setGrillPreviewKey] = useState(0);
  const [enquiryPreviewKey, setEnquiryPreviewKey] = useState(0);
  const [ringPreviewKey, setRingPreviewKey] = useState(0);
  const [ringPreviewMode, setRingPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [grillPreviewMode, setGrillPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [enquiryPreviewMode, setEnquiryPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const { currency: clientCurrency } = useClientCurrency(effectiveClientId);

  // Grill form colors state
  const [grillColors, setGrillColors] = useState({
    background: '', tabBorder: '', fontColor: '', imageBg: '', submitButtonBg: '', submitButtonText: '',
  });
  const [savingGrillColors, setSavingGrillColors] = useState(false);

  // Enquiry form colors state
  const [enquiryColors, setEnquiryColors] = useState({
    background: '', tabBorder: '', fontColor: '', imageBg: '', submitButtonBg: '', submitButtonText: '',
  });
  const [savingEnquiryColors, setSavingEnquiryColors] = useState(false);
  // Ring form colors state
  const [ringColors, setRingColors] = useState({
    background: '', tabBorder: '', fontColor: '', imageBg: '', submitButtonBg: '', submitButtonText: '',
  });
  const [savingRingColors, setSavingRingColors] = useState(false);
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

  useEffect(() => {
    async function getClientId() {
      if (isImpersonating && impersonatedClientId) {
        setEffectiveClientId(impersonatedClientId);
        const { data } = await supabase
          .from('clients')
          .select('allowed_domains')
          .eq('id', impersonatedClientId)
          .maybeSingle();
        setAllowedDomains((data?.allowed_domains as string[]) || []);
        return;
      }
      if (role === 'staff' && staffInfo?.clientId) {
        setEffectiveClientId(staffInfo.clientId);
        const { data } = await supabase
          .from('clients')
          .select('allowed_domains')
          .eq('id', staffInfo.clientId)
          .maybeSingle();
        setAllowedDomains((data?.allowed_domains as string[]) || []);
        return;
      }
      if (!user) return;
      const { data } = await supabase
        .from('clients')
        .select('id, allowed_domains')
        .eq('user_id', user.id)
        .maybeSingle();
      setEffectiveClientId(data?.id ?? null);
      setAllowedDomains((data?.allowed_domains as string[]) || []);
    }
    getClientId();
  }, [user, role, staffInfo, isImpersonating, impersonatedClientId]);

  // Ring wizard hooks for non-DTT clients
  const isDTT = effectiveClientId === DTT_CLIENT_ID;
  const isQuoteEstimatorContext = isDTT || tabParam === 'dtt-form';
  const { config: grillConfig, loading: grillLoading } = useClientGrillConfig(effectiveClientId);
  const { config: enquiryConfig, loading: enquiryLoading } = useClientCustomEnquiryConfig(effectiveClientId);
  const { config: ringFormConfig, loading: ringFormLoading } = useClientRingFormConfig(isDTT ? null : effectiveClientId);
  const { data: dttConfig } = useClientDttFormConfig(isQuoteEstimatorContext ? effectiveClientId : null);
  const [previewVersion, setPreviewVersion] = useState<'live' | 'v1' | 'v2' | 'v3'>('live');
  const liveQuoteVersion = resolveQuoteVersion(effectiveClientId, dttConfig?.live_version, null);
  const { data: sandboxV1Config } = useClientDttFormConfig(isQuoteEstimatorContext && liveQuoteVersion === 'v1' ? effectiveClientId : null, 'v1');
  const { data: sandboxV3Config } = useClientDttFormConfig(isQuoteEstimatorContext && liveQuoteVersion === 'v3' ? effectiveClientId : null, 'v3');
  const liveQuoteConfig = liveQuoteVersion === 'v1' ? sandboxV1Config : liveQuoteVersion === 'v3' ? sandboxV3Config : dttConfig;
  // Theme 1 · Classic or Theme 2 · Glass on the live website (Sandbox: V2 = glass).
  const liveQuoteTheme = resolveQuoteTheme(effectiveClientId, liveQuoteVersion, dttConfig?.form_content, null);
  const liveThemeIsGlass = liveQuoteTheme === 'glass';
  // Fetch the option set + warm its CDN images up front, so stepping through
  // the form is a cache read rather than a fresh download per screen.
  usePrefetchDiamondFormOptions(isQuoteEstimatorContext ? effectiveClientId : null);
  // Compute active steps based on client's enabled_steps config
  const enabledSteps = ringFormConfig?.enabled_steps;
  const dttEnabledSteps = dttConfig?.enabled_steps;
  const isStepEnabled = (stepKey: string): boolean => {
    if (isQuoteEstimatorContext) {
      if (!dttEnabledSteps) return true;
      return (dttEnabledSteps as Record<string, boolean>)[stepKey] !== false;
    }
    if (!enabledSteps) return true;
    return (enabledSteps as unknown as Record<string, boolean>)[stepKey] !== false;
  };

  const ORDERED_STEPS = [
    { index: 0, key: 'welcome' },
    { index: 1, key: 'nature' },
    { index: 2, key: 'shape' },
    { index: 3, key: 'size' },
    { index: 4, key: 'quality' },
    { index: 5, key: 'setting' },
    { index: 6, key: 'holder' },
    { index: 7, key: 'band' },
    { index: 8, key: 'band_width' },
    { index: 9, key: 'metal' },
    { index: 10, key: 'personalization' },
    { index: 11, key: 'inspiration' },
    // Ring size got its own screen after the numeric indices were fixed, so it
    // takes the next free index but sits after Inspiration by default.
    { index: 15, key: 'ring_size' },
    { index: 12, key: 'timeline' },
    { index: 13, key: 'contact' },
    { index: 14, key: 'summary' },
  ];
  const DEFAULT_CONFIGURABLE_ORDER = ORDERED_STEPS
    .map(s => s.key)
    .filter(k => !['welcome', 'contact', 'summary'].includes(k));

  const activeStepIndices = (isQuoteEstimatorContext && Array.isArray(dttConfig?.step_order) && dttConfig.step_order.length
    ? [
        { index: 0, key: 'welcome' },
        // Saved order first; steps added since the client last saved slot in
        // at their default position (see mergeStepOrder).
        ...mergeStepOrder(dttConfig.step_order, DEFAULT_CONFIGURABLE_ORDER)
          .map(key => ORDERED_STEPS.find(s => s.key === key))
          .filter((s): s is { index: number; key: string } => Boolean(s)),
        { index: 13, key: 'contact' },
        { index: 14, key: 'summary' },
      ]
    : ORDERED_STEPS)
    .filter(s => ['welcome', 'contact', 'summary'].includes(s.key) || isStepEnabled(s.key))
    .map(s => s.index);

  const getNextActiveStep = (current: number): number => {
    const currentPos = activeStepIndices.indexOf(current);
    if (currentPos >= 0 && currentPos < activeStepIndices.length - 1) {
      return activeStepIndices[currentPos + 1];
    }
    return current;
  };

  const getPrevActiveStep = (current: number): number => {
    const currentPos = activeStepIndices.indexOf(current);
    if (currentPos > 0) {
      return activeStepIndices[currentPos - 1];
    }
    return current;
  };

  // Sync form colors from config
  useEffect(() => {
    if (grillConfig?.form_colors) {
      const c = grillConfig.form_colors;
      setGrillColors({
        background: c.background || '', tabBorder: c.tabBorder || '', fontColor: c.fontColor || '',
        imageBg: c.imageBg || '', submitButtonBg: c.submitButtonBg || '', submitButtonText: c.submitButtonText || '',
      });
    }
  }, [grillConfig]);

  useEffect(() => {
    if (enquiryConfig?.form_colors) {
      const c = enquiryConfig.form_colors;
      setEnquiryColors({
        background: c.background || '', tabBorder: c.tabBorder || '', fontColor: c.fontColor || '',
        imageBg: c.imageBg || '', submitButtonBg: c.submitButtonBg || '', submitButtonText: c.submitButtonText || '',
      });
    }
  }, [enquiryConfig]);

  // Sync ring form colors from config on load
  useEffect(() => {
    if (ringFormConfig?.form_colors) {
      const c = ringFormConfig.form_colors;
      setRingColors({
        background: (c as any).background || '',
        tabBorder: (c as any).tabBorder || '',
        fontColor: (c as any).fontColor || '',
        imageBg: (c as any).imageBg || '',
        submitButtonBg: (c as any).submitButtonBg || '',
        submitButtonText: (c as any).submitButtonText || '',
      });
    }
  }, [ringFormConfig]);

  const handlePushToShopify = async (formType: 'grillz' | 'custom_enquiry' | 'ring_builder', depositAmt: number) => {
    if (!effectiveClientId) return;
    const setLoading = formType === 'grillz' ? setIsPushingGrill : formType === 'ring_builder' ? setIsPushingRing : setIsPushingEnquiry;
    setLoading(true);
    try {
      const { data: clientData } = await supabase
        .from('clients')
        .select('shopify_store_url')
        .eq('id', effectiveClientId)
        .maybeSingle();
      if (!clientData?.shopify_store_url) {
        toast({ title: 'Error', description: 'Complete Shopify Integration first', variant: 'destructive' });
        return;
      }
      const { data, error } = await supabase.functions.invoke('shopify-push-form-product', {
        body: { clientId: effectiveClientId, formType, depositAmount: depositAmt },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.success || !data?.shopify_product_id) {
        throw new Error('Product was not confirmed as created in Shopify');
      }
      const formLabel = formType === 'grillz'
        ? 'Grillz Builder'
        : formType === 'ring_builder'
          ? 'Ring Builder'
          : 'Custom Enquiry';
      toast({ title: 'Success!', description: `${formLabel} deposit product pushed to Shopify!` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to push to Shopify', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const saveFormColors = async (formType: 'grillz' | 'custom_enquiry') => {
    if (!effectiveClientId) return;
    const colors = formType === 'grillz' ? grillColors : enquiryColors;
    const setSaving = formType === 'grillz' ? setSavingGrillColors : setSavingEnquiryColors;
    const table = formType === 'grillz' ? 'client_grill_config' : 'client_custom_enquiry_config';
    setSaving(true);
    try {
      // Filter out empty strings
      const cleanColors: Record<string, string> = {};
      Object.entries(colors).forEach(([k, v]) => { if (v) cleanColors[k] = v; });
      const { error } = await supabase
        .from(table)
        .update({ form_colors: Object.keys(cleanColors).length > 0 ? cleanColors : null } as any)
        .eq('client_id', effectiveClientId);
      if (error) throw error;
      toast({ title: 'Saved!', description: 'Form colors updated successfully' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to save colors', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleStart = () => setCurrentStep(getNextActiveStep(0));

  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(getPrevActiveStep(currentStep));
  };

  const handleSelectDiamondType = (type: DiamondType) => {
    setFormData(prev => ({ ...prev, diamondType: type }));
    setCurrentStep(getNextActiveStep(1));
  };

  const handleSelectShape = (shape: DiamondShape) => {
    setFormData(prev => ({ ...prev, diamondShape: shape }));
    setCurrentStep(getNextActiveStep(2));
  };

  const handleSelectSize = (size: DiamondSize) => {
    setFormData(prev => ({ ...prev, diamondSize: size }));
    setCurrentStep(getNextActiveStep(3));
  };

  const handleSelectQuality = (quality: DiamondQuality) => {
    setFormData(prev => ({ ...prev, diamondQuality: quality }));
    setCurrentStep(getNextActiveStep(4));
  };

  const handleSelectSetting = (setting: DiamondSetting) => {
    setFormData(prev => ({ ...prev, diamondSetting: setting }));
    setCurrentStep(getNextActiveStep(5));
  };

  const handleSelectHolder = (holder: DiamondHolder) => {
    setFormData(prev => ({ ...prev, diamondHolder: holder }));
    setCurrentStep(getNextActiveStep(6));
  };

  const handleSelectBand = (band: DiamondBand) => {
    setFormData(prev => ({ ...prev, diamondBand: band }));
    setCurrentStep(getNextActiveStep(7));
  };

  const handleSelectBandWidth = (widths: DiamondBandWidth) => {
    setFormData(prev => ({ ...prev, diamondBandWidth: widths }));
    if (widths.length > 0) setCurrentStep(getNextActiveStep(8));
  };

  // Metal selection no longer advances by itself: the step calls `onNext`
  // once a karat is chosen (or immediately when the metal has no variants).
  const handleSelectMetal = (metal: DiamondMetal) => {
    setFormData(prev => ({ ...prev, diamondMetal: metal, diamondMetalKarat: null, diamondTwoToneMetals: null }));
  };
  const handleSelectMetalKarat = (karat: DiamondMetalKarat) => {
    setFormData(prev => ({ ...prev, diamondMetalKarat: karat }));
  };
  const handleSelectTwoToneMetals = (combo: DiamondTwoToneMetals) => {
    setFormData(prev => ({ ...prev, diamondTwoToneMetals: combo }));
  };
  const handleMetalNext = () => setCurrentStep(getNextActiveStep(9));

  const handleSelectPersonalization = (features: DiamondPersonalization) => {
    setFormData(prev => ({ ...prev, diamondPersonalization: features }));
  };
  const handlePersonalizationNext = () => {
    setCurrentStep(getNextActiveStep(10));
  };

  const handleUpdateInspiration = (data: { inspirationImages: File[]; ringSize: string; otherDetails: string }) => {
    setFormData(prev => ({ ...prev, inspirationImages: data.inspirationImages, ringSize: data.ringSize, otherDetails: data.otherDetails }));
  };

  const handleInspirationNext = () => setCurrentStep(getNextActiveStep(11));

  const handleRingSizeChange = (ringSize: string) => setFormData(prev => ({ ...prev, ringSize }));
  const handleRingSizeNext = () => setCurrentStep(getNextActiveStep(15));

  const handleSelectTimeline = (timeline: DiamondTimeline) => {
    setFormData(prev => ({ ...prev, diamondTimeline: timeline }));
    setCurrentStep(getNextActiveStep(12));
  };

  const handleContactSubmit = (contactData: ContactFormData) => {
    setFormData(prev => ({ ...prev, contactInfo: contactData }));
    setCurrentStep(getNextActiveStep(13));
  };

  const NATURAL_FLOW_SHAPES = ['ruby-sapphire-emerald'];
  const isNaturalFlow = formData.diamondType === 'natural' || NATURAL_FLOW_SHAPES.includes(formData.diamondShape || '');
  const showPrices = !isNaturalFlow;

  const renderStep = () => {
    // Per-step heading/sub-heading overrides — only in the Quote Estimator context.
    const sh = isQuoteEstimatorContext ? (dttConfig?.form_content?.stepHeadings || {}) : {};
    switch (currentStep) {
      case 0:
        return <DiamondFormWelcome onStart={handleStart} title={dttConfig?.welcome_title} subtitle={dttConfig?.welcome_subtitle} />;
      case 1:
        return (
          <DiamondTypeStep 
            selected={formData.diamondType} 
            onSelect={handleSelectDiamondType}
            onBack={handleBack}
            clientId={isQuoteEstimatorContext ? effectiveClientId : undefined}
            title={sh.nature?.title}
            subtitle={sh.nature?.subtitle}
          />
        );
      case 2:
        return (
          <DiamondShapeStep 
            selected={formData.diamondShape}
            onSelect={handleSelectShape}
            onBack={handleBack}
            clientId={isQuoteEstimatorContext ? effectiveClientId : undefined}
            title={sh.shape?.title}
            subtitle={sh.shape?.subtitle}
          />
        );
      case 3:
        return (
          <DiamondSizeStep 
            selected={formData.diamondSize}
            onSelect={handleSelectSize}
            onBack={handleBack}
            showPrices={showPrices}
            selectedShape={formData.diamondShape}
            clientId={isQuoteEstimatorContext ? effectiveClientId : undefined}
            title={sh.size?.title}
            subtitle={sh.size?.subtitle}
          />
        );
      case 4:
        return (
          <DiamondQualityStep 
            selected={formData.diamondQuality}
            onSelect={handleSelectQuality}
            onBack={handleBack}
            showPrices={showPrices}
            clientId={isQuoteEstimatorContext ? effectiveClientId : undefined}
            title={sh.quality?.title}
            subtitle={sh.quality?.subtitle}
            currency={clientCurrency}
          />
        );
      case 5:
        return (
          <DiamondSettingStep 
            selected={formData.diamondSetting}
            onSelect={handleSelectSetting}
            onBack={handleBack}
            showPrices={showPrices}
            clientId={isQuoteEstimatorContext ? effectiveClientId : undefined}
            title={sh.setting?.title}
            subtitle={sh.setting?.subtitle}
          />
        );
      case 6:
        return (
          <DiamondHolderStep 
            selected={formData.diamondHolder}
            onSelect={handleSelectHolder}
            onBack={handleBack}
            showPrices={showPrices}
            clientId={isQuoteEstimatorContext ? effectiveClientId : undefined}
            title={sh.holder?.title}
            subtitle={sh.holder?.subtitle}
            currency={clientCurrency}
          />
        );
      case 7:
        return (
          <DiamondBandStep 
            selected={formData.diamondBand}
            onSelect={handleSelectBand}
            onBack={handleBack}
            showPrices={showPrices}
            clientId={isQuoteEstimatorContext ? effectiveClientId : undefined}
            title={sh.band?.title}
            subtitle={sh.band?.subtitle}
            currency={clientCurrency}
          />
        );
      case 8:
        return (
          <DiamondBandWidthStep 
            selected={formData.diamondBandWidth}
            onSelect={handleSelectBandWidth}
            onBack={handleBack}
            showPrices={showPrices}
            clientId={isQuoteEstimatorContext ? effectiveClientId : undefined}
            title={sh.band_width?.title}
            subtitle={sh.band_width?.subtitle}
            currency={clientCurrency}
          />
        );
      case 9:
        return (
          <DiamondMetalStep
            selected={formData.diamondMetal}
            onSelect={handleSelectMetal}
            selectedKarat={formData.diamondMetalKarat}
            onSelectKarat={handleSelectMetalKarat}
            selectedCombo={formData.diamondTwoToneMetals}
            onSelectCombo={handleSelectTwoToneMetals}
            onNext={handleMetalNext}
            karatConfig={isQuoteEstimatorContext ? dttConfig?.form_content?.metalKarats : undefined}
            comboConfig={isQuoteEstimatorContext ? dttConfig?.form_content?.twoToneCombos : undefined}
            onBack={handleBack}
            showPrices={showPrices}
            clientId={isQuoteEstimatorContext ? effectiveClientId : undefined}
            title={sh.metal?.title}
            subtitle={sh.metal?.subtitle}
            currency={clientCurrency}
          />
        );
      case 10:
        return (
          <DiamondPersonalizationStep 
            selected={formData.diamondPersonalization}
            onSelect={handleSelectPersonalization}
            onNext={handlePersonalizationNext}
            onBack={handleBack}
            showPrices={showPrices}
            clientId={isQuoteEstimatorContext ? effectiveClientId : undefined}
            title={sh.personalization?.title}
            subtitle={sh.personalization?.subtitle}
            currency={clientCurrency}
          />
        );
      case 11:
        return (
          <DiamondInspirationStep 
            inspirationImages={formData.inspirationImages}
            ringSize={formData.ringSize}
            otherDetails={formData.otherDetails}
            onUpdate={handleUpdateInspiration}
            onNext={handleInspirationNext}
            onBack={handleBack}
          />
        );
      case 15:
        return (
          <DiamondRingSizeStep
            ringSize={formData.ringSize}
            onChange={handleRingSizeChange}
            onNext={handleRingSizeNext}
            onBack={handleBack}
            title={sh.ring_size?.title}
            subtitle={sh.ring_size?.subtitle}
          />
        );
      case 12:
        return (
          <DiamondTimelineStep 
            selected={formData.diamondTimeline}
            onSelect={handleSelectTimeline}
            onBack={handleBack}
            showPrices={showPrices}
            currency={clientCurrency}
            options={isQuoteEstimatorContext ? dttConfig?.form_content?.timelineOptions : undefined}
          />
        );
      case 13:
        return (
          <DiamondContactStep
            onSubmit={handleContactSubmit}
            onBack={handleBack}
            content={isQuoteEstimatorContext ? (dttConfig?.form_content ?? undefined) : undefined}
            blockDisposableEmail={isQuoteEstimatorContext ? (dttConfig?.block_disposable_email ?? false) : false}
            unifiedPhone={isQuoteEstimatorContext && liveThemeIsGlass}
          />
        );
      case 14:
        return (
          <DiamondEstimateSummary
            formData={formData}
            onBack={handleBack}
            clientId={effectiveClientId || undefined}
            skipEstimate={isNaturalFlow}
            currency={clientCurrency}
            submissionMode={isQuoteEstimatorContext ? dttConfig?.submission_mode : undefined}
            depositAmount={isQuoteEstimatorContext ? (dttConfig?.deposit_amount ?? undefined) : undefined}
            content={isQuoteEstimatorContext ? (dttConfig?.form_content ?? undefined) : undefined}
            enableQualityScoring={isQuoteEstimatorContext ? (dttConfig?.enable_lead_quality_scoring ?? true) : true}
          />
        );
      default:
        return <DiamondFormWelcome onStart={handleStart} title={dttConfig?.welcome_title} subtitle={dttConfig?.welcome_subtitle} />;
    }
  };

  const diamondsEmbedCode = generateDiamondsFormEmbedCode(effectiveClientId || '', '800px', allowedDomains);
  const dttEmbedCode = generateDiamondsFormEmbedCode(
    effectiveClientId || '',
    '800px',
    allowedDomains,
    'dtt',
    liveQuoteConfig?.form_colors?.background || '#EDE8E3',
    // Classic and Glass quotes follow content on phones; V3 stays unchanged.
    liveQuoteVersion !== 'v3'
  );
  const grillEmbedCode = generateGrillBuilderEmbedCode(effectiveClientId || '', '800px', allowedDomains);
  const enquiryEmbedCode = generateCustomEnquiryEmbedCode(effectiveClientId || '', '800px', allowedDomains);

  const copyDiamondsCode = () => {
    navigator.clipboard.writeText(diamondsEmbedCode);
    setDiamondCopied(true);
    toast({ title: 'Copied!', description: 'Diamonds Form embed code copied to clipboard' });
    setTimeout(() => setDiamondCopied(false), 2000);
  };

  const copyDttCode = () => {
    navigator.clipboard.writeText(dttEmbedCode);
    setDiamondCopied(true);
    toast({ title: 'Copied!', description: 'Quote Estimator Form embed code copied to clipboard' });
    setTimeout(() => setDiamondCopied(false), 2000);
  };

  const copyGrillCode = () => {
    navigator.clipboard.writeText(grillEmbedCode);
    setGrillCopied(true);
    toast({ title: 'Copied!', description: 'Grill Builder embed code copied to clipboard' });
    setTimeout(() => setGrillCopied(false), 2000);
  };

  const copyEnquiryCode = () => {
    navigator.clipboard.writeText(enquiryEmbedCode);
    setEnquiryCopied(true);
    toast({ title: 'Copied!', description: 'Custom Enquiry embed code copied to clipboard' });
    setTimeout(() => setEnquiryCopied(false), 2000);
  };

  // Staff guard: Custom X access — disabled hides all 3 tabs (Ring/Grillz/Custom Enquiry)
  if (role === 'staff' && !canView(staffInfo?.permissions?.custom_x_access)) {
    return <AccessDenied feature="Custom X Forms" />;
  }

  return (
    <div className="p-4 md:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Form</h1>
        <p className="text-muted-foreground mt-1">
          Configure your inquiry forms for customers
        </p>
      </div>

      <Tabs value={defaultTab} className="w-full">
        <TabsList className="mb-4 hidden">
          {isFeatureEnabled('diamond_form') && (
            <TabsTrigger value="ring-builder">Ring Builder</TabsTrigger>
          )}
          {isFeatureEnabled('grillz_builder') && (
            <TabsTrigger value="grill-builder">Grillz Builder</TabsTrigger>
          )}
          {isFeatureEnabled('custom_enquiry') && (
            <TabsTrigger value="custom-enquiry">Custom Enquiry</TabsTrigger>
          )}
        </TabsList>

        {/* Ring Builder Tab */}
        <TabsContent value="ring-builder">
          <Tabs defaultValue="preview" className="w-full">
            <TabsList className="inline-flex h-auto w-max gap-0 rounded-none border-b border-border bg-transparent p-0 mb-4">
              <TabsTrigger value="preview" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Preview</TabsTrigger>
              {!isDTT && <TabsTrigger value="configure" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Configure</TabsTrigger>}
              <TabsTrigger value="embed" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Embed Code</TabsTrigger>
              {!isDTT && ringFormConfig?.onboarding_completed && ringFormConfig?.submission_mode === 'deposit' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2 gap-1.5 text-xs"
                  disabled={isPushingRing}
                  onClick={() => handlePushToShopify('ring_builder', ringFormConfig.deposit_amount || 0)}
                >
                  {isPushingRing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Push to Shopify
                </Button>
              )}
            </TabsList>

            <TabsContent value="preview">
              {(!isDTT && ringFormLoading) ? (
                <div className="flex justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : (!isDTT && !ringFormConfig?.onboarding_completed) ? (
                <Card className="p-8 sm:p-12 max-w-2xl mx-auto text-center space-y-4">
                  <div className="text-4xl">💍</div>
                  <h3 className="text-xl font-semibold text-foreground">No Configuration Yet</h3>
                  <p className="text-muted-foreground text-sm">
                    Configure your Ring Builder first to see a preview of your widget.
                  </p>
                  <Button variant="outline" onClick={() => navigate(`${routePrefix}/ring-form-onboarding`)}>
                    <Settings2 className="h-4 w-4 mr-2" /> Configure Now
                  </Button>
                </Card>
              ) : (
                <div className={`max-w-5xl mx-auto ${isDTT ? 'diamond-form-font' : ''}`}>
                  {!isDTT && (
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center border rounded-lg p-1 gap-0.5">
                        <Button variant={ringPreviewMode === 'desktop' ? 'default' : 'ghost'} size="sm" className="h-8 w-8 p-0" onClick={() => setRingPreviewMode('desktop')}>
                          <Monitor className="h-4 w-4" />
                        </Button>
                        <Button variant={ringPreviewMode === 'mobile' ? 'default' : 'ghost'} size="sm" className="h-8 w-8 p-0" onClick={() => setRingPreviewMode('mobile')}>
                          <Smartphone className="h-4 w-4" />
                        </Button>
                      </div>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { setRingPreviewKey(k => k + 1); setCurrentStep(0); }}>
                        <RefreshCw className="h-3.5 w-3.5" /> Refresh Preview
                      </Button>
                    </div>
                  )}
                  {isDTT ? renderStep() : (
                    ringPreviewMode === 'mobile' ? (
                      <div className="flex justify-center bg-muted/40 p-4 rounded-lg">
                        <div className="w-[375px] h-[700px] border-4 border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                          <iframe
                            key={ringPreviewKey}
                            src={getDiamondsFormUrl(effectiveClientId!)}
                            className="w-full h-full border-0"
                            title="Ring Builder Mobile Preview"
                          />
                        </div>
                      </div>
                    ) : (
                      <RingBuilderWizardForm
                        key={ringPreviewKey}
                        config={ringFormConfig ? {
                          ...ringFormConfig,
                          form_colors: {
                            ...ringFormConfig.form_colors,
                            ...(Object.fromEntries(Object.entries(ringColors).filter(([_, v]) => v))),
                          },
                        } : null}
                        clientId={effectiveClientId || undefined}
                      />
                    )
                  )}
                </div>
              )}
            </TabsContent>

            {!isDTT && (
              <TabsContent value="configure">
                <Card className="p-6 sm:p-8 max-w-2xl mx-auto space-y-6">
                  <div className="text-center space-y-2">
                    <Settings2 className="h-10 w-10 mx-auto text-muted-foreground" />
                    <h3 className="text-xl font-semibold text-foreground">Configure Your Ring Builder</h3>
                    <p className="text-muted-foreground text-sm">
                      {ringFormConfig?.onboarding_completed
                        ? 'Your Ring Builder is configured. You can re-configure it anytime.'
                        : 'Set up which steps, options, and budget ranges appear on your Ring Builder widget.'}
                    </p>
                    <Button onClick={() => navigate(`${routePrefix}/ring-form-onboarding`)} className="gap-2">
                      <Settings2 className="h-4 w-4" />
                      {ringFormConfig?.onboarding_completed ? 'Re-Configure' : 'Start Configuration'}
                    </Button>
                  </div>

                  {ringFormConfig?.onboarding_completed && (
                    <div className="border-t pt-6 space-y-4">
                      <h4 className="text-lg font-semibold text-foreground">🎨 Form Colors</h4>
                      <p className="text-xs text-muted-foreground">Customize the appearance of your public Ring Builder form.</p>
                      <TooltipProvider delayDuration={200}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <ColorFieldWithTooltip label="Background Color" tooltip="Sets the overall background of your form" value={ringColors.background || '#0a0a0a'} onChange={v => setRingColors(p => ({ ...p, background: v }))} placeholder="#0a0a0a" />
                        <ColorFieldWithTooltip label="Font Color" tooltip="Controls all text color throughout the form" value={ringColors.fontColor || '#ffffff'} onChange={v => setRingColors(p => ({ ...p, fontColor: v }))} placeholder="#ffffff" />
                        <ColorFieldWithTooltip label="Accent Color" tooltip="Used for highlights, selected states, step indicators, and borders" value={ringColors.tabBorder || '#77bb41'} onChange={v => setRingColors(p => ({ ...p, tabBorder: v }))} placeholder="#77bb41" />
                        <ColorFieldWithTooltip label="Submit Button Color" tooltip="Fill color of the main action/submit button" value={ringColors.submitButtonBg || '#10b981'} onChange={v => setRingColors(p => ({ ...p, submitButtonBg: v }))} placeholder="#10b981" />
                        <ColorFieldWithTooltip label="Submit Button Text" tooltip="Text color inside the submit button" value={ringColors.submitButtonText || '#ffffff'} onChange={v => setRingColors(p => ({ ...p, submitButtonText: v }))} placeholder="#ffffff" />
                      </div>
                      </TooltipProvider>
                      <div className="flex gap-2">
                        <Button onClick={async () => {
                          if (!effectiveClientId) return;
                          setSavingRingColors(true);
                          try {
                            const cleanColors: Record<string, string> = {};
                            Object.entries(ringColors).forEach(([k, v]) => { if (v) cleanColors[k] = v; });
                            const { error } = await supabase
                              .from('client_ring_form_config')
                              .update({ form_colors: Object.keys(cleanColors).length > 0 ? cleanColors : null } as any)
                              .eq('client_id', effectiveClientId);
                            if (error) throw error;
                            toast({ title: 'Saved!', description: 'Form colors updated successfully' });
                          } catch (err: any) {
                            toast({ title: 'Error', description: err.message || 'Failed to save colors', variant: 'destructive' });
                          } finally {
                            setSavingRingColors(false);
                          }
                        }} disabled={savingRingColors} size="sm">
                          {savingRingColors ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : 'Save Colors'}
                        </Button>
                        <Button variant="outline" size="sm" onClick={async () => {
                          setRingColors({ background: '', tabBorder: '', fontColor: '', imageBg: '', submitButtonBg: '', submitButtonText: '' });
                          if (effectiveClientId) {
                            await supabase.from('client_ring_form_config').update({ form_colors: null } as any).eq('client_id', effectiveClientId);
                            toast({ title: 'Reset!', description: 'Form colors reset to defaults' });
                            setRingPreviewKey(k => k + 1);
                          }
                        }}>
                          Reset to Defaults
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              </TabsContent>
            )}

            <TabsContent value="embed">
              <Card className="p-4 sm:p-6 space-y-4 max-w-2xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <h3 className="text-base sm:text-lg font-semibold">💎 Ring Builder Embed Code</h3>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        window.open(getDiamondsFormUrl(effectiveClientId!), '_blank');
                      }}
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs sm:text-sm flex-1 sm:flex-none"
                      disabled={!effectiveClientId}
                    >
                      <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span className="hidden xs:inline">Test in </span>New Tab
                    </Button>
                    <Button onClick={copyDiamondsCode} variant="outline" size="sm" className="gap-1.5 text-xs sm:text-sm flex-1 sm:flex-none">
                      {diamondCopied ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                      {diamondCopied ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5 sm:space-y-2 p-3 sm:p-4 bg-muted/50 rounded-lg border">
                  <h4 className="font-semibold text-xs sm:text-sm">💎 Ring Builder Lead Generation Form</h4>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Embed this form on your website to capture diamond & ring customization leads. Customers configure their preferences step-by-step and submit their contact info for a personalized estimate.
                  </p>
                </div>

                <Textarea value={diamondsEmbedCode} readOnly rows={6} className="font-mono text-xs sm:text-sm" />

                <div className="space-y-2 sm:space-y-3 pt-2">
                  <h4 className="font-semibold text-xs sm:text-sm">How to Use:</h4>
                  <ol className="text-xs sm:text-sm text-muted-foreground space-y-1.5 sm:space-y-2 list-decimal list-inside">
                    <li>Click "Test in New Tab" to verify the form works</li>
                    <li>Copy the embed code above</li>
                    <li>Paste it into any page on your website (Shopify, WordPress, etc.)</li>
                    <li>The form auto-resizes on desktop and goes full-screen on mobile</li>
                  </ol>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Quote Estimator Form Tab — classic step-by-step diamond form (exposed to select clients only) */}
        <TabsContent value="dtt-form">
          <Tabs defaultValue="preview" className="w-full">
            <TabsList className="inline-flex h-auto w-max gap-0 rounded-none border-b border-border bg-transparent p-0 mb-4">
              <TabsTrigger value="preview" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Preview</TabsTrigger>
              <TabsTrigger value="configure" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Configure</TabsTrigger>
              <TabsTrigger value="embed" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Embed Code</TabsTrigger>
            </TabsList>

            <TabsContent value="preview">
              {isGlassQuoteEstimator(effectiveClientId) && (() => {
                const quotePreviewUrl = (v: string) => getQuoteEstimatorVersionPreviewUrl(effectiveClientId!, v);
                return (
                  <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
                    {(['v1', 'v2', 'v3'] as const).map(v => (
                      <a key={v} className="underline" target="_blank" rel="noopener noreferrer" href={quotePreviewUrl(v)}>{v === 'v3' ? 'Open V3 test preview' : `Open ${v.toUpperCase()} public preview`}</a>
                    ))}
                    <Button size="sm" variant="ghost" onClick={async () => { const url = quotePreviewUrl('v3'); try { await navigator.clipboard.writeText(url); toast({ title: 'V3 preview link copied' }); } catch { toast({ title: 'Could not copy', description: url }); } }}>Copy V3 link</Button>
                    <span className="text-muted-foreground">Opening a preview does not change the live version. Avoid submitting test leads here.</span>
                  </div>
                );
              })()}
              {!isGlassQuoteEstimator(effectiveClientId) && effectiveClientId && (() => {
                // Theme test links: open the form in either skin without changing
                // what is live. A theme preview never saves or sends anything, so
                // the Theme 2 link can be shared with anyone for review.
                const themePreviewUrl = (t: 'classic' | 'glass') => getQuoteEstimatorThemePreviewUrl(effectiveClientId, t);
                const copyThemeLink = async (t: 'classic' | 'glass') => {
                  const url = themePreviewUrl(t);
                  try {
                    await navigator.clipboard.writeText(url);
                    toast({ title: `${QUOTE_THEME_META[t].label} preview link copied`, description: 'Anyone with the link can view the form. Nothing they enter is saved.' });
                  } catch {
                    toast({ title: 'Could not copy', description: url });
                  }
                };
                return (
                  <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
                    <span className="font-medium">Live on your website: {QUOTE_THEME_META[liveQuoteTheme].label} · {QUOTE_THEME_META[liveQuoteTheme].title}</span>
                    {(['classic', 'glass'] as const).map(t => (
                      <a key={t} className="underline" target="_blank" rel="noopener noreferrer" href={themePreviewUrl(t)}>Open {QUOTE_THEME_META[t].label} preview</a>
                    ))}
                    <Button size="sm" variant="ghost" onClick={() => copyThemeLink('glass')}>Copy Theme 2 link</Button>
                    <span className="text-muted-foreground">Opening a preview does not change the live theme and never creates a lead. Switch themes under Configure.</span>
                  </div>
                );
              })()}
              {isGlassQuoteEstimator(effectiveClientId) ? (
                <div className="mx-auto max-w-5xl space-y-2">
                  <p className="text-xs text-muted-foreground">Live website preview (submitting this form creates a real lead; opening it does not).</p>
                  <div className="flex gap-2">{(['live','v1','v2','v3'] as const).map(v => <Button key={v} type="button" variant={previewVersion === v ? 'default' : 'outline'} size="sm" onClick={() => setPreviewVersion(v)}>{v === 'live' ? `Live (${liveQuoteVersion.toUpperCase()})` : `Test ${v.toUpperCase()}`}</Button>)}</div>
                  <iframe key={previewVersion} title="Quote Estimator preview" src={previewVersion === 'live' ? getQuoteEstimatorUrl(effectiveClientId!) : getQuoteEstimatorVersionPreviewUrl(effectiveClientId!, previewVersion)} className="w-full min-h-[820px] rounded-xl border bg-white" />
                </div>
              ) : liveThemeIsGlass && effectiveClientId ? (
                // Theme 2 · Glass is rendered by the public form itself so the
                // preview matches the website exactly (wrapper, tokens, claim screen).
                <div className="mx-auto max-w-5xl space-y-2">
                  <p className="text-xs text-muted-foreground">Live website preview (submitting this form creates a real lead; opening it does not).</p>
                  <iframe title="Quote Estimator preview" src={getQuoteEstimatorUrl(effectiveClientId)} className="w-full min-h-[820px] rounded-xl border bg-white" />
                </div>
              ) : <div
                className={`max-w-5xl mx-auto diamond-form-font${dttConfig?.form_content?.contactBorderColor?.trim() ? ' dtt-input-bordered' : ''}`}
                style={{
                  ['--dtt-bg' as any]: dttConfig?.form_colors?.background || undefined,
                  ['--dtt-surface' as any]: dttConfig?.form_colors?.imageBg || undefined,
                  ['--dtt-font' as any]: dttConfig?.form_colors?.fontColor || undefined,
                  ['--dtt-accent' as any]: dttConfig?.form_colors?.tabBorder || undefined,
                  ['--dtt-highlight' as any]: dttConfig?.form_colors?.highlight || undefined,
                  ['--dtt-btn-bg' as any]: dttConfig?.form_colors?.submitButtonBg || undefined,
                  ['--dtt-btn-text' as any]: dttConfig?.form_colors?.submitButtonText || undefined,
                  ['--dtt-input-border' as any]: dttConfig?.form_content?.contactBorderColor?.trim() || undefined,
                }}
              >
                {renderStep()}
              </div>}
            </TabsContent>

            <TabsContent value="configure">
              {/* Sandbox lab: one panel per version (V1 / V2 / V3) with its preview docked beside it. */}
              {isGlassQuoteEstimator(effectiveClientId)
                ? <QuoteEstimatorVersionPanels clientId={effectiveClientId} />
                : <DttFormConfigure clientId={effectiveClientId} />}
            </TabsContent>


            <TabsContent value="embed">
              <Card className="p-4 sm:p-6 space-y-4 max-w-2xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <h3 className="text-base sm:text-lg font-semibold">💎 Quote Estimator Form Embed Code</h3>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => {
                        window.open(getQuoteEstimatorUrl(effectiveClientId!), '_blank');
                      }}
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs sm:text-sm flex-1 sm:flex-none"
                      disabled={!effectiveClientId}
                    >
                      <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                      <span className="hidden xs:inline">Test in </span>New Tab
                    </Button>
                    <Button onClick={copyDttCode} variant="outline" size="sm" className="gap-1.5 text-xs sm:text-sm flex-1 sm:flex-none">
                      {diamondCopied ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                      {diamondCopied ? 'Copied!' : 'Copy'}
                    </Button>
                  </div>
                </div>

                {isGlassQuoteEstimator(effectiveClientId) && (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">Live</span>
                    <span>
                      This code shows <span className="font-semibold text-foreground">{quoteVersionName(liveQuoteVersion)}</span> — {QUOTE_VERSION_META[liveQuoteVersion].description}
                    </span>
                    <span className="basis-full text-xs text-muted-foreground">
                      The embed URL carries no version, so making another version live under Configure switches the embedded form automatically. No need to copy the code again.
                    </span>
                  </div>
                )}

                <Textarea value={dttEmbedCode} readOnly rows={6} className="font-mono text-xs sm:text-sm" />
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Grill Builder Tab */}
        <TabsContent value="grill-builder">
          <Tabs defaultValue="preview" className="w-full">
           <TabsList className="inline-flex h-auto w-max gap-0 rounded-none border-b border-border bg-transparent p-0 mb-4">
              <TabsTrigger value="preview" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Preview</TabsTrigger>
              <TabsTrigger value="configure" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Configure</TabsTrigger>
              <TabsTrigger value="embed" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Embed Code</TabsTrigger>
              {grillConfig?.onboarding_completed && grillConfig?.submission_mode === 'deposit' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2 gap-1.5 text-xs"
                  disabled={isPushingGrill}
                  onClick={() => handlePushToShopify('grillz', grillConfig.deposit_amount || 0)}
                >
                  {isPushingGrill ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Push to Shopify
                </Button>
              )}
            </TabsList>

            <TabsContent value="preview">
              <div className="max-w-5xl mx-auto">
                {grillLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : grillConfig?.onboarding_completed ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center border rounded-lg p-1 gap-0.5">
                        <Button variant={grillPreviewMode === 'desktop' ? 'default' : 'ghost'} size="sm" className="h-8 w-8 p-0" onClick={() => setGrillPreviewMode('desktop')}>
                          <Monitor className="h-4 w-4" />
                        </Button>
                        <Button variant={grillPreviewMode === 'mobile' ? 'default' : 'ghost'} size="sm" className="h-8 w-8 p-0" onClick={() => setGrillPreviewMode('mobile')}>
                          <Smartphone className="h-4 w-4" />
                        </Button>
                      </div>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setGrillPreviewKey(k => k + 1)}>
                        <RefreshCw className="h-3.5 w-3.5" /> Refresh Preview
                      </Button>
                    </div>
                    {grillPreviewMode === 'mobile' ? (
                      <div className="flex justify-center bg-muted/40 p-4 rounded-lg">
                        <div className="w-[375px] h-[700px] border-4 border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                          <iframe
                            key={grillPreviewKey}
                            src={getGrillBuilderUrl(effectiveClientId!)}
                            className="w-full h-full border-0"
                            title="Grill Builder Mobile Preview"
                          />
                        </div>
                      </div>
                    ) : (
                      <GrillBuilderForm key={grillPreviewKey} config={{
                        ...grillConfig,
                        form_colors: {
                          ...grillConfig.form_colors,
                          ...(Object.fromEntries(Object.entries(grillColors).filter(([_, v]) => v))),
                        },
                      }} />
                    )}
                  </>
                ) : (
                  <Card className="p-8 sm:p-12 max-w-2xl mx-auto text-center space-y-4">
                    <div className="text-4xl">🦷</div>
                    <h3 className="text-xl font-semibold text-foreground">No Configuration Yet</h3>
                    <p className="text-muted-foreground text-sm">
                      Configure your Grill Builder first to see a preview of your widget.
                    </p>
                    <Button variant="outline" onClick={() => navigate(`${routePrefix}/grill-onboarding`)}>
                      <Settings2 className="h-4 w-4 mr-2" /> Configure Now
                    </Button>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="configure">
              <Card className="p-6 sm:p-8 max-w-2xl mx-auto space-y-6">
                <div className="text-center space-y-2">
                  <Settings2 className="h-10 w-10 mx-auto text-muted-foreground" />
                  <h3 className="text-xl font-semibold text-foreground">Configure Your Grill Builder</h3>
                  <p className="text-muted-foreground text-sm">
                    {grillConfig?.onboarding_completed
                      ? 'Your Grill Builder is configured. You can re-configure it anytime.'
                      : 'Set up which metals, purities, teeth options, and questions appear on your Grill Builder widget.'}
                  </p>
                  <Button onClick={() => navigate(`${routePrefix}/grill-onboarding`)} className="gap-2">
                    <Settings2 className="h-4 w-4" />
                    {grillConfig?.onboarding_completed ? 'Re-Configure' : 'Start Configuration'}
                  </Button>
                </div>

                {grillConfig?.onboarding_completed && (
                  <div className="border-t pt-6 space-y-4">
                    <h4 className="text-lg font-semibold text-foreground">🎨 Form Colors</h4>
                    <p className="text-xs text-muted-foreground">Customize the appearance of your public Grillz Builder form.</p>
                    <TooltipProvider delayDuration={200}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <ColorFieldWithTooltip label="Background Color" tooltip="Sets the overall background of your form" value={grillColors.background || '#ffffff'} onChange={v => setGrillColors(p => ({ ...p, background: v }))} placeholder="#ffffff" />
                      <ColorFieldWithTooltip label="Font Color" tooltip="Controls all text color throughout the form" value={grillColors.fontColor || '#000000'} onChange={v => setGrillColors(p => ({ ...p, fontColor: v }))} placeholder="#000000" />
                      <ColorFieldWithTooltip label="Accent Color" tooltip="Used for highlights, selected states, step indicators, and borders" value={grillColors.tabBorder || '#77bb41'} onChange={v => setGrillColors(p => ({ ...p, tabBorder: v }))} placeholder="#77bb41" />
                      
                      <ColorFieldWithTooltip label="Submit Button Color" tooltip="Fill color of the main action/submit button" value={grillColors.submitButtonBg || '#000000'} onChange={v => setGrillColors(p => ({ ...p, submitButtonBg: v }))} placeholder="#000000" />
                      <ColorFieldWithTooltip label="Submit Button Text" tooltip="Text color inside the submit button" value={grillColors.submitButtonText || '#ffffff'} onChange={v => setGrillColors(p => ({ ...p, submitButtonText: v }))} placeholder="#ffffff" />
                    </div>
                    </TooltipProvider>
                    <div className="flex gap-2">
                      <Button onClick={() => saveFormColors('grillz')} disabled={savingGrillColors} size="sm">
                        {savingGrillColors ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : 'Save Colors'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={async () => {
                        setGrillColors({ background: '', tabBorder: '', fontColor: '', imageBg: '', submitButtonBg: '', submitButtonText: '' });
                        if (effectiveClientId) {
                          await supabase.from('client_grill_config').update({ form_colors: null } as any).eq('client_id', effectiveClientId);
                          toast({ title: 'Reset!', description: 'Form colors reset to defaults' });
                          setGrillPreviewKey(k => k + 1);
                        }
                      }}>
                        Reset to Defaults
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="embed">
              {grillConfig?.onboarding_completed ? (
                <Card className="p-4 sm:p-6 space-y-4 max-w-2xl mx-auto">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <h3 className="text-base sm:text-lg font-semibold">🦷 Grill Builder Embed Code</h3>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          const hostname = window.location.hostname;
                          const isProduction = hostname.endsWith('.aurezotech.com');
                          const url = isProduction
                            ? `https://widget.aurezotech.com/grillz/${effectiveClientId}`
                            : `${window.location.origin}/embed-grillz/${effectiveClientId}`;
                          window.open(url, '_blank');
                        }}
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs sm:text-sm flex-1 sm:flex-none"
                        disabled={!effectiveClientId}
                      >
                        <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        <span className="hidden xs:inline">Test in </span>New Tab
                      </Button>
                      <Button onClick={copyGrillCode} variant="outline" size="sm" className="gap-1.5 text-xs sm:text-sm flex-1 sm:flex-none">
                        {grillCopied ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                        {grillCopied ? 'Copied!' : 'Copy'}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5 sm:space-y-2 p-3 sm:p-4 bg-muted/50 rounded-lg border">
                    <h4 className="font-semibold text-xs sm:text-sm">🦷 Grill Builder Lead Generation Form</h4>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Embed this form on your website to capture grillz customization leads. Customers select their metal, purity, teeth options, and submit their preferences for a personalized quote.
                    </p>
                  </div>

                  <Textarea value={grillEmbedCode} readOnly rows={6} className="font-mono text-xs sm:text-sm" />

                  <div className="space-y-2 sm:space-y-3 pt-2">
                    <h4 className="font-semibold text-xs sm:text-sm">How to Use:</h4>
                    <ol className="text-xs sm:text-sm text-muted-foreground space-y-1.5 sm:space-y-2 list-decimal list-inside">
                      <li>Click "Test in New Tab" to verify the form works</li>
                      <li>Copy the embed code above</li>
                      <li>Paste it into any page on your website (Shopify, WordPress, etc.)</li>
                      <li>The form auto-resizes on desktop and goes full-screen on mobile</li>
                    </ol>
                  </div>
                </Card>
              ) : (
                <Card className="p-4 sm:p-6 space-y-4 max-w-2xl mx-auto text-center">
                  <div className="text-4xl">🦷</div>
                  <h3 className="text-xl font-semibold text-foreground">Configure First</h3>
                  <p className="text-muted-foreground text-sm">
                    Complete the Grill Builder configuration before generating embed code.
                  </p>
                  <Button variant="outline" onClick={() => navigate(`${routePrefix}/grill-onboarding`)}>
                    <Settings2 className="h-4 w-4 mr-2" /> Configure Now
                  </Button>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* Custom Enquiry Tab */}
        <TabsContent value="custom-enquiry">
          <Tabs defaultValue="preview" className="w-full">
            <TabsList className="inline-flex h-auto w-max gap-0 rounded-none border-b border-border bg-transparent p-0 mb-4">
              <TabsTrigger value="preview" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Preview</TabsTrigger>
              <TabsTrigger value="configure" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Configure</TabsTrigger>
              <TabsTrigger value="embed" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Embed Code</TabsTrigger>
              {enquiryConfig?.onboarding_completed && enquiryConfig?.submission_mode === 'deposit' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2 gap-1.5 text-xs"
                  disabled={isPushingEnquiry}
                  onClick={() => handlePushToShopify('custom_enquiry', enquiryConfig.deposit_amount || 0)}
                >
                  {isPushingEnquiry ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  Push to Shopify
                </Button>
              )}
            </TabsList>

            <TabsContent value="preview">
              <div className="max-w-5xl mx-auto">
                {enquiryLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : enquiryConfig?.onboarding_completed ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center border rounded-lg p-1 gap-0.5">
                        <Button variant={enquiryPreviewMode === 'desktop' ? 'default' : 'ghost'} size="sm" className="h-8 w-8 p-0" onClick={() => setEnquiryPreviewMode('desktop')}>
                          <Monitor className="h-4 w-4" />
                        </Button>
                        <Button variant={enquiryPreviewMode === 'mobile' ? 'default' : 'ghost'} size="sm" className="h-8 w-8 p-0" onClick={() => setEnquiryPreviewMode('mobile')}>
                          <Smartphone className="h-4 w-4" />
                        </Button>
                      </div>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEnquiryPreviewKey(k => k + 1)}>
                        <RefreshCw className="h-3.5 w-3.5" /> Refresh Preview
                      </Button>
                    </div>
                    {enquiryPreviewMode === 'mobile' ? (
                      <div className="flex justify-center bg-muted/40 p-4 rounded-lg">
                        <div className="w-[375px] h-[700px] border-4 border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                          <iframe
                            key={enquiryPreviewKey}
                            src={getCustomEnquiryUrl(effectiveClientId!)}
                            className="w-full h-full border-0"
                            title="Custom Enquiry Mobile Preview"
                          />
                        </div>
                      </div>
                    ) : (
                      <CustomEnquiryForm key={enquiryPreviewKey} config={{
                        ...enquiryConfig,
                        form_colors: {
                          ...enquiryConfig.form_colors,
                          ...(Object.fromEntries(Object.entries(enquiryColors).filter(([_, v]) => v))),
                        },
                      }} />
                    )}
                  </>
                ) : (
                  <Card className="p-8 sm:p-12 max-w-2xl mx-auto text-center space-y-4">
                    <div className="text-4xl">✉️</div>
                    <h3 className="text-xl font-semibold text-foreground">No Configuration Yet</h3>
                    <p className="text-muted-foreground text-sm">
                      Configure your Custom Enquiry form first to see a preview of your widget.
                    </p>
                    <Button variant="outline" onClick={() => navigate(`${routePrefix}/custom-enquiry-onboarding`)}>
                      <Settings2 className="h-4 w-4 mr-2" /> Configure Now
                    </Button>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="configure">
              <Card className="p-6 sm:p-8 max-w-2xl mx-auto space-y-6">
                <div className="text-center space-y-2">
                  <Settings2 className="h-10 w-10 mx-auto text-muted-foreground" />
                  <h3 className="text-xl font-semibold text-foreground">Configure Your Custom Enquiry</h3>
                  <p className="text-muted-foreground text-sm">
                    {enquiryConfig?.onboarding_completed
                      ? 'Your Custom Enquiry form is configured. You can re-configure it anytime.'
                      : 'Set up which jewelry types, budgets, gold colors, karats, diamonds, and questions appear on your Custom Enquiry widget.'}
                  </p>
                  <Button onClick={() => navigate(`${routePrefix}/custom-enquiry-onboarding`)} className="gap-2">
                    <Settings2 className="h-4 w-4" />
                    {enquiryConfig?.onboarding_completed ? 'Re-Configure' : 'Start Configuration'}
                  </Button>
                </div>

                {enquiryConfig?.onboarding_completed && (
                  <div className="border-t pt-6 space-y-4">
                    <h4 className="text-lg font-semibold text-foreground">🎨 Form Colors</h4>
                    <p className="text-xs text-muted-foreground">Customize the appearance of your public Custom Enquiry form.</p>
                    <TooltipProvider delayDuration={200}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <ColorFieldWithTooltip label="Background Color" tooltip="Sets the overall background of your form" value={enquiryColors.background || '#ffffff'} onChange={v => setEnquiryColors(p => ({ ...p, background: v }))} placeholder="#ffffff" />
                      <ColorFieldWithTooltip label="Font Color" tooltip="Controls all text color throughout the form" value={enquiryColors.fontColor || '#000000'} onChange={v => setEnquiryColors(p => ({ ...p, fontColor: v }))} placeholder="#000000" />
                      <ColorFieldWithTooltip label="Accent Color" tooltip="Used for highlights, selected states, step indicators, and borders" value={enquiryColors.tabBorder || '#77bb41'} onChange={v => setEnquiryColors(p => ({ ...p, tabBorder: v }))} placeholder="#77bb41" />
                      
                      <ColorFieldWithTooltip label="Submit Button Color" tooltip="Fill color of the main action/submit button" value={enquiryColors.submitButtonBg || '#000000'} onChange={v => setEnquiryColors(p => ({ ...p, submitButtonBg: v }))} placeholder="#000000" />
                      <ColorFieldWithTooltip label="Submit Button Text" tooltip="Text color inside the submit button" value={enquiryColors.submitButtonText || '#ffffff'} onChange={v => setEnquiryColors(p => ({ ...p, submitButtonText: v }))} placeholder="#ffffff" />
                    </div>
                    </TooltipProvider>
                    <div className="flex gap-2">
                      <Button onClick={() => saveFormColors('custom_enquiry')} disabled={savingEnquiryColors} size="sm">
                        {savingEnquiryColors ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : 'Save Colors'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={async () => {
                        setEnquiryColors({ background: '', tabBorder: '', fontColor: '', imageBg: '', submitButtonBg: '', submitButtonText: '' });
                        if (effectiveClientId) {
                          await supabase.from('client_custom_enquiry_config').update({ form_colors: null } as any).eq('client_id', effectiveClientId);
                          toast({ title: 'Reset!', description: 'Form colors reset to defaults' });
                          setEnquiryPreviewKey(k => k + 1);
                        }
                      }}>
                        Reset to Defaults
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="embed">
              {enquiryConfig?.onboarding_completed ? (
                <Card className="p-4 sm:p-6 space-y-4 max-w-2xl mx-auto">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <h3 className="text-base sm:text-lg font-semibold">✉️ Custom Enquiry Embed Code</h3>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => {
                          const hostname = window.location.hostname;
                          const isProduction = hostname.endsWith('.aurezotech.com');
                          const url = isProduction
                            ? `https://widget.aurezotech.com/custom-enquiry/${effectiveClientId}`
                            : `${window.location.origin}/embed-custom-enquiry/${effectiveClientId}`;
                          window.open(url, '_blank');
                        }}
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs sm:text-sm flex-1 sm:flex-none"
                        disabled={!effectiveClientId}
                      >
                        <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        <span className="hidden xs:inline">Test in </span>New Tab
                      </Button>
                      <Button onClick={copyEnquiryCode} variant="outline" size="sm" className="gap-1.5 text-xs sm:text-sm flex-1 sm:flex-none">
                        {enquiryCopied ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                        {enquiryCopied ? 'Copied!' : 'Copy'}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5 sm:space-y-2 p-3 sm:p-4 bg-muted/50 rounded-lg border">
                    <h4 className="font-semibold text-xs sm:text-sm">✉️ Custom Enquiry Lead Generation Form</h4>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Embed this form on your website to capture custom jewelry enquiries. Customers select their jewelry type, budget, gold color, diamonds, and submit their preferences.
                    </p>
                  </div>

                  <Textarea value={enquiryEmbedCode} readOnly rows={6} className="font-mono text-xs sm:text-sm" />

                  <div className="space-y-2 sm:space-y-3 pt-2">
                    <h4 className="font-semibold text-xs sm:text-sm">How to Use:</h4>
                    <ol className="text-xs sm:text-sm text-muted-foreground space-y-1.5 sm:space-y-2 list-decimal list-inside">
                      <li>Click "Test in New Tab" to verify the form works</li>
                      <li>Copy the embed code above</li>
                      <li>Paste it into any page on your website (Shopify, WordPress, etc.)</li>
                      <li>The form auto-resizes on desktop and goes full-screen on mobile</li>
                    </ol>
                  </div>
                </Card>
              ) : (
                <Card className="p-4 sm:p-6 space-y-4 max-w-2xl mx-auto text-center">
                  <div className="text-4xl">✉️</div>
                  <h3 className="text-xl font-semibold text-foreground">Configure First</h3>
                  <p className="text-muted-foreground text-sm">
                    Complete the Custom Enquiry configuration before generating embed code.
                  </p>
                  <Button variant="outline" onClick={() => navigate(`${routePrefix}/custom-enquiry-onboarding`)}>
                    <Settings2 className="h-4 w-4 mr-2" /> Configure Now
                  </Button>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
    </div>
  );
}