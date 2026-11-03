import { useState, useRef, useEffect } from 'react';
import { ThankYouContactEditor } from '@/components/form-wizard/ThankYouContactEditor';
import { AiImageDeliveryEditor } from '@/components/form-wizard/AiImageDeliveryEditor';
import type { AiImageDelivery } from '@/lib/ai-image-delivery';
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
import { Loader2, ChevronRight, ChevronDown, ChevronUp, GripVertical, Trash2, Info, Link2, Unlink2 } from 'lucide-react';
import { AddQuestionForm, CustomQuestionEditor, type CustomQuestion } from '@/components/ring-form-config/QuestionEditor';
import { GrillStepEditor } from './GrillStepEditor';
import type { GrillMetalConfig } from '@/hooks/useClientGrillConfig';
import type { GrillTypeOption } from '@/lib/grill-metal-images';
import type { GrillEnabledOptions } from '@/lib/grill-option-toggles';
import type { OptionImageOverrides } from '@/lib/option-image-overrides';


interface GrillStepDef {
  key: string;
  label: string;
}

export interface GrillConfiguratorPanelProps {
  clientId?: string | null;
  submissionMode: 'deposit' | 'contact';
  depositAmount: string;
  onSubmissionModeChange: (mode: 'deposit' | 'contact') => void;
  onDepositAmountChange: (val: string) => void;
  // Thank-you screen contact button
  thankYouContact: ThankYouContact;
  onThankYouContactChange: (next: ThankYouContact) => void;
  // AI toggle
  aiImageEnabled: boolean;
  onAiImageEnabledChange: (enabled: boolean) => void;
  // Where the customer receives the AI render (email or thank-you page)
  aiImageDelivery: AiImageDelivery;
  onAiImageDeliveryChange: (delivery: AiImageDelivery) => void;
  // Steps
  steps: GrillStepDef[];
  enabledSteps: Record<string, boolean>;
  onToggleStep: (key: string) => void;
  stepOrder: string[];
  onOrderChange: (newOrder: string[]) => void;
  stepLabels: Record<string, { title?: string; subtitle?: string; shortLabel?: string }>;
  onStepLabelChange: (key: string, field: 'title' | 'subtitle' | 'shortLabel', value: string) => void;
  // Metal
  metals: GrillMetalConfig[];
  selectedMetals: Record<string, boolean>;
  selectedPurities: Record<string, Record<string, boolean>>;
  onToggleMetal: (v: string) => void;
  onTogglePurity: (metal: string, purity: string) => void;
  onAddCustomMetal: (label: string) => void;
  onAddCustomPurity: (metal: string, label: string) => void;
  metalOrder: string[];
  onMetalOrderChange: (order: string[]) => void;
  // Grillz type options
  grillTypeOptions: GrillTypeOption[];
  onGrillTypeOptionsChange: (options: GrillTypeOption[]) => void;

  // Teeth
  allTeeth: string[];
  topTeeth: Record<string, boolean>;
  bottomTeeth: Record<string, boolean>;
  onToggleTopTooth: (v: string) => void;
  onToggleBottomTooth: (v: string) => void;
  onAddCustomTooth: (position: 'top' | 'bottom', value: string) => void;
  // Budget
  budgetOptions: string[];
  onBudgetOptionsChange: (opts: string[]) => void;
  // Contact fields
  requiredContactFields: Record<string, boolean>;
  onRequiredContactFieldsChange: (fields: Record<string, boolean>) => void;
  // Custom questions
  customQuestions: CustomQuestion[];
  onCustomQuestionsChange: (qs: CustomQuestion[]) => void;
  // Step grouping
  stepGroups: string[][] | null;
  onStepGroupsChange: (groups: string[][] | null) => void;
  // Option image overrides
  optionImageOverrides: OptionImageOverrides;
  onOptionImageOverridesChange: (next: OptionImageOverrides) => void;
  // Per-option enable flags (Fangs / Open Faced cards)
  enabledOptions: GrillEnabledOptions;
  onEnabledOptionsChange: (next: GrillEnabledOptions) => void;

  // Active
  activeKey: string | null;
  onActiveKeyChange: (key: string | null) => void;
  // Save
  onSave: () => void;
  isSaving: boolean;
}

function SortableItem({ id, children }: { id: string; children: (props: { dragHandleProps: any }) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined, opacity: isDragging ? 0.85 : 1 };
  return <div ref={setNodeRef} style={style}>{children({ dragHandleProps: { ...attributes, ...listeners } })}</div>;
}

export function GrillConfiguratorPanel(props: GrillConfiguratorPanelProps) {
  const {
    clientId,
    submissionMode, depositAmount, onSubmissionModeChange, onDepositAmountChange,
    thankYouContact, onThankYouContactChange,
    aiImageEnabled, onAiImageEnabledChange,
    aiImageDelivery, onAiImageDeliveryChange,
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

  // Stable per-question key used for ordering (matches the widget's step key)
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

  // Compose the ordered key list: translate legacy `custom_${i}` entries in
  // stepOrder to stable `custom_q_${question_key}` and append any custom
  // question not yet present.
  const orderedKeys: string[] = [];
  const seenCustomKeys = new Set<string>();
  for (const k of stepOrder) {
    if (k.startsWith('custom_q_')) {
      orderedKeys.push(k);
      seenCustomKeys.add(k);
    } else if (k.startsWith('custom_')) {
      const found = findCustomByKey(k);
      if (found) {
        const stable = customKeyOf(found.q);
        orderedKeys.push(stable);
        seenCustomKeys.add(stable);
      }
    } else {
      orderedKeys.push(k);
    }
  }
  customQuestions.forEach(q => {
    const stable = customKeyOf(q);
    if (!seenCustomKeys.has(stable)) orderedKeys.push(stable);
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedKeys.indexOf(String(active.id));
    const newIndex = orderedKeys.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(orderedKeys, oldIndex, newIndex);
    // Persist the full order (defaults + custom_q_*), interleaved as dragged
    onOrderChange(reordered);
    // Keep the customQuestions array order in sync with the new sequence
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

        {/* AI Design Preview Toggle */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-foreground">AI Design Preview</Label>
          <label className="flex items-center justify-between p-3 rounded-lg border border-border/30 bg-card/50 cursor-pointer">
            <div>
              <p className="text-xs font-medium text-foreground">Enable AI Image Generation</p>
              <p className="text-[10px] text-muted-foreground">Generate an AI preview of the customer's design</p>
            </div>
            <Switch checked={aiImageEnabled} onCheckedChange={onAiImageEnabledChange} className="scale-75" />
          </label>
          {aiImageEnabled && (
            <AiImageDeliveryEditor value={aiImageDelivery} onChange={onAiImageDeliveryChange} />
          )}
        </div>

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

        {/* Add Custom Question */}
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
                  const isCurrentEnabled = key.startsWith('custom_') ? !!findCustomByKey(key) : enabledSteps[key] !== false;
                  const isNextEnabled = nextKey ? (nextKey.startsWith('custom_') ? !!findCustomByKey(nextKey) : enabledSteps[nextKey] !== false) : false;
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
                              <CustomQuestionEditor
                                clientId={clientId}
                                question={q} isActive={activeKey === key}
                                shortLabel={stepLabels[`custom_q_${q.question_key}`]?.shortLabel}
                                onShortLabelChange={value => onStepLabelChange(`custom_q_${q.question_key}`, 'shortLabel', value.trimStart())}
                                onClick={() => onActiveKeyChange(activeKey === key ? null : key)}
                                onChange={updated => {
                                  const nq = [...customQuestions];
                                  nq[cidx] = updated;
                                  onCustomQuestionsChange(nq);
                                  const newKey = customKeyOf(updated);
                                  if (newKey !== key) {
                                    onOrderChange(orderedKeys.map(k => (k === key ? newKey : k)));
                                    if (activeKey === key) onActiveKeyChange(newKey);
                                  }
                                }}
                                onDelete={() => {
                                  onCustomQuestionsChange(customQuestions.filter((_, i) => i !== cidx));
                                  onOrderChange(orderedKeys.filter(k => k !== key));
                                  if (activeKey === key) onActiveKeyChange(null);
                                }}
                                dragHandleProps={dragHandleProps}
                              />
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
                                <GrillStepEditor
                                  stepKey={key}
                                  metals={props.metals}
                                  selectedMetals={props.selectedMetals}
                                  selectedPurities={props.selectedPurities}
                                  onToggleMetal={props.onToggleMetal}
                                  onTogglePurity={props.onTogglePurity}
                                  onAddCustomMetal={props.onAddCustomMetal}
                                  onAddCustomPurity={props.onAddCustomPurity}
                                  metalOrder={props.metalOrder}
                                  onMetalOrderChange={props.onMetalOrderChange}
                                  grillTypeOptions={props.grillTypeOptions}
                                  onGrillTypeOptionsChange={props.onGrillTypeOptionsChange}
                                  allTeeth={props.allTeeth}

                                  topTeeth={props.topTeeth}
                                  bottomTeeth={props.bottomTeeth}
                                  onToggleTopTooth={props.onToggleTopTooth}
                                  onToggleBottomTooth={props.onToggleBottomTooth}
                                  onAddCustomTooth={props.onAddCustomTooth}
                                  budgetOptions={props.budgetOptions}
                                  onBudgetOptionsChange={props.onBudgetOptionsChange}
                                  clientId={clientId}
                                  optionImageOverrides={props.optionImageOverrides}
                                  onOptionImageOverridesChange={props.onOptionImageOverridesChange}
                                  enabledOptions={props.enabledOptions}
                                  onEnabledOptionsChange={props.onEnabledOptionsChange}
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

      {/* Save */}
      <div className="p-4 border-t border-border/50 bg-card/50">
        <Button onClick={onSave} disabled={isSaving} className="w-full gap-2">
          {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <>Save Configuration <ChevronRight className="w-4 h-4" /></>}
        </Button>
      </div>
    </div>
  );
}
