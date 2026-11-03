/**
 * Storage-based image URL helper for the Ring Builder wizard (non-DTT clients).
 * Maps (tableName, optionValue) → public URL from the diamond-form-assets bucket.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const BUCKET = 'diamond-form-assets';

/** Maps DB table name → storage folder */
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

/** Maps (table, option_value) → filename in storage */
const fileMap: Record<string, Record<string, string>> = {
  diamond_nature_options: {
    natural: 'natural.png',
    lab: 'lab.png',
  },
  diamond_shape_options: {
    round: 'round.png',
    oval: 'oval.png',
    cushion: 'cushion.png',
    radiant: 'radiant.png',
    emerald: 'emerald.png',
    marquise: 'marquise.png',
    'dutch-marquise': 'dutch-marquise.png',
    'old-mine': 'old-mine.png',
    moval: 'moval.png',
    pear: 'pear.png',
    'colored-diamond': 'colored-diamond.png',
    'portuguese-cut': 'portuguese-cut.png',
    'bowtie-free': 'bowtie-free.png',
    'criss-cut': 'criss-cut.png',
    'step-cut': 'step-cut.png',
    'ruby-sapphire-emerald': 'ruby-sapphire-emerald.png',
  },
  diamond_size_options: {
    '1ct': '1ct.png',
    '1.5ct': '1.5ct.png',
    '2ct': '2ct.png',
    '2.5ct': '2.5ct.png',
    '3ct': '3ct.png',
    '3.5ct': '3.5ct.png',
    '4ct': '4ct.png',
    '4.5ct': '4.5ct.png',
    '5ct+': '5ct+.png',
  },
  diamond_quality_options: {
    'f-vs1': 'f-vs1.png',
    'e-vvs2': 'e-vvs2.png',
    'd-vvs1': 'd-vvs1.png',
  },
  ring_setting_options: {
    'solitaire-classic': 'solitaire-classic.png',
    'cathedral-classic': 'cathedral-classic.png',
    'side-stones-small': 'side-stones-small.png',
    'side-stones-large': 'side-stones-large.png',
    'bypass-setting': 'bypass-setting.png',
    'east-west-setting': 'east-west-setting.png',
    'vintage-art-deco': 'vintage-art-deco.png',
    'toi-et-moi': 'toi-et-moi.png',
  },
  diamond_holder_options: {
    'gallery-rail-classic': 'gallery-rail-classic.png',
    'half-bezel': 'half-bezel.png',
    'full-bezel': 'full-bezel.png',
    'tulip-basket': 'tulip-basket.png',
    'hidden-halo': 'hidden-halo.png',
    'curved-hidden-halo': 'curved-hidden-halo.png',
    'diamond-basket': 'diamond-basket.png',
    'outer-halo': 'outer-halo.png',
  },
  band_type_options: {
    'regular-classic': 'regular-classic.png',
    'pave-diamonds': 'pave-diamonds.png',
    '3-sided-pave': '3-sided-pave.png',
    'hidden-pave': 'hidden-pave.png',
    'channel-diamonds': 'channel-diamonds.png',
    'bubble-band': 'bubble-band.png',
    'split-shank': 'split-shank.png',
    'band-engraving': 'band-engraving.png',
  },
  band_width_options: {
    'thin-1.8mm': 'thin-1.8mm.png',
    'classic-2mm': 'classic-2mm.png',
    'medium-3mm': 'medium-3mm.png',
    'thick-4mm': 'thick-4mm.png',
  },
  ring_metal_options: {
    '14k-yellow-gold': '14k-yellow-gold.png',
    '14k-white-gold': '14k-white-gold.png',
    '18k-yellow-gold': '18k-yellow-gold.png',
    '18k-white-gold': '18k-white-gold.png',
    '14k-rose-gold': '14k-rose-gold.png',
    platinum: 'platinum.png',
    'two-tone': 'two-tone.png',
  },
  personalization_options: {
    'initials-engraving': 'initials-engraving.png',
    'hidden-gemstones': 'hidden-gemstones.png',
    'bridge-diamonds': 'bridge-diamonds.png',
    'bridge-engraving': 'bridge-engraving.png',
    'euroshank-base': 'euroshank-base.png',
    'wedding-band-sit-flush': 'wedding-band-sit-flush.png',
    'low-profile': 'low-profile.png',
    'double-prongs': 'double-prongs.png',
  },
};

/**
 * Get a public storage URL for a diamond form option image.
 * Returns empty string if no mapping exists.
 */
export function getStorageImageUrl(tableName: string, optionValue: string): string {
  const folder = folderMap[tableName];
  const tableFiles = fileMap[tableName];
  if (!folder || !tableFiles) return '';

  const filename = tableFiles[optionValue];
  if (!filename) return '';

  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${folder}/${filename}`;
}
