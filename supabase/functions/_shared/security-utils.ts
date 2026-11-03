/**
 * Security utilities for Edge Functions
 * Implements API security best practices per security checklist
 */

// Generic error messages - never leak internal details
export const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Authentication required',
  FORBIDDEN: 'Access denied',
  INVALID_INPUT: 'Invalid request data',
  NOT_FOUND: 'Resource not found',
  RATE_LIMITED: 'Too many requests. Please try again later.',
  SERVER_ERROR: 'An error occurred. Please try again.',
} as const;

/**
 * Sanitize a string to prevent XSS and injection attacks
 * Removes HTML tags, script content, and dangerous characters
 */
export function sanitizeString(input: unknown, maxLength = 1000): string {
  if (typeof input !== 'string') return '';
  
  return input
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags and content
    .replace(/<[^>]*>/g, '')                           // Remove remaining HTML tags
    .replace(/javascript:/gi, '')                      // Remove javascript: protocol
    .replace(/on\w+\s*=/gi, '')                        // Remove event handlers like onclick=
    .replace(/[<>"'&;`]/g, '')                         // Remove dangerous chars
    .slice(0, maxLength)
    .trim();
}

/**
 * Sanitize HTML content more aggressively
 * Use for content that might be rendered as HTML
 */
export function sanitizeHtml(input: unknown, maxLength = 5000): string {
  if (typeof input !== 'string') return '';
  
  return input
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags entirely
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')   // Remove style tags entirely
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '') // Remove iframes
    .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '') // Remove objects
    .replace(/<embed[^>]*>/gi, '')                    // Remove embeds
    .replace(/javascript:/gi, '')                      // Remove javascript protocol
    .replace(/vbscript:/gi, '')                        // Remove vbscript protocol
    .replace(/data:/gi, '')                            // Remove data protocol
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')      // Remove event handlers
    .replace(/on\w+\s*=[^\s>]*/gi, '')                // Remove unquoted event handlers
    .slice(0, maxLength)
    .trim();
}

/**
 * Sanitize an email address
 */
export function sanitizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  
  const email = input.toLowerCase().trim().slice(0, 320);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  return emailRegex.test(email) ? email : null;
}

/**
 * Sanitize a UUID
 */
export function sanitizeUUID(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const cleaned = input.trim().toLowerCase();
  
  return uuidRegex.test(cleaned) ? cleaned : null;
}

/**
 * Pick only allowed fields from an object (response limiting)
 * Prevents accidental exposure of sensitive data
 */
export function pickFields<T extends Record<string, unknown>>(
  obj: T,
  allowedFields: (keyof T)[]
): Partial<T> {
  const result: Partial<T> = {};
  
  for (const field of allowedFields) {
    if (field in obj) {
      result[field] = obj[field];
    }
  }
  
  return result;
}

/**
 * Mask sensitive data for logging (partial reveal)
 */
export function maskSensitive(value: string, revealChars = 3): string {
  if (!value || value.length <= revealChars) return '***';
  return value.slice(0, revealChars) + '***';
}

/**
 * Mask an email for logging
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@***.***';
  const [local, domain] = email.split('@');
  return `${maskSensitive(local)}@${domain}`;
}

/**
 * HTML-entity-encode user-supplied strings before interpolating into HTML templates.
 * Prevents XSS in email bodies and any server-rendered HTML.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// JewlX internal portals that are always considered trusted embed origins.
const INTERNAL_TRUSTED_HOSTS = [
  'vault.jewlx.ai',
  'admin.jewlx.ai',
  'builder.jewlx.ai',
  'jewlx.ai',
];

/**
 * Resolves the correct `Access-Control-Allow-Origin` value for an edge-function response.
 *
 * - No restrictions configured (empty allowedDomains) → return '*' (backwards-compatible).
 * - Origin matches an internal JewlX portal or an allowed domain → echo the specific origin.
 * - Origin is present but NOT in the whitelist → return the literal string 'null', which the
 *   caller must treat as "blocked" and return a 403 (the browser will see no valid ACAO header).
 * - No Origin header → return '*' (non-browser / server-to-server calls).
 */
export function resolveAllowedOrigin(
  requestOrigin: string | null,
  allowedDomains: string[],
): string {
  if (!requestOrigin || allowedDomains.length === 0) return '*';
  try {
    const originHost = new URL(requestOrigin).hostname;
    const trusted =
      INTERNAL_TRUSTED_HOSTS.some(h => originHost === h || originHost.endsWith(`.${h}`)) ||
      allowedDomains.some(d => originHost === d || originHost.endsWith(`.${d}`));
    return trusted ? requestOrigin : 'null';
  } catch {
    return '*';
  }
}

/**
 * Standard CORS headers for edge functions
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Create a standardized error response
 * Never exposes internal error details to clients
 */
export function errorResponse(
  statusCode: number,
  publicMessage: string,
  internalError?: unknown
): Response {
  // Log internal error for debugging (server-side only)
  if (internalError) {
    console.error('Internal error:', internalError instanceof Error ? internalError.message : 'Unknown');
  }
  
  return new Response(
    JSON.stringify({ error: publicMessage }),
    {
      status: statusCode,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Create a standardized success response
 */
export function successResponse(data: unknown, statusCode = 200): Response {
  return new Response(
    JSON.stringify(data),
    {
      status: statusCode,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Validate that required fields are present and non-empty
 */
export function validateRequired(
  obj: Record<string, unknown>,
  fields: string[]
): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  for (const field of fields) {
    const value = obj[field];
    if (value === undefined || value === null || value === '') {
      missing.push(field);
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}
