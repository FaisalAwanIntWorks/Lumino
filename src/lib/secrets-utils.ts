/**
 * Secrets Management Security Utilities
 * 
 * SECURITY GUIDELINES:
 * 1. NEVER hardcode secrets, API keys, passwords, or tokens in source code
 * 2. NEVER log credentials, tokens, or connection strings
 * 3. ALWAYS use environment variables for secrets (Deno.env.get in Edge Functions)
 * 4. ALWAYS validate required secrets exist before using them
 * 5. ALWAYS use generic error messages - never expose internal details
 * 
 * This module provides utilities for safe secrets handling in the frontend.
 */

/**
 * List of sensitive field names that should NEVER be logged or exposed.
 * Used for log sanitization and error message filtering.
 */
export const SENSITIVE_FIELDS = [
  'password',
  'password_plain',
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apikey',
  'secret',
  'secret_key',
  'private_key',
  'authorization',
  'auth',
  'credential',
  'connection_string',
  'database_url',
  'db_url',
  'shopify_access_token',
  'shopify_admin_access_token',
  'encrypted',
  'service_role_key',
  'anon_key',
] as const;

/**
 * Regular expressions to detect potential secrets in strings.
 * Based on common secret patterns.
 */
const SECRET_PATTERNS = [
  // API keys with common prefixes
  /(?:sk|pk|api|key|secret|token|auth|access|private|password)[_-]?[a-zA-Z0-9]{16,}/gi,
  // JWT tokens
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
  // Basic auth credentials
  /[a-zA-Z0-9._%+-]+:[a-zA-Z0-9._%+-]+@/g,
  // Connection strings
  /(?:postgres|mysql|mongodb|redis):\/\/[^\s]+/gi,
  // AWS-style access keys
  /AKIA[0-9A-Z]{16}/g,
  // Generic long random strings that might be secrets
  /[a-zA-Z0-9]{32,}/g,
];

/**
 * Redacts potential secrets from a string for safe logging.
 * Replaces detected patterns with [REDACTED].
 */
export function redactSecrets(input: string): string {
  if (!input || typeof input !== 'string') return input;
  
  let sanitized = input;
  
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  
  return sanitized;
}

/**
 * Sanitizes an object for safe logging by removing/redacting sensitive fields.
 * Creates a deep copy to avoid mutating the original.
 */
export function sanitizeForLogging<T extends Record<string, unknown>>(
  obj: T,
  maxDepth = 5
): Record<string, unknown> {
  if (!obj || typeof obj !== 'object' || maxDepth <= 0) {
    return obj;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    // Check if field name indicates sensitive data
    const isSensitive = SENSITIVE_FIELDS.some(
      field => lowerKey.includes(field.toLowerCase())
    );

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeForLogging(value as Record<string, unknown>, maxDepth - 1);
    } else if (typeof value === 'string') {
      sanitized[key] = redactSecrets(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Safe console.log that automatically sanitizes objects for secrets.
 * Use this instead of console.log when logging objects that might contain sensitive data.
 */
export function safeLog(message: string, data?: unknown): void {
  if (data && typeof data === 'object') {
    console.log(message, sanitizeForLogging(data as Record<string, unknown>));
  } else if (typeof data === 'string') {
    console.log(message, redactSecrets(data));
  } else {
    console.log(message, data);
  }
}

/**
 * Safe console.error that automatically sanitizes objects for secrets.
 * Use this instead of console.error when logging errors that might contain sensitive data.
 */
export function safeError(message: string, error?: unknown): void {
  if (error instanceof Error) {
    // Sanitize error message but preserve stack trace structure
    console.error(message, {
      name: error.name,
      message: redactSecrets(error.message),
      // Don't log stack in production as it might contain sensitive paths
      stack: import.meta.env.DEV ? error.stack : undefined,
    });
  } else if (error && typeof error === 'object') {
    console.error(message, sanitizeForLogging(error as Record<string, unknown>));
  } else if (typeof error === 'string') {
    console.error(message, redactSecrets(error));
  } else {
    console.error(message, error);
  }
}

/**
 * Converts a detailed internal error to a user-safe generic message.
 * NEVER expose internal error details to users.
 */
export function toUserSafeError(error: unknown, fallbackMessage = 'An unexpected error occurred'): string {
  // Map known error types to user-friendly messages
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    // Authentication errors
    if (message.includes('auth') || message.includes('unauthorized') || message.includes('forbidden')) {
      return 'Authentication failed. Please check your credentials and try again.';
    }
    
    // Rate limiting
    if (message.includes('rate limit') || message.includes('too many')) {
      return 'Too many requests. Please wait a moment and try again.';
    }
    
    // Network errors
    if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
      return 'Connection failed. Please check your internet connection and try again.';
    }
    
    // Validation errors - can return as-is if they don't contain sensitive info
    if (message.includes('required') || message.includes('invalid') || message.includes('must be')) {
      // Check if the message contains any sensitive patterns
      if (SECRET_PATTERNS.some(p => p.test(message))) {
        return fallbackMessage;
      }
      return error.message;
    }
  }
  
  // Default: return generic message
  return fallbackMessage;
}

/**
 * Validates that required environment variables are set.
 * For use in development/build time checks.
 * 
 * NOTE: In Edge Functions, use validateEdgeFunctionSecrets() instead.
 */
export function validateEnvVars(requiredVars: string[]): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  for (const varName of requiredVars) {
    // Only check VITE_ prefixed vars on the frontend
    if (varName.startsWith('VITE_')) {
      const value = import.meta.env[varName];
      if (!value || value === 'undefined' || value === '') {
        missing.push(varName);
      }
    }
  }
  
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Checks if a value looks like a placeholder/example secret that shouldn't be used in production.
 */
export function isPlaceholderSecret(value: string): boolean {
  const placeholders = [
    'your_api_key',
    'your_secret',
    'your_token',
    'xxx',
    'placeholder',
    'example',
    'test',
    'demo',
    'change_me',
    'change_this',
    'todo',
    'fixme',
  ];
  
  const lowerValue = value.toLowerCase();
  return placeholders.some(p => lowerValue.includes(p));
}

/**
 * Security reminder constants for documentation.
 * Use these as comments near sensitive operations.
 */
export const SECURITY_REMINDERS = {
  NEVER_LOG_SECRETS: '⚠️ SECURITY: Never log passwords, tokens, or API keys',
  USE_ENV_VARS: '⚠️ SECURITY: Load credentials from environment variables only',
  GENERIC_ERRORS: '⚠️ SECURITY: Return generic error messages to users',
  ROTATE_ON_LEAK: '⚠️ SECURITY: If a secret is leaked, rotate it immediately',
} as const;
