import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import { COUNTRY_CODES } from '@/lib/form-validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { CountryPhoneInput } from '@/components/ui/country-phone-input';
import { checkPhone } from '@/lib/phone-quality';
import { isDisposableEmail } from '@/lib/lead-quality';
import type { DttFormContent } from '@/hooks/useClientDttFormConfig';

interface DiamondContactStepProps {
  onSubmit: (data: ContactFormData) => void;
  onBack: () => void;
  onClose?: () => void;
  /** Optional per-client styling for the contact fields (placeholder/border). */
  content?: DttFormContent | null;
  /** When on, disposable/temporary email domains are rejected inline. */
  blockDisposableEmail?: boolean;
  /** Single-box dial code + number field (sandbox Quote Estimator look). */
  unifiedPhone?: boolean;
  /** V3 preview copy; older forms keep their established wording. */
  previewOnly?: boolean;
  quoteV3?: boolean;
}

export interface ContactFormData {
  firstName: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  smsConsent: boolean;
  marketingConsent: boolean;
  /** ISO country of the selected dial code — improves phone validation. */
  countryIso?: string;
  /** Milliseconds the customer spent on the contact step (bot signal). */
  submissionMs?: number;
  /** Hidden bot-trap field. Non-empty means a bot filled the form. */
  honeypot?: string;
}

export const DiamondContactStep = ({ onSubmit, onBack, onClose, content, blockDisposableEmail, unifiedPhone, previewOnly = false, quoteV3 = false }: DiamondContactStepProps) => {
  // Optional per-client field styling. Only applied when the client actually
  // set a value — otherwise the built-in borderless / gray-placeholder DTT
  // look is preserved exactly. Values are sanitized before being used in a
  // <style> rule / inline style to avoid CSS injection.
  const isSafeColor = (c?: string) => !!c && /^[#a-zA-Z0-9(),.%\s]+$/.test(c);
  const rawPlaceholder = content?.contactPlaceholderColor?.trim();
  const rawBorder = content?.contactBorderColor?.trim();
  const placeholderColor = isSafeColor(rawPlaceholder) ? rawPlaceholder : undefined;
  const borderColor = isSafeColor(rawBorder) ? rawBorder : undefined;
  const fieldStyle: CSSProperties | undefined = borderColor
    ? { borderColor, borderWidth: 1, borderStyle: 'solid' }
    : undefined;

  const [formData, setFormData] = useState<ContactFormData>({
    firstName: '',
    email: '',
    countryCode: '+1',
    phoneNumber: '',
    smsConsent: false,
    marketingConsent: false,
  });

  const [selectedCountryIso, setSelectedCountryIso] = useState('US');
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Bot signals — invisible to real customers, zero friction.
  const [honeypot, setHoneypot] = useState('');
  const openedAt = useRef<number>(Date.now());

  // Auto-detect country from IP
  useEffect(() => {
    const detectCountry = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/');
        if (!res.ok) return;
        const data = await res.json();
        const callingCode = data.country_calling_code; // e.g. "+92"
        const countryIso = data.country_code; // e.g. "PK"
        if (callingCode && countryIso) {
          // Find matching entry in COUNTRY_CODES
          const match = COUNTRY_CODES.find(
            (c) => c.country === countryIso && c.code === callingCode
          ) || COUNTRY_CODES.find((c) => c.code === callingCode);
          if (match) {
            setFormData((prev) => ({ ...prev, countryCode: match.code }));
            setSelectedCountryIso(match.country);
          }
        }
      } catch {
        // Silently fail — keep default +1
      }
    };
    detectCountry();
  }, []);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.firstName.trim()) {
      newErrors.firstName = 'First name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    } else if (blockDisposableEmail && isDisposableEmail(formData.email)) {
      newErrors.email = 'Please use a permanent email address';
    }

    // Real numbering-plan validation (offline, no API cost) instead of a flat
    // 10-digit rule, so international numbers work and junk numbers don't.
    if (!formData.phoneNumber.trim()) {
      newErrors.phoneNumber = 'Phone number is required';
    } else {
      const result = checkPhone(formData.countryCode, formData.phoneNumber, selectedCountryIso);
      if (!result.valid) newErrors.phoneNumber = result.error || 'Please enter a valid phone number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validatePhoneOnBlur = () => {
    if (!formData.phoneNumber.trim()) return;
    const result = checkPhone(formData.countryCode, formData.phoneNumber, selectedCountryIso);
    setErrors(prev => {
      const next = { ...prev };
      if (result.valid) delete next.phoneNumber;
      else next.phoneNumber = result.error || 'Please enter a valid phone number';
      return next;
    });
  };

  const handleSubmit = () => {
    if (validateForm()) {
      onSubmit({
        ...formData,
        countryIso: selectedCountryIso,
        submissionMs: Date.now() - openedAt.current,
        honeypot,
      });
    }
  };

  return (
    <div className={quoteV3 ? 'v3-contact-fields' : 'bg-[#EDE8E3] rounded-lg p-4 md:p-10 relative min-h-[100dvh] md:min-h-0'}>
      {/* Client-set placeholder color for the contact fields (scoped to this
          form's inputs). Omitted entirely when not customized. */}
      {placeholderColor && (
        <style>{`.dtt-contact-input::placeholder{color:${placeholderColor} !important;}`}</style>
      )}
      {/* Close Button */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-3 right-3 md:top-4 md:right-4 w-7 h-7 md:w-8 md:h-8 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4 md:w-5 md:h-5 text-white" />
        </button>
      )}

      {/* Header */}
      <div className="text-center mb-4 md:mb-8">
        <h2 className="text-lg md:text-3xl font-bold text-gray-900 mb-1.5 md:mb-3">
          {previewOnly ? 'Preview your completed request' : quoteV3 ? 'Your details' : 'Your Ring Builder estimate is on the next page!'}
        </h2>
        <p className="text-gray-600 text-xs md:text-base">
           {previewOnly ? 'This test will not send an email or save a lead.' : quoteV3 ? "We’ll follow up with your estimate after reviewing your design." : "We'll send your estimate by email for easy reference."}
         </p>
      </div>

      {/* Form */}
      {/* Bot trap — kept OUTSIDE the contact form so Safari/Chrome don't count
          it as a contact box (Safari ignores autocomplete="off" and could
          group-fill it, breaking one-tap fill and flagging real leads). */}
      <input
        type="text"
        name="jx_hp_ref"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
      />
      <form className="max-w-md mx-auto space-y-3 md:space-y-4" autoComplete="on" noValidate onSubmit={(e) => e.preventDefault()}>
        {/* First Name */}
        <div>
          <Input
            type="text"
            name="given-name"
            autoComplete="given-name" aria-label="First name"
            autoCapitalize="words"
            placeholder="First Name*"
            value={formData.firstName}
            onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
            style={fieldStyle}
            className={`dtt-contact-input bg-white border-0 h-11 md:h-14 text-gray-800 placeholder:text-gray-500 rounded-lg text-[16px] ${
              errors.firstName ? 'ring-2 ring-red-300' : ''
            }`}
          />
          {errors.firstName && (
            <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <Input
            type="email"
            name="email"
            autoComplete="email" aria-label="Email"
            inputMode="email"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Email*"
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            style={fieldStyle}
            className={`dtt-contact-input bg-white border-0 h-11 md:h-14 text-gray-800 placeholder:text-gray-500 rounded-lg text-[16px] ${
              errors.email ? 'ring-2 ring-red-300' : ''
            }`}
          />
          {errors.email && (
            <p className="text-red-500 text-xs mt-1">{errors.email}</p>
          )}
        </div>

        {/* Phone with Country Code */}
        <div className={unifiedPhone ? '' : 'bg-white rounded-lg overflow-hidden'}>
          <CountryPhoneInput
            variant={unifiedPhone ? 'unified' : 'split'}
            countryCode={formData.countryCode}
            phoneNumber={formData.phoneNumber}
            countryIso={selectedCountryIso}
            onCountryCodeChange={(code) => setFormData(prev => ({ ...prev, countryCode: code }))}
            onCountryIsoChange={(iso) => setSelectedCountryIso(iso)}
            onPhoneNumberChange={(number) => setFormData(prev => ({ ...prev, phoneNumber: number }))}
            error={errors.phoneNumber}
            className="border-0"
            inputClassName="dtt-contact-input"
            borderColor={borderColor}
            onBlur={validatePhoneOnBlur}
            maxLength={15}
          />
        </div>

        {/* SMS Consent Checkbox */}
        <div className="flex items-start gap-2 md:gap-3 pt-1 md:pt-2">
          <Checkbox
            id="sms-consent"
            checked={formData.smsConsent}
            onCheckedChange={(checked) =>
              setFormData(prev => ({ ...prev, smsConsent: checked === true }))
            }
            className="mt-0.5 md:mt-1 border-gray-400 data-[state=checked]:bg-gray-800 data-[state=checked]:text-white"
          />
          <label htmlFor="sms-consent" className="text-gray-600 text-[10px] md:text-xs leading-relaxed cursor-pointer">
            Select this to receive quote by SMS - I Consent to Receive SMS Notifications and Alerts.
            Message frequency varies. Message & data rates may apply. Text HELP for assistance.
            You can reply STOP to unsubscribe at any time.
          </label>
        </div>

        {/* Marketing Consent Checkbox */}
        <div className="flex items-start gap-2 md:gap-3">
          <Checkbox
            id="marketing-consent"
            checked={formData.marketingConsent}
            onCheckedChange={(checked) =>
              setFormData(prev => ({ ...prev, marketingConsent: checked === true }))
            }
            className="mt-0.5 md:mt-1 border-gray-400 data-[state=checked]:bg-gray-800 data-[state=checked]:text-white"
          />
          <label htmlFor="marketing-consent" className="text-gray-600 text-[10px] md:text-xs leading-relaxed cursor-pointer">
            I agree to receive marketing emails, news, offers and updates.
            I understand I can unsubscribe at any time.
          </label>
        </div>

        {/* Submit Button */}
        <div className="pt-2 md:pt-4">
          <Button
            onClick={handleSubmit}
            className="w-full bg-black text-white hover:bg-gray-900 h-11 md:h-14 text-base md:text-lg font-semibold rounded-lg border border-black"
          >
              {previewOnly ? 'Complete preview' : quoteV3 ? 'Send quote request' : 'Next Step'}
          </Button>
        </div>

      </form>
    </div>
  );
};
