import { cn } from '@/lib/utils';

export interface MetalColor {
  name: string;
  color: string;
  displayColor: string;
}

export const METAL_COLORS: MetalColor[] = [
  { name: 'Yellow Gold', color: '#FFD700', displayColor: '#FFD700' },
  { name: 'Rose Gold', color: '#E8B4B4', displayColor: '#B76E79' },
  { name: 'White Gold', color: '#E8E8E8', displayColor: '#C0C0C0' },
  { name: 'Platinum', color: '#E5E4E2', displayColor: '#A9A9A9' },
];

interface ColorSelectorProps {
  selectedColor: string;
  onColorChange: (color: string) => void;
  className?: string;
}

export function ColorSelector({ selectedColor, onColorChange, className }: ColorSelectorProps) {
  return (
    <div className={cn(
      "flex items-center gap-3 bg-black/60 backdrop-blur-md rounded-full px-4 py-3",
      className
    )}>
      <span className="text-white/70 text-sm font-medium mr-1">Metal:</span>
      {METAL_COLORS.map((metal) => (
        <button
          key={metal.name}
          onClick={() => onColorChange(metal.color)}
          className={cn(
            "w-8 h-8 rounded-full border-2 transition-all duration-200 hover:scale-110",
            selectedColor === metal.color 
              ? "border-white ring-2 ring-white/50 scale-110" 
              : "border-white/30 hover:border-white/60"
          )}
          style={{ backgroundColor: metal.displayColor }}
          title={metal.name}
          aria-label={`Select ${metal.name}`}
        />
      ))}
    </div>
  );
}
