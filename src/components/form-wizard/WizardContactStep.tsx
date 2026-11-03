import { useId, useState } from 'react';
import { User, Mail, Phone, FileCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { CountryPhoneInput } from '@/components/ui/country-phone-input';
import { StepHeading } from '@/components/form-wizard/StepHeading';
import {
  nameSchema,
  emailSchema,
  countryCodeSchema,
} from '@/lib/form-validation';
import { checkPhone } from '@/lib/phone-quality';
import type { RequiredContactFields } from '@/hooks/useClientGrillConfig';

interface WizardContactStepProps {
  name: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  countryIso: string;
  onNameChange: (v: string) => void;
  onEmailChange: (v: string) => void;
  onCountryCodeChange: (v: string) => void;
  onPhoneNumberChange: (v: string) => void;
  onCountryIsoChange: (v: string) => void;
  errors: Record<string, string>;
  accentColor: string;
  fontColor: string;
  requiredFields?: RequiredContactFields;
  termsAccepted?: boolean;
  onTermsChange?: (v: boolean) => void;
  companyName?: string;
  termsUrl?: string;
  privacyUrl?: string;
}

export function WizardContactStep({
  name,
  email,
  countryCode,
  phoneNumber,
  countryIso,
  onNameChange,
  onEmailChange,
  onCountryCodeChange,
  onPhoneNumberChange,
  onCountryIsoChange,
  errors,
  accentColor,
  fontColor,
  requiredFields,
  termsAccepted,
  onTermsChange,
  companyName,
  termsUrl,
  privacyUrl,
}: WizardContactStepProps) {
  const uid = useId();
  const nameId = `${uid}-name`, emailId = `${uid}-email`, phoneId = `${uid}-tel`;
  const req = requiredFields || { name: true, email: true, phone: true };
  // Inline blur feedback so a bogus number is flagged immediately, not only on Next.
  const [phoneBlurError, setPhoneBlurError] = useState('');
  const phoneError = errors.phone || phoneBlurError;

  const inputStyle = (hasError: boolean) => ({
    borderColor: hasError ? '#ef4444' : `${fontColor}20`,
    color: fontColor,
    backgroundColor: `${fontColor}08`,
  });

  const focusGlow = `0 0 0 2px ${accentColor}40`;

  return (
    <div className="space-y-6">
      <StepHeading
        preText="YOUR AI RENDER"
        highlightText="AWAITS"
        subtitle="Fill in your details to unlock your AI preview"
        accentColor={accentColor}
        fontColor={fontColor}
      />

      <form
        className="max-w-lg mx-auto w-full px-4 md:px-8"
        autoComplete="on"
        noValidate
        onSubmit={(e) => e.preventDefault()}
      >
        {/* Glassmorphic card */}
        <div
          className="rounded-2xl border p-5 md:p-7 space-y-5 backdrop-blur-sm"
          style={{
            backgroundColor: `${fontColor}06`,
            borderColor: `${fontColor}12`,
            boxShadow: `0 4px 24px ${fontColor}08`,
          }}
        >
          {/* Full Name */}
          <div className="space-y-1.5">
            <Label
              htmlFor={nameId}
              className="text-xs font-semibold uppercase tracking-widest flex items-center gap-1.5"
              style={{ color: `${fontColor}70` }}
            >
              <User className="w-3.5 h-3.5" />
              Full Name {req.name ? '*' : ''}
            </Label>
            <Input
              id={nameId}
              name="name"
              autoComplete="name"
              autoCapitalize="words"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Your full name"
              maxLength={100}
              className="bg-transparent border rounded-xl h-12 transition-shadow focus:shadow-[var(--focus-glow)]"
              style={{
                ...inputStyle(!!errors.name),
                '--focus-glow': focusGlow,
              } as React.CSSProperties}
            />
            {errors.name && (
              <p className="text-xs text-red-400 mt-0.5">{errors.name}</p>
            )}
          </div>

          {/* Subtle divider */}
          <div className="h-px w-full" style={{ backgroundColor: `${fontColor}10` }} />

          {/* Email */}
          <div className="space-y-1.5">
            <Label
              htmlFor={emailId}
              className="text-xs font-semibold uppercase tracking-widest flex items-center gap-1.5"
              style={{ color: `${fontColor}70` }}
            >
              <Mail className="w-3.5 h-3.5" />
              Email {req.email ? '*' : ''}
            </Label>
            <Input
              id={emailId}
              type="email"
              name="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="off"
              spellCheck={false}
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              placeholder="your@email.com"
              maxLength={255}
              className="bg-transparent border rounded-xl h-12 transition-shadow"
              style={inputStyle(!!errors.email)}
            />
            {errors.email && (
              <p className="text-xs text-red-400 mt-0.5">{errors.email}</p>
            )}
          </div>

          {/* Subtle divider */}
          <div className="h-px w-full" style={{ backgroundColor: `${fontColor}10` }} />

          {/* Phone */}
          <div className="space-y-1.5">
            <Label
              htmlFor={phoneId}
              className="text-xs font-semibold uppercase tracking-widest flex items-center gap-1.5"
              style={{ color: `${fontColor}70` }}
            >
              <Phone className="w-3.5 h-3.5" />
              Phone Number {req.phone ? '*' : ''}
            </Label>
            <CountryPhoneInput
              id={phoneId}
              countryCode={countryCode}
              phoneNumber={phoneNumber}
              onCountryCodeChange={onCountryCodeChange}
              onPhoneNumberChange={(v) => { if (phoneBlurError) setPhoneBlurError(''); onPhoneNumberChange(v); }}
              countryIso={countryIso}
              onCountryIsoChange={onCountryIsoChange}
              error={errors.phone}
              inputClassName="bg-transparent border rounded-xl h-12"
              fontColor={fontColor}
              backgroundColor={accentColor}
            />
          </div>

          {/* Terms & Conditions */}
          {onTermsChange && (
            <>
              <div className="h-px w-full" style={{ backgroundColor: `${fontColor}10` }} />
              <div className="space-y-1.5">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="terms-consent"
                    checked={termsAccepted || false}
                    onCheckedChange={(checked) => onTermsChange(checked === true)}
                    className="mt-0.5 border-2"
                    style={{
                      borderColor: errors.terms ? '#ef4444' : `${fontColor}30`,
                      '--tw-ring-color': accentColor,
                    } as React.CSSProperties}
                  />
                  <label
                    htmlFor="terms-consent"
                    className="text-xs leading-relaxed cursor-pointer"
                    style={{ color: `${fontColor}90` }}
                  >
                    I accept the{' '}
                    {termsUrl ? (
                      <a
                        href={termsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-semibold hover:opacity-80 transition-opacity"
                        style={{ color: accentColor }}
                      >
                        Terms & Conditions
                      </a>
                    ) : (
                      <span className="font-semibold">Terms & Conditions</span>
                    )}
                    {' and '}
                    {privacyUrl ? (
                      <a
                        href={privacyUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline font-semibold hover:opacity-80 transition-opacity"
                        style={{ color: accentColor }}
                      >
                        Privacy Policy
                      </a>
                    ) : (
                      <span className="font-semibold">Privacy Policy</span>
                    )}
                    {companyName ? ` of ${companyName}` : ''} *
                  </label>
                </div>
                {errors.terms && (
                  <p className="text-xs text-red-400 ml-8">{errors.terms}</p>
                )}
              </div>
            </>
          )}
        </div>
      </form>
    </div>
  );
}

/** Validate contact fields. Returns errors map (empty = valid). */
export function validateContactFields(data: {
  name: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  countryIso?: string;
}, requiredFields?: RequiredContactFields, termsAccepted?: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  const req = requiredFields || { name: true, email: true, phone: true };

  if (req.name) {
    const nameResult = nameSchema.safeParse(data.name);
    if (!nameResult.success) errors.name = nameResult.error.errors[0]?.message || 'Invalid name';
  }

  if (req.email) {
    const emailResult = emailSchema.safeParse(data.email);
    if (!emailResult.success) errors.email = emailResult.error.errors[0]?.message || 'Invalid email';
  }

  // Phone: real numbering-plan check + junk-pattern filter (offline, no API cost).
  // Only run when a number is present or the field is required — optional empty
  // phones stay optional.
  const hasPhone = !!(data.phoneNumber || '').replace(/\D/g, '');
  if (req.phone || hasPhone) {
    const codeResult = countryCodeSchema.safeParse(data.countryCode);
    if (!codeResult.success) {
      errors.phone = 'Select a country code';
    } else {
      const result = checkPhone(data.countryCode, data.phoneNumber, data.countryIso);
      if (!result.valid) errors.phone = result.error || 'Invalid phone number';
    }
  }

  if (termsAccepted === false) {
    errors.terms = 'You must accept the terms & conditions';
  }

  return errors;
}
