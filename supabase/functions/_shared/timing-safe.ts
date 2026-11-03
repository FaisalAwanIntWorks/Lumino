/**
 * Timing-safe string comparison to prevent timing attacks.
 * This function always takes the same amount of time regardless of input,
 * preventing attackers from guessing values character by character.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  // Encode strings to bytes
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  
  // If lengths differ, still compare to prevent timing leak
  const maxLength = Math.max(aBytes.length, bBytes.length);
  
  let result = aBytes.length === bBytes.length ? 0 : 1;
  
  for (let i = 0; i < maxLength; i++) {
    const aByte = i < aBytes.length ? aBytes[i] : 0;
    const bByte = i < bBytes.length ? bBytes[i] : 0;
    result |= aByte ^ bByte;
  }
  
  return result === 0;
}

/**
 * Generate a cryptographically secure random token (URL-safe base64)
 * @param byteLength Number of random bytes (default 32 = 256 bits)
 */
export function generateSecureToken(byteLength: number = 32): string {
  const array = new Uint8Array(byteLength);
  crypto.getRandomValues(array);
  // Convert to URL-safe base64
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Hash a token for storage (using SHA-256)
 * This prevents token theft if the database is compromised
 */
export async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a token against its hash using timing-safe comparison
 */
export async function verifyTokenHash(token: string, storedHash: string): Promise<boolean> {
  const computedHash = await hashToken(token);
  return timingSafeEqual(computedHash, storedHash);
}
