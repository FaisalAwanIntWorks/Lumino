import { useId } from 'react';

interface DiamondLoadingAnimationProps {
  size?: number;
  accentColor?: string;
}

export function DiamondLoadingAnimation({ size = 32, accentColor }: DiamondLoadingAnimationProps) {
  const id = useId().replace(/:/g, '');
  const color = accentColor || 'hsl(var(--primary))';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <style>{`
        @keyframes dr-${id} {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fs-${id} {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 0.9; }
        }
        @keyframes sp-${id} {
          0% { transform: scale(0) translate(0, 0); opacity: 0.9; }
          60% { opacity: 0.6; }
          100% { transform: scale(1.4) translate(var(--tx), var(--ty)); opacity: 0; }
        }
      `}</style>
      <svg
        viewBox="0 0 40 40"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Rotating diamond group */}
        <g style={{ animation: `dr-${id} 3s linear infinite`, transformOrigin: '20px 20px' }}>
          {/* 6 triangular facets forming hexagonal diamond */}
          {[
            { points: '20,5 30,12.5 20,20', delay: '0s' },
            { points: '30,12.5 35,20 20,20', delay: '0.33s' },
            { points: '35,20 30,27.5 20,20', delay: '0.66s' },
            { points: '30,27.5 20,35 20,20', delay: '1s' },
            { points: '20,35 10,27.5 20,20', delay: '1.33s' },
            { points: '10,27.5 5,20 20,20', delay: '1.66s' },
            { points: '5,20 10,12.5 20,20', delay: '0.5s' },
            { points: '10,12.5 20,5 20,20', delay: '0.16s' },
          ].map((facet, i) => (
            <polygon
              key={i}
              points={facet.points}
              fill={color}
              stroke={color}
              strokeWidth="0.3"
              strokeOpacity="0.4"
              style={{
                animation: `fs-${id} 2s ease-in-out infinite`,
                animationDelay: facet.delay,
              }}
            />
          ))}

          {/* Inner highlight lines */}
          <line x1="20" y1="5" x2="20" y2="35" stroke="white" strokeWidth="0.4" opacity="0.3" />
          <line x1="5" y1="20" x2="35" y2="20" stroke="white" strokeWidth="0.4" opacity="0.2" />
          <line x1="10" y1="12.5" x2="30" y2="27.5" stroke="white" strokeWidth="0.3" opacity="0.15" />
          <line x1="30" y1="12.5" x2="10" y2="27.5" stroke="white" strokeWidth="0.3" opacity="0.15" />
        </g>

        {/* Shimmer particles — outside the rotating group so they trail */}
        {[
          { cx: 33, cy: 10, tx: '6px', ty: '-5px', delay: '0s' },
          { cx: 36, cy: 22, tx: '7px', ty: '2px', delay: '0.4s' },
          { cx: 28, cy: 34, tx: '4px', ty: '6px', delay: '0.8s' },
          { cx: 8, cy: 30, tx: '-5px', ty: '5px', delay: '1.2s' },
          { cx: 6, cy: 14, tx: '-6px', ty: '-4px', delay: '0.6s' },
        ].map((p, i) => (
          <circle
            key={`shimmer-${i}`}
            cx={p.cx}
            cy={p.cy}
            r="1.3"
            fill="white"
            style={{
              '--tx': p.tx,
              '--ty': p.ty,
              animation: `sp-${id} 1.5s ease-out infinite`,
              animationDelay: p.delay,
            } as React.CSSProperties}
          />
        ))}
      </svg>
    </div>
  );
}
