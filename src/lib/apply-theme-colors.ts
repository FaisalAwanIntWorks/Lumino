import { ThemeColorSet } from './theme-color-defaults';

/**
 * Convert a hex color (#RRGGBB) to an HSL triplet string "H S% L%"
 * suitable for CSS custom properties consumed as hsl(var(--prop)).
 */
export function hexToHSLRaw(hex: string): string {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Build a Record of CSS custom-property overrides from a ThemeColorSet.
 * Returns an object like { '--background': '0 100% 50%', '--foreground': '0 0% 10%', ... }
 * suitable for spreading into a React style prop.
 */
/**
 * Parse an HSL raw string "H S% L%" back into numeric [h, s, l].
 */
function parseHSLRaw(raw: string): [number, number, number] {
  const parts = raw.split(' ');
  return [
    parseInt(parts[0], 10),
    parseInt(parts[1], 10),
    parseInt(parts[2], 10),
  ];
}

export function buildThemeColorStyles(colors: ThemeColorSet | undefined): Record<string, string> {
  if (!colors) return {};
  const styles: Record<string, string> = {};

  if (colors.background) {
    const bg = hexToHSLRaw(colors.background);
    styles['--background'] = bg;
    styles['--card'] = bg;
    styles['--popover'] = bg;
    styles['--surface'] = bg;

    // Derive --muted: shift lightness towards middle
    const [bh, bs, bl] = parseHSLRaw(bg);
    const mutedL = bl < 50 ? Math.min(bl + 10, 100) : Math.max(bl - 8, 0);
    styles['--muted'] = `${bh} ${Math.round(bs * 0.6)}% ${mutedL}%`;
    // Derive --border
    const borderL = bl < 50 ? Math.min(bl + 15, 100) : Math.max(bl - 12, 0);
    styles['--border'] = `${bh} ${Math.round(bs * 0.3)}% ${borderL}%`;
  }
  if (colors.text) {
    const fg = hexToHSLRaw(colors.text);
    styles['--foreground'] = fg;
    styles['--card-foreground'] = fg;
    styles['--popover-foreground'] = fg;

    // Derive --muted-foreground: reduce opacity via lightness shift
    const [fh, fs, fl] = parseHSLRaw(fg);
    const mutedFgL = fl < 50 ? Math.min(fl + 25, 100) : Math.max(fl - 25, 0);
    styles['--muted-foreground'] = `${fh} ${Math.round(fs * 0.5)}% ${mutedFgL}%`;
  }
  if (colors.accent) {
    const hsl = hexToHSLRaw(colors.accent);
    styles['--accent'] = hsl;
    styles['--client-accent'] = hsl;
    styles['--client-subtle'] = hsl;
    styles['--accent-gold'] = hsl;
    styles['--primary'] = hsl;
    styles['--ring'] = hsl;
  }
  if (colors.buttonFill) {
    styles['--cta-bg'] = hexToHSLRaw(colors.buttonFill);
    styles['--primary'] = hexToHSLRaw(colors.buttonFill);
  }
  if (colors.buttonText) {
    styles['--cta-text'] = hexToHSLRaw(colors.buttonText);
    styles['--primary-foreground'] = hexToHSLRaw(colors.buttonText);
  }

  return styles;
}

/**
 * Apply a ThemeColorSet to the document element as CSS custom properties.
 * Call this after loading branding_config.themeColors[activeTheme].
 */
export function applyThemeColors(colors: ThemeColorSet | undefined, target?: HTMLElement): void {
  if (!colors) return;

  const el = target || document.querySelector('[data-theme]') as HTMLElement || document.documentElement;
  const styles = buildThemeColorStyles(colors);
  for (const [prop, value] of Object.entries(styles)) {
    el.style.setProperty(prop, value);
    // Also set on documentElement so portaled content (dialogs, popovers) inherits theme vars
    if (el !== document.documentElement) {
      document.documentElement.style.setProperty(prop, value);
    }
  }
}
