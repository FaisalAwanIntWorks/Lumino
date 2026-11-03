import { useState } from 'react';
import { fallbackToPngOnError } from '@/lib/webp-image-fallback';
import { RingShank, ShankOption } from '@/types/ring-builder';
import { MOCK_SHANKS } from '@/data/ring-builder-mock';
import { StepHeader } from './StepHeader';
import { Info, ChevronRight, Check } from 'lucide-react';
import { ShankInfoDialog } from '../ShankInfoDialog';
import { useWidgetTheme } from '@/contexts/WidgetThemeContext';
import { TwentyFourKCardGrid } from '../twentyfourk/TwentyFourKCardGrid';


// Sketches are served as WebP; every <img> showing one falls back to the .png twin on error.
const SHANK_IMAGES: Record<string, string> = {
  'high-polish': 'https://d2lo9ju43icaaa.cloudfront.net/JewlxRingsSketches/High-polish-icon.webp',
  'castel-pave': 'https://d2lo9ju43icaaa.cloudfront.net/JewlxRingsSketches/Castel+Pave-icon.webp',
  '3-row-pave': 'https://d2lo9ju43icaaa.cloudfront.net/JewlxRingsSketches/3+row+pave-icon.webp',
  'tapered': 'https://d2lo9ju43icaaa.cloudfront.net/JewlxRingsSketches/Tapered.webp',
  'eternity': 'https://d2lo9ju43icaaa.cloudfront.net/JewlxRingsSketches/Eternity.webp',
  'marquise-cut': 'https://d2lo9ju43icaaa.cloudfront.net/JewlxRingsSketches/Marquise+.webp',
};

interface ShankStepProps {
  selected: RingShank | null;
  onSelect: (shank: RingShank) => void;
  options?: ShankOption[];
}

export const ShankStep = ({ selected, onSelect, options }: ShankStepProps) => {
  const shanks = options || MOCK_SHANKS;
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [selectedShankInfo, setSelectedShankInfo] = useState<ShankOption | null>(null);
  const { theme } = useWidgetTheme();

  const handleInfoClick = (e: React.MouseEvent, shank: ShankOption) => {
    e.stopPropagation();
    setSelectedShankInfo(shank);
    setInfoDialogOpen(true);
  };

  // 24k Carat Jewelers exclusive theme — horizontal cards on light surface.
  if (theme === 'twentyfourk') {
    return (

      <div className="relative">
        <TwentyFourKCardGrid
          items={shanks}
          selectedId={selected}
          onSelect={(s: ShankOption) => onSelect(s.id as RingShank)}
          onInfo={(s: ShankOption) => {
            setSelectedShankInfo(s);
            setInfoDialogOpen(true);
          }}
          renderVisual={(s: ShankOption) => {
            const img = SHANK_IMAGES[s.id];
            return img ? (
              <img src={img} alt={s.name} className="max-h-[100px] max-w-full object-contain" onError={fallbackToPngOnError} />
            ) : (
              <div className="w-full h-[80px] flex items-center justify-center text-[#9A9A9A] text-xs">?</div>
            );
          }}
        />
        <ShankInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} shank={selectedShankInfo} />
      </div>
    );
  }

  // UI Option 4: Elegant Gold

  if (theme === 'elegant') {
    return (
      <div className="relative p-1 md:p-3">
        <StepHeader description="Select the band design that complements your setting" />
        {/* Mobile: compact 3-col grid */}
        <div className="grid grid-cols-3 gap-2 max-w-xl mx-auto md:hidden">
          {shanks.map((shank) => {
            const isSelected = selected === shank.id;
            const shankImage = SHANK_IMAGES[shank.id];
            return (
              <div
                key={shank.id}
                onClick={() => onSelect(shank.id as RingShank)}
                className={`relative flex flex-col items-center p-1 pb-1 cursor-pointer rounded-lg bg-card border-2 transition-all duration-200 shadow-sm hover:shadow-md ${
                  isSelected ? 'border-primary shadow-primary/10' : 'border-transparent hover:border-primary/30'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-1 left-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(to bottom right, hsl(var(--primary)), hsl(var(--primary-gradient-end, var(--primary))))` }}>
                    <Check className="w-2.5 h-2.5 text-primary-foreground" />
                  </div>
                )}
                <button type="button" onClick={(e) => handleInfoClick(e, shank)} className="absolute top-1 right-1 p-0.5 rounded-full hover:bg-gray-100 transition-colors">
                  <Info className="w-3 h-3 text-gray-400" />
                </button>
                {shankImage && (
                  <img src={shankImage} alt={shank.name} className="w-full max-h-[10vh] object-contain" onError={fallbackToPngOnError} />
                )}
                <span className="text-xs font-medium text-foreground text-center mt-2">{shank.name}</span>
              </div>
            );
          })}
        </div>
        {/* Desktop: original 2-col cards */}
        <div className="hidden md:grid grid-cols-2 gap-2 max-w-xl mx-auto">
          {shanks.map((shank) => {
            const isSelected = selected === shank.id;
            const shankImage = SHANK_IMAGES[shank.id];
            return (
              <div
                key={shank.id}
                onClick={() => onSelect(shank.id as RingShank)}
                className={`relative flex flex-col items-center gap-1 p-2 cursor-pointer rounded-lg bg-card border-2 transition-all duration-200 shadow-sm hover:shadow-md ${
                  isSelected ? 'border-primary shadow-primary/10' : 'border-transparent hover:border-primary/30'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(to bottom right, hsl(var(--primary)), hsl(var(--primary-gradient-end, var(--primary))))` }}>
                    <Check className="w-2.5 h-2.5 text-primary-foreground" />
                  </div>
                )}
                <button type="button" onClick={(e) => handleInfoClick(e, shank)} className="absolute top-1.5 right-1.5 p-0.5 rounded-full hover:bg-gray-100 transition-colors">
                  <Info className="w-3 h-3 text-gray-400" />
                </button>
                {shankImage && (
                  <img src={shankImage} alt={shank.name} className="w-full max-h-[70px] object-contain" onError={fallbackToPngOnError} />
                )}
                <span className="text-xs font-medium text-foreground text-center">{shank.name}</span>
              </div>
            );
          })}
        </div>
        <ShankInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} shank={selectedShankInfo} />
      </div>
    );
  }

  // UI Option 1: Luxury
  if (theme === 'luxury') {
    return (
      <div className="relative p-1 md:p-4">
        <StepHeader 
          description="Select the band design that complements your setting"
        />
        <div className="grid grid-cols-3 gap-2 max-w-xl mx-auto">
          {shanks.map((shank) => {
            const isSelected = selected === shank.id;
            const shankImage = SHANK_IMAGES[shank.id];
            
            return (
              <div
                key={shank.id}
                onClick={() => onSelect(shank.id as RingShank)}
                className={`relative flex flex-col items-center p-1 pb-1 cursor-pointer border border-white/15 overflow-hidden transition-all duration-200 ${
                  isSelected ? 'bg-white/[0.06]' : 'hover:bg-muted/30'
                }`}
              >
                {/* Info Button - Top Right */}
                <button 
                  type="button"
                  aria-label={`More info about ${shank.name} shank`}
                  onPointerDown={(e) => handleInfoClick(e as unknown as React.MouseEvent, shank)}
                  onClick={(e) => handleInfoClick(e, shank)}
                  className="absolute top-2 right-2 p-1 hover:bg-white/10 transition-colors z-20 pointer-events-auto"
                >
                  <Info className="w-3.5 h-3.5 text-muted-foreground" />
                </button>

                {/* Shank Image */}
                {shankImage && (
                  <img 
                    src={shankImage} 
                    alt={shank.name}
                    className="w-full max-h-[10vh] md:max-h-[160px] object-contain"
                    loading="eager"
                    decoding="sync"
                    onError={fallbackToPngOnError}
                  />
                )}

                {/* Shank Name */}
                <h3 className={`text-xs uppercase tracking-[0.18em] mt-2 text-center transition-colors ${
                  isSelected ? 'font-bold text-foreground' : 'font-medium text-foreground'
                }`}>
                  {shank.name}
                </h3>
              </div>
            );
          })}
        </div>

        <ShankInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} shank={selectedShankInfo} />
      </div>
    );
  }

  // UI Option 2: Modern (compact grid on mobile)
  return (
    <div className="relative p-1 md:p-4">
      <StepHeader 
        description="Select the band design that complements your setting"
      />
      {/* Mobile: compact 3-col grid */}
      <div className="grid grid-cols-3 gap-2 max-w-xl mx-auto md:hidden">
        {shanks.map((shank) => {
          const isSelected = selected === shank.id;
          const shankImage = SHANK_IMAGES[shank.id];
          return (
            <div
              key={shank.id}
              onClick={() => onSelect(shank.id as RingShank)}
              className={`relative flex flex-col items-center p-1 pb-1 cursor-pointer rounded-lg border transition-all duration-200 ${
                isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/50 hover:bg-muted/30'
              }`}
            >
              <button type="button" onClick={(e) => handleInfoClick(e, shank)} className="absolute top-1 right-1 p-0.5 rounded-full hover:bg-muted transition-colors">
                <Info className="w-3 h-3 text-muted-foreground" />
              </button>
              {shankImage && (
                <img src={shankImage} alt={shank.name} className="w-full max-h-[10vh] object-contain" onError={fallbackToPngOnError} />
              )}
              <span className={`text-xs font-semibold mt-2 text-center transition-colors ${isSelected ? 'text-primary' : 'text-foreground'}`}>{shank.name}</span>
            </div>
          );
        })}
      </div>

      {/* Desktop: horizontal cards */}
      <div className="hidden md:flex flex-col gap-3 max-w-xl mx-auto">
        {shanks.map((shank) => {
          const isSelected = selected === shank.id;
          const shankImage = SHANK_IMAGES[shank.id];
          return (
            <div
              key={shank.id}
              onClick={() => onSelect(shank.id as RingShank)}
              className={`flex items-center gap-4 p-4 cursor-pointer rounded-lg border transition-all duration-200 ${
                isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/50 hover:bg-muted/30'
              }`}
            >
              <div className="flex-shrink-0">
                {shankImage ? (
                  <img src={shankImage} alt={shank.name} className="w-16 h-16 object-contain rounded-md" onError={fallbackToPngOnError} />
                ) : (
                  <div className="w-16 h-16 bg-muted/50 rounded-md flex items-center justify-center text-muted-foreground text-xs">?</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`text-sm font-semibold transition-colors ${isSelected ? 'text-primary' : 'text-foreground'}`}>{shank.name}</h3>
                {shank.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{shank.description}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button type="button" onClick={(e) => handleInfoClick(e, shank)} className="p-1.5 rounded-full hover:bg-muted transition-colors">
                  <Info className="w-4 h-4 text-muted-foreground" />
                </button>
                <ChevronRight className={`w-5 h-5 transition-colors ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
            </div>
          );
        })}
      </div>

      <ShankInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} shank={selectedShankInfo} />
    </div>
  );
};
