// Color utilities for widget theming.
// Safer alternatives to `${hex}NN` string concatenation, which silently breaks
// for 3-digit hex, named colors, or rgb() values.

export function normalizeHex(input?: string | null): string | null {
  if (!input) return null;
  let c = input.trim();
  if (!c.startsWith('#')) return null;
  c = c.slice(1);
  if (c.length === 3) {
    c = c.split('').map((ch) => ch + ch).join('');
  }
  if (c.length === 8) c = c.slice(0, 6);
  if (!/^[0-9a-fA-F]{6}$/.test(c)) return null;
  return `#${c.toLowerCase()}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16),
  };
}

/** Returns rgba() string with the given alpha (0..1). Falls back gracefully. */
export function withAlpha(color: string | undefined | null, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  if (!color) return `rgba(255,255,255,${a})`;
  const rgb = hexToRgb(color);
  if (rgb) return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
  // rgb()/rgba() input — re-wrap with new alpha
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${a})`;
  return color;
}

/** Returns #ffffff or #1a1a1a depending on background luminance. */
export function getContrastText(bg: string | undefined | null): string {
  const rgb = hexToRgb(bg || '');
  if (!rgb) return '#ffffff';
  // Relative luminance (sRGB)
  const lum = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return lum > 0.6 ? '#1a1a1a' : '#ffffff';
}
