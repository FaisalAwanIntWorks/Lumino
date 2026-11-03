import { useState, useRef } from 'react';
import { ChevronDown, ChevronUp, Trash2, Plus, Image as ImageIcon, Check, GripVertical, Loader2, Info, ImageOff } from 'lucide-react';
import { uploadSingleFormImage } from '@/lib/form-image-upload';
import { getRingBuilderImageUrl } from '@/lib/diamond-form-cdn';
import { quoteV3StockImageForTable, usesV3StockImages } from '@/lib/quote-v3-assets';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { DiamondOption } from '@/hooks/useDiamondFormOptions';
import type { RingFormStepOption } from '@/hooks/useClientRingFormConfig';
import { OptionOverrideControl } from '@/components/form-wizard/OptionOverrideControl';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';



interface DefaultStepEditorProps {
  stepKey: string;
  label: string;
  tableName?: string;
  enabled: boolean;
  isActive: boolean;
  onToggle: () => void;
  onClick: () => void;
  masterOptions?: DiamondOption[];
  disabledOptions: Set<string>;
  onToggleOption: (value: string) => void;
  customOptions: RingFormStepOption[];
  onAddCustomOption: (opt: RingFormStepOption) => void;
  onRemoveCustomOption: (index: number) => void;
  customTitle?: string;
  customSubtitle?: string;
  onLabelChange: (field: 'title' | 'subtitle', value: string) => void;
  onImageUpload: (file: File) => Promise<string | null>;
  dragHandleProps?: any;
  selectedBudgets?: Record<string, boolean>;
  onToggleBudget?: (value: string) => void;
  onAddBudget?: (value: string) => void;
  onRemoveBudget?: (value: string) => void;
  onReorderBudgets?: (order: string[]) => void;
  selectedTimelines?: Record<string, boolean>;
  onToggleTimeline?: (value: string) => void;
  onAddTimeline?: (value: string) => void;
  onRemoveTimeline?: (value: string) => void;
  onReorderTimelines?: (order: string[]) => void;
  clientId?: string | null;
  optionImageOverrides?: Record<string, string>;
  onOptionImageOverridesChange?: (next: Record<string, string>) => void;
}


export function DefaultStepEditor({
  stepKey, label, tableName, enabled, isActive, onToggle, onClick,
  masterOptions = [], disabledOptions, onToggleOption,
  customOptions, onAddCustomOption, onRemoveCustomOption,
  customTitle, customSubtitle, onLabelChange, onImageUpload,
  dragHandleProps, selectedBudgets, onToggleBudget, onAddBudget, onRemoveBudget, onReorderBudgets,
  selectedTimelines, onToggleTimeline, onAddTimeline, onRemoveTimeline, onReorderTimelines,
  clientId, optionImageOverrides = {}, onOptionImageOverridesChange,
}: DefaultStepEditorProps) {

  const [newLabel, setNewLabel] = useState('');
  const [newImageUrl, setNewImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  const handleAdd = () => {
    if (!newLabel.trim()) return;
    const value = newLabel.trim().toLowerCase().replace(/\s+/g, '-');
    onAddCustomOption({ value, label: newLabel.trim(), image_url: newImageUrl || undefined });
    setNewLabel('');
    setNewImageUrl('');
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    const url = await onImageUpload(file);
    if (url) setNewImageUrl(url);
    setUploading(false);
  };

  return (
    <div className={`rounded-xl border-2 transition-all ${isActive ? 'border-primary shadow-sm' : 'border-border/50'}`}>
      <div className="flex items-center gap-2 p-3">
        {dragHandleProps && (
          <button type="button" className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground" {...dragHandleProps}>
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <button type="button" className="flex-1 text-left" onClick={onClick}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{label}</span>
            {(customTitle || customSubtitle) && (
              <Badge variant="outline" className="text-[10px]">Edited</Badge>
            )}
          </div>
        </button>
        <Switch checked={enabled} onCheckedChange={onToggle} />
        <button type="button" onClick={onClick} className="text-muted-foreground hover:text-foreground">
          {isActive ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {isActive && enabled && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/30 pt-3">
          {/* Custom labels */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Custom Title</Label>
              <Input
                value={customTitle || ''}
                onChange={e => onLabelChange('title', e.target.value)}
                placeholder={label}
                className="h-8 text-sm"
                maxLength={100}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Custom Subtitle</Label>
              <Input
                value={customSubtitle || ''}
                onChange={e => onLabelChange('subtitle', e.target.value)}
                placeholder="Optional subtitle"
                className="h-8 text-sm"
                maxLength={200}
              />
            </div>
          </div>

          {/* Master options toggles */}
          {masterOptions.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground font-medium">Options</Label>
              <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-border/30 p-2">
                {masterOptions.map(opt => {
                  const thumbUrl = tableName
                    ? (usesV3StockImages(clientId) ? quoteV3StockImageForTable(tableName, opt.option_value) : null) || getRingBuilderImageUrl(tableName, opt.option_value)
                    : '';
                  const overrideUrl = optionImageOverrides[opt.option_value];
                  return (
                    <div key={opt.option_value} className="flex items-center justify-between p-1.5 rounded hover:bg-muted/30">
                      <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                        {overrideUrl ? (
                          <img src={overrideUrl} alt="" className="w-6 h-6 object-contain rounded bg-muted/20 p-0.5 ring-1 ring-primary/40" />
                        ) : thumbUrl ? (
                          <img src={thumbUrl} alt="" className="w-6 h-6 object-contain rounded bg-muted/20 p-0.5" />
                        ) : (
                          <div className="w-6 h-6 rounded bg-muted/20 flex items-center justify-center">
                            <ImageOff className="h-3 w-3 text-muted-foreground/40" />
                          </div>
                        )}
                        <span className="text-xs text-foreground truncate">{opt.name}</span>
                      </label>
                      <div className="flex items-center gap-2 shrink-0">
                        {onOptionImageOverridesChange && (
                          <OptionOverrideControl
                            scope="ring"
                            clientId={clientId}
                            stepKey={stepKey}
                            optionValue={opt.option_value}
                            optionLabel={opt.name}
                            defaultUrl={thumbUrl || undefined}
                            overrideUrl={overrideUrl}
                            onUploaded={(url) => onOptionImageOverridesChange({ ...optionImageOverrides, [opt.option_value]: url })}
                            onReset={() => {
                              const next = { ...optionImageOverrides };
                              delete next[opt.option_value];
                              onOptionImageOverridesChange(next);
                            }}
                          />
                        )}
                        <Switch
                          checked={!disabledOptions.has(opt.option_value)}
                          onCheckedChange={() => onToggleOption(opt.option_value)}
                          className="scale-75"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}


          {/* Custom options */}
          {customOptions.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground font-medium">Custom Options</Label>
              {customOptions.map((opt, i) => (
                <div key={i} className="flex items-center justify-between p-1.5 rounded bg-primary/5">
                  <div className="flex items-center gap-2">
                    {opt.image_url && <img src={opt.image_url} alt="" className="w-5 h-5 rounded object-cover" />}
                    <span className="text-xs text-foreground">{opt.label}</span>
                    <Badge variant="outline" className="text-[10px]">Custom</Badge>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemoveCustomOption(i)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add custom option */}
          <div className="flex gap-1.5 items-end">
            <div className="flex-1">
              <Input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="Add custom option..."
                className="h-8 text-xs"
                maxLength={100}
              />
            </div>
            <label>
              <Input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
              <Button variant="outline" size="sm" className="h-8 gap-1 text-[10px]" asChild disabled={uploading}>
                <span>
                  {newImageUrl ? <Check className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                  {uploading ? '...' : newImageUrl ? 'Done' : 'Img'}
                </span>
              </Button>
            </label>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleAdd} disabled={!newLabel.trim()}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Inline Budget Range Editor */}
          {stepKey === 'budget' && selectedBudgets && onToggleBudget && onAddBudget && onRemoveBudget && onReorderBudgets && (
            <SimpleListEditor
              title="Budget Ranges"
              placeholder="e.g. $25,000 - $50,000"
              selected={selectedBudgets}
              onToggle={onToggleBudget}
              onAdd={onAddBudget}
              onRemove={onRemoveBudget}
              onReorder={onReorderBudgets}
            />
          )}

          {/* Inline Timeline Options Editor */}
          {stepKey === 'timeline' && selectedTimelines && onToggleTimeline && onAddTimeline && onRemoveTimeline && onReorderTimelines && (
            <SimpleListEditor
              title="Timeline Options"
              placeholder="e.g. 4-6 Weeks"
              selected={selectedTimelines}
              onToggle={onToggleTimeline}
              onAdd={onAddTimeline}
              onRemove={onRemoveTimeline}
              onReorder={onReorderTimelines}
            />
          )}
        </div>
      )}
    </div>
  );
}

// --- Custom Question Editor ---

export interface CustomQuestion {
  id?: string;
  question_text: string;
  question_key: string;
  question_type: string;
  options: string[];
  option_images?: Record<string, string>;
  is_enabled: boolean;
  is_required: boolean;
  has_text_followup: boolean;
  has_file_followup: boolean;
  display_order: number;
  subtitle?: string;
}

interface CustomQuestionEditorProps {
  question: CustomQuestion;
  shortLabel?: string;
  onShortLabelChange?: (value: string) => void;
  isActive: boolean;
  onClick: () => void;
  onChange: (updated: CustomQuestion) => void;
  onDelete: () => void;
  dragHandleProps?: any;
  clientId?: string | null;
}

export function CustomQuestionEditor({
  question, shortLabel, onShortLabelChange, isActive, onClick, onChange, onDelete, dragHandleProps, clientId,
}: CustomQuestionEditorProps) {
  const [newOption, setNewOption] = useState('');
  const [uploadingOption, setUploadingOption] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleOptionImageUpload = async (optionLabel: string, file: File) => {
    if (!clientId) return;
    setUploadingOption(optionLabel);
    const url = await uploadSingleFormImage(clientId, file);
    if (url) {
      onChange({
        ...question,
        option_images: { ...(question.option_images || {}), [optionLabel]: url },
      });
    }
    setUploadingOption(null);
  };

  const handleRemoveOptionImage = (optionLabel: string) => {
    const imgs = { ...(question.option_images || {}) };
    delete imgs[optionLabel];
    onChange({ ...question, option_images: Object.keys(imgs).length > 0 ? imgs : undefined });
  };

  return (
    <div className={`rounded-xl border-2 transition-all ${isActive ? 'border-primary shadow-sm' : 'border-border/50'}`}>
      <div className="flex items-center gap-2 p-3">
        {dragHandleProps && (
          <button type="button" className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground" {...dragHandleProps}>
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        <button type="button" className="flex-1 text-left" onClick={onClick}>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{question.question_text}</span>
            <Badge variant="default" className="text-[10px]">Custom</Badge>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {question.question_type.replace(/_/g, ' ')}
            {question.options.length > 0 ? ` • ${question.options.length} options` : ''}
          </p>
        </button>
        <Switch
          checked={question.is_enabled}
          onCheckedChange={checked => onChange({ ...question, is_enabled: checked })}
        />
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        <button type="button" onClick={onClick} className="text-muted-foreground hover:text-foreground">
          {isActive ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {isActive && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/30 pt-3">
          <div>
            <Label className="text-xs text-muted-foreground">Question Text (Heading)</Label>
            <Input
              value={question.question_text}
              onChange={e => onChange({ ...question, question_text: e.target.value })}
              className="h-8 text-sm"
              maxLength={200}
            />
          </div>
          {onShortLabelChange && (
            <div>
              <Label className="text-xs text-muted-foreground">Short step name (optional)</Label>
              <Input
                value={shortLabel || ''}
                onChange={e => onShortLabelChange(e.target.value)}
                placeholder="e.g. SETTINGS"
                className="h-8 text-sm"
                maxLength={18}
              />
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground">Subtitle (optional)</Label>
            <Input
              value={question.subtitle || ''}
              onChange={e => onChange({ ...question, subtitle: e.target.value || undefined })}
              placeholder="Optional subtitle shown below the heading"
              className="h-8 text-sm"
              maxLength={200}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select
                value={question.question_type}
                onValueChange={v => onChange({ ...question, question_type: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes_no">Yes / No</SelectItem>
                  <SelectItem value="text">Text Input</SelectItem>
                  <SelectItem value="dropdown">Dropdown</SelectItem>
                  <SelectItem value="custom_options">Custom Options</SelectItem>
                  <SelectItem value="file">File Upload</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Switch
                  checked={question.is_required}
                  onCheckedChange={checked => onChange({ ...question, is_required: checked })}
                  className="scale-75"
                />
                <span className="text-xs text-muted-foreground">Required</span>
              </label>
            </div>
          </div>

          {(question.question_type === 'dropdown' || question.question_type === 'custom_options') && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground">Options</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[200px]">
                      <p className="text-xs">Upload square images (300×300px recommended). PNG or WebP with transparent background works best.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              {question.options.map((opt, i) => {
                const optImg = question.option_images?.[opt];
                return (
                  <div key={i} className="flex items-center gap-1.5">
                    {optImg ? (
                      <button type="button" onClick={() => handleRemoveOptionImage(opt)} className="relative group" title="Click to remove image">
                        <img src={optImg} alt="" className="w-6 h-6 rounded object-cover border border-border/50" />
                        <div className="absolute inset-0 bg-destructive/60 rounded opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <Trash2 className="h-3 w-3 text-white" />
                        </div>
                      </button>
                    ) : (
                      <div className="w-6 h-6 rounded border border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/20">
                        <ImageIcon className="h-3 w-3 text-muted-foreground/40" />
                      </div>
                    )}
                    <span className="text-xs text-foreground flex-1 p-1.5 rounded bg-muted/30">{opt}</span>
                    <input
                      ref={el => { fileInputRefs.current[opt] = el; }}
                      type="file"
                      accept="image/png,image/webp,image/jpeg"
                      className="hidden"
                      onChange={async e => {
                        const file = e.target.files?.[0];
                        if (file) await handleOptionImageUpload(opt, file);
                        if (fileInputRefs.current[opt]) fileInputRefs.current[opt]!.value = '';
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      disabled={uploadingOption === opt || !clientId}
                      onClick={() => fileInputRefs.current[opt]?.click()}
                      title="Upload image"
                    >
                      {uploadingOption === opt ? (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      ) : (
                        <ImageIcon className="h-3 w-3 text-muted-foreground" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        handleRemoveOptionImage(opt);
                        onChange({ ...question, options: question.options.filter((_, idx) => idx !== i) });
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                );
              })}
              <div className="flex gap-1.5">
                <Input
                  value={newOption}
                  onChange={e => setNewOption(e.target.value)}
                  placeholder="Add option..."
                  className="h-7 text-xs"
                  maxLength={100}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newOption.trim()) {
                      onChange({ ...question, options: [...question.options, newOption.trim()] });
                      setNewOption('');
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    if (newOption.trim()) {
                      onChange({ ...question, options: [...question.options, newOption.trim()] });
                      setNewOption('');
                    }
                  }}
                  disabled={!newOption.trim()}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          {question.question_type === 'yes_no' && (
            <div className="space-y-2">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Switch
                  checked={question.has_text_followup}
                  onCheckedChange={checked => onChange({ ...question, has_text_followup: checked })}
                  className="scale-75"
                />
                <span className="text-xs text-muted-foreground">Show text follow-up on "Yes"</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <Switch
                  checked={question.has_file_followup}
                  onCheckedChange={checked => onChange({ ...question, has_file_followup: checked })}
                  className="scale-75"
                />
                <span className="text-xs text-muted-foreground">Show file upload on "Yes"</span>
              </label>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Add New Question Form ---

interface AddQuestionFormProps {
  onAdd: (q: CustomQuestion) => void;
}

export function AddQuestionForm({ onAdd }: AddQuestionFormProps) {
  const [text, setText] = useState('');
  const [type, setType] = useState('yes_no');
  const [options, setOptions] = useState('');

  const handleAdd = () => {
    if (!text.trim()) return;
    const key = text.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
    const opts = (type === 'dropdown' || type === 'custom_options') && options.trim()
      ? options.split(',').map(o => o.trim()).filter(Boolean)
      : [];
    onAdd({
      question_text: text.trim(),
      question_key: key,
      question_type: type,
      options: opts,
      is_enabled: true,
      is_required: false,
      has_text_followup: false,
      has_file_followup: false,
      display_order: 0,
    });
    setText('');
    setOptions('');
  };

  return (
    <div className="p-3 rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 space-y-2">
      <Label className="text-xs font-semibold text-foreground">Add Custom Question</Label>
      <Input
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="e.g. Would you like an engraving?"
        className="h-8 text-sm"
        maxLength={200}
      />
      <div className="grid grid-cols-2 gap-2">
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="yes_no">Yes / No</SelectItem>
            <SelectItem value="text">Text Input</SelectItem>
            <SelectItem value="dropdown">Dropdown</SelectItem>
            <SelectItem value="custom_options">Custom Options</SelectItem>
            <SelectItem value="file">File Upload</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="default" size="sm" className="h-8 gap-1" onClick={handleAdd} disabled={!text.trim()}>
          <Plus className="h-3.5 w-3.5" /> Add Question
        </Button>
      </div>
      {(type === 'dropdown' || type === 'custom_options') && (
        <Input
          value={options}
          onChange={e => setOptions(e.target.value)}
          placeholder="Options (comma-separated): A, B, C"
          className="h-8 text-xs"
          maxLength={500}
        />
      )}
    </div>
  );
}

// Inline budget range editor for the budget step (drag-reorderable + toggle)
function SortableBudgetRow({
  id, enabled, onToggle, onRemove,
}: { id: string; enabled: boolean; onToggle: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-1.5 px-1.5 py-1 rounded-md border border-border/40 bg-card/60">
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground transition-colors"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Button
        type="button"
        variant={enabled ? 'default' : 'outline'}
        size="sm"
        className="h-6 text-[11px] px-2 flex-1 justify-start"
        onClick={onToggle}
      >
        {id}
      </Button>
      <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-destructive p-0.5" title="Remove">
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function SimpleListEditor({
  title, placeholder, selected, onToggle, onAdd, onRemove, onReorder,
}: {
  title: string;
  placeholder: string;
  selected: Record<string, boolean>;
  onToggle: (value: string) => void;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  onReorder: (order: string[]) => void;
}) {
  const [val, setVal] = useState('');
  const items = Object.keys(selected);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const handleAdd = () => {
    const v = val.trim();
    if (!v) return;
    if (!(v in selected)) onAdd(v);
    setVal('');
  };
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.indexOf(String(active.id));
    const newIndex = items.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder(arrayMove(items, oldIndex, newIndex));
  };
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground font-medium">{title}</Label>
      <p className="text-[10px] text-muted-foreground">Drag to reorder. Click to enable/disable on the widget.</p>
      <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-border/30 p-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items} strategy={verticalListSortingStrategy}>
            {items.map(item => (
              <SortableBudgetRow
                key={item}
                id={item}
                enabled={!!selected[item]}
                onToggle={() => onToggle(item)}
                onRemove={() => onRemove(item)}
              />
            ))}
          </SortableContext>
        </DndContext>
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">No options added yet</p>
        )}
      </div>
      <div className="flex gap-1.5">
        <Input
          value={val}
          onChange={e => setVal(e.target.value)}
          placeholder={placeholder}
          className="h-8 text-xs"
          maxLength={50}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
        />
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleAdd} disabled={!val.trim()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

