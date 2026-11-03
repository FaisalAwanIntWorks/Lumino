/**
 * E1/N4: Shared wizard theme resolver.
 * All three form wizards (Ring, Grillz, Custom Enquiry) use the same
 * form_colors JSONB shape — centralise the resolution here so the
 * defaults only live in one place.
 */

import type { FormColors } from './useClientRingFormConfig';

interface WizardThemeSource {
  form_colors?: FormColors | null;
}

export interface WizardTheme {
  bg: string;
  font: string;
  accent: string;
  submitBg: string | undefined;
  submitText: string | undefined;
}

export function useWizardTheme(config?: WizardThemeSource | null): WizardTheme {
  const colors = config?.form_colors;
  return {
    bg: colors?.background || '#0a0a0a',
    font: colors?.fontColor || '#ffffff',
    accent: colors?.tabBorder || '#77bb41',
    submitBg: colors?.submitButtonBg || undefined,
    submitText: colors?.submitButtonText || undefined,
  };
}
