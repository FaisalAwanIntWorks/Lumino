// Ring OS widget — configurable step order.
//
// The wizard always has the same 8 logical steps. Clients can reorder them
// from the Widget configurator, but a few hard data dependencies must be
// preserved (shape must come before carat, which must come before stone —
// the diamond presets are filtered by shape + carat).
//
// We append a synthetic "estimate" step at the end when pricingMode is
// "estimates"; that one is never reorderable.

export type RingStepKey =
  | 'style'
  | 'shank'
  | 'metal'
  | 'shape'
  | 'carat'
  | 'stone'
  | 'engraving'
  | 'details';

export const RING_STEP_KEYS: RingStepKey[] = [
  'style',
  'shank',
  'metal',
  'shape',
  'carat',
  'stone',
  'engraving',
  'details',
];

/**
 * Steps where the user picks exactly one option from a list. When the client
 * enables "Click to Continue", picking an option on one of these steps
 * auto-advances the wizard; the remaining steps (engraving, details,
 * estimate) are free-form and still need an explicit button press.
 */
export const AUTO_ADVANCE_STEP_KEYS: ReadonlySet<string> = new Set([
  'style',
  'shank',
  'metal',
  'shape',
  'carat',
  'stone',
]);

export const isAutoAdvanceStep = (key: string): boolean => AUTO_ADVANCE_STEP_KEYS.has(key);

export const RING_STEP_LABELS: Record<RingStepKey, string> = {
  style: 'STYLE',
  shank: 'SHANK',
  metal: 'METAL',
  shape: 'SHAPE',
  carat: 'CARAT',
  stone: 'STONE',
  engraving: 'ENGRAVING',
  details: 'DETAILS',
};

export const RING_STEP_TITLES: Record<RingStepKey, string> = {
  style: 'Choose Your Style',
  shank: 'Select Band Type',
  metal: 'Select Your Metal',
  shape: 'Select Diamond Shape',
  carat: 'Choose Carat Weight',
  stone: 'Select Your Stone',
  engraving: 'Personalize Your Ring',
  details: 'Final Details',
};

// Validate + repair an order array. Always returns the full set of 8 keys.
// Unknown keys are dropped; missing keys are appended in canonical order.
// Then we enforce shape < carat < stone by reordering only those three
// relative positions without disturbing the user's choices elsewhere.
export function normalizeStepOrder(input?: unknown): RingStepKey[] {
  const arr = Array.isArray(input) ? (input as unknown[]) : [];
  const seen = new Set<RingStepKey>();
  const cleaned: RingStepKey[] = [];
  for (const item of arr) {
    if (typeof item !== 'string') continue;
    const key = item as RingStepKey;
    if (!RING_STEP_KEYS.includes(key) || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(key);
  }
  for (const key of RING_STEP_KEYS) {
    if (!seen.has(key)) cleaned.push(key);
  }

  // Enforce diamond dependency chain: shape → carat → stone.
  // We sort by (position with dependency adjusted) to push later deps after
  // their predecessors without otherwise reshuffling the list.
  const positions = new Map<RingStepKey, number>();
  cleaned.forEach((k, i) => positions.set(k, i));
  const fixOrder = (a: RingStepKey, b: RingStepKey) => {
    const pa = positions.get(a)!;
    const pb = positions.get(b)!;
    if (pa > pb) {
      // Move `a` to be just before `b`.
      cleaned.splice(pa, 1);
      const newIdx = cleaned.indexOf(b);
      cleaned.splice(newIdx, 0, a);
      cleaned.forEach((k, i) => positions.set(k, i));
    }
  };
  fixOrder('shape', 'carat');
  fixOrder('carat', 'stone');
  fixOrder('shape', 'stone');

  return cleaned;
}

export const DEFAULT_RING_STEP_ORDER = normalizeStepOrder(RING_STEP_KEYS);
