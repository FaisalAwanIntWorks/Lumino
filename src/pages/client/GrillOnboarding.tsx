import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { toast } from 'sonner';
import type { GrillMetalConfig } from '@/hooks/useClientGrillConfig';
import { GRILL_DEFAULT_BUDGET_OPTIONS } from '@/lib/form-defaults';
import type { CustomQuestion } from '@/components/ring-form-config/QuestionEditor';
import { GrillFormConfigurator } from '@/components/grill-form-config/GrillFormConfigurator';
import type { OptionImageOverrides } from '@/lib/option-image-overrides';
import {
  DEFAULT_GRILL_TYPE_OPTIONS, resolveGrillTypeOptions, sortByMetalOrder,
  type GrillTypeOption,
} from '@/lib/grill-metal-images';
import {
  GRILL_TOGGLEABLE_OPTIONS, resolveGrillEnabledOptions, type GrillEnabledOptions,
} from '@/lib/grill-option-toggles';
import { canView, canEdit } from '@/lib/staff-permissions';
import { AccessDenied } from '@/components/access/AccessDenied';
import { DEFAULT_AI_IMAGE_DELIVERY, resolveAiImageDelivery, type AiImageDelivery } from '@/lib/ai-image-delivery';
import { DEFAULT_THANK_YOU_CONTACT, resolveThankYouContact, serializeThankYouContact, validateThankYouContact, type ThankYouContact } from '@/lib/thank-you-contact';


const MASTER_METALS: GrillMetalConfig[] = [
  { value: 'gold', label: 'Gold', color: 'bg-yellow-400', purities: [
    { value: '10k', label: '10K Gold' }, { value: '14k', label: '14K Gold' }, { value: '18k', label: '18K Gold' },
  ]},
  { value: 'silver', label: 'Silver', color: 'bg-gradient-to-br from-gray-200 to-gray-400', purities: [
    { value: '0.925', label: '0.925 Sterling Silver' }, { value: '0.925-18k-wgp', label: '0.925 Sterling Silver + 18K White Gold Plated' },
  ]},
  { value: 'rose-gold', label: 'Rose Gold', color: 'bg-pink-200', purities: [
    { value: '10k-rose', label: '10K Rose Gold' }, { value: '14k-rose', label: '14K Rose Gold' }, { value: '18k-rose', label: '18K Rose Gold' },
  ]},
  { value: 'black', label: 'Black', color: 'bg-gray-700', purities: [
    { value: 'black-pvd', label: 'Black PVD Coating' }, { value: 'black-rhodium', label: 'Black Rhodium' },
  ]},
];

const DEFAULT_TEETH = ['none', '1', '2', '3', '4', '6', '8', '10'];


const TOGGLEABLE_FORM_STEPS = [
  { key: 'type', label: 'Grillz Type (Plain / Iced Out)' },
  { key: 'metal', label: 'Metal Selection' },
  { key: 'teeth', label: 'Teeth Selection' },
  { key: 'fangs', label: 'Extended Fangs' },
  { key: 'open_faced', label: 'Open Faced' },
  { key: 'engraving', label: 'Personalized Inscription' },
  { key: 'description', label: 'Describe Your Vision' },
  { key: 'inspiration', label: 'Upload Inspiration Image' },
];

export default function GrillOnboarding() {
  const navigate = useNavigate();
  const { user, role, staffInfo } = useAuth();
  const { impersonatedClientId, isImpersonating } = useAdminImpersonation();
  const [isSaving, setIsSaving] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // State
  const [submissionMode, setSubmissionMode] = useState<'deposit' | 'contact'>('contact');
  const [depositAmount, setDepositAmount] = useState('');
  const [thankYouContact, setThankYouContact] = useState<ThankYouContact>(DEFAULT_THANK_YOU_CONTACT);
  const [selectedMetals, setSelectedMetals] = useState<Record<string, boolean>>({});
  const [selectedPurities, setSelectedPurities] = useState<Record<string, Record<string, boolean>>>({});
  const [customMetals, setCustomMetals] = useState<GrillMetalConfig[]>([]);
  const [allTeeth, setAllTeeth] = useState<string[]>(DEFAULT_TEETH);
  const [topTeeth, setTopTeeth] = useState<Record<string, boolean>>(Object.fromEntries(DEFAULT_TEETH.map(t => [t, true])));
  const [bottomTeeth, setBottomTeeth] = useState<Record<string, boolean>>(Object.fromEntries(DEFAULT_TEETH.map(t => [t, true])));
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([]);
  const [budgetOptions, setBudgetOptions] = useState<string[]>([...GRILL_DEFAULT_BUDGET_OPTIONS]);
  const [requiredContactFields, setRequiredContactFields] = useState<Record<string, boolean>>({ name: true, email: true, phone: true });
  const [enabledFormSteps, setEnabledFormSteps] = useState<Record<string, boolean>>(Object.fromEntries(TOGGLEABLE_FORM_STEPS.map(s => [s.key, true])));
  const [stepLabels, setStepLabels] = useState<Record<string, { title?: string; subtitle?: string; shortLabel?: string }>>({});
  const [stepOrder, setStepOrder] = useState<string[]>(TOGGLEABLE_FORM_STEPS.map(s => s.key));
  const [aiImageEnabled, setAiImageEnabled] = useState(false);
  const [aiImageDelivery, setAiImageDelivery] = useState<AiImageDelivery>(DEFAULT_AI_IMAGE_DELIVERY);
  const [stepGroups, setStepGroups] = useState<string[][] | null>(null);
  const [optionImageOverrides, setOptionImageOverrides] = useState<OptionImageOverrides>({});
  const [grillTypeOptions, setGrillTypeOptions] = useState<GrillTypeOption[]>(DEFAULT_GRILL_TYPE_OPTIONS.map(o => ({ ...o })));
  const [metalOrder, setMetalOrder] = useState<string[]>([]);
  const [enabledOptions, setEnabledOptions] = useState<GrillEnabledOptions>({});


  // Merge metals
  const getUniqueMetals = () => {
    const masterValues = new Set(MASTER_METALS.map(m => m.value));
    const purelyCustom = customMetals.filter(m => !masterValues.has(m.value));
    return [...MASTER_METALS, ...purelyCustom];
  };

  const getMergedPurities = (metalValue: string) => {
    const master = MASTER_METALS.find(m => m.value === metalValue);
    const custom = customMetals.find(m => m.value === metalValue);
    const masterP = master?.purities || [];
    const customP = custom?.purities || [];
    const seen = new Set(masterP.map(p => p.value));
    return [...masterP, ...customP.filter(p => !seen.has(p.value))];
  };

  const allMetals: GrillMetalConfig[] = sortByMetalOrder(
    getUniqueMetals().map(m => ({ ...m, purities: getMergedPurities(m.value) })),
    metalOrder,
  );

  const getSelectedMetalConfigs = (): GrillMetalConfig[] => {
    return allMetals.filter(m => selectedMetals[m.value]).map(m => ({
      ...m, purities: getMergedPurities(m.value).filter(p => selectedPurities[m.value]?.[p.value]),
    }));
  };


  useEffect(() => {
    const fetchClientId = async () => {
      if (isImpersonating && impersonatedClientId) { setClientId(impersonatedClientId); return; }
      if (role === 'staff' && staffInfo?.clientId) { setClientId(staffInfo.clientId); return; }
      if (!user) return;
      const { data } = await supabase.from('clients').select('id').eq('user_id', user.id).maybeSingle();
      if (data) setClientId(data.id);
    };
    fetchClientId();
  }, [user, role, staffInfo, isImpersonating, impersonatedClientId]);

  // Load existing config
  useEffect(() => {
    if (!clientId) return;
    const loadExisting = async () => {
      const { data } = await supabase.from('client_grill_config').select('*').eq('client_id', clientId).maybeSingle();
      if (data) {
        setSubmissionMode((data.submission_mode as 'deposit' | 'contact') || 'contact');
        setDepositAmount(data.deposit_amount ? String(data.deposit_amount) : '');
        setThankYouContact(resolveThankYouContact(data.thank_you_contact));
        if (data.budget_options) setBudgetOptions(data.budget_options as string[]);
        if ((data as any).required_contact_fields) setRequiredContactFields((data as any).required_contact_fields);
        if ((data as any).enabled_steps) setEnabledFormSteps(prev => ({ ...prev, ...(data as any).enabled_steps }));
        if ((data as any).step_labels) setStepLabels((data as any).step_labels);
        if ((data as any).step_order) {
          const saved: string[] = (data as any).step_order;
          const allKeys = TOGGLEABLE_FORM_STEPS.map(s => s.key);
          const filtered = saved.filter(k => k !== 'questions' && (allKeys.includes(k) || k.startsWith('custom_')));
          const missing = allKeys.filter(k => !filtered.includes(k));
          setStepOrder([...filtered, ...missing]);
        }
        if ((data as any).ai_image_enabled != null) setAiImageEnabled((data as any).ai_image_enabled);
        setAiImageDelivery(resolveAiImageDelivery((data as any).ai_image_delivery));
        if ((data as any).step_groups) setStepGroups((data as any).step_groups);
        if ((data as any).option_image_overrides && typeof (data as any).option_image_overrides === 'object') {
          setOptionImageOverrides((data as any).option_image_overrides as OptionImageOverrides);
        }
        if ((data as any).grill_type_options) {
          setGrillTypeOptions(resolveGrillTypeOptions((data as any).grill_type_options));
        }
        if ((data as any).enabled_options) {
          setEnabledOptions(resolveGrillEnabledOptions((data as any).enabled_options));
        }
        if (Array.isArray((data as any).metal_order)) {
          setMetalOrder(((data as any).metal_order as unknown[]).filter((v): v is string => typeof v === 'string'));
        }


        // Load metals
        const metals = (data.enabled_metals as any as GrillMetalConfig[]) || [];
        const masterValues = new Set(MASTER_METALS.map(m => m.value));
        const sm: Record<string, boolean> = {};
        const sp: Record<string, Record<string, boolean>> = {};
        const customLoaded: GrillMetalConfig[] = [];
        metals.forEach(m => {
          sm[m.value] = true;
          sp[m.value] = {};
          m.purities.forEach(p => { sp[m.value][p.value] = true; });
          if (!masterValues.has(m.value)) {
            // Re-hydrate purely-custom metals so they survive a refresh.
            customLoaded.push(m);
          } else {
            // Capture custom purities added under a master metal.
            const master = MASTER_METALS.find(mm => mm.value === m.value);
            const masterPurityValues = new Set((master?.purities || []).map(p => p.value));
            const extraPurities = m.purities.filter(p => !masterPurityValues.has(p.value));
            if (extraPurities.length) {
              customLoaded.push({ ...m, purities: extraPurities });
            }
          }
        });
        setSelectedMetals(sm);
        setSelectedPurities(sp);
        if (customLoaded.length) setCustomMetals(customLoaded);

        // Load teeth
        if (data.top_teeth_options?.length) {
          const allT = [...new Set([...DEFAULT_TEETH, ...data.top_teeth_options, ...data.bottom_teeth_options])];
          setAllTeeth(allT);
          setTopTeeth(Object.fromEntries(allT.map(t => [t, data.top_teeth_options.includes(t)])));
          setBottomTeeth(Object.fromEntries(allT.map(t => [t, data.bottom_teeth_options.includes(t)])));
        }
      }
      // Load custom questions (skip default questions — they are now top-level steps)
      const { data: qData } = await supabase.from('client_grill_questions').select('*').eq('client_id', clientId).eq('is_default', false).order('display_order');
      if (qData) {
        const cqs: CustomQuestion[] = qData.map(q => ({
          id: q.id, question_text: q.question_text, question_key: q.question_key,
          question_type: q.question_type, options: Array.isArray(q.options) ? q.options as string[] : [],
          option_images: q.option_images ? q.option_images as Record<string, string> : undefined,
          is_enabled: q.is_enabled, is_required: q.is_required,
          has_text_followup: q.has_text_followup, has_file_followup: q.has_file_followup,
          display_order: q.display_order,
          subtitle: (q as any).subtitle || undefined,
        }));
        setCustomQuestions(cqs);
      }
    };
    loadExisting();
  }, [clientId]);

  const handleSave = async () => {
    if (!clientId) return;
    if (role === 'staff' && !canEdit(staffInfo?.permissions?.custom_x_access)) {
      toast.error('View only — you do not have permission to save changes.');
      return;
    }
    // L3: validate deposit amount before persisting — prevents silent "deposit mode with $0" fallback
    if (submissionMode === 'deposit' && (!depositAmount || parseFloat(depositAmount) <= 0)) {
      toast.error('Deposit mode requires a valid deposit amount greater than 0.');
      return;
    }
    const thankYouError = validateThankYouContact(thankYouContact);
    if (thankYouError) {
      toast.error(thankYouError);
      return;
    }
    setIsSaving(true);
    try {
      const enabledMetalConfigs = getSelectedMetalConfigs();
      const topOpts = allTeeth.filter(t => topTeeth[t]);
      const bottomOpts = allTeeth.filter(t => bottomTeeth[t]);

      // Validate + sanitize option_image_overrides:
      //  - every metal override must reference a known metal (master or custom)
      //  - the uploaded storage path must contain the metal value (proves the URL
      //    belongs to the option it was attached to — guards against UI mis-wiring)
      //  - orphaned overrides (metal deleted / renamed) are stripped silently
      const knownMetalValues = new Set(getUniqueMetals().map(m => m.value));
      const knownTypeValues = new Set(grillTypeOptions.map(o => o.value));
      const sanitizedOverrides: OptionImageOverrides = { ...(optionImageOverrides || {}) };
      // Metal images are stored per Grillz Type under `metal__<type>`, plus the
      // legacy shared `metal` map. Sanitize every one of them.
      const metalStepKeys = Object.keys(sanitizedOverrides).filter(
        k => k === 'metal' || k.startsWith('metal__'),
      );
      const mismatched: string[] = [];
      for (const stepKey of metalStepKeys) {
        // Drop image maps belonging to a deleted Grillz Type option.
        if (stepKey.startsWith('metal__')) {
          const typeValue = stepKey.slice('metal__'.length);
          if (!knownTypeValues.has(typeValue)) {
            delete sanitizedOverrides[stepKey];
            continue;
          }
        }
        const metalOverrides = { ...(sanitizedOverrides[stepKey] || {}) };
        for (const [metalValue, url] of Object.entries(metalOverrides)) {
          if (!knownMetalValues.has(metalValue)) {
            delete metalOverrides[metalValue];
            continue;
          }
          if (typeof url !== 'string' || !url) {
            delete metalOverrides[metalValue];
            continue;
          }
          // Storage path layout (see uploadOptionOverride): `.../<stepKey>/<safeValue>-<ts>.<ext>`
          // The step segment may be `metal` or any `metal__<type>` namespace — images
          // can legitimately be copied between Grillz Types — so we only assert that
          // the file belongs to this metal option.
          const safeValue = metalValue.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'option';
          const expectedSegment = `/${safeValue}-`;
          if (!url.includes(expectedSegment)) {
            mismatched.push(metalValue);
          }

        }
        if (Object.keys(metalOverrides).length === 0) delete sanitizedOverrides[stepKey];
        else sanitizedOverrides[stepKey] = metalOverrides;
      }
      if (mismatched.length) {
        const unique = Array.from(new Set(mismatched));
        toast.error(
          `Image mismatch detected for: ${unique.join(', ')}. Re-upload the image for ${unique.length > 1 ? 'these metals' : 'this metal'} before saving.`,
        );
        setIsSaving(false);
        return;
      }
      // Reflect sanitization back to UI so orphans don't reappear on next save.
      setOptionImageOverrides(sanitizedOverrides);

      // Sanitize per-option toggles: keep only known step/option pairs, and never
      // persist a step with every option off (the widget would render an empty step).
      const sanitizedEnabledOptions: GrillEnabledOptions = {};
      for (const [stepKey, rows] of Object.entries(GRILL_TOGGLEABLE_OPTIONS)) {
        const stored = enabledOptions?.[stepKey];
        if (!stored) continue;
        const disabled = rows.filter(r => stored[r.value] === false);
        if (disabled.length === 0 || disabled.length === rows.length) continue;
        sanitizedEnabledOptions[stepKey] = Object.fromEntries(disabled.map(r => [r.value, false]));
      }
      setEnabledOptions(sanitizedEnabledOptions);

      const { error: configError } = await supabase.from('client_grill_config').upsert({
        client_id: clientId,
        enabled_metals: enabledMetalConfigs as any,
        top_teeth_options: topOpts,
        bottom_teeth_options: bottomOpts,
        onboarding_completed: true,
        submission_mode: submissionMode,
        deposit_amount: submissionMode === 'deposit' ? (parseFloat(depositAmount) || 0) : null,
        thank_you_contact: serializeThankYouContact(thankYouContact),
        ai_image_enabled: aiImageEnabled,
        ai_image_delivery: aiImageDelivery,
        budget_options: budgetOptions.length > 0 ? budgetOptions : null,
        required_contact_fields: requiredContactFields,
        enabled_steps: enabledFormSteps,
        step_labels: Object.keys(stepLabels).length > 0 ? stepLabels : null,
        step_order: stepOrder,
        step_groups: stepGroups,
        option_image_overrides: sanitizedOverrides,
        enabled_options: Object.keys(sanitizedEnabledOptions).length > 0 ? sanitizedEnabledOptions : null,
        grill_type_options: grillTypeOptions,
        metal_order: allMetals.map(m => m.value),

      } as any, { onConflict: 'client_id' });

      if (configError) throw configError;

      // Save custom questions only (default questions are now top-level steps)
      await supabase.from('client_grill_questions').delete().eq('client_id', clientId).eq('is_default', false);
      const questionsToInsert = customQuestions.map((q, i) => ({
        client_id: clientId, question_text: q.question_text,
        // Keep a stable key (used by step_order as `custom_q_<question_key>`), never index-derived
        question_key: q.question_key || q.question_text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40),
        question_type: q.question_type, is_default: false, is_enabled: q.is_enabled, is_required: q.is_required,
        display_order: i, has_text_followup: q.has_text_followup, has_file_followup: q.has_file_followup,
        options: q.options.length > 0 ? q.options : null,
        option_images: q.option_images || null,
        subtitle: q.subtitle || null,
      }));
      if (questionsToInsert.length > 0) {
        const { error: qError } = await supabase.from('client_grill_questions').insert(questionsToInsert);
        if (qError) throw qError;
      }

      toast.success('Grill Builder configured successfully!');
      setShowSuccessDialog(true);
    } catch (err: any) {
      console.error('Error saving grill config:', err);
      toast.error(err.message || 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  // Staff guard: Custom X access — disabled hides this page entirely
  if (role === 'staff' && !canView(staffInfo?.permissions?.custom_x_access)) {
    return <AccessDenied feature="Grillz Builder" />;
  }

  const isReadOnly = role === 'staff' && !canEdit(staffInfo?.permissions?.custom_x_access);

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-card/50">
        <Button variant="ghost" size="sm" onClick={() => navigate(isImpersonating ? '/admin/view-as/diamonds-form?tab=grill-builder' : '/dashboard/diamonds-form?tab=grill-builder')} className="gap-1">
          <ChevronLeft className="w-4 h-4" /> Back to Forms
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground">Grill Builder Configuration</h1>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <GrillFormConfigurator
          clientId={clientId}
          submissionMode={submissionMode}
          depositAmount={depositAmount}
          onSubmissionModeChange={setSubmissionMode}
          onDepositAmountChange={setDepositAmount}
          thankYouContact={thankYouContact}
          onThankYouContactChange={setThankYouContact}
          aiImageEnabled={aiImageEnabled}
          onAiImageEnabledChange={setAiImageEnabled}
          aiImageDelivery={aiImageDelivery}
          onAiImageDeliveryChange={setAiImageDelivery}
          steps={TOGGLEABLE_FORM_STEPS}
          enabledSteps={enabledFormSteps}
          onToggleStep={key => setEnabledFormSteps(prev => ({ ...prev, [key]: !prev[key] }))}
          stepOrder={stepOrder}
          onOrderChange={setStepOrder}
          stepLabels={stepLabels}
          onStepLabelChange={(key, field, value) => setStepLabels(prev => ({ ...prev, [key]: { ...prev[key], [field]: value || undefined } }))}
          metals={allMetals}
          metalOrder={metalOrder}
          onMetalOrderChange={setMetalOrder}
          grillTypeOptions={grillTypeOptions}
          onGrillTypeOptionsChange={setGrillTypeOptions}

          selectedMetals={selectedMetals}
          selectedPurities={selectedPurities}
          onToggleMetal={v => setSelectedMetals(prev => ({ ...prev, [v]: !prev[v] }))}
          onTogglePurity={(metal, purity) => setSelectedPurities(prev => ({ ...prev, [metal]: { ...(prev[metal] || {}), [purity]: !(prev[metal]?.[purity]) } }))}
          onAddCustomMetal={label => {
            const value = label.toLowerCase().replace(/\s+/g, '-');
            if (allMetals.some(m => m.value === value)) return;
            setCustomMetals(prev => [...prev, { value, label, color: `custom:${label.toLowerCase()}`, purities: [] }]);
            setSelectedMetals(prev => ({ ...prev, [value]: true }));
          }}
          onAddCustomPurity={(metalValue, label) => {
            const pValue = label.toLowerCase().replace(/\s+/g, '-');
            const existing = customMetals.find(m => m.value === metalValue);
            if (existing) {
              setCustomMetals(prev => prev.map(m => m.value === metalValue ? { ...m, purities: [...m.purities, { value: pValue, label }] } : m));
            } else {
              const metal = allMetals.find(m => m.value === metalValue);
              setCustomMetals(prev => [...prev, { value: metalValue, label: metal?.label || metalValue, color: metal?.color || 'bg-muted', purities: [{ value: pValue, label }] }]);
            }
            setSelectedPurities(prev => ({ ...prev, [metalValue]: { ...(prev[metalValue] || {}), [pValue]: true } }));
          }}
          allTeeth={allTeeth}
          topTeeth={topTeeth}
          bottomTeeth={bottomTeeth}
          onToggleTopTooth={v => setTopTeeth(prev => ({ ...prev, [v]: !prev[v] }))}
          onToggleBottomTooth={v => setBottomTeeth(prev => ({ ...prev, [v]: !prev[v] }))}
          onAddCustomTooth={(pos, value) => {
            if (!allTeeth.includes(value)) setAllTeeth(prev => [...prev, value]);
            if (pos === 'top') setTopTeeth(prev => ({ ...prev, [value]: true }));
            else setBottomTeeth(prev => ({ ...prev, [value]: true }));
          }}
          budgetOptions={budgetOptions}
          onBudgetOptionsChange={setBudgetOptions}
          requiredContactFields={requiredContactFields}
          onRequiredContactFieldsChange={setRequiredContactFields}
          customQuestions={customQuestions}
          onCustomQuestionsChange={setCustomQuestions}
          stepGroups={stepGroups}
          onStepGroupsChange={setStepGroups}
          optionImageOverrides={optionImageOverrides}
          onOptionImageOverridesChange={setOptionImageOverrides}
          enabledOptions={enabledOptions}
          onEnabledOptionsChange={setEnabledOptions}

          activeKey={activeKey}
          onActiveKeyChange={setActiveKey}
          onSave={handleSave}
          isSaving={isSaving}
        />
      </div>

      <AlertDialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>🎉 Grill Builder Configured!</AlertDialogTitle>
            <AlertDialogDescription>
              Your Grill Builder has been successfully configured. Go to the Preview tab to see your widget.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => { navigate(isImpersonating ? '/admin/view-as/diamonds-form?tab=grill-builder' : '/dashboard/diamonds-form?tab=grill-builder'); }}>Go to Preview</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
