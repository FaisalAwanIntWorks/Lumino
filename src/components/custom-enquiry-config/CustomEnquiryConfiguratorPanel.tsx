import { useState, useRef, useEffect } from 'react';
import { ThankYouContactEditor } from '@/components/form-wizard/ThankYouContactEditor';
import { AiImageDeliveryEditor } from '@/components/form-wizard/AiImageDeliveryEditor';
import { DEFAULT_AI_IMAGE_DELIVERY, type AiImageDelivery } from '@/lib/ai-image-delivery';
import type { ThankYouContact } from '@/lib/thank-you-contact';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronRight, ChevronDown, ChevronUp, GripVertical, Info, Link2, Unlink2 } from 'lucide-react';
import { AddQuestionForm, CustomQuestionEditor, type CustomQuestion } from '@/components/ring-form-config/QuestionEditor';
import { CustomEnquiryStepEditor } from './CustomEnquiryStepEditor';

interface StepDef { key: string; label: string; }

export interface CustomEnquiryConfiguratorPanelProps {
  clientId?: string | null;
  submissionMode: 'deposit' | 'contact';
  depositAmount: string;
  onSubmissionModeChange: (mode: 'deposit' | 'contact') => void;
  onDepositAmountChange: (val: string) => void;
  // Thank-you screen contact button
  thankYouContact: ThankYouContact;
  onThankYouContactChange: (next: ThankYouContact) => void;
  steps: StepDef[];
  enabledSteps: Record<string, boolean>;
  onToggleStep: (key: string) => void;
  stepOrder: string[];
  onOrderChange: (newOrder: string[]) => void;
  stepLabels: Record<string, { title?: string; subtitle?: string; shortLabel?: string }>;
  onStepLabelChange: (key: string, field: 'title' | 'subtitle' | 'shortLabel', value: string) => void;
  // Jewelry types
  selectedJewelryTypes: Record<string, boolean>;
  onToggleJewelryType: (key: string) => void;
  onAddJewelryType: (value: string) => void;
  onReorderJewelryTypes?: (order: string[]) => void;
  // Gold colors
  goldColors: { value: string; label: string; hex?: string }[];
  selectedGoldColors: Record<string, boolean>;
  onToggleGoldColor: (key: string) => void;
  onAddGoldColor: (value: string, label: string) => void;
  onRemoveGoldColor?: (key: string) => void;
  onReorderGoldColors?: (order: string[]) => void;
  selectedKarats: Record<string, boolean>;
  onToggleKarat: (key: string) => void;
  onAddKarat: (value: string) => void;
  onRemoveKarat?: (key: string) => void;
  onReorderKarats?: (order: string[]) => void;
  // Diamond quality
  selectedDiamondQualities: Record<string, boolean>;
  onToggleDiamondQuality: (key: string) => void;
  onAddDiamondQuality: (value: string) => void;
  onRemoveDiamondQuality?: (key: string) => void;
  onReorderDiamondQualities?: (order: string[]) => void;
  // Diamond setup
  selectedDiamondSetups: Record<string, boolean>;
  onToggleDiamondSetup: (key: string) => void;
  onAddDiamondSetup: (value: string) => void;
  onRemoveDiamondSetup?: (key: string) => void;
  onReorderDiamondSetups?: (order: string[]) => void;
  // Per-option customer-facing notes
  optionNotes?: Record<string, Record<string, string>>;
  onOptionNoteChange?: (section: string, optionValue: string, note: string) => void;
  // Budget
  selectedBudgets: Record<string, boolean>;
  onToggleBudget: (key: string) => void;
  onAddBudget: (value: string) => void;
  onReorderBudgets?: (order: string[]) => void;
  onRemoveBudget?: (key: string) => void;
  // Timeline
  selectedTimelines?: Record<string, boolean>;
  onToggleTimeline?: (key: string) => void;
  onAddTimeline?: (value: string) => void;
  onReorderTimelines?: (order: string[]) => void;
  onRemoveTimeline?: (key: string) => void;
  // Budget/Timeline sub-section toggles
  budgetSectionEnabled?: boolean;
  timelineSectionEnabled?: boolean;
  onToggleBudgetSection?: () => void;
  onToggleTimelineSection?: () => void;
  // Design Details sub-section toggles
  metalColorSectionEnabled?: boolean;
  karatSectionEnabled?: boolean;
  diamondQualitySectionEnabled?: boolean;
  diamondSetupSectionEnabled?: boolean;
  onToggleMetalColorSection?: () => void;
  onToggleKaratSection?: () => void;
  onToggleDiamondQualitySection?: () => void;
  onToggleDiamondSetupSection?: () => void;
  // Default questions
  defaultQuestions: { key: string; text: string; type: string }[];
  enabledQuestions: Record<string, boolean>;
  requiredQuestions: Record<string, boolean>;
  onToggleQuestion: (key: string, enabled: boolean) => void;
  onToggleRequired: (key: string, required: boolean) => void;
  // Contact fields
  requiredContactFields: Record<string, boolean>;
  onRequiredContactFieldsChange: (fields: Record<string, boolean>) => void;
  // Custom questions
  customQuestions: CustomQuestion[];
  onCustomQuestionsChange: (qs: CustomQuestion[]) => void;
  // Step grouping
  stepGroups: string[][] | null;
  onStepGroupsChange: (groups: string[][] | null) => void;
  // Active
  activeKey: string | null;
  onActiveKeyChange: (key: string | null) => void;
  // AI image
  aiImageEnabled?: boolean;
  onAiImageEnabledChange?: (enabled: boolean) => void;
  // Where the customer receives the AI render (email or thank-you page)
  aiImageDelivery?: AiImageDelivery;
  onAiImageDeliveryChange?: (delivery: AiImageDelivery) => void;
  // Option image overrides
  optionImageOverrides?: import('@/lib/option-image-overrides').OptionImageOverrides | null;
  onOptionImageOverridesChange?: (next: import('@/lib/option-image-overrides').OptionImageOverrides) => void;
  // Save
  onSave: () => void;
  isSaving: boolean;
}

function SortableItem({ id, children }: { id: string; children: (props: { dragHandleProps: any }) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined, opacity: isDragging ? 0.85 : 1 };
  return <div ref={setNodeRef} style={style}>{children({ dragHandleProps: { ...attributes, ...listeners } })}</div>;
}

export function CustomEnquiryConfiguratorPanel(props: CustomEnquiryConfiguratorPanelProps) {
  const {
    clientId,
    submissionMode, depositAmount, onSubmissionModeChange, onDepositAmountChange,
    thankYouContact, onThankYouContactChange,
    steps, enabledSteps, onToggleStep, stepOrder, onOrderChange,
    stepLabels, onStepLabelChange,
    customQuestions, onCustomQuestionsChange,
    stepGroups, onStepGroupsChange,
    activeKey, onActiveKeyChange,
    requiredContactFields, onRequiredContactFieldsChange,
    onSave, isSaving,
  } = props;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const activeRef = useRef<HTMLDivElement>(null);
  useEffect(() => { activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [activeKey]);

  // Stable per-question key used for ordering (matches widget's step key)
  const customKeyOf = (q: CustomQuestion) => `custom_q_${q.question_key}`;
  const findCustomByKey = (key: string): { q: CustomQuestion; index: number } | null => {
    if (!key.startsWith('custom_q_')) {
      // Legacy positional key `custom_${i}` — translate on the fly
      if (key.startsWith('custom_')) {
        const i = parseInt(key.split('_')[1]);
        const q = customQuestions[i];
        return q ? { q, index: i } : null;
      }
      return null;
    }
    const stableKey = key.slice('custom_q_'.length);
    const index = customQuestions.findIndex(q => q.question_key === stableKey);
    if (index === -1) return null;
    return { q: customQuestions[index], index };
  };

  // Compose the ordered key list: translate any legacy `custom_${i}` entries
  // in stepOrder to stable `custom_q_${question_key}` and append any custom
  // questions that aren't yet in stepOrder to the end.
  const translatedOrder: string[] = [];
  const seenCustomKeys = new Set<string>();
  for (const k of stepOrder) {
    if (k.startsWith('custom_q_')) {
      translatedOrder.push(k);
      seenCustomKeys.add(k);
    } else if (k.startsWith('custom_')) {
      const found = findCustomByKey(k);
      if (found) {
        const stable = customKeyOf(found.q);
        translatedOrder.push(stable);
        seenCustomKeys.add(stable);
      }
    } else {
      translatedOrder.push(k);
    }
  }
  customQuestions.forEach(q => {
    const stable = customKeyOf(q);
    if (!seenCustomKeys.has(stable)) translatedOrder.push(stable);
  });
  const orderedKeys = translatedOrder;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedKeys.indexOf(String(active.id));
    const newIndex = orderedKeys.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(orderedKeys, oldIndex, newIndex);
    // Persist the full order (defaults + custom_q_*), interleaved as-dragged
    onOrderChange(reordered);
    // Keep customQuestions array order in sync with the new custom_q_* sequence
    const customKeysInOrder = reordered.filter(k => k.startsWith('custom_q_'));
    const newCQs = customKeysInOrder
      .map(k => customQuestions.find(q => customKeyOf(q) === k))
      .filter((q): q is CustomQuestion => !!q);
    if (newCQs.length === customQuestions.length) onCustomQuestionsChange(newCQs);
  };

  const handleAddQuestion = (q: CustomQuestion) => {
    const withOrder = { ...q, display_order: customQuestions.length };
    onCustomQuestionsChange([...customQuestions, withOrder]);
    const newKey = customKeyOf(withOrder);
    if (!stepOrder.includes(newKey)) onOrderChange([...stepOrder, newKey]);
    onActiveKeyChange(newKey);
  };

  // --- Step Grouping helpers ---
  const areLinked = (keyA: string, keyB: string): boolean => {
    if (!stepGroups) return false;
    return stepGroups.some(group => {
      const idxA = group.indexOf(keyA);
      const idxB = group.indexOf(keyB);
      return idxA !== -1 && idxB !== -1;
    });
  };

  const toggleLink = (keyA: string, keyB: string) => {
    const currentGroups = stepGroups ? [...stepGroups.map(g => [...g])] : [];
    if (areLinked(keyA, keyB)) {
      const newGroups: string[][] = [];
      for (const group of currentGroups) {
        const idxA = group.indexOf(keyA);
        const idxB = group.indexOf(keyB);
        if (idxA !== -1 && idxB !== -1) {
          const splitIdx = Math.max(idxA, idxB);
          const left = group.slice(0, splitIdx);
          const right = group.slice(splitIdx);
          if (left.length > 0) newGroups.push(left);
          if (right.length > 0) newGroups.push(right);
        } else {
          newGroups.push(group);
        }
      }
      onStepGroupsChange(newGroups.length > 0 ? newGroups : null);
    } else {
      let groupA = currentGroups.find(g => g.includes(keyA));
      let groupB = currentGroups.find(g => g.includes(keyB));
      const remaining = currentGroups.filter(g => g !== groupA && g !== groupB);
      const a = groupA || [keyA];
      const b = groupB || [keyB];
      const merged = [...a, ...b.filter(k => !a.includes(k))];
      remaining.push(merged);
      onStepGroupsChange(remaining);
    }
  };

  const getGroupInfo = (key: string): { isInGroup: boolean; isFirst: boolean; isLast: boolean } => {
    if (!stepGroups) return { isInGroup: false, isFirst: false, isLast: false };
    for (const group of stepGroups) {
      const idx = group.indexOf(key);
      if (idx !== -1 && group.length > 1) {
        return { isInGroup: true, isFirst: idx === 0, isLast: idx === group.length - 1 };
      }
    }
    return { isInGroup: false, isFirst: false, isLast: false };
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Submission Mode */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold text-foreground">Submission Mode</Label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onSubmissionModeChange('contact')}
              className={`p-3 rounded-lg border-2 text-left transition-all ${submissionMode === 'contact' ? 'border-primary bg-primary/5' : 'border-border/50 hover:border-primary/30'}`}>
              <span className="text-lg">📩</span>
              <p className="text-xs font-medium text-foreground mt-1">Contact Us</p>
            </button>
            <button type="button" onClick={() => onSubmissionModeChange('deposit')}
              className={`p-3 rounded-lg border-2 text-left transition-all ${submissionMode === 'deposit' ? 'border-primary bg-primary/5' : 'border-border/50 hover:border-primary/30'}`}>
              <span className="text-lg">💳</span>
              <p className="text-xs font-medium text-foreground mt-1">Deposit</p>
            </button>
          </div>
          {submissionMode === 'deposit' && (
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Amount ($)</Label>
              <Input type="number" min="1" value={depositAmount} onChange={e => onDepositAmountChange(e.target.value)}
                placeholder="500" className="h-8 text-sm max-w-[120px]" />
            </div>
          )}
        </div>

        <div className="border-t border-border/30" />

        {/* Thank-you screen contact button */}
        <ThankYouContactEditor value={thankYouContact} onChange={onThankYouContactChange} />

        <div className="border-t border-border/30" />

        {/* AI Image Generation Toggle */}
        {props.onAiImageEnabledChange && (
          <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-muted/30">
            <div>
              <Label className="text-sm font-semibold text-foreground">AI Design Preview</Label>
              <p className="text-xs text-muted-foreground">Generate an AI preview of the customer's design</p>
            </div>
            <Switch checked={props.aiImageEnabled ?? false} onCheckedChange={props.onAiImageEnabledChange} />
          </div>
        )}
        {props.aiImageEnabled && props.onAiImageDeliveryChange && (
          <AiImageDeliveryEditor
            value={props.aiImageDelivery ?? DEFAULT_AI_IMAGE_DELIVERY}
            onChange={props.onAiImageDeliveryChange}
          />
        )}

        <div className="border-t border-border/30" />

        {/* Info Banner */}
        <div className="flex gap-2.5 p-3 rounded-lg bg-muted/30 border border-border/30">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-xs text-foreground leading-relaxed">
              <strong>How it works:</strong> Toggle questions on/off and enable or disable individual options within each. Need something specific? Add your own custom questions below.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              For custom images, upload <strong>transparent PNGs at 300×300px</strong> to match the default style.
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Use the 🔗 <strong>chain icon</strong> between questions to combine them into a single step in the wizard.
            </p>
          </div>
        </div>

        <AddQuestionForm onAdd={handleAddQuestion} />
        <div className="border-t border-border/30" />

        {/* Steps List */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-foreground">Form Steps</Label>
          <p className="text-xs text-muted-foreground">Drag to reorder. Toggle to enable/disable. Click to expand.</p>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedKeys} strategy={verticalListSortingStrategy}>
              <div className="space-y-0">
                {orderedKeys.map((key, idx) => {
                  const groupInfo = getGroupInfo(key);
                  const nextKey = orderedKeys[idx + 1];
                  const isCurrentEnabled = key.startsWith('custom_')
                    ? !!findCustomByKey(key)?.q
                    : enabledSteps[key] !== false;
                  const isNextEnabled = nextKey
                    ? (nextKey.startsWith('custom_')
                        ? !!findCustomByKey(nextKey)?.q
                        : enabledSteps[nextKey] !== false)
                    : false;
                  const showLink = isCurrentEnabled && isNextEnabled && nextKey;
                  const linked = showLink ? areLinked(key, nextKey) : false;

                  if (key.startsWith('custom_')) {
                    const found = findCustomByKey(key);
                    if (!found) return null;
                    const { q, index: cidx } = found;
                    return (
                      <div key={key}>
                        <SortableItem id={key}>
                          {({ dragHandleProps }) => (
                            <div ref={activeKey === key ? activeRef : undefined}
                              className={groupInfo.isInGroup ? `border-l-2 border-primary/40 pl-2 ${groupInfo.isFirst ? 'pt-1 rounded-tl-lg' : ''} ${groupInfo.isLast ? 'pb-1 rounded-bl-lg' : ''}` : ''}
                            >
                              <CustomQuestionEditor clientId={clientId} question={q} isActive={activeKey === key}
                                shortLabel={stepLabels[`custom_q_${q.question_key}`]?.shortLabel}
                                onShortLabelChange={value => onStepLabelChange(`custom_q_${q.question_key}`, 'shortLabel', value.trimStart())}
                                onClick={() => onActiveKeyChange(activeKey === key ? null : key)}
                                onChange={updated => { const nq = [...customQuestions]; nq[cidx] = updated; onCustomQuestionsChange(nq); }}
                                onDelete={() => {
                                  onCustomQuestionsChange(customQuestions.filter((_, i) => i !== cidx));
                                  // Strip this custom question's key from persisted order
                                  const removedKey = customKeyOf(q);
                                  if (stepOrder.includes(removedKey)) onOrderChange(stepOrder.filter(k => k !== removedKey));
                                  if (activeKey === key) onActiveKeyChange(null);
                                }}
                                dragHandleProps={dragHandleProps} />
                            </div>
                          )}
                        </SortableItem>
                        {showLink && (
                          <div className="flex justify-center py-0.5">
                            <button type="button" onClick={() => toggleLink(key, nextKey)}
                              className={`p-1.5 rounded-md transition-all ${linked ? 'bg-primary/20 text-primary hover:bg-primary/30' : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30'}`}
                              title={linked ? 'Unlink: show as separate steps' : 'Link: show on same step'}>
                              {linked ? <Link2 className="w-4 h-4" /> : <Unlink2 className="w-4 h-4" />}
                            </button>
                          </div>
                        )}
                        {!showLink && <div className="h-2" />}
                      </div>
                    );
                  }

                  const stepDef = steps.find(s => s.key === key);
                  if (!stepDef) return null;
                  const isActive = activeKey === key;
                  const enabled = enabledSteps[key] !== false;

                  return (
                    <div key={key}>
                      <SortableItem id={key}>
                        {({ dragHandleProps }) => (
                          <div ref={isActive ? activeRef : undefined}
                            className={`rounded-xl border-2 transition-all ${isActive ? 'border-primary shadow-sm' : 'border-border/50'} ${groupInfo.isInGroup ? `border-l-2 border-l-primary/40 pl-2 ${groupInfo.isFirst ? 'pt-1 rounded-tl-lg' : ''} ${groupInfo.isLast ? 'pb-1 rounded-bl-lg' : ''}` : ''}`}>
                            <div className="flex items-center gap-2 p-3">
                              <button type="button" className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground" {...dragHandleProps}>
                                <GripVertical className="h-4 w-4" />
                              </button>
                              <button type="button" className="flex-1 text-left" onClick={() => onActiveKeyChange(isActive ? null : key)}>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-foreground">{stepDef.label}</span>
                                  {(stepLabels[key]?.title || stepLabels[key]?.subtitle) && <Badge variant="outline" className="text-[10px]">Edited</Badge>}
                                </div>
                              </button>
                              <Switch checked={enabled} onCheckedChange={() => onToggleStep(key)} />
                              <button type="button" onClick={() => onActiveKeyChange(isActive ? null : key)} className="text-muted-foreground hover:text-foreground">
                                {isActive ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                            </div>
                            {isActive && enabled && (
                              <div className="px-3 pb-3 space-y-3 border-t border-border/30 pt-3">
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Custom Title</Label>
                                    <Input value={stepLabels[key]?.title || ''} onChange={e => onStepLabelChange(key, 'title', e.target.value)}
                                      placeholder={stepDef.label} className="h-8 text-sm" maxLength={100} />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-muted-foreground">Custom Subtitle</Label>
                                    <Input value={stepLabels[key]?.subtitle || ''} onChange={e => onStepLabelChange(key, 'subtitle', e.target.value)}
                                      placeholder="Optional subtitle" className="h-8 text-sm" maxLength={200} />
                                  </div>
                                </div>
                                <CustomEnquiryStepEditor
                                  stepKey={key}
                                  selectedJewelryTypes={props.selectedJewelryTypes}
                                  onToggleJewelryType={props.onToggleJewelryType}
                                  onAddJewelryType={props.onAddJewelryType}
                                  onReorderJewelryTypes={props.onReorderJewelryTypes}
                                  goldColors={props.goldColors}
                                  selectedGoldColors={props.selectedGoldColors}
                                  onToggleGoldColor={props.onToggleGoldColor}
                                  onAddGoldColor={props.onAddGoldColor}
                                  onRemoveGoldColor={props.onRemoveGoldColor}
                                  onReorderGoldColors={props.onReorderGoldColors}
                                  selectedKarats={props.selectedKarats}
                                  onToggleKarat={props.onToggleKarat}
                                  onAddKarat={props.onAddKarat}
                                  onRemoveKarat={props.onRemoveKarat}
                                  onReorderKarats={props.onReorderKarats}
                                  selectedDiamondQualities={props.selectedDiamondQualities}
                                  onToggleDiamondQuality={props.onToggleDiamondQuality}
                                  onAddDiamondQuality={props.onAddDiamondQuality}
                                  onRemoveDiamondQuality={props.onRemoveDiamondQuality}
                                  onReorderDiamondQualities={props.onReorderDiamondQualities}
                                  selectedDiamondSetups={props.selectedDiamondSetups}
                                  onToggleDiamondSetup={props.onToggleDiamondSetup}
                                  onAddDiamondSetup={props.onAddDiamondSetup}
                                  onRemoveDiamondSetup={props.onRemoveDiamondSetup}
                                  onReorderDiamondSetups={props.onReorderDiamondSetups}
                                  optionNotes={props.optionNotes}
                                  onOptionNoteChange={props.onOptionNoteChange}
                                  selectedBudgets={props.selectedBudgets}
                                  onToggleBudget={props.onToggleBudget}
                                  onAddBudget={props.onAddBudget}
                                  onReorderBudgets={props.onReorderBudgets}
                                  onRemoveBudget={props.onRemoveBudget}
                                  selectedTimelines={props.selectedTimelines}
                                  onToggleTimeline={props.onToggleTimeline}
                                  onAddTimeline={props.onAddTimeline}
                                  onReorderTimelines={props.onReorderTimelines}
                                  onRemoveTimeline={props.onRemoveTimeline}
                                  defaultQuestions={props.defaultQuestions}
                                  enabledQuestions={props.enabledQuestions}
                                  requiredQuestions={props.requiredQuestions}
                                  onToggleQuestion={props.onToggleQuestion}
                                  onToggleRequired={props.onToggleRequired}
                                  budgetSectionEnabled={props.budgetSectionEnabled}
                                  timelineSectionEnabled={props.timelineSectionEnabled}
                                  onToggleBudgetSection={props.onToggleBudgetSection}
                                  onToggleTimelineSection={props.onToggleTimelineSection}
                                  metalColorSectionEnabled={props.metalColorSectionEnabled}
                                  karatSectionEnabled={props.karatSectionEnabled}
                                  diamondQualitySectionEnabled={props.diamondQualitySectionEnabled}
                                  diamondSetupSectionEnabled={props.diamondSetupSectionEnabled}
                                  onToggleMetalColorSection={props.onToggleMetalColorSection}
                                  onToggleKaratSection={props.onToggleKaratSection}
                                  onToggleDiamondQualitySection={props.onToggleDiamondQualitySection}
                                  onToggleDiamondSetupSection={props.onToggleDiamondSetupSection}
                                  clientId={clientId}
                                  optionImageOverrides={props.optionImageOverrides}
                                  onOptionImageOverridesChange={props.onOptionImageOverridesChange}
                                />

                              </div>
                            )}
                          </div>
                        )}
                      </SortableItem>
                      {showLink && (
                        <div className="flex justify-center py-0.5">
                          <button type="button" onClick={() => toggleLink(key, nextKey)}
                            className={`p-1.5 rounded-md transition-all ${linked ? 'bg-primary/20 text-primary hover:bg-primary/30' : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30'}`}
                            title={linked ? 'Unlink: show as separate steps' : 'Link: show on same step'}>
                            {linked ? <Link2 className="w-4 h-4" /> : <Unlink2 className="w-4 h-4" />}
                          </button>
                        </div>
                      )}
                      {!showLink && <div className="h-2" />}
                    </div>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>

        {/* Contact Fields */}
        <div className="space-y-3 border-t border-border/30 pt-4">
          <Label className="text-sm font-semibold text-foreground">Required Contact Fields</Label>
          {[
            { key: 'name', label: 'Full Name' },
            { key: 'email', label: 'Email' },
            { key: 'phone', label: 'Phone Number' },
          ].map(field => (
            <label key={field.key} className="flex items-center justify-between p-2 rounded-lg border border-border/30 bg-card/50 cursor-pointer">
              <span className="text-xs text-foreground">{field.label}</span>
              <Switch checked={requiredContactFields[field.key] ?? true}
                onCheckedChange={checked => onRequiredContactFieldsChange({ ...requiredContactFields, [field.key]: checked })}
                className="scale-75" />
            </label>
          ))}
        </div>
      </div>

      <div className="p-4 border-t border-border/50 bg-card/50">
        <Button onClick={onSave} disabled={isSaving} className="w-full gap-2">
          {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <>Save Configuration <ChevronRight className="w-4 h-4" /></>}
        </Button>
      </div>
    </div>
  );
}
