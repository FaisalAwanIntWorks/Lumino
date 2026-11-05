/**
 * Backend mirror of `src/lib/feature-registry.ts`.
 *
 * Keep the key list identical — `src/feature-registry.test.ts` fails the build
 * when the two drift apart.
 */

export interface EdgeFeatureDefinition {
  key: string;
  /** Human label used in admin alerts and emails. */
  label: string;
  /** Value used for auto-created (full-access) plans. */
  fullAccess: boolean;
  /**
   * Customer-facing widget module that goes dark when billing blocks the
   * client. Mirrors `subscriptionGated` in the frontend registry.
   */
  subscriptionGated: boolean;
}

export const FEATURE_REGISTRY: EdgeFeatureDefinition[] = [
  { key: "product_catalogue", label: "Catalog", fullAccess: true, subscriptionGated: true },
  { key: "orders", label: "Orders", fullAccess: true, subscriptionGated: true },
  { key: "embed_branding", label: "Widget", fullAccess: true, subscriptionGated: false },
  { key: "jewlx_agent", label: "Aurezo Agent", fullAccess: true, subscriptionGated: true },
  { key: "diamond_form", label: "Ring Builder", fullAccess: true, subscriptionGated: true },
  { key: "dtt_v2", label: "Quote Estimator", fullAccess: true, subscriptionGated: true },
  { key: "grillz_builder", label: "Grillz Builder", fullAccess: true, subscriptionGated: true },
  { key: "custom_enquiry", label: "Custom Enquiry", fullAccess: true, subscriptionGated: true },
  { key: "metal_buying", label: "Metal IQ", fullAccess: true, subscriptionGated: true },
  // Platform toggle — never auto-enabled.
  { key: "experimental_ui", label: "Experimental UI", fullAccess: false, subscriptionGated: false },
];

export const FEATURE_KEYS: string[] = FEATURE_REGISTRY.map((f) => f.key);

/** Every module switched on — used for auto-created Stripe plans. */
export const FULL_FEATURE_SET: Record<string, boolean> = FEATURE_REGISTRY.reduce(
  (acc, f) => {
    acc[f.key] = f.fullAccess;
    return acc;
  },
  {} as Record<string, boolean>,
);

/** Widget modules that billing can switch off (subscription-gated). */
export const GATED_FEATURE_KEYS: string[] = FEATURE_REGISTRY
  .filter((f) => f.subscriptionGated)
  .map((f) => f.key);

/** Registry keys a plan's feature_set does not mention. */
export function missingFeatureKeys(
  featureSet: Record<string, unknown> | null | undefined,
): string[] {
  const set = featureSet ?? {};
  return FEATURE_KEYS.filter((k) => typeof set[k] !== "boolean");
}

/** Human label for a module key (falls back to the raw key). */
export function featureLabel(key: string): string {
  return FEATURE_REGISTRY.find((f) => f.key === key)?.label ?? key;
}

/**
 * Every module explicitly OFF — the starting flags for a client created by a
 * Stripe payment. Admins switch modules on by hand; billing never does. All
 * keys are written because a missing key is treated as enabled by the embeds.
 */
export const MODULES_OFF_FEATURE_SET: Record<string, boolean> = FEATURE_REGISTRY.reduce(
  (acc, f) => {
    acc[f.key] = false;
    return acc;
  },
  {} as Record<string, boolean>,
);
