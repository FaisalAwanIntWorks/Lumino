/**
 * Converts image URLs to base64 data URIs for inline use with AI models.
 * Gemini cannot fetch external URLs — images must be inlined as base64.
 */

const MAX_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB per image
const MAX_IMAGES = 4;

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    for (let j = 0; j < chunk.length; j++) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

function mimeFromContentType(contentType: string | null, url: string): string {
  if (contentType) {
    const match = contentType.match(/^image\/(png|jpeg|jpg|webp|gif)/i);
    if (match) return `image/${match[1].toLowerCase()}`;
  }
  // Fallback: guess from URL extension
  const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg"; // default
}

export async function urlsToBase64(urls: string[]): Promise<string[]> {
  const results: string[] = [];

  for (const url of urls.slice(0, MAX_IMAGES)) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        console.warn(`image-to-base64: failed to fetch ${url} — ${resp.status}`);
        continue;
      }

      const contentType = resp.headers.get("content-type");
      const buffer = await resp.arrayBuffer();

      if (buffer.byteLength > MAX_IMAGE_SIZE) {
        console.warn(`image-to-base64: skipping ${url} — ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB exceeds 4MB limit`);
        continue;
      }

      const bytes = new Uint8Array(buffer);
      const base64 = uint8ToBase64(bytes);
      const mime = mimeFromContentType(contentType, url);
      results.push(`data:${mime};base64,${base64}`);
    } catch (err) {
      console.warn(`image-to-base64: error processing ${url}:`, err);
    }
  }

  return results;
}
