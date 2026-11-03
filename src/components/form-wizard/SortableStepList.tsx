import { useState } from 'react';
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
import { GripVertical } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface SortableStep {
  key: string;
  label: string;
}

interface SortableStepListProps {
  steps: SortableStep[];
  order: string[];
  onOrderChange: (newOrder: string[]) => void;
  enabledSteps: Record<string, boolean>;
  onToggleStep: (key: string, enabled: boolean) => void;
  stepLabels?: Record<string, { title?: string; subtitle?: string }>;
  onStepLabelChange?: (key: string, field: 'title' | 'subtitle', value: string) => void;
}

function SortableItem({
  step,
  isEnabled,
  onToggle,
  stepLabel,
  onLabelChange,
}: {
  step: SortableStep;
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  stepLabel?: { title?: string; subtitle?: string };
  onLabelChange?: (field: 'title' | 'subtitle', value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-lg border border-border/50 bg-card/50 overflow-hidden"
    >
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground transition-colors"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="text-sm text-foreground text-left flex-1 hover:text-primary transition-colors"
          onClick={() => onLabelChange && setExpanded(prev => !prev)}
        >
          {step.label}
          {stepLabel?.title && (
            <span className="text-xs text-muted-foreground ml-2">(customized)</span>
          )}
        </button>
        <Switch checked={isEnabled} onCheckedChange={onToggle} />
      </div>
      {expanded && onLabelChange && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/30 pt-2">
          <div>
            <Label className="text-xs text-muted-foreground">Custom Title</Label>
            <Input
              value={stepLabel?.title || ''}
              onChange={e => onLabelChange('title', e.target.value)}
              placeholder="Leave blank for default"
              maxLength={100}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Custom Subtitle</Label>
            <Input
              value={stepLabel?.subtitle || ''}
              onChange={e => onLabelChange('subtitle', e.target.value)}
              placeholder="Leave blank for default"
              maxLength={200}
              className="h-8 text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function SortableStepList({
  steps,
  order,
  onOrderChange,
  enabledSteps,
  onToggleStep,
  stepLabels,
  onStepLabelChange,
}: SortableStepListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Sort steps by order
  const sortedSteps = [...steps].sort((a, b) => {
    const ai = order.indexOf(a.key);
    const bi = order.indexOf(b.key);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortedSteps.findIndex(s => s.key === active.id);
    const newIndex = sortedSteps.findIndex(s => s.key === over.id);
    const reordered = arrayMove(sortedSteps, oldIndex, newIndex);
    onOrderChange(reordered.map(s => s.key));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={sortedSteps.map(s => s.key)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {sortedSteps.map(step => (
            <SortableItem
              key={step.key}
              step={step}
              isEnabled={enabledSteps[step.key] !== false}
              onToggle={enabled => onToggleStep(step.key, enabled)}
              stepLabel={stepLabels?.[step.key]}
              onLabelChange={onStepLabelChange ? (field, value) => onStepLabelChange(step.key, field, value) : undefined}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
