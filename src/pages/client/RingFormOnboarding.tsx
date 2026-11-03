import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import { useAllDiamondFormOptions } from '@/hooks/useAllDiamondFormOptions';
import { toast } from 'sonner';
import type { RingFormStepOption } from '@/hooks/useClientRingFormConfig';
import type { CustomQuestion } from '@/components/ring-form-config/QuestionEditor';
import {
  RingFormConfigurator,
  RING_STEPS,
  NON_OPTION_STEPS,
  ALL_STEPS,
  DEFAULT_BUDGET_OPTIONS,
} from '@/components/ring-form-config/RingFormConfigurator';
import { KARAT_DEFAULT_OPTIONS, DEFAULT_TIMELINE_OPTIONS } from '@/components/ring-builder-wizard/ring-builder-constants';
import type { OptionImageOverrides } from '@/lib/option-image-overrides';
import { canView, canEdit } from '@/lib/staff-permissions';

import { AccessDenied } from '@/components/access/AccessDenied';
import { DEFAULT_AI_IMAGE_DELIVERY, resolveAiImageDelivery, type AiImageDelivery } from '@/lib/ai-image-delivery';
import { DEFAULT_THANK_YOU_CONTACT, resolveThankYouContact, serializeThankYouContact, validateThankYouContact, type ThankYouContact } from '@/lib/thank-you-contact';

export default function RingFormOnboarding() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, role, staffInfo } = useAuth();
  const { impersonatedClientId, isImpersonating } = useAdminImpersonation();
  const [isSaving, setIsSaving] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // Config state
  const [submissionMode, setSubmissionMode] = useState<'deposit' | 'contact'>('contact');
  const [depositAmount, setDepositAmount] = useState('');
  const [thankYouContact, setThankYouContact] = useState<ThankYouContact>(DEFAULT_THANK_YOU_CONTACT);
  const [enabledSteps, setEnabledSteps] = useState<Record<string, boolean>>(
    Object.fromEntries(ALL_STEPS.map(s => [s.key, true]))
  );
  const [disabledOptions, setDisabledOptions] = useState<Record<string, Set<string>>>({});
  const [customOptions, setCustomOptions] = useState<Record<string, RingFormStepOption[]>>({});
  const [selectedBudgets, setSelectedBudgets] = useState<Record<string, boolean>>(
    Object.fromEntries(DEFAULT_BUDGET_OPTIONS.map(b => [b, true]))
  );
  const [selectedTimelines, setSelectedTimelines] = useState<Record<string, boolean>>(
    Object.fromEntries(DEFAULT_TIMELINE_OPTIONS.map(t => [t.label, true]))
  );
  const [requiredContactFields, setRequiredContactFields] = useState<Record<string, boolean>>({ name: true, email: true, phone: true });
  const [stepLabels, setStepLabels] = useState<Record<string, { title?: string; subtitle?: string; shortLabel?: string }>>({});
  const [stepOrder, setStepOrder] = useState<string[]>(ALL_STEPS.map(s => s.key));
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([]);
  const [aiImageEnabled, setAiImageEnabled] = useState(false);
  const [aiImageDelivery, setAiImageDelivery] = useState<AiImageDelivery>(DEFAULT_AI_IMAGE_DELIVERY);
  const [stepGroups, setStepGroups] = useState<string[][] | null>(null);
  const [optionImageOverrides, setOptionImageOverrides] = useState<OptionImageOverrides>({});


  // B1: Single batched RPC instead of 10 separate SELECTs.
  const allOpts = useAllDiamondFormOptions(clientId || undefined);
  const allMasterLoaded = !allOpts.isLoading;
  const masterOptionsMap: Record<string, any> = {
    nature: allOpts.data?.nature,
    shape: allOpts.data?.shape,
    size: allOpts.data?.size,
    quality: allOpts.data?.quality,
    setting: allOpts.data?.setting,
    holder: allOpts.data?.holder,
    band: allOpts.data?.band,
    band_width: allOpts.data?.band_width,
    metal: allOpts.data?.metal,
    // Karat has no DB master table — synthesize defaults so admin toggles
    // (enable/disable individual karat options) persist via buildStepOptions.
    karat: KARAT_DEFAULT_OPTIONS.map((v, i) => ({
      id: `karat-${v}`, option_value: v, name: v, price: 0, display_order: i, image_url: null,
    })),
    personalization: allOpts.data?.personalization,
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

  // Load existing config — wait for master options to resolve so dedup works
  useEffect(() => {
    if (!clientId || !allMasterLoaded) return;
    const loadExisting = async () => {
      const { data } = await supabase.from('client_ring_form_config').select('*').eq('client_id', clientId).maybeSingle();
      if (data) {
        setSubmissionMode((data.submission_mode as 'deposit' | 'contact') || 'contact');
        setDepositAmount(data.deposit_amount ? String(data.deposit_amount) : '');
        setThankYouContact(resolveThankYouContact(data.thank_you_contact));
        if (data.enabled_steps) setEnabledSteps(prev => ({ ...prev, ...(data.enabled_steps as Record<string, boolean>) }));
        if (data.budget_options) setSelectedBudgets(Object.fromEntries((data.budget_options as string[]).map(b => [b, true])));
        if ((data as any).timeline_options) setSelectedTimelines(Object.fromEntries(((data as any).timeline_options as string[]).map(t => [t, true])));
        if (data.step_options) {
          const so = data.step_options as unknown as Record<string, RingFormStepOption[]>;
          const customs: Record<string, RingFormStepOption[]> = {};
          // Reconstruct which master options were switched OFF. The saved
          // step_options list only holds the ENABLED options, so any master option
          // (e.g. a metal like Silver, or a karat like 24K) whose value is absent
          // from that list was disabled by the client. Without rebuilding this the
          // per-option toggles would reset to "all on" every time the configurator
          // reopened, and a subsequent save would silently bring the hidden options
          // back onto the public form.
          const disabledRebuilt: Record<string, Set<string>> = {};
          Object.entries(so).forEach(([stepKey, opts]) => {
            const masterOpts = masterOptionsMap[stepKey];
            const masterValues = new Set(masterOpts?.map((o: any) => o.option_value) || []);
            customs[stepKey] = opts.filter(o => !masterValues.has(o.value));
            if (masterOpts && masterOpts.length > 0) {
              const enabledValues = new Set(opts.map(o => o.value));
              const off = new Set<string>();
              masterOpts.forEach((o: any) => { if (!enabledValues.has(o.option_value)) off.add(o.option_value); });
              if (off.size > 0) disabledRebuilt[stepKey] = off;
            }
          });
          setCustomOptions(customs);
          setDisabledOptions(disabledRebuilt);
        }
        if ((data as any).step_labels) setStepLabels((data as any).step_labels);
        if ((data as any).step_order) {
          const saved: string[] = (data as any).step_order;
          const allKeys = ALL_STEPS.map(s => s.key);
          const filtered = saved.filter(k => allKeys.includes(k) || k.startsWith('custom_'));
          const missing = allKeys.filter(k => !filtered.includes(k));
          setStepOrder([...filtered, ...missing]);
        }
        if ((data as any).ai_image_enabled != null) setAiImageEnabled((data as any).ai_image_enabled);
        setAiImageDelivery(resolveAiImageDelivery((data as any).ai_image_delivery));
        if ((data as any).step_groups) setStepGroups((data as any).step_groups);
        if ((data as any).option_image_overrides && typeof (data as any).option_image_overrides === 'object') {
          setOptionImageOverrides((data as any).option_image_overrides as OptionImageOverrides);
        }
      }

      // Load custom questions
      const { data: qData } = await supabase.from('client_ring_form_questions').select('*').eq('client_id', clientId).order('display_order', { ascending: true });
      if (qData && qData.length > 0) {
        setCustomQuestions(qData.map(q => ({
          id: q.id, question_text: q.question_text, question_key: q.question_key,
          question_type: q.question_type, options: Array.isArray(q.options) ? q.options as string[] : [],
          option_images: q.option_images ? q.option_images as Record<string, string> : undefined,
          is_enabled: q.is_enabled, is_required: q.is_required,
          has_text_followup: q.has_text_followup, has_file_followup: q.has_file_followup,
          display_order: q.display_order,
          subtitle: (q as any).subtitle || undefined,
        })));
      }
    };
    loadExisting();
  }, [clientId, allMasterLoaded]);

  const toggleStep = (key: string) => setEnabledSteps(prev => ({ ...prev, [key]: !prev[key] }));

  const toggleOption = (stepKey: string, optionValue: string) => {
    setDisabledOptions(prev => {
      const set = new Set(prev[stepKey] || []);
      if (set.has(optionValue)) set.delete(optionValue); else set.add(optionValue);
      return { ...prev, [stepKey]: set };
    });
  };

  const handleImageUpload = async (stepKey: string, file: File): Promise<string | null> => {
    const ext = file.name.split('.').pop();
    const path = `ring-form-options/${clientId}/${stepKey}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('ring-assets').upload(path, file);
    if (error) { toast.error('Failed to upload image'); return null; }
    const { data: urlData } = supabase.storage.from('ring-assets').getPublicUrl(path);
    toast.success('Image uploaded!');
    return urlData.publicUrl;
  };

  const buildStepOptions = (): Record<string, RingFormStepOption[]> => {
    const result: Record<string, RingFormStepOption[]> = {};
    RING_STEPS.forEach(step => {
      if (!enabledSteps[step.key]) return;
      const master = masterOptionsMap[step.key] || [];
      const disabled = disabledOptions[step.key] || new Set();
      const enabledMaster: RingFormStepOption[] = master
        .filter((o: any) => !disabled.has(o.option_value))
        .map((o: any) => ({ value: o.option_value, label: o.name, price: o.price }));
      const custom = customOptions[step.key] || [];
      const seen = new Set<string>();
      result[step.key] = [...enabledMaster, ...custom].filter(o => {
        if (seen.has(o.value)) return false;
        seen.add(o.value);
        return true;
      });
    });
    return result;
  };

  const handleSave = async () => {
    if (!clientId) return;
    if (role === 'staff' && !canEdit(staffInfo?.permissions?.custom_x_access)) {
      toast.error('View only — you do not have permission to save changes.');
      return;
    }
    const thankYouError = validateThankYouContact(thankYouContact);
    if (thankYouError) {
      toast.error(thankYouError);
      return;
    }
    setIsSaving(true);
    try {
      const stepOpts = buildStepOptions();
      const { error } = await supabase.from('client_ring_form_config').upsert({
        client_id: clientId, onboarding_completed: true, submission_mode: submissionMode,
        deposit_amount: submissionMode === 'deposit' ? (parseFloat(depositAmount) || 0) : null,
        thank_you_contact: serializeThankYouContact(thankYouContact),
        enabled_steps: enabledSteps as unknown as Record<string, unknown>,
        step_options: stepOpts as unknown as Record<string, unknown>,
        budget_options: (() => { const arr = Object.entries(selectedBudgets).filter(([, v]) => v).map(([k]) => k); return arr.length > 0 ? arr : null; })(),
        timeline_options: Object.entries(selectedTimelines).filter(([, v]) => v).map(([k]) => k),
        required_contact_fields: requiredContactFields,
        step_labels: Object.keys(stepLabels).length > 0 ? stepLabels : null,
        step_order: stepOrder,
        ai_image_enabled: aiImageEnabled,
        ai_image_delivery: aiImageDelivery,
        step_groups: stepGroups,
        option_image_overrides: optionImageOverrides,
      } as any, { onConflict: 'client_id' });

      if (error) throw error;

      await supabase.from('client_ring_form_questions').delete().eq('client_id', clientId);
      if (customQuestions.length > 0) {
        const { error: qError } = await supabase.from('client_ring_form_questions').insert(
          customQuestions.map((q, i) => ({
            client_id: clientId, question_text: q.question_text, question_key: q.question_key,
            question_type: q.question_type, options: q.options.length > 0 ? q.options : null,
            option_images: q.option_images || null,
            is_enabled: q.is_enabled, is_required: q.is_required,
            has_text_followup: q.has_text_followup, has_file_followup: q.has_file_followup,
            display_order: i,
            subtitle: q.subtitle || null,
          }))
        );
        if (qError) throw qError;
      }

      // Drop the cached Ring Builder config + option lists so the Preview tab (and
      // the public form) reflect this save immediately. Without this the dashboard
      // keeps serving the stale React-Query cache for up to staleTime, so options
      // just switched off here still appear "on" on the widget until a hard reload.
      queryClient.invalidateQueries({ queryKey: ['client-ring-form-config'] });
      queryClient.invalidateQueries({ queryKey: ['all-diamond-form-options'] });
      queryClient.invalidateQueries({ queryKey: ['client-ring-form-questions'] });

      toast.success('Ring Builder configured successfully!');
      setShowSuccessDialog(true);
    } catch (err: any) {
      console.error('Error saving ring form config:', err);
      toast.error(err.message || 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  // Staff guard: Custom X access — disabled hides this page entirely
  if (role === 'staff' && !canView(staffInfo?.permissions?.custom_x_access)) {
    return <AccessDenied feature="Ring Builder" />;
  }

  const isReadOnly = role === 'staff' && !canEdit(staffInfo?.permissions?.custom_x_access);

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-card/50">
        <Button variant="ghost" size="sm" onClick={() => navigate(isImpersonating ? '/admin/view-as/diamonds-form?tab=ring-builder' : '/dashboard/diamonds-form?tab=ring-builder')} className="gap-1">
          <ChevronLeft className="w-4 h-4" /> Back to Forms
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground">Ring Builder Configuration</h1>
        </div>
      </div>

      {/* Main 60/40 layout */}
      <div className="flex-1 overflow-hidden">
        <RingFormConfigurator
          clientId={clientId}
          submissionMode={submissionMode}
          depositAmount={depositAmount}
          onSubmissionModeChange={setSubmissionMode}
          onDepositAmountChange={setDepositAmount}
          thankYouContact={thankYouContact}
          onThankYouContactChange={setThankYouContact}
          enabledSteps={enabledSteps}
          onToggleStep={toggleStep}
          masterOptionsMap={masterOptionsMap}
          disabledOptions={disabledOptions}
          onToggleOption={toggleOption}
          customOptions={customOptions}
          onAddCustomOption={(stepKey, opt) => setCustomOptions(prev => ({ ...prev, [stepKey]: [...(prev[stepKey] || []), opt] }))}
          onRemoveCustomOption={(stepKey, i) => setCustomOptions(prev => ({ ...prev, [stepKey]: (prev[stepKey] || []).filter((_, idx) => idx !== i) }))}
          onImageUpload={handleImageUpload}
          stepLabels={stepLabels}
          onStepLabelChange={(key, field, value) => setStepLabels(prev => ({ ...prev, [key]: { ...prev[key], [field]: value || undefined } }))}
          stepOrder={stepOrder}
          onOrderChange={setStepOrder}
          selectedBudgets={selectedBudgets}
          onToggleBudget={(v) => setSelectedBudgets(prev => ({ ...prev, [v]: !prev[v] }))}
          onAddBudget={(v) => setSelectedBudgets(prev => v in prev ? prev : ({ ...prev, [v]: true }))}
          onRemoveBudget={(v) => setSelectedBudgets(prev => { const next = { ...prev }; delete next[v]; return next; })}
          onReorderBudgets={(order) => setSelectedBudgets(prev => Object.fromEntries(order.map(k => [k, prev[k]])))}
          selectedTimelines={selectedTimelines}
          onToggleTimeline={(v) => setSelectedTimelines(prev => ({ ...prev, [v]: !prev[v] }))}
          onAddTimeline={(v) => setSelectedTimelines(prev => v in prev ? prev : ({ ...prev, [v]: true }))}
          onRemoveTimeline={(v) => setSelectedTimelines(prev => { const next = { ...prev }; delete next[v]; return next; })}
          onReorderTimelines={(order) => setSelectedTimelines(prev => Object.fromEntries(order.map(k => [k, prev[k]])))}
          requiredContactFields={requiredContactFields}
          onRequiredContactFieldsChange={setRequiredContactFields}
          customQuestions={customQuestions}
          onCustomQuestionsChange={setCustomQuestions}
          aiImageEnabled={aiImageEnabled}
          onAiImageEnabledChange={setAiImageEnabled}
          aiImageDelivery={aiImageDelivery}
          onAiImageDeliveryChange={setAiImageDelivery}
          stepGroups={stepGroups}
          onStepGroupsChange={setStepGroups}
          optionImageOverrides={optionImageOverrides}
          onOptionImageOverridesChange={setOptionImageOverrides}

          activeKey={activeKey}
          onActiveKeyChange={setActiveKey}
          onSave={handleSave}
          isSaving={isSaving}
        />
      </div>

      <AlertDialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>🎉 Ring Builder Configured!</AlertDialogTitle>
            <AlertDialogDescription>
              Your Ring Builder has been successfully configured. Go to the Preview tab to see your widget.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => { navigate(isImpersonating ? '/admin/view-as/diamonds-form?tab=ring-builder' : '/dashboard/diamonds-form?tab=ring-builder'); }}>
              Go to Preview
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
