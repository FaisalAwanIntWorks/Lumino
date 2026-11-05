import { useState } from 'react';
import { fallbackToPngOnError } from '@/lib/webp-image-fallback';
import { RingStyle, StyleOption } from '@/types/ring-builder';
import { MOCK_STYLES } from '@/data/ring-builder-mock';
import { Info, ChevronRight, Check } from 'lucide-react';
import { StepHeader } from './StepHeader';
import { StyleInfoDialog } from '../StyleInfoDialog';
import { useWidgetTheme } from '@/contexts/WidgetThemeContext';
import { TwentyFourKCardGrid } from '../twentyfourk/TwentyFourKCardGrid';
import { ASSET_CDN } from "@/lib/asset-cdn";


interface StyleStepProps {
  selected: RingStyle | null;
  onSelect: (style: RingStyle) => void;
  options?: StyleOption[];
}

// Sketches are served as WebP; every <img> showing one falls back to the .png twin on error.
const STYLE_IMAGES: Record<string, string> = {
  'solitaire': `${ASSET_CDN.main}/JewlxRingsSketches/Solitaire.webp`,
  'three-stone': `${ASSET_CDN.main}/JewlxRingsSketches/Three+stone.webp`,
  'halo': `${ASSET_CDN.main}/JewlxRingsSketches/Halo.webp`,
  'pave-rail': `${ASSET_CDN.main}/JewlxRingsSketches/Pave+Rail.webp`,
};

export const StyleStep = ({ selected, onSelect, options }: StyleStepProps) => {
  const styles = options || MOCK_STYLES;
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [selectedStyleInfo, setSelectedStyleInfo] = useState<StyleOption | null>(null);
  const { theme } = useWidgetTheme();

  const handleInfoClick = (e: React.MouseEvent, style: StyleOption) => {
    e.stopPropagation();
    setSelectedStyleInfo(style);
    setInfoDialogOpen(true);
  };

  // 24k Carat Jewelers exclusive theme — horizontal cards, no header.
  if (theme === 'twentyfourk') {
    return (

      <div className="relative">
        <TwentyFourKCardGrid
          items={styles}
          selectedId={selected}
          onSelect={(s: StyleOption) => onSelect(s.id as RingStyle)}
          onInfo={(s: StyleOption) => {
            setSelectedStyleInfo(s);
            setInfoDialogOpen(true);
          }}
          renderVisual={(s: StyleOption) => {
            const img = STYLE_IMAGES[s.id];
            return img ? (
              <img src={img} alt={s.name} className="max-h-[110px] max-w-full object-contain" onError={fallbackToPngOnError} />
            ) : (
              <div className="w-full h-[80px] flex items-center justify-center text-[#9A9A9A] text-xs">?</div>
            );
          }}
        />
        <StyleInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} style={selectedStyleInfo} />
      </div>
    );
  }

  // UI Option 4: Elegant Gold

  if (theme === 'elegant') {
    return (
      <div className="relative p-1 md:p-3">
        <StepHeader description="Choose the foundation for your masterpiece" />
      {/* Mobile: compact 2-col grid */}
      <div className="grid grid-cols-2 gap-2 max-w-xl mx-auto md:hidden">
          {styles.map((style) => {
            const styleImage = STYLE_IMAGES[style.id];
            const isSelected = selected === style.id;
            return (
              <div
                key={style.id}
                onClick={() => onSelect(style.id as RingStyle)}
                className={`relative flex flex-col items-center p-1 pb-1 cursor-pointer rounded-lg bg-card border-2 transition-all duration-200 shadow-sm hover:shadow-md ${
                  isSelected ? 'border-primary shadow-primary/10' : 'border-transparent hover:border-primary/30'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-1 left-1 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(to bottom right, hsl(var(--primary)), hsl(var(--primary-gradient-end, var(--primary))))` }}>
                    <Check className="w-2.5 h-2.5 text-primary-foreground" />
                  </div>
                )}
                <button onClick={(e) => handleInfoClick(e, style)} className="absolute top-1 right-1 p-0.5 rounded-full hover:bg-gray-100 transition-colors">
                  <Info className="w-3 h-3 text-gray-400" />
                </button>
                {styleImage ? (
                  <img src={styleImage} alt={style.name} className="w-full max-h-[10vh] object-contain" onError={fallbackToPngOnError} />
                ) : (
                  <div className="w-full h-[10vh] bg-gray-50 flex items-center justify-center text-gray-300 text-xs">?</div>
                )}
                <span className="text-xs font-medium text-foreground text-center mt-2">{style.name}</span>
              </div>
            );
          })}
        </div>
        {/* Desktop: original 2-col cards */}
        <div className="hidden md:grid grid-cols-2 gap-2 max-w-xl mx-auto">
          {styles.map((style) => {
            const styleImage = STYLE_IMAGES[style.id];
            const isSelected = selected === style.id;
            return (
              <div
                key={style.id}
                onClick={() => onSelect(style.id as RingStyle)}
                className={`relative flex flex-col items-center gap-1 p-2 cursor-pointer rounded-lg bg-card border-2 transition-all duration-200 shadow-sm hover:shadow-md ${
                  isSelected ? 'border-primary shadow-primary/10' : 'border-transparent hover:border-primary/30'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(to bottom right, hsl(var(--primary)), hsl(var(--primary-gradient-end, var(--primary))))` }}>
                    <Check className="w-2.5 h-2.5 text-primary-foreground" />
                  </div>
                )}
                <button onClick={(e) => handleInfoClick(e, style)} className="absolute top-1.5 right-1.5 p-0.5 rounded-full hover:bg-gray-100 transition-colors">
                  <Info className="w-3 h-3 text-gray-400" />
                </button>
                {styleImage ? (
                  <img src={styleImage} alt={style.name} className="w-full max-h-[70px] object-contain" onError={fallbackToPngOnError} />
                ) : (
                  <div className="w-full h-[70px] bg-gray-50 flex items-center justify-center text-gray-300 text-xs">?</div>
                )}
                <span className="text-xs font-medium text-foreground text-center">{style.name}</span>
              </div>
            );
          })}
        </div>
        <StyleInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} style={selectedStyleInfo} />
      </div>
    );
  }

  // UI Option 1: Luxury - 2x2 Grid Layout
  if (theme === 'luxury') {
    return (
      <div className="relative p-1 md:p-4">
        <StepHeader 
          description="Choose the foundation for your masterpiece"
        />
        <div className="grid grid-cols-2 gap-2 max-w-2xl mx-auto">
          {styles.map((style) => {
            const styleImage = STYLE_IMAGES[style.id];
            const isSelected = selected === style.id;
            
            return (
              <div
                key={style.id}
                onClick={() => onSelect(style.id as RingStyle)}
                className={`relative flex flex-col items-center p-1 pb-1 cursor-pointer border border-white/15 overflow-hidden transition-all duration-200 ${
                  isSelected ? 'bg-white/[0.06]' : 'hover:bg-muted/30'
                }`}
              >
                {/* Info Button - Top Right */}
                <button 
                  onClick={(e) => handleInfoClick(e, style)}
                  className="absolute top-2 right-2 p-1 hover:bg-white/10 transition-colors z-10"
                >
                  <Info className="w-3.5 h-3.5 text-muted-foreground" />
                </button>

                {/* Style Image */}
                {styleImage ? (
                  <img 
                    src={styleImage} 
                    alt={style.name}
                    className="w-full max-h-[10vh] md:max-h-[160px] object-contain"
                    onError={fallbackToPngOnError}
                  />
                ) : (
                  <div className="w-full max-h-[10vh] md:max-h-[160px] bg-muted/50 flex items-center justify-center text-muted-foreground text-xs">
                    ?
                  </div>
                )}

                {/* Style Name */}
                <span className={`text-xs uppercase tracking-[0.18em] mt-2 text-center transition-colors ${
                  isSelected ? 'font-bold text-foreground' : 'font-medium text-foreground'
                }`}>
                  {style.name}
                </span>
              </div>
            );
          })}
        </div>

        <StyleInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} style={selectedStyleInfo} />
      </div>
    );
  }

  // UI Option 2: Modern - Horizontal Cards (compact grid on mobile)
  return (
    <div className="relative p-1 md:p-4">
      <StepHeader 
        description="Choose the foundation for your masterpiece"
      />
      {/* Mobile: compact 2-col grid */}
      <div className="grid grid-cols-2 gap-2 max-w-xl mx-auto md:hidden">
        {styles.map((style) => {
          const styleImage = STYLE_IMAGES[style.id];
          const isSelected = selected === style.id;
          return (
            <div
              key={style.id}
              onClick={() => onSelect(style.id as RingStyle)}
              className={`relative flex flex-col items-center p-1 pb-1 cursor-pointer rounded-lg border transition-all duration-200 ${
                isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/50 hover:bg-muted/30'
              }`}
            >
              <button onClick={(e) => handleInfoClick(e, style)} className="absolute top-1.5 right-1.5 p-0.5 rounded-full hover:bg-muted transition-colors">
                <Info className="w-3 h-3 text-muted-foreground" />
              </button>
              {isSelected && (
                <div className="absolute top-1.5 left-1.5 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-primary-foreground" />
                </div>
              )}
              {styleImage ? (
                <img src={styleImage} alt={style.name} className="w-full max-h-[10vh] object-contain" onError={fallbackToPngOnError} />
              ) : (
                <div className="w-full h-[10vh] bg-muted/50 flex items-center justify-center text-muted-foreground text-xs">?</div>
              )}
              <span className={`text-xs font-semibold mt-2 text-center transition-colors ${isSelected ? 'text-primary' : 'text-foreground'}`}>{style.name}</span>
            </div>
          );
        })}
      </div>

      {/* Desktop: horizontal cards */}
      <div className="hidden md:flex flex-col gap-3 max-w-xl mx-auto">
        {styles.map((style) => {
          const styleImage = STYLE_IMAGES[style.id];
          const isSelected = selected === style.id;
          return (
            <div
              key={style.id}
              onClick={() => onSelect(style.id as RingStyle)}
              className={`flex items-center gap-4 p-4 cursor-pointer rounded-lg border transition-all duration-200 ${
                isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/50 hover:bg-muted/30'
              }`}
            >
              <div className="flex-shrink-0">
                {styleImage ? (
                  <img src={styleImage} alt={style.name} className="w-20 h-20 object-contain rounded-md" onError={fallbackToPngOnError} />
                ) : (
                  <div className="w-20 h-20 bg-muted/50 rounded-md flex items-center justify-center text-muted-foreground text-xs">?</div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`text-sm font-semibold transition-colors ${isSelected ? 'text-primary' : 'text-foreground'}`}>{style.name}</h3>
                {style.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{style.description}</p>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={(e) => handleInfoClick(e, style)} className="p-1.5 rounded-full hover:bg-muted transition-colors">
                  <Info className="w-4 h-4 text-muted-foreground" />
                </button>
                <ChevronRight className={`w-5 h-5 transition-colors ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
            </div>
          );
        })}
      </div>

      <StyleInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} style={selectedStyleInfo} />
    </div>
  );
};
