import { useMemo } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { ConfiguratorPanel } from './ConfiguratorPanel';
import { FlowPreview, type FlowQuestion, type FlowQuestionGroup } from './FlowPreview';
import type { DiamondOption } from '@/hooks/useDiamondFormOptions';
import type { RingFormStepOption } from '@/hooks/useClientRingFormConfig';
import type { CustomQuestion } from './QuestionEditor';
import type { OptionImageOverrides } from '@/lib/option-image-overrides';
import type { ThankYouContact } from '@/lib/thank-you-contact';
import type { AiImageDelivery } from '@/lib/ai-image-delivery';

import { KARAT_DEFAULT_OPTIONS } from '@/components/ring-builder-wizard/ring-builder-constants';


// Step definitions
export const RING_STEPS = [
  { key: 'nature', label: 'Diamond Nature', table: 'diamond_nature_options' as const, hasOptions: true },
  { key: 'shape', label: 'Diamond Shape', table: 'diamond_shape_options' as const, hasOptions: true },
  { key: 'size', label: 'Diamond Size', table: 'diamond_size_options' as const, hasOptions: true },
  { key: 'quality', label: 'Diamond Quality', table: 'diamond_quality_options' as const, hasOptions: true },
  { key: 'setting', label: 'Ring Setting', table: 'ring_setting_options' as const, hasOptions: true },
  { key: 'holder', label: 'Diamond Holder', table: 'diamond_holder_options' as const, hasOptions: true },
  { key: 'band', label: 'Band Type', table: 'band_type_options' as const, hasOptions: true },
  { key: 'band_width', label: 'Band Width', table: 'band_width_options' as const, hasOptions: true },
  { key: 'metal', label: 'Ring Metal', table: 'ring_metal_options' as const, hasOptions: true },
  { key: 'karat', label: 'Ring Karat', hasOptions: true },
  { key: 'personalization', label: 'Personalization', table: 'personalization_options' as const, hasOptions: true },
];

export const NON_OPTION_STEPS = [
  { key: 'engraving', label: 'Personalized Inscription', hasOptions: false },
  { key: 'description', label: 'Describe Your Vision', hasOptions: false },
  { key: 'inspiration', label: 'Upload Inspiration', hasOptions: false },
  { key: 'timeline', label: 'Timeline', hasOptions: false },
  { key: 'budget', label: 'Estimated Budget', hasOptions: false },
];

export const ALL_STEPS = [...RING_STEPS, ...NON_OPTION_STEPS];

export const DEFAULT_BUDGET_OPTIONS = [
  '$2,000 - $5,000',
  '$5,001 - $10,000',
  '$10,001 - $20,000',
  '$20,001 - $40,000',
  '$40,000+',
];

interface RingFormConfiguratorProps {
  clientId?: string | null;
  submissionMode: 'deposit' | 'contact';
  depositAmount: string;
  onSubmissionModeChange: (mode: 'deposit' | 'contact') => void;
  onDepositAmountChange: (val: string) => void;
  // Thank-you screen contact button
  thankYouContact: ThankYouContact;
  onThankYouContactChange: (next: ThankYouContact) => void;
  // Steps
  enabledSteps: Record<string, boolean>;
  onToggleStep: (key: string) => void;
  masterOptionsMap: Record<string, DiamondOption[] | undefined>;
  disabledOptions: Record<string, Set<string>>;
  onToggleOption: (stepKey: string, value: string) => void;
  customOptions: Record<string, RingFormStepOption[]>;
  onAddCustomOption: (stepKey: string, opt: RingFormStepOption) => void;
  onRemoveCustomOption: (stepKey: string, index: number) => void;
  onImageUpload: (stepKey: string, file: File) => Promise<string | null>;
  stepLabels: Record<string, { title?: string; subtitle?: string; shortLabel?: string }>;
  onStepLabelChange: (key: string, field: 'title' | 'subtitle' | 'shortLabel', value: string) => void;
  stepOrder: string[];
  onOrderChange: (newOrder: string[]) => void;
  // Budget
  selectedBudgets: Record<string, boolean>;
  onToggleBudget: (value: string) => void;
  onAddBudget: (value: string) => void;
  onRemoveBudget: (value: string) => void;
  onReorderBudgets: (order: string[]) => void;
  // Timeline
  selectedTimelines: Record<string, boolean>;
  onToggleTimeline: (value: string) => void;
  onAddTimeline: (value: string) => void;
  onRemoveTimeline: (value: string) => void;
  onReorderTimelines: (order: string[]) => void;
  // Contact fields
  requiredContactFields: Record<string, boolean>;
  onRequiredContactFieldsChange: (fields: Record<string, boolean>) => void;
  // AI Image
  aiImageEnabled: boolean;
  onAiImageEnabledChange: (enabled: boolean) => void;
  // Where the customer receives the AI render (email or thank-you page)
  aiImageDelivery: AiImageDelivery;
  onAiImageDeliveryChange: (delivery: AiImageDelivery) => void;
  // Custom questions
  customQuestions: CustomQuestion[];
  onCustomQuestionsChange: (qs: CustomQuestion[]) => void;
  // Step grouping
  stepGroups: string[][] | null;
  onStepGroupsChange: (groups: string[][] | null) => void;
  // Option image overrides
  optionImageOverrides: OptionImageOverrides;
  onOptionImageOverridesChange: (next: OptionImageOverrides) => void;

  // Active state
  activeKey: string | null;
  onActiveKeyChange: (key: string | null) => void;
  // Save
  onSave: () => void;
  isSaving: boolean;
}

export function RingFormConfigurator(props: RingFormConfiguratorProps) {
  const isMobile = useIsMobile();
  const {
    enabledSteps, masterOptionsMap, disabledOptions, customOptions,
    stepOrder, customQuestions, stepGroups, onStepGroupsChange,
    activeKey, onActiveKeyChange,
  } = props;

  // Build ordered flow questions for the preview
  const flowQuestions: FlowQuestion[] = useMemo(() => {
    const result: FlowQuestion[] = [];

    // Build the combined ordered keys
    const orderedKeys = [...stepOrder];
    customQuestions.forEach((_, i) => {
      const cKey = `custom_${i}`;
      if (!orderedKeys.includes(cKey)) orderedKeys.push(cKey);
    });

    for (const key of orderedKeys) {
      if (key.startsWith('custom_')) {
        const idx = parseInt(key.split('_')[1]);
        const q = customQuestions[idx];
        if (!q || !q.is_enabled) continue;
        result.push({
          key,
          label: q.question_text,
          questionType: q.question_type,
          optionCount: q.options.length,
          type: 'custom',
        });
      } else {
        if (!enabledSteps[key]) continue;
        const stepDef = ALL_STEPS.find(s => s.key === key);
        if (!stepDef) continue;
        const masterOpts = key === 'karat'
          ? KARAT_DEFAULT_OPTIONS.map(v => ({ option_value: v } as any))
          : (masterOptionsMap[key] || []);
        const disabled = disabledOptions[key] || new Set();
        const customs = customOptions[key] || [];
        const activeCount = masterOpts.filter(o => !disabled.has(o.option_value)).length + customs.length;
        result.push({
          key,
          label: stepDef.label,
          questionType: 'hasOptions' in stepDef && (stepDef as any).hasOptions ? 'options' : 'info',
          optionCount: activeCount > 0 ? activeCount : undefined,
          type: 'default_step',
        });
      }
    }

    return result;
  }, [stepOrder, customQuestions, enabledSteps, masterOptionsMap, disabledOptions, customOptions]);

  // Build grouped flow questions for the preview
  const flowGroups: FlowQuestionGroup[] = useMemo(() => {
    if (!stepGroups || stepGroups.length === 0) {
      // No grouping — each question is its own group
      return flowQuestions.map(q => ({ questions: [q] }));
    }

    const groups: FlowQuestionGroup[] = [];
    const placed = new Set<string>();

    for (const group of stepGroups) {
      const questionsInGroup = group
        .map(key => flowQuestions.find(q => q.key === key))
        .filter((q): q is FlowQuestion => !!q);
      if (questionsInGroup.length > 0) {
        groups.push({ questions: questionsInGroup });
        questionsInGroup.forEach(q => placed.add(q.key));
      }
    }

    // Add any remaining questions not in any group
    for (const q of flowQuestions) {
      if (!placed.has(q.key)) {
        groups.push({ questions: [q] });
      }
    }

    return groups;
  }, [flowQuestions, stepGroups]);

  const handleFlowClick = (key: string) => {
    onActiveKeyChange(key);
  };

  const defaultSteps = ALL_STEPS.map(s => ({
    key: s.key,
    label: s.label,
    hasOptions: 'hasOptions' in s ? (s as any).hasOptions : false,
    table: 'table' in s ? (s as any).table : undefined,
  }));

  if (isMobile) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 overflow-hidden">
          <ConfiguratorPanel {...props} defaultSteps={defaultSteps} clientId={props.clientId} />
        </div>
        <div className="h-48 border-t border-border/50 overflow-hidden bg-muted/20">
          <FlowPreview groups={flowGroups} activeKey={activeKey} onQuestionClick={handleFlowClick} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Left: Configurator 60% */}
      <div className="w-[60%] border-r border-border/50 overflow-hidden">
        <ConfiguratorPanel {...props} defaultSteps={defaultSteps} clientId={props.clientId} />
      </div>
      {/* Right: Flow Preview 40% */}
      <div className="w-[40%] overflow-hidden bg-muted/10">
        <FlowPreview groups={flowGroups} activeKey={activeKey} onQuestionClick={handleFlowClick} />
      </div>
    </div>
  );
}
