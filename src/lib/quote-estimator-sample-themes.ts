/**
 * Ready-made Quote Estimator themes. Identical layout and copy, entirely
 * different skin — they only set token values. Used by the internal theme lab
 * and offered as one-click presets in the Quote Estimator configuration tab.
 */
import type { QuoteEstimatorThemeOverrides } from '@/lib/quote-estimator-theme';

export interface SampleTheme {
  id: string;
  label: string;
  description: string;
  tokens: QuoteEstimatorThemeOverrides;
}

export const QUOTE_ESTIMATOR_SAMPLE_THEMES: SampleTheme[] = [
  {
    id: 'champagne',
    label: 'Champagne',
    description: 'The default: light cream ground, ivory cards, gold highlights, black pill button, serif headings.',
    tokens: {
      background: '#F5EFE7',
      tileBackground: '#FFFDF9',
      surfaceColor: '#FFFFFF',
      surfaceOpacity: 0.75,
      surfaceBlur: 12,
      borderColor: '#FFFFFF',
      borderOpacity: 0.55,
      glowColor: '#D9B87C',
      glowIntensity: 0.3,
      fontColor: '#1B1713',
      mutedTextColor: '#7C736A',
      accentColor: '#A98A55',
      highlightColor: '#A9803F',
      highlightMutedColor: '#8C7A62',
      buttonColor: '#111111',
      buttonTextColor: '#FFFFFF',
      inputBorderColor: '#E4D9C8',
      borderRadius: 18,
      buttonBorderRadius: 999,
      fontFamilyDisplay: "'Cormorant Garamond', serif",
      fontFamilyBody: "'Jost', sans-serif",
    },
  },
  {
    id: 'midnight',
    label: 'Midnight',
    description: 'Deep navy ground, translucent cards, gold accents and a soft halo on the credit block.',
    tokens: {
      background: '#06101F',
      tileBackground: '#0D1A2E',
      surfaceColor: '#9FC1FF',
      surfaceOpacity: 0.1,
      surfaceBlur: 22,
      borderColor: '#D8C79A',
      borderOpacity: 0.22,
      glowColor: '#E2B96B',
      glowIntensity: 0.45,
      fontColor: '#F4F1EA',
      mutedTextColor: '#9AA6BD',
      accentColor: '#E2B96B',
      highlightColor: '#EFCB86',
      highlightMutedColor: '#C9A96A',
      buttonColor: '#E2B96B',
      buttonTextColor: '#0A1424',
      inputBorderColor: '#C9A96A',
      borderRadius: 16,
      buttonBorderRadius: 10,
      fontFamilyDisplay: "'Cormorant Garamond', serif",
      fontFamilyBody: "'Jost', sans-serif",
    },
  },
  {
    id: 'terracotta',
    label: 'Terracotta',
    description: 'Warm beige ground, soft frosted cards, brown pill button, amber glow.',
    tokens: {
      background: '#F3E3D3',
      tileBackground: '#FBF0E6',
      surfaceColor: '#FFFFFF',
      surfaceOpacity: 0.6,
      surfaceBlur: 16,
      borderColor: '#FFFFFF',
      borderOpacity: 0.5,
      glowColor: '#E8B978',
      glowIntensity: 0.4,
      fontColor: '#3A241A',
      mutedTextColor: '#8A6A57',
      accentColor: '#9A5B2C',
      highlightColor: '#9A5B2C',
      highlightMutedColor: '#A98165',
      buttonColor: '#4A2A1C',
      buttonTextColor: '#FFF6EC',
      inputBorderColor: '#E0C6AD',
      borderRadius: 20,
      buttonBorderRadius: 999,
      fontFamilyDisplay: "'Cormorant Garamond', serif",
      fontFamilyBody: "'Jost', sans-serif",
    },
  },
];
