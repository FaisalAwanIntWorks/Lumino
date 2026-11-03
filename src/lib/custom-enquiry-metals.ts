/**
 * Canonical metal palette & normalization for Custom Enquiry forms.
 * Single source of truth for metal colors, hex values, and legacy alias mapping.
 */

export interface CanonicalMetal {
  value: string;
  label: string;
  hex: string;
}

export const CANONICAL_METALS: CanonicalMetal[] = [
  { value: 'yellow-gold', label: 'Yellow Gold', hex: '#FFD700' },
  { value: 'white-gold',  label: 'White Gold',  hex: '#F1F3F6' },
  { value: 'rose-gold',   label: 'Rose Gold',   hex: '#B76E79' },
  { value: 'platinum',    label: 'Platinum',     hex: '#E5E4E2' },
  { value: 'silver',      label: 'Silver',       hex: '#C0C0C0' },
];

/** Map of canonical value → hex for quick lookups */
const CANONICAL_HEX: Record<string, string> = Object.fromEntries(
  CANONICAL_METALS.map(m => [m.value, m.hex])
);

/** Legacy aliases that should map to a canonical value */
const LEGACY_VALUE_MAP: Record<string, string> = {
  gold: 'yellow-gold',
  yellowgold: 'yellow-gold',
  'yellow gold': 'yellow-gold',
  whitegold: 'white-gold',
  'white gold': 'white-gold',
  rosegold: 'rose-gold',
  'rose gold': 'rose-gold',
};

const LEGACY_LABEL_MAP: Record<string, string> = {
  gold: 'Yellow Gold',
};

/** Label-based hex lookup for custom-added metals (case-insensitive) */
const LABEL_HEX_LOOKUP: Record<string, string> = {
  'yellow gold': '#FFD700',
  'white gold': '#F1F3F6',
  'rose gold': '#B76E79',
  'platinum': '#E5E4E2',
  'silver': '#C0C0C0',
  'palladium': '#CED0DD',
  'copper': '#B87333',
  'brass': '#B5A642',
  'titanium': '#878681',
  'tungsten': '#6E6E6E',
  'cobalt': '#0047AB',
};

/**
 * Normalize a single gold_color entry:
 * - maps legacy "gold" → "yellow-gold" / "Yellow Gold"
 * - overwrites stale hex for known canonical metals
 * - auto-detects hex from label for custom metals
 */
export function normalizeMetal(
  c: { value: string; label: string; hex?: string }
): { value: string; label: string; hex: string } {
  let value = LEGACY_VALUE_MAP[c.value.toLowerCase()] || c.value;
  let label = LEGACY_LABEL_MAP[c.label.toLowerCase()] || c.label;

  // For canonical metals, always use the canonical hex
  if (CANONICAL_HEX[value]) {
    return { value, label, hex: CANONICAL_HEX[value] };
  }

  // For custom metals, try label-based lookup, then keep existing, then fallback
  const hex = LABEL_HEX_LOOKUP[label.toLowerCase()] || c.hex || '#888888';
  return { value, label, hex };
}

/**
 * Normalize an entire gold_colors array:
 * - normalizes each entry
 * - deduplicates by value (first wins)
 * - removes legacy "gold" if "yellow-gold" is also present
 */
export function normalizeGoldColors(
  colors: { value: string; label: string; hex?: string }[]
): { value: string; label: string; hex: string }[] {
  const seen = new Set<string>();
  const result: { value: string; label: string; hex: string }[] = [];

  for (const c of colors) {
    const normalized = normalizeMetal(c);
    if (!seen.has(normalized.value)) {
      seen.add(normalized.value);
      result.push(normalized);
    }
  }

  return result;
}

/**
 * Get the canonical hex for a metal value or label (case-insensitive).
 * Used by render paths to resolve hex for any metal.
 */
export function getMetalHex(valueOrLabel: string): string {
  const lower = valueOrLabel.toLowerCase();
  const mappedValue = LEGACY_VALUE_MAP[lower] || lower;
  return CANONICAL_HEX[mappedValue] || LABEL_HEX_LOOKUP[lower] || '#888888';
}
