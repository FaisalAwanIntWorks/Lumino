/**
 * Wizard label utilities — used by all Custom X form wizards
 * (Ring Builder, Grillz, Custom Enquiry) to derive fallback
 * custom-question progress names when no short name is set.
 */

// Common stop-prefixes we strip from custom question text
// when auto-deriving a short step name.
const STOP_PREFIXES = [
  "what's your preferred",
  "what is your preferred",
  "what's your favorite",
  "what is your favorite",
  "what's your",
  "what is your",
  "what are your",
  "what are the",
  "what would you",
  "what type of",
  "what kind of",
  "which type of",
  "please select your",
  "please select the",
  "please choose your",
  "please choose the",
  "please tell us",
  "please share your",
  "please upload",
  "please enter",
  "tell us your",
  "tell us about",
  "do you have a",
  "do you have any",
  "do you have",
  "do you want",
  "do you prefer",
  "would you like",
  "would you prefer",
  "how would you",
  "how do you",
  "have you",
  "select your",
  "select the",
  "choose your",
  "choose the",
  "upload your",
  "upload a",
  "upload an",
  "enter your",
  "enter the",
  "share your",
  "share a",
  "describe your",
  "describe the",
  "which",
  "what",
  "how",
];

// Stop-words trimmed from the start after prefix removal.
const STOP_WORDS = new Set([
  'a','an','the','your','my','our','their','of','for','to','with','in','on','any','some','please',
  'you','would','want','like','prefer','do','does','is','are','what','which','how',
]);

const TRAILING_FILLER = new Set(['you', 'want', 'like', 'prefer', 'please', 'would', 'do']);

/**
 * Derive a short progress name from question text.
 * Examples:
 *   "What's your preferred ring size?" -> "RING SIZE"
 *   "Do you have a deadline?"          -> "DEADLINE"
 *   "Upload inspiration photos"        -> "INSPIRATION PHOTOS"
 *   "What type of settings you want?" -> "SETTINGS"
 */
export function deriveShortLabel(rawText: string | undefined | null, maxWords = 2): string {
  if (!rawText) return 'QUESTION';
  // Strip parenthetical hints and trailing punctuation
  const text = rawText.replace(/\([^)]*\)/g, ' ').replace(/[?.!:;,]+/g, ' ').trim();
  if (!text) return 'QUESTION';

  const lower = text.toLowerCase();

  // Strip a known prefix if present
  let stripped = text;
  for (const prefix of STOP_PREFIXES) {
    if (lower.startsWith(prefix + ' ')) {
      stripped = text.slice(prefix.length).trim();
      break;
    }
    if (lower === prefix) {
      stripped = text;
      break;
    }
  }

  // Tokenize and drop leading stop-words
  const tokens = stripped.split(/\s+/).filter(Boolean);
  while (tokens.length > 0 && STOP_WORDS.has(tokens[0].toLowerCase())) {
    tokens.shift();
  }
  while (tokens.length > 0 && TRAILING_FILLER.has(tokens[tokens.length - 1].toLowerCase())) {
    tokens.pop();
  }

  if (tokens.length === 0) {
    return 'QUESTION';
  }

  const picked = tokens.slice(0, maxWords).filter(token => !TRAILING_FILLER.has(token.toLowerCase())).join(' ');
  if (!picked) return 'QUESTION';
  // Cap at 18 chars to fit the progress chip
  return picked.toUpperCase().slice(0, 18);
}
