import { createClient } from "npm:@supabase/supabase-js@2";

// Simple in-memory cache with 5-minute TTL
const cache = new Map<string, { text: string; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Loads a system prompt from the ai_system_prompts table.
 * Falls back to the provided default if the row is missing or on error.
 * Results are cached in memory for 5 minutes.
 */
export async function loadPrompt(
  promptKey: string,
  fallback: string
): Promise<string> {
  // Check cache first
  const cached = cache.get(promptKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.text;
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabaseAdmin
      .from("ai_system_prompts")
      .select("prompt_text")
      .eq("prompt_key", promptKey)
      .single();

    if (error || !data?.prompt_text) {
      console.warn(`prompt-loader: using fallback for "${promptKey}":`, error?.message);
      return fallback;
    }

    cache.set(promptKey, { text: data.prompt_text, fetchedAt: Date.now() });
    return data.prompt_text;
  } catch (err) {
    console.error(`prompt-loader: exception for "${promptKey}":`, err);
    return fallback;
  }
}
