import type { DiamondWizardState, MarkupTier } from './types';
import {
  CLARITY_MULTIPLIERS_NATURAL,
  CLARITY_MULTIPLIERS_LAB,
  COLOR_MULTIPLIERS_NATURAL,
  COLOR_MULTIPLIERS_LAB,
  SHAPE_DISCOUNTS,
  WHOLESALE_ANCHORS_NATURAL,
  WHOLESALE_ANCHORS_LAB,
  DEFAULT_MARKUPS_NATURAL,
  DEFAULT_MARKUPS_LAB,
} from './cheat-sheet';

// Shape definitions
export const DIAMOND_SHAPES = [
  { id: 'round', name: 'Round Brilliant' },
  { id: 'princess', name: 'Princess' },
  { id: 'oval', name: 'Oval' },
  { id: 'cushion', name: 'Cushion' },
  { id: 'emerald', name: 'Emerald' },
  { id: 'pear', name: 'Pear' },
  { id: 'marquise', name: 'Marquise' },
  { id: 'radiant', name: 'Radiant' },
] as const;

// Certification labs
export const CERTIFICATION_LABS = [
  { id: 'GIA', name: 'GIA', locked: true, recommended: true },
  { id: 'IGI', name: 'IGI', locked: false, recommended: false },
  { id: 'AGS', name: 'AGS', locked: false, recommended: false },
  { id: 'HRD', name: 'HRD', locked: false, recommended: false },
  { id: 'GCAL', name: 'GCAL', locked: false, recommended: false },
  { id: 'Uncertified', name: 'Uncertified', locked: false, recommended: false },
] as const;

// Color grade groups
export const COLOR_GROUPS = [
  { label: 'Colorless', grades: ['D', 'E', 'F'] },
  { label: 'Near Colorless', grades: ['G', 'H', 'I', 'J'] },
  { label: 'Faint', grades: ['K', 'L', 'M'] },
] as const;

export const ALL_COLOR_GRADES = ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M'];

// Fancy color options
export const FANCY_INTENSITIES = ['Fancy Light', 'Fancy', 'Fancy Intense', 'Fancy Vivid', 'Fancy Deep', 'Fancy Dark'];
export const FANCY_HUES = [
  { name: 'Yellow', color: '#FFD700' },
  { name: 'Pink', color: '#FFB6C1' },
  { name: 'Blue', color: '#6495ED' },
  { name: 'Green', color: '#90EE90' },
  { name: 'Orange', color: '#FFA500' },
  { name: 'Brown', color: '#A0522D' },
  { name: 'Gray', color: '#A9A9A9' },
  { name: 'Black', color: '#333333' },
  { name: 'Red', color: '#DC143C' },
  { name: 'Purple', color: '#9370DB' },
];

// Clarity grade groups
export const CLARITY_GROUPS = [
  { label: 'Flawless', grades: ['FL', 'IF'] },
  { label: 'VVS', grades: ['VVS1', 'VVS2'] },
  { label: 'VS', grades: ['VS1', 'VS2'] },
  { label: 'SI', grades: ['SI1', 'SI2'] },
  { label: 'Included', grades: ['I1', 'I2', 'I3'] },
] as const;

export const ALL_CLARITY_GRADES = ['FL', 'IF', 'VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2', 'I1', 'I2', 'I3'];

// Cut / Polish / Symmetry grades
export const QUALITY_GRADES = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];

// Fluorescence levels
export const FLUORESCENCE_LEVELS = ['None', 'Faint', 'Medium', 'Strong', 'Very Strong'];

// Currencies
export const CURRENCIES = [
  { value: 'USD', label: 'USD ($)', symbol: '$' },
  { value: 'CAD', label: 'CAD (C$)', symbol: 'C$' },
  { value: 'EUR', label: 'EUR (€)', symbol: '€' },
  { value: 'GBP', label: 'GBP (£)', symbol: '£' },
];

// Clarity price modifiers — VS2 = 1.00 baseline (Ring OS Master Cheat Sheet, May 2026)
// NOTE: This is a generic fallback. Stone-type-specific tables live in cheat-sheet.ts.

export const CLARITY_PRICE_MODIFIERS: Record<string, number> = CLARITY_MULTIPLIERS_NATURAL;

// Rounding options
export const ROUNDING_OPTIONS = [
  { value: 'none', label: 'No rounding' },
  { value: '10', label: 'Nearest $10' },
  { value: '50', label: 'Nearest $50' },
  { value: '100', label: 'Nearest $100' },
];

// Standardized carat ranges (0.49ct steps from 0.50 to 5.00)
export const STANDARD_CARAT_RANGES = [
  { label: '0.50 - 0.99 ct', min: 0.50, max: 0.99, display: '0.5' },
  { label: '1.00 - 1.49 ct', min: 1.00, max: 1.49, display: '1' },
  { label: '1.50 - 1.99 ct', min: 1.50, max: 1.99, display: '1.5' },
  { label: '2.00 - 2.49 ct', min: 2.00, max: 2.49, display: '2' },
  { label: '2.50 - 2.99 ct', min: 2.50, max: 2.99, display: '2.5' },
  { label: '3.00 - 3.49 ct', min: 3.00, max: 3.49, display: '3' },
  { label: '3.50 - 3.99 ct', min: 3.50, max: 3.99, display: '3.5' },
  { label: '4.00 - 4.49 ct', min: 4.00, max: 4.49, display: '4' },
  { label: '4.50 - 4.99 ct', min: 4.50, max: 4.99, display: '4.5' },
];

// Title/SKU token pills
export const TITLE_TOKENS = ['{carat}', '{shape}', '{clarity}', '{cut}', '{origin}', '{lab}', '{report_number}'];
export const SKU_TOKENS = ['{shape}', '{clarity}', '{carat}'];

function makeId() {
  return Math.random().toString(36).substr(2, 9);
}

// Default markup tiers — pre-loaded with cheat-sheet wholesale anchors + markups
export const DEFAULT_NATURAL_TIERS: MarkupTier[] = STANDARD_CARAT_RANGES.map((r, i) => ({
  id: makeId(),
  caratFrom: r.min,
  caratTo: r.max,
  markup: DEFAULT_MARKUPS_NATURAL[i] ?? 35,
  purchasingPrice: WHOLESALE_ANCHORS_NATURAL[r.min] ?? 0,
}));

export const DEFAULT_LAB_TIERS: MarkupTier[] = STANDARD_CARAT_RANGES.map((r, i) => ({
  id: makeId(),
  caratFrom: r.min,
  caratTo: r.max,
  markup: DEFAULT_MARKUPS_LAB[i] ?? 80,
  purchasingPrice: WHOLESALE_ANCHORS_LAB[r.min] ?? 0,
}));

// Default wizard state
export const DEFAULT_WIZARD_STATE: DiamondWizardState = {
  diamondType: {
    naturalEnabled: false,
    labGrownEnabled: false,
    labGrowthMethods: [],
    labPostGrowthTreatments: ['None'],
    certifications: ['GIA'],
    conflictFreeOnly: true,
    offerCanadian: false,
  },
  shapes: {
    selectedShapes: [],
  },
  grading: {
    caratRange: [0.50, 5.00],
    colors: ['D', 'E', 'F', 'G', 'H', 'I', 'J'],
    fancyColorEnabled: false,
    fancyIntensities: [],
    fancyHues: [],
    clarities: ['VVS1', 'VVS2', 'VS1', 'VS2', 'SI1', 'SI2'],
    cutGrades: ['Excellent', 'Very Good'],
    polish: ['Excellent', 'Very Good'],
    symmetry: ['Excellent', 'Very Good'],
    fluorescence: ['None', 'Faint', 'Medium'],
    labs: ['GIA', 'IGI'],
  },
  pricing: {
    currency: 'USD',
    pricingMethod: 'percentage',
    naturalMarkupTiers: DEFAULT_NATURAL_TIERS.map(t => ({ ...t, id: makeId() })),
    labMarkupTiers: DEFAULT_LAB_TIERS.map(t => ({ ...t, id: makeId() })),
    priceRounding: '50',
    minimumMargin: 10,
    showTotalPrice: true,
    showPricePerCarat: false,
    showCompareAtPrice: false,
    clarityMultipliersNatural: { ...CLARITY_MULTIPLIERS_NATURAL },
    clarityMultipliersLab: { ...CLARITY_MULTIPLIERS_LAB },
    colorMultipliersNatural: { ...COLOR_MULTIPLIERS_NATURAL },
    colorMultipliersLab: { ...COLOR_MULTIPLIERS_LAB },
    shapeDiscounts: { ...SHAPE_DISCOUNTS },
  },
  productSettings: {
    titleTemplate: '{carat}ct {shape} Diamond - {clarity}',
    skuTemplate: 'DIA-{shape}-{clarity}-{carat}',
    collections: {
      allDiamonds: true,
      perShape: true,
      perOrigin: true,
      perCaratRange: false,
      perColorGroup: false,
    },
  },
};
