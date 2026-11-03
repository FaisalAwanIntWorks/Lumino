import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Plus, Gem, CircleDot, Sparkles, Diamond, GripVertical, X, Trash2 } from 'lucide-react';
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
import { OptionOverrideControl } from '@/components/form-wizard/OptionOverrideControl';
import { getOverrideUrl, setOverride, removeOverride, type OptionImageOverrides } from '@/lib/option-image-overrides';

interface CustomEnquiryStepEditorProps {
  stepKey: string;
  clientId?: string | null;
  optionImageOverrides?: OptionImageOverrides | null;
  onOptionImageOverridesChange?: (next: OptionImageOverrides) => void;
  jewelryTypes?: string[];
  selectedJewelryTypes?: Record<string, boolean>;
  onToggleJewelryType?: (key: string) => void;
  onAddJewelryType?: (value: string) => void;
  onReorderJewelryTypes?: (order: string[]) => void;
  goldColors?: { value: string; label: string; hex?: string }[];
  selectedGoldColors?: Record<string, boolean>;
  onToggleGoldColor?: (key: string) => void;
  onAddGoldColor?: (value: string, label: string) => void;
  onRemoveGoldColor?: (key: string) => void;
  onReorderGoldColors?: (order: string[]) => void;
  karats?: string[];
  selectedKarats?: Record<string, boolean>;
  onToggleKarat?: (key: string) => void;
  onAddKarat?: (value: string) => void;
  onRemoveKarat?: (key: string) => void;
  onReorderKarats?: (order: string[]) => void;
  diamondQualities?: string[];
  selectedDiamondQualities?: Record<string, boolean>;
  onToggleDiamondQuality?: (key: string) => void;
  onAddDiamondQuality?: (value: string) => void;
  onRemoveDiamondQuality?: (key: string) => void;
  onReorderDiamondQualities?: (order: string[]) => void;
  diamondSetups?: string[];
  selectedDiamondSetups?: Record<string, boolean>;
  onToggleDiamondSetup?: (key: string) => void;
  onAddDiamondSetup?: (value: string) => void;
  onRemoveDiamondSetup?: (key: string) => void;
  onReorderDiamondSetups?: (order: string[]) => void;
  /** Customer-facing notes per design section: { section: { optionValue: note } } */
  optionNotes?: Record<string, Record<string, string>>;
  onOptionNoteChange?: (section: string, optionValue: string, note: string) => void;
  budgetRanges?: string[];
  selectedBudgets?: Record<string, boolean>;
  onToggleBudget?: (key: string) => void;
  onAddBudget?: (value: string) => void;
  onReorderBudgets?: (order: string[]) => void;
  onRemoveBudget?: (key: string) => void;
  selectedTimelines?: Record<string, boolean>;
  onToggleTimeline?: (key: string) => void;
  onAddTimeline?: (value: string) => void;
  onReorderTimelines?: (order: string[]) => void;
  onRemoveTimeline?: (key: string) => void;
  // Budget/Timeline sub-section toggles (custom enquiry only)
  budgetSectionEnabled?: boolean;
  timelineSectionEnabled?: boolean;
  onToggleBudgetSection?: () => void;
  onToggleTimelineSection?: () => void;
  // Design Details sub-section toggles (custom enquiry only)
  metalColorSectionEnabled?: boolean;
  karatSectionEnabled?: boolean;
  diamondQualitySectionEnabled?: boolean;
  diamondSetupSectionEnabled?: boolean;
  onToggleMetalColorSection?: () => void;
  onToggleKaratSection?: () => void;
  onToggleDiamondQualitySection?: () => void;
  onToggleDiamondSetupSection?: () => void;
  defaultQuestions?: { key: string; text: string; type: string }[];
  enabledQuestions?: Record<string, boolean>;
  requiredQuestions?: Record<string, boolean>;
  onToggleQuestion?: (key: string, enabled: boolean) => void;
  onToggleRequired?: (key: string, required: boolean) => void;
}

function OverrideCell(props: {
  clientId?: string | null;
  stepKey: string;
  optionValue: string;
  optionLabel: string;
  overrides?: OptionImageOverrides | null;
  onChange?: (next: OptionImageOverrides) => void;
}) {
  if (!props.clientId || !props.onChange) return null;
  const current = getOverrideUrl(props.overrides, props.stepKey, props.optionValue);
  return (
    <OptionOverrideControl
      scope="custom-enquiry"
      clientId={props.clientId}
      stepKey={props.stepKey}
      optionValue={props.optionValue}
      optionLabel={props.optionLabel}
      overrideUrl={current}
      onUploaded={url => props.onChange!(setOverride(props.overrides, props.stepKey, props.optionValue, url))}
      onReset={() => props.onChange!(removeOverride(props.overrides, props.stepKey, props.optionValue))}
    />
  );
}

export function CustomEnquiryStepEditor(props: CustomEnquiryStepEditorProps) {
  const { stepKey } = props;

  if (stepKey === 'jewelry-type') return <JewelryTypeEditor {...props} />;
  if (stepKey === 'design') return <DesignEditor {...props} />;
  if (stepKey === 'budget') return <BudgetDesignEditor {...props} />;
  if (stepKey === 'questions') return <QuestionsEditor {...props} />;
  if (stepKey === 'description') return <p className="text-xs text-muted-foreground italic">Description & upload step — no extra config needed.</p>;

  return <p className="text-xs text-muted-foreground italic">No configurable options.</p>;
}

function SortableJewelryRow({
  item,
  enabled,
  onToggle,
  overrideCell,
}: {
  item: string;
  enabled: boolean;
  onToggle: () => void;
  overrideCell: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-1.5 rounded hover:bg-muted/30 border border-border/40 bg-card/60"
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <Gem className="w-5 h-5 text-muted-foreground shrink-0" />
        <span className="text-xs text-foreground truncate">{item}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {overrideCell}
        <Switch checked={enabled} onCheckedChange={onToggle} className="scale-75" />
      </div>
    </div>
  );
}

function JewelryTypeEditor(props: CustomEnquiryStepEditorProps) {
  const [newVal, setNewVal] = useState('');
  const items = Object.keys(props.selectedJewelryTypes || {});
  const selected = props.selectedJewelryTypes || {};

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.indexOf(String(active.id));
    const newIndex = items.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    props.onReorderJewelryTypes?.(next);
  };

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground">Drag to reorder. Toggle to enable/disable on widget.</p>
      <div className="max-h-64 overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No jewelry types yet.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-1">
                {items.map(item => (
                  <SortableJewelryRow
                    key={item}
                    item={item}
                    enabled={selected[item] ?? false}
                    onToggle={() => props.onToggleJewelryType?.(item)}
                    overrideCell={
                      <OverrideCell
                        clientId={props.clientId}
                        stepKey="jewelry_type"
                        optionValue={item}
                        optionLabel={item}
                        overrides={props.optionImageOverrides}
                        onChange={props.onOptionImageOverridesChange}
                      />
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
      <div className="flex gap-1.5">
        <Input value={newVal} onChange={e => setNewVal(e.target.value)} placeholder="Add jewelry type..." className="h-7 text-[11px]" maxLength={50}
          onKeyDown={e => { if (e.key === 'Enter' && newVal.trim()) { props.onAddJewelryType?.(newVal.trim()); setNewVal(''); } }} />
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => { if (newVal.trim()) { props.onAddJewelryType?.(newVal.trim()); setNewVal(''); } }} disabled={!newVal.trim()}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function DesignSubSection({
  title,
  enabled,
  onToggleSection,
  children,
}: {
  title: string;
  enabled: boolean;
  onToggleSection?: () => void;
  children: React.ReactNode;
}) {
  const dim = onToggleSection && !enabled;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11px] text-muted-foreground font-medium">{title}</Label>
        {onToggleSection && (
          <Switch checked={enabled} onCheckedChange={onToggleSection} className="scale-75" />
        )}
      </div>
      <div className={dim ? 'opacity-40 pointer-events-none' : ''}>
        {children}
      </div>
    </div>
  );
}

function SortableDesignRow({
  value,
  label,
  swatch,
  icon,
  enabled,
  note,
  onToggle,
  onRemove,
  onNoteChange,
}: {
  value: string;
  label: string;
  swatch?: string;
  icon?: React.ReactNode;
  enabled: boolean;
  note: string;
  onToggle?: () => void;
  onRemove?: () => void;
  onNoteChange?: (note: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: value });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="rounded-md border border-border/40 bg-card/60 p-1.5 space-y-1">
      <div className="flex items-center gap-2">
        <button type="button" {...attributes} {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none">
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        {swatch !== undefined
          ? <span className="w-5 h-5 rounded-full border border-border/50 shrink-0" style={{ backgroundColor: swatch || '#888' }} />
          : icon}
        <span className="text-xs text-foreground truncate flex-1 min-w-0">{label}</span>
        <Switch checked={enabled} onCheckedChange={() => onToggle?.()} className="scale-75" />
        {onRemove && (
          <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-destructive p-0.5" title="Delete option">
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      {onNoteChange && (
        <Input
          value={note}
          onChange={e => onNoteChange(e.target.value)}
          placeholder="Note shown to customer (optional)"
          className="h-6 text-[10px]"
          maxLength={80}
        />
      )}
    </div>
  );
}

function DesignOptionList({
  items,
  notes,
  selected,
  icon,
  swatches,
  labels,
  onToggle,
  onRemove,
  onReorder,
  onNoteChange,
}: {
  items: string[];
  notes?: Record<string, string>;
  selected?: Record<string, boolean>;
  icon: React.ReactNode;
  swatches?: Record<string, string | undefined>;
  labels?: Record<string, string>;
  onToggle?: (key: string) => void;
  onRemove?: (key: string) => void;
  onReorder?: (order: string[]) => void;
  onNoteChange?: (key: string, note: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.indexOf(String(active.id));
    const newIndex = items.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    onReorder?.(arrayMove(items, oldIndex, newIndex));
  };

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground italic mt-1">No options yet.</p>;
  }

  return (
    <div className="max-h-64 overflow-y-auto mt-1">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1">
            {items.map(item => (
              <SortableDesignRow
                key={item}
                value={item}
                label={labels?.[item] ?? item}
                swatch={swatches ? swatches[item] : undefined}
                icon={icon}
                enabled={selected?.[item] ?? false}
                note={notes?.[item] ?? ''}
                onToggle={onToggle ? () => onToggle(item) : undefined}
                onRemove={onRemove ? () => onRemove(item) : undefined}
                onNoteChange={onNoteChange ? note => onNoteChange(item, note) : undefined}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function DesignEditor(props: CustomEnquiryStepEditorProps) {
  const [newGoldVal, setNewGoldVal] = useState('');
  const [newGoldLabel, setNewGoldLabel] = useState('');
  const [newKarat, setNewKarat] = useState('');
  const [newDQ, setNewDQ] = useState('');
  const [newDS, setNewDS] = useState('');

  const metalOn = props.metalColorSectionEnabled !== false;
  const karatOn = props.karatSectionEnabled !== false;
  const dqOn = props.diamondQualitySectionEnabled !== false;
  const dsOn = props.diamondSetupSectionEnabled !== false;

  const notes = props.optionNotes || {};
  const noteHandler = (section: string) =>
    props.onOptionNoteChange ? (key: string, note: string) => props.onOptionNoteChange!(section, key, note) : undefined;

  const goldColors = props.goldColors || [];
  const goldItems = goldColors.map(c => c.value);
  const goldLabels = Object.fromEntries(goldColors.map(c => [c.value, c.label]));
  const goldSwatches = Object.fromEntries(goldColors.map(c => [c.value, c.hex]));

  const hint = <p className="text-[10px] text-muted-foreground mt-1">Drag to reorder. Toggle to show/hide. Trash deletes permanently.</p>;

  return (
    <div className="space-y-3">
      {/* Metal Color */}
      <DesignSubSection title="Metal Color" enabled={metalOn} onToggleSection={props.onToggleMetalColorSection}>
        {hint}
        <DesignOptionList
          items={goldItems}
          labels={goldLabels}
          swatches={goldSwatches}
          icon={null}
          notes={notes.metal_color}
          selected={props.selectedGoldColors}
          onToggle={props.onToggleGoldColor}
          onRemove={props.onRemoveGoldColor}
          onReorder={props.onReorderGoldColors}
          onNoteChange={noteHandler('metal_color')}
        />
        <div className="flex gap-1 mt-1">
          <Input value={newGoldVal} onChange={e => setNewGoldVal(e.target.value)} placeholder="Value" className="h-7 text-[11px] flex-1" maxLength={30} />
          <Input value={newGoldLabel} onChange={e => setNewGoldLabel(e.target.value)} placeholder="Label" className="h-7 text-[11px] flex-1" maxLength={30} />
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => {
            if (newGoldVal.trim()) { props.onAddGoldColor?.(newGoldVal.trim(), newGoldLabel.trim() || newGoldVal.trim()); setNewGoldVal(''); setNewGoldLabel(''); }
          }} disabled={!newGoldVal.trim()}><Plus className="h-3 w-3" /></Button>
        </div>
      </DesignSubSection>

      {/* Karats */}
      <DesignSubSection title="Karats" enabled={karatOn} onToggleSection={props.onToggleKaratSection}>
        {hint}
        <DesignOptionList
          items={Object.keys(props.selectedKarats || {})}
          icon={<CircleDot className="w-5 h-5 text-muted-foreground shrink-0" />}
          notes={notes.karat}
          selected={props.selectedKarats}
          onToggle={props.onToggleKarat}
          onRemove={props.onRemoveKarat}
          onReorder={props.onReorderKarats}
          onNoteChange={noteHandler('karat')}
        />
        <div className="flex gap-1.5 mt-1">
          <Input value={newKarat} onChange={e => setNewKarat(e.target.value)} placeholder="Add karat..." className="h-7 text-[11px]" maxLength={20}
            onKeyDown={e => { if (e.key === 'Enter' && newKarat.trim()) { props.onAddKarat?.(newKarat.trim()); setNewKarat(''); } }} />
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => { if (newKarat.trim()) { props.onAddKarat?.(newKarat.trim()); setNewKarat(''); } }} disabled={!newKarat.trim()}>
            <Plus className="h-3 w-3" /></Button>
        </div>
      </DesignSubSection>

      {/* Diamond Quality */}
      <DesignSubSection title="Diamond Quality" enabled={dqOn} onToggleSection={props.onToggleDiamondQualitySection}>
        {hint}
        <DesignOptionList
          items={Object.keys(props.selectedDiamondQualities || {})}
          icon={<Sparkles className="w-5 h-5 text-muted-foreground shrink-0" />}
          notes={notes.diamond_quality}
          selected={props.selectedDiamondQualities}
          onToggle={props.onToggleDiamondQuality}
          onRemove={props.onRemoveDiamondQuality}
          onReorder={props.onReorderDiamondQualities}
          onNoteChange={noteHandler('diamond_quality')}
        />
        <div className="flex gap-1.5 mt-1">
          <Input value={newDQ} onChange={e => setNewDQ(e.target.value)} placeholder="Add quality..." className="h-7 text-[11px]" maxLength={30}
            onKeyDown={e => { if (e.key === 'Enter' && newDQ.trim()) { props.onAddDiamondQuality?.(newDQ.trim()); setNewDQ(''); } }} />
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => { if (newDQ.trim()) { props.onAddDiamondQuality?.(newDQ.trim()); setNewDQ(''); } }} disabled={!newDQ.trim()}>
            <Plus className="h-3 w-3" /></Button>
        </div>
      </DesignSubSection>

      {/* Diamond Setup */}
      <DesignSubSection title="Diamond Setup" enabled={dsOn} onToggleSection={props.onToggleDiamondSetupSection}>
        {hint}
        <DesignOptionList
          items={Object.keys(props.selectedDiamondSetups || {})}
          icon={<Diamond className="w-5 h-5 text-muted-foreground shrink-0" />}
          notes={notes.diamond_setup}
          selected={props.selectedDiamondSetups}
          onToggle={props.onToggleDiamondSetup}
          onRemove={props.onRemoveDiamondSetup}
          onReorder={props.onReorderDiamondSetups}
          onNoteChange={noteHandler('diamond_setup')}
        />
        <div className="flex gap-1.5 mt-1">
          <Input value={newDS} onChange={e => setNewDS(e.target.value)} placeholder="Add setup..." className="h-7 text-[11px]" maxLength={30}
            onKeyDown={e => { if (e.key === 'Enter' && newDS.trim()) { props.onAddDiamondSetup?.(newDS.trim()); setNewDS(''); } }} />
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => { if (newDS.trim()) { props.onAddDiamondSetup?.(newDS.trim()); setNewDS(''); } }} disabled={!newDS.trim()}>
            <Plus className="h-3 w-3" /></Button>
        </div>
      </DesignSubSection>
    </div>
  );
}

function SortableBudgetRow({
  item,
  enabled,
  onToggle,
  onRemove,
}: {
  item: string;
  enabled: boolean;
  onToggle: () => void;
  onRemove?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}
      className="flex items-center gap-1.5 px-1.5 py-1 rounded-md border border-border/40 bg-card/60">
      <button type="button" {...attributes} {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none">
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <Button type="button" variant={enabled ? 'default' : 'outline'} size="sm"
        className="h-6 text-[11px] px-2 flex-1 justify-start"
        onClick={onToggle}>{item}</Button>
      {onRemove && (
        <button type="button" onClick={onRemove}
          className="text-muted-foreground hover:text-destructive p-0.5" title="Remove">
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function ChipListEditor({
  title,
  emptyText,
  placeholder,
  selected,
  onToggle,
  onAdd,
  onReorder,
  onRemove,
  sectionEnabled = true,
  onToggleSection,
}: {
  title: string;
  emptyText: string;
  placeholder: string;
  selected: Record<string, boolean>;
  onToggle?: (key: string) => void;
  onAdd?: (value: string) => void;
  onReorder?: (order: string[]) => void;
  onRemove?: (key: string) => void;
  sectionEnabled?: boolean;
  onToggleSection?: () => void;
}) {
  const [newVal, setNewVal] = useState('');
  const items = Object.keys(selected || {});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = items.indexOf(String(active.id));
    const newIndex = items.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(items, oldIndex, newIndex);
    onReorder?.(next);
  };

  const tryAdd = () => {
    const v = newVal.trim();
    if (!v) return;
    if (v in (selected || {})) {
      // silent no-op guard — avoid duplicates
      setNewVal('');
      return;
    }
    onAdd?.(v);
    setNewVal('');
  };

  const dim = onToggleSection && !sectionEnabled;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-[11px] text-muted-foreground font-medium">{title}</Label>
        {onToggleSection && (
          <Switch checked={sectionEnabled} onCheckedChange={onToggleSection} className="scale-75" />
        )}
      </div>
      <div className={dim ? 'opacity-40 pointer-events-none space-y-2' : 'space-y-2'}>
        <p className="text-[10px] text-muted-foreground">Drag to reorder. Click to enable/disable on the widget.</p>
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">{emptyText}</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-1">
                {items.map(item => (
                  <SortableBudgetRow key={item} item={item} enabled={!!selected[item]}
                    onToggle={() => onToggle?.(item)}
                    onRemove={onRemove ? () => onRemove(item) : undefined} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
        <div className="flex gap-1.5">
          <Input value={newVal} onChange={e => setNewVal(e.target.value)} placeholder={placeholder} className="h-7 text-[11px]" maxLength={50}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); tryAdd(); } }} />
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={tryAdd} disabled={!newVal.trim()}>
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function BudgetDesignEditor(props: CustomEnquiryStepEditorProps) {
  const budgetOn = props.budgetSectionEnabled !== false;
  const timelineOn = props.timelineSectionEnabled !== false;
  return (
    <div className="space-y-4">
      <ChipListEditor
        title="Budget Ranges"
        emptyText="No budget ranges yet."
        placeholder="Add budget range..."
        selected={props.selectedBudgets || {}}
        onToggle={props.onToggleBudget}
        onAdd={props.onAddBudget}
        onReorder={props.onReorderBudgets}
        onRemove={props.onRemoveBudget}
        sectionEnabled={budgetOn}
        onToggleSection={props.onToggleBudgetSection}
      />
      <div className="border-t border-border/30" />
      <ChipListEditor
        title="Timeline Options"
        emptyText="No timeline options yet."
        placeholder="Add timeline option..."
        selected={props.selectedTimelines || {}}
        onToggle={props.onToggleTimeline}
        onAdd={props.onAddTimeline}
        onReorder={props.onReorderTimelines}
        onRemove={props.onRemoveTimeline}
        sectionEnabled={timelineOn}
        onToggleSection={props.onToggleTimelineSection}
      />
    </div>
  );
}

function QuestionsEditor(props: CustomEnquiryStepEditorProps) {
  const { defaultQuestions = [], enabledQuestions = {}, requiredQuestions = {} } = props;
  return (
    <div className="space-y-1.5">
      {defaultQuestions.map(q => (
        <div key={q.key} className="flex items-center justify-between p-2 rounded-lg border border-border/30 bg-card/50">
          <span className="text-[11px] text-foreground flex-1">{q.text}</span>
          <div className="flex items-center gap-2 shrink-0">
            <label className="flex items-center gap-1 cursor-pointer">
              <span className="text-[10px] text-muted-foreground">Req</span>
              <Switch checked={requiredQuestions[q.key] ?? false} onCheckedChange={checked => props.onToggleRequired?.(q.key, checked)}
                disabled={!(enabledQuestions[q.key] ?? true)} className="scale-[0.6]" />
            </label>
            <Switch checked={enabledQuestions[q.key] ?? true} onCheckedChange={checked => props.onToggleQuestion?.(q.key, checked)} className="scale-[0.6]" />
          </div>
        </div>
      ))}
    </div>
  );
}
