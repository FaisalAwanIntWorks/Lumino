import { isWebpCdnUrl } from '@/lib/webp-image-fallback';
import { usesLegacyDiamondImages, usesZaiwarDiamondImages } from '@/lib/diamond-form-cdn';

/** Reference-image contract for the later V3 bucket. Keys are real Sandbox option values, never demo fixture IDs. */
export const V3_IMAGE_KEYS: Record<string, Record<string, string>> = {
  nature: { natural: 'diamond-round', lab: 'diamond-round' },
  shape: { round: 'diamond-round', oval: 'diamond-oval', cushion: 'diamond-cushion', radiant: 'diamond-radiant', emerald: 'diamond-emerald', 'dutch-marquise': 'diamond-marquise', 'old-mine': 'diamond-old-mine', pear: 'diamond-pear' },
  setting: { 'solitaire-classic': 'solitaire', 'cathedral-classic': 'cathedral', 'side-stones-small': 'setting-three-stone', 'east-west-setting': 'setting-east-west', 'vintage-art-deco': 'setting-vintage' },
  holder: { 'half-bezel': 'head-semi-bezel', 'full-bezel': 'head-bezel', 'outer-halo': 'head-halo' },
  band: { 'regular-classic': 'band-regular', 'pave-diamonds': 'band-pave', 'hidden-pave': 'band-hidden-pave', '3-sided-pave': 'band-three-side-pave' },
  band_width: { 'thin-1.8mm': 'width-thin', 'medium-3mm': 'width-medium', 'thick-4mm': 'width-wide' },
  metal: { 'rose-gold': 'metal-rose', 'white-gold': 'metal-white', platinum: 'metal-platinum', 'two-tone': 'metal-two-tone' },
  personalization: { 'initials-engraving': 'feature-initials' },
};

const V3_STOCK_BASE = 'https://d1cekhbdtlmikd.cloudfront.net/jewlx3updatedtransparentimages';

/**
 * V3-only stock pictures (transparent WebP), keyed by step and real Sandbox option value.
 * The option tables are shared with every other client and version, so the V3 set lives
 * here instead of in the database. Options without an entry keep their existing picture.
 */
const V3_STOCK_IMAGES: Record<string, Record<string, string>> = {
  nature: { natural: 'diamond_nature/Natural+Oval+Diamond.webp', lab: 'diamond_nature/Lab+Grown+Oval+Diamond.webp' },
  shape: {
    round: 'diamond_shape/Round+Diamond.webp',
    oval: 'diamond_shape/Oval+Diamond.webp',
    radiant: 'diamond_shape/Radiant+Diamond.webp',
    emerald: 'diamond_shape/Emerald+Cut+Diamond.webp',
    marquise: 'diamond_shape/Marquise+Diamond.webp',
    'dutch-marquise': 'diamond_shape/Dutch+Marquise+Diamond.webp',
    'old-mine': 'diamond_shape/Old+Mine+Cut+Diamond.webp',
    moval: 'diamond_shape/Moval+Diamond.webp',
    pear: 'diamond_shape/Pear+Diamond.webp',
    'colored-diamond': 'diamond_shape/Pink+Oval+Diamond.webp',
    'portuguese-cut': 'diamond_shape/Portuguese+Cut+Diamond.webp',
    'bowtie-free': 'diamond_shape/Brilliant+Cut+Oval+Diamond.webp',
    'step-cut': 'diamond_shape/Pear+Step+Cut+Diamond.webp',
    'ruby-sapphire-emerald': 'diamond_shape/Green+Emerald+Gemstone.webp',
    cushion: 'diamond_shape/Cushion+Diamond.webp',
    'criss-cut': 'diamond_shape/Criss+Cut+Diamond.webp',
    asscher: 'diamond_shape/Asscher.webp',
    'european-cut': 'diamond_shape/European-Cut.webp',
    heart: 'diamond_shape/Heart.webp',
    'old-miner': 'diamond_shape/Old-Miner.webp',
    princess: 'diamond_shape/Princess.webp',
    'rose-cut': 'diamond_shape/Rose-Cut.webp',
    'square-emerald': 'diamond_shape/Square-Emerald.webp',
    'square-radiant': 'diamond_shape/Square-Radiant.webp',
  },
  quality: {
    'd-vvs1': 'diamond_quality/D+Colour+VVS1+Diamond.webp',
    'e-vvs2': 'diamond_quality/E+Colour+VVS2+Diamond.webp',
  },
  size: {
    '1ct': 'diamond_size/1ct.webp',
    '1.5ct': 'diamond_size/1.5ct.webp',
    '2ct': 'diamond_size/2ct.webp',
    '2.5ct': 'diamond_size/2.5ct.webp',
    '3ct': 'diamond_size/3ct.webp',
    '3.5ct': 'diamond_size/3.5ct.webp',
    '4ct': 'diamond_size/4ct.webp',
    '4.5ct': 'diamond_size/4.5ct.webp',
    '5ct+': 'diamond_size/5ct.webp',
  },
  setting: {
    'solitaire-classic': 'ring_setting/Round+Solitaire+Ring.webp',
    'cathedral-classic': 'ring_setting/Cathedral+Ring.webp',
    'side-stones-small': 'ring_setting/Small+Side+Stone+Ring.webp',
    'side-stones-large': 'ring_setting/Large+Side+Stone+Ring.webp',
    'bypass-setting': 'ring_setting/Bypass+Ring.webp',
    'east-west-setting': 'ring_setting/East+West+Setting.webp',
    'vintage-art-deco': 'ring_setting/Art+Deco+Ring.webp',
    'toi-et-moi': 'ring_setting/Toi+et+Moi+Ring.webp',
  },
  holder: {
    'gallery-rail-classic': 'diamond_held/Gallery+Rail+Setting.webp',
    'hidden-halo': 'diamond_held/Hidden+Halo+Ring.webp',
    'curved-hidden-halo': 'diamond_held/Curved+Hidden+Halo+Ring.webp',
    'outer-halo': 'diamond_held/Outer+Halo+Ring.webp',
    'tulip-basket': 'diamond_held/Tulip+Basket+Setting.webp',
    'diamond-basket': 'diamond_held/Diamond+Basket+Setting.webp',
    'half-bezel': 'diamond_held/Half+Bezel+Ring.webp',
    'full-bezel': 'diamond_held/Full+Bezel+Ring.webp',
  },
  band: {
    'regular-classic': 'type_of_band/Classic+Ring.webp',
    'pave-diamonds': 'type_of_band/Pave+Band+Ring.webp',
    '3-sided-pave': 'type_of_band/Three+Sided+Pave+Ring.webp',
    'hidden-pave': 'type_of_band/Hidden+Pave+Ring.webp',
    'channel-diamonds': 'type_of_band/Channel+Set+Ring.webp',
    'bubble-band': 'type_of_band/Bubble+Band+Ring.webp',
    'split-shank': 'type_of_band/Split+Shank+Pave+Ring.webp',
    'band-engraving': 'type_of_band/Engraved+Band+Ring.webp',
  },
  band_width: {
    'thin-1.8mm': 'band_width/mm1.webp',
    'classic-2mm': 'band_width/mm2.webp',
    'medium-3mm': 'band_width/mm3.webp',
    'thick-4mm': 'band_width/mm4.webp',
  },
  metal: {
    'yellow-gold': 'ring_metal/14K+Yellow+Gold+Band.webp',
    'rose-gold': 'ring_metal/14K+Rose+Gold+Band.webp',
    'white-gold': 'ring_metal/14K+White+Gold+Band.webp',
    platinum: 'ring_metal/Platinum+Band.webp',
    silver: 'ring_metal/18K+White+Gold+Band.webp',
    'two-tone': 'ring_metal/Two+Tone+Band.webp',
  },
  personalization: {
    'initials-engraving': 'personalized_ring_features/Initials+Engraving.webp',
    'hidden-gemstones': 'personalized_ring_features/Hidden+Gemstones.webp',
    'bridge-diamonds': 'personalized_ring_features/Bridge+Diamonds.webp',
    'bridge-engraving': 'personalized_ring_features/Bridge+Engraving.webp',
    'euroshank-base': 'personalized_ring_features/Euroshank+Ring.webp',
    'wedding-band-sit-flush': 'ring_metal/White+Metal+Ring+Set.webp',
    'low-profile': 'personalized_ring_features/Low+Profile+Setting.webp',
    'double-prongs': 'personalized_ring_features/Double+Prong+Setting.webp',
  },
};

/** The V3 stock picture for an option, or null when the V3 set has none for it. */
export function quoteV3StockImageUrl(step: string, value: string): string | null {
  const path = V3_STOCK_IMAGES[step]?.[value];
  return path ? `${V3_STOCK_BASE}/${path}` : null;
}

/**
 * True when this account's Ring Builder and Quote Estimator V2 show the same
 * V3 stock pictures as the Sandbox V3 form. Reviewed on Sandbox first, then
 * rolled out to every account; only DTT (original artwork) and Zaiwar (its
 * own image set) keep what they have.
 */
export function usesV3StockImages(clientId?: string | null): boolean {
  return !!clientId && !usesLegacyDiamondImages(clientId) && !usesZaiwarDiamondImages(clientId);
}

/**
 * Options that exist only on the Sandbox V3 form. They are global rows in the
 * shared option tables (migration 20261019120000), so V1, V2, the Ring Builder
 * and their Configure panels skip them here instead of per-client overrides.
 */
const V3_ONLY_OPTIONS: Record<string, ReadonlySet<string>> = {
  shape: new Set(['asscher', 'european-cut', 'heart', 'old-miner', 'princess', 'rose-cut', 'square-emerald', 'square-radiant']),
};

/** True when this option belongs to the V3 form alone. */
export function isQuoteV3OnlyOption(step: string, value: string): boolean {
  return V3_ONLY_OPTIONS[step]?.has(value) ?? false;
}

/**
 * Where the stone sits on each V3 stock picture: the alpha bounding box as a
 * percentage of the (square) canvas, measured with Pillow. The artwork was cut
 * at different footprints (most originals ~74% tall, the later cuts ~85% edge
 * to edge, the Cushion ~63%), so the cards size each picture from this table
 * instead of re-cutting the CDN files. `visual` overrides the size used for
 * balancing when the box overstates the stone (the Princess is drawn rotated
 * 45°, so its box is the diagonal, not the face; a rotated square also reads
 * bulkier than its side, so it is held a little under the others).
 */
interface V3StockImageBox { w: number; h: number; visual?: number }
const V3_STOCK_IMAGE_BOX: Record<string, Record<string, V3StockImageBox>> = {
  shape: {
    round: { w: 73.7, h: 74.3 },
    oval: { w: 51.4, h: 74.3 },
    cushion: { w: 61.6, h: 62.9 },
    pear: { w: 48.3, h: 74.2 },
    emerald: { w: 49.3, h: 74.3 },
    radiant: { w: 53.3, h: 74.3 },
    princess: { w: 84.6, h: 84.6, visual: 70 },
    marquise: { w: 36.7, h: 74.3 },
    'dutch-marquise': { w: 39.4, h: 74.3 },
    'old-mine': { w: 72.0, h: 74.2 },
    moval: { w: 39.4, h: 74.3 },
    'portuguese-cut': { w: 51.5, h: 74.3 },
    'bowtie-free': { w: 51.4, h: 74.3 },
    'step-cut': { w: 47.2, h: 74.3 },
    'criss-cut': { w: 49.3, h: 74.5 },
    asscher: { w: 84.6, h: 80.7 },
    heart: { w: 84.6, h: 79.5 },
    'old-miner': { w: 84.6, h: 79.4 },
    'european-cut': { w: 84.1, h: 84.6 },
    'rose-cut': { w: 84.5, h: 72.4 },
    'colored-diamond': { w: 54.7, h: 74.2 },
    'ruby-sapphire-emerald': { w: 56.2, h: 74.4 },
    'square-emerald': { w: 81.2, h: 84.6 },
    'square-radiant': { w: 84.6, h: 84.4 },
  },
};

/**
 * How a card frames its stone, as a share of the square frame: every stone is
 * brought to the same visual `bulk` (geometric mean of width and height), but
 * a slender stone is never stretched past `maxExtent` on its longest side, so
 * nothing clips.
 */
interface V3CardFit { bulk: number; maxExtent: number }
/** V3 cards show the picture whole inside the media box. */
const V3_CARD_FIT: V3CardFit = { bulk: 66, maxExtent: 86 };
/** V2 / Ring Builder cards zoom the picture into a square frame; the original set used to sit at 93% of it. */
const V2_CARD_FIT: V3CardFit = { bulk: 70, maxExtent: 92 };
/** The V2 card zoom for a V3 picture outside the measured table (settings, bands, metals…). */
const V2_CARD_STOCK_ZOOM = 1.25;

const V3_STOCK_IMAGE_BOX_BY_URL: Map<string, V3StockImageBox> = new Map(
  Object.entries(V3_STOCK_IMAGE_BOX).flatMap(([step, byValue]) =>
    Object.entries(byValue).flatMap(([value, box]) => {
      const url = quoteV3StockImageUrl(step, value);
      return url ? [[url, box] as [string, V3StockImageBox]] : [];
    })
  )
);

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Equal visual bulk across the grid, capped so slender stones stay inside the
 * card: a squat cut (Old Mine, Asscher, Heart) comes down, an elongated one
 * (Pear, Marquise, Moval) comes up, and they read as one size on a phone's
 * three-column grid as well as on desktop.
 */
function balancedScale(box: V3StockImageBox, fit: V3CardFit): number {
  const bulk = box.visual ?? Math.sqrt(box.w * box.h);
  return round3(Math.min(fit.bulk / bulk, fit.maxExtent / Math.max(box.w, box.h)));
}

/** Scale for a V3 card; 1 for pictures outside the measured V3 stock set. */
export function quoteV3StockImageScale(url: string | null | undefined): number {
  const box = url ? V3_STOCK_IMAGE_BOX_BY_URL.get(url) : undefined;
  return box ? balancedScale(box, V3_CARD_FIT) : 1;
}

/**
 * Scale for a V2 / Ring Builder option card: the balanced size for a measured
 * stone picture, the card's plain zoom for every other V3 picture.
 */
export function quoteV3StockImageCardScale(url: string | null | undefined): number {
  const box = url ? V3_STOCK_IMAGE_BOX_BY_URL.get(url) : undefined;
  return box ? balancedScale(box, V2_CARD_FIT) : V2_CARD_STOCK_ZOOM;
}

/** True for a picture from the V3 stock set (edge-to-edge square artwork, no built-in padding). */
export function isQuoteV3StockImageUrl(url: string | null | undefined): boolean {
  return !!url && url.startsWith(`${V3_STOCK_BASE}/`);
}

/** Option table → V3 step key (the Ring Builder and V2 code address options by table). */
const TABLE_TO_V3_STEP: Record<string, string> = {
  diamond_nature_options: 'nature',
  diamond_shape_options: 'shape',
  diamond_size_options: 'size',
  diamond_quality_options: 'quality',
  ring_setting_options: 'setting',
  diamond_holder_options: 'holder',
  band_type_options: 'band',
  band_width_options: 'band_width',
  ring_metal_options: 'metal',
  personalization_options: 'personalization',
};

/** `quoteV3StockImageUrl` keyed by option table instead of step. */
export function quoteV3StockImageForTable(tableName: string, optionValue: string): string | null {
  const step = TABLE_TO_V3_STEP[tableName];
  return step ? quoteV3StockImageUrl(step, optionValue) : null;
}

/**
 * Swap a shared stock picture (or a missing one) for the V3 stock picture of
 * the same option. A picture the jeweler uploaded is never replaced, and an
 * option the V3 set does not cover keeps whatever it had.
 */
export function withV3StockImage<T extends string | null | undefined>(step: string, value: string, existing: T): string | T {
  if (existing && !isWebpCdnUrl(existing)) return existing;
  return quoteV3StockImageUrl(step, value) ?? existing;
}

/** Only absolute HTTPS objects that a jeweler explicitly mapped may replace the existing option picture. */
export function quoteV3ImageUrl(step: string, value: string, existing: string | null, uploaded?: Record<string, string>) {
  const key = V3_IMAGE_KEYS[step]?.[value];
  const candidate = key ? uploaded?.[key] : undefined;
  if (candidate && /^https:\/\/[^\s]+$/i.test(candidate)) return candidate;
  // A picture the jeweler uploaded in Configure wins; the shared stock picture (or none) gives way to the V3 set.
  if (!existing || isWebpCdnUrl(existing)) return quoteV3StockImageUrl(step, value) ?? existing;
  return existing;
}
