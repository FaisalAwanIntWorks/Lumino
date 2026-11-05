import { useState, useCallback, useEffect } from 'react';
import { trackLeadConversion, trackInteraction } from '@/lib/conversion-tracking';
import { trackMetaLead } from '@/lib/meta-lead';
import { supabase } from '@/integrations/supabase/client';
import { insertLeadRow } from '@/lib/lead-device';
import { FormWizardShell, WizardStep } from '@/components/form-wizard/FormWizardShell';
import { CountryPhoneInput } from '@/components/ui/country-phone-input';
import { checkPhone } from '@/lib/phone-quality';
import { Input } from '@/components/ui/input';
import { MetalEstimateTimeline } from './MetalEstimateTimeline';
import { Camera, Check, HelpCircle, Scale, Award, Coins, CircleDollarSign, User, Mail, MapPin, X, Phone, MessageSquare, Calendar, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { MetalBookAppointmentDialog } from './MetalBookAppointmentDialog';
import { getCurrencySymbol } from '@/lib/pricing-utils';
import { COUNTRY_CODES } from '@/lib/form-validation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { withAlpha, getContrastText } from '@/lib/color-utils';
import { METAL_IQ_DEFAULT_COLORS } from '@/lib/metal-iq-defaults';
import { fallbackToPngOnError } from '@/lib/webp-image-fallback';

interface MetalBuyingFormProps {
  clientId: string;
  config: any;
  accentColor?: string;
  fontColor?: string;
  backgroundColor?: string;
  currency?: string;
  // Real client id for the booking dialog when clientId is the 'preview' placeholder.
  bookingClientId?: string;
}

type StepKey = 'metal' | 'karat' | 'weight' | 'authenticity' | 'photo' | 'contact' | 'estimate' | 'thank-you';

const METAL_INFO = {
  gold: { label: 'Gold', icon: Coins, gradient: 'linear-gradient(135deg, #d4af37 0%, #f5d060 100%)', borderColor: '#d4af37' },
  silver: { label: 'Silver', icon: Award, gradient: 'linear-gradient(135deg, #c0c0c0 0%, #e8e8e8 100%)', borderColor: '#c0c0c0' },
  platinum: { label: 'Platinum', icon: CircleDollarSign, gradient: 'linear-gradient(135deg, #e5e4e2 0%, #b0c4de 100%)', borderColor: '#b0c4de' },
};

const DISPOSABLE_DOMAINS = ['mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email', 'yopmail.com', 'test.com', 'example.com', 'fake.com'];

const DEMO_ESTIMATE = {
  spotPricePerOz: 4676,
  ourOffer: 892.50,
  competitorOffer: 595.00,
  buyPct: 75,
  estimatedProfit: 42.50,
  spotPriceDate: new Date().toISOString().split('T')[0],
};

export function MetalBuyingForm({ clientId, config, accentColor = METAL_IQ_DEFAULT_COLORS.tabBorder, fontColor = METAL_IQ_DEFAULT_COLORS.fontColor, backgroundColor = METAL_IQ_DEFAULT_COLORS.background, currency = 'USD', bookingClientId }: MetalBuyingFormProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [metal, setMetal] = useState('');
  const [karat, setKarat] = useState('');
  const [knowsKarat, setKnowsKarat] = useState(true);
  const [weightGrams, setWeightGrams] = useState('');
  const [knowsWeight, setKnowsWeight] = useState(true);
  const [isAuthentic, setIsAuthentic] = useState<boolean | null>(null);
  const [knowsAuthentic, setKnowsAuthentic] = useState(true);
  const [photos, setPhotos] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [estimate, setEstimate] = useState<any>(null);
  const [showVisitUs, setShowVisitUs] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [countryIso, setCountryIso] = useState('US');
  const [addressCountryIso, setAddressCountryIso] = useState('US');
  const [location, setLocation] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [bookDialogOpen, setBookDialogOpen] = useState(false);
  const [pieces, setPieces] = useState<{ metal: string; karat: string; weightGrams: number }[]>([]);

  // When the booking dialog is open, force the iframe body to fill the viewport
  // so the modal isn't clipped on mobile (where the wizard is content-height).
  useEffect(() => {
    if (bookDialogOpen) {
      const prev = document.body.style.minHeight;
      document.body.style.minHeight = '100dvh';
      return () => { document.body.style.minHeight = prev; };
    }
  }, [bookDialogOpen]);

  const metalsConfig = config?.metals_config || {};
  const dontKnowEnabled = config?.dont_know_enabled ?? true;
  const ctaConfig = config?.cta_config ?? { book_url: '', call_number: '', text_number: '' };
  // Sanitize phone numbers into tel:/sms: safe format so mobile dialers reliably launch.
  // Clients sometimes paste "tel:+1 555..." into the config field — strip any scheme first.
  const toDialHref = (raw?: string) => {
    if (!raw) return '';
    const withoutScheme = String(raw).trim().replace(/^\s*(tel|sms|callto|call)\s*:\s*/i, '');
    const cleaned = withoutScheme.replace(/[^\d+]/g, '');
    return cleaned.replace(/(?!^)\+/g, '');
  };
  const formatDial = (v: string) => {
    const digits = v.replace(/\D/g, '');
    const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    if (local.length === 10) {
      const pretty = `(${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}`;
      return digits.length === 11 ? `+1 ${pretty}` : pretty;
    }
    return v;
  };
  const callHref = toDialHref(ctaConfig.call_number);
  const textHref = toDialHref(ctaConfig.text_number);
  const enabledMetals = Object.entries(metalsConfig).filter(([_, cfg]: any) => cfg.enabled).map(([key]) => key);
  const karats = metal ? Object.keys(metalsConfig[metal]?.karats || {}) : [];
  const needsVisitUs = !knowsKarat || !knowsWeight || !knowsAuthentic || isAuthentic === false;

  // Multi-piece submissions are offered only when the jeweler has turned on volume tiers,
  // so every other account keeps the original single-piece flow.
  const multiPieceEnabled = config?.volume_tier_config?.enabled === true;
  const allPieces = () => [...pieces, { metal, karat, weightGrams: parseFloat(weightGrams) }];
  const addAnotherPiece = () => {
    const w = parseFloat(weightGrams);
    if (!metal || !karat || !(w > 0)) return;
    setPieces((prev) => [...prev, { metal, karat, weightGrams: w }]);
    setMetal(''); setKarat(''); setWeightGrams('');
    setCurrentStep(0);
  };
  const isPreview = clientId === 'preview';
  const onAccent = getContrastText(accentColor);

  // Real numbering-plan + junk-pattern check (offline, no API cost).
  const validatePhone = (nextPhone = phone, nextCode = countryCode, nextIso = countryIso) => {
    if (!nextPhone.replace(/\D/g, '')) { setPhoneError(''); return true; }
    const res = checkPhone(nextCode, nextPhone, nextIso);
    setPhoneError(res.valid ? '' : (res.error || 'Please enter a valid phone number'));
    return res.valid;
  };

  const validateEmail = (val: string) => {
    if (!val) { setEmailError(''); return; }
    const domain = val.split('@')[1]?.toLowerCase();
    if (DISPOSABLE_DOMAINS.includes(domain)) { setEmailError('Please use a real email address'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { setEmailError('Invalid email format'); return; }
    setEmailError('');
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    if (isPreview) { toast.info('Photo upload disabled in preview'); return; }
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split('.').pop();
        const path = `${clientId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from('metal-buying-assets').upload(path, file);
        if (error) throw error;
        const { data: urlData } = supabase.storage.from('metal-buying-assets').getPublicUrl(path);
        urls.push(urlData.publicUrl);
      }
      setPhotos(prev => [...prev, ...urls]);
    } catch { toast.error('Failed to upload photo'); } finally { setUploading(false); }
  };

  const handleCalculate = useCallback(async (): Promise<any> => {
    setCalculating(true);
    if (needsVisitUs) { setShowVisitUs(true); setCalculating(false); return null; }
    if (isPreview) {
      await new Promise(r => setTimeout(r, 3000));
      setEstimate(DEMO_ESTIMATE);
      setCalculating(false);
      return DEMO_ESTIMATE;
    }
    try {
      const body = pieces.length > 0
        ? { clientId, currency, items: allPieces() }
        : { clientId, metal, karat: knowsKarat ? karat : null, weightGrams: knowsWeight ? parseFloat(weightGrams) : null, currency };
      const { data, error } = await supabase.functions.invoke('calculate-metal-offer', { body });
      if (error) {
        console.error('[calculate-metal-offer] invoke error:', error);
        throw error;
      }
      if (data?.error) {
        console.error('[calculate-metal-offer] returned error:', data.error);
        throw new Error(data.error);
      }
      setEstimate(data);
      setCalculating(false);
      return data;
    } catch (err: any) {
      console.error('[calculate-metal-offer] failed:', err?.message || err);
      toast.error('Live quote unavailable', {
        description: 'Your details have been sent — the jeweler will follow up shortly.',
      });
      setEstimate(null);
      setCalculating(false);
      return null;
    }
  }, [clientId, metal, karat, weightGrams, knowsKarat, knowsWeight, needsVisitUs, isPreview, currency, pieces]);

  const calculateLeadScore = (): string => {
    if (!knowsAuthentic || isAuthentic === false) return 'suspect';
    if (!knowsKarat || !knowsWeight) return 'cold';
    const profit = estimate?.estimatedProfit ?? 0;
    if (profit > 100) return 'hot';
    if (profit > 20) return 'warm';
    return 'cold';
  };

  const submitLeadData = async (estOverride?: any) => {
    if (isPreview) return;
    const est = estOverride ?? estimate;
    const phoneE164 = checkPhone(countryCode, phone, countryIso).e164 || `${countryCode}${phone.replace(/\D/g, '')}`;
    setSubmitting(true);
    try {
      const leadId = crypto.randomUUID();
      // Multi-piece: primary columns describe the first piece; totals + full breakdown live in `items`.
      const isMulti = pieces.length > 0 && !needsVisitUs;
      const primary = isMulti ? pieces[0] : null;
      const leadData = {
        id: leadId,
        client_id: clientId, customer_name: name, customer_email: email,
        customer_phone: phoneE164, metal_type: primary?.metal ?? metal,
        karat: primary ? primary.karat : (knowsKarat ? karat : null),
        weight_grams: primary ? primary.weightGrams : (knowsWeight ? parseFloat(weightGrams) : null),
        condition: isAuthentic === true ? 'authentic' : isAuthentic === false ? 'not_authentic' : 'unknown',
        is_authentic: isAuthentic, knows_karat: knowsKarat, knows_weight: knowsWeight, knows_authentic: knowsAuthentic,
        spot_price_at_time: est?.spotPricePerOz, buy_percentage: est?.buyPct,
        estimated_offer: est?.ourOffer, competitor_offer: est?.competitorOffer,
        estimated_profit: est?.estimatedProfit, photo_urls: photos,
        status: 'new', lead_score: calculateLeadScore(), location, country_iso: countryIso,
        spot_price_date: est?.spotPriceDate || new Date().toISOString().split('T')[0],
        currency,
        items: isMulti ? (est?.items ?? allPieces()) : null,
      };
      const { error } = await insertLeadRow('metal_buying_leads', leadData);
      if (error) throw error;

      // Meta Pixel + Conversions API Lead
      trackMetaLead({
        clientId,
        eventId: leadId,
        userData: { email, phone: phoneE164, firstName: name, externalId: email },
        customData: { content_name: 'Metal IQ', content_category: 'form', value: est?.ourOffer ?? undefined, currency },
      });

      // Google Ads conversion + GTM dataLayer (no-op unless configured)
      trackLeadConversion('metal_iq', {
        email,
        phone: phoneE164,
        value: est?.ourOffer ?? null,
        currency,
        leadId,
      });

      supabase.functions.invoke('notify-metal-iq-lead', {
        body: {
          client_id: clientId, lead_id: leadId, customer_name: name, customer_email: email,
          customer_phone: phoneE164, location, metal_type: metal,
          karat: knowsKarat ? karat : undefined, weight_grams: knowsWeight ? parseFloat(weightGrams) : undefined,
          knows_karat: knowsKarat, knows_weight: knowsWeight, knows_authentic: knowsAuthentic,
          is_authentic: isAuthentic ?? undefined, estimated_offer: est?.ourOffer,
          competitor_offer: est?.competitorOffer, estimated_profit: est?.estimatedProfit,
          spot_price_at_time: est?.spotPricePerOz, spot_price_date: est?.spotPriceDate,
          buy_percentage: est?.buyPct, lead_score: calculateLeadScore(),
          photo_urls: photos.length > 0 ? photos : undefined,
        },
      }).catch((err) => console.error('Notification error:', err));
    } catch { toast.error('Failed to submit'); } finally { setSubmitting(false); }
  };

  // CTA buttons for visit-us and thank-you screens
  const bookAppointmentButton = ctaConfig.book_url ? (
    <a href={ctaConfig.book_url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all hover:scale-105"
      style={{ backgroundColor: accentColor, color: onAccent }}>
      <Calendar className="w-4 h-4" /> Book Appointment
    </a>
  ) : (
    <button type="button" onClick={() => setBookDialogOpen(true)}
      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all hover:scale-105"
      style={{ backgroundColor: accentColor, color: onAccent }}>
      <Calendar className="w-4 h-4" /> Book Appointment
    </button>
  );

  const ctaButtons = (
    <div className="flex flex-wrap gap-3 justify-center mt-4">
      {bookAppointmentButton}
      {callHref && (
        <a href={`tel:${callHref}`} target="_top" rel="noopener"
          onClick={() => trackInteraction('aurezo_call_click', { form_type: 'metal_iq' })}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all hover:scale-105"
          style={{ border: `1px solid ${accentColor}`, color: fontColor }}>
          <Phone className="w-4 h-4" />
          <span className="sm:hidden">Call Us</span>
          <span className="hidden sm:inline">Call {formatDial(callHref)}</span>
        </a>
      )}
      {textHref && (
        <a href={`sms:${textHref}`} target="_top" rel="noopener"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all hover:scale-105"
          style={{ border: `1px solid ${accentColor}`, color: fontColor }}>
          <MessageSquare className="w-4 h-4" /> Text Us
        </a>
      )}
    </div>
  );

  const metalBookingDialog = (
    <MetalBookAppointmentDialog
      open={bookDialogOpen}
      onOpenChange={setBookDialogOpen}
      clientId={bookingClientId || clientId}
      accentColor={accentColor}
      fontColor={fontColor}
      backgroundColor={backgroundColor}
      metalContext={{ metal, karat, weight: weightGrams }}
    />
  );

  const glassStyle = {
    background: withAlpha(fontColor, 0.05),
    backdropFilter: 'blur(12px)',
    border: `1px solid ${withAlpha(fontColor, 0.18)}`,
    borderRadius: '16px',
  };

  // Step contents
  const metalStep = (
    <div className="px-4 md:px-8 space-y-4 max-w-md md:max-w-2xl mx-auto w-full">
      <div className="text-center">
        <h2 className="text-xl md:text-2xl font-bold">What metal are you selling?</h2>
        <p className="text-sm mt-1 opacity-80">Select the type of precious metal</p>
      </div>
      <div className={
        enabledMetals.length === 1
          ? "flex justify-center"
          : enabledMetals.length === 2
          ? "grid gap-3 md:grid-cols-2 max-w-md mx-auto"
          : "grid gap-3 md:grid-cols-3"
      }>
        {enabledMetals.map((m) => {
          const info = METAL_INFO[m as keyof typeof METAL_INFO];
          if (!info) return null;
          const Icon = info.icon;
          const selected = metal === m;
          return (
            <button key={m} type="button" onClick={() => { setMetal(m); setTimeout(() => { setCurrentStep(prev => prev + 1); }, 450); }}
              className={`p-4 md:p-6 flex items-center md:flex-col md:items-center gap-4 md:gap-3 transition-all duration-200 hover:scale-[1.02] cursor-pointer text-left md:text-center ${enabledMetals.length === 1 ? 'w-full max-w-xs' : ''}`}
              style={{ ...glassStyle, border: selected ? `2px solid ${accentColor}` : glassStyle.border }}>
              <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl flex items-center justify-center shrink-0" style={{ background: info.gradient }}>
                <Icon className="w-6 h-6 md:w-8 md:h-8" style={{ color: '#1a1a1a' }} />
              </div>
              <span className="font-semibold text-lg flex-1 md:flex-none">{info.label}</span>
              {selected && <Check className="w-5 h-5 md:absolute md:top-3 md:right-3" style={{ color: accentColor }} />}
            </button>
          );
        })}
      </div>
    </div>
  );

  const karatStep = (
    <div className="px-4 md:px-8 space-y-4 max-w-md md:max-w-2xl mx-auto w-full">
      <div className="text-center">
        <h2 className="text-xl md:text-2xl font-bold">What's the karat/purity?</h2>
        <p className="text-sm mt-1 opacity-80">Select the purity of your {METAL_INFO[metal as keyof typeof METAL_INFO]?.label || metal}</p>
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {karats.map((k) => (
          <button key={k} type="button" onClick={() => { setKarat(k); setKnowsKarat(true); setTimeout(() => { setCurrentStep(prev => prev + 1); }, 450); }}
            className="px-4 py-2.5 rounded-full text-sm font-semibold transition-all duration-200 hover:scale-105 cursor-pointer"
            style={{
              background: karat === k && knowsKarat ? accentColor : withAlpha(fontColor, 0.1),
              color: karat === k && knowsKarat ? onAccent : fontColor,
              border: `1px solid ${karat === k && knowsKarat ? accentColor : withAlpha(fontColor, 0.35)}`,
            }}>
            {k}
          </button>
        ))}
      </div>
      {dontKnowEnabled && pieces.length === 0 && (
        <button type="button" onClick={() => { setKnowsKarat(false); setKarat(''); setTimeout(() => { setCurrentStep(prev => prev + 1); }, 450); }}
          className="w-full p-4 flex items-center gap-3 transition-all hover:scale-[1.01] cursor-pointer"
          style={{ ...glassStyle, border: !knowsKarat ? `2px solid ${accentColor}` : glassStyle.border }}>
          <HelpCircle className="w-5 h-5 opacity-70" />
          <span>I don't know my karat</span>
        </button>
      )}
    </div>
  );

  const weightStep = (
    <div className="px-4 md:px-8 space-y-4 max-w-md md:max-w-xl mx-auto w-full">
      <div className="text-center">
        <h2 className="text-xl md:text-2xl font-bold">How much does it weigh?</h2>
        <p className="text-sm mt-1 opacity-80">Enter the weight in grams</p>
      </div>
      {knowsWeight && (
        <div className="p-5" style={glassStyle}>
          <label className="text-xs uppercase tracking-widest font-medium opacity-80 mb-2 block">Weight (grams)</label>
          <div className="relative">
            <Scale className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 opacity-60" />
            <Input type="number" step="0.01" min="0" placeholder="e.g. 15.5" value={weightGrams}
              onChange={(e) => setWeightGrams(e.target.value)}
              className="pl-11 h-12 bg-transparent border-0 border-b text-lg"
              style={{ borderColor: withAlpha(fontColor, 0.35), color: fontColor }} />
          </div>
        </div>
      )}
      {multiPieceEnabled && pieces.length > 0 && (
        <div className="p-4 space-y-2" style={glassStyle}>
          <p className="text-xs uppercase tracking-widest font-medium opacity-80">Already added</p>
          {pieces.map((p, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span>{METAL_INFO[p.metal as keyof typeof METAL_INFO]?.label || p.metal} {p.karat} · {p.weightGrams}g</span>
              <button type="button" aria-label="Remove piece" onClick={() => setPieces((prev) => prev.filter((_, idx) => idx !== i))} className="opacity-70 hover:opacity-100">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      {multiPieceEnabled && knowsKarat && knowsWeight && (
        <button type="button" disabled={!(parseFloat(weightGrams) > 0) || !karat || pieces.length >= 9}
          onClick={addAnotherPiece}
          className="w-full p-4 flex items-center justify-center gap-2 transition-all hover:scale-[1.01] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ ...glassStyle, borderStyle: 'dashed' }}>
          <span className="font-medium">+ Add another piece</span>
        </button>
      )}
      {dontKnowEnabled && pieces.length === 0 && (
        <button type="button" onClick={() => { if (knowsWeight) { setKnowsWeight(false); setWeightGrams(''); setTimeout(() => { setCurrentStep(prev => prev + 1); }, 450); } else { setKnowsWeight(true); } }}
          className="w-full p-4 flex items-center gap-3 transition-all hover:scale-[1.01] cursor-pointer"
          style={{ ...glassStyle, border: !knowsWeight ? `2px solid ${accentColor}` : glassStyle.border }}>
          <HelpCircle className="w-5 h-5 opacity-70" />
          <span>{knowsWeight ? "I don't know the weight" : "Actually, I know the weight"}</span>
        </button>
      )}
    </div>
  );

  const authenticityStep = (
    <div className="px-4 md:px-8 space-y-4 max-w-md md:max-w-2xl mx-auto w-full">
      <div className="text-center">
        <h2 className="text-xl md:text-2xl font-bold">Is your item authentic?</h2>
        <p className="text-sm mt-1 opacity-80">Look for stamps, hallmarks, a certificate of authenticity, or a purchase receipt to verify</p>
      </div>
      <div className="grid gap-3">
        {[
          { val: true, label: "Yes, it's authentic", icon: Check, iconBg: '#22c55e' },
          { val: false, label: "No / I don't think so", icon: X, iconBg: '#ef4444' },
        ].map(({ val, label, icon: Icon, iconBg }) => (
          <button key={String(val)} type="button" onClick={() => { setIsAuthentic(val); setKnowsAuthentic(true); setTimeout(() => { setCurrentStep(prev => prev + 1); }, 450); }}
            className="p-4 flex items-center gap-4 transition-all hover:scale-[1.02] cursor-pointer text-left"
            style={{ ...glassStyle, border: isAuthentic === val && knowsAuthentic ? `2px solid ${accentColor}` : glassStyle.border }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${iconBg}20` }}>
              <Icon className="w-5 h-5" style={{ color: iconBg }} />
            </div>
            <span className="font-medium">{label}</span>
          </button>
        ))}
        {dontKnowEnabled && (
          <button type="button" onClick={() => { setKnowsAuthentic(false); setIsAuthentic(null); setTimeout(() => { setCurrentStep(prev => prev + 1); }, 450); }}
            className="p-4 flex items-center gap-4 transition-all hover:scale-[1.02] cursor-pointer text-left"
            style={{ ...glassStyle, border: !knowsAuthentic ? `2px solid ${accentColor}` : glassStyle.border }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: withAlpha(fontColor, 0.1) }}>
              <HelpCircle className="w-5 h-5 opacity-70" />
            </div>
            <span className="font-medium">I'm not sure</span>
          </button>
        )}
      </div>
    </div>
  );

  const photoStep = (
    <div className="px-4 md:px-8 space-y-4 max-w-md md:max-w-xl mx-auto w-full">
      <div className="text-center">
        <h2 className="text-xl md:text-2xl font-bold">Upload a photo</h2>
        <p className="text-sm mt-1 opacity-80">A clear photo helps us give a more accurate estimate (optional)</p>
      </div>
      <label className="flex flex-col items-center gap-3 p-10 cursor-pointer transition-all hover:scale-[1.01]"
        style={{ ...glassStyle, borderStyle: 'dashed' }}>
        <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: `${accentColor}15` }}>
          <Camera className="w-8 h-8" style={{ color: accentColor }} />
        </div>
        <span className="text-sm opacity-80">{uploading ? 'Uploading...' : 'Tap to take or upload a photo'}</span>
        <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} disabled={uploading} />
      </label>
      {photos.length > 0 && (
        <div className="flex gap-2 flex-wrap justify-center">
          {photos.map((url, i) => (
            <img key={i} src={url} alt={`Photo ${i + 1}`} className="w-16 h-16 object-cover rounded-xl" />
          ))}
        </div>
      )}
    </div>
  );

  const contactStep = (
    <form className="px-4 md:px-8 space-y-4 max-w-md mx-auto w-full" autoComplete="on" noValidate onSubmit={(e) => e.preventDefault()}>
      <div className="text-center">
        <h2 className="text-xl md:text-2xl font-bold">View Your Estimate</h2>
        <p className="text-sm mt-2 opacity-80">We will get you a rough price based on the details and metal prices of today</p>
      </div>
      <div className="p-5 space-y-4" style={glassStyle}>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-60" />
          <Input name="name" autoComplete="name" aria-label="Full name" autoCapitalize="words" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name"
            className="pl-10 h-11 bg-transparent border-0 border-b rounded-none"
            style={{ borderColor: withAlpha(fontColor, 0.35), color: fontColor }} />
        </div>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-60" />
          <Input type="email" name="email" autoComplete="email" aria-label="Email" inputMode="email" autoCapitalize="off" spellCheck={false} value={email} onChange={(e) => { setEmail(e.target.value); validateEmail(e.target.value); }}
            placeholder="Email address"
            className="pl-10 h-11 bg-transparent border-0 border-b rounded-none"
            style={{ borderColor: emailError ? '#ef4444' : withAlpha(fontColor, 0.35), color: fontColor }} />
          {emailError && <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{emailError}</p>}
        </div>
        <CountryPhoneInput
          countryCode={countryCode} phoneNumber={phone}
          onCountryCodeChange={(c) => { setCountryCode(c); setPhoneError(''); }}
          onPhoneNumberChange={(v) => { setPhone(v); if (phoneError) setPhoneError(''); }}
          countryIso={countryIso} onCountryIsoChange={setCountryIso}
          onBlur={() => validatePhone()}
          error={phoneError}
          fontColor={fontColor} backgroundColor={backgroundColor} />
        <div className="relative">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-60" />
          <Select value={addressCountryIso} onValueChange={setAddressCountryIso}>
            <SelectTrigger
              className="pl-10 h-11 bg-transparent border-0 border-b rounded-none w-full"
              style={{ borderColor: withAlpha(fontColor, 0.35), color: fontColor }}>
              <SelectValue placeholder="Select country" />
            </SelectTrigger>
            <SelectContent className="max-h-[300px]">
              {COUNTRY_CODES.map((c) => (
                <SelectItem key={c.country} value={c.country}>
                  <span className="flex items-center gap-2">
                    <img src={`https://flagcdn.com/w40/${c.country.toLowerCase()}.webp`} alt={c.name} className="w-5 h-[14px] object-cover rounded-[2px]" loading="lazy" onError={fallbackToPngOnError} />
                    {c.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 opacity-60" />
          <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, State"
            className="pl-10 h-11 bg-transparent border-0 border-b rounded-none"
            style={{ borderColor: withAlpha(fontColor, 0.35), color: fontColor }} />
        </div>
      </div>
      <label className="flex items-start gap-3 text-xs opacity-70 cursor-pointer px-1">
        <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)}
          className="mt-0.5 accent-current" style={{ accentColor }} />
        <span>I agree to the Terms & Conditions and consent to being contacted regarding my submission.</span>
      </label>
    </form>
  );

  const estimateStep = (
    <div className="px-4 md:px-8 space-y-6 max-w-md md:max-w-xl mx-auto w-full">
      {calculating && !showVisitUs && !estimate && (
        <MetalEstimateTimeline metal={metal} karat={karat} accentColor={accentColor}
          fontColor={fontColor} backgroundColor={backgroundColor} onComplete={() => setCalculating(false)} />
      )}
      {showVisitUs && (() => {
        const missing: string[] = [];
        if (!knowsKarat) missing.push("you weren't sure of the karat");
        if (!knowsWeight) missing.push("you didn't have the weight");
        if (!knowsAuthentic) missing.push("authenticity needs to be verified");
        else if (isAuthentic === false) missing.push("the item isn't hallmarked / authentic");
        const missingText = missing.length > 1
          ? missing.slice(0, -1).join(', ') + ' and ' + missing[missing.length - 1]
          : missing[0] || '';
        return (
          <div className="text-center space-y-4 py-8">
            <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center" style={{ backgroundColor: `${accentColor}15` }}>
              <Check className="w-8 h-8" style={{ color: accentColor }} />
            </div>
            <h2 className="text-xl font-bold">
              Thanks{name ? `, ${name.split(' ')[0]}` : ''} — we've received your details
            </h2>
            <p className="text-sm max-w-md mx-auto opacity-70 leading-relaxed">
              Since {missingText}, we're not able to give you an accurate quote right now. A team member will reach out shortly to discuss next steps.
            </p>
            <p className="text-xs max-w-sm mx-auto opacity-70">
              In the meantime, you're welcome to book an appointment or get in touch directly.
            </p>
            {ctaButtons}
            {metalBookingDialog}
          </div>
        );
      })()}
      {estimate && !calculating && (
        <div className="space-y-6 py-4">
          <div className="p-5" style={glassStyle}>
            <div className="flex items-stretch gap-4">
              <div className="flex-1 text-center">
                <p className="text-[10px] uppercase tracking-[0.15em] font-medium opacity-70 mb-1">Our Offer</p>
                <p className="text-3xl md:text-4xl font-bold" style={{ color: accentColor }}>
                  {getCurrencySymbol(currency)}{estimate.ourOffer?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              {estimate.competitorOffer && (
                <>
                  <div className="w-px self-stretch" style={{ backgroundColor: withAlpha(fontColor, 0.2) }} />
                  <div className="flex-1 text-center">
                    <p className="text-[10px] uppercase tracking-[0.15em] font-medium opacity-70 mb-1">Competitor Offer</p>
                    <p className="text-2xl md:text-3xl font-semibold opacity-70">
                      {getCurrencySymbol(currency)}{estimate.competitorOffer?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
          {estimate.competitorOffer && (
            <div className="text-center">
              <p className="text-lg font-bold" style={{ color: '#22c55e' }}>
                +{getCurrencySymbol(currency)}{((estimate.ourOffer || 0) - (estimate.competitorOffer || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} more with us
              </p>
            </div>
          )}
          {Array.isArray(estimate.items) && estimate.items.length > 1 && (
            <div className="p-4 space-y-1.5 text-sm" style={glassStyle}>
              {estimate.items.map((it: any, i: number) => (
                <div key={i} className="flex justify-between gap-3">
                  <span className="opacity-80">{METAL_INFO[it.metal as keyof typeof METAL_INFO]?.label || it.metal} {it.karat} · {it.weightGrams}g</span>
                  <span className="font-medium">{getCurrencySymbol(currency)}{Number(it.offer ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              ))}
            </div>
          )}
          {(estimate.volumeTier?.bonusPct > 0 || estimate.volumeTier?.bullionApplied) && (
            <p className="text-xs text-center font-medium" style={{ color: accentColor }}>
              {estimate.volumeTier?.bullionApplied ? '24K bullion rate applied' : `Volume bonus applied: +${estimate.volumeTier.bonusPct}%`}
            </p>
          )}
          <p className="text-[10px] text-center opacity-50">
            *Estimated value based on current spot prices. Final offer may vary after in-person evaluation.
          </p>
          <p className="text-xs text-center opacity-60">
            Based on live spot price of {getCurrencySymbol(currency)}{estimate.spotPricePerOz?.toLocaleString()}/oz
          </p>
          <div className="flex gap-3 justify-center mt-2">
            <button type="button" onClick={() => setBookDialogOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition-all hover:scale-105"
              style={{ backgroundColor: accentColor, color: onAccent }}>
              <Calendar className="w-4 h-4" /> Book Appointment
            </button>
            {callHref && (
              <a href={`tel:${callHref}`} target="_top" rel="noopener"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition-all hover:scale-105"
                style={{ border: `1px solid ${accentColor}`, color: fontColor }}>
                <Phone className="w-4 h-4" />
                <span className="sm:hidden">Call Us</span>
                <span className="hidden sm:inline">Call {formatDial(callHref)}</span>
              </a>
            )}
          </div>
          {metalBookingDialog}
        </div>
      )}
    </div>
  );

  const stepDefs: { key: StepKey; label: string; content: React.ReactNode }[] = [
    { key: 'metal', label: 'Metal', content: metalStep },
    { key: 'karat', label: 'Purity', content: karatStep },
    { key: 'weight', label: 'Weight', content: weightStep },
    { key: 'authenticity', label: 'Verify', content: authenticityStep },
    { key: 'photo', label: 'Photo', content: photoStep },
    { key: 'contact', label: 'Contact', content: contactStep },
    { key: 'estimate', label: 'Estimate', content: estimateStep },
  ];

  const canProceed = () => {
    const s = stepDefs[currentStep]?.key;
    switch (s) {
      case 'metal': return !!metal;
      case 'karat': return !!karat || !knowsKarat;
      case 'weight': return (!!weightGrams && parseFloat(weightGrams) > 0) || !knowsWeight;
      case 'authenticity': return isAuthentic !== null || !knowsAuthentic;
      case 'photo': return true;
      case 'contact': return !!name && !!email && !emailError && !phoneError && termsAccepted;
      case 'estimate': return !calculating && (!!estimate || showVisitUs);
      default: return false;
    }
  };

  const handleNext = async () => {
    const s = stepDefs[currentStep]?.key;
    if (s === 'contact') {
      setCurrentStep(currentStep + 1);
      const est = await handleCalculate();
      // Always persist the lead so contact info isn't lost — even when the live
      // quote fails. Detail view will offer a "Recalculate" action in that case.
      if (needsVisitUs) {
        await submitLeadData(null);
      } else {
        await submitLeadData(est);
      }
      return;
    }
    if (currentStep < stepDefs.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      const s = stepDefs[currentStep]?.key;
      if (s === 'estimate') {
        setCalculating(false); setEstimate(null); setShowVisitUs(false);
      }
      setCurrentStep(currentStep - 1);
    }
  };

  const getNextLabel = () => {
    const s = stepDefs[currentStep]?.key;
    if (s === 'estimate') return null; // Hide next button on estimate - CTAs are inline
    if (s === 'photo') return 'CONTINUE >';
    return undefined;
  };

  const getSelectedLabel = () => {
    const s = stepDefs[currentStep]?.key;
    if (s === 'metal' && metal) return METAL_INFO[metal as keyof typeof METAL_INFO]?.label;
    if (s === 'karat' && karat) return karat;
    return undefined;
  };

  const wizardSteps: WizardStep[] = stepDefs.map(s => ({ key: s.key, label: s.label, content: s.content }));

  return (
    <FormWizardShell
      steps={wizardSteps}
      currentStep={currentStep}
      onNext={handleNext}
      onBack={handleBack}
      nextLabel={getNextLabel()}
      selectedLabel={getSelectedLabel()}
      isSubmitting={submitting}
      isLastStep={stepDefs[currentStep]?.key === 'estimate'}
      canProceed={canProceed()}
      backgroundColor={backgroundColor}
      fontColor={fontColor}
      accentColor={accentColor}
    />
  );
}
