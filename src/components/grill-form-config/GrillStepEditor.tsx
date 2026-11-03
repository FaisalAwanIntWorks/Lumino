import { useEffect, useMemo, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Crown, ImageIcon, Loader2, X, GripVertical, Copy, RotateCcw } from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, verticalListSortingStrategy, rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { GrillMetalConfig } from '@/hooks/useClientGrillConfig';
import { OptionOverrideControl } from '@/components/form-wizard/OptionOverrideControl';
import type { OptionImageOverrides } from '@/lib/option-image-overrides';
import {
  ACCEPTED_OVERRIDE_INPUT_ACCEPT,
  uploadOptionOverride,
} from '@/lib/option-image-overrides';
import {
  getGrillMetalImage,
  isMasterGrillMetal,
  sortByMetalOrder,
  metalOverrideStepKey,
  resolveGrillMetalImage,
  DEFAULT_GRILL_TYPE_OPTIONS,
  type GrillzVariant,
  type GrillTypeOption,
} from '@/lib/grill-metal-images';
import {
  GRILL_TOGGLEABLE_OPTIONS,
  isGrillOptionEnabled,
  setGrillOptionEnabled,
  type GrillEnabledOptions,
  type GrillToggleableOption,
} from '@/lib/grill-option-toggles';
import { preloadImage } from '@/lib/image-preload';
import { cn } from '@/lib/utils';


const METAL_HEX_MAP: Record<string, string> = {
  gold: '#FFD700',
  yellow_gold: '#FFD700',
  white_gold: '#E8E8E8',
  rose_gold: '#B76E79',
  silver: '#C0C0C0',
  platinum: '#E5E4E2',
};

interface GrillStepEditorProps {
  stepKey: string;
  metals?: GrillMetalConfig[];
  selectedMetals?: Record<string, boolean>;
  selectedPurities?: Record<string, Record<string, boolean>>;
  onToggleMetal?: (metalValue: string) => void;
  onTogglePurity?: (metalValue: string, purityValue: string) => void;
  onAddCustomMetal?: (label: string) => void;
  onAddCustomPurity?: (metalValue: string, label: string) => void;
  metalOrder?: string[];
  onMetalOrderChange?: (order: string[]) => void;
  grillTypeOptions?: GrillTypeOption[];
  onGrillTypeOptionsChange?: (options: GrillTypeOption[]) => void;
  allTeeth?: string[];
  topTeeth?: Record<string, boolean>;
  bottomTeeth?: Record<string, boolean>;
  onToggleTopTooth?: (value: string) => void;
  onToggleBottomTooth?: (value: string) => void;
  onAddCustomTooth?: (position: 'top' | 'bottom', value: string) => void;
  budgetOptions?: string[];
  onBudgetOptionsChange?: (opts: string[]) => void;
  clientId?: string | null;
  optionImageOverrides?: OptionImageOverrides;
  onOptionImageOverridesChange?: (next: OptionImageOverrides) => void;
  enabledOptions?: GrillEnabledOptions;
  onEnabledOptionsChange?: (next: GrillEnabledOptions) => void;
}


export function GrillStepEditor(props: GrillStepEditorProps) {
  const { stepKey } = props;

  if (stepKey === 'metal' && props.metals) {
    return <MetalEditor {...props} />;
  }
  if (stepKey === 'teeth' && props.allTeeth) {
    return <TeethEditor {...props} />;
  }
  if (stepKey === 'budget' && props.budgetOptions) {
    return <BudgetEditor options={props.budgetOptions} onChange={props.onBudgetOptionsChange!} />;
  }
  if (stepKey === 'type') {
    return <GrillTypeEditor {...props} />;
  }
  if (GRILL_TOGGLEABLE_OPTIONS[stepKey]) {
    return (
      <SimpleImageOverrideEditor
        stepKey={stepKey}
        rows={GRILL_TOGGLEABLE_OPTIONS[stepKey]}
        helperText="Turn an option off to hide its card from this step in the form."
        clientId={props.clientId}
        optionImageOverrides={props.optionImageOverrides}
        onOptionImageOverridesChange={props.onOptionImageOverridesChange}
        enabledOptions={props.enabledOptions}
        onEnabledOptionsChange={props.onEnabledOptionsChange}
      />
    );
  }

  return (
    <p className="text-xs text-muted-foreground italic px-1">
      This step has no configurable options.
    </p>
  );
}

function SortableRow({ id, children }: { id: string; children: (p: { dragHandleProps: any }) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined, opacity: isDragging ? 0.85 : 1 };
  return <div ref={setNodeRef} style={style}>{children({ dragHandleProps: { ...attributes, ...listeners } })}</div>;
}

function useDndSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
}

function slugifyTypeValue(label: string, existing: Set<string>): string {
  const base = label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'option';
  let value = base;
  let i = 2;
  while (existing.has(value)) value = `${base}-${i++}`;
  return value;
}

function GrillTypeEditor(props: GrillStepEditorProps) {
  const {
    clientId, optionImageOverrides, onOptionImageOverridesChange,
    grillTypeOptions, onGrillTypeOptionsChange,
  } = props;
  const [newLabel, setNewLabel] = useState('');
  const sensors = useDndSensors();
  const options = grillTypeOptions || [];

  if (!onGrillTypeOptionsChange || !onOptionImageOverridesChange) {
    return <p className="text-xs text-muted-foreground italic px-1">Grillz type options are unavailable.</p>;
  }

  const update = (value: string, patch: Partial<GrillTypeOption>) =>
    onGrillTypeOptionsChange(options.map(o => (o.value === value ? { ...o, ...patch } : o)));

  const remove = (value: string) => {
    onGrillTypeOptionsChange(options.filter(o => o.value !== value));
    const all = { ...(optionImageOverrides || {}) };
    const next = { ...(all.type || {}) };
    delete next[value];
    if (Object.keys(next).length === 0) delete all.type; else all.type = next;
    onOptionImageOverridesChange(all);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = options.findIndex(o => o.value === active.id);
    const newIndex = options.findIndex(o => o.value === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onGrillTypeOptionsChange(arrayMove(options, oldIndex, newIndex));
  };

  const handleAdd = () => {
    const label = newLabel.trim();
    if (!label) return;
    const value = slugifyTypeValue(label, new Set(options.map(o => o.value)));
    onGrillTypeOptionsChange([...options, { value, label, is_enabled: true, is_custom: true }]);
    setNewLabel('');
  };

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={options.map(o => o.value)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {options.map(opt => (
              <SortableRow key={opt.value} id={opt.value}>
                {({ dragHandleProps }) => (
                  <div className="flex items-center gap-2 p-1.5 rounded border border-border/30 bg-card/50">
                    <button type="button" className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground" {...dragHandleProps}>
                      <GripVertical className="h-3.5 w-3.5" />
                    </button>
                    <Input
                      value={opt.label}
                      onChange={e => update(opt.value, { label: e.target.value })}
                      className="h-7 text-[11px] flex-1"
                      maxLength={50}
                    />
                    <OptionOverrideControl
                      scope="grill"
                      clientId={clientId}
                      stepKey="type"
                      optionValue={opt.value}
                      optionLabel={opt.label}
                      overrideUrl={optionImageOverrides?.type?.[opt.value]}
                      onUploaded={(url) => {
                        const all = { ...(optionImageOverrides || {}) };
                        all.type = { ...(all.type || {}), [opt.value]: url };
                        onOptionImageOverridesChange(all);
                      }}
                      onReset={() => {
                        const all = { ...(optionImageOverrides || {}) };
                        const next = { ...(all.type || {}) };
                        delete next[opt.value];
                        if (Object.keys(next).length === 0) delete all.type; else all.type = next;
                        onOptionImageOverridesChange(all);
                      }}
                    />
                    <Switch
                      checked={opt.is_enabled !== false}
                      onCheckedChange={c => update(opt.value, { is_enabled: c })}
                      className="scale-75"
                    />
                    {opt.is_custom ? (
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => remove(opt.value)} title="Delete option">
                        <Trash2 className="h-2.5 w-2.5 text-destructive" />
                      </Button>
                    ) : (
                      <span className="w-5" />
                    )}
                  </div>
                )}
              </SortableRow>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <div className="pt-2 border-t border-border/30">
        <Label className="text-[11px] text-muted-foreground">Add Custom Option</Label>
        <div className="flex gap-1.5 mt-1">
          <Input
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            placeholder="e.g. Half Iced"
            className="h-7 text-[11px]"
            maxLength={50}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          />
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleAdd} disabled={!newLabel.trim()}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground italic mt-1">
          Upload an image for each custom option. The metal step always shows plain metal images — iced-out images appear only when "Iced Out" is selected.
        </p>
      </div>
    </div>
  );
}


function SimpleImageOverrideEditor(props: {
  stepKey: string;
  rows: GrillToggleableOption[];
  helperText?: string;
  clientId?: string | null;
  optionImageOverrides?: OptionImageOverrides;
  onOptionImageOverridesChange?: (next: OptionImageOverrides) => void;
  enabledOptions?: GrillEnabledOptions;
  onEnabledOptionsChange?: (next: GrillEnabledOptions) => void;
}) {
  const {
    stepKey, rows, helperText, clientId, optionImageOverrides, onOptionImageOverridesChange,
    enabledOptions, onEnabledOptionsChange,
  } = props;
  if (!onOptionImageOverridesChange) {
    return (
      <p className="text-xs text-muted-foreground italic px-1">
        Image overrides are unavailable.
      </p>
    );
  }
  // Never let the client switch off every card — the step would render empty.
  const enabledCount = rows.filter(r => isGrillOptionEnabled(enabledOptions, stepKey, r.value)).length;

  return (
    <div className="space-y-2">
      {rows.map(row => {
        const enabled = isGrillOptionEnabled(enabledOptions, stepKey, row.value);
        const isLastEnabled = enabled && enabledCount <= 1;
        return (
          <div key={row.value} className="p-1.5 rounded hover:bg-muted/30">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground truncate">{row.label}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                {row.hasImageOverride && (
                  <OptionOverrideControl
                    scope="grill"
                    clientId={clientId}
                    stepKey={stepKey}
                    optionValue={row.value}
                    optionLabel={row.label}
                    overrideUrl={optionImageOverrides?.[stepKey]?.[row.value]}
                    onUploaded={(url) => {
                      const all = { ...(optionImageOverrides || {}) };
                      all[stepKey] = { ...(all[stepKey] || {}), [row.value]: url };
                      onOptionImageOverridesChange(all);
                    }}
                    onReset={() => {
                      const all = { ...(optionImageOverrides || {}) };
                      const next = { ...(all[stepKey] || {}) };
                      delete next[row.value];
                      if (Object.keys(next).length === 0) delete all[stepKey]; else all[stepKey] = next;
                      onOptionImageOverridesChange(all);
                    }}
                  />
                )}
                {onEnabledOptionsChange && (
                  <Switch
                    checked={enabled}
                    disabled={isLastEnabled}
                    onCheckedChange={c => onEnabledOptionsChange(setGrillOptionEnabled(enabledOptions, stepKey, row.value, c))}
                    className="scale-75"
                    title={isLastEnabled ? 'At least one option must stay enabled' : undefined}
                  />
                )}
              </div>
            </div>
            {row.hint && (
              <p className="text-[10px] text-muted-foreground italic mt-0.5">{row.hint}</p>
            )}
          </div>
        );
      })}
      {helperText && (
        <p className="text-[10px] text-muted-foreground italic px-1">{helperText}</p>
      )}
    </div>
  );
}

function MetalEditor(props: GrillStepEditorProps) {
  const [newMetalLabel, setNewMetalLabel] = useState('');
  const [activeType, setActiveType] = useState<string>('basic');
  const {
    metals: rawMetals = [], selectedMetals = {}, optionImageOverrides,
    onOptionImageOverridesChange, clientId, metalOrder, onMetalOrderChange,
  } = props;
  const sensors = useDndSensors();

  // Editing context: one tab per configured Grillz Type (Plain, Iced Out, custom).
  const typeTabs = useMemo(() => {
    const list = (props.grillTypeOptions && props.grillTypeOptions.length
      ? props.grillTypeOptions
      : DEFAULT_GRILL_TYPE_OPTIONS).filter(o => o.is_enabled !== false);
    return list.length ? list : DEFAULT_GRILL_TYPE_OPTIONS;
  }, [props.grillTypeOptions]);

  useEffect(() => {
    if (!typeTabs.some(t => t.value === activeType)) setActiveType(typeTabs[0].value);
  }, [typeTabs, activeType]);

  const activeStepKey = metalOverrideStepKey(activeType);

  const metals = useMemo(() => sortByMetalOrder(rawMetals, metalOrder), [rawMetals, metalOrder]);

  const handleMetalDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id || !onMetalOrderChange) return;
    const oldIndex = metals.findIndex(m => m.value === active.id);
    const newIndex = metals.findIndex(m => m.value === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    onMetalOrderChange(arrayMove(metals, oldIndex, newIndex).map(m => m.value));
  };

  // Preload widget images for the active type so cards never flash blank.
  useEffect(() => {
    metals.forEach(m => {
      const url = resolveGrillMetalImage({ metalValue: m.value, grillzType: activeType, overrides: optionImageOverrides });
      if (url) preloadImage(url).catch(() => undefined);
    });
  }, [metals, activeType, optionImageOverrides]);



  const setOverride = (metalValue: string, url: string | null) => {
    if (!onOptionImageOverridesChange) return;
    const all = { ...(optionImageOverrides || {}) };
    const next = { ...(all[activeStepKey] || {}) };
    if (url) next[metalValue] = url;
    else delete next[metalValue];
    if (Object.keys(next).length === 0) delete all[activeStepKey];
    else all[activeStepKey] = next;
    onOptionImageOverridesChange(all);
  };

  const copyImagesFrom = (sourceType: string) => {
    if (!onOptionImageOverridesChange) return;
    const all = { ...(optionImageOverrides || {}) };
    const source = { ...(all[metalOverrideStepKey(sourceType)] || {}) };
    // Fall back to the legacy shared map when the source type has no per-type images yet.
    const merged = Object.keys(source).length ? source : { ...(all.metal || {}) };
    if (Object.keys(merged).length === 0) return;
    all[activeStepKey] = { ...(all[activeStepKey] || {}), ...merged };
    onOptionImageOverridesChange(all);
  };

  /**
   * Reverts the active Grillz Type back to the default (master CDN) metal
   * images. Any legacy shared `metal` uploads are first materialised onto the
   * *other* types so their appearance is untouched, then removed — otherwise
   * the shared fallback would immediately re-apply here.
   */
  const hasCustomImagesForType = Boolean(
    Object.keys(optionImageOverrides?.[activeStepKey] || {}).length ||
    Object.keys(optionImageOverrides?.metal || {}).length,
  );

  const resetTypeImages = () => {
    if (!onOptionImageOverridesChange) return;
    const all = { ...(optionImageOverrides || {}) };
    const legacy = { ...(all.metal || {}) };
    if (Object.keys(legacy).length) {
      for (const t of typeTabs) {
        if (t.value === activeType) continue;
        const key = metalOverrideStepKey(t.value);
        all[key] = { ...legacy, ...(all[key] || {}) };
      }
      delete all.metal;
    }
    delete all[activeStepKey];
    onOptionImageOverridesChange(all);
  };


  return (
    <div className="space-y-3">
      {/* Grillz Type editing context — images below apply to the selected type only */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-[11px] text-muted-foreground">Images for Grillz Type</Label>
          <div className="inline-flex flex-wrap justify-end rounded border border-border/40 overflow-hidden">
            {typeTabs.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setActiveType(t.value)}
                className={cn(
                  'px-2 py-0.5 text-[10px] font-medium transition-colors',
                  activeType === t.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-transparent text-muted-foreground hover:bg-muted/30',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-start justify-between gap-2">
          <p className="text-[10px] text-muted-foreground italic">
            Each Grillz Type has its own metal images. Uploads here only affect "{typeTabs.find(t => t.value === activeType)?.label ?? activeType}".
          </p>
          {onOptionImageOverridesChange && (
            <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
              {typeTabs.length > 1 && typeTabs.filter(t => t.value !== activeType).map(t => (
                <Button
                  key={t.value}
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => copyImagesFrom(t.value)}
                  title={`Copy the images configured for "${t.label}" into this type`}
                >
                  <Copy className="h-3 w-3 mr-1" /> {t.label}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={resetTypeImages}
                disabled={!hasCustomImagesForType}
                title={`Revert "${typeTabs.find(t => t.value === activeType)?.label ?? activeType}" back to the default metal images`}
              >
                <RotateCcw className="h-3 w-3 mr-1" /> Reset metal images
              </Button>
            </div>
          )}

        </div>
      </div>

      {/* Card grid — mirrors widget CardCarousel layout. Drag cards to reorder. */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleMetalDragEnd}>
        <SortableContext items={metals.map(m => m.value)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {metals.map(metal => {
              const enabled = selectedMetals[metal.value] ?? false;
              const override = optionImageOverrides?.[activeStepKey]?.[metal.value];
              const imgSrc = resolveGrillMetalImage({ metalValue: metal.value, grillzType: activeType, overrides: optionImageOverrides });
              const hex = METAL_HEX_MAP[metal.value] || METAL_HEX_MAP[metal.value.toLowerCase().replace(/\s+/g, '_')] || '#888';
              // Custom metals without an uploaded override fall back to a color swatch — never another metal's image.
              const hasImage = Boolean(imgSrc);

              return (
                <SortableRow key={metal.value} id={metal.value}>
                  {({ dragHandleProps }) => (
                    <div
                      className={cn(
                        'relative rounded-md border bg-card overflow-hidden transition-colors',
                        enabled ? 'border-primary' : 'border-border/40',
                      )}
                    >
                      <div className="relative aspect-square bg-muted/20 flex items-center justify-center">
                        {hasImage ? (
                          <img
                            src={imgSrc}
                            alt={metal.label}
                            className="w-full h-full object-contain p-2"
                            loading="lazy"
                          />
                        ) : (
                          <span
                            className="w-12 h-12 rounded-full border border-border/50"
                            style={{ backgroundColor: hex }}
                          />
                        )}

                        {/* Top-left: swap image */}
                        {onOptionImageOverridesChange && (
                          <div className="absolute top-1 left-1">
                            <MetalImageSwap
                              clientId={clientId ?? null}
                              metalValue={metal.value}
                              metalLabel={metal.label}
                              stepKey={activeStepKey}
                              overrideUrl={override}
                              onUploaded={(url) => setOverride(metal.value, url)}
                              onReset={() => setOverride(metal.value, null)}
                            />
                          </div>
                        )}

                        {/* Top-right: enable toggle */}
                        <div className="absolute top-1 right-1 bg-background/80 backdrop-blur-sm rounded px-1 py-0.5">
                          <Switch
                            checked={enabled}
                            onCheckedChange={() => props.onToggleMetal?.(metal.value)}
                            className="scale-75"
                          />
                        </div>
                      </div>
                      <div className="px-2 py-1.5 border-t border-border/30 flex items-center gap-1">
                        {onMetalOrderChange && (
                          <button
                            type="button"
                            className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground shrink-0"
                            title="Drag to reorder"
                            {...dragHandleProps}
                          >
                            <GripVertical className="h-3 w-3" />
                          </button>
                        )}
                        <span className="text-[11px] font-medium text-foreground truncate block">{metal.label}</span>
                      </div>
                    </div>
                  )}
                </SortableRow>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>


      <div className="pt-2 border-t border-border/30">
        <Label className="text-[11px] text-muted-foreground">Add Custom Metal</Label>
        <div className="flex gap-1.5 mt-1">
          <Input value={newMetalLabel} onChange={e => setNewMetalLabel(e.target.value)} placeholder="e.g. Platinum" className="h-7 text-[11px]" maxLength={50}
            onKeyDown={e => { if (e.key === 'Enter' && newMetalLabel.trim()) { props.onAddCustomMetal?.(newMetalLabel.trim()); setNewMetalLabel(''); } }}
          />
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => { if (newMetalLabel.trim()) { props.onAddCustomMetal?.(newMetalLabel.trim()); setNewMetalLabel(''); } }} disabled={!newMetalLabel.trim()}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// Compact in-card image swap button for metal cards. Uses the same upload
// pipeline as OptionOverrideControl but renders as a small floating icon.
function MetalImageSwap({
  clientId, metalValue, metalLabel, stepKey, overrideUrl, onUploaded, onReset,
}: {
  clientId: string | null;
  metalValue: string;
  metalLabel: string;
  stepKey: string;
  overrideUrl?: string;
  onUploaded: (url: string) => void;
  onReset: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  return (
    <div className="flex items-center gap-1">
      <label
        className={cn(
          'w-6 h-6 rounded flex items-center justify-center cursor-pointer transition-colors',
          'bg-background/80 backdrop-blur-sm border',
          overrideUrl ? 'border-primary/60 text-primary' : 'border-border/60 text-muted-foreground hover:text-foreground',
          (!clientId || uploading) && 'opacity-50 cursor-not-allowed',
        )}
        title={overrideUrl ? `Replace custom image for "${metalLabel}"` : `Upload custom image for "${metalLabel}" (PNG/WEBP/JPEG, ≤2MB, 300×300)`}
      >
        <input
          type="file"
          accept={ACCEPTED_OVERRIDE_INPUT_ACCEPT}
          className="hidden"
          disabled={!clientId || uploading}
          onChange={async e => {
            const file = e.target.files?.[0];
            (e.target as HTMLInputElement).value = '';
            if (!file || !clientId) return;
            setUploading(true);
            const url = await uploadOptionOverride({ scope: 'grill', clientId, stepKey, optionValue: metalValue, file });
            setUploading(false);
            if (url) onUploaded(url);
          }}
        />
        {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
      </label>
      {overrideUrl && (
        <button
          type="button"
          onClick={onReset}
          className="w-5 h-5 rounded bg-background/80 backdrop-blur-sm border border-border/60 text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center"
          title="Reset to default image"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}



function TeethEditor(props: GrillStepEditorProps) {
  const [newTop, setNewTop] = useState('');
  const [newBottom, setNewBottom] = useState('');
  const { allTeeth = [], topTeeth = {}, bottomTeeth = {} } = props;

  return (
    <div className="space-y-3">
      <div>
        <Label className="text-[11px] text-muted-foreground font-medium">Top Teeth</Label>
        <div className="max-h-48 overflow-y-auto space-y-0.5 mt-1">
          {allTeeth.map(t => (
            <label key={`top-${t}`} className="flex items-center justify-between p-1.5 rounded hover:bg-muted/30 cursor-pointer">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-muted-foreground shrink-0" />
                <span className="text-xs text-foreground">{t === 'none' ? 'No Top' : t}</span>
              </div>
              <Switch checked={topTeeth[t] ?? false} onCheckedChange={() => props.onToggleTopTooth?.(t)} className="scale-75" />
            </label>
          ))}
        </div>
        <div className="flex gap-1.5 mt-1">
          <Input value={newTop} onChange={e => setNewTop(e.target.value)} placeholder="Custom..." className="h-7 text-[11px]" maxLength={20}
            onKeyDown={e => { if (e.key === 'Enter' && newTop.trim()) { props.onAddCustomTooth?.('top', newTop.trim()); setNewTop(''); } }}
          />
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => { if (newTop.trim()) { props.onAddCustomTooth?.('top', newTop.trim()); setNewTop(''); } }} disabled={!newTop.trim()}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div>
        <Label className="text-[11px] text-muted-foreground font-medium">Bottom Teeth</Label>
        <div className="max-h-48 overflow-y-auto space-y-0.5 mt-1">
          {allTeeth.map(t => (
            <label key={`btm-${t}`} className="flex items-center justify-between p-1.5 rounded hover:bg-muted/30 cursor-pointer">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-muted-foreground shrink-0 rotate-180" />
                <span className="text-xs text-foreground">{t === 'none' ? 'No Bottom' : t}</span>
              </div>
              <Switch checked={bottomTeeth[t] ?? false} onCheckedChange={() => props.onToggleBottomTooth?.(t)} className="scale-75" />
            </label>
          ))}
        </div>
        <div className="flex gap-1.5 mt-1">
          <Input value={newBottom} onChange={e => setNewBottom(e.target.value)} placeholder="Custom..." className="h-7 text-[11px]" maxLength={20}
            onKeyDown={e => { if (e.key === 'Enter' && newBottom.trim()) { props.onAddCustomTooth?.('bottom', newBottom.trim()); setNewBottom(''); } }}
          />
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => { if (newBottom.trim()) { props.onAddCustomTooth?.('bottom', newBottom.trim()); setNewBottom(''); } }} disabled={!newBottom.trim()}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}


function BudgetEditor({ options, onChange }: { options: string[]; onChange: (opts: string[]) => void }) {
  const [val, setVal] = useState('');
  const handleAdd = () => { if (val.trim()) { onChange([...options, val.trim()]); setVal(''); } };
  return (
    <div className="space-y-1.5">
      {options.map((opt, i) => (
        <div key={i} className="flex items-center justify-between p-1.5 rounded border border-border/30 bg-card/50">
          <span className="text-[11px] text-foreground">{opt}</span>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => onChange(options.filter((_, idx) => idx !== i))}>
            <Trash2 className="h-2.5 w-2.5 text-destructive" />
          </Button>
        </div>
      ))}
      <div className="flex gap-1.5">
        <Input value={val} onChange={e => setVal(e.target.value)} placeholder="e.g. $25,000 - $50,000" className="h-7 text-[11px]" maxLength={50}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }} />
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleAdd} disabled={!val.trim()}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
