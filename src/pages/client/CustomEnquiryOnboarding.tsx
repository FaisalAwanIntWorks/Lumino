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
import type { CustomQuestion } from '@/components/ring-form-config/QuestionEditor';
import { ENQUIRY_DEFAULT_BUDGET_OPTIONS, ENQUIRY_DEFAULT_TIMELINE_OPTIONS } from '@/lib/form-defaults';
import { CustomEnquiryFormConfigurator } from '@/components/custom-enquiry-config/CustomEnquiryFormConfigurator';
import { canView, canEdit } from '@/lib/staff-permissions';
import { AccessDenied } from '@/components/access/AccessDenied';
import type { OptionImageOverrides } from '@/lib/option-image-overrides';

const MASTER_JEWELRY_TYPES = ['Pendant', 'Chain', 'Grillz', 'Ring', 'Bracelet', 'Earrings', 'Watches', 'Glasses', 'Other'];
const MASTER_BUDGET_OPTIONS = [...ENQUIRY_DEFAULT_BUDGET_OPTIONS];
const MASTER_TIMELINE_OPTIONS = [...ENQUIRY_DEFAULT_TIMELINE_OPTIONS];
import { CANONICAL_METALS, normalizeGoldColors, normalizeMetal } from '@/lib/custom-enquiry-metals';
import { DEFAULT_AI_IMAGE_DELIVERY, resolveAiImageDelivery, type AiImageDelivery } from '@/lib/ai-image-delivery';
import { DEFAULT_THANK_YOU_CONTACT, resolveThankYouContact, serializeThankYouContact, validateThankYouContact, type ThankYouContact } from '@/lib/thank-you-contact';

const MASTER_GOLD_COLORS = [...CANONICAL_METALS];
const MASTER_KARAT_OPTIONS = ['10K', '14K', '18K', '22K', '24K'];
const MASTER_DIAMOND_QUALITIES = ['N/A', 'Si - I', 'Si Goods', 'Si+', 'VS Goods', 'VS+', 'VVS', 'Flawless'];
const MASTER_DIAMOND_SETUP_OPTIONS = ['No Diamonds', 'Minimal Diamonds', 'Partially Iced', 'Fully Iced'];

const DEFAULT_QUESTIONS = [
  { key: 'description', text: 'Describe your vision', type: 'text', has_text: true, has_file: false },
  { key: 'inspiration_upload', text: "Upload an image of what you're looking for", type: 'file', has_text: false, has_file: true },
];

const TOGGLEABLE_FORM_STEPS = [
  { key: 'jewelry-type', label: 'Jewelry Type' },
  { key: 'design', label: 'Design Details' },
  { key: 'budget', label: 'Budget & Timeline' },
  { key: 'questions', label: 'Custom Questions' },
  { key: 'engraving', label: 'Personalized Inscription' },
  { key: 'description', label: 'Describe Your Vision' },
  { key: 'inspiration', label: 'Upload Inspiration' },
];

export default function CustomEnquiryOnboarding() {
  const { user, role, staffInfo } = useAuth();
  const navigate = useNavigate();
  const { impersonatedClientId, isImpersonating } = useAdminImpersonation();
  const [isSaving, setIsSaving] = useState(false);
  const [clientId, setClientId] = useState<string | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // State
  const [submissionMode, setSubmissionMode] = useState<'deposit' | 'contact'>('contact');
  const [depositAmount, setDepositAmount] = useState('');
  const [thankYouContact, setThankYouContact] = useState<ThankYouContact>(DEFAULT_THANK_YOU_CONTACT);
  const [selectedJewelryTypes, setSelectedJewelryTypes] = useState<Record<string, boolean>>(Object.fromEntries(MASTER_JEWELRY_TYPES.map(t => [t, true])));
  const [selectedBudgets, setSelectedBudgets] = useState<Record<string, boolean>>(Object.fromEntries(MASTER_BUDGET_OPTIONS.map(b => [b, true])));
  const [selectedTimelines, setSelectedTimelines] = useState<Record<string, boolean>>(Object.fromEntries(MASTER_TIMELINE_OPTIONS.map(t => [t, true])));
  const [goldColors, setGoldColors] = useState<{ value: string; label: string; hex?: string }[]>([...MASTER_GOLD_COLORS]);
  const [selectedGoldColors, setSelectedGoldColors] = useState<Record<string, boolean>>(Object.fromEntries(MASTER_GOLD_COLORS.map(c => [c.value, true])));
  const [selectedKarats, setSelectedKarats] = useState<Record<string, boolean>>(Object.fromEntries(MASTER_KARAT_OPTIONS.map(k => [k, true])));
  const [selectedDiamondQualities, setSelectedDiamondQualities] = useState<Record<string, boolean>>(Object.fromEntries(MASTER_DIAMOND_QUALITIES.map(d => [d, true])));
  const [selectedDiamondSetups, setSelectedDiamondSetups] = useState<Record<string, boolean>>(Object.fromEntries(MASTER_DIAMOND_SETUP_OPTIONS.map(d => [d, true])));
  const [selectedBackOptions] = useState<Record<string, boolean>>({});
  const [enabledQuestions, setEnabledQuestions] = useState<Record<string, boolean>>(Object.fromEntries(DEFAULT_QUESTIONS.map(q => [q.key, true])));
  const [requiredQuestions, setRequiredQuestions] = useState<Record<string, boolean>>({});
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([]);
  const [requiredContactFields, setRequiredContactFields] = useState<Record<string, boolean>>({ name: true, email: true, phone: true });
  const [enabledFormSteps, setEnabledFormSteps] = useState<Record<string, boolean>>({
    ...Object.fromEntries(TOGGLEABLE_FORM_STEPS.map(s => [s.key, true])),
    budget_section: true,
    timeline_section: true,
    metal_color_section: true,
    karat_section: true,
    diamond_quality_section: true,
    diamond_setup_section: true,
  });
  const [stepLabels, setStepLabels] = useState<Record<string, { title?: string; subtitle?: string; shortLabel?: string }>>({});
  const [stepOrder, setStepOrder] = useState<string[]>(TOGGLEABLE_FORM_STEPS.map(s => s.key));
  const [aiImageEnabled, setAiImageEnabled] = useState(false);
  const [aiImageDelivery, setAiImageDelivery] = useState<AiImageDelivery>(DEFAULT_AI_IMAGE_DELIVERY);
  const [stepGroups, setStepGroups] = useState<string[][] | null>(null);
  const [optionImageOverrides, setOptionImageOverrides] = useState<OptionImageOverrides>({});
  const [optionNotes, setOptionNotes] = useState<Record<string, Record<string, string>>>({});

  const getSelectedItems = (map: Record<string, boolean>) => Object.entries(map).filter(([_, v]) => v).map(([k]) => k);

  // Reorder helper preserving enabled flags
  const reorderMap = (order: string[]) => (prev: Record<string, boolean>) => {
    const next: Record<string, boolean> = {};
    order.forEach(k => { if (k in prev) next[k] = prev[k]; });
    Object.keys(prev).forEach(k => { if (!(k in next)) next[k] = prev[k]; });
    return next;
  };
  const removeFromMap = (key: string) => (prev: Record<string, boolean>) => {
    const next = { ...prev };
    delete next[key];
    return next;
  };
  const setNote = (section: string, optionValue: string, note: string) =>
    setOptionNotes(prev => ({ ...prev, [section]: { ...(prev[section] || {}), [optionValue]: note } }));

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
      const { data } = await supabase.from('client_custom_enquiry_config').select('*').eq('client_id', clientId).maybeSingle();
      if (data) {
        setSubmissionMode((data.submission_mode as 'deposit' | 'contact') || 'contact');
        setDepositAmount(data.deposit_amount ? String(data.deposit_amount) : '');
        setThankYouContact(resolveThankYouContact(data.thank_you_contact));
        if (data.jewelry_types) {
          const jt: Record<string, boolean> = {};
          // Bug fix: respect saved order exactly — do NOT re-introduce master types the jeweler removed.
          data.jewelry_types.forEach(t => { jt[t] = true; });
          setSelectedJewelryTypes(jt);
        }
        if (data.budget_options) {
          const bo: Record<string, boolean> = {};
          data.budget_options.forEach(b => { bo[b] = true; });
          setSelectedBudgets(bo);
        }
        if ((data as any).timeline_options) {
          const to: Record<string, boolean> = {};
          (data as any).timeline_options.forEach((t: string) => { to[t] = true; });
          setSelectedTimelines(to);
        }
        const catalog = ((data as any).design_option_catalog || {}) as Record<string, string[]>;
        if ((data as any).design_option_notes) setOptionNotes((data as any).design_option_notes);

        // Build a selection map: catalog (if saved) defines full ordered list incl. disabled options
        const buildMap = (section: string, enabledList: string[] | null | undefined) => {
          const ordered = Array.isArray(catalog[section]) && catalog[section].length > 0
            ? catalog[section]
            : (enabledList || []);
          const enabled = new Set(enabledList || []);
          const map: Record<string, boolean> = {};
          ordered.forEach(k => { map[k] = enabled.has(k); });
          (enabledList || []).forEach(k => { if (!(k in map)) map[k] = true; });
          return map;
        };

        if (data.gold_colors || catalog.metal_color) {
          const rawGc = (data.gold_colors || []) as any as { value: string; label: string; hex?: string }[];
          const gc = normalizeGoldColors(rawGc);
          const known = new Map<string, { value: string; label: string; hex?: string }>();
          MASTER_GOLD_COLORS.forEach(c => known.set(c.value, c));
          const savedDefs = (catalog as any).metal_color_defs;
          if (Array.isArray(savedDefs)) {
            normalizeGoldColors(savedDefs).forEach(c => known.set(c.value, c));
          }
          gc.forEach(c => known.set(c.value, c));
          const sgc = buildMap('metal_color', gc.map(c => c.value));
          const orderedVals = Object.keys(sgc);
          setGoldColors(orderedVals.map(v => known.get(v) || { value: v, label: v }));
          setSelectedGoldColors(sgc);
        }
        if (data.karat_options || catalog.karat) setSelectedKarats(buildMap('karat', data.karat_options));
        if (data.diamond_qualities || catalog.diamond_quality) setSelectedDiamondQualities(buildMap('diamond_quality', data.diamond_qualities));
        if (data.diamond_setup_options || catalog.diamond_setup) setSelectedDiamondSetups(buildMap('diamond_setup', data.diamond_setup_options));
        // back_options no longer used
        if ((data as any).required_contact_fields) setRequiredContactFields((data as any).required_contact_fields);
        if ((data as any).enabled_steps) setEnabledFormSteps(prev => ({ ...prev, ...(data as any).enabled_steps }));
        if ((data as any).step_labels) setStepLabels((data as any).step_labels);
        if ((data as any).step_order) {
          const saved: string[] = (data as any).step_order;
          const allKeys = TOGGLEABLE_FORM_STEPS.map(s => s.key);
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
      // Load questions
      const { data: qData } = await supabase.from('client_custom_enquiry_questions').select('*').eq('client_id', clientId).order('display_order');
      if (qData) {
        const eq: Record<string, boolean> = {};
        const rq: Record<string, boolean> = {};
        const cqs: CustomQuestion[] = [];
        qData.forEach((q: any) => {
          if (q.is_default) {
            eq[q.question_key] = q.is_enabled;
            rq[q.question_key] = q.is_required;
          } else {
            cqs.push({
              id: q.id, question_text: q.question_text, question_key: q.question_key,
              question_type: q.question_type, options: Array.isArray(q.options) ? q.options : [],
              option_images: q.option_images ? q.option_images as Record<string, string> : undefined,
              is_enabled: q.is_enabled ?? true, is_required: q.is_required,
              has_text_followup: q.has_text_followup ?? false, has_file_followup: q.has_file_followup ?? false,
              display_order: q.display_order ?? 0,
              subtitle: (q as any).subtitle || undefined,
            });
          }
        });
        if (Object.keys(eq).length > 0) setEnabledQuestions(eq);
        if (Object.keys(rq).length > 0) setRequiredQuestions(rq);
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
      const selectedColors = goldColors.filter(c => selectedGoldColors[c.value]);

      // Drop notes for options that no longer exist so the JSONB doesn't grow stale
      const liveKeys: Record<string, string[]> = {
        metal_color: goldColors.map(c => c.value),
        karat: Object.keys(selectedKarats),
        diamond_quality: Object.keys(selectedDiamondQualities),
        diamond_setup: Object.keys(selectedDiamondSetups),
      };
      const prunedNotes: Record<string, Record<string, string>> = {};
      Object.entries(liveKeys).forEach(([section, keys]) => {
        const src = optionNotes[section] || {};
        const kept: Record<string, string> = {};
        keys.forEach(k => { if (src[k]?.trim()) kept[k] = src[k].trim(); });
        if (Object.keys(kept).length > 0) prunedNotes[section] = kept;
      });



      const { error: configError } = await supabase.from('client_custom_enquiry_config').upsert({
        client_id: clientId,
        jewelry_types: getSelectedItems(selectedJewelryTypes),
        budget_options: getSelectedItems(selectedBudgets),
        timeline_options: getSelectedItems(selectedTimelines),
        gold_colors: selectedColors as any,
        karat_options: getSelectedItems(selectedKarats),
        diamond_qualities: getSelectedItems(selectedDiamondQualities),
        diamond_setup_options: getSelectedItems(selectedDiamondSetups),
        onboarding_completed: true,
        submission_mode: submissionMode,
        deposit_amount: submissionMode === 'deposit' ? (parseFloat(depositAmount) || 0) : null,
        thank_you_contact: serializeThankYouContact(thankYouContact),
        required_contact_fields: requiredContactFields,
        enabled_steps: enabledFormSteps,
        step_labels: Object.keys(stepLabels).length > 0 ? stepLabels : null,
        step_order: stepOrder,
        ai_image_enabled: aiImageEnabled,
        ai_image_delivery: aiImageDelivery,
        step_groups: stepGroups,
        option_image_overrides: optionImageOverrides,
        design_option_catalog: {
          metal_color: goldColors.map(c => c.value),
          // full definitions so disabled/custom colors keep their label + hex across reloads
          metal_color_defs: goldColors,
          karat: Object.keys(selectedKarats),
          diamond_quality: Object.keys(selectedDiamondQualities),
          diamond_setup: Object.keys(selectedDiamondSetups),
        } as any,
        design_option_notes: prunedNotes as any,

      }, { onConflict: 'client_id' });
      if (configError) throw configError;

      // J2: Upsert defaults (never delete them) then delete+reinsert custom questions only
      const defaultQsToUpsert = DEFAULT_QUESTIONS.map((q, i) => ({
        client_id: clientId, question_text: q.text, question_key: q.key, question_type: q.type,
        is_default: true, is_enabled: enabledQuestions[q.key] ?? true, is_required: requiredQuestions[q.key] ?? false,
        display_order: i, has_text_followup: q.has_text, has_file_followup: q.has_file, options: null as any,
      }));
      if (defaultQsToUpsert.length > 0) {
        const { error: dqError } = await supabase.from('client_custom_enquiry_questions')
          .upsert(defaultQsToUpsert, { onConflict: 'client_id,question_key' });
        if (dqError) throw dqError;
      }
      await supabase.from('client_custom_enquiry_questions').delete().eq('client_id', clientId).eq('is_default', false);
      const customQsToInsert = customQuestions.map((q, i) => ({
        client_id: clientId, question_text: q.question_text, question_key: q.question_key || `custom_${i}`,
        question_type: q.question_type, is_default: false, is_enabled: q.is_enabled, is_required: q.is_required,
        display_order: DEFAULT_QUESTIONS.length + i, has_text_followup: q.has_text_followup, has_file_followup: q.has_file_followup,
        options: q.options.length > 0 ? q.options : null,
        option_images: q.option_images || null,
        subtitle: q.subtitle || null,
      }));
      if (customQsToInsert.length > 0) {
        const { error: qError } = await supabase.from('client_custom_enquiry_questions').insert(customQsToInsert);
        if (qError) throw qError;
      }

      toast.success('Custom Enquiry configured successfully!');
      setShowSuccessDialog(true);
    } catch (err: any) {
      console.error('Error saving custom enquiry config:', err);
      toast.error(err.message || 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  // Staff guard: Custom X access — disabled hides this page entirely
  if (role === 'staff' && !canView(staffInfo?.permissions?.custom_x_access)) {
    return <AccessDenied feature="Custom Enquiry" />;
  }

  const isReadOnly = role === 'staff' && !canEdit(staffInfo?.permissions?.custom_x_access);

  return (
    <div className="h-screen flex flex-col bg-background">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/50 bg-card/50">
        <Button variant="ghost" size="sm" onClick={() => navigate(isImpersonating ? '/admin/view-as/diamonds-form?tab=custom-enquiry' : '/dashboard/diamonds-form?tab=custom-enquiry')} className="gap-1">
          <ChevronLeft className="w-4 h-4" /> Back to Forms
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground">Custom Jewelry Inquiry Configuration</h1>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <CustomEnquiryFormConfigurator
          clientId={clientId}
          submissionMode={submissionMode}
          depositAmount={depositAmount}
          onSubmissionModeChange={setSubmissionMode}
          onDepositAmountChange={setDepositAmount}
          thankYouContact={thankYouContact}
          onThankYouContactChange={setThankYouContact}
          steps={TOGGLEABLE_FORM_STEPS}
          enabledSteps={enabledFormSteps}
          onToggleStep={key => setEnabledFormSteps(prev => ({ ...prev, [key]: !prev[key] }))}
          stepOrder={stepOrder}
          onOrderChange={setStepOrder}
          stepLabels={stepLabels}
          onStepLabelChange={(key, field, value) => setStepLabels(prev => ({ ...prev, [key]: { ...prev[key], [field]: value || undefined } }))}
          selectedJewelryTypes={selectedJewelryTypes}
          onToggleJewelryType={k => setSelectedJewelryTypes(prev => ({ ...prev, [k]: !prev[k] }))}
          onAddJewelryType={v => { if (!(v in selectedJewelryTypes)) setSelectedJewelryTypes(prev => ({ ...prev, [v]: true })); }}
          onReorderJewelryTypes={order => setSelectedJewelryTypes(prev => {
            const next: Record<string, boolean> = {};
            order.forEach(k => { next[k] = prev[k] ?? false; });
            Object.keys(prev).forEach(k => { if (!(k in next)) next[k] = prev[k]; });
            return next;
          })}
          goldColors={goldColors}
          selectedGoldColors={selectedGoldColors}
          onToggleGoldColor={k => setSelectedGoldColors(prev => ({ ...prev, [k]: !prev[k] }))}
          onAddGoldColor={(v, l) => {
            const normalized = normalizeMetal({ value: v, label: l || v });
            if (!goldColors.some(c => c.value === normalized.value)) setGoldColors(prev => [...prev, normalized]);
            setSelectedGoldColors(prev => ({ ...prev, [normalized.value]: true }));
          }}
          onRemoveGoldColor={k => {
            setGoldColors(prev => prev.filter(c => c.value !== k));
            setSelectedGoldColors(removeFromMap(k));
          }}
          onReorderGoldColors={order => {
            setGoldColors(prev => order.map(v => prev.find(c => c.value === v)!).filter(Boolean));
            setSelectedGoldColors(reorderMap(order));
          }}
          selectedKarats={selectedKarats}
          onToggleKarat={k => setSelectedKarats(prev => ({ ...prev, [k]: !prev[k] }))}
          onAddKarat={v => { if (!(v in selectedKarats)) setSelectedKarats(prev => ({ ...prev, [v]: true })); }}
          onRemoveKarat={k => setSelectedKarats(removeFromMap(k))}
          onReorderKarats={order => setSelectedKarats(reorderMap(order))}
          selectedDiamondQualities={selectedDiamondQualities}
          onToggleDiamondQuality={k => setSelectedDiamondQualities(prev => ({ ...prev, [k]: !prev[k] }))}
          onAddDiamondQuality={v => { if (!(v in selectedDiamondQualities)) setSelectedDiamondQualities(prev => ({ ...prev, [v]: true })); }}
          onRemoveDiamondQuality={k => setSelectedDiamondQualities(removeFromMap(k))}
          onReorderDiamondQualities={order => setSelectedDiamondQualities(reorderMap(order))}
          selectedDiamondSetups={selectedDiamondSetups}
          onToggleDiamondSetup={k => setSelectedDiamondSetups(prev => ({ ...prev, [k]: !prev[k] }))}
          onAddDiamondSetup={v => { if (!(v in selectedDiamondSetups)) setSelectedDiamondSetups(prev => ({ ...prev, [v]: true })); }}
          onRemoveDiamondSetup={k => setSelectedDiamondSetups(removeFromMap(k))}
          onReorderDiamondSetups={order => setSelectedDiamondSetups(reorderMap(order))}
          optionNotes={optionNotes}
          onOptionNoteChange={setNote}
          selectedBudgets={selectedBudgets}
          onToggleBudget={k => setSelectedBudgets(prev => ({ ...prev, [k]: !prev[k] }))}
          onAddBudget={v => { if (!(v in selectedBudgets)) setSelectedBudgets(prev => ({ ...prev, [v]: true })); }}
          onReorderBudgets={order => setSelectedBudgets(prev => {
            const next: Record<string, boolean> = {};
            order.forEach(k => { next[k] = prev[k] ?? true; });
            // preserve any keys not in incoming order (safety)
            Object.keys(prev).forEach(k => { if (!(k in next)) next[k] = prev[k]; });
            return next;
          })}
          onRemoveBudget={k => setSelectedBudgets(prev => {
            const next = { ...prev };
            delete next[k];
            return next;
          })}
          selectedTimelines={selectedTimelines}
          onToggleTimeline={k => setSelectedTimelines(prev => ({ ...prev, [k]: !prev[k] }))}
          onAddTimeline={v => { if (!(v in selectedTimelines)) setSelectedTimelines(prev => ({ ...prev, [v]: true })); }}
          onReorderTimelines={order => setSelectedTimelines(prev => {
            const next: Record<string, boolean> = {};
            order.forEach(k => { next[k] = prev[k] ?? true; });
            Object.keys(prev).forEach(k => { if (!(k in next)) next[k] = prev[k]; });
            return next;
          })}
          onRemoveTimeline={k => setSelectedTimelines(prev => {
            const next = { ...prev };
            delete next[k];
            return next;
          })}
          budgetSectionEnabled={enabledFormSteps.budget_section !== false}
          timelineSectionEnabled={enabledFormSteps.timeline_section !== false}
          onToggleBudgetSection={() => setEnabledFormSteps(prev => ({ ...prev, budget_section: prev.budget_section === false }))}
          onToggleTimelineSection={() => setEnabledFormSteps(prev => ({ ...prev, timeline_section: prev.timeline_section === false }))}
          metalColorSectionEnabled={enabledFormSteps.metal_color_section !== false}
          karatSectionEnabled={enabledFormSteps.karat_section !== false}
          diamondQualitySectionEnabled={enabledFormSteps.diamond_quality_section !== false}
          diamondSetupSectionEnabled={enabledFormSteps.diamond_setup_section !== false}
          onToggleMetalColorSection={() => setEnabledFormSteps(prev => ({ ...prev, metal_color_section: prev.metal_color_section === false }))}
          onToggleKaratSection={() => setEnabledFormSteps(prev => ({ ...prev, karat_section: prev.karat_section === false }))}
          onToggleDiamondQualitySection={() => setEnabledFormSteps(prev => ({ ...prev, diamond_quality_section: prev.diamond_quality_section === false }))}
          onToggleDiamondSetupSection={() => setEnabledFormSteps(prev => ({ ...prev, diamond_setup_section: prev.diamond_setup_section === false }))}
          defaultQuestions={DEFAULT_QUESTIONS}
          enabledQuestions={enabledQuestions}
          requiredQuestions={requiredQuestions}
          onToggleQuestion={(key, enabled) => {
            setEnabledQuestions(prev => ({ ...prev, [key]: enabled }));
            if (!enabled) setRequiredQuestions(prev => ({ ...prev, [key]: false }));
          }}
          onToggleRequired={(key, required) => setRequiredQuestions(prev => ({ ...prev, [key]: required }))}
          requiredContactFields={requiredContactFields}
          onRequiredContactFieldsChange={setRequiredContactFields}
          customQuestions={customQuestions}
          onCustomQuestionsChange={setCustomQuestions}
          stepGroups={stepGroups}
          onStepGroupsChange={setStepGroups}
          activeKey={activeKey}
          onActiveKeyChange={setActiveKey}
          aiImageEnabled={aiImageEnabled}
          onAiImageEnabledChange={setAiImageEnabled}
          aiImageDelivery={aiImageDelivery}
          onAiImageDeliveryChange={setAiImageDelivery}
          optionImageOverrides={optionImageOverrides}
          onOptionImageOverridesChange={setOptionImageOverrides}
          onSave={handleSave}
          isSaving={isSaving}
        />
      </div>

      <AlertDialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>🎉 Custom Enquiry Configured!</AlertDialogTitle>
            <AlertDialogDescription>
              Your Custom Enquiry form has been successfully configured. Go to the Preview tab to see your widget.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => { navigate(isImpersonating ? '/admin/view-as/diamonds-form?tab=custom-enquiry' : '/dashboard/diamonds-form?tab=custom-enquiry'); }}>Go to Preview</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
