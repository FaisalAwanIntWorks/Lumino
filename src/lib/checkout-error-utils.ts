/**
 * Extract a human-readable error message from a supabase.functions.invoke error.
 * When the edge function returns a non-2xx status, the SDK puts the response
 * body into `error.context` as a Response object, NOT into `error.message`.
 */

/** Synchronous fallback — tries to parse error.message as JSON */
export function extractCheckoutError(error: unknown, fallback = 'Could not redirect to checkout.'): string {
  if (!error || typeof error !== 'object') return fallback;
  const err = error as Record<string, any>;
  if (err.message) {
    try {
      const body = JSON.parse(err.message);
      if (body.error) return body.error;
    } catch {
      if (err.message !== '[object Object]' && err.message !== 'Edge function returned a non-2xx status code') {
        return err.message;
      }
    }
  }
  return fallback;
}

/** Async version — reads the Response from error.context first, then falls back */
export async function extractCheckoutErrorAsync(error: unknown, fallback = 'Could not redirect to checkout.'): Promise<string> {
  if (!error || typeof error !== 'object') return fallback;
  const err = error as Record<string, any>;

  // FunctionsHttpError stores the actual response in error.context
  try {
    const ctx = err.context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json();
      if (body?.error) return body.error;
    }
  } catch {
    // context parsing failed — fall through
  }

  return extractCheckoutError(error, fallback);
}
