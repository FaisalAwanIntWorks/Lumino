// Diamond Catalog Wizard - Type Definitions

export interface DiamondTypeConfig {
  naturalEnabled: boolean;
  labGrownEnabled: boolean;
  labGrowthMethods: string[]; // 'HPHT' | 'CVD'
  labPostGrowthTreatments: string[]; // 'None' | 'HPHT Treated'
  certifications: string[]; // 'GIA' | 'IGI' | 'AGS' | 'HRD' | 'GCAL' | 'Uncertified'
  conflictFreeOnly: boolean;
  offerCanadian: boolean;
}

export interface ShapesConfig {
  selectedShapes: string[];
}

export interface GradingConfig {
  caratRange: [number, number]; // [min, max]
  colors: string[];
  fancyColorEnabled: boolean;
  fancyIntensities: string[];
  fancyHues: string[];
  clarities: string[];
  cutGrades: string[]; // Only for Round
  polish: string[];
  symmetry: string[];
  fluorescence: string[];
  labs: string[];
  // Measurements (length in mm) — narrows pool matches further
  measurementsMinLength?: number | null;
  measurementsMaxLength?: number | null;
}

export interface MarkupTier {
  id: string;
  caratFrom: number;
  caratTo: number | null; // null = "+"
  markup: number;
  purchasingPrice: number;
}

export interface PricingConfig {
  currency: string;
  pricingMethod: 'percentage' | 'fixed_margin' | 'manual';
  naturalMarkupTiers: MarkupTier[];
  labMarkupTiers: MarkupTier[];
  priceRounding: string; // 'none' | '10' | '50' | '100'
  minimumMargin: number;
  showTotalPrice: boolean;
  showPricePerCarat: boolean;
  showCompareAtPrice: boolean;
  // Cheat-sheet driven multipliers (optional for backward compatibility — fall back to defaults)
  clarityMultipliersNatural?: Record<string, number>;
  clarityMultipliersLab?: Record<string, number>;
  colorMultipliersNatural?: Record<string, number>;
  colorMultipliersLab?: Record<string, number>;
  shapeDiscounts?: Record<string, number>;
}

export interface ProductSettingsConfig {
  titleTemplate: string;
  skuTemplate: string;
  collections: {
    allDiamonds: boolean;
    perShape: boolean;
    perOrigin: boolean;
    perCaratRange: boolean;
    perColorGroup: boolean;
  };
}

export interface DiamondWizardState {
  diamondType: DiamondTypeConfig;
  shapes: ShapesConfig;
  grading: GradingConfig;
  pricing: PricingConfig;
  productSettings: ProductSettingsConfig;
}

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

export const WIZARD_STEPS = [
  { id: 1 as WizardStep, title: 'Type', label: 'Diamond Type' },
  { id: 2 as WizardStep, title: 'Shapes', label: 'Shapes' },
  { id: 3 as WizardStep, title: 'Grading', label: 'Grading' },
  { id: 4 as WizardStep, title: 'Pricing', label: 'Pricing' },
  { id: 5 as WizardStep, title: 'Product', label: 'Product Settings' },
  { id: 6 as WizardStep, title: 'Review', label: 'Review & Activate' },
] as const;
