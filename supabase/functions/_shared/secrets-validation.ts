/**
 * Edge Function Secrets Validation Utilities
 * 
 * CRITICAL SECURITY GUIDELINES:
 * 1. NEVER hardcode secrets in source code
 * 2. ALWAYS use Deno.env.get() for secrets
 * 3. NEVER log secret values - only log "[SECRET_NAME] is configured"
 * 4. ALWAYS validate secrets exist before use
 * 5. ALWAYS use generic error messages
 */

/**
 * List of sensitive field names that should NEVER be logged.
 */
export const SENSITIVE_FIELDS = [
  'password',
  'token',
  'access_token',
  'api_key',
  'secret',
  'private_key',
  'authorization',
  'credential',
  'connection_string',
  'service_role_key',
] as const;

/**
 * Validates that required environment variables are set.
 * Returns a safe error message if any are missing.
 * 
 * IMPORTANT: This only checks if secrets exist, NEVER logs their values.
 */
export function validateRequiredSecrets(
  secretNames: string[]
): { valid: boolean; error: string | null } {
  const missing: string[] = [];
  
  for (const name of secretNames) {
    const value = Deno.env.get(name);
    if (!value || value.trim() === '') {
      missing.push(name);
    }
  }
  
  if (missing.length > 0) {
    // Log which secrets are missing without exposing values
    console.error(`Missing required secrets: ${missing.join(', ')}`);
    return {
      valid: false,
      error: 'Service configuration error. Please contact support.',
    };
  }
  
  return { valid: true, error: null };
}

/**
 * Gets a required secret, throwing if not configured.
 * Use this for secrets that must exist for the function to work.
 * 
 * SECURITY: Never logs the secret value.
 */
export function getRequiredSecret(name: string): string {
  const value = Deno.env.get(name);
  
  if (!value || value.trim() === '') {
    console.error(`Required secret not configured: ${name}`);
    throw new Error('Service configuration error');
  }
  
  // Log that secret is configured, but NEVER the value
  console.log(`Secret ${name}: configured ✓`);
  
  return value;
}

/**
 * Gets an optional secret, returning undefined if not set.
 * 
 * SECURITY: Never logs the secret value.
 */
export function getOptionalSecret(name: string): string | undefined {
  const value = Deno.env.get(name);
  
  if (!value || value.trim() === '') {
    console.log(`Optional secret ${name}: not configured`);
    return undefined;
  }
  
  console.log(`Optional secret ${name}: configured ✓`);
  return value;
}

/**
 * Sanitizes an error for safe return to client.
 * NEVER expose internal error details.
 */
export function sanitizeErrorForClient(
  error: unknown,
  fallbackMessage = 'An error occurred processing your request'
): string {
  // Log the full error internally for debugging
  if (error instanceof Error) {
    console.error('Internal error:', {
      name: error.name,
      // Redact any potential secrets from the message
      message: redactSecretsFromString(error.message),
    });
  } else {
    console.error('Internal error:', typeof error === 'string' ? redactSecretsFromString(error) : '[object]');
  }
  
  // Return generic message to client
  return fallbackMessage;
}

/**
 * Redacts potential secrets from a string.
 */
function redactSecretsFromString(input: string): string {
  if (!input) return input;
  
  // Patterns that might indicate secrets
  const patterns = [
    // JWT tokens
    /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
    // API keys with common prefixes
    /(?:sk|pk|api|key|secret|token)[_-]?[a-zA-Z0-9]{16,}/gi,
    // Connection strings
    /(?:postgres|mysql|mongodb|redis):\/\/[^\s]+/gi,
    // Long alphanumeric strings (potential secrets)
    /[a-zA-Z0-9]{40,}/g,
  ];
  
  let sanitized = input;
  for (const pattern of patterns) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  
  return sanitized;
}

/**
 * Sanitizes an object for logging by redacting sensitive fields.
 */
export function sanitizeForLogging<T extends Record<string, unknown>>(
  obj: T
): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_FIELDS.some(f => lowerKey.includes(f));
    
    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeForLogging(value as Record<string, unknown>);
    } else if (typeof value === 'string') {
      sanitized[key] = redactSecretsFromString(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Standard CORS headers for edge functions.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

/**
 * Creates a standardized error response for edge functions.
 * ALWAYS uses generic error messages.
 */
export function createErrorResponse(
  status: number,
  internalError: unknown,
  userMessage?: string
): Response {
  // Log the actual error internally
  sanitizeErrorForClient(internalError);
  
  // Return generic message to client
  const message = userMessage || getGenericErrorMessage(status);
  
  return new Response(
    JSON.stringify({ error: message }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Gets a generic error message based on HTTP status code.
 */
function getGenericErrorMessage(status: number): string {
  switch (status) {
    case 400:
      return 'Invalid request. Please check your input and try again.';
    case 401:
      return 'Authentication required. Please sign in and try again.';
    case 403:
      return 'Access denied. You do not have permission to perform this action.';
    case 404:
      return 'The requested resource was not found.';
    case 429:
      return 'Too many requests. Please wait a moment and try again.';
    case 500:
    default:
      return 'An error occurred processing your request. Please try again later.';
  }
}
