// Per-option enable/disable flags for the Grillz Builder steps.
//
// Steps like Metal / Teeth / Grillz Type already carry their own per-option
// enable flag (inside `enabled_metals`, `top_teeth_options`, `grill_type_options`).
// The remaining image-card steps — Extended Fangs and Open Faced — render a
// fixed Yes/No pair, so their flags live here in a generic
// `{ [stepKey]: { [optionValue]: boolean } }` map persisted on
// `client_grill_config.enabled_options`.

export type GrillEnabledOptions = Record<string, Record<string, boolean>>;

export interface GrillToggleableOption {
  value: string;
  label: string;
  /** Whether this option supports a client-uploaded image override. */
  hasImageOverride: boolean;
  /** Shown under the row in the configurator. */
  hint?: string;
}

/** Steps whose card options are toggled through `enabled_options`. */
export const GRILL_TOGGLEABLE_OPTIONS: Record<string, GrillToggleableOption[]> = {
  fangs: [
    { value: 'yes', label: 'Yes — Extended Fangs', hasImageOverride: true },
    { value: 'no', label: 'No Fangs', hasImageOverride: false, hint: 'Reuses the selected metal image.' },
  ],
  open_faced: [
    { value: 'yes', label: 'Yes — Open Faced', hasImageOverride: true },
    { value: 'no', label: 'Not Open Faced', hasImageOverride: false, hint: 'Reuses the selected metal image.' },
  ],
};

/** Options default to enabled — an absent flag must never hide an existing card. */
export function isGrillOptionEnabled(
  enabledOptions: GrillEnabledOptions | null | undefined,
  stepKey: string,
  optionValue: string,
): boolean {
  return enabledOptions?.[stepKey]?.[optionValue] !== false;
}

/** Immutably sets one option flag, pruning empty maps so the JSONB stays small. */
export function setGrillOptionEnabled(
  enabledOptions: GrillEnabledOptions | null | undefined,
  stepKey: string,
  optionValue: string,
  enabled: boolean,
): GrillEnabledOptions {
  const all: GrillEnabledOptions = { ...(enabledOptions || {}) };
  const step = { ...(all[stepKey] || {}) };
  if (enabled) delete step[optionValue];
  else step[optionValue] = false;
  if (Object.keys(step).length === 0) delete all[stepKey];
  else all[stepKey] = step;
  return all;
}

/** Normalises the stored JSONB, dropping anything that is not a boolean map. */
export function resolveGrillEnabledOptions(raw: unknown): GrillEnabledOptions {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: GrillEnabledOptions = {};
  for (const [stepKey, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const step: Record<string, boolean> = {};
    for (const [optionValue, flag] of Object.entries(value as Record<string, unknown>)) {
      if (typeof flag === 'boolean') step[optionValue] = flag;
    }
    if (Object.keys(step).length) out[stepKey] = step;
  }
  return out;
}

/**
 * Filters a card list for a step, keeping every card when the client somehow
 * disabled all of them — an empty carousel would dead-end the wizard.
 */
export function filterEnabledGrillCards<T extends { value: string }>(
  cards: T[],
  enabledOptions: GrillEnabledOptions | null | undefined,
  stepKey: string,
): T[] {
  const kept = cards.filter(c => isGrillOptionEnabled(enabledOptions, stepKey, c.value));
  return kept.length ? kept : cards;
}
