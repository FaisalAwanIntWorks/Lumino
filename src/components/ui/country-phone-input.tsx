import * as React from 'react';
import { COUNTRY_CODES } from '@/lib/form-validation';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { withAlpha } from '@/lib/color-utils';
import { fallbackToPngOnError } from '@/lib/webp-image-fallback';
import { parseAutofilledPhone } from '@/lib/phone-autofill';

// Flags are requested as WebP; each <img> falls back to the .png on error.
const FLAG_CDN_BASE = 'https://flagcdn.com/w40';

interface CountryPhoneInputProps {
  countryCode: string;
  phoneNumber: string;
  onCountryCodeChange: (code: string) => void;
  onPhoneNumberChange: (number: string) => void;
  /** ISO country code for precise selection (e.g. "PK", "US") */
  countryIso?: string;
  /** Emits the ISO country code when selection changes */
  onCountryIsoChange?: (iso: string) => void;
  error?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  /** Theme font color for dynamic styling */
  fontColor?: string;
  /** Theme background color for dynamic styling */
  backgroundColor?: string;
  /**
   * Optional border color for the country selector + phone input. Applied only
   * when `fontColor` isn't driving the styling (keeps existing themed behavior).
   */
  borderColor?: string;
  /** Fired when the phone input loses focus (inline validation hook). */
  onBlur?: () => void;
  /**
   * Max national digits accepted. Defaults to 10 for +1 (North American style)
   * and 15 elsewhere, so longer national numbers (DE, BR, etc.) aren't truncated.
   */
  maxLength?: number;
  /**
   * "unified" renders the dial-code picker and the number field inside one
   * bordered, translucent box with a hairline divider instead of two separate
   * boxes. Opt-in only — existing forms keep the default split look.
   */
  variant?: 'split' | 'unified';
  /** Id for the number field so a visible <label htmlFor> can describe it (desktop autofill). */
  id?: string;
}

export function CountryPhoneInput({
  countryCode,
  phoneNumber,
  onCountryCodeChange,
  onPhoneNumberChange,
  countryIso,
  onCountryIsoChange,
  error,
  disabled,
  className,
  inputClassName,
  fontColor,
  backgroundColor,
  borderColor,
  onBlur,
  maxLength,
  variant = 'split',
  id,
}: CountryPhoneInputProps) {
  const unified = variant === 'unified';
  const maxDigits = maxLength ?? (countryCode === '+1' ? 10 : 15);
  // Border override for the contact-form use case — only kicks in when the
  // themed `fontColor` styling isn't already in play.
  const borderOverride: React.CSSProperties | undefined =
    !fontColor && borderColor
      ? { borderColor, borderWidth: 1, borderStyle: 'solid' }
      : undefined;

  // One-box look: a single bordered, translucent surface with a hairline
  // divider between the dial code and the number.
  const resolvedBorder = borderColor || (fontColor ? withAlpha(fontColor, 0.35) : 'hsl(var(--border))');
  const dividerColor = resolvedBorder;
  const unifiedBoxStyle: React.CSSProperties | undefined = unified
    ? {
        border: `1px solid ${error ? 'hsl(var(--destructive))' : resolvedBorder}`,
        backgroundColor: backgroundColor || (fontColor ? withAlpha(fontColor, 0.08) : 'transparent'),
        borderRadius: 14,
        ['--qe-unified-divider' as string]: dividerColor,
      } as React.CSSProperties
    : undefined;

  // Determine the Select value using ISO code (unique per country)
  const selectValue = countryIso
    || COUNTRY_CODES.find((c) => c.code === countryCode)?.country
    || 'US';

  const selectedCountryData = COUNTRY_CODES.find((c) => c.country === selectValue);

  const handleCountrySelect = (iso: string) => {
    const country = COUNTRY_CODES.find((c) => c.country === iso);
    if (country) {
      onCountryCodeChange(country.code);
      onCountryIsoChange?.(iso);
    }
  };

  // Handle phone number input - only allow digits. Autofill/paste of a full
  // international number ("+44 7700 900123") sets the country and keeps the
  // local digits instead of being mangled.
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const intl = parseAutofilledPhone(value, selectValue);
    if (intl) {
      onCountryCodeChange(intl.countryCode);
      onCountryIsoChange?.(intl.countryIso);
      const limit = maxLength ?? (intl.countryCode === '+1' ? 10 : 15);
      onPhoneNumberChange(intl.nationalNumber.slice(0, limit));
      return;
    }
    const digitsOnly = value.replace(/\D/g, '').slice(0, maxDigits);
    onPhoneNumberChange(digitsOnly);
  };

  return (
    <div className={cn('space-y-1', className)}>
      <div className={cn('flex', unified ? 'qe-unified-phone items-stretch overflow-hidden' : 'gap-2')} style={unifiedBoxStyle}>
        <Select
          value={selectValue}
          onValueChange={handleCountrySelect}
          disabled={disabled}
        >
          <SelectTrigger
            className={cn(
              'flex-shrink-0',
              unified
                ? 'w-[104px] h-auto min-h-[48px] border-0 bg-transparent rounded-none px-3 focus:ring-0 focus:ring-offset-0'
                : 'w-[130px]',
            )}
            style={unified
              ? { color: fontColor || undefined, borderRight: `1px solid ${dividerColor}` }
              : (fontColor ? {
                backgroundColor: withAlpha(fontColor, 0.08),
                borderColor: withAlpha(fontColor, 0.35),
                color: fontColor,
              } : borderOverride)}
          >
            <span className="flex items-center gap-1.5 truncate">
              <img
                src={`${FLAG_CDN_BASE}/${selectValue.toLowerCase()}.webp`}
                alt={selectedCountryData?.name || ''}
                className="w-5 h-[14px] object-cover rounded-[2px]"
                loading="lazy"
                onError={fallbackToPngOnError}
              />
              <span className="text-sm">
                {selectedCountryData?.code || countryCode}
              </span>
            </span>
          </SelectTrigger>
          <SelectContent
            className="border z-50 max-h-[300px]"
            style={fontColor ? {
              backgroundColor: fontColor === '#ffffff' || fontColor === '#FFFFFF'
                ? 'rgba(30,30,30,0.98)'
                : 'rgba(20,20,20,0.98)',
              borderColor: withAlpha(fontColor, 0.35),
              color: fontColor,
            } : { backgroundColor: 'hsl(var(--background))' }}
          >
            {COUNTRY_CODES.map((country) => (
              <SelectItem
                key={country.country}
                value={country.country}
                className="cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <img
                    src={`${FLAG_CDN_BASE}/${country.country.toLowerCase()}.webp`}
                    alt={country.name}
                    className="w-5 h-[14px] object-cover rounded-[2px]"
                    loading="lazy"
                    onError={fallbackToPngOnError}
                  />
                  <span>{country.code}</span>
                  <span className="text-muted-foreground text-xs">{country.name}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          id={id}
          type="tel"
          name="tel"
          autoComplete="tel"
          aria-label="Phone number"
          inputMode="tel"
          value={phoneNumber}
          onChange={handlePhoneChange}
          onBlur={onBlur}
          placeholder="Phone number"
          disabled={disabled}
          className={cn(
            'flex-1',
            unified && 'h-auto min-h-[48px] border-0 bg-transparent rounded-none px-3 focus-visible:ring-0 focus-visible:ring-offset-0',
            inputClassName,
            error && !unified && 'border-destructive focus-visible:ring-destructive'
          )}
          style={unified
            ? { color: fontColor || undefined }
            : (fontColor ? {
              color: fontColor,
              borderColor: withAlpha(fontColor, 0.35),
              backgroundColor: withAlpha(fontColor, 0.08),
            } : borderOverride)}
        />
      </div>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
