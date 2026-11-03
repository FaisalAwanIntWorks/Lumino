// Diamond preset configurations with base prices
// These prices are used as defaults when generating client diamond presets

export interface DiamondPreset {
  carat: number;
  color: 'H' | 'G' | 'D' | 'E';
  clarity: 'VS1' | 'VS2' | 'VVS2' | 'VVS1';
  basePrice: number;
}

export interface CaratRange {
  label: string;
  min: number;
  max: number;
  carats: number[];
}

// Natural diamond configuration
export const CARAT_RANGES: CaratRange[] = [
  { label: '0.50 - 0.99 ct', min: 0.50, max: 0.99, carats: [0.50, 0.75] },
  { label: '1.00 - 1.49 ct', min: 1.00, max: 1.49, carats: [1.00, 1.25] },
  { label: '1.50 - 1.99 ct', min: 1.50, max: 1.99, carats: [1.50, 1.75] },
  { label: '2.00 - 2.49 ct', min: 2.00, max: 2.49, carats: [2.00] },
];

export const DIAMOND_COLORS = ['H', 'G'] as const;
export const DIAMOND_CLARITIES = ['VS1', 'VS2', 'VVS2'] as const;

// Lab diamond configuration
export const LAB_CARAT_RANGES: CaratRange[] = [
  { label: '0.50 - 0.99 ct', min: 0.50, max: 0.99, carats: [0.50, 0.75] },
  { label: '1.00 - 1.49 ct', min: 1.00, max: 1.49, carats: [1.00, 1.25] },
  { label: '1.50 - 1.99 ct', min: 1.50, max: 1.99, carats: [1.50, 1.75] },
  { label: '2.00 - 2.49 ct', min: 2.00, max: 2.49, carats: [2.00, 2.25] },
  { label: '2.50 - 2.99 ct', min: 2.50, max: 2.99, carats: [2.50, 2.75] },
  { label: '3.00 - 3.49 ct', min: 3.00, max: 3.49, carats: [3.00, 3.25] },
  { label: '3.50 - 3.99 ct', min: 3.50, max: 3.99, carats: [3.50, 3.75] },
  { label: '4.00 - 4.49 ct', min: 4.00, max: 4.49, carats: [4.00] },
];

export const LAB_DIAMOND_COLORS = ['D', 'E'] as const;
export const LAB_DIAMOND_CLARITIES = ['VVS1', 'VVS2'] as const;

// Base prices indexed by carat value, then color, then clarity (Natural Diamonds)
export const DIAMOND_BASE_PRICES: Record<number, Record<string, Record<string, number>>> = {
  0.50: {
    H: { VS1: 1688, VS2: 1500, VVS2: 1875 },
    G: { VS1: 2063, VS2: 1875, VVS2: 2250 },
  },
  0.75: {
    H: { VS1: 2850, VS2: 2550, VVS2: 3150 },
    G: { VS1: 3750, VS2: 3450, VVS2: 4050 },
  },
  1.00: {
    H: { VS1: 6750, VS2: 6300, VVS2: 7200 },
    G: { VS1: 7800, VS2: 7350, VVS2: 8850 },
  },
  1.25: {
    H: { VS1: 9045, VS2: 8505, VVS2: 10260 },
    G: { VS1: 11340, VS2: 10800, VVS2: 12420 },
  },
  1.50: {
    H: { VS1: 13750, VS2: 12875, VVS2: 15000 },
    G: { VS1: 16875, VS2: 15750, VVS2: 18125 },
  },
  1.75: {
    H: { VS1: 16875, VS2: 16250, VVS2: 20625 },
    G: { VS1: 22500, VS2: 20125, VVS2: 23750 },
  },
  2.00: {
    H: { VS1: 27600, VS2: 25200, VVS2: 31800 },
    G: { VS1: 32400, VS2: 30600, VVS2: 38400 },
  },
};

// Lab diamond base prices indexed by carat value, then color, then clarity
export const LAB_DIAMOND_BASE_PRICES: Record<number, Record<string, Record<string, number>>> = {
  0.50: {
    D: { VVS1: 1120, VVS2: 700 },
    E: { VVS1: 980, VVS2: 560 },
  },
  0.75: {
    D: { VVS1: 1260, VVS2: 840 },
    E: { VVS1: 1120, VVS2: 700 },
  },
  1.00: {
    D: { VVS1: 1400, VVS2: 980 },
    E: { VVS1: 1260, VVS2: 840 },
  },
  1.25: {
    D: { VVS1: 1610, VVS2: 1120 },
    E: { VVS1: 1470, VVS2: 980 },
  },
  1.50: {
    D: { VVS1: 1820, VVS2: 1260 },
    E: { VVS1: 1680, VVS2: 1120 },
  },
  1.75: {
    D: { VVS1: 2030, VVS2: 1400 },
    E: { VVS1: 1890, VVS2: 1260 },
  },
  2.00: {
    D: { VVS1: 2240, VVS2: 1540 },
    E: { VVS1: 2100, VVS2: 1400 },
  },
  2.25: {
    D: { VVS1: 2730, VVS2: 1960 },
    E: { VVS1: 2590, VVS2: 1820 },
  },
  2.50: {
    D: { VVS1: 3220, VVS2: 2380 },
    E: { VVS1: 3080, VVS2: 2240 },
  },
  2.75: {
    D: { VVS1: 3710, VVS2: 2800 },
    E: { VVS1: 3570, VVS2: 2660 },
  },
  3.00: {
    D: { VVS1: 4200, VVS2: 3220 },
    E: { VVS1: 4060, VVS2: 3080 },
  },
  3.25: {
    D: { VVS1: 4848, VVS2: 3710 },
    E: { VVS1: 4708, VVS2: 3570 },
  },
  3.50: {
    D: { VVS1: 5425, VVS2: 4200 },
    E: { VVS1: 5285, VVS2: 4060 },
  },
  3.75: {
    D: { VVS1: 6003, VVS2: 4690 },
    E: { VVS1: 5863, VVS2: 4550 },
  },
  4.00: {
    D: { VVS1: 6580, VVS2: 5180 },
    E: { VVS1: 6440, VVS2: 5040 },
  },
};

// Helper function to get base price for a natural diamond configuration
export function getBasePrice(carat: number, color: string, clarity: string): number {
  return DIAMOND_BASE_PRICES[carat]?.[color]?.[clarity] ?? 0;
}

// Helper function to get base price for a lab diamond configuration
export function getLabBasePrice(carat: number, color: string, clarity: string): number {
  return LAB_DIAMOND_BASE_PRICES[carat]?.[color]?.[clarity] ?? 0;
}

// Helper function to get carat range label for a carat value
export function getCaratRangeLabel(carat: number): string {
  const range = CARAT_RANGES.find(r => carat >= r.min && carat <= r.max);
  return range?.label ?? 'Unknown';
}

// Helper function to get lab carat range label for a carat value
export function getLabCaratRangeLabel(carat: number): string {
  const range = LAB_CARAT_RANGES.find(r => carat >= r.min && carat <= r.max);
  return range?.label ?? 'Unknown';
}

// Generate all preset combinations for a given shape (Natural)
export function generatePresetsForShape(shapeId: string): DiamondPreset[] {
  const presets: DiamondPreset[] = [];
  
  for (const range of CARAT_RANGES) {
    for (const carat of range.carats) {
      for (const color of DIAMOND_COLORS) {
        for (const clarity of DIAMOND_CLARITIES) {
          presets.push({
            carat,
            color,
            clarity,
            basePrice: getBasePrice(carat, color, clarity),
          });
        }
      }
    }
  }
  
  return presets;
}

// Generate all lab preset combinations for a given shape
export function generateLabPresetsForShape(shapeId: string): DiamondPreset[] {
  const presets: DiamondPreset[] = [];
  
  for (const range of LAB_CARAT_RANGES) {
    for (const carat of range.carats) {
      for (const color of LAB_DIAMOND_COLORS) {
        for (const clarity of LAB_DIAMOND_CLARITIES) {
          presets.push({
            carat,
            color,
            clarity,
            basePrice: getLabBasePrice(carat, color, clarity),
          });
        }
      }
    }
  }
  
  return presets;
}

// Diamond type options
export const DIAMOND_TYPES = [
  { id: 'natural', label: 'Natural Diamond', description: 'Earth-mined diamonds with traditional value' },
  { id: 'lab', label: 'Lab Grown Diamond', description: 'Ethically created in controlled environments' },
] as const;
