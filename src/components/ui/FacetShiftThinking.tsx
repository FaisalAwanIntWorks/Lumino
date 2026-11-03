import { useRef, useEffect, useState, useCallback } from 'react';

interface FacetShiftThinkingProps {
  accentColor?: string;
}

const PHRASES = [
  'Looking into that for you',
  'Checking our catalog',
  'Finding the best answer',
  'Reviewing your options',
  'One moment please',
  'Pulling up details',
  'Searching our collection',
  'Considering your preferences',
];

function parseColor(color?: string): { r: number; g: number; b: number } {
  const fallback = { r: 201, g: 168, b: 76 };
  if (!color) return fallback;

  // hex
  const hexMatch = color.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (hexMatch) {
    return { r: parseInt(hexMatch[1], 16), g: parseInt(hexMatch[2], 16), b: parseInt(hexMatch[3], 16) };
  }

  // rgb(r, g, b)
  const rgbMatch = color.match(/rgb\(\s*(\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return { r: +rgbMatch[1], g: +rgbMatch[2], b: +rgbMatch[3] };
  }

  return fallback;
}

function pickRandom(arr: string[], exclude?: string): string {
  const filtered = exclude ? arr.filter(p => p !== exclude) : arr;
  return filtered[Math.floor(Math.random() * filtered.length)];
}

export function FacetShiftThinking({ accentColor }: FacetShiftThinkingProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { r, g, b } = parseColor(accentColor);

  // Canvas animation
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 56;
    canvas.height = 56;
    const start = Date.now();
    let raf: number;

    const tick = () => {
      const t = (Date.now() - start) * 0.001;
      ctx.clearRect(0, 0, 56, 56);
      const cx = 28, cy = 28;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.6);

      const radius = 10;
      const facets = 6;

      for (let i = 0; i < facets; i++) {
        const a1 = (i / facets) * Math.PI * 2;
        const a2 = ((i + 1) / facets) * Math.PI * 2;
        const lightAngle = -t * 1.2;
        const facetCenter = (a1 + a2) / 2;
        const brightness = 0.15 + Math.max(0, Math.cos(facetCenter - lightAngle)) * 0.55;

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${brightness})`;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a1) * radius, Math.sin(a1) * radius);
        ctx.lineTo(Math.cos(a2) * radius, Math.sin(a2) * radius);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = `rgba(255, 240, 200, ${brightness * 0.4})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a1) * radius, Math.sin(a1) * radius);
        ctx.stroke();
      }

      // Outer hexagon border
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.3)`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let i = 0; i <= facets; i++) {
        const a = (i / facets) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * radius, Math.sin(a) * radius);
        else ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
      }
      ctx.stroke();

      ctx.restore();

      // Shimmer trail particles
      for (let i = 0; i < 3; i++) {
        const trailAngle = t * 0.6 - i * 0.15 + Math.PI * 0.8;
        const trailR = radius + 4 + i * 3;
        const tx = cx + Math.cos(trailAngle) * trailR;
        const ty = cy + Math.sin(trailAngle) * trailR;
        const trailOp = (0.25 - i * 0.08) * (0.5 + Math.sin(t * 4 + i) * 0.5);
        ctx.fillStyle = `rgba(255, 248, 220, ${trailOp})`;
        ctx.beginPath();
        ctx.arc(tx, ty, 1.2 - i * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Outer glow
      const glowGrad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 18);
      glowGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
      glowGrad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${0.04 + Math.sin(t * 3) * 0.02})`);
      glowGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.fill();

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [r, g, b]);

  // Streaming text
  const [displayText, setDisplayText] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const phraseRef = useRef(pickRandom(PHRASES));

  const startNewPhrase = useCallback(() => {
    phraseRef.current = pickRandom(PHRASES, phraseRef.current);
    setDisplayText('');
    setIsTyping(true);
  }, []);

  useEffect(() => {
    const phrase = phraseRef.current;
    if (!isTyping) return;

    let charIndex = 0;
    const interval = setInterval(() => {
      charIndex++;
      setDisplayText(phrase.slice(0, charIndex));
      if (charIndex >= phrase.length) {
        clearInterval(interval);
        setIsTyping(false);
      }
    }, 22);

    return () => clearInterval(interval);
  }, [isTyping]);

  // Cycle phrases every 3s after typing completes
  useEffect(() => {
    if (isTyping) return;
    const timeout = setTimeout(startNewPhrase, 3000);
    return () => clearTimeout(timeout);
  }, [isTyping, startNewPhrase]);

  const textColor = `rgba(${r}, ${g}, ${b}, 0.55)`;
  const cursorColor = `rgba(${r}, ${g}, ${b}, 0.5)`;

  return (
    <div className="flex items-center gap-2" style={{ minWidth: 140 }}>
      <canvas
        ref={canvasRef}
        style={{ width: 28, height: 28, flexShrink: 0 }}
      />
      <div className="flex items-center" style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: textColor, letterSpacing: '0.01em' }}>
        <span>{displayText}</span>
        {isTyping ? (
          <span
            style={{
              display: 'inline-block',
              width: 1.2,
              height: 13,
              backgroundColor: cursorColor,
              marginLeft: 1,
              animation: 'facet-cursor-blink 0.7s step-end infinite',
            }}
          />
        ) : (
          <span
            style={{
              animation: 'facet-ellipsis-pulse 1.5s ease-in-out infinite',
              marginLeft: 1,
            }}
          >
            ...
          </span>
        )}
      </div>
      <style>{`
        @keyframes facet-cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes facet-ellipsis-pulse {
          0%, 100% { opacity: 0.35; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
