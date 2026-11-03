import { useState, type CSSProperties } from 'react';
import { trackMetaSchedule } from '@/lib/meta-lead';
import { trackLeadConversion } from '@/lib/conversion-tracking';
import { supabase } from '@/integrations/supabase/client';
import { insertLeadRow } from '@/lib/lead-device';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon, Globe } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useWidgetTheme, type WidgetTheme } from '@/contexts/WidgetThemeContext';
import { CountryPhoneInput } from '@/components/ui/country-phone-input';
import { formatPhoneE164 } from '@/lib/form-validation';
import { checkPhone } from '@/lib/phone-quality';
import { useClientScheduling } from '@/hooks/useClientScheduling';
import { useClientAvailability } from '@/hooks/useClientAvailability';
import { generateSlotsForDate, isDateAvailable } from '@/lib/availability';
import { SchedulingEmbed } from '@/components/scheduling/SchedulingEmbed';

const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'America/Toronto', label: 'Eastern Time - Canada' },
  { value: 'America/Vancouver', label: 'Pacific Time - Canada' },
  { value: 'Europe/London', label: 'Greenwich Mean Time (GMT)' },
  { value: 'Europe/Paris', label: 'Central European Time (CET)' },
  { value: 'Europe/Berlin', label: 'Central European Time (CET)' },
  { value: 'Asia/Dubai', label: 'Gulf Standard Time (GST)' },
  { value: 'Asia/Kolkata', label: 'India Standard Time (IST)' },
  { value: 'Asia/Karachi', label: 'Pakistan Standard Time (PKT)' },
  { value: 'Asia/Singapore', label: 'Singapore Time (SGT)' },
  { value: 'Asia/Tokyo', label: 'Japan Standard Time (JST)' },
  { value: 'Australia/Sydney', label: 'Australian Eastern Time (AET)' },
  { value: 'Asia/Shanghai', label: 'China Standard Time (CST)' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong Time (HKT)' },
  { value: 'Africa/Lagos', label: 'West Africa Time (WAT)' },
  { value: 'Africa/Johannesburg', label: 'South Africa Time (SAST)' },
];

// All colors come from the widget's CSS custom properties (set per theme in
// index.css under [data-theme=...] and overridden per client from
// branding_config.themeColors). Portaled content (dialog, calendar popover,
// select menus) lives outside the widget root, so each re-applies data-theme +
// the client overrides itself. Never hard-code a theme's stock palette here or
// per-client colors are ignored.
const getThemeStyles = (theme: WidgetTheme) => {
  const is24k = theme === 'twentyfourk';
  // Tailwind only generates classes it can find as complete literals in source,
  // so every arbitrary-value class below is spelled out in full (no template
  // interpolation of the hsl(...) part).
  const selected = is24k
    ? 'bg-[hsl(var(--accent-gold))] text-[hsl(var(--accent-gold-foreground,0_0%_0%))] hover:bg-[hsl(var(--accent-gold))] hover:text-[hsl(var(--accent-gold-foreground,0_0%_0%))] focus:bg-[hsl(var(--accent-gold))] focus:text-[hsl(var(--accent-gold-foreground,0_0%_0%))]'
    : 'bg-[hsl(var(--cta-bg,var(--primary)))] text-[hsl(var(--cta-text,var(--primary-foreground)))] hover:bg-[hsl(var(--cta-bg,var(--primary)))] hover:text-[hsl(var(--cta-text,var(--primary-foreground)))] focus:bg-[hsl(var(--cta-bg,var(--primary)))] focus:text-[hsl(var(--cta-text,var(--primary-foreground)))]';
  return {
    dialogBg: 'bg-background text-foreground',
    inputBg: 'bg-card border-border text-foreground placeholder:text-muted-foreground',
    focusRing: 'focus-visible:ring-ring',
    labelColor: 'text-foreground',
    descColor: 'text-muted-foreground',
    outline: 'border-[hsl(var(--client-accent)/0.4)] text-foreground hover:bg-muted',
    buttonClass: 'hover:opacity-90',
    buttonStyle: {
      background: is24k ? 'hsl(var(--accent-gold))' : 'hsl(var(--cta-bg, var(--primary)))',
      color: is24k ? 'hsl(var(--accent-gold-foreground, 0 0% 0%))' : 'hsl(var(--cta-text, var(--primary-foreground)))',
    } as CSSProperties,
    dateSelected: `${selected} border-transparent`,
    calendarBg: 'bg-popover text-popover-foreground border-border',
    calendarSelected: selected,
    calendarToday: 'bg-[hsl(var(--client-accent)/0.2)] text-[hsl(var(--client-accent))]',
  };
};

interface BookAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string;
  ringConfiguration?: any;
}

export const BookAppointmentDialog = ({ open, onOpenChange, clientId, ringConfiguration }: BookAppointmentDialogProps) => {
  const [date, setDate] = useState<Date>();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    time: '',
    message: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [countryCode, setCountryCode] = useState('+1');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryIso, setCountryIso] = useState('US');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState('');

  const { theme, styleOverrides, colors } = useWidgetTheme();
  const styles = getThemeStyles(theme);
  const { url: schedulingUrl, provider: schedulingProvider } = useClientScheduling(clientId);
  const useExternalScheduler = !!schedulingUrl;
  const { schedule: availability } = useClientAvailability(clientId);
  const timeSlots = (availability && date)
    ? generateSlotsForDate(availability, date)
    : null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Phone is optional here — but if one is typed it must be a real, reachable
    // number for the selected country (offline check, no API cost).
    const phoneCheck = phoneNumber.replace(/\D/g, '')
      ? checkPhone(countryCode, phoneNumber, countryIso)
      : null;
    if (phoneCheck && !phoneCheck.valid) {
      setPhoneError(phoneCheck.error || 'Please enter a valid phone number');
      return;
    }
    setPhoneError('');

    setIsSubmitting(true);
    try {
      const formattedPhone = phoneNumber
        ? (phoneCheck?.e164 || formatPhoneE164(countryCode, phoneNumber))
        : null;

      // Client-side id: anonymous embeds cannot read the row back after insert.
      const bookingId = crypto.randomUUID();
      const bookingData = {
        id: bookingId,
        client_id: clientId || null,
        customer_name: formData.name,
        customer_email: formData.email,
        customer_phone: formattedPhone,
        preferred_date: date ? date.toISOString().split('T')[0] : null,
        preferred_time: formData.time || null,
        message: formData.message || null,
        ring_configuration: ringConfiguration || null,
        customer_timezone: formData.timezone || null,
      };
      const { error } = await insertLeadRow('appointment_bookings', bookingData as any);
      if (error) throw error;

      // Google Ads / GTM conversion for the booking (Meta fires separately below).
      trackLeadConversion('appointment_booking', {
        email: formData.email,
        phone: formattedPhone,
        leadId: bookingId,
        meta: { source: 'ring_builder' },
      });


      // Send email notification to the jeweler
      if (clientId) {
        supabase.functions.invoke('notify-appointment-booking', {
          body: {
            client_id: clientId,
            customer_name: formData.name,
            customer_email: formData.email,
            customer_phone: formattedPhone || undefined,
            preferred_date: date ? date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : undefined,
            preferred_time: formData.time || undefined,
            message: formData.message || undefined,
            customer_timezone: formData.timezone || undefined,
          },
        }).catch(console.error); // Fire and forget
      }

      // Standard Schedule conversion (browser Pixel + Conversions API)
      trackMetaSchedule({
        clientId,
        userData: {
          email: formData.email,
          phone: formattedPhone || undefined,
          firstName: formData.name,
          externalId: formData.email,
        },
        customData: { content_name: 'Appointment Booking', content_category: 'widget' },
      });

      toast({
        title: 'Appointment Request Submitted',
        description: 'We will contact you shortly to confirm your appointment.',
      });
      onOpenChange(false);
      setFormData({ name: '', email: '', time: '', message: '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
      setCountryCode('+1');
      setPhoneNumber('');
      setCountryIso('US');
      setDate(undefined);
    } catch (err) {
      console.error('Booking error:', err);
      toast({
        title: 'Error',
        description: 'Failed to submit appointment. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* maxHeight uses dvh (dynamic viewport height) so the dialog never grows
          taller than the *visible* area on mobile Safari/Chrome, where 100vh
          ignores the browser toolbars and pushes the footer buttons off-screen.
          Browsers without dvh drop the inline style and keep the max-h-[90vh]
          class. Extra bottom padding clears the iOS home indicator. */}
      <DialogContent
        data-theme={theme}
        style={{ ...(styleOverrides as CSSProperties), maxHeight: 'calc(100dvh - 2rem)' }}
        className={`sm:max-w-[500px] max-h-[90vh] overflow-y-auto overscroll-contain ${styles.dialogBg} border-none ${useExternalScheduler ? 'sm:max-w-[760px] p-0 overflow-hidden' : 'pb-[calc(2rem_+_env(safe-area-inset-bottom))]'}`}
      >
        {useExternalScheduler ? (
          <div className="flex flex-col h-[85vh] max-h-[820px]" style={{ height: 'min(85vh, calc(100dvh - 2rem))' }}>
            <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
              <DialogTitle className="text-lg">Book an Appointment</DialogTitle>
              <DialogDescription className={styles.descColor}>
                Pick a time that works for you — slots reflect our live availability.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0">
              <SchedulingEmbed
                url={schedulingUrl!}
                provider={schedulingProvider}
                backgroundHex={colors.background}
                textHex={colors.text}
                accentHex={colors.accent}
              />
            </div>
          </div>
        ) : (
        <>
        <DialogHeader>
          <DialogTitle className="text-lg">Book an Appointment</DialogTitle>
          <DialogDescription className={styles.descColor}>
            Schedule a consultation with our jewelry experts
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="name" className={`${styles.labelColor} text-sm font-medium`}>Name *</Label>
              <Input
                id="name"
                name="name"
                autoComplete="name"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={`${styles.inputBg} ${styles.focusRing} h-10`}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className={`${styles.labelColor} text-sm font-medium`}>Email *</Label>
              <Input
                id="email"
                type="email"
                name="email"
                autoComplete="email"
                inputMode="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className={`${styles.inputBg} ${styles.focusRing} h-10`}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className={`${styles.labelColor} text-sm font-medium`}>Phone</Label>
            <CountryPhoneInput
              countryCode={countryCode}
              phoneNumber={phoneNumber}
              onCountryCodeChange={(c) => { setCountryCode(c); setPhoneError(''); }}
              onPhoneNumberChange={(v) => { setPhoneNumber(v); if (phoneError) setPhoneError(''); }}
              countryIso={countryIso}
              onCountryIsoChange={setCountryIso}
              error={phoneError}
              onBlur={() => {
                if (!phoneNumber.replace(/\D/g, '')) { setPhoneError(''); return; }
                const res = checkPhone(countryCode, phoneNumber, countryIso);
                setPhoneError(res.valid ? '' : (res.error || 'Please enter a valid phone number'));
              }}
              fontColor={colors.text}
              backgroundColor={colors.background}
              inputClassName={`${styles.inputBg} ${styles.focusRing} h-10`}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className={`${styles.labelColor} text-sm font-medium`}>Preferred Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal h-10 hover:scale-100',
                      styles.inputBg,
                      styles.focusRing,
                      date ? styles.dateSelected : `${styles.descColor} hover:bg-transparent hover:text-current`,
                      !date && 'hover:bg-transparent'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                    {date ? format(date, 'PPP') : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent data-theme={theme} style={styleOverrides as CSSProperties} className={`w-auto p-0 ${styles.calendarBg}`} align="start">
                  <Calendar
                    mode="single"
                    selected={date}
                    onSelect={setDate}
                    disabled={(d) => d < today || (availability ? !isDateAvailable(availability, d) : false)}
                    initialFocus
                    className="pointer-events-auto"
                    classNames={{
                      day_selected: styles.calendarSelected,
                      day_today: styles.calendarToday,
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="time" className={`${styles.labelColor} text-sm font-medium`}>Preferred Time</Label>
              <Select
                value={formData.time}
                onValueChange={(value) => setFormData({ ...formData, time: value })}
                disabled={!!availability && !date}
              >
                <SelectTrigger className={`${styles.inputBg} ${styles.focusRing} h-10`}>
                  <SelectValue placeholder={availability && !date ? 'Pick a date first' : 'Select a time'} />
                </SelectTrigger>
                <SelectContent data-theme={theme} style={styleOverrides as CSSProperties}>
                  {timeSlots ? (
                    timeSlots.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">No times available</div>
                    ) : (
                      timeSlots.map((s) => (
                        <SelectItem key={s.value} value={s.label}>{s.label}</SelectItem>
                      ))
                    )
                  ) : (
                    <>
                      <SelectItem value="9:00 AM">9:00 AM</SelectItem>
                      <SelectItem value="10:00 AM">10:00 AM</SelectItem>
                      <SelectItem value="11:00 AM">11:00 AM</SelectItem>
                      <SelectItem value="12:00 PM">12:00 PM</SelectItem>
                      <SelectItem value="1:00 PM">1:00 PM</SelectItem>
                      <SelectItem value="2:00 PM">2:00 PM</SelectItem>
                      <SelectItem value="3:00 PM">3:00 PM</SelectItem>
                      <SelectItem value="4:00 PM">4:00 PM</SelectItem>
                      <SelectItem value="5:00 PM">5:00 PM</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className={`${styles.labelColor} text-sm font-medium`}>
              <Globe className="inline-block w-3.5 h-3.5 mr-1 -mt-0.5" />
              Timezone
            </Label>
            <Select value={formData.timezone} onValueChange={(value) => setFormData({ ...formData, timezone: value })}>
              <SelectTrigger className={`${styles.inputBg} ${styles.focusRing} h-10`}>
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent data-theme={theme} style={styleOverrides as CSSProperties}>
                {COMMON_TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="message" className={`${styles.labelColor} text-sm font-medium`}>Message (Optional)</Label>
            <Textarea
              id="message"
              value={formData.message}
              onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              placeholder="Any specific requirements or questions?"
              className={`${styles.inputBg} ${styles.focusRing} min-h-[70px]`}
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className={`flex-1 ${styles.outline}`}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className={`flex-1 ${styles.buttonClass}`} style={styles.buttonStyle}>
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </Button>
          </div>
        </form>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
};
