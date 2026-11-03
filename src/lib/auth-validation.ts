import { z } from 'zod';

// Email validation schema with sanitization
export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .max(255, 'Email must be less than 255 characters')
  .email('Please enter a valid email address')
  .transform(val => val.toLowerCase());

// Strong password validation schema (9 chars minimum)
export const passwordSchema = z
  .string()
  .min(9, 'Password must be at least 9 characters')
  .max(128, 'Password must be less than 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

// Login form validation
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128, 'Password is too long'),
});

// Signup form validation with password confirmation
export const signupSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, 'Company name must be at least 2 characters')
    .max(100, 'Company name must be less than 100 characters'),
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Reset password form validation
export const resetPasswordSchema = z.object({
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Password strength checker for UI feedback
export interface PasswordStrength {
  score: number; // 0-5
  checks: {
    length: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
    special: boolean;
  };
}

export function checkPasswordStrength(password: string): PasswordStrength {
  const checks = {
    length: password.length >= 9, // Updated to 9 characters
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  const score = Object.values(checks).filter(Boolean).length;

  return { score, checks };
}

/**
 * Validate that password does not contain user's name or phone number
 * @param password - The password to validate
 * @param name - User's name (optional)
 * @param phone - User's phone number (optional)
 * @returns Error message if invalid, null if valid
 */
export function validatePasswordContent(
  password: string,
  name?: string,
  phone?: string
): string | null {
  const normalizedPassword = password.toLowerCase().replace(/\s+/g, '');
  
  // Check for name
  if (name && name.length >= 3) {
    const nameParts = name.split(/[\s\-\_]+/).filter(part => part.length >= 3);
    const fullNameNormalized = name.toLowerCase().replace(/\s+/g, '');
    
    // Check full name
    if (fullNameNormalized.length >= 3 && normalizedPassword.includes(fullNameNormalized)) {
      return 'Password must not contain your name';
    }
    
    // Check individual name parts
    for (const part of nameParts) {
      const normalizedPart = part.toLowerCase();
      if (normalizedPart.length >= 3 && normalizedPassword.includes(normalizedPart)) {
        return 'Password must not contain your name';
      }
    }
  }
  
  // Check for phone number
  if (phone && phone.length >= 4) {
    const phoneDigits = phone.replace(/\D/g, '');
    
    if (phoneDigits.length >= 4) {
      // Check for consecutive digit sequences
      for (let i = 0; i <= phoneDigits.length - 4; i++) {
        const sequence = phoneDigits.substring(i, i + 4);
        if (password.includes(sequence)) {
          return 'Password must not contain your phone number';
        }
      }
    }
  }
  
  return null;
}

// Staff creation form schema with name/phone checks
export const staffPasswordSchema = z.object({
  password: passwordSchema,
  name: z.string().optional(),
  phone: z.string().optional(),
}).refine((data) => {
  const error = validatePasswordContent(data.password, data.name, data.phone);
  return !error;
}, {
  message: 'Password must not contain your name or phone number',
  path: ['password'],
});

// Helper to get formatted validation error messages
export function getValidationErrorMessage(error: z.ZodError): string {
  return error.errors[0]?.message || 'Validation error';
}
