// Centralised constants for the Ring Builder wizard. Extracted from individual
// component files so they can be shared / overridden in one place instead of
// being duplicated across the wizard form, thank-you screen, and onboarding.

export const KARAT_DEFAULT_OPTIONS = ['10K', '12K', '14K', '18K', '20K', '22K', '24K'];

export const STEP_DEFS = [
  { key: 'nature', label: 'NATURE', table: 'diamond_nature_options' as const, heading: ['CHOOSE YOUR', 'DIAMOND'], subtitle: 'Natural or Lab-grown?', useCarousel: true },
  { key: 'shape', label: 'SHAPE', table: 'diamond_shape_options' as const, heading: ['SELECT YOUR', 'SHAPE'], subtitle: 'Choose the diamond shape', useCarousel: true },
  { key: 'size', label: 'SIZE', table: 'diamond_size_options' as const, heading: ['SELECT YOUR', 'SIZE'], subtitle: 'Choose your diamond size', useCarousel: true },
  { key: 'quality', label: 'QUALITY', table: 'diamond_quality_options' as const, heading: ['SELECT', 'QUALITY'], subtitle: 'Choose your diamond quality', useCarousel: true },
  { key: 'setting', label: 'SETTING', table: 'ring_setting_options' as const, heading: ['CHOOSE YOUR', 'SETTING'], subtitle: 'How should the diamond be set?', useCarousel: true },
  { key: 'holder', label: 'HOLDER', table: 'diamond_holder_options' as const, heading: ['SELECT YOUR', 'HOLDER'], subtitle: 'Choose the prong style', useCarousel: true },
  { key: 'band', label: 'BAND', table: 'band_type_options' as const, heading: ['CHOOSE YOUR', 'BAND'], subtitle: 'Select the band type', useCarousel: true },
  { key: 'band_width', label: 'BAND WIDTH', table: 'band_width_options' as const, heading: ['SELECT', 'BAND WIDTH'], subtitle: 'Choose the band width', useCarousel: true },
  { key: 'metal', label: 'METAL', table: 'ring_metal_options' as const, heading: ['SELECT YOUR', 'METAL'], subtitle: 'Choose the metal type', useCarousel: true },
  { key: 'karat', label: 'KARAT', table: '' as const, heading: ['SELECT YOUR', 'KARAT'], subtitle: 'Choose the metal purity', useCarousel: false },
  { key: 'personalization', label: 'PERSONAL', table: 'personalization_options' as const, heading: ['ADD', 'PERSONALIZATION'], subtitle: 'Select any personalizations', useCarousel: true, multiSelect: true },
] as const;

export const DEFAULT_BUDGET_OPTIONS = [
  '$1,000 - $3,000',
  '$3,001 - $6,000',
  '$6,000 - $12,000',
  '$12,001 - $20,000',
  '$20,000+',
];

export const DEFAULT_TIMELINE_OPTIONS = [
  { value: 'asap', label: 'ASAP' },
  { value: '1-2-weeks', label: '1-2 Weeks' },
  { value: '2-4-weeks', label: '2-4 Weeks' },
  { value: '1-2-months', label: '1-2 Months' },
  { value: '3-months-plus', label: '3+ Months' },
  { value: 'no-rush', label: 'No Rush' },
];

// ── Thank-You / AI generation ────────────────────────────────────────────────

export const MAX_GENERATIONS = 3;

// Per-stage durations (ms) for the AI-generation timeline — keep total ≈ 60s.
export const STAGE_DURATIONS = [4000, 4000, 6000, 6000, 15000, 15000, 10000];

// Engraving char advisory threshold: warn after this many chars that thin
// bands may not fit longer engravings (D8).
export const ENGRAVING_ADVISORY_THRESHOLD = 20;
export const ENGRAVING_MAX_LENGTH = 30;

// Custom-instruction max length (server-validated in edge function — D5).
export const CUSTOM_INSTRUCTION_MAX_LENGTH = 200;

// Max reference images sent to the AI (matches buildMultimodalContent slice).
export const MAX_REFERENCE_IMAGES = 4;
