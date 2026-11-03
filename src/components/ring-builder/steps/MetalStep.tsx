import { useState, useMemo, useEffect } from 'react';
import { RingMetal, MetalOption } from '@/types/ring-builder';
import { MOCK_METALS } from '@/data/ring-builder-mock';
import { StepHeader } from './StepHeader';
import { Check, Info } from 'lucide-react';
import { MetalInfoDialog } from '../MetalInfoDialog';
import { useWidgetTheme } from '@/contexts/WidgetThemeContext';
import { getCurrencySymbol } from '@/lib/pricing-utils';

type MetalFamily = 'yellow' | 'white' | 'rose' | 'platinum' | 'silver';

const FAMILY_TABS: { id: MetalFamily; label: string; swatch: string }[] = [
  { id: 'yellow', label: 'Yellow', swatch: '#FFD700' },
  { id: 'rose', label: 'Rose', swatch: '#E8B4B8' },
  { id: 'white', label: 'White', swatch: '#E8E8E8' },
  { id: 'platinum', label: 'Platinum', swatch: '#C0C0C0' },
  { id: 'silver', label: 'Silver', swatch: '#B8B8B8' },
];

const getMetalFamily = (metal: MetalOption): MetalFamily => {
  const name = metal.name.toLowerCase();
  const colorFamily = metal.colorFamily?.toLowerCase() || '';
  if (colorFamily === 'yellow' || name.includes('yellow')) return 'yellow';
  if (colorFamily === 'rose' || name.includes('rose')) return 'rose';
  if (colorFamily === 'platinum' || name.includes('platinum')) return 'platinum';
  if (colorFamily === 'silver' || name.includes('silver')) return 'silver';
  return 'white';
};

const getBadgeColor = (metal: MetalOption): string => {
  const name = metal.name.toLowerCase();
  const colorFamily = metal.colorFamily?.toLowerCase() || '';
  if (colorFamily === 'yellow' || name.includes('yellow')) return '#FFD700';
  if (colorFamily === 'rose' || name.includes('rose')) return '#E8B4B8';
  if (colorFamily === 'platinum' || name.includes('platinum')) return '#C0C0C0';
  if (colorFamily === 'silver' || name.includes('silver')) return '#B8B8B8';
  if (colorFamily === 'white' || name.includes('white')) return '#E8E8E8';
  return '#C0C0C0';
};

const getContrastTextColor = (hexColor: string): string => {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? '#1a1a1a' : '#ffffff';
};

interface MetalStepProps {
  selected: RingMetal | null;
  onSelect: (metal: RingMetal) => void;
  options?: MetalOption[];
  currency?: string;
}

export const MetalStep = ({ selected, onSelect, options, currency = 'USD' }: MetalStepProps) => {
  const metals = options || MOCK_METALS;
  const [infoDialogOpen, setInfoDialogOpen] = useState(false);
  const [selectedMetalInfo, setSelectedMetalInfo] = useState<MetalOption | null>(null);
  const { theme } = useWidgetTheme();

  // Group metals by color family
  const metalsByFamily = useMemo(() => {
    const groups: Record<MetalFamily, MetalOption[]> = { yellow: [], white: [], rose: [], platinum: [], silver: [] };
    metals.forEach((m) => groups[getMetalFamily(m)].push(m));
    return groups;
  }, [metals]);

  // Only show color families the client actually offers in their catalog.
  const visibleFamilyTabs = useMemo(
    () => FAMILY_TABS.filter((tab) => metalsByFamily[tab.id].length > 0),
    [metalsByFamily]
  );

  // Determine initial active family — prefer the family of the currently selected metal,
  // otherwise the first family that has any options.
  const initialFamily: MetalFamily = useMemo(() => {
    if (selected) {
      const sel = metals.find((m) => m.id === selected);
      if (sel) return getMetalFamily(sel);
    }
    return visibleFamilyTabs[0]?.id ?? 'yellow';
  }, [selected, metals, visibleFamilyTabs]);

  const [activeFamily, setActiveFamily] = useState<MetalFamily>(initialFamily);

  // Keep active tab in sync if the selected metal changes to a different family
  // (e.g. AI agent applies a config change).
  useEffect(() => {
    if (!selected) return;
    const sel = metals.find((m) => m.id === selected);
    if (sel) {
      const fam = getMetalFamily(sel);
      if (fam !== activeFamily) setActiveFamily(fam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // If the options list changes and the active tab no longer has metals, fall back
  // to the first available family so the step is never blank.
  useEffect(() => {
    if (visibleFamilyTabs.length === 0) return;
    if (!visibleFamilyTabs.some((tab) => tab.id === activeFamily)) {
      setActiveFamily(visibleFamilyTabs[0].id);
    }
  }, [visibleFamilyTabs, activeFamily]);

  const displayedMetals = metalsByFamily[activeFamily] ?? [];

  const handleInfoClick = (e: React.MouseEvent, metal: MetalOption) => {
    e.stopPropagation();
    setSelectedMetalInfo(metal);
    setInfoDialogOpen(true);
  };

  // Shared color-family tab bar. `variant` adapts colors to the surrounding theme.
  // Hidden entirely when the client offers a single family — a lone tab adds no value.
  const FamilyTabs = ({ variant }: { variant: 'light' | 'dark' }) => {
    if (visibleFamilyTabs.length < 2) return null;
    return (
      <div className="flex justify-center mb-3 md:mb-4">
        <div
          className={`inline-flex items-center gap-1 p-1 rounded-full border ${
            variant === 'dark' ? 'border-white/15 bg-white/5' : 'border-border bg-muted/40'
          }`}
          role="tablist"
          aria-label="Metal color family"
        >
          {visibleFamilyTabs.map((tab) => {
            const isActive = activeFamily === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveFamily(tab.id)}
                className={`flex items-center gap-1.5 px-3 md:px-4 py-1.5 rounded-full text-xs md:text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? variant === 'dark'
                      ? 'bg-white text-black shadow'
                      : 'bg-primary text-primary-foreground shadow'
                    : variant === 'dark'
                      ? 'hover:opacity-100'
                      : 'text-muted-foreground hover:text-foreground'
                }`}
                style={
                  !isActive && variant === 'dark'
                    ? { color: 'hsl(var(--foreground))', opacity: 0.7 }
                    : undefined
                }
              >
                <span
                  className="w-3 h-3 rounded-full shadow-inner"
                  style={{ backgroundColor: tab.swatch }}
                  aria-hidden
                />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // UI Option 4: Elegant Gold
  if (theme === 'elegant') {
    return (
      <div className="relative p-1 md:p-3">
        <StepHeader description="Choose the perfect metal to bring your design to life" />
        <FamilyTabs variant="light" />
        {/* Mobile: compact 3-col grid */}
        <div className="grid grid-cols-3 gap-2 max-w-xl mx-auto md:hidden">
          {displayedMetals.map((metal) => {
            const isSelected = selected === metal.id;
            const badgeColor = getBadgeColor(metal);
            return (
              <div
                key={metal.id}
                onClick={() => onSelect(metal.id as RingMetal)}
                className={`relative flex flex-col items-center gap-1 p-1.5 cursor-pointer rounded-lg bg-card border-2 transition-all duration-200 shadow-sm hover:shadow-md ${
                  isSelected ? 'border-primary shadow-primary/10' : 'border-transparent hover:border-primary/30'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-1 left-1 w-3.5 h-3.5 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(to bottom right, hsl(var(--primary)), hsl(var(--primary-gradient-end, var(--primary))))` }}>
                    <Check className="w-2 h-2 text-primary-foreground" />
                  </div>
                )}
                <button type="button" onClick={(e) => handleInfoClick(e, metal)} className="absolute top-1 right-1 p-0.5 rounded-full hover:bg-gray-100 transition-colors" aria-label={`Info about ${metal.name}`}>
                  <Info className="w-3 h-3 text-gray-400" />
                </button>
                <div className="w-7 h-7 rounded-full shadow-inner" style={{ backgroundColor: badgeColor }} />
                <span className="text-xs font-medium text-foreground text-center">{metal.name}</span>
              </div>
            );
          })}
        </div>
        {/* Desktop: original 2-col cards */}
        <div className="hidden md:grid grid-cols-2 gap-2 max-w-xl mx-auto">
          {displayedMetals.map((metal) => {
            const isSelected = selected === metal.id;
            const badgeColor = getBadgeColor(metal);
            return (
              <div
                key={metal.id}
                onClick={() => onSelect(metal.id as RingMetal)}
                className={`relative flex flex-col items-center gap-1.5 p-2.5 cursor-pointer rounded-lg bg-card border-2 transition-all duration-200 shadow-sm hover:shadow-md ${
                  isSelected ? 'border-primary shadow-primary/10' : 'border-transparent hover:border-primary/30'
                }`}
              >
                {isSelected && (
                  <div className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: `linear-gradient(to bottom right, hsl(var(--primary)), hsl(var(--primary-gradient-end, var(--primary))))` }}>
                    <Check className="w-2.5 h-2.5 text-primary-foreground" />
                  </div>
                )}
                <button type="button" onClick={(e) => handleInfoClick(e, metal)} className="absolute top-1.5 right-1.5 p-0.5 rounded-full hover:bg-gray-100 transition-colors" aria-label={`Info about ${metal.name}`}>
                  <Info className="w-3 h-3 text-gray-400" />
                </button>
                <div className="w-10 h-10 rounded-full shadow-inner" style={{ backgroundColor: badgeColor }} />
                <span className="text-xs font-medium text-foreground text-center">{metal.name}</span>
                {metal.price > 0 && (
                  <span className="text-[10px] text-muted-foreground">+{getCurrencySymbol(currency)}{metal.price.toLocaleString()}</span>
                )}
              </div>
            );
          })}
        </div>
        <MetalInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} metal={selectedMetalInfo} />
      </div>
    );
  }

  // 24k Carat Jewelers exclusive — horizontal cards, swatch on left, name on right only.
  if (theme === 'twentyfourk') {
    return (
      <div className="relative">
        <FamilyTabs variant="light" />
        <div className="grid grid-cols-2 gap-2 max-w-3xl mx-auto">
          {displayedMetals.map((metal) => {
            const isSelected = selected === metal.id;
            const badgeColor = getBadgeColor(metal);
            return (
              <button
                key={metal.id}
                type="button"
                onClick={() => onSelect(metal.id as RingMetal)}
                className={`relative flex items-center bg-card text-card-foreground transition-colors duration-150 overflow-hidden ${
                  isSelected
                    ? 'border-[2px] border-[hsl(var(--accent-gold))]'
                    : 'border border-border hover:border-[hsl(var(--accent-gold)/0.6)]'
                }`}
                style={{ minHeight: 120 }}
              >
                <div className="w-1/2 h-full flex items-center justify-center p-3">
                  <div
                    className="w-14 h-14 rounded-full shadow-inner"
                    style={{ backgroundColor: badgeColor }}
                  />
                </div>
                <div className="w-1/2 h-full flex flex-col items-center justify-center gap-2 p-3">
                  <span className="text-[13px] md:text-sm font-medium text-card-foreground text-center">
                    {metal.name}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`More info about ${metal.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMetalInfo(metal);
                      setInfoDialogOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedMetalInfo(metal);
                        setInfoDialogOpen(true);
                      }
                    }}
                    className="p-1 rounded-full hover:bg-muted transition-colors cursor-pointer"
                  >
                    <Info className="w-3.5 h-3.5 text-muted-foreground" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <MetalInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} metal={selectedMetalInfo} />
      </div>
    );
  }

  // UI Option 1: Luxury
  if (theme === 'luxury') {
    return (
      <div className="relative p-1 md:p-4">
        <StepHeader 
          description="Choose the perfect metal to bring your design to life"
        />
        <FamilyTabs variant="dark" />
        <div className="max-w-2xl mx-auto">
          {/* Mobile grid */}
          <div className="grid grid-cols-3 gap-2 md:hidden">
            {displayedMetals.map((metal) => {
              const isSelected = selected === metal.id;
              const badgeColor = getBadgeColor(metal);
              const textColor = isSelected ? getContrastTextColor(badgeColor) : 'hsl(var(--foreground))';
              return (
                <div
                  key={metal.id}
                  onClick={() => onSelect(metal.id as RingMetal)}
                  className={`relative flex flex-col items-center gap-1 p-1.5 cursor-pointer rounded-lg border transition-all duration-300 ease-out ${
                    isSelected ? 'border-white/60' : 'border-white/15 hover:border-white/30'
                  }`}
                  style={{ backgroundColor: isSelected ? badgeColor : 'transparent' }}
                >
                  <button type="button" onClick={(e) => handleInfoClick(e, metal)} className="absolute top-1 right-1 p-0.5 hover:bg-white/10 transition-colors z-10" aria-label={`More info about ${metal.name}`}>
                    <Info className="w-3 h-3" style={{ color: isSelected ? `${textColor}` : 'hsl(var(--foreground) / 0.5)', opacity: isSelected ? 0.5 : 1 }} />
                  </button>
                  <div className="w-7 h-7 rounded-full flex-shrink-0 shadow-inner transition-opacity duration-300" style={{ backgroundColor: badgeColor, opacity: isSelected ? 0.3 : 1 }} />
                  <span className="text-[10px] font-semibold tracking-wide text-center transition-colors duration-300 line-clamp-2" style={{ color: textColor }}>{metal.name}</span>
                  {isSelected && <Check className="w-3 h-3 flex-shrink-0 transition-colors duration-300" style={{ color: textColor }} />}
                </div>
              );
            })}
          </div>

          {/* Desktop stacked list */}
          <div className="hidden md:block border border-white/15">
            {displayedMetals.map((metal, index) => {
              const isSelected = selected === metal.id;
              const badgeColor = getBadgeColor(metal);
              const isLast = index === displayedMetals.length - 1;
              const textColor = isSelected ? getContrastTextColor(badgeColor) : 'hsl(var(--foreground))';
              return (
                <div
                  key={metal.id}
                  onClick={() => onSelect(metal.id as RingMetal)}
                  className={`flex items-center gap-3 p-4 cursor-pointer transition-all duration-300 ease-out ${
                    !isLast ? 'border-b border-white/15' : ''
                  } ${!isSelected ? 'hover:bg-muted/30' : ''}`}
                  style={{ backgroundColor: isSelected ? badgeColor : 'transparent' }}
                >
                  <div className="w-10 h-10 rounded-full flex-shrink-0 shadow-inner transition-opacity duration-300" style={{ backgroundColor: badgeColor, opacity: isSelected ? 0.3 : 1 }} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold tracking-wide transition-colors duration-300" style={{ color: textColor }}>{metal.name}</span>
                  </div>
                  {isSelected && <Check className="w-5 h-5 flex-shrink-0 transition-colors duration-300" style={{ color: textColor }} />}
                  <button type="button" onClick={(e) => handleInfoClick(e, metal)} className="p-1 rounded-full hover:bg-white/10 transition-colors flex-shrink-0" aria-label={`More info about ${metal.name}`}>
                    <Info className="w-4 h-4 transition-colors duration-300" style={{ color: textColor, opacity: 0.5 }} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <MetalInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} metal={selectedMetalInfo} />
      </div>
    );
  }

  // UI Option 2: Modern (compact grid on mobile)
  return (
    <div className="relative p-1 md:p-4">
      <StepHeader 
        description="Choose the perfect metal to bring your design to life"
      />
      <FamilyTabs variant="light" />
      {/* Mobile: compact 3-col grid */}
      <div className="grid grid-cols-3 gap-2 max-w-xl mx-auto md:hidden">
        {displayedMetals.map((metal) => {
          const isSelected = selected === metal.id;
          const badgeColor = getBadgeColor(metal);
          return (
            <div
              key={metal.id}
              onClick={() => onSelect(metal.id as RingMetal)}
              className={`relative flex flex-col items-center gap-1 p-1.5 cursor-pointer rounded-lg border transition-all duration-200 ${
                isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/50 hover:bg-muted/30'
              }`}
            >
              <button type="button" onClick={(e) => handleInfoClick(e, metal)} className="absolute top-1 right-1 p-0.5 rounded-full hover:bg-muted transition-colors" aria-label={`More info about ${metal.name}`}>
                <Info className="w-3 h-3 text-muted-foreground" />
              </button>
              <div className={`w-7 h-7 rounded-full shadow-inner transition-all duration-200 ${isSelected ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : ''}`} style={{ backgroundColor: badgeColor }} />
              <span className={`text-xs font-semibold text-center transition-colors line-clamp-2 ${isSelected ? 'text-primary' : 'text-foreground'}`}>{metal.name}</span>
            </div>
          );
        })}
      </div>

      {/* Desktop: 2-col cards */}
      <div className="hidden md:grid grid-cols-2 gap-3 max-w-xl mx-auto">
        {displayedMetals.map((metal) => {
          const isSelected = selected === metal.id;
          const badgeColor = getBadgeColor(metal);
          return (
            <div
              key={metal.id}
              onClick={() => onSelect(metal.id as RingMetal)}
              className={`relative flex flex-col items-center gap-3 p-4 cursor-pointer rounded-lg border transition-all duration-200 ${
                isSelected ? 'border-primary shadow-sm' : 'border-border hover:border-primary/50 hover:bg-muted/30'
              }`}
            >
              <button type="button" onClick={(e) => handleInfoClick(e, metal)} className="absolute top-2 right-2 p-1 rounded-full hover:bg-muted transition-colors" aria-label={`More info about ${metal.name}`}>
                <Info className="w-4 h-4 text-muted-foreground" />
              </button>
              <div className={`w-14 h-14 rounded-full shadow-inner transition-all duration-200 ${isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`} style={{ backgroundColor: badgeColor }} />
              <span className={`text-sm font-medium text-center transition-colors ${isSelected ? 'text-primary' : 'text-foreground'}`}>{metal.name}</span>
            </div>
          );
        })}
      </div>
      <MetalInfoDialog open={infoDialogOpen} onOpenChange={setInfoDialogOpen} metal={selectedMetalInfo} />
    </div>
  );
};
