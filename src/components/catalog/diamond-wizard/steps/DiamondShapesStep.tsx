import { Check } from "lucide-react";
import { ShapeIcon } from "@/components/common/ShapeIcon";
import type { DiamondWizardState } from '../types';
import { DIAMOND_SHAPES } from '../defaults';
import { isRingOsCatalogShape } from '@/lib/ring-os-catalog-shapes';

interface Props {
  state: DiamondWizardState;
  onChange: (state: DiamondWizardState) => void;
  availableShapes?: string[];
}

export function DiamondShapesStep({ state, onChange, availableShapes }: Props) {
  const { selectedShapes } = state.shapes;
  // Ring OS stays on its eight shapes. The pool now holds more (Asscher, Heart,
  // Old Miner, European Cut, Rose Cut, Square …), but those are for the Quote
  // Estimator V3 picker only and are never offered to a Ring OS catalogue.
  const mergedShapes: Array<{ id: string; name: string }> = DIAMOND_SHAPES.filter(s => isRingOsCatalogShape(s.id));

  // Filter to only show shapes the client selected during ring configuration
  const displayedShapes = availableShapes && availableShapes.length > 0
    ? mergedShapes.filter(s => availableShapes.includes(s.id))
    : mergedShapes;

  const toggleShape = (shapeId: string) => {
    const shapes = selectedShapes.includes(shapeId)
      ? selectedShapes.filter(s => s !== shapeId)
      : [...selectedShapes, shapeId];
    onChange({ ...state, shapes: { selectedShapes: shapes } });
  };

  const selectAll = () => {
    onChange({ ...state, shapes: { selectedShapes: displayedShapes.map(s => s.id) } });
  };

  const clearAll = () => {
    onChange({ ...state, shapes: { selectedShapes: [] } });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">What diamond shapes do you offer?</h3>
          <p className="text-sm text-muted-foreground">Select at least one shape to continue.</p>
        </div>
        <div className="flex gap-2 text-sm">
          <button onClick={selectAll} className="text-primary hover:underline">Select All</button>
          <span className="text-muted-foreground">|</span>
          <button onClick={clearAll} className="text-muted-foreground hover:underline">Clear All</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {displayedShapes.map(shape => {
          const selected = selectedShapes.includes(shape.id);
          return (
            <button
              key={shape.id}
              onClick={() => toggleShape(shape.id)}
              className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                selected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                  : 'border-border hover:border-primary/40 bg-card'
              }`}
            >
              {selected && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                  <Check className="w-3 h-3 text-primary-foreground" />
                </div>
              )}
              <ShapeIcon shapeId={shape.id} size="lg" />
              <span className="text-sm font-medium">{shape.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
