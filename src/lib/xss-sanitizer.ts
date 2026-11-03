/**
 * XSS Sanitization Utilities
 * Client-side defense layer against Cross-Site Scripting attacks
 * 
 * Defense Layers:
 * 1. Input validation - Reject or strip HTML tags at input time
 * 2. Output encoding - Escape special characters when rendering
 * 3. Content Security Policy - Browser-level script execution controls (in _headers)
 * 4. URL validation - Never trust user input for href or src attributes
 */

/**
 * Sanitize a string by stripping HTML tags and dangerous characters
 * Use this for any user-provided text that will be displayed
 */
export function sanitizeText(input: unknown): string {
  if (typeof input !== 'string') return '';
  
  return input
    .replace(/<[^>]*>/g, '')           // Remove HTML tags
    .replace(/[<>"'`]/g, '')           // Remove potentially dangerous chars
    .replace(/javascript:/gi, '')       // Remove javascript: protocol
    .replace(/data:/gi, '')             // Remove data: protocol (can contain scripts)
    .replace(/vbscript:/gi, '')         // Remove vbscript: protocol
    .replace(/on\w+=/gi, '')            // Remove event handlers like onclick=
    .trim();
}

/**
 * Sanitize and validate a hex color code
 * Returns null if invalid, preventing CSS injection
 */
export function sanitizeHexColor(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  
  // Remove any non-hex characters first
  const cleaned = input.trim().replace(/[^#a-fA-F0-9]/g, '');
  
  // Validate hex color format: #RGB, #RGBA, #RRGGBB, or #RRGGBBAA
  const hexRegex = /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{4}|[A-Fa-f0-9]{6}|[A-Fa-f0-9]{8})$/;
  
  if (hexRegex.test(cleaned)) {
    return cleaned;
  }
  
  return null;
}

/**
 * Sanitize and validate a URL
 * Only allows http, https, and relative URLs
 * Prevents javascript:, data:, vbscript: XSS vectors
 */
export function sanitizeUrl(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  
  const trimmed = input.trim();
  
  // Empty strings are okay
  if (trimmed === '') return '';
  
  // Check for dangerous protocols
  const dangerousProtocols = [
    /^javascript:/i,
    /^data:/i,
    /^vbscript:/i,
    /^file:/i,
  ];
  
  for (const protocol of dangerousProtocols) {
    if (protocol.test(trimmed)) {
      console.warn('[XSS] Blocked dangerous URL protocol:', trimmed.slice(0, 20));
      return null;
    }
  }
  
  // Allow relative URLs (starting with / or .)
  if (trimmed.startsWith('/') || trimmed.startsWith('.')) {
    // Validate it doesn't contain script injections
    if (/<script|javascript:|on\w+=/i.test(trimmed)) {
      return null;
    }
    return trimmed;
  }
  
  // Validate absolute URLs
  try {
    const url = new URL(trimmed);
    
    // Only allow http and https protocols
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      console.warn('[XSS] Blocked non-HTTP URL protocol:', url.protocol);
      return null;
    }
    
    return trimmed;
  } catch {
    // Invalid URL format
    return null;
  }
}

/**
 * Sanitize a company name or display name
 * Strips HTML and limits to safe characters
 */
export function sanitizeDisplayName(input: unknown, maxLength = 100): string {
  if (typeof input !== 'string') return '';
  
  return input
    .replace(/<[^>]*>/g, '')           // Remove HTML tags
    .replace(/[<>"'`&;]/g, '')         // Remove dangerous chars
    .replace(/[\x00-\x1F\x7F]/g, '')   // Remove control characters
    .slice(0, maxLength)
    .trim();
}

/**
 * Sanitize email for display (not for sending)
 * Validates format and strips dangerous content
 */
export function sanitizeEmailForDisplay(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  
  const cleaned = input.trim().toLowerCase().slice(0, 320);
  
  // Basic email format validation
  const emailRegex = /^[^\s@<>'"]+@[^\s@<>'"]+\.[^\s@<>'"]+$/;
  
  if (emailRegex.test(cleaned)) {
    return cleaned;
  }
  
  return null;
}

/**
 * Sanitize phone number for display
 * Only allows digits, spaces, dashes, parentheses, and plus sign
 */
export function sanitizePhoneForDisplay(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  
  // Only allow phone-safe characters
  const cleaned = input.replace(/[^\d\s\-\(\)\+]/g, '').slice(0, 30);
  
  if (cleaned.length >= 7) {
    return cleaned;
  }
  
  return null;
}

/**
 * Escape HTML entities for safe display
 * Use when you need to display text that might contain HTML characters
 */
export function escapeHtml(input: string): string {
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '`': '&#x60;',
  };
  
  return input.replace(/[&<>"'`]/g, (char) => escapeMap[char] || char);
}

/**
 * Validate and sanitize preview branding from URL parameters
 * Comprehensive sanitization for all branding fields
 */
export interface SanitizedBranding {
  primaryColor?: string;
  secondaryColor?: string;
  logoUrl?: string;
  companyName?: string;
  welcomeMessage?: string;
  contactEmail?: string;
  contactPhone?: string;
  showChatAssistant?: boolean;
  showComparison?: boolean;
  showSaveDesign?: boolean;
}

export function sanitizeBrandingParams(params: URLSearchParams): SanitizedBranding | null {
  if (!params.get('preview')) return null;
  
  const result: SanitizedBranding = {};
  
  // Sanitize color values
  const primaryColor = sanitizeHexColor(params.get('primaryColor'));
  if (primaryColor) result.primaryColor = primaryColor;
  
  const secondaryColor = sanitizeHexColor(params.get('secondaryColor'));
  if (secondaryColor) result.secondaryColor = secondaryColor;
  
  // Sanitize URL
  const logoUrl = sanitizeUrl(params.get('logoUrl'));
  if (logoUrl) result.logoUrl = logoUrl;
  
  // Sanitize display names
  const companyName = sanitizeDisplayName(params.get('companyName'));
  if (companyName) result.companyName = companyName;
  
  const welcomeMessage = sanitizeText(params.get('welcomeMessage'));
  if (welcomeMessage) result.welcomeMessage = welcomeMessage.slice(0, 500);
  
  // Sanitize contact info
  const contactEmail = sanitizeEmailForDisplay(params.get('contactEmail'));
  if (contactEmail) result.contactEmail = contactEmail;
  
  const contactPhone = sanitizePhoneForDisplay(params.get('contactPhone'));
  if (contactPhone) result.contactPhone = contactPhone;
  
  // Boolean flags are safe (strict comparison)
  result.showChatAssistant = params.get('showChatAssistant') === 'true';
  result.showComparison = params.get('showComparison') === 'true';
  result.showSaveDesign = params.get('showSaveDesign') === 'true';
  
  return result;
}
