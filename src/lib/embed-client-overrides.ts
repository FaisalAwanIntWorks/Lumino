/**
 * Per-client Ring OS embed layout overrides.
 *
 * These are deliberately scoped to explicit client IDs so that a layout tweak
 * requested by one customer never changes another customer's live widget.
 *
 * `tabletFit` — Henry's Jewelry (elegant theme, 9 steps incl. Estimate) embeds
 * the widget on a Shopify page that iPad Mini / Air / Pro render at 768–1024px.
 * At those widths the default 60/40 viewer/panel split leaves the options panel
 * ~310px wide and the elegant step bar (all steps visible from `md` up)
 * overflows off-screen. With tabletFit on, the split is 50/50 until `lg` and the
 * step bar keeps the mobile "current ±2" window until `xl`.
 */
export interface EmbedClientOverrides {
  /** 50/50 tablet split, windowed step bar, 800px height cap (see above). */
  tabletFit: boolean;
  /**
   * Elegant step bar: only completed + current steps render sharp; every
   * step the shopper has not been through yet stays faded, even when it is
   * technically reachable (e.g. metal/shape/carat pre-filled with defaults).
   */
  completionStepEmphasis: boolean;
  /**
   * Option info popups (Style/Shank/Metal/Shape/Stone "i" buttons) must not
   * dim the ring viewer behind them. Applied via `body[data-undimmed-popups]`
   * + `.aurezo-info-backdrop` in index.css because the popups portal to body.
   */
  undimmedInfoPopups: boolean;
  /**
   * Elegant step bar: labels are laid out under the circles without widening
   * the column, so wide labels (ENGRAVING / DETAILS / ESTIMATE) no longer push
   * their circles further apart than the rest of the bar.
   */
  uniformStepSpacing: boolean;
}

const NO_OVERRIDES: EmbedClientOverrides = {
  tabletFit: false,
  completionStepEmphasis: false,
  undimmedInfoPopups: false,
  uniformStepSpacing: false,
};

const HENRYS_JEWELRY_CLIENT_ID = '08279731-f36e-45f3-a258-b0f7f31ce177';

const CLIENT_OVERRIDES: Record<string, EmbedClientOverrides> = {
  [HENRYS_JEWELRY_CLIENT_ID]: {
    tabletFit: true,
    completionStepEmphasis: true,
    undimmedInfoPopups: true,
    uniformStepSpacing: true,
  },
};

export const getEmbedClientOverrides = (clientId?: string | null): EmbedClientOverrides =>
  (clientId && CLIENT_OVERRIDES[clientId]) || NO_OVERRIDES;

export const hasTabletFitLayout = (clientId?: string | null): boolean =>
  getEmbedClientOverrides(clientId).tabletFit;

/**
 * Max widget height (px) on tablet+ widths for tabletFit clients.
 *
 * The widget sizes itself to the iframe viewport (`--embed-vh`) and reports its
 * scrollHeight back to the host page, which resizes the iframe to match. In
 * DevTools device emulation (and on some iPads) a cross-origin iframe reports
 * the *device* height (e.g. 1366px) instead of the iframe box, so the widget
 * grew to 1366px, the host iframe followed, and the ring viewer stretched into
 * a tall black column. Capping both the measured viewport and the reported
 * height breaks that loop and keeps the tablet layout at the same ~800px the
 * host snippet uses by default.
 */
export const TABLET_FIT_MAX_EMBED_HEIGHT = 800;

/** Breakpoint (Tailwind `md`) from which the tablet cap applies. */
export const TABLET_FIT_MIN_WIDTH = 768;

export const clampTabletFitHeight = (height: number, viewportWidth: number): number =>
  viewportWidth >= TABLET_FIT_MIN_WIDTH ? Math.min(height, TABLET_FIT_MAX_EMBED_HEIGHT) : height;
