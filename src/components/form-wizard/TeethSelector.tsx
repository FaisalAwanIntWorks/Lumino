import { useState, useMemo, useCallback, useId } from 'react';

interface TeethSelectorProps {
  topTeeth: string;
  bottomTeeth: string;
  onTopTeethChange: (v: string) => void;
  onBottomTeethChange: (v: string) => void;
  metalType?: string;
  accentColor?: string;
  fontColor?: string;
}

// Anatomical tooth paths (10 per arch)
const topTeethPaths = [
  { id: 0, path: "M19.5,99.2c10.6-0.9,25.3,89.2,14.2,86.2c-6.4-1.7-13.4-22.4-15.5-41.4S13.4,99.7,19.5,99.2z" },
  { id: 1, path: "M28.8,94.5c2.6-5.8,3.4,0,7.3,6c7,10.8,18.6,80.4,15.2,85.1c-3.4,4.7-6.4,11.6-18.5-18.2C21.2,139,24.1,105.2,28.8,94.5z" },
  { id: 2, path: "M42.3,79.9c8.6-3.2,30.6,14.2,35.3,22.8c4.7,8.6,16.8,47,4.3,65.9c-12.5,19-23.7,27.6-28.4,17.2c-4.7-10.3-12.9-22.8-12.9-47.4C40.6,113.9,38.8,81.2,42.3,79.9z" },
  { id: 3, path: "M96.1,74.7c9-1.1,36.2,17.7,40.9,29.7c4.7,12.1,9,50.4-4.3,58.2c-13.4,7.8-24.1,11.6-32.7,5.2c-8.6-6.5-19-14.3-18.4-39.9C82.2,105.9,88.8,75.5,96.1,74.7z" },
  { id: 4, path: "M176.5,46.6c19.6-3.4,37.1,6,41.4,15.1c4.3,9,21.9,46.9,21.5,67.6c0,29.8-2.2,42.8-33.5,42.8c-44.2,0-65-2.4-65-32.5C140.8,109.7,149.4,51.3,176.5,46.6z" },
  { id: 5, path: "M302.6,45.9c-19.6-3.4-37.1,6-41.4,15.1c-4.3,9-22.1,46.7-21.7,67.4c0,29.7,4,43.3,44.1,43.3c29.3,0,51.6-2.1,51.6-31.7S329.7,50.6,302.6,45.9z" },
  { id: 6, path: "M382.2,67.8c-19.8-1.8-38.8,20.9-43.5,33c-4.7,12.1-7.8,54.5,5.5,62.3c13.4,7.8,24,11.5,32.7,5.2c16.1-11.6,20.6-21.3,20.9-43.3C398.2,103.4,389.5,68.4,382.2,67.8z" },
  { id: 7, path: "M431.6,72.1c-8.6-3.2-33.3,13.7-38.1,22.3c-4.7,8.6-16.8,47-4.3,65.9c12.5,19,23.7,27.6,28.4,17.2c4.7-10.3,12.2-24,14.8-48.4C435.1,104.3,435.1,73.4,431.6,72.1z" },
  { id: 8, path: "M448.5,89.2c-2.6-5.8-6.1-3.9-8.2,3c-2.2,6.9-18.5,83.2-15.1,87.9c3.4,4.7,13.4,9.5,19.4-20.7C450.7,129.3,453.3,100,448.5,89.2z" },
  { id: 9, path: "M455.8,99.5c-3.8,2.2-15.1,77.1-13.4,79.2c5.7,6.8,16-4.2,19.1-41C463.1,118.6,461.1,96.4,455.8,99.5z" },
];

const bottomTeethPaths = [
  { id: 0, path: "M32.4,203.4c2-11.2,9-17.3,14.1-14c15.2,9.9,4.9,40.6-5.2,40.4C31.8,229.7,27.5,230.1,32.4,203.4z" },
  { id: 1, path: "M49.1,206.3c1.8-20.6,18.1-40,25.9-28.8c7.8,11.2,16.4,40.5,5.6,49.1C69.7,235.1,46.5,235.1,49.1,206.3z" },
  { id: 2, path: "M134.4,210.1c-1.9,18.1-20.2,28-25.4,28.4c-5.2,0.4-16.8,0.9-23.3-14.6c-6.5-15.5-8.6-38.3-2.6-50.4c6-12.1,19-22.8,31.9-13.8C127.9,168.8,138.7,169.2,134.4,210.1z" },
  { id: 3, path: "M165,234.8c-12.3,0.4-27.1-20.2-30.2-38.3c-3-18.1-6.9-30.2,5.2-36.6c12.1-6.5,39.6-8.2,45.7,2.2c6,10.3,8,20.6,3.4,37.4C184.8,215.4,179.6,234.4,165,234.8z" },
  { id: 4, path: "M203.5,236.2c13.3,4.9,18.1,1.3,27.1-22.8c9-24.1,10.3-34,6.9-49.1c-2.6-11.4-41.4-14.2-46.5,0.9S183.7,228.9,203.5,236.2z" },
  { id: 5, path: "M274.5,237.5c-13.3,4.9-18.1,1.3-27.1-22.8c-9-24.1-10.3-34-6.9-49.1c2.6-11.4,41.4-14.2,46.5,0.9C292.2,181.5,294.3,230.2,274.5,237.5z" },
  { id: 6, path: "M318,240.4c12.3,0.4,27.1-24.1,30.2-42.2c3-18.1,6.9-26.2-5.2-32.7c-12.1-6.5-39.6-8.2-45.7,2.2c-6,10.3-8,20.6-3.4,37.4C298.2,221,303.4,240,318,240.4z" },
  { id: 7, path: "M348.3,213.2c1.9,18.1,20.2,28,25.4,28.4c5.2,0.4,16.8,0.9,23.3-14.6c6.5-15.5,8.6-38.3,2.6-50.4c-6-12.1-19-22.8-31.9-13.8C354.8,171.8,344,172.2,348.3,213.2z" },
  { id: 8, path: "M435.6,208.4c-1.8-20.6-18.1-40-25.9-28.8c-7.8,11.2-16.4,40.5-5.6,49.1C414.9,237.3,438.2,237.3,435.6,208.4z" },
  { id: 9, path: "M452.5,201.1c-1.3-11.3-7.6-17.8-12.9-14.8c-15.8,8.9-7.7,40.2,2.3,40.7C451.4,227.4,455.6,228,452.5,201.1z" },
];

const topGum = "M466.6,102.3c-0.9,1.8-2.9,3.5-5.8,5.1c-1-5.8-2.7-9.2-5-7.9c-0.9,0.5-2.2,5-3.6,11.6c-0.4,0.2-0.8,0.3-1.3,0.4c0.3-9.8-0.4-17.7-2.4-22.3c-2.6-5.8-6.1-3.9-8.2,3c-0.7,2.2-2.9,11.6-5.4,23.5c-0.5,0.1-0.9,0.2-1.4,0.3c1.5-21.4,1-42.9-1.9-43.9c-8.3-3.1-31.6,12.5-37.5,21.4c-3.1-13.8-7.7-25.3-11.9-25.7c-19.8-1.8-38.8,20.9-43.5,33c-1.9,4.8-3.5,14.3-3.9,24.5c-1.7-31.2-9.1-75.4-32.2-79.4c-19.6-3.4-37.1,6-41.4,15.1c-4.3,9-22.1,46.7-21.7,67.4c0,1.2,0,2.4,0,3.6h-0.1c0-0.9,0-1.8,0-2.7c0.4-20.7-17.2-58.6-21.5-67.6c-4.3-9.1-21.8-18.5-41.4-15.1c-23.7,4.1-33.2,49.2-35.2,80.5c-0.7-9.3-2.5-18-4.3-22.7c-4.7-12-31.9-30.8-40.9-29.7c-6,0.7-11.5,21.2-13.6,40.8c-1.8-5.8-3.6-10.4-4.9-12.8c-4.7-8.6-26.7-26-35.3-22.8c-2.3,0.8-2.3,15-2,31.5c-1.5-5.1-2.9-9-4.2-11c-3.9-6-4.7-11.8-7.3-6c-1.2,2.8-2.3,7.2-3.1,12.6c-2.1-5-4.2-8.1-6.2-7.9c-2.9,0.2-3.8,6-3.8,13.9c-1.4-1-2.4-2.1-3-3.2c-8-14.5-7-37.5-0.7-51.2c2.9-6.4,42.8-25.6,93.6-40.5C150.7,4.9,213.5,2.9,236.9,2.1c25.3-0.8,94.2-0.3,144,13.6c48.5,13.6,81.2,32,85.7,38.5C474,64.8,471.4,92.8,466.6,102.3z";
const bottomGum = "M457.4,248.6c-7.4,2.1-116.1,20.1-219,20.5c-102.9,0.5-200.1-16.7-205.7-17.6c-7.2-1.3-6.6-15.1-1.8-26.2c1.4,4.5,5,4.4,10.3,4.5c3.5,0.1,6.9-3.5,9.4-8.5c5.3,13.5,21.4,12,29.9,5.3c1.8-1.4,3.1-3.4,3.9-5.8c0.4,1.1,0.8,2.1,1.2,3.2c6.5,15.5,18.1,15,23.3,14.6s23.5-10.3,25.4-28.4c0.4-4.2,0.7-7.9,0.9-11.3c3.9,17.5,18,36.4,29.7,36c13.3-0.4,18.8-16.2,22.9-31c1.3,14.9,5.7,28.8,15.6,32.4c13.3,4.9,18.1,1.3,27.1-22.8c3.7-9.8,6.1-17.3,7.4-23.7c0.7,0,1.3,0,1.8-0.1c1.2,6.7,3.7,14.5,7.6,25.1c9,24.1,13.8,27.7,27.1,22.8c12.7-4.7,16.4-26.5,16-45.5c0.3,0,0.7,0,1,0.1c0.3,3.9,1.1,8.2,2.4,13c4.3,15.9,9.5,34.9,24.1,35.3c11.5,0.4,25.2-21,29.4-38.6c0.1,3.4,0.4,7.2,0.9,11.4c1.9,18.1,20.2,28,25.4,28.4c5.2,0.4,16.8,0.9,23.3-14.6c0.9-2.2,1.8-4.6,2.5-7c0.7,3.7,2.1,6.7,4.6,8.7c8.9,7.1,26.3,8.3,30.7-7.6c2,3.5,4.5,5.8,7.1,5.9c8,0.3,12.3,0.8,11.5-15.3C462.2,220.6,467.1,246,457.4,248.6z";

const TOTAL_TEETH = 10;

const metalThemes: Record<string, { stops: { offset: string; color: string }[]; glow: string; highlight: string }> = {
  gold: {
    stops: [
      { offset: "0%", color: "#8B6914" }, { offset: "20%", color: "#C49B1A" },
      { offset: "40%", color: "#FFD700" }, { offset: "55%", color: "#FFF1A8" },
      { offset: "70%", color: "#DAA520" }, { offset: "85%", color: "#B8860B" },
      { offset: "100%", color: "#8B6914" },
    ],
    glow: "#FFD70060", highlight: "#FFE066",
  },
  'rose-gold': {
    stops: [
      { offset: "0%", color: "#7A4B4E" }, { offset: "20%", color: "#B07478" },
      { offset: "40%", color: "#E8B4B8" }, { offset: "55%", color: "#FFE0E3" },
      { offset: "70%", color: "#D49A9E" }, { offset: "85%", color: "#B07478" },
      { offset: "100%", color: "#7A4B4E" },
    ],
    glow: "#E8B4B850", highlight: "#FFD5D8",
  },
  'white-gold': {
    stops: [
      { offset: "0%", color: "#909090" }, { offset: "20%", color: "#C0C0C0" },
      { offset: "40%", color: "#E8E8E8" }, { offset: "55%", color: "#FFFFFF" },
      { offset: "70%", color: "#D8D8D8" }, { offset: "85%", color: "#B0B0B0" },
      { offset: "100%", color: "#909090" },
    ],
    glow: "#E8E8E840", highlight: "#FFFFFF",
  },
  silver: {
    stops: [
      { offset: "0%", color: "#6E6E6E" }, { offset: "20%", color: "#A0A0A0" },
      { offset: "40%", color: "#C8C8C8" }, { offset: "55%", color: "#E8E8E8" },
      { offset: "70%", color: "#B0B0B0" }, { offset: "85%", color: "#8A8A8A" },
      { offset: "100%", color: "#6E6E6E" },
    ],
    glow: "#C0C0C035", highlight: "#E0E0E0",
  },
};

function getMetalThemeKey(metalType: string): string {
  const v = metalType.toLowerCase();
  if (v.includes('rose')) return 'rose-gold';
  if (v.includes('white')) return 'white-gold';
  if (v.includes('silver') || v.includes('sterling')) return 'silver';
  return 'gold';
}

// Metal highlight colors are pale (designed for dark backgrounds). When the
// client's font color is dark (light background), fall back to the font color
// so the counts stay readable.
function isLightHex(color: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

function getSelectedFromCenter(count: number): Set<number> {
  const selected = new Set<number>();
  if (count <= 0) return selected;
  const mid = Math.floor(TOTAL_TEETH / 2);
  const order: number[] = [];
  for (let i = 0; i < TOTAL_TEETH; i++) {
    const offset = Math.floor(i / 2);
    if (i % 2 === 0) order.push(mid + offset);
    else order.push(mid - 1 - offset);
  }
  for (let i = 0; i < Math.min(count, TOTAL_TEETH); i++) {
    if (order[i] >= 0 && order[i] < TOTAL_TEETH) selected.add(order[i]);
  }
  return selected;
}

const presets = [
  { label: "Single", top: 1, bottom: 0 },
  { label: "2 Piece", top: 2, bottom: 0 },
  { label: "Classic 6", top: 6, bottom: 0 },
  { label: "8 Top", top: 8, bottom: 0 },
  { label: "6 on 6", top: 6, bottom: 6 },
  { label: "Full Set", top: 10, bottom: 10 },
];

function MouthSvg({
  theme,
  topTeethPaths: topPaths,
  bottomTeethPaths: bottomPaths,
  selectedTop,
  selectedBottom,
  hoveredTooth,
  setHoveredTooth,
  toggleTooth,
}: {
  theme: typeof metalThemes.gold;
  topTeethPaths: typeof topTeethPaths;
  bottomTeethPaths: typeof bottomTeethPaths;
  selectedTop: Set<number>;
  selectedBottom: Set<number>;
  hoveredTooth: string | null;
  setHoveredTooth: (v: string | null) => void;
  toggleTooth: (row: 'top' | 'bottom', id: number) => void;
}) {
  const rawId = useId().replace(/[:]/g, '');
  const gradId = `metalGrad-${rawId}`;
  const shimmerId = `metalShimmer-${rawId}`;
  const glowId = `toothGlow-${rawId}`;
  return (
    <svg viewBox="0 0 480 270" className="w-full" style={{ filter: 'drop-shadow(0 4px 24px rgba(0,0,0,0.5))' }}>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          {theme.stops.map((s, i) => (
            <stop key={i} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
        <linearGradient id={shimmerId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgba(255,255,255,0)" />
          <stop offset="45%" stopColor="rgba(255,255,255,0.15)" />
          <stop offset="55%" stopColor="rgba(255,255,255,0.25)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <filter id={glowId}>
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path d={topGum} fill="#c4656a" opacity="0.85" />
      <path d={bottomGum} fill="#c4656a" opacity="0.85" />
      <ellipse cx="240" cy="190" rx="200" ry="12" fill="#2a0a0c" opacity="0.6" />

      {/* Paint the lower arch first so the upper teeth overlap it naturally. */}
      {bottomPaths.map((tooth) => {
        const isSelected = selectedBottom.has(tooth.id);
        const isHovered = hoveredTooth === `bot-${tooth.id}`;
        return (
          <g key={`bot-${tooth.id}`} onMouseEnter={() => setHoveredTooth(`bot-${tooth.id}`)} onMouseLeave={() => setHoveredTooth(null)} onClick={() => toggleTooth('bottom', tooth.id)} style={{ cursor: 'pointer' }}>
            <path d={tooth.path} fill={isSelected ? `url(#${gradId})` : '#f0ece4'} stroke={isSelected ? theme.highlight : '#d4cfc5'} strokeWidth={isSelected ? 1.5 : 0.8} opacity={isHovered ? 0.85 : 1} filter={isSelected ? `url(#${glowId})` : undefined} style={{ transition: 'fill 0.3s ease, stroke 0.3s ease, opacity 0.2s ease' }} />
            {isSelected && <path d={tooth.path} fill={`url(#${shimmerId})`} style={{ pointerEvents: 'none' }} />}
            {!isSelected && <path d={tooth.path} fill="none" stroke="#c8c0b4" strokeWidth={0.3} opacity={0.4} style={{ pointerEvents: 'none' }} />}
          </g>
        );
      })}

      {topPaths.map((tooth) => {
        const isSelected = selectedTop.has(tooth.id);
        const isHovered = hoveredTooth === `top-${tooth.id}`;
        return (
          <g key={`top-${tooth.id}`} onMouseEnter={() => setHoveredTooth(`top-${tooth.id}`)} onMouseLeave={() => setHoveredTooth(null)} onClick={() => toggleTooth('top', tooth.id)} style={{ cursor: 'pointer' }}>
            <path d={tooth.path} fill={isSelected ? `url(#${gradId})` : '#f0ece4'} stroke={isSelected ? theme.highlight : '#d4cfc5'} strokeWidth={isSelected ? 1.5 : 0.8} opacity={isHovered ? 0.85 : 1} filter={isSelected ? `url(#${glowId})` : undefined} style={{ transition: 'fill 0.3s ease, stroke 0.3s ease, opacity 0.2s ease' }} />
            {isSelected && <path d={tooth.path} fill={`url(#${shimmerId})`} style={{ pointerEvents: 'none' }} />}
            {!isSelected && <path d={tooth.path} fill="none" stroke="#c8c0b4" strokeWidth={0.3} opacity={0.4} style={{ pointerEvents: 'none' }} />}
          </g>
        );
      })}

    </svg>
  );
}

export function TeethSelector({
  topTeeth,
  bottomTeeth,
  onTopTeethChange,
  onBottomTeethChange,
  metalType = 'gold',
  accentColor = 'hsl(142, 53%, 53%)',
  fontColor = '#ffffff',
}: TeethSelectorProps) {
  const topCount = !topTeeth || topTeeth === 'none' ? 0 : parseInt(topTeeth, 10) || 0;
  const bottomCount = !bottomTeeth || bottomTeeth === 'none' ? 0 : parseInt(bottomTeeth, 10) || 0;
  const totalTeeth = topCount + bottomCount;

  const themeKey = getMetalThemeKey(metalType);
  const theme = metalThemes[themeKey] || metalThemes.gold;
  const countColor = isLightHex(fontColor) ? theme.highlight : fontColor;

  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customTopSet, setCustomTopSet] = useState<Set<number>>(new Set());
  const [customBottomSet, setCustomBottomSet] = useState<Set<number>>(new Set());

  const selectedTop = useMemo(() => isCustomMode ? customTopSet : getSelectedFromCenter(topCount), [isCustomMode, customTopSet, topCount]);
  const selectedBottom = useMemo(() => isCustomMode ? customBottomSet : getSelectedFromCenter(bottomCount), [isCustomMode, customBottomSet, bottomCount]);

  const [activePreset, setActivePreset] = useState<number | null>(null);
  const [hoveredTooth, setHoveredTooth] = useState<string | null>(null);

  const adjustCount = useCallback((row: 'top' | 'bottom', delta: number) => {
    setIsCustomMode(false);
    if (row === 'top') {
      const next = Math.max(0, Math.min(TOTAL_TEETH, topCount + delta));
      onTopTeethChange(next === 0 ? 'none' : String(next));
    } else {
      const next = Math.max(0, Math.min(TOTAL_TEETH, bottomCount + delta));
      onBottomTeethChange(next === 0 ? 'none' : String(next));
    }
    setActivePreset(null);
  }, [topCount, bottomCount, onTopTeethChange, onBottomTeethChange]);

  const toggleTooth = useCallback((row: 'top' | 'bottom', id: number) => {
    setIsCustomMode(true);
    setActivePreset(null);

    if (row === 'top') {
      setCustomTopSet(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        onTopTeethChange(next.size === 0 ? 'none' : String(next.size));
        return next;
      });
      // Sync bottom set from current state if switching modes
      if (!isCustomMode) {
        setCustomBottomSet(getSelectedFromCenter(bottomCount));
      }
    } else {
      setCustomBottomSet(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        onBottomTeethChange(next.size === 0 ? 'none' : String(next.size));
        return next;
      });
      if (!isCustomMode) {
        setCustomTopSet(getSelectedFromCenter(topCount));
      }
    }
  }, [isCustomMode, topCount, bottomCount, onTopTeethChange, onBottomTeethChange]);

  const handlePreset = useCallback((p: typeof presets[0], idx: number) => {
    setIsCustomMode(false);
    onTopTeethChange(p.top === 0 ? 'none' : String(p.top));
    onBottomTeethChange(p.bottom === 0 ? 'none' : String(p.bottom));
    setActivePreset(idx);
  }, [onTopTeethChange, onBottomTeethChange]);

  const countBtnStyle: React.CSSProperties = {
    width: 36, height: 36, borderRadius: 10,
    border: `1px solid ${accentColor}33`,
    background: 'rgba(12,12,20,0.8)',
    color: 'rgba(255,255,255,0.85)',
    fontSize: 18, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.2s ease',
  };

  const CounterRow = ({ row, count, label }: { row: 'top' | 'bottom'; count: number; label: string }) => (
    <div className="flex items-center justify-between gap-3">
      <button type="button" onClick={() => adjustCount(row, -1)} style={countBtnStyle}>−</button>
      <div className="text-center flex-1">
        <div className="text-xl font-bold tabular-nums" style={{ color: count > 0 ? countColor : `${fontColor}60`, transition: 'color 0.3s' }}>
          {count}
        </div>
        <div className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: `${fontColor}B3` }}>
          {label}
        </div>
      </div>
      <button type="button" onClick={() => adjustCount(row, 1)} style={countBtnStyle}>+</button>
    </div>
  );

  const Controls = () => (
    <div className="flex flex-col gap-3">
      {/* Counters */}
      <CounterRow row="top" count={topCount} label="Top Teeth" />
      <CounterRow row="bottom" count={bottomCount} label="Bottom Teeth" />

      {/* Presets */}
      <div className="grid grid-cols-3 gap-1.5 mt-1">
        {presets.map((p, i) => (
          <button
            key={p.label}
            type="button"
            onClick={() => handlePreset(p, i)}
            className="px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-all duration-200 text-center"
            style={{
              background: activePreset === i ? `${accentColor}26` : `${fontColor}08`,
              color: activePreset === i ? fontColor : `${fontColor}99`,
              border: `1px solid ${activePreset === i ? `${accentColor}99` : `${accentColor}4D`}`,
              letterSpacing: '0.3px',
            }}
          >
            <span>{p.label}</span>
            <span className="block text-[8px] opacity-60">{p.top + p.bottom}t</span>
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="flex items-center justify-center gap-3 py-2 rounded-xl" style={{ background: `${fontColor}05` }}>
        <div className="text-center">
          <div className="text-base font-bold tabular-nums" style={{ color: topCount > 0 ? countColor : `${fontColor}60` }}>{topCount}</div>
          <div className="text-[8px] uppercase tracking-wider" style={{ color: `${fontColor}99` }}>Top</div>
        </div>
        <div className="text-xs font-light" style={{ color: `${fontColor}80` }}>+</div>
        <div className="text-center">
          <div className="text-base font-bold tabular-nums" style={{ color: bottomCount > 0 ? countColor : `${fontColor}60` }}>{bottomCount}</div>
          <div className="text-[8px] uppercase tracking-wider" style={{ color: `${fontColor}99` }}>Bottom</div>
        </div>
        <div className="w-px h-6 mx-1" style={{ background: `${fontColor}15` }} />
        <div className="text-center">
          <div className="text-base font-bold tabular-nums" style={{ color: totalTeeth > 0 ? fontColor : `${fontColor}60` }}>{totalTeeth}</div>
          <div className="text-[8px] uppercase tracking-wider" style={{ color: `${fontColor}99` }}>Total</div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full px-2 md:px-4">
      {/* Desktop: two-column layout */}
      <div className="hidden md:grid md:grid-cols-[1fr_240px] gap-6 items-center max-w-2xl mx-auto">
        <div className="flex justify-center">
          <MouthSvg
            theme={theme}
            topTeethPaths={topTeethPaths}
            bottomTeethPaths={bottomTeethPaths}
            selectedTop={selectedTop}
            selectedBottom={selectedBottom}
            hoveredTooth={hoveredTooth}
            setHoveredTooth={setHoveredTooth}
            toggleTooth={toggleTooth}
          />
        </div>
        <div className="rounded-xl p-3" style={{ background: `${fontColor}05` }}>
          <Controls />
        </div>
      </div>

      {/* Mobile: compact single-column */}
      <div className="md:hidden flex flex-col gap-2 max-w-sm mx-auto">
        {/* Inline counters row */}
        <div className="flex items-center justify-center gap-6">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => adjustCount('top', -1)} style={{ ...countBtnStyle, width: 32, height: 32, fontSize: 16 }}>−</button>
            <div className="text-center min-w-[40px]">
              <div className="text-lg font-bold tabular-nums" style={{ color: topCount > 0 ? countColor : `${fontColor}60` }}>{topCount}</div>
              <div className="text-[8px] font-bold uppercase tracking-[0.15em]" style={{ color: `${fontColor}B3` }}>Top</div>
            </div>
            <button type="button" onClick={() => adjustCount('top', 1)} style={{ ...countBtnStyle, width: 32, height: 32, fontSize: 16 }}>+</button>
          </div>
          <div className="w-px h-8" style={{ background: `${fontColor}15` }} />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => adjustCount('bottom', -1)} style={{ ...countBtnStyle, width: 32, height: 32, fontSize: 16 }}>−</button>
            <div className="text-center min-w-[40px]">
              <div className="text-lg font-bold tabular-nums" style={{ color: bottomCount > 0 ? countColor : `${fontColor}60` }}>{bottomCount}</div>
              <div className="text-[8px] font-bold uppercase tracking-[0.15em]" style={{ color: `${fontColor}B3` }}>Bottom</div>
            </div>
            <button type="button" onClick={() => adjustCount('bottom', 1)} style={{ ...countBtnStyle, width: 32, height: 32, fontSize: 16 }}>+</button>
          </div>
        </div>

        {/* SVG Mouth */}
        <div className="flex justify-center">
          <div className="w-full max-w-[300px]">
            <MouthSvg
              theme={theme}
              topTeethPaths={topTeethPaths}
              bottomTeethPaths={bottomTeethPaths}
              selectedTop={selectedTop}
              selectedBottom={selectedBottom}
              hoveredTooth={hoveredTooth}
              setHoveredTooth={setHoveredTooth}
              toggleTooth={toggleTooth}
            />
          </div>
        </div>

        {/* Presets row */}
        <div className="grid grid-cols-3 gap-1.5">
          {presets.map((p, i) => (
            <button
              key={p.label}
              type="button"
              onClick={() => handlePreset(p, i)}
              className="px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-all duration-200 text-center"
            style={{
              background: activePreset === i ? `${accentColor}26` : `${fontColor}08`,
              color: activePreset === i ? fontColor : `${fontColor}99`,
              border: `1px solid ${activePreset === i ? `${accentColor}99` : `${accentColor}4D`}`,
            }}
            >
              <span>{p.label}</span>
              <span className="block text-[8px] opacity-60">{p.top + p.bottom}t</span>
            </button>
          ))}
        </div>

        {/* Compact summary */}
        <div className="flex items-center justify-center gap-3 py-1.5 rounded-lg" style={{ background: `${fontColor}05` }}>
          <span className="text-sm font-bold tabular-nums" style={{ color: totalTeeth > 0 ? fontColor : `${fontColor}60` }}>{totalTeeth}</span>
          <span className="text-[9px] uppercase tracking-wider" style={{ color: `${fontColor}99` }}>teeth selected</span>
        </div>
      </div>
    </div>
  );
}
