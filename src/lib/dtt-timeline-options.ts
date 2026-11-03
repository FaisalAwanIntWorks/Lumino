/**
 * Timeline choices ("When do you need this by?") for the Quote Estimator (DTT)
 * form.
 *
 * Unlike the other steps the timeline has no option table: a client's list
 * lives in `client_dtt_form_config.form_content.timelineOptions` as an ordered
 * array, edited in Configure → Options → Timeline. No saved list (or an empty
 * one) means the built-in choices below, so existing clients are unchanged.
 */

export interface DttTimelineOption {
  /** Slug stored on the lead (`diamond_form_leads.diamond_timeline`). */
  value: string;
  /** Label shown to the customer. */
  label: string;
  /** Add-on price (USD) counted in the estimate. */
  price: number;
  /** Off hides the choice from the public form. Missing means on. */
  enabled?: boolean;
}

export const DEFAULT_DTT_TIMELINE_OPTIONS: DttTimelineOption[] = [
  { value: '12-weeks-plus', label: '12 Weeks+', price: 0 },
  { value: '6-8-weeks', label: '6 - 8 Weeks', price: 0 },
  { value: '4-weeks', label: '4 Weeks', price: 0 },
  { value: '2-weeks', label: '2 Weeks', price: 500 },
];

/** Most choices a client can keep — the step is a simple two-column grid. */
export const MAX_DTT_TIMELINE_OPTIONS = 12;

/**
 * "12 Weeks+" → "12-weeks-plus", "6 - 8 Weeks" → "6-8-weeks". The lead stores
 * this slug, and the dashboard / CRM turn it back into readable text, so it is
 * always derived from the label the customer actually saw.
 */
export function timelineSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const validPrice = (p: unknown): number =>
  typeof p === 'number' && Number.isFinite(p) && p >= 0 ? p : 0;

/**
 * Tidy a raw list: blank labels dropped, prices sanitised, and each slug
 * rebuilt from its label (de-duplicated with -2, -3 …).
 */
export function normalizeTimelineOptions(list: unknown): DttTimelineOption[] {
  if (!Array.isArray(list)) return [];
  const used = new Set<string>();
  const out: DttTimelineOption[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const label = String((raw as DttTimelineOption).label ?? '').trim();
    if (!label) continue;
    const base = timelineSlug(label) || 'option';
    let value = base;
    for (let n = 2; used.has(value); n++) value = `${base}-${n}`;
    used.add(value);
    const entry: DttTimelineOption = { value, label, price: validPrice((raw as DttTimelineOption).price) };
    if ((raw as DttTimelineOption).enabled === false) entry.enabled = false;
    out.push(entry);
    if (out.length >= MAX_DTT_TIMELINE_OPTIONS) break;
  }
  return out;
}

/** Every choice (on or off) for one client — the saved list, else the built-ins. */
export function getTimelineOptions(config?: DttTimelineOption[] | null): DttTimelineOption[] {
  const saved = normalizeTimelineOptions(config);
  return saved.length ? saved : DEFAULT_DTT_TIMELINE_OPTIONS;
}

/**
 * What the customer sees. If a client switched every choice off the built-ins
 * are shown, so the step can never render with nothing to pick.
 */
export function getEnabledTimelineOptions(config?: DttTimelineOption[] | null): DttTimelineOption[] {
  const enabled = getTimelineOptions(config).filter((o) => o.enabled !== false);
  return enabled.length ? enabled : DEFAULT_DTT_TIMELINE_OPTIONS;
}

/** Resolve the selected choice (label + price) for the summary, lead and emails. */
export function findTimelineOption(
  value: string | null | undefined,
  config?: DttTimelineOption[] | null,
): DttTimelineOption | undefined {
  if (!value) return undefined;
  return getTimelineOptions(config).find((o) => o.value === value)
    ?? DEFAULT_DTT_TIMELINE_OPTIONS.find((o) => o.value === value);
}

/**
 * What to persist: the tidied list, or `undefined` when it is empty or still
 * identical to the built-ins (so `form_content` only stores real changes).
 */
export function cleanTimelineOptionsConfig(config?: DttTimelineOption[] | null): DttTimelineOption[] | undefined {
  const list = normalizeTimelineOptions(config);
  if (!list.length) return undefined;
  const d = DEFAULT_DTT_TIMELINE_OPTIONS;
  const same = list.length === d.length && list.every((o, i) =>
    o.label === d[i].label && o.price === d[i].price && o.enabled !== false);
  return same ? undefined : list;
}
