// Default per-theme color palettes
// These define the 5 customizable color channels for each widget theme.

export interface ThemeColorSet {
  background: string;
  text: string;
  accent: string;
  buttonFill: string;
  buttonText: string;
}

export type ThemeColorMap = Record<string, ThemeColorSet>;

export const THEME_COLOR_DEFAULTS: ThemeColorMap = {
  luxury: {
    background: '#000000',
    text: '#FFFFFF',
    accent: '#C7A17A',
    buttonFill: '#FFFFFF',
    buttonText: '#000000',
  },
  modern: {
    background: '#FAFAFA',
    text: '#1A1A1A',
    accent: '#0EA5E9',
    buttonFill: '#0EA5E9',
    buttonText: '#FFFFFF',
  },
  chat: {
    background: '#000000',
    text: '#FFFFFF',
    accent: '#007AFF',
    buttonFill: '#007AFF',
    buttonText: '#FFFFFF',
  },
  elegant: {
    background: '#FDF8F0',
    text: '#2D2D2D',
    accent: '#C5A55A',
    buttonFill: '#C5A55A',
    buttonText: '#FFFFFF',
  },
  // 24k Carat Jewelers — exclusive theme. Placeholder palette (deep black + 24k gold);
  // final values will be locked in once design screenshots arrive.
  twentyfourk: {
    background: '#0A0A0A',
    text: '#F5EFE0',
    accent: '#D4AF37',
    buttonFill: '#D4AF37',
    buttonText: '#0A0A0A',
  },
};

export const THEME_COLOR_LABELS: { key: keyof ThemeColorSet; label: string }[] = [
  { key: 'background', label: 'Background' },
  { key: 'text', label: 'Text' },
  { key: 'accent', label: 'Accent' },
  { key: 'buttonFill', label: 'Button Fill' },
  { key: 'buttonText', label: 'Button Text' },
];
