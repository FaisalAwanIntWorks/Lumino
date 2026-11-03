import { useState } from 'react';
import { RingShape, ShapeOption } from '@/types/ring-builder';
import { MOCK_SHAPES } from '@/data/ring-builder-mock';
import { StepHeader } from './StepHeader';
import { Check, Info } from 'lucide-react';
import { useWidgetTheme } from '@/contexts/WidgetThemeContext';
import { TwentyFourKCardGrid } from '../twentyfourk/TwentyFourKCardGrid';

import { ShapeIcon } from '@/components/common/ShapeIcon';
import { ShapeInfoDialog } from '../ShapeInfoDialog';
import { useIsDarkBackground } from '@/hooks/useIsDarkBackground';

interface ShapeStepProps {
  selected: RingShape | null;
  onSelect: (shape: RingShape) => void;
  options?: ShapeOption[];
}

export const ShapeStep = ({ selected, onSelect, options }: ShapeStepProps) => {
  const shapes = options || MOCK_SHAPES;
  const { theme } = useWidgetTheme();
  const isDark = useIsDarkBackground();
  const iconVariant = isDark ? 'white-bg' : 'transparent';
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [selectedShapeInfo, setSelectedShapeInfo] = useState<ShapeOption | null>(null);

  const handleInfoClick = (e: React.MouseEvent, shape: ShapeOption) => {
    e.stopPropagation();
    setSelectedShapeInfo(shape);
    setInfoDialogOpen(true);
  };

  // 24k Carat Jewelers exclusive theme — horizontal cards on light surface.
  if (theme === 'twentyfourk') {
    return (

      <div className="relative">
        <TwentyFourKCardGrid
          items={shapes}
          selectedId={selected}
          onSelect={(s: ShapeOption) => onSelect(s.id as RingShape)}
          onInfo={(s: ShapeOption) => {
            setSelectedShapeInfo(s);
            setInfoDialogOpen(true);
          }}
          renderVisual={(s: ShapeOption) => (
            <div className="w-16 h-16 flex items-center justify-center">
              <ShapeIcon shapeId={s.id} size="md" variant="transparent" />
            </div>
          )}
        />
        <ShapeInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} shape={selectedShapeInfo} />
      </div>
    );
  }

  // UI Option 4: Elegant Gold

  if (theme === 'elegant') {
    return (
      <div className="relative p-1 md:p-3">
        <StepHeader description="Select the cut that captures your unique style" />
        {/* Mobile: compact 3-col grid */}
        <div className="grid grid-cols-3 gap-1.5 max-w-xl mx-auto md:hidden">
          {shapes.map((shape) => {
            const isSelected = selected === shape.id;
            return (
              <div
                key={shape.id}
                onClick={() => onSelect(shape.id as RingShape)}
                className={`relative flex flex-col items-center gap-0.5 p-1.5 cursor-pointer rounded-lg bg-card border-2 transition-all duration-200 shadow-sm hover:shadow-md ${
                  isSelected ? 'border-primary shadow-primary/10' : 'border-transparent hover:border-primary/30'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-1 left-1 w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(to bottom right, hsl(var(--primary)), hsl(var(--primary-gradient-end, var(--primary))))` }}>
                    <Check className="w-2 h-2 text-primary-foreground" />
                  </div>
                )}
                <button onClick={(e) => handleInfoClick(e, shape)} className="absolute top-1 right-1 p-0.5 rounded-full hover:bg-gray-100 transition-colors">
                  <Info className="w-3 h-3 text-gray-400" />
                </button>
                <div className="w-9 h-9 flex items-center justify-center">
                  <ShapeIcon shapeId={shape.id} size="sm" variant={iconVariant} />
                </div>
                <span className="text-[10px] font-medium text-foreground text-center">{shape.name}</span>
              </div>
            );
          })}
        </div>
        {/* Desktop: original 2-col cards */}
        <div className="hidden md:grid grid-cols-2 gap-2 max-w-xl mx-auto">
          {shapes.map((shape) => {
            const isSelected = selected === shape.id;
            return (
              <div
                key={shape.id}
                onClick={() => onSelect(shape.id as RingShape)}
                className={`relative flex flex-col items-center gap-1 p-2.5 cursor-pointer rounded-lg bg-card border-2 transition-all duration-200 shadow-sm hover:shadow-md ${
                  isSelected ? 'border-primary shadow-primary/10' : 'border-transparent hover:border-primary/30'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(to bottom right, hsl(var(--primary)), hsl(var(--primary-gradient-end, var(--primary))))` }}>
                    <Check className="w-2.5 h-2.5 text-primary-foreground" />
                  </div>
                )}
                <button onClick={(e) => handleInfoClick(e, shape)} className="absolute top-1.5 right-1.5 p-0.5 rounded-full hover:bg-gray-100 transition-colors">
                  <Info className="w-3 h-3 text-gray-400" />
                </button>
                <div className="p-1">
                  <ShapeIcon shapeId={shape.id} size="lg" variant={iconVariant} />
                </div>
                <span className="text-xs font-medium text-foreground text-center">{shape.name}</span>
              </div>
            );
          })}
        </div>
        <ShapeInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} shape={selectedShapeInfo} theme={theme} />
      </div>
    );
  }

  // UI Option 1: Luxury — unified clean list
  if (theme === 'luxury') {
    return (
      <div className="relative p-1 md:p-4">
        <StepHeader description="Select the cut that captures your unique style" />
        {/* Mobile: compact 3-col grid */}
        <div className="grid grid-cols-3 gap-1.5 max-w-xl mx-auto md:hidden">
          {shapes.map((shape) => {
            const isSelected = selected === shape.id;
            return (
              <div
                key={shape.id}
                onClick={() => onSelect(shape.id as RingShape)}
                className={`relative flex flex-col items-center gap-0.5 p-1.5 cursor-pointer rounded-lg border transition-all duration-200 ${
                  isSelected ? 'border-foreground/40 bg-white/[0.06]' : 'border-transparent hover:bg-muted/30'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-1 left-1">
                    <Check className="w-3 h-3 text-foreground" />
                  </div>
                )}
                <button onClick={(e) => handleInfoClick(e, shape)} className="absolute top-1 right-1 p-0.5 rounded-full hover:bg-white/10 transition-colors">
                  <Info className="w-3 h-3 text-foreground/70" />
                </button>
                <div className="w-9 h-9 flex items-center justify-center">
                  <ShapeIcon shapeId={shape.id} size="sm" variant={iconVariant} />
                </div>
                <span className={`text-[10px] uppercase tracking-[0.1em] text-center transition-colors ${
                  isSelected ? 'font-bold text-foreground' : 'font-medium text-foreground'
                }`}>
                  {shape.name}
                </span>
              </div>
            );
          })}
        </div>
        {/* Desktop: original list */}
        <div className="hidden md:block max-w-2xl mx-auto">
          {shapes.map((shape, index) => {
            const isSelected = selected === shape.id;
            const isLast = index === shapes.length - 1;
            return (
              <div
                key={shape.id}
                onClick={() => onSelect(shape.id as RingShape)}
                className={`flex items-center gap-3 py-4 px-4 cursor-pointer transition-all duration-200 ${
                  !isLast ? 'border-b border-white/15' : ''
                } ${isSelected ? 'bg-white/[0.06]' : 'hover:bg-muted/30'}`}
              >
                <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
                  <ShapeIcon shapeId={shape.id} size="sm" variant={iconVariant} />
                </div>
                <span className={`flex-1 text-sm uppercase tracking-[0.15em] transition-colors ${
                  isSelected ? 'font-bold text-foreground' : 'font-medium text-foreground'
                }`}>
                  {shape.name}
                </span>
                {isSelected && (
                  <Check className="w-4 h-4 text-foreground flex-shrink-0" />
                )}
                <button
                  type="button"
                  onClick={(e) => handleInfoClick(e, shape)}
                  className="w-7 h-7 flex items-center justify-center flex-shrink-0 hover:bg-white/10 rounded-full transition-colors"
                >
                  <Info className="w-3.5 h-3.5 text-foreground/70" />
                </button>
              </div>
            );
          })}
        </div>
        <ShapeInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} shape={selectedShapeInfo} theme={theme} />
      </div>
    );
  }

  // UI Option 2: Modern (compact on mobile)
  return (
    <div className="relative p-1 md:p-6">
      <StepHeader description="Select the cut that captures your unique style" />
      {/* Mobile: compact 3-col grid */}
      <div className="grid grid-cols-3 gap-1.5 max-w-xl mx-auto md:hidden">
        {shapes.map((shape) => {
          const isSelected = selected === shape.id;
          return (
            <div
              key={shape.id}
              onClick={() => onSelect(shape.id as RingShape)}
              className={`relative flex flex-col items-center gap-0.5 p-1.5 cursor-pointer rounded-lg border transition-all duration-200 ${
                isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/50 hover:bg-muted/30'
              }`}
            >
              {isSelected && (
                <div className="absolute top-1 left-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-primary-foreground" />
                </div>
              )}
              <button onClick={(e) => handleInfoClick(e, shape)} className="absolute top-1 right-1 p-0.5 rounded-full hover:bg-muted transition-colors">
                <Info className="w-3 h-3 text-muted-foreground" />
              </button>
              <div className="w-9 h-9 flex items-center justify-center">
                <ShapeIcon shapeId={shape.id} size="sm" variant={iconVariant} />
              </div>
              <span className={`text-[10px] font-medium text-center transition-colors ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                {shape.name}
              </span>
            </div>
          );
        })}
      </div>
      {/* Desktop: cards */}
      <div className="hidden md:grid grid-cols-3 gap-3 max-w-xl mx-auto">
        {shapes.map((shape) => {
          const isSelected = selected === shape.id;
          return (
            <div
              key={shape.id}
              onClick={() => onSelect(shape.id as RingShape)}
              className={`relative flex flex-col items-center gap-2 p-4 cursor-pointer rounded-lg border transition-all duration-200 ${
                isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/50 hover:bg-muted/30'
              }`}
            >
              {isSelected && (
                <div className="absolute top-1.5 left-1.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-primary-foreground" />
                </div>
              )}
              <button onClick={(e) => handleInfoClick(e, shape)} className="absolute top-1.5 right-1.5 p-0.5 rounded-full hover:bg-muted transition-colors">
                <Info className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <div className={`relative p-3 rounded-full transition-colors ${isSelected ? 'bg-primary/10' : 'bg-muted/50'}`}>
                <ShapeIcon shapeId={shape.id} size="lg" variant={iconVariant} />
              </div>
              <span className={`text-xs font-medium text-center transition-colors ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                {shape.name}
              </span>
            </div>
          );
        })}
      </div>
      <ShapeInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} shape={selectedShapeInfo} theme={theme} />
    </div>
  );
};
