// Slug -> GHL picklist label translation for DTT.
// GHL custom fields are RADIO / SINGLE_OPTIONS / MULTIPLE_OPTIONS / CHECKBOX
// whose options hold human labels like "Round" or "1 CT". Our DB stores slugs
// like "round" / "1ct". Without translation the API accepts the write but the
// GHL dropdown UI shows blank.
//
// All labels MUST match the option text returned by
//   GET /locations/{id}/customFields?model=contact
// exactly (including suffixes like " (+$400)"), otherwise GHL ignores them.
//
// The price suffix is stripped before the value leaves for the CRM (see
// stripPriceSuffix) — the lead should read "Rose Gold", not "Rose Gold (+$300)".
// The price itself is still counted in estimated_total. The dictionary keeps
// the suffixes only so it can be compared against GHL's own option text.

import { joinCrmValues } from "./crm-value-format.ts";

/**
 * Trailing price add-on as the forms render it: " (+$300)", "(+$0)",
 * " (+$1,000)", " (+€199.89)". Requires the "+" so a genuine parenthetical
 * such as "Size (7)" is left alone.
 */
const PRICE_SUFFIX_RE = /\s*\(\s*\+\s*[^\d\s()]{0,4}\s*\d[\d.,]*\s*\)\s*$/;

/** "Rose Gold (+$300)" -> "Rose Gold". Values without a suffix are unchanged. */
export function stripPriceSuffix(label: string): string {
  return label.replace(PRICE_SUFFIX_RE, "").trim();
}

/**
 * Shapes that always run the Natural chain, whatever diamond type was picked.
 * Mirrors NATURAL_FLOW_SHAPES in the form hosts (EmbedDiamondsForm.tsx and
 * client/DiamondsForm.tsx).
 */
const NATURAL_FLOW_SHAPES = new Set(["ruby-sapphire-emerald"]);

/**
 * True when the lead went through the Natural chain. That chain shows no
 * prices anywhere in the form, so no price may reach the CRM for it either —
 * only Lab leads carry a quote.
 */
export function isNaturalFlowLead(lead: Record<string, unknown>): boolean {
  const type = String(lead.diamond_type ?? "").trim().toLowerCase();
  const shape = String(lead.diamond_shape ?? "").trim().toLowerCase();
  return type === "natural" || NATURAL_FLOW_SHAPES.has(shape);
}

/** Lead columns that hold a price rather than an answer. */
export const PRICE_QUESTION_KEYS = new Set(["estimated_total"]);

export type DttSlugMap = Record<string, Record<string, string>>;

export const DTT_SLUG_TO_LABEL: DttSlugMap = {
  // RADIO — What type of band do you prefer?
  diamond_band: {
    "regular-classic": "Regular - Classic (+$0)",
    "pave-diamonds": "Pave Diamonds (+$300)",
    "3-sided-pave": "3 Sided Pave (+$500)",
    "hidden-pave": "Hidden Pave (+$400)",
    "channel-diamonds": "Channel Diamonds (+$500)",
    "bubble-band": "Bubble Band (+$500)",
    "split-shank": "Split Shank (+$100)",
    "band-engraving": "Band Engraving (+$1500)",
  },

  // RADIO — What diamond shape would you like?
  diamond_shape: {
    "round": "Round",
    "oval": "Oval",
    "cushion": "Cushion",
    "radiant": "Radiant",
    "emerald": "Emerald",
    "marquise": "Marquise",
    "dutch-marquise": "Dutch Marquise",
    "old-mine": "Old Mine",
    "moval": "Moval",
    "pear": "Pear",
    "colored-diamond": "Colored Diamond",
    "portuguese-cut": "Portuguese Cut",
    "bowtie-free": "Bowtie Free",
    "step-cut": "Step Cut",
    "ruby-sapphire-emerald": "Ruby/Sapphire/Emerald",
    "criss-cut": "Other Option",
  },

  // RADIO — Select your ring diamond size?
  diamond_size: {
    "1ct": "1 CT",
    "1.5ct": "1.5 CT",
    "2ct": "2 CT",
    "2.5ct": "2.5 CT",
    "3ct": "3 CT",
    "3.5ct": "3.5 CT",
    "4ct": "4 CT",
    "4.5ct": "4.5 CT",
    "5ct+": "5 CT+",
  },

  // RADIO — Which ring setting appeals to you?
  diamond_setting: {
    "solitaire-classic": "Solitaire - Classic (+$1000)",
    "cathedral-classic": "Cathedral - Classic (+$1000)",
    "side-stones-small": "Side Stones - Small (+$1300)",
    "side-stones-large": "Side Stones - Large (+$1800)",
    "bypass-setting": "Bypass Setting (+$1200)",
    "east-west-setting": "East-West Setting (+$1000)",
    "vintage-art-deco": "Vintage/Art Deco (+$1400)",
    "toi-et-moi": "Toit Et Moi (+$3000)",
  },

  // RADIO — How should the diamond be held?
  diamond_holder: {
    "gallery-rail-classic": "Gallery Rail - Classic (+$0)",
    "hidden-halo": "Hidden Halo (+$300)",
    "curved-hidden-halo": "Curved Hidden Halo (+$350)",
    "outer-halo": "Outer Halo (+$400)",
    "tulip-basket": "Tulip Basket (+$200)",
    "diamond-basket": "Diamond Basket (+$400)",
    "half-bezel": "Half Bezel (+$150)",
    "full-bezel": "Full Bezel (+$200)",
  },

  // RADIO — Which band width do you prefer?
  diamond_band_width: {
    "thin-1.8mm": "Thin 1.8mm(+$0)",
    "classic-2mm": "Classic 2mm(+$0)",
    "medium-3mm": "Medium 3mm(+$300)",
    "thick-4mm": "Thick 4mm(+$400)",
  },

  // RADIO — Which type of ring metal do you prefer?
  diamond_metal: {
    "14k-yellow-gold": "14k Yellow Gold (+$0)",
    "14k-white-gold": "14k White Gold (+$0)",
    "14k-rose-gold": "14k Rose Gold (+$0)",
    "18k-yellow-gold": "18k Yellow Gold (+$400)",
    "18k-white-gold": "18k White Gold (+$400)",
    "platinum": "Platinum (+$650)",
    "two-tone": "Two Tone Ring (+$500)",
    // Legacy / coarse slugs — default to 14k variant.
    "yellow-gold": "14k Yellow Gold (+$0)",
    "white-gold": "14k White Gold (+$0)",
    "rose-gold": "14k Rose Gold (+$0)",
    "silver": "Platinum (+$650)",
  },

  // TEXT — Which karat / purity would you like? (metal variant chosen after the
  // metal). Slugs come from src/lib/dtt-metal-karats.ts.
  diamond_metal_karat: {
    "10k": "10K",
    "12k": "12K",
    "14k": "14K",
    "18k": "18K",
    "20k": "20K",
    "22k": "22K",
    "24k": "24K",
    "925-sterling": "925 Sterling Silver",
    "999-silver": "999 Silver",
    "958-silver": "958 Silver",
    "900-silver": "900 Silver",
    "pt950": "Pt950",
    "pt900": "Pt900",
    "pt850": "Pt850",
    "pt999": "Pt999",
  },

  // TEXT — Which two metals would you like to combine? (Two Tone only)
  diamond_two_tone_metals: {
    "yellow-white": "Yellow Gold + White Gold",
    "yellow-rose": "Yellow Gold + Rose Gold",
    "white-rose": "White Gold + Rose Gold",
    "yellow-platinum": "Yellow Gold + Platinum",
    "rose-platinum": "Rose Gold + Platinum",
  },

  // TEXT — Would you like natural or lab diamonds? (JewlX)
  // Field is TEXT but we still normalise so it reads cleanly.
  diamond_type: {
    "lab": "Lab",
    "natural": "Natural",
  },

  // RADIO — Select your lab diamond quality
  diamond_quality: {
    "f-vs1": "F Color VS1 Clarity (+$0)",
    "e-vvs2": "E Color VVS2 Clarity (+$400)",
    "d-vvs1": "D Color VVS1 Clarity (+$1500)",
  },

  // RADIO — When do you need this by?
  diamond_timeline: {
    "2-weeks": "6 Weeks (+$1,000)",
    "4-weeks": "6 Weeks (+$1,000)",
    "6-weeks": "6 Weeks (+$1,000)",
    "6-8-weeks": "6-8 Weeks (+$600)",
    "8-10-weeks": "8-10 Weeks (+$400)",
    "12-weeks-plus": "12 Weeks+ (+$0)",
  },

  // CHECKBOX (multi) — Any features to personalize your ring?
  diamond_personalization: {
    "initials-engraving": "Initials Engraving (+$0)",
    "hidden-gemstones": "Hidden Gemstones (+$150)",
    "bridge-diamonds": "Bridge Diamonds (+$300)",
    "bridge-engraving": "Bridge Engraving (+$750)",
    "euroshank-base": "Euroshank Base (+$0)",
    "wedding-band-sit-flush": "Wedding Band Sit Flush (+$0)",
    "low-profile": "Low Profile (+$0)",
    "double-prongs": "Double Prongs (+$0)",
    // "none" intentionally dropped (no matching option).
  },
};

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

export interface GhlFieldMeta {
  id: string;
  dataType: string;
  picklistOptions?: string[];
}

/** Fetch GHL custom field metadata once per sync; returns by id. */
export async function fetchGhlFieldMeta(
  token: string,
  locationId: string,
): Promise<Map<string, GhlFieldMeta>> {
  const res = await fetch(
    `${GHL_BASE}/locations/${encodeURIComponent(locationId)}/customFields?model=contact`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Version: GHL_VERSION,
        Accept: "application/json",
      },
    },
  );
  const body = await res.json().catch(() => ({} as any));
  const map = new Map<string, GhlFieldMeta>();
  for (const f of (body?.customFields ?? []) as any[]) {
    const opts: string[] = [];
    if (Array.isArray(f.picklistOptions)) opts.push(...f.picklistOptions);
    if (Array.isArray(f.picklistImageOptions)) {
      for (const o of f.picklistImageOptions) if (o?.label) opts.push(o.label);
    }
    map.set(f.id, { id: f.id, dataType: f.dataType, picklistOptions: opts });
  }
  return map;
}

const PICKLIST_TYPES = new Set([
  "RADIO",
  "SINGLE_OPTIONS",
  "MULTIPLE_OPTIONS",
  "CHECKBOX",
]);
const MULTI_TYPES = new Set(["MULTIPLE_OPTIONS", "CHECKBOX"]);

export interface TranslatedField {
  id: string;
  value: string | string[];
}

export interface TranslateWarning {
  question_key: string;
  ghl_field_id: string;
  slug: string;
  reason: string;
}

export interface TranslateOptions {
  /**
   * Apply DTT_SLUG_TO_LABEL. True (the default) preserves the original DTT
   * behaviour for every existing caller. Other clients pass false — their GHL
   * picklists hold their own labels and prices, so DTT's dictionary would push
   * the wrong values into their sub-account.
   */
  useDttSlugMap?: boolean;
  /**
   * Natural-flow leads: always send the plain option name, even when GHL's own
   * picklist option still carries "(+$…)". Off by default, so Lab leads keep
   * the exact-option fallback below.
   */
  omitPrices?: boolean;
}

/** Lowercase alphanumerics only, for loose slug↔label comparison. */
function normalizeForMatch(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Best-effort match of a DB slug against the live GHL picklist, used for
 * clients that have no hand-written dictionary. Tries exact text, then a
 * normalised equality, then a normalised prefix so "14k-yellow-gold" still
 * finds "14k Yellow Gold (+$0)". Returns undefined when nothing is close.
 */
function matchPicklistOption(slug: string, options: string[]): string | undefined {
  if (!options.length) return undefined;
  const exact = options.find((o) => o === slug);
  if (exact) return exact;
  const n = normalizeForMatch(slug);
  if (!n) return undefined;
  const equal = options.find((o) => normalizeForMatch(o) === n);
  if (equal) return equal;
  return options.find((o) => normalizeForMatch(o).startsWith(n));
}

/**
 * Translate a raw DB value into a GHL-acceptable customField payload entry.
 * Returns null when the value is empty or unmappable.
 */
export function translateMappingValue(
  questionKey: string,
  ghlFieldId: string,
  rawValue: unknown,
  meta: GhlFieldMeta | undefined,
  warnings: TranslateWarning[],
  options: TranslateOptions = {},
): TranslatedField | null {
  if (rawValue === null || rawValue === undefined || rawValue === "") return null;

  const useDttSlugMap = options.useDttSlugMap !== false;
  const dataType = meta?.dataType ?? "TEXT";
  const picklist = meta?.picklistOptions ?? [];
  const dict = useDttSlugMap ? (DTT_SLUG_TO_LABEL[questionKey] ?? {}) : {};

  // Normalize to array of raw strings, regardless of input shape.
  const rawArr: string[] = Array.isArray(rawValue)
    ? rawValue.map((v) => String(v))
    : typeof rawValue === "object"
    ? [JSON.stringify(rawValue)]
    : [String(rawValue)];

  if (PICKLIST_TYPES.has(dataType)) {
    const labels: string[] = [];
    for (const raw of rawArr) {
      const slug = raw.trim();
      if (!slug) continue;
      // DTT resolves through its dictionary only — unchanged legacy behaviour.
      // Other clients have no dictionary, so fall back to matching the slug
      // against the picklist GHL just returned for this field.
      const dictLabel = dict[slug];
      const matched = dictLabel ?? (useDttSlugMap ? slug : (matchPicklistOption(slug, picklist) ?? slug));
      // CRM gets the plain name. The one exception: when GHL's own picklist
      // option still carries the price text and would only accept the exact
      // string, sending the stripped name would render blank in the GHL
      // dropdown — so the exact option text is kept for that field.
      const stripped = stripPriceSuffix(matched);
      const label =
        !options.omitPrices && picklist.length && !picklist.includes(stripped) && picklist.includes(matched)
          ? matched
          : stripped;
      if (picklist.length && !picklist.includes(label)) {
        warnings.push({
          question_key: questionKey,
          ghl_field_id: ghlFieldId,
          slug,
          reason: `value not in GHL picklist (sent "${label}")`,
        });
        // Still push it — GHL stores raw text and the warning lets us spot it.
      }
      labels.push(label);
    }
    if (!labels.length) return null;
    if (MULTI_TYPES.has(dataType)) {
      return { id: ghlFieldId, value: labels };
    }
    return { id: ghlFieldId, value: labels[0] };
  }

  // TEXT / LARGE_TEXT / NUMERICAL / FILE_UPLOAD / anything else: send as string.
  // Apply slug->label dictionary first so e.g. diamond_type "lab" -> "Lab",
  // then drop any "(+$…)" price suffix so the CRM holds the plain name.
  const mapped = rawArr.map((s) => stripPriceSuffix(dict[s] ?? s));
  const value = joinCrmValues(mapped);
  if (value === "") return null;
  return { id: ghlFieldId, value };
}
