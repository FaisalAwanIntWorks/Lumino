import type { DiamondWizardState } from './types';
import { CURRENCIES } from './defaults';

// Same standard carat points used by the edge function
const STANDARD_CARATS = [
  0.50, 1.00, 1.50, 2.00, 2.50, 3.00, 3.50, 4.00, 4.50, 5.00,
];

// Count discrete carat values within a range
export function countCaratValues(min: number, max: number): number {
  return STANDARD_CARATS.filter(c => c >= min && c <= max).length;
}

// Calculate estimated product count from wizard state
// Products = Types × Shapes × Carats × Colors × Clarities
// Fluorescence, Cut, Polish, Symmetry are stored as metadata, not separate products
export function calculateProductCount(state: DiamondWizardState): number {
  const { diamondType, shapes, grading } = state;
  
  const shapeCount = shapes.selectedShapes.length;
  if (shapeCount === 0) return 0;
  
  const caratCount = countCaratValues(grading.caratRange[0], grading.caratRange[1]);
  if (caratCount === 0) return 0;
  
  const colorCount = grading.colors.length;
  const clarityCount = grading.clarities.length;
  
  const combosPerType = shapeCount * caratCount * colorCount * clarityCount;
  
  let totalTypes = 0;
  if (diamondType.naturalEnabled) totalTypes++;
  if (diamondType.labGrownEnabled) totalTypes++;
  
  return combosPerType * totalTypes;
}

// Get currency symbol
export function getCurrencySymbol(currency: string): string {
  return CURRENCIES.find(c => c.value === currency)?.symbol || '$';
}

// Format price with currency
export function formatPrice(amount: number, currency: string): string {
  const symbol = getCurrencySymbol(currency);
  return `${symbol}${amount.toLocaleString()}`;
}

// Apply rounding to a price
export function applyRounding(price: number, rounding: string): number {
  if (rounding === 'none') return price;
  const roundTo = parseInt(rounding);
  return Math.round(price / roundTo) * roundTo;
}

// Calculate example output price from cost and markup
export function calculateMarkupExample(cost: number, markupPercent: number): number {
  return Math.round(cost * (1 + markupPercent / 100));
}

// Generate product title from template
export function generateTitleFromTemplate(
  template: string,
  values: Record<string, string>
): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

// Validate step 1
export function validateStep1(state: DiamondWizardState): boolean {
  return state.diamondType.naturalEnabled || state.diamondType.labGrownEnabled;
}

// Validate step 2
export function validateStep2(state: DiamondWizardState): boolean {
  return state.shapes.selectedShapes.length > 0;
}

// Validate step 3
export function validateStep3(state: DiamondWizardState): boolean {
  return (
    state.grading.clarities.length > 0 &&
    state.grading.caratRange[0] < state.grading.caratRange[1]
  );
}

// Validate step 4
export function validateStep4(state: DiamondWizardState): boolean {
  const hasNaturalTiers = !state.diamondType.naturalEnabled || state.pricing.naturalMarkupTiers.length > 0;
  const hasLabTiers = !state.diamondType.labGrownEnabled || state.pricing.labMarkupTiers.length > 0;
  return hasNaturalTiers && hasLabTiers;
}

// Validate step 5
export function validateStep5(state: DiamondWizardState): boolean {
  return state.productSettings.titleTemplate.length > 0 && state.productSettings.skuTemplate.length > 0;
}

// Validate any step
export function validateStep(step: number, state: DiamondWizardState): boolean {
  switch (step) {
    case 1: return validateStep1(state);
    case 2: return validateStep2(state);
    case 3: return validateStep3(state);
    case 4: return validateStep4(state);
    case 5: return validateStep5(state);
    case 6: return true; // review always valid
    default: return false;
  }
}

// LocalStorage key
const STORAGE_KEY = 'diamond-wizard-state';

export function saveWizardState(state: DiamondWizardState, clientId: string) {
  try {
    localStorage.setItem(`${STORAGE_KEY}-${clientId}`, JSON.stringify(state));
  } catch {}
}

export function loadWizardState(clientId: string): DiamondWizardState | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}-${clientId}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export function clearWizardState(clientId: string) {
  try {
    localStorage.removeItem(`${STORAGE_KEY}-${clientId}`);
  } catch {}
}
