/**
 * Shared password validation utility for Edge Functions
 * 
 * Password Rules:
 * - Minimum 9 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 * - Must NOT contain user's name or phone number
 */

export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
}

export interface PasswordValidationContext {
  name?: string;
  phone?: string;
}

/**
 * Normalize a string for comparison (lowercase, remove spaces)
 */
function normalizeString(str: string): string {
  return str.toLowerCase().replace(/\s+/g, '').trim();
}

/**
 * Check if password contains any part of the name
 * Splits name into parts and checks each part (min 3 chars)
 */
function containsName(password: string, name: string): boolean {
  if (!name || name.length < 3) return false;
  
  const normalizedPassword = normalizeString(password);
  const nameParts = name.split(/[\s\-\_]+/).filter(part => part.length >= 3);
  
  // Check full name
  const fullNameNormalized = normalizeString(name);
  if (fullNameNormalized.length >= 3 && normalizedPassword.includes(fullNameNormalized)) {
    return true;
  }
  
  // Check individual name parts
  for (const part of nameParts) {
    const normalizedPart = normalizeString(part);
    if (normalizedPart.length >= 3 && normalizedPassword.includes(normalizedPart)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if password contains phone number (digits only)
 */
function containsPhone(password: string, phone: string): boolean {
  if (!phone || phone.length < 4) return false;
  
  // Extract only digits from phone
  const phoneDigits = phone.replace(/\D/g, '');
  
  // Need at least 4 consecutive digits to match
  if (phoneDigits.length < 4) return false;
  
  // Check if password contains the phone digits
  const passwordDigits = password.replace(/\D/g, '');
  
  // Check for consecutive digit sequences
  if (phoneDigits.length >= 4 && passwordDigits.includes(phoneDigits)) {
    return true;
  }
  
  // Also check 4-digit sequences from the phone number
  for (let i = 0; i <= phoneDigits.length - 4; i++) {
    const sequence = phoneDigits.substring(i, i + 4);
    if (password.includes(sequence)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Validate password strength with all rules
 */
export function validatePassword(
  password: string,
  context?: PasswordValidationContext
): PasswordValidationResult {
  // Length check - minimum 9 characters
  if (password.length < 9) {
    return { valid: false, error: "Password must be at least 9 characters" };
  }
  
  // Maximum length
  if (password.length > 128) {
    return { valid: false, error: "Password must be less than 128 characters" };
  }
  
  // Uppercase letter
  if (!/[A-Z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one uppercase letter" };
  }
  
  // Lowercase letter
  if (!/[a-z]/.test(password)) {
    return { valid: false, error: "Password must contain at least one lowercase letter" };
  }
  
  // Number
  if (!/[0-9]/.test(password)) {
    return { valid: false, error: "Password must contain at least one number" };
  }
  
  // Special character
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, error: "Password must contain at least one special character" };
  }
  
  // Check for name in password
  if (context?.name && containsName(password, context.name)) {
    return { valid: false, error: "Password must not contain your name" };
  }
  
  // Check for phone in password
  if (context?.phone && containsPhone(password, context.phone)) {
    return { valid: false, error: "Password must not contain your phone number" };
  }
  
  return { valid: true };
}

/**
 * Validate password for password reset (no name/phone context available)
 */
export function validatePasswordBasic(password: string): PasswordValidationResult {
  return validatePassword(password);
}
