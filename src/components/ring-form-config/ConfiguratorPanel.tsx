import { useState, useRef, useEffect } from 'react';
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
import { Loader2, ChevronRight, Plus, Trash2, Info, Link2, Unlink2 } from 'lucide-react';
import { DefaultStepEditor, CustomQuestionEditor, AddQuestionForm, type CustomQuestion } from './QuestionEditor';
import type { OptionImageOverrides } from '@/lib/option-image-overrides';
import { ThankYouContactEditor } from '@/components/form-wizard/ThankYouContactEditor';
import type { ThankYouContact } from '@/lib/thank-you-contact';
import { AiImageDeliveryEditor } from '@/components/form-wizard/AiImageDeliveryEditor';
import type { AiImageDelivery } from '@/lib/ai-image-delivery';

import type { DiamondOption } from '@/hooks/useDiamondFormOptions';
import type { RingFormStepOption } from '@/hooks/useClientRingFormConfig';
import { KARAT_DEFAULT_OPTIONS } from '@/components/ring-builder-wizard/ring-builder-constants';

const KARAT_MASTER_OPTIONS: DiamondOption[] = KARAT_DEFAULT_OPTIONS.map((v, i) => ({
  id: `karat-${v}`,
  option_value: v,
  name: v,
  price: 0,
  display_order: i,
  image_url: null,
}));

// --- Types ---

interface DefaultStepDef {
  key: string;
  label: string;
  hasOptions: boolean;
  table?: string;
}

interface ConfiguratorPanelProps {
  clientId?: string | null;
  submissionMode: 'deposit' | 'contact';
  depositAmount: string;
  onSubmissionModeChange: (mode: 'deposit' | 'contact') => void;
  onDepositAmountChange: (val: string) => void;
  // Thank-you screen contact button
  thankYouContact: ThankYouContact;
  onThankYouContactChange: (next: ThankYouContact) => void;
  // Steps
  defaultSteps: DefaultStepDef[];
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

  // Active editing
  activeKey: string | null;
  onActiveKeyChange: (key: string | null) => void;
  // Save
  onSave: () => void;
  isSaving: boolean;
}

// Sortable wrapper for both default and custom items
function SortableQuestionItem({ id, children }: { id: string; children: (props: { dragHandleProps: any }) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ dragHandleProps: { ...attributes, ...listeners } })}
    </div>
  );
}

export function ConfiguratorPanel(props: ConfiguratorPanelProps) {
  const {
    clientId,
    submissionMode, depositAmount, onSubmissionModeChange, onDepositAmountChange,
    thankYouContact, onThankYouContactChange,
    defaultSteps, enabledSteps, onToggleStep,
    masterOptionsMap, disabledOptions, onToggleOption,
    customOptions, onAddCustomOption, onRemoveCustomOption, onImageUpload,
    stepLabels, onStepLabelChange,
    stepOrder, onOrderChange,
    selectedBudgets, onToggleBudget, onAddBudget, onRemoveBudget, onReorderBudgets,
    selectedTimelines, onToggleTimeline, onAddTimeline, onRemoveTimeline, onReorderTimelines,
    requiredContactFields, onRequiredContactFieldsChange,
    aiImageEnabled, onAiImageEnabledChange,
    aiImageDelivery, onAiImageDeliveryChange,
    customQuestions, onCustomQuestionsChange,
    stepGroups, onStepGroupsChange,
    optionImageOverrides, onOptionImageOverridesChange,
    activeKey, onActiveKeyChange,

    onSave, isSaving,
  } = props;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const activeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeKey]);

  // Build the ordered list of all items (default steps + custom questions)
  // Custom questions are keyed as `custom_${index}`
  const orderedKeys = [...stepOrder];
  customQuestions.forEach((_, i) => {
    const cKey = `custom_${i}`;
    if (!orderedKeys.includes(cKey)) orderedKeys.push(cKey);
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = orderedKeys.indexOf(String(active.id));
    const newIndex = orderedKeys.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(orderedKeys, oldIndex, newIndex);
    // Split back: default step keys go to stepOrder, custom keys update question order
    const newStepOrder = reordered.filter(k => !k.startsWith('custom_'));
    onOrderChange(newStepOrder);
    // Reorder custom questions based on their relative order in reordered
    const customKeys = reordered.filter(k => k.startsWith('custom_'));
    const newCustomQuestions = customKeys.map(k => {
      const idx = parseInt(k.split('_')[1]);
      return customQuestions[idx];
    }).filter(Boolean);
    if (newCustomQuestions.length === customQuestions.length) {
      onCustomQuestionsChange(newCustomQuestions);
    }
  };

  const handleAddQuestion = (q: CustomQuestion) => {
    onCustomQuestionsChange([...customQuestions, { ...q, display_order: customQuestions.length }]);
    onActiveKeyChange(`custom_${customQuestions.length}`);
  };

  // --- Step Grouping helpers ---
  // Check if two consecutive keys are linked (in the same group)
  const areLinked = (keyA: string, keyB: string): boolean => {
    if (!stepGroups) return false;
    return stepGroups.some(group => {
      const idxA = group.indexOf(keyA);
      const idxB = group.indexOf(keyB);
      return idxA !== -1 && idxB !== -1;
    });
  };

  // Get only the enabled/visible keys in order
  const enabledOrderedKeys = orderedKeys.filter(key => {
    if (key.startsWith('custom_')) {
      const idx = parseInt(key.split('_')[1]);
      return !!customQuestions[idx];
    }
    return enabledSteps[key] !== false;
  });

  const toggleLink = (keyA: string, keyB: string) => {
    const currentGroups = stepGroups ? [...stepGroups.map(g => [...g])] : [];
    
    if (areLinked(keyA, keyB)) {
      // Unlink: split the group containing both
      const newGroups: string[][] = [];
      for (const group of currentGroups) {
        const idxA = group.indexOf(keyA);
        const idxB = group.indexOf(keyB);
        if (idxA !== -1 && idxB !== -1) {
          // Split at the boundary between keyA and keyB
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
      // Link: merge groups containing keyA and keyB
      let groupA = currentGroups.find(g => g.includes(keyA));
      let groupB = currentGroups.find(g => g.includes(keyB));

      // Remove both groups from the list
      const remaining = currentGroups.filter(g => g !== groupA && g !== groupB);

      // Create or extend groups
      const a = groupA || [keyA];
      const b = groupB || [keyB];
      const merged = [...a, ...b.filter(k => !a.includes(k))];
      
      remaining.push(merged);
      onStepGroupsChange(remaining);
    }
  };

  // Check if a key is the first in a group (for visual styling)
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
        {/* Submission Mode Toggle */}
        <div className="space-y-3">
          <Label className="text-sm font-semibold text-foreground">Submission Mode</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onSubmissionModeChange('contact')}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                submissionMode === 'contact'
                  ? 'border-primary bg-primary/5'
                  : 'border-border/50 hover:border-primary/30'
              }`}
            >
              <span className="text-lg">📩</span>
              <p className="text-xs font-medium text-foreground mt-1">Contact Us</p>
            </button>
            <button
              type="button"
              onClick={() => onSubmissionModeChange('deposit')}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                submissionMode === 'deposit'
                  ? 'border-primary bg-primary/5'
                  : 'border-border/50 hover:border-primary/30'
              }`}
            >
              <span className="text-lg">💳</span>
              <p className="text-xs font-medium text-foreground mt-1">Deposit</p>
            </button>
          </div>
          {submissionMode === 'deposit' && (
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground whitespace-nowrap">Amount ($)</Label>
              <Input
                type="number"
                min="1"
                value={depositAmount}
                onChange={e => onDepositAmountChange(e.target.value)}
                placeholder="500"
                className="h-8 text-sm max-w-[120px]"
              />
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Thank-you screen contact button */}
        <ThankYouContactEditor value={thankYouContact} onChange={onThankYouContactChange} />

        {/* Separator */}
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

        {/* Separator */}
        <div className="border-t border-border/30" />

        {/* Questions List (drag-and-drop) */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold text-foreground">Form Questions</Label>
          <p className="text-xs text-muted-foreground">Drag to reorder. Toggle to enable/disable. Click to expand and configure.</p>

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={orderedKeys} strategy={verticalListSortingStrategy}>
              <div className="space-y-0">
                {orderedKeys.map((key, idx) => {
                  const groupInfo = getGroupInfo(key);
                  // Find the next enabled key in the list for the link button
                  const nextKey = orderedKeys[idx + 1];
                  const isCurrentEnabled = key.startsWith('custom_') ? !!customQuestions[parseInt(key.split('_')[1])] : enabledSteps[key] !== false;
                  const isNextEnabled = nextKey ? (nextKey.startsWith('custom_') ? !!customQuestions[parseInt(nextKey.split('_')[1])] : enabledSteps[nextKey] !== false) : false;
                  const showLink = isCurrentEnabled && isNextEnabled && nextKey;
                  const linked = showLink ? areLinked(key, nextKey) : false;

                  if (key.startsWith('custom_')) {
                    const cidx = parseInt(key.split('_')[1]);
                    const q = customQuestions[cidx];
                    if (!q) return null;
                    return (
                      <div key={key}>
                        <SortableQuestionItem id={key}>
                          {({ dragHandleProps }) => (
                            <div ref={activeKey === key ? activeRef : undefined}
                              className={groupInfo.isInGroup ? `border-l-2 border-primary/40 pl-2 ${groupInfo.isFirst ? 'pt-1 rounded-tl-lg' : ''} ${groupInfo.isLast ? 'pb-1 rounded-bl-lg' : ''}` : ''}
                            >
                              <CustomQuestionEditor
                                clientId={clientId}
                                question={q}
                                shortLabel={stepLabels[`custom_q_${q.question_key}`]?.shortLabel}
                                onShortLabelChange={value => onStepLabelChange(`custom_q_${q.question_key}`, 'shortLabel', value.trimStart())}
                                isActive={activeKey === key}
                                onClick={() => onActiveKeyChange(activeKey === key ? null : key)}
                                onChange={updated => {
                                  const newQs = [...customQuestions];
                                  newQs[cidx] = updated;
                                  onCustomQuestionsChange(newQs);
                                }}
                                onDelete={() => {
                                  onCustomQuestionsChange(customQuestions.filter((_, i) => i !== cidx));
                                  if (activeKey === key) onActiveKeyChange(null);
                                }}
                                dragHandleProps={dragHandleProps}
                              />
                            </div>
                          )}
                        </SortableQuestionItem>
                        {showLink && (
                          <div className="flex justify-center py-0.5">
                            <button
                              type="button"
                              onClick={() => toggleLink(key, nextKey)}
                              className={`p-1.5 rounded-md transition-all ${
                                linked
                                  ? 'bg-primary/20 text-primary hover:bg-primary/30'
                                  : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30'
                              }`}
                              title={linked ? 'Unlink: show as separate steps' : 'Link: show on same step'}
                            >
                              {linked ? <Link2 className="w-4 h-4" /> : <Unlink2 className="w-4 h-4" />}
                            </button>
                          </div>
                        )}
                        {!showLink && <div className="h-2" />}
                      </div>
                    );
                  }

                  // Default step
                  const stepDef = defaultSteps.find(s => s.key === key);
                  if (!stepDef) return null;
                  return (
                    <div key={key}>
                      <SortableQuestionItem id={key}>
                        {({ dragHandleProps }) => (
                          <div ref={activeKey === key ? activeRef : undefined}
                            className={groupInfo.isInGroup ? `border-l-2 border-primary/40 pl-2 ${groupInfo.isFirst ? 'pt-1 rounded-tl-lg' : ''} ${groupInfo.isLast ? 'pb-1 rounded-bl-lg' : ''}` : ''}
                          >
                            <DefaultStepEditor
                              stepKey={key}
                              label={stepDef.label}
                              tableName={stepDef.table}
                              enabled={enabledSteps[key] !== false}
                              isActive={activeKey === key}
                              onToggle={() => onToggleStep(key)}
                              onClick={() => onActiveKeyChange(activeKey === key ? null : key)}
                              masterOptions={key === 'karat' ? KARAT_MASTER_OPTIONS : (stepDef.hasOptions ? masterOptionsMap[key] : undefined)}
                              disabledOptions={disabledOptions[key] || new Set()}
                              onToggleOption={(value) => onToggleOption(key, value)}
                              customOptions={customOptions[key] || []}
                              onAddCustomOption={(opt) => onAddCustomOption(key, opt)}
                              onRemoveCustomOption={(i) => onRemoveCustomOption(key, i)}
                              customTitle={stepLabels[key]?.title}
                              customSubtitle={stepLabels[key]?.subtitle}
                              onLabelChange={(field, value) => onStepLabelChange(key, field, value)}
                              onImageUpload={async (file) => onImageUpload(key, file)}
                              clientId={clientId}
                              optionImageOverrides={optionImageOverrides[key] || {}}
                              onOptionImageOverridesChange={(next) => {
                                const all = { ...optionImageOverrides };
                                if (Object.keys(next).length === 0) delete all[key]; else all[key] = next;
                                onOptionImageOverridesChange(all);
                              }}
                              dragHandleProps={dragHandleProps}
                              {...(key === 'budget' ? { selectedBudgets, onToggleBudget, onAddBudget, onRemoveBudget, onReorderBudgets } : {})}
                              {...(key === 'timeline' ? { selectedTimelines, onToggleTimeline, onAddTimeline, onRemoveTimeline, onReorderTimelines } : {})}

                            />
                          </div>
                        )}
                      </SortableQuestionItem>
                      {showLink && (
                        <div className="flex justify-center py-0.5">
                          <button
                            type="button"
                            onClick={() => toggleLink(key, nextKey)}
                            className={`p-1.5 rounded-md transition-all ${
                              linked
                                ? 'bg-primary/20 text-primary hover:bg-primary/30'
                                : 'text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted/30'
                            }`}
                            title={linked ? 'Unlink: show as separate steps' : 'Link: show on same step'}
                          >
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

        {/* AI Image Generation Toggle */}
        <div className="space-y-3 border-t border-border/30 pt-4">
          <label className="flex items-center justify-between p-3 rounded-lg border border-border/30 bg-card/50 cursor-pointer">
            <div>
              <p className="text-sm font-semibold text-foreground">AI Image Generation</p>
              <p className="text-xs text-muted-foreground">Generate an AI ring preview after submission</p>
            </div>
            <Switch
              checked={aiImageEnabled}
              onCheckedChange={onAiImageEnabledChange}
            />
          </label>
          {aiImageEnabled && (
            <AiImageDeliveryEditor value={aiImageDelivery} onChange={onAiImageDeliveryChange} />
          )}
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
              <Switch
                checked={requiredContactFields[field.key] ?? true}
                onCheckedChange={checked => onRequiredContactFieldsChange({ ...requiredContactFields, [field.key]: checked })}
                className="scale-75"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Save button */}
      <div className="p-4 border-t border-border/50 bg-card/50">
        <Button onClick={onSave} disabled={isSaving} className="w-full gap-2">
          {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : <>Save Configuration <ChevronRight className="w-4 h-4" /></>}
        </Button>
      </div>
    </div>
  );
}

