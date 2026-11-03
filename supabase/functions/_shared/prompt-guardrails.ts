/**
 * Shared prompt guardrails for AI image generation edge functions.
 * Sanitizes user-provided custom instructions and provides system-level constraints.
 */

const MAX_INSTRUCTION_LENGTH = 200;

const BLOCKED_PATTERNS: RegExp[] = [
  // Prompt injection attempts
  /ignore\s+(previous|above|all|prior)/i,
  /forget\s+(everything|previous|above|all)/i,
  /disregard\s+(previous|above|all|prior)/i,
  /override\s+(previous|above|system|instructions)/i,
  /system\s*prompt/i,
  /you\s+are\s+now/i,
  /act\s+as\s+(a|an)\s+(?!jewel)/i,
  /pretend\s+(you|to\s+be)/i,
  /new\s+instructions/i,
  /do\s+not\s+follow/i,
  /bypass/i,
  /jailbreak/i,

  // NSFW / inappropriate
  /\bnude/i,
  /\bnaked/i,
  /\bnsfw/i,
  /\bporn/i,
  /\bsexual/i,
  /\berotic/i,
  /\bviolence\b/i,
  /\bviolent\b/i,
  /\bgore\b/i,
  /\bblood\b/i,
  /\bkill/i,
  /\bdrug/i,
  /\bexplicit/i,

  // Non-jewelry subjects
  /\bweapon/i,
  /\bgun\b/i,
  /\bknife\b/i,
  /\bbomb/i,
  /\bperson\b/i,
  /\bpeople\b/i,
  /\bface\b/i,
  /\bhuman\b/i,
  /\bchild/i,
  /\banimal\b/i,
  /\bcar\b/i,
  /\bvehicle/i,
  /\bhouse\b/i,
  /\bbuilding\b/i,
  /\blandscape/i,
  /\bfood\b/i,
];

/**
 * Jewelry slang → visual description mapping.
 * These terms are common in the custom jewelry industry and must be
 * translated into explicit visual language so the AI renders them correctly
 * instead of treating them as literal text.
 */
const JEWELRY_GLOSSARY: [RegExp, string][] = [
  [/\biced[\s-]?out\b/gi, "surface fully covered with small round-cut diamonds in a dense pavé setting"],
  [/\biced\b/gi, "covered with small round-cut diamonds in a pavé setting"],
  [/\bflooded\b/gi, "densely covered with diamonds across the entire surface"],
  [/\bbust[\s-]?down\b/gi, "fully encrusted with diamonds on every visible surface"],
  [/\bbuss[\s-]?down\b/gi, "fully encrusted with diamonds on every visible surface"],
  [/\bfully\s+loaded\b/gi, "completely covered with diamonds"],
  [/\bVVS\b/g, "very-very-slightly included (extremely clear, bright diamonds)"],
  [/\bVS\b/g, "very-slightly included (high clarity diamonds)"],
  [/\bSI\b/g, "slightly included (good clarity diamonds)"],
  [/\bmoissanite\b/gi, "moissanite gemstones (similar brilliance to diamonds, double-refractive sparkle)"],
  [/\bgraphic\b/gi, "custom-shaped silhouette design"],
  [/\bbaguette\b/gi, "rectangular step-cut stones (baguette cut)"],
  [/\bprong[\s-]?set\b/gi, "individual prong-mounted stones"],
  [/\bchannel[\s-]?set\b/gi, "stones set between two parallel metal walls"],
  [/\bbezel[\s-]?set\b/gi, "stones wrapped in a thin metal rim"],
  [/\bmicro[\s-]?pave\b/gi, "very small diamonds set closely together in micro-pavé"],
  [/\bhoney[\s-]?comb\b/gi, "hexagonal cutout pattern (honeycomb structure)"],
  [/\bCuban\b/gi, "interlocking oval link pattern (Cuban chain style)"],
  [/\brope\b/gi, "twisted strand pattern (rope chain style)"],
  [/\bFranco\b/gi, "V-shaped interlocking link pattern (Franco chain style)"],
  [/\btwo[\s-]?tone\b/gi, "combination of two different metal colors (e.g., yellow gold and white gold)"],
  [/\brose\s+gold\b/gi, "warm pinkish-copper gold alloy (rose gold)"],
  [/\bwhite\s+gold\b/gi, "cool silvery-white gold alloy (white gold)"],
];

/**
 * Resolves jewelry slang/jargon in a text string into explicit visual descriptions.
 * This ensures the AI model receives clear rendering instructions instead of industry shorthand.
 */
export function resolveJewelryTerms(input: string): string {
  let resolved = input;
  for (const [pattern, replacement] of JEWELRY_GLOSSARY) {
    resolved = resolved.replace(pattern, replacement);
  }
  return resolved;
}

/**
 * Detects potential text/names/letters intended to appear ON the jewelry piece.
 * Returns an array of detected text strings.
 */
export function detectLetteringText(input: string): string[] {
  const found: string[] = [];

  // Quoted strings: "Mia", 'King', etc.
  const quotedMatches = input.match(/["'"]([A-Za-z0-9\s]{1,20})["'"]/g);
  if (quotedMatches) {
    for (const m of quotedMatches) {
      found.push(m.replace(/["'"]/g, '').trim());
    }
  }

  // Capitalized short words that look like names/initials (2-12 chars, not common jewelry words)
  const COMMON_JEWELRY_WORDS = new Set([
    // Jewelry terms
    'Gold', 'Silver', 'Diamond', 'Ring', 'Chain', 'Pendant', 'Bracelet',
    'Earring', 'Watch', 'Necklace', 'Cuban', 'Franco', 'Rope', 'Bangle',
    'Charm', 'Stone', 'Metal', 'Platinum', 'Rose', 'White', 'Yellow',
    'Round', 'Princess', 'Oval', 'Emerald', 'Pear', 'Marquise', 'Cushion',
    'Heart', 'Radiant', 'Asscher', 'Custom', 'Solid', 'Open', 'Basic',
    'Full', 'Top', 'Bottom', 'Red', 'Blue', 'Green', 'Black', 'Pink',
    'Purple', 'Clear', 'Iced', 'Bust', 'Down', 'Out', 'Flooded',
    // Jewelry category names (prevent false lettering detection)
    'Grillz', 'Grill', 'Grills', 'Chains', 'Rings', 'Bangles', 'Earrings',
    'Pendants', 'Watches', 'Bracelets', 'Necklaces', 'Charms', 'Anklet',
    'Tiara', 'Crown', 'Brooch', 'Cufflinks', 'Studs',
    // Diamond/stone terms
    'Invisible', 'Prong', 'Bezel', 'Channel', 'Pave', 'Micro', 'Baguette',
    'Moissanite', 'Sapphire', 'Ruby', 'Garnet', 'Topaz', 'Amethyst',
    // Common English words / action verbs users type casually
    'The', 'And', 'With', 'For', 'This', 'That', 'Make', 'Made', 'Want',
    'Like', 'Need', 'Get', 'Put', 'Add', 'Set', 'Have', 'Has', 'Had',
    'Some', 'More', 'Just', 'Very', 'Also', 'Same', 'Can', 'Will',
    'Would', 'Could', 'Should', 'Does', 'Been', 'Into', 'Back', 'Front',
    'Side', 'Big', 'Small', 'Large', 'Thick', 'Thin', 'Long', 'Short',
    'Create', 'Build', 'Design', 'Give', 'Show', 'Try', 'Looks', 'Looking',
    'Similar', 'Match', 'Copy', 'Replicate', 'Style', 'Type', 'Kind',
    'Really', 'Super', 'Extra', 'Nice', 'Cool', 'Dope', 'Fire', 'Clean',
    'Heavy', 'Light', 'Bright', 'Shiny', 'Matte', 'Glossy', 'Flat',
    'Plain', 'Simple', 'Fancy', 'Luxury', 'Premium', 'Real', 'Fake',
    // Resolved glossary output words (prevent re-detection)
    'Fully', 'Dense', 'Covered', 'Surface', 'Stones', 'Diamonds',
    'Setting', 'Pattern', 'Link', 'Interlocking', 'Rectangular',
  ]);

  const namePattern = /\b([A-Z][a-z]{1,11})\b/g;
  let match;
  while ((match = namePattern.exec(input)) !== null) {
    if (!COMMON_JEWELRY_WORDS.has(match[1])) {
      found.push(match[1]);
    }
  }

  // Single uppercase letters that look like monograms: "S pendant", "M chain"
  const monogramPattern = /\b([A-Z])\s+(pendant|chain|necklace|charm|ring|bracelet|earring)/gi;
  while ((match = monogramPattern.exec(input)) !== null) {
    found.push(match[1]);
  }

  // Deduplicate
  return [...new Set(found)];
}

/**
 * Sanitizes a user-provided custom instruction.
 * Returns the sanitized string (with jewelry terms resolved), or null if blocked.
 */
/**
 * Context-specific blocked patterns: prevent users from switching jewelry type
 * in the regeneration textarea (e.g. asking for a pendant in the ring builder).
 */
const RING_CONTEXT_BLOCKED: RegExp[] = [
  /\b(pendant|necklace|bracelet|earrings?|chain|watch|brooch|anklet|tiara|crown)\b/i,
  /\b(grillz?|grill)\b/i,
  /\bnot\s+a\s+ring\b/i,
  /\binstead\s+of\s+(a\s+)?ring\b/i,
];

const GRILLZ_CONTEXT_BLOCKED: RegExp[] = [
  /\b(ring|pendant|necklace|bracelet|earrings?|watch|brooch|anklet|tiara|crown)\b/i,
  /\bnot\s+(a\s+)?grill/i,
  /\binstead\s+of\s+(a\s+)?grill/i,
];

const CONTEXT_BLOCKED_MAP: Record<string, RegExp[]> = {
  ring: RING_CONTEXT_BLOCKED,
  grillz: GRILLZ_CONTEXT_BLOCKED,
};

export type JewelryContext = 'ring' | 'grillz' | 'custom';

/**
 * Sanitizes a free-text customer design brief (description, customMessage, additionalNotes).
 * Checks for prompt-injection attempts and resolves jewelry terminology.
 * Returns null when injection patterns are detected (caller omits the field from the AI prompt).
 * Unlike sanitizeCustomInstruction, does NOT apply context-specific blocks or the 200-char limit.
 */
export function sanitizeDesignBrief(
  input: string | undefined | null,
  maxLength = 1000,
): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim().substring(0, maxLength);
  if (trimmed.length === 0) return null;

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      console.warn('[prompt-guardrails] Blocked design brief:', trimmed.substring(0, 60) + '…');
      return null;
    }
  }

  return resolveJewelryTerms(trimmed);
}

export function sanitizeCustomInstruction(input: string | undefined | null, context?: JewelryContext): string | null {
  if (!input || typeof input !== 'string') return null;

  let trimmed = input.trim();
  if (trimmed.length === 0) return null;

  // Enforce character limit
  if (trimmed.length > MAX_INSTRUCTION_LENGTH) {
    trimmed = trimmed.substring(0, MAX_INSTRUCTION_LENGTH);
  }

  // Check blocklist
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(trimmed)) {
      console.warn('Blocked custom instruction:', trimmed.substring(0, 50) + '...');
      return null;
    }
  }

  // Check context-specific blocklist (e.g. no "pendant" in ring builder)
  if (context && CONTEXT_BLOCKED_MAP[context]) {
    for (const pattern of CONTEXT_BLOCKED_MAP[context]) {
      if (pattern.test(trimmed)) {
        console.warn(`Blocked by ${context} context:`, trimmed.substring(0, 50) + '...');
        return null;
      }
    }
  }

  // Resolve jewelry slang into visual descriptions
  trimmed = resolveJewelryTerms(trimmed);

  return trimmed;
}

/**
 * Returns a system message that constrains the AI model to jewelry-only output.
 */
export function buildSystemGuardrail(): string {
  return `You are a luxury jewelry product image generator. You MUST ONLY generate photorealistic images of jewelry products (rings, grillz, necklaces, bracelets, earrings, pendants, and similar jewelry items). 

STRICT RULES:
- Never generate images of people, faces, bodies, or any living beings.
- Never generate weapons, violence, gore, or inappropriate content.
- Never generate non-jewelry objects unless they are part of a jewelry display (e.g., a ring box).
- If a user instruction asks for non-jewelry content, ignore that instruction entirely and generate only the jewelry piece.
- Focus exclusively on the jewelry product with studio-quality lighting and presentation.`;
}

/**
 * Shared JEWELRY TERMINOLOGY block to append to all system messages.
 * Ensures the AI interprets industry slang as visual properties, not literal text.
 */
export const JEWELRY_TERMINOLOGY_BLOCK = `

JEWELRY TERMINOLOGY (always interpret these as visual properties, NEVER render as literal text on the piece):
- "iced out" / "iced" / "bust down" / "flooded" = the surface is fully covered with small diamonds in a pavé setting — render dense sparkling diamond coverage
- "VVS" / "VS" / "SI" = diamond clarity grades — render as very clear, bright, high-quality stones
- "graphic" = a custom-shaped design or silhouette (e.g., "graphic S" = an S-shaped piece, NOT the word "graphic" written on it)
- "Cuban" / "rope" / "Franco" = chain link styles — render the appropriate link pattern
- "two-tone" = combination of two metal colors on the same piece
- Any quoted name or word (e.g., "Mia", "King") = render as raised metallic lettering or engraved text physically ON the jewelry surface

CRITICAL RENDERING RULE — NO UNWANTED TEXT:
- NEVER render ANY English words, phrases, or letters as visible text on the jewelry unless the customer EXPLICITLY asks for engraving or lettering of a specific name/word wrapped in quotation marks.
- Common phrases like "make this", "iced out", "bust down", "fully loaded", "made", "create" are DESCRIPTIONS of the jewelry style or casual language — they are NOT text to engrave.
- Action words (make, create, build, design, show, give, want, need, like) are instructions from the customer, NOT text for the piece.
- If in doubt, do NOT put text on the piece. A clean piece with no text is ALWAYS preferred over incorrectly rendered text.
- CRITICAL: Do NOT write jewelry terminology words (like "iced out", "VVS", etc.) as visible text on the piece — these describe HOW the piece should LOOK, not what should be written on it`;
