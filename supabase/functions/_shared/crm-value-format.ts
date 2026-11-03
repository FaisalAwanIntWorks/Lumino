// Shared value formatting for CRM writes.
//
// Multiple values used to be joined with ", ". CRMs auto-linkify text and stop
// a link only at whitespace, so a comma-joined list of URLs produced broken
// links ("https://.../a.webp," -> 404). Lists that are entirely URLs are
// therefore joined with a newline; everything else keeps the comma format.

const URL_RE = /^https?:\/\/\S+$/i;

export function isUrlList(values: string[]): boolean {
  return values.length > 1 && values.every((v) => URL_RE.test(v.trim()));
}

/** Join a list of already-stringified values for a CRM field or note. */
export function joinCrmValues(values: string[]): string {
  const clean = values.map((v) => String(v).trim()).filter((v) => v !== "");
  if (!clean.length) return "";
  if (clean.length === 1) return clean[0];
  return isUrlList(clean) ? clean.join("\n") : clean.join(", ");
}

/** Same as joinCrmValues but numbers each link — used in note bodies. */
export function joinCrmValuesForNote(values: string[]): string {
  const clean = values.map((v) => String(v).trim()).filter((v) => v !== "");
  if (!clean.length) return "";
  if (clean.length === 1) return clean[0];
  if (isUrlList(clean)) {
    return "\n" + clean.map((u, i) => `  Image ${i + 1}: ${u}`).join("\n");
  }
  return clean.join(", ");
}
