import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Shared AI response caching for chat and image dedup.
 *
 * Chat cache: hash(client_id + feature + last_user_message) → cached AI response (24h TTL)
 * Image cache: hash(client_id + feature + config_params) → cached image URL (7d TTL)
 */

const CHAT_TTL_HOURS = 24;
const IMAGE_TTL_HOURS = 168; // 7 days

function getServiceSupabase() {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key);
}

/**
 * Simple deterministic hash using Web Crypto (SHA-256 → hex).
 */
async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Build a cache key from structured inputs.
 */
export async function buildCacheKey(
  clientId: string,
  feature: string,
  ...parts: (string | number | boolean | undefined | null)[]
): Promise<string> {
  const raw = [clientId, feature, ...parts.map((p) => String(p ?? ""))].join("|");
  return sha256(raw);
}

export interface CachedResponse {
  response_data: any;
  created_at: string;
}

/**
 * Look up a cached response. Returns null on miss or expiry.
 */
export async function getCached(cacheKey: string): Promise<CachedResponse | null> {
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("ai_response_cache")
      .select("response_data, created_at")
      .eq("cache_key", cacheKey)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (error || !data) return null;
    return data as CachedResponse;
  } catch {
    return null;
  }
}

/**
 * Store a response in the cache.
 */
export async function setCache(
  cacheKey: string,
  clientId: string,
  feature: string,
  responseData: any,
  ttlHours?: number,
): Promise<void> {
  try {
    const supabase = getServiceSupabase();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (ttlHours ?? CHAT_TTL_HOURS));

    await supabase.from("ai_response_cache").upsert(
      {
        cache_key: cacheKey,
        client_id: clientId,
        feature,
        response_data: responseData,
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: "cache_key" },
    );
  } catch (err) {
    // Non-blocking
    console.error("Cache write error:", err);
  }
}

/**
 * Check if an image with identical config already exists (image dedup).
 * Returns the cached image URL or null.
 */
export async function getImageDedup(
  clientId: string,
  feature: string,
  configParams: Record<string, any>,
): Promise<string | null> {
  // Sort keys for deterministic hashing
  const sortedEntries = Object.entries(configParams)
    .filter(([k]) => !["leadId", "generationNumber", "backgroundColor"].includes(k))
    .sort(([a], [b]) => a.localeCompare(b));

  const parts = sortedEntries.map(([k, v]) => `${k}=${JSON.stringify(v)}`);
  const cacheKey = await buildCacheKey(clientId, feature, ...parts);

  const cached = await getCached(cacheKey);
  if (cached?.response_data?.imageUrl) {
    console.log(`Image cache HIT for ${feature}`);
    return cached.response_data.imageUrl;
  }
  return null;
}

/**
 * Store an image URL in the dedup cache.
 */
export async function setImageDedup(
  clientId: string,
  feature: string,
  configParams: Record<string, any>,
  imageUrl: string,
): Promise<void> {
  const sortedEntries = Object.entries(configParams)
    .filter(([k]) => !["leadId", "generationNumber", "backgroundColor"].includes(k))
    .sort(([a], [b]) => a.localeCompare(b));

  const parts = sortedEntries.map(([k, v]) => `${k}=${JSON.stringify(v)}`);
  const cacheKey = await buildCacheKey(clientId, feature, ...parts);

  await setCache(cacheKey, clientId, feature, { imageUrl }, IMAGE_TTL_HOURS);
}

/**
 * Build a chat cache key from the last user message.
 * Only caches single-turn queries (first message or standalone questions).
 */
export async function getChatCache(
  clientId: string,
  feature: string,
  lastUserMessage: string,
  messageCount: number,
): Promise<CachedResponse | null> {
  // Only cache single-turn interactions (1-2 messages = greeting + first question)
  if (messageCount > 3) return null;

  const cacheKey = await buildCacheKey(clientId, feature, lastUserMessage.toLowerCase().trim());
  return getCached(cacheKey);
}

/**
 * Store a chat response in the cache.
 */
export async function setChatCache(
  clientId: string,
  feature: string,
  lastUserMessage: string,
  responseData: any,
): Promise<void> {
  const cacheKey = await buildCacheKey(clientId, feature, lastUserMessage.toLowerCase().trim());
  await setCache(cacheKey, clientId, feature, responseData, CHAT_TTL_HOURS);
}
