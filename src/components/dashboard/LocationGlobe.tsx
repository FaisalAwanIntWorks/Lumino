import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface LocationPoint {
  lat: number;
  lng: number;
  label: string;
  count: number;
}

interface LocationGlobeProps {
  points?: LocationPoint[];
  isGlass?: boolean;
  className?: string;
}

// Convert lat/lng to x/y on a simple equirectangular projection
const project = (lat: number, lng: number, width: number, height: number) => {
  const x = ((lng + 180) / 360) * width;
  const y = ((90 - lat) / 180) * height;
  return { x, y };
};

// Simplified world map outline paths (major continents)
const WORLD_PATHS = [
  // North America
  "M50,55 L55,48 L65,42 L80,38 L95,35 L110,38 L115,42 L118,50 L115,58 L108,62 L100,68 L95,72 L88,70 L80,65 L70,60 L55,58 Z",
  // South America
  "M95,72 L100,78 L105,85 L108,95 L106,105 L100,112 L95,118 L88,122 L82,115 L80,105 L82,95 L85,85 L88,78 L92,74 Z",
  // Europe
  "M145,38 L150,35 L158,33 L165,35 L170,38 L168,42 L162,45 L155,48 L148,45 L145,42 Z",
  // Africa
  "M145,52 L155,48 L165,50 L172,55 L175,65 L172,78 L168,88 L160,95 L152,92 L145,85 L140,75 L138,65 L140,58 Z",
  // Asia
  "M170,38 L180,32 L195,28 L210,25 L225,28 L238,32 L245,38 L248,45 L245,52 L238,58 L228,55 L218,52 L208,48 L198,45 L188,42 L178,40 Z",
  // Australia
  "M225,88 L235,85 L245,88 L248,95 L245,102 L238,105 L228,102 L225,95 Z",
];

// Sample data points for visual effect
const SAMPLE_POINTS: LocationPoint[] = [
  { lat: 40.7, lng: -74, label: 'New York', count: 42 },
  { lat: 51.5, lng: -0.1, label: 'London', count: 28 },
  { lat: 25.2, lng: 55.3, label: 'Dubai', count: 35 },
  { lat: 1.3, lng: 103.8, label: 'Singapore', count: 18 },
  { lat: 34.1, lng: -118.2, label: 'Los Angeles', count: 31 },
  { lat: -33.9, lng: 151.2, label: 'Sydney', count: 12 },
  { lat: 48.9, lng: 2.3, label: 'Paris', count: 15 },
  { lat: 35.7, lng: 139.7, label: 'Tokyo', count: 22 },
];

const WIDTH = 300;
const HEIGHT = 160;

export function LocationGlobe({ points, isGlass = false, className }: LocationGlobeProps) {
  const displayPoints = points && points.length > 0 ? points : SAMPLE_POINTS;
  const isSample = !points || points.length === 0;

  const projected = useMemo(() =>
    displayPoints.map(p => ({
      ...p,
      ...project(p.lat, p.lng, WIDTH, HEIGHT),
    })),
  [displayPoints]);

  const maxCount = Math.max(...projected.map(p => p.count), 1);

  return (
    <div className={cn(isGlass ? "glass-panel rounded-2xl p-6" : "", className)}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold tracking-[0.1em] uppercase text-muted-foreground/60">
          Visitor Locations
        </p>
        {isSample && (
          <span className="text-[10px] text-muted-foreground/40 italic">Sample data</span>
        )}
      </div>

      <div className="relative w-full overflow-hidden rounded-lg bg-muted/20 border border-border/20">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full h-auto"
          style={{ minHeight: 120 }}
        >
          {/* Continent outlines */}
          {WORLD_PATHS.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="hsl(var(--muted-foreground) / 0.08)"
              stroke="hsl(var(--muted-foreground) / 0.15)"
              strokeWidth={0.5}
            />
          ))}

          {/* Data points */}
          {projected.map((p, i) => {
            const intensity = p.count / maxCount;
            const r = 2 + intensity * 4;
            return (
              <g key={i}>
                {/* Pulse ring */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r * 2.5}
                  fill="hsl(var(--primary) / 0.08)"
                  className="animate-pulse"
                />
                {/* Glow */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r * 1.5}
                  fill="hsl(var(--primary) / 0.15)"
                />
                {/* Dot */}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill="hsl(var(--primary))"
                  opacity={0.7 + intensity * 0.3}
                />
                {/* Label for large points */}
                {intensity > 0.5 && (
                  <text
                    x={p.x}
                    y={p.y - r - 2}
                    textAnchor="middle"
                    fill="hsl(var(--muted-foreground))"
                    fontSize={3.5}
                    fontWeight={600}
                  >
                    {p.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Top locations list */}
      <div className="mt-4 space-y-2">
        {projected
          .sort((a, b) => b.count - a.count)
          .slice(0, 4)
          .map((p, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: 'hsl(var(--primary))' }}
                />
                <span className="text-xs text-foreground">{p.label}</span>
              </div>
              <span className="text-xs font-semibold text-muted-foreground">{p.count}</span>
            </div>
          ))}
      </div>
    </div>
  );
}
