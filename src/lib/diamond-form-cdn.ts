/**
 * CDN image URL mappings for Diamond Form steps.
 * Images are served directly from CloudFront CDN, not fetched from the database.
 */

/** CDN base for DTT Legacy Form */
const DTT_LEGACY_CDN_BASE = 'https://d3hry6a3ciae6y.cloudfront.net/DiamondsCatalog';

/** CDN base for Ring Builder Form (original CDN) */
const RING_BUILDER_CDN_BASE = 'https://d2ybchbsrb165p.cloudfront.net/GenericDttFormImagesTransparent';

/** Transparent CDN base used for the Quote Estimator Form (all clients except the legacy ones below). */
const DTT_TRANSPARENT_CDN_BASE = RING_BUILDER_CDN_BASE;

/**
 * Zaiwar's own Quote Estimator artwork. Same bucket, folders and filenames as
 * the legacy DTT set — only the top-level folder differs — and published as
 * WebP only. See `dttimagesurlset/dtt-form-image-urls-zaiwar.md`.
 */
const ZAIWAR_CDN_BASE = 'https://d3hry6a3ciae6y.cloudfront.net/DiamondCatalogZaiwar';

/**
 * Quote Estimator clients that keep the ORIGINAL (non-transparent) CDN images.
 * Every other client — and every new/default account — gets the transparent set.
 */
export const DTT_CLIENT_ID = 'aeec6491-bd1f-4787-97f9-6a47a2ddc8af';
export const LEGACY_DIAMOND_IMAGE_CLIENT_IDS = new Set<string>([DTT_CLIENT_ID]);

/** Zaiwar — the one client served from its own `DiamondCatalogZaiwar` image set. */
export const ZAIWAR_CLIENT_ID = '9b2d6cad-2890-4eed-bf3a-1cd9279b4fe1';

/** True when this client should keep the original DTT CDN images (DTT only). */
export function usesLegacyDiamondImages(clientId?: string | null): boolean {
  return !!clientId && LEGACY_DIAMOND_IMAGE_CLIENT_IDS.has(clientId);
}

/** True when this client is served from Zaiwar's own image set. */
export function usesZaiwarDiamondImages(clientId?: string | null): boolean {
  return clientId === ZAIWAR_CLIENT_ID;
}

/**
 * Rewrite a legacy DTT CloudFront image URL to the transparent CDN.
 * Only URLs on the legacy base are changed; client-uploaded custom images and
 * local asset paths are returned untouched.
 */
export function toTransparentDiamondCdn(url: string): string {
  if (!url) return url;
  return url.split(DTT_LEGACY_CDN_BASE).join(DTT_TRANSPARENT_CDN_BASE);
}

/**
 * Rewrite a legacy DTT CloudFront image URL to its WebP twin.
 * The same artwork is published on that bucket as both .png and .webp, and the
 * Quote Estimator serves the (far smaller) WebP set for DTT. Only URLs on the
 * legacy base are touched — the transparent CDN, the Ring Builder CDN, client
 * uploads and local asset paths are returned untouched. `DiamondOptionImage`
 * falls back to the .png if a WebP twin is ever missing.
 */
export function toWebpDiamondCdn(url: string): string {
  if (!url || !url.startsWith(DTT_LEGACY_CDN_BASE)) return url;
  return url.replace(/\.png(?=$|[?#])/i, '.webp');
}

/** Local asset DTT uses for `low-profile` instead of a CDN file. */
const LOW_PROFILE_LOCAL_IMAGE = '/images/low-profile-option.png';

/** The CDN path (folder/filename, no extension) that same option has on the CDN. */
const LOW_PROFILE_CDN_PATH = 'personalized_ring_features/Low+Profile(%2B%240)';

/**
 * Point a resolved Quote Estimator image at Zaiwar's own artwork.
 *
 * Zaiwar's set mirrors the legacy DTT folders and filenames, so a URL on either
 * shared CDN (and the local `low-profile` asset) is re-pointed at the Zaiwar
 * base as WebP — no option falls back to the shared/transparent artwork.
 * Anything else — a client-uploaded custom image, some other host — is
 * returned untouched.
 */
export function toZaiwarDiamondCdn(url: string): string {
  if (!url) return url;

  let path: string | null = null;
  if (url === LOW_PROFILE_LOCAL_IMAGE) {
    path = LOW_PROFILE_CDN_PATH;
  } else if (url.startsWith(`${DTT_LEGACY_CDN_BASE}/`)) {
    path = url.slice(DTT_LEGACY_CDN_BASE.length + 1);
  } else if (url.startsWith(`${DTT_TRANSPARENT_CDN_BASE}/`)) {
    path = url.slice(DTT_TRANSPARENT_CDN_BASE.length + 1);
  }
  if (path === null) return url;

  // Rebuild on the extension-less path — the sets share every folder and
  // filename and differ only in `.png` vs `.webp`.
  return `${ZAIWAR_CDN_BASE}/${path.replace(/\.(png|webp)(?=$|[?#])/i, '')}.webp`;
}

/**
 * Zaiwar options whose artwork is not at the mirrored path.
 *
 * `white-gold` and `silver` both resolve to the shared `14k White Gold` file,
 * which Zaiwar's set does not have, so the client picked a stand-in for each.
 */
const zaiwarFullUrlOverrides: Record<string, Record<string, string>> = {
  ring_metal_options: {
    'white-gold': `${ZAIWAR_CDN_BASE}/ring_metal/Platinum+(%2B%24650).webp`,
    'silver': 'https://diamondcatalogue.s3.us-east-1.amazonaws.com/DiamondCatalogZaiwar/ring_metal/Silver.webp',
  },
};

/**
 * The image one Zaiwar option should show: its own upload if it has one, then
 * any override above, otherwise the mirrored file in Zaiwar's set.
 */
export function getZaiwarDiamondImageUrl(
  tableName: string,
  optionValue: string,
  resolvedUrl: string
): string {
  const mapped = toZaiwarDiamondCdn(resolvedUrl);
  // Anything `toZaiwarDiamondCdn` left alone is a client upload or another
  // host, and keeps precedence over the override.
  if (resolvedUrl && mapped === resolvedUrl) return resolvedUrl;

  return zaiwarFullUrlOverrides[tableName]?.[optionValue] ?? mapped;
}

/** Full-URL overrides for DTT Legacy Form only */
const dttLegacyFullUrlOverrides: Record<string, Record<string, string>> = {
  personalization_options: {
    'low-profile': LOW_PROFILE_LOCAL_IMAGE,
  },
};

/** Full-URL overrides for Ring Builder only (bypasses folder/filename construction) */
const ringBuilderFullUrlOverrides: Record<string, Record<string, string>> = {
  band_width_options: {
    'thin-1.8mm': 'https://d2lo9ju43icaaa.cloudfront.net/DTTRingBuilder/57.png',
    'classic-2mm': 'https://dttringbuildersimages.s3.us-east-1.amazonaws.com/DTTRingBuilder/58.png',
    'medium-3mm': 'https://dttringbuildersimages.s3.us-east-1.amazonaws.com/DTTRingBuilder/59.png',
    'thick-4mm': 'https://dttringbuildersimages.s3.us-east-1.amazonaws.com/DTTRingBuilder/60.png',
  },
  ring_metal_options: {
    '14k-yellow-gold': 'https://d2lo9ju43icaaa.cloudfront.net/DTTRingBuilder/14k+Yellow+Gold+(%2B%240).png',
    '14k-white-gold': 'https://d2lo9ju43icaaa.cloudfront.net/DTTRingBuilder/14k+White+Gold+(%2B%240).png',
    '18k-yellow-gold': 'https://d2lo9ju43icaaa.cloudfront.net/DTTRingBuilder/18k+Yellow+Gold+(%2B%24400).png',
    '18k-white-gold': 'https://d2lo9ju43icaaa.cloudfront.net/DTTRingBuilder/18k+White+Gold+(%2B%24400).png',
    '14k-rose-gold': 'https://d2lo9ju43icaaa.cloudfront.net/DTTRingBuilder/14k+Rose+Gold+(%2B%240).png',
    'platinum': 'https://d2lo9ju43icaaa.cloudfront.net/DTTRingBuilder/Platinum+(%2B%24650).png',
    'two-tone': 'https://d2lo9ju43icaaa.cloudfront.net/DTTRingBuilder/Two+Tone+Ring+(%2B%24500).png',
    // Legacy fallbacks
    'yellow-gold': 'https://d2lo9ju43icaaa.cloudfront.net/DTTRingBuilder/14k+Yellow+Gold+(%2B%240).png',
    'white-gold': 'https://d2lo9ju43icaaa.cloudfront.net/DTTRingBuilder/14k+White+Gold+(%2B%240).png',
    'silver': 'https://d2lo9ju43icaaa.cloudfront.net/DTTRingBuilder/14k+White+Gold+(%2B%240).png',
    'rose-gold': 'https://d2lo9ju43icaaa.cloudfront.net/DTTRingBuilder/14k+Rose+Gold+(%2B%240).png',
  },
};

/** Maps each step's option_value to its CDN filename */
const cdnFileMap: Record<string, Record<string, string>> = {
  diamond_nature_options: {
    natural: 'Natural+Diamond.png',
    lab: 'Lab+Diamond.png',
  },
  diamond_shape_options: {
    round: 'Round.png',
    oval: 'Oval.png',
    cushion: 'Cushion.png',
    radiant: 'radiant.png',
    emerald: 'emerald.png',
    marquise: 'marquise.png',
    'dutch-marquise': 'dutch+marquise.png',
    'old-mine': 'old+mine.png',
    moval: 'moval.png',
    pear: 'pear.png',
    'colored-diamond': 'colored+diamond.png',
    'portuguese-cut': 'portugese+cut.png',
    'bowtie-free': 'bowtee+free.png',
    'criss-cut': 'other+option.png',
    'step-cut': 'step+cut.png',
    'ruby-sapphire-emerald': 'ruby_sp_eme.png',
  },
  diamond_size_options: {
    '1ct': '1ct.png',
    '1.5ct': '1.5+ct.png',
    '2ct': '2ct.png',
    '2.5ct': '2.5ct.png',
    '3ct': '3ct.png',
    '3.5ct': '3.5ct.png',
    '4ct': '4ct.png',
    '4.5ct': '4.5ct.png',
    '5ct+': '5ct%2B.png',
  },
  diamond_quality_options: {
    'f-vs1': 'E+Color+VVS2+Clarity+(%2B%24400).png',
    'e-vvs2': 'E+Color+VVS2+Clarity+(%2B%24400).png',
    'd-vvs1': 'D+Color+VVS1+Clarity+(%2B%241500).png',
  },
  ring_setting_options: {
    'solitaire-classic': 'Solitaire+-+Classic+(%2B%241000).png',
    'cathedral-classic': 'Cathedral+-+Classic+(%2B%241000).png',
    'side-stones-small': 'Side+Stones+-+Small+(%2B%241300).png',
    'side-stones-large': 'Side+Stones+-+Large+(%2B%241800).png',
    'bypass-setting': 'Bypass+Setting+(%2B%241200).png',
    'east-west-setting': 'East-West+Setting+(%2B%241000).png',
    'vintage-art-deco': 'Vintage_Art+Deco+(%2B%241400).png',
    'toi-et-moi': 'Toit+Et+Moi+(%2B%243000).png',
  },
  diamond_holder_options: {
    'gallery-rail-classic': 'Gallery+Rail+-+Classic+(%2B%240).png',
    'half-bezel': 'Half+Bezel+(%2B%24150).png',
    'full-bezel': 'Full+Bezel+(%2B%24200).png',
    'tulip-basket': 'Tulip+Basket+(%2B%24200).png',
    'hidden-halo': 'Hidden+Halo+(%2B%24300).png',
    'curved-hidden-halo': 'Curved+Hidden+Halo+(%2B%24350).png',
    'diamond-basket': 'Diamond+Basket+(%2B%24400).png',
    'outer-halo': 'Outer+Halo+(%2B%24400).png',
  },
  band_type_options: {
    'regular-classic': 'Regular+-+Classic+(%2B%240).png',
    'pave-diamonds': 'Pave+Diamonds+(%2B%24300).png',
    '3-sided-pave': '3+Sided+Pave+(%2B%24500).png',
    'hidden-pave': 'Hidden+Pave+(%2B%24400).png',
    'channel-diamonds': 'Channel+Diamonds+(%2B%24500).png',
    'bubble-band': 'Bubble+Band+(%2B%24500).png',
    'split-shank': 'Band+Engraving+(%2B%241500).png',
    'band-engraving': 'Split+Shank+(%2B%24100).png',
  },
  band_width_options: {
    'thin-1.8mm': 'mm1.png',
    'classic-2mm': 'mm2.png',
    'medium-3mm': 'mm3.png',
    'thick-4mm': 'mm4.png',
  },
  ring_metal_options: {
    '14k-yellow-gold': '14k+Yellow+Gold+(%2B%240).png',
    '14k-white-gold': '14k+White+Gold+(%2B%240).png',
    '18k-yellow-gold': '18k+Yellow+Gold+(%2B%24400).png',
    '18k-white-gold': '18k+White+Gold+(%2B%24400).png',
    '14k-rose-gold': '14k+Rose+Gold+(%2B%240).png',
    'platinum': 'Platinum+(%2B%24650).png',
    'two-tone': 'Two+Tone+Ring+(%2B%24500).png',
    // Legacy fallbacks
    'yellow-gold': '14k+Yellow+Gold+(%2B%240).png',
    'white-gold': '14k+White+Gold+(%2B%240).png',
    'silver': '14k+White+Gold+(%2B%240).png',
    'rose-gold': '14k+Rose+Gold+(%2B%240).png',
  },
  personalization_options: {
    'initials-engraving': 'Initials+Engraving+(%2B%240).png',
    'hidden-gemstones': 'Hidden+Gemstones+(%2B%24150).png',
    'bridge-diamonds': 'Bridge+Diamonds+(%2B%24300).png',
    'bridge-engraving': 'Bridge+Engraving+(%2B%24750).png',
    'euroshank-base': 'Euroshank+Base(%2B%240).png',
    'wedding-band-sit-flush': 'Wedding+Band+sit+Flush+(%2B%240).png',
    'low-profile': 'Low+Profile(%2B%240).png',
    'double-prongs': 'Double+Prongs+(%2B%240).png',
  },
};

/** Maps table name to CDN subfolder */
const folderMap: Record<string, string> = {
  diamond_nature_options: 'diamond_nature',
  diamond_shape_options: 'diamond_shape',
  diamond_size_options: 'diamond_size',
  diamond_quality_options: 'diamond_quality',
  ring_setting_options: 'ring_setting',
  diamond_holder_options: 'diamond_held',
  band_type_options: 'type_of_band',
  band_width_options: 'band_width',
  ring_metal_options: 'ring_metal',
  personalization_options: 'personalized_ring_features',
};

/**
 * Get the CDN image URL for a diamond form option.
 * @param tableName - The DB table name (used to determine step category)
 * @param optionValue - The option_value from the database
 * @returns Full CDN URL or empty string if not found
 */
export function getDiamondFormImageUrl(tableName: string, optionValue: string): string {
  // Check DTT-specific overrides first
  const overrides = dttLegacyFullUrlOverrides[tableName];
  if (overrides && overrides[optionValue]) {
    return overrides[optionValue];
  }

  const folder = folderMap[tableName];
  const fileMap = cdnFileMap[tableName];
  
  if (!folder || !fileMap) return '';
  
  const filename = fileMap[optionValue];
  if (!filename) return '';
  
  return `${DTT_LEGACY_CDN_BASE}/${folder}/${filename}`;
}

/**
 * Get the CDN image URL for Ring Builder form (uses original CDN).
 */
export function getRingBuilderImageUrl(tableName: string, optionValue: string): string {
  // Check for full-URL overrides first (Ring Builder specific)
  const overrides = ringBuilderFullUrlOverrides[tableName];
  if (overrides && overrides[optionValue]) {
    return overrides[optionValue];
  }

  const folder = folderMap[tableName];
  const fileMap = cdnFileMap[tableName];
  
  if (!folder || !fileMap) return '';
  
  const filename = fileMap[optionValue];
  if (!filename) return '';
  
  return `${RING_BUILDER_CDN_BASE}/${folder}/${filename}`;
}
