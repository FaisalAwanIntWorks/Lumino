import { z } from 'zod';

// Common country codes for the picker
export const COUNTRY_CODES = [
  { code: '+1', country: 'US', flag: '🇺🇸', name: 'United States' },
  { code: '+1', country: 'CA', flag: '🇨🇦', name: 'Canada' },
  { code: '+44', country: 'GB', flag: '🇬🇧', name: 'United Kingdom' },
  { code: '+91', country: 'IN', flag: '🇮🇳', name: 'India' },
  { code: '+61', country: 'AU', flag: '🇦🇺', name: 'Australia' },
  { code: '+49', country: 'DE', flag: '🇩🇪', name: 'Germany' },
  { code: '+33', country: 'FR', flag: '🇫🇷', name: 'France' },
  { code: '+39', country: 'IT', flag: '🇮🇹', name: 'Italy' },
  { code: '+34', country: 'ES', flag: '🇪🇸', name: 'Spain' },
  { code: '+81', country: 'JP', flag: '🇯🇵', name: 'Japan' },
  { code: '+86', country: 'CN', flag: '🇨🇳', name: 'China' },
  { code: '+82', country: 'KR', flag: '🇰🇷', name: 'South Korea' },
  { code: '+55', country: 'BR', flag: '🇧🇷', name: 'Brazil' },
  { code: '+52', country: 'MX', flag: '🇲🇽', name: 'Mexico' },
  { code: '+971', country: 'AE', flag: '🇦🇪', name: 'UAE' },
  { code: '+65', country: 'SG', flag: '🇸🇬', name: 'Singapore' },
  { code: '+852', country: 'HK', flag: '🇭🇰', name: 'Hong Kong' },
  { code: '+972', country: 'IL', flag: '🇮🇱', name: 'Israel' },
  { code: '+27', country: 'ZA', flag: '🇿🇦', name: 'South Africa' },
  { code: '+64', country: 'NZ', flag: '🇳🇿', name: 'New Zealand' },
  { code: '+92', country: 'PK', flag: '🇵🇰', name: 'Pakistan' },
  { code: '+90', country: 'TR', flag: '🇹🇷', name: 'Turkey' },
  { code: '+48', country: 'PL', flag: '🇵🇱', name: 'Poland' },
  { code: '+46', country: 'SE', flag: '🇸🇪', name: 'Sweden' },
  { code: '+47', country: 'NO', flag: '🇳🇴', name: 'Norway' },
  { code: '+45', country: 'DK', flag: '🇩🇰', name: 'Denmark' },
  { code: '+31', country: 'NL', flag: '🇳🇱', name: 'Netherlands' },
  { code: '+41', country: 'CH', flag: '🇨🇭', name: 'Switzerland' },
  { code: '+66', country: 'TH', flag: '🇹🇭', name: 'Thailand' },
  { code: '+63', country: 'PH', flag: '🇵🇭', name: 'Philippines' },
  { code: '+60', country: 'MY', flag: '🇲🇾', name: 'Malaysia' },
  { code: '+62', country: 'ID', flag: '🇮🇩', name: 'Indonesia' },
  { code: '+234', country: 'NG', flag: '🇳🇬', name: 'Nigeria' },
  { code: '+20', country: 'EG', flag: '🇪🇬', name: 'Egypt' },
  { code: '+7', country: 'RU', flag: '🇷🇺', name: 'Russia' },
  { code: '+380', country: 'UA', flag: '🇺🇦', name: 'Ukraine' },
  { code: '+84', country: 'VN', flag: '🇻🇳', name: 'Vietnam' },
  { code: '+880', country: 'BD', flag: '🇧🇩', name: 'Bangladesh' },
  { code: '+94', country: 'LK', flag: '🇱🇰', name: 'Sri Lanka' },
] as const;

// Phone number validation - only digits, 7-15 characters (without country code)
export const phoneNumberSchema = z
  .string()
  .trim()
  .min(7, 'Phone number must be at least 7 digits')
  .max(15, 'Phone number is too long')
  .regex(/^[0-9]+$/, 'Phone number can only contain digits');

// Name validation with sanitization - prevents SQL injection and XSS
export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must be less than 100 characters')
  .regex(
    /^[a-zA-Z\s\-'\.À-ÿ]+$/,
    'Name can only contain letters, spaces, hyphens, and apostrophes'
  )
  .transform((val) => val.replace(/[<>]/g, '')); // Extra safety: strip angle brackets

// Disposable / dummy email domain blocklist
const BLOCKED_EMAIL_DOMAINS = new Set([
  'mailinator.com', 'tempmail.com', 'test.com', 'example.com',
  'guerrillamail.com', 'throwaway.email', 'yopmail.com',
  'sharklasers.com', 'trashmail.com', 'fakeinbox.com',
  'maildrop.cc', 'dispostable.com', 'temp-mail.org',
  'guerrillamailblock.com', 'grr.la', 'mailnesia.com',
  'tempail.com', 'trash-mail.com', '10minutemail.com',
  'mohmal.com', 'burnermail.io', 'fake.com', 'nowhere.com',
]);

// Email validation
export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .max(255, 'Email must be less than 255 characters')
  .email('Please enter a valid email address')
  .transform((val) => val.toLowerCase())
  .refine((email) => {
    const domain = email.split('@')[1];
    if (!domain) return false;
    // Block known disposable domains
    if (BLOCKED_EMAIL_DOMAINS.has(domain)) return false;
    // Block obvious test patterns (local part === domain name, e.g. test@test.com)
    const local = email.split('@')[0];
    const domainName = domain.split('.')[0];
    if (local === domainName && ['test', 'fake', 'asdf', 'aaa', 'abc', 'dummy', 'none', 'null'].includes(local)) return false;
    return true;
  }, { message: 'Please use a real email address' });

// Notes/message validation with sanitization
export const notesSchema = z
  .string()
  .trim()
  .min(1, 'Notes are required')
  .max(1000, 'Notes must be less than 1000 characters')
  .transform((val) => {
    // Strip HTML tags to prevent XSS
    return val.replace(/<[^>]*>/g, '').replace(/[<>]/g, '');
  });

// Country code validation
export const countryCodeSchema = z
  .string()
  .min(1, 'Country code is required')
  .regex(/^\+[0-9]{1,4}$/, 'Invalid country code');

// Complete Save Design form schema
export const saveDesignSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  countryCode: countryCodeSchema,
  phoneNumber: phoneNumberSchema,
  notes: notesSchema,
});

export type SaveDesignFormData = z.infer<typeof saveDesignSchema>;

// Helper to format phone for storage (E.164 format)
export function formatPhoneE164(countryCode: string, phoneNumber: string): string {
  // Remove any non-digit characters from phone number
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  return `${countryCode}${cleanPhone}`;
}

// Helper to get validation error message
export function getValidationErrorMessage(error: z.ZodError): string {
  return error.errors[0]?.message || 'Validation error';
}

// Helper to get all validation errors as a map
export function getValidationErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  error.errors.forEach((err) => {
    const path = err.path.join('.');
    if (!errors[path]) {
      errors[path] = err.message;
    }
  });
  return errors;
}
