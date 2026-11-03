// Ring OS widget — No-Deposit lead form.
//
// Rendered inline inside the widget's configuration panel (the same surface the
// step options use) when the client's widget pricing mode is `no_deposit` and
// the shopper taps the final CTA. Mirrors the contact step at the end of the
// Quote Estimator (Diamond) form: first name, email, phone, SMS + marketing
// consent.
//
// On submit the row is written to `saved_designs` — exactly the table the
// "Save" button writes to — so the existing lead notifications and the
// `trg_crm_sync_saved_designs` trigger (form_type `ring_design`) push the lead
// into the client's CRM with no extra plumbing.

import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { trackLeadConversion } from '@/lib/conversion-tracking';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { CountryPhoneInput } from '@/components/ui/country-phone-input';
import { supabase } from '@/integrations/supabase/client';
import { insertLeadRow } from '@/lib/lead-device';
import { Loader2, CheckCircle2, ChevronLeft } from 'lucide-react';
import { COUNTRY_CODES, formatPhoneE164 } from '@/lib/form-validation';
import { checkPhone } from '@/lib/phone-quality';
import { trackMetaEvent } from '@/lib/meta-pixel';
import { trackMetaLead } from '@/lib/meta-lead';
import { getCurrencySymbol } from '@/lib/pricing-utils';
import { useWidgetTheme } from '@/contexts/WidgetThemeContext';
import { generateProductName } from './SaveDesignDialog';
import type { RingConfiguration } from '@/types/ring-builder';

interface NoDepositRequestFormProps {
  onBack: () => void;
  configuration: RingConfiguration;
  clientId: string;
  estimatedPrice: number;
  currency?: string;
  catalogOptions?: {
    styles?: Array<{ id: string; name: string }>;
    shanks?: Array<{ id: string; name: string }>;
    metals?: Array<{ id: string; name: string }>;
    shapes?: Array<{ id: string; name: string }>;
    caratOptions?: Array<{ value: number; displayName: string }>;
  };
  /** 24k natural quote: never mention or send a price. */
  hideEstimate?: boolean;
}

interface NoDepositFormData {
  firstName: string;
  email: string;
  countryCode: string;
  phoneNumber: string;
  smsConsent: boolean;
  marketingConsent: boolean;
}

const EMPTY_FORM: NoDepositFormData = {
  firstName: '',
  email: '',
  countryCode: '+1',
  phoneNumber: '',
  smsConsent: false,
  marketingConsent: false,
};

export const NoDepositRequestForm = ({
  onBack,
  configuration,
  clientId,
  estimatedPrice,
  currency = 'USD',
  catalogOptions,
  hideEstimate = false,
}: NoDepositRequestFormProps) => {
  const { theme } = useWidgetTheme();
  // 24k renders its step surface on a fixed light grey with a gold CTA; every
  // other theme inherits the widget's own background/CTA variables so the form
  // blends into the panel it replaces.
  const is24k = theme === 'twentyfourk';
  const surface = is24k ? 'bg-[#EEEEEE] text-black' : 'bg-background text-foreground';
  const fieldClass = is24k
    ? 'bg-white border border-black/10 text-black placeholder:text-black/40'
    : 'bg-card border-border text-foreground placeholder:text-muted-foreground';
  const mutedClass = is24k ? 'text-black/60' : 'text-muted-foreground';
  const checkboxClass = is24k
    ? 'border-black/30 data-[state=checked]:bg-black data-[state=checked]:text-white'
    : 'border-muted-foreground/40 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground';
  const ctaStyle: CSSProperties = is24k
    ? { background: 'hsl(var(--accent-gold))', color: '#000000' }
    : { background: 'hsl(var(--cta-bg, var(--primary)))', color: 'hsl(var(--cta-text, var(--primary-foreground)))' };

  const [formData, setFormData] = useState<NoDepositFormData>(EMPTY_FORM);
  const [selectedCountryIso, setSelectedCountryIso] = useState('US');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Fire Contact once when the form is shown, mirroring the Save Design dialog.
  const fired = useRef(false);
  useEffect(() => {
    if (!fired.current) {
      fired.current = true;
      trackMetaEvent('Contact');
    }
  }, []);

  // Auto-detect the caller's country (same behaviour as the Quote Estimator).
  useEffect(() => {
    let cancelled = false;
    const detectCountry = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/');
        if (!res.ok) return;
        const data = await res.json();
        const callingCode = data.country_calling_code;
        const countryIso = data.country_code;
        if (cancelled || !callingCode || !countryIso) return;
        const match =
          COUNTRY_CODES.find((c) => c.country === countryIso && c.code === callingCode) ||
          COUNTRY_CODES.find((c) => c.code === callingCode);
        if (match) {
          setFormData((prev) => (prev.phoneNumber ? prev : { ...prev, countryCode: match.code }));
          setSelectedCountryIso(match.country);
        }
      } catch {
        // Silently keep the +1 default.
      }
    };
    detectCountry();
    return () => { cancelled = true; };
  }, []);

  const validate = () => {
    const next: Record<string, string> = {};

    if (!formData.firstName.trim()) {
      next.firstName = 'First name is required';
    }

    if (!formData.email.trim()) {
      next.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      next.email = 'Please enter a valid email';
    }

    const digits = formData.phoneNumber.replace(/\D/g, '');
    if (!digits) {
      next.phoneNumber = 'Phone number is required';
    } else {
      const phoneCheck = checkPhone(formData.countryCode, formData.phoneNumber, selectedCountryIso);
      if (!phoneCheck.valid) next.phoneNumber = phoneCheck.error || 'Please enter a valid phone number';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async () => {
    if (loading) return;
    if (!validate()) return;
    if (!clientId) {
      setErrors({ form: 'Client information not found. Please refresh and try again.' });
      return;
    }

    setLoading(true);
    try {
      const phone = formatPhoneE164(formData.countryCode, formData.phoneNumber);
      const productName = generateProductName(configuration, catalogOptions);
      const sym = getCurrencySymbol(currency);

      const notes = [
        hideEstimate
          ? 'Ring OS — Natural diamond quote request submitted from the widget.'
          : 'Ring OS — No-Deposit request submitted from the widget.',
        ...(hideEstimate ? [] : [`Estimated price: ${sym}${Number(estimatedPrice || 0).toLocaleString()}`]),
        ...(hideEstimate && configuration.size ? [`Ring size (US): ${configuration.size}`] : []),
        ...(hideEstimate && configuration.engraving?.otherRequest ? [`Additional details: ${configuration.engraving.otherRequest}`] : []),
        `SMS consent: ${formData.smsConsent ? 'Yes' : 'No'}`,
        `Marketing consent: ${formData.marketingConsent ? 'Yes' : 'No'}`,
      ].join('\n');

      // Writing to saved_designs keeps this lead on the exact same path as the
      // widget's "Save" action — including the CRM sync trigger.
      const { error } = await insertLeadRow('saved_designs', {
        client_id: clientId,
        product_id: null,
        product_name: productName,
        configuration: configuration as any,
        customer_name: formData.firstName.trim(),
        customer_email: formData.email.trim(),
        customer_phone: phone,
        notes,
        follow_up_status: 'new',
      });

      if (error) throw error;

      const styleName = catalogOptions?.styles?.find(s => s.id === configuration.style)?.name;
      const shankName = catalogOptions?.shanks?.find(s => s.id === configuration.shank)?.name;
      const metalName = catalogOptions?.metals?.find(m => m.id === configuration.metal)?.name;
      const shapeName = catalogOptions?.shapes?.find(s => s.id === configuration.shape)?.name;

      // Lead notification to the client (fire and forget)
      supabase.functions.invoke('notify-new-lead', {
        body: {
          client_id: clientId,
          customer_name: formData.firstName.trim(),
          customer_email: formData.email.trim(),
          customer_phone: phone,
          product_name: productName,
          configuration: {
            style: styleName,
            shank: shankName,
            metal: metalName,
            shape: shapeName,
            caratRange: configuration.caratRange,
            stone: configuration.stone,
            size: configuration.size,
            engraving: configuration.engraving,
          },
          notes,
        },
      }).catch(err => console.error('Failed to send lead notification:', err));

      // Customer confirmation email (fire and forget)
      const details: Record<string, string> = {};
      if (styleName) details['Style'] = styleName;
      if (shankName) details['Shank'] = shankName;
      if (metalName) details['Metal'] = metalName;
      if (shapeName) details['Shape'] = shapeName;
      if (configuration.caratRange != null) details['Carat'] = String(configuration.caratRange);
      if (configuration.size) details['Size'] = configuration.size;
      if (configuration.engraving?.enabled && configuration.engraving?.text) {
        details['Engraving'] = configuration.engraving.text;
      }
      if (!hideEstimate) details['Estimated Price'] = `${sym}${Number(estimatedPrice || 0).toLocaleString()}`;
      supabase.functions.invoke('notify-customer-confirmation', {
        body: {
          client_id: clientId,
          form_type: 'widget',
          customer_name: formData.firstName.trim(),
          customer_email: formData.email.trim(),
          details,
        },
      }).catch(err => console.error('Customer confirmation error:', err));

      trackMetaLead({
        clientId,
        userData: {
          email: formData.email,
          phone: formData.phoneNumber,
          firstName: formData.firstName,
          externalId: formData.email,
        },
        customData: { content_name: 'Ring Configurator', content_category: 'widget' },
      });
      trackLeadConversion('ring_builder', { email: formData.email, phone: formData.phoneNumber });

      setFormData(EMPTY_FORM);
      setErrors({});
      setSubmitted(true);
    } catch (err) {
      console.error('Error submitting no-deposit request:', err);
      // 42501 = RLS rejection. The anon insert policy on saved_designs gates on
      // is_client_active(client_id), so this means the client record is not
      // `status = 'active'` — the same reason the widget's Save button would
      // fail. Spell it out in the console so it is not mistaken for a bug here.
      if ((err as { code?: string })?.code === '42501') {
        console.error(
          '[No-Deposit] saved_designs insert was rejected by row-level security. ' +
          'The anon policy requires is_client_active(client_id) — set this client\'s ' +
          'status to "active" in the clients table.'
        );
        setErrors({ form: "We couldn't submit your request right now. Please contact the store directly." });
      } else {
        setErrors({ form: 'Something went wrong. Please try again or contact support.' });
      }
    } finally {
      setLoading(false);
    }
  };

  // Shared shell: the form is centred in whatever height the configuration
  // panel gives it, so a tall desktop panel doesn't leave it stranded at the
  // top, while a short mobile panel still scrolls normally.
  const shell = (children: ReactNode, backLink: boolean) => (
    <div className={`h-full w-full overflow-y-auto scrollbar-hide ${surface}`}>
      <div className="min-h-full flex flex-col">
        {backLink && (
          <div className="shrink-0 px-4 md:px-6 pt-4 md:pt-5">
            <button
              type="button"
              onClick={onBack}
              disabled={loading}
              className={`flex items-center gap-1 text-xs md:text-sm ${mutedClass} hover:opacity-80 transition-opacity disabled:opacity-40`}
            >
              <ChevronLeft className="w-3.5 h-3.5 md:w-4 md:h-4" />
              {hideEstimate ? 'Back to design' : 'Back to estimate'}
            </button>
          </div>
        )}
        <div className="flex-1 flex items-center justify-center px-4 md:px-6 py-5 md:py-8">
          <div className="w-full max-w-[520px] lg:max-w-[600px] space-y-4 md:space-y-5">
            {children}
          </div>
        </div>
      </div>
    </div>
  );

  if (submitted) {
    return shell(
      <div className="text-center space-y-4 md:space-y-5">
        <CheckCircle2 className="w-12 h-12 lg:w-14 lg:h-14 mx-auto opacity-90" />
        <h2 className="text-xl lg:text-2xl font-semibold">Request received</h2>
        <p className={`text-sm lg:text-base leading-relaxed ${mutedClass}`}>
          Thank you — we have your ring configuration and contact details. Our team will get in
          touch shortly for an in-depth discussion.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="w-full h-11 md:h-12 lg:h-14 rounded-lg font-semibold text-sm md:text-base transition-opacity hover:opacity-90"
          style={ctaStyle}
        >
          Back to my ring
        </button>
      </div>,
      false,
    );
  }

  return shell(
      <>
        <div className="space-y-1.5 text-center">
          <h2 className="text-lg md:text-xl lg:text-2xl font-semibold">Complete your request</h2>
          <p className={`text-xs md:text-sm lg:text-base leading-relaxed ${mutedClass}`}>
            No deposit required — share your details and we'll get in touch about your ring.
          </p>
        </div>

        <form className="space-y-3 md:space-y-3.5" autoComplete="on" noValidate onSubmit={(e) => e.preventDefault()}>
          <div>
            <Input
              type="text"
              name="given-name"
              autoComplete="given-name" aria-label="First name"
              autoCapitalize="words"
              placeholder="First Name*"
              value={formData.firstName}
              onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
              disabled={loading}
              maxLength={100}
              className={`h-11 md:h-12 lg:h-14 rounded-lg text-[16px] ${fieldClass} ${errors.firstName ? 'ring-2 ring-red-400' : ''}`}
            />
            {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}
          </div>

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
              disabled={loading}
              maxLength={255}
              className={`h-11 md:h-12 lg:h-14 rounded-lg text-[16px] ${fieldClass} ${errors.email ? 'ring-2 ring-red-400' : ''}`}
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
          </div>

          <CountryPhoneInput
            countryCode={formData.countryCode}
            phoneNumber={formData.phoneNumber}
            countryIso={selectedCountryIso}
            onCountryCodeChange={(code) => setFormData(prev => ({ ...prev, countryCode: code }))}
            onCountryIsoChange={(iso) => setSelectedCountryIso(iso)}
            onPhoneNumberChange={(number) => setFormData(prev => ({ ...prev, phoneNumber: number }))}
            error={errors.phoneNumber}
            disabled={loading}
            onBlur={() => {
              const digits = formData.phoneNumber.replace(/\D/g, '');
              if (!digits) return;
              const res = checkPhone(formData.countryCode, formData.phoneNumber, selectedCountryIso);
              setErrors((prev) => ({ ...prev, phoneNumber: res.valid ? '' : (res.error || 'Please enter a valid phone number') }));
            }}
            inputClassName={fieldClass}
          />

          <div className="flex items-start gap-2.5 pt-1">
            <Checkbox
              id="no-deposit-sms-consent"
              checked={formData.smsConsent}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, smsConsent: checked === true }))}
              disabled={loading}
              className={`mt-0.5 ${checkboxClass}`}
            />
            <label htmlFor="no-deposit-sms-consent" className={`text-[10px] md:text-[11px] lg:text-xs leading-relaxed cursor-pointer ${mutedClass}`}>
              Select this to receive quote by SMS - I Consent to Receive SMS Notifications and Alerts.
              Message frequency varies. Message &amp; data rates may apply. Text HELP for assistance.
              You can reply STOP to unsubscribe at any time.
            </label>
          </div>

          <div className="flex items-start gap-2.5">
            <Checkbox
              id="no-deposit-marketing-consent"
              checked={formData.marketingConsent}
              onCheckedChange={(checked) => setFormData(prev => ({ ...prev, marketingConsent: checked === true }))}
              disabled={loading}
              className={`mt-0.5 ${checkboxClass}`}
            />
            <label htmlFor="no-deposit-marketing-consent" className={`text-[10px] md:text-[11px] lg:text-xs leading-relaxed cursor-pointer ${mutedClass}`}>
              I agree to receive marketing emails, news, offers and updates.
              I understand I can unsubscribe at any time.
            </label>
          </div>

          {errors.form && <p className="text-red-500 text-xs md:text-sm">{errors.form}</p>}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="w-full h-11 md:h-12 lg:h-14 rounded-lg font-semibold text-sm md:text-base lg:text-lg flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60"
            style={ctaStyle}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              'Submit Request'
            )}
          </button>
        </form>
      </>,
      true,
  );
};
