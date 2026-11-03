/**
 * SINGLE SOURCE OF TRUTH for client feature flags (modules).
 *
 * Every place that gates a module — the `ClientFeatures` type, admin toggle
 * matrix, sidebar, route guards, plan catalog `feature_set` rows and the edge
 * function `FULL_FEATURE_SET` — must derive from this list.
 *
 * ADDING A MODULE: add one entry here, then run `bunx vitest run` — the
 * registry test enumerates the surfaces that still need wiring.
 *
 * Keep `supabase/functions/_shared/feature-registry.ts` in sync (the test
 * checks both lists match).
 */

export type FeatureGroupName = 'RingOS' | 'CustomX' | 'Metal IQ' | 'Platform';

export interface FeatureDefinition {
  /** Key stored in `clients.enabled_features` and `subscription_plans.feature_set`. */
  key: string;
  /** Human label used in the admin matrix. */
  label: string;
  /** Product group this module belongs to. */
  group: FeatureGroupName;
  /** Value used when a client row has no explicit flag. */
  defaultEnabled: boolean;
  /**
   * Widget/product feature that must go dark when the subscription is
   * inactive. Visual-only toggles (branding, experimental UI) are not gated.
   */
  subscriptionGated: boolean;
  /** Shown as its own column in the admin matrix (children of a group). */
  showInMatrix: boolean;
}

export const FEATURE_REGISTRY: FeatureDefinition[] = [
  // Ring OS
  { key: 'product_catalogue', label: 'Catalog', group: 'RingOS', defaultEnabled: true, subscriptionGated: true, showInMatrix: true },
  { key: 'orders', label: 'Orders', group: 'RingOS', defaultEnabled: true, subscriptionGated: true, showInMatrix: true },
  { key: 'embed_branding', label: 'Widget', group: 'RingOS', defaultEnabled: true, subscriptionGated: false, showInMatrix: true },
  { key: 'jewlx_agent', label: 'JewlX Agent', group: 'RingOS', defaultEnabled: true, subscriptionGated: true, showInMatrix: true },

  // Custom X
  { key: 'diamond_form', label: 'Ring Builder', group: 'CustomX', defaultEnabled: true, subscriptionGated: true, showInMatrix: true },
  { key: 'dtt_v2', label: 'Quote Estimator', group: 'CustomX', defaultEnabled: false, subscriptionGated: true, showInMatrix: true },
  { key: 'grillz_builder', label: 'Grillz Builder', group: 'CustomX', defaultEnabled: true, subscriptionGated: true, showInMatrix: true },
  { key: 'custom_enquiry', label: 'Custom Enquiry', group: 'CustomX', defaultEnabled: true, subscriptionGated: true, showInMatrix: true },

  // Metal IQ
  { key: 'metal_buying', label: 'Metal IQ', group: 'Metal IQ', defaultEnabled: false, subscriptionGated: true, showInMatrix: true },

  // Platform-level toggles (not product modules)
  { key: 'experimental_ui', label: 'Experimental UI', group: 'Platform', defaultEnabled: false, subscriptionGated: false, showInMatrix: false },
];

export const FEATURE_KEYS: string[] = FEATURE_REGISTRY.map((f) => f.key);

/** Structural type for the flags object used across the app. */
export interface ClientFeatures {
  diamond_form: boolean;
  embed_branding: boolean;
  product_catalogue: boolean;
  jewlx_agent: boolean;
  orders: boolean;
  custom_enquiry: boolean;
  grillz_builder: boolean;
  experimental_ui: boolean;
  metal_buying: boolean;
  dtt_v2: boolean;
}

export type FeatureKey = keyof ClientFeatures;

export const DEFAULT_FEATURES: ClientFeatures = FEATURE_REGISTRY.reduce(
  (acc, f) => {
    acc[f.key] = f.defaultEnabled;
    return acc;
  },
  {} as Record<string, boolean>,
) as unknown as ClientFeatures;

/** Keys forced off when the subscription is inactive. */
export const GATED_FEATURE_KEYS: FeatureKey[] = FEATURE_REGISTRY
  .filter((f) => f.subscriptionGated)
  .map((f) => f.key as FeatureKey);

export function keysForGroup(group: FeatureGroupName): FeatureKey[] {
  return FEATURE_REGISTRY.filter((f) => f.group === group && f.showInMatrix).map((f) => f.key as FeatureKey);
}

/** Every Custom X module — used by the shared `/diamonds-form` route guard. */
export const CUSTOM_X_FEATURE_KEYS: FeatureKey[] = keysForGroup('CustomX');
export const RING_OS_FEATURE_KEYS: FeatureKey[] = keysForGroup('RingOS');

/** Apply registry defaults over a partial flags object from the database. */
export function withFeatureDefaults(
  features: Record<string, boolean> | null | undefined,
): ClientFeatures {
  const out: Record<string, boolean> = { ...(DEFAULT_FEATURES as unknown as Record<string, boolean>) };
  if (features) {
    for (const key of FEATURE_KEYS) {
      if (typeof features[key] === 'boolean') out[key] = features[key];
    }
  }
  return out as unknown as ClientFeatures;
}

/** Registry keys a plan's `feature_set` does not mention (drift detection). */
export function missingFeatureKeys(
  featureSet: Record<string, unknown> | null | undefined,
): string[] {
  const set = featureSet ?? {};
  return FEATURE_KEYS.filter((k) => typeof (set as Record<string, unknown>)[k] !== 'boolean');
}
