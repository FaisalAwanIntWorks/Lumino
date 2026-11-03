import { supabase } from '@/integrations/supabase/client';

// Supported endpoint types for rate limiting
// NOTE: AI features (ring_chat, help_chat, etc.) are rate-limited server-side
// by gateRequest() in _shared/ai-quota.ts — no client-side check needed.
export type RateLimitEndpoint = 
  | 'login' 
  | 'password_reset' 
  | 'send_email' 
  | 'gdpr' 
  | 'catalog_generate' 
  | 'shopify'
  | 'default';

interface RateLimitResponse {
  allowed: boolean;
  remaining?: number;
  retryAfter?: number;
  source?: 'legacy' | 'unkey';
}

/**
 * Check if a request is allowed based on rate limiting.
 * 
 * For non-authenticated flows (login, password_reset): uses the legacy DB-based rate limiter.
 * For API-key authenticated flows: Unkey handles rate limiting automatically during
 * key verification in edge functions — no client-side check needed.
 * 
 * @param endpoint - The endpoint type for rate limiting
 * @returns Whether the request is allowed and remaining quota
 */
export async function checkRateLimit(
  endpoint: RateLimitEndpoint
): Promise<RateLimitResponse> {
  try {
    // Get identifier (user ID or session-based)
    const identifier = await getIdentifier();

    const { data, error } = await supabase.functions.invoke('rate-limiter', {
      body: { identifier, endpoint },
    });

    if (error) {
      console.error('Rate limit check error');
      // Fail open - allow request if rate limiter is down
      return { allowed: true, source: 'legacy' };
    }

    return {
      allowed: data?.allowed ?? true,
      remaining: data?.remaining,
      retryAfter: data?.retryAfter,
      source: 'legacy',
    };
  } catch (error) {
    console.error('Rate limit error');
    // Fail open
    return { allowed: true, source: 'legacy' };
  }
}

/**
 * Parse Unkey rate limit info from an edge function response.
 * When using API keys with Unkey, rate limit status is returned in the
 * verification response. Use this to check if a response indicates rate limiting.
 * 
 * @param response - The fetch Response from an edge function call
 * @returns Rate limit status if the response was rate-limited, null otherwise
 */
export function parseUnkeyRateLimit(response: Response): RateLimitResponse | null {
  if (response.status === 429) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: 60, // Default 1 minute
      source: 'unkey',
    };
  }
  return null;
}

/**
 * Wrapper for API-key authenticated edge function calls with rate limit handling.
 * Automatically checks for Unkey rate limiting in the response.
 */
export async function invokeWithRateLimit(
  functionName: string,
  body: Record<string, unknown>,
  apiKey?: string,
): Promise<{ data: unknown; rateLimited: boolean; remaining?: number }> {
  const headers: Record<string, string> = {};
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers,
  });

  if (error) {
    // Check if it's a rate limit error
    if (error.message?.includes('429') || error.message?.includes('rate limit')) {
      return { data: null, rateLimited: true, remaining: 0 };
    }
    throw error;
  }

  return {
    data,
    rateLimited: false,
    remaining: data?.remaining,
  };
}

/**
 * Get a unique identifier for rate limiting (user ID or session-based)
 */
async function getIdentifier(): Promise<string> {
  // Try to get user ID first
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    return `user:${user.id}`;
  }

  // Fallback to session-based identifier
  const sessionId = getOrCreateSessionId();
  return `session:${sessionId}`;
}

/**
 * Get or create a session ID for anonymous users
 */
function getOrCreateSessionId(): string {
  const storageKey = 'rate_limit_session_id';
  
  try {
    let sessionId = localStorage.getItem(storageKey);
    
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem(storageKey, sessionId);
    }
    
    return sessionId;
  } catch {
    // If localStorage is not available, generate a temporary ID
    return crypto.randomUUID();
  }
}

/**
 * Helper to format retry-after time for user display
 */
export function formatRetryAfter(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} seconds`;
  } else if (seconds < 3600) {
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  } else {
    const hours = Math.ceil(seconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  }
}
