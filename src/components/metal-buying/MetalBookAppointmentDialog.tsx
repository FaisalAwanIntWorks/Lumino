import { useState } from 'react';
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
import { CalendarIcon, Globe, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { CountryPhoneInput } from '@/components/ui/country-phone-input';
import { checkPhone } from '@/lib/phone-quality';
import { withAlpha, getContrastText } from '@/lib/color-utils';
import { useClientScheduling } from '@/hooks/useClientScheduling';
import { useClientAvailability } from '@/hooks/useClientAvailability';
import { generateSlotsForDate, isDateAvailable } from '@/lib/availability';
import { SchedulingEmbed } from '@/components/scheduling/SchedulingEmbed';
import { trackMetaSchedule } from '@/lib/meta-lead';
import { trackLeadConversion } from '@/lib/conversion-tracking';

const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HT)' },
  { value: 'Europe/London', label: 'GMT' },
  { value: 'Europe/Paris', label: 'CET' },
  { value: 'Asia/Dubai', label: 'Gulf Time (GST)' },
  { value: 'Asia/Kolkata', label: 'India (IST)' },
  { value: 'Australia/Sydney', label: 'Australia (AET)' },
];

const TIME_SLOTS = [
  '9:00 AM', '9:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM', '1:00 PM', '1:30 PM', '2:00 PM', '2:30 PM',
  '3:00 PM', '3:30 PM', '4:00 PM', '4:30 PM', '5:00 PM', '5:30 PM',
];

interface MetalBookAppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  accentColor?: string;
  fontColor?: string;
  backgroundColor?: string;
  metalContext?: { metal?: string; karat?: string; weight?: string };
}

export function MetalBookAppointmentDialog({
  open,
  onOpenChange,
  clientId,
  accentColor = '#d4af37',
  fontColor = '#ffffff',
  backgroundColor = '#0a0a0a',
  metalContext,
}: MetalBookAppointmentDialogProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [countryIso, setCountryIso] = useState('US');
  const [date, setDate] = useState<Date>();
  const [time, setTime] = useState('');
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const { url: schedulingUrl, provider: schedulingProvider } = useClientScheduling(clientId);
  const { schedule: availability } = useClientAvailability(clientId);
  const dynamicSlots = (availability && date) ? generateSlotsForDate(availability, date) : null;
  const useExternalScheduler = !!schedulingUrl;

  const phoneOk = !phone.replace(/\D/g, '') || checkPhone(countryCode, phone, countryIso).valid;
  const isValid = name.trim() && email.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && phoneOk;

  const handleSubmit = async () => {
    if (!isValid) return;
    setSubmitting(true);
    try {
      const fullPhone = phone
        ? (checkPhone(countryCode, phone, countryIso).e164 || `${countryCode}${phone.replace(/\D/g, '')}`)
        : null;

      // Client-side id: anonymous embeds have no read policy on this table, so
      // we cannot read the row back after insert.
      const bookingId = crypto.randomUUID();
      const { error } = await insertLeadRow('appointment_bookings', {
        id: bookingId,
        client_id: clientId,
        customer_name: name.trim(),
        customer_email: email.trim(),
        customer_phone: fullPhone,
        preferred_date: date ? format(date, 'yyyy-MM-dd') : null,
        preferred_time: time || null,
        customer_timezone: timezone,
        message: message.trim() || null,
        ring_configuration: {
          source: 'metal_iq',
          metal: metalContext?.metal || null,
          karat: metalContext?.karat || null,
          weight: metalContext?.weight || null,
        },
        status: 'pending',
      });

      if (error) throw error;

      // Google Ads / GTM conversion for the booking (Meta is fired separately below).
      trackLeadConversion('appointment_booking', {
        email: email.trim(),
        phone: fullPhone,
        leadId: bookingId,
        meta: { source: 'metal_iq' },
      });

      // Fire notification edge function
      try {
        await supabase.functions.invoke('notify-appointment-booking', {
          body: {
            client_id: clientId,
            customer_name: name.trim(),
            customer_email: email.trim(),
            customer_phone: fullPhone || undefined,
            preferred_date: date ? format(date, 'PPP') : undefined,
            preferred_time: time || undefined,
            message: message.trim() || undefined,
            source: 'metal_iq',
          },
        });
      } catch {
        // Non-critical
      }

      trackMetaSchedule({
        clientId,
        userData: { email: email.trim(), phone: fullPhone, firstName: name.trim(), externalId: email.trim() },
        customData: { content_name: 'Metal IQ Appointment', content_category: 'form' },
      });

      setSubmitted(true);
      // Reset form fields
      setName(''); setEmail(''); setPhone(''); setDate(undefined);
      setTime(''); setMessage('');
    } catch (err) {
      console.error('[metal-iq booking] failed:', err);
      toast.error('Failed to book appointment');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = {
    backgroundColor: withAlpha(fontColor, 0.03),
    borderColor: withAlpha(fontColor, 0.13),
    color: fontColor,
  };

  const scrollbarId = 'metal-appt-dialog';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setSubmitted(false); onOpenChange(o); }}>
      <style>{`
        #${scrollbarId}::-webkit-scrollbar { width: 6px; }
        #${scrollbarId}::-webkit-scrollbar-track { background: ${backgroundColor}; }
        #${scrollbarId}::-webkit-scrollbar-thumb { background: hsl(var(--embed-scrollbar-thumb, 0 0% 55%)); border-radius: 3px; }
        #${scrollbarId}::-webkit-scrollbar-thumb:hover { background: hsl(var(--embed-scrollbar-hover, 0 0% 42%)); }
      `}</style>
      <DialogContent
        id={scrollbarId}
        className={`border-0 ${useExternalScheduler ? 'max-w-3xl p-0 overflow-hidden h-[85vh] max-h-[820px]' : 'max-w-md max-h-[90vh] overflow-y-auto'}`}
        style={{ backgroundColor, color: fontColor, border: `1px solid ${withAlpha(fontColor, 0.08)}`, scrollbarColor: `hsl(var(--embed-scrollbar-thumb, 0 0% 55%)) ${backgroundColor}` }}
      >
        {useExternalScheduler ? (
          <div className="flex flex-col h-full">
            <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
              <DialogTitle style={{ color: fontColor }}>Book an Appointment</DialogTitle>
              <DialogDescription style={{ color: withAlpha(fontColor, 0.6) }}>
                Pick a time that works for you — slots reflect our live availability.
              </DialogDescription>
            </DialogHeader>
            <div className="flex-1 min-h-0">
              <SchedulingEmbed
                url={schedulingUrl!}
                provider={schedulingProvider}
                accentHex={accentColor}
                backgroundHex={backgroundColor}
                textHex={fontColor}
              />
            </div>
          </div>
        ) : submitted ? (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
            <CheckCircle2 className="w-16 h-16" style={{ color: accentColor }} />
            <h3 className="text-2xl font-bold" style={{ color: fontColor }}>Appointment Booked!</h3>
            <p className="text-sm" style={{ color: withAlpha(fontColor, 0.6) }}>
              We've received your request and will contact you shortly to confirm your appointment.
            </p>
            <Button
              onClick={() => { setSubmitted(false); onOpenChange(false); }}
              className="mt-4 h-11 px-8 font-semibold"
              style={{ backgroundColor: accentColor, color: getContrastText(accentColor) }}
            >
              Done
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle style={{ color: fontColor }}>Book an Appointment</DialogTitle>
              <DialogDescription style={{ color: withAlpha(fontColor, 0.6) }}>
                Book a meeting with us to get this appraised in person
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label className="text-sm" style={{ color: withAlpha(fontColor, 0.8) }}>Name *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Full name"
                  className="h-10 border" style={inputStyle} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm" style={{ color: withAlpha(fontColor, 0.8) }}>Email *</Label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com"
                  className="h-10 border" style={inputStyle} />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm" style={{ color: withAlpha(fontColor, 0.8) }}>Phone</Label>
                <CountryPhoneInput
                  countryCode={countryCode} phoneNumber={phone}
                  onCountryCodeChange={(c) => { setCountryCode(c); setPhoneError(''); }}
                  onPhoneNumberChange={(v) => { setPhone(v); if (phoneError) setPhoneError(''); }}
                  countryIso={countryIso} onCountryIsoChange={setCountryIso}
                  error={phoneError}
                  onBlur={() => {
                    if (!phone.replace(/\D/g, '')) { setPhoneError(''); return; }
                    const res = checkPhone(countryCode, phone, countryIso);
                    setPhoneError(res.valid ? '' : (res.error || 'Please enter a valid phone number'));
                  }}
                  fontColor={fontColor} backgroundColor={backgroundColor}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-sm" style={{ color: withAlpha(fontColor, 0.8) }}>Preferred Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full justify-start text-left font-normal h-10 border", !date && "opacity-60")}
                        style={inputStyle}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? format(date, 'MMM d, yyyy') : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={date} onSelect={setDate}
                        disabled={d => d < new Date(new Date().setHours(0,0,0,0)) || (availability ? !isDateAvailable(availability, d) : false)}
                        initialFocus className={cn("p-3 pointer-events-auto")} />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm" style={{ color: withAlpha(fontColor, 0.8) }}>Preferred Time</Label>
                  <Select value={time} onValueChange={setTime} disabled={!!availability && !date}>
                    <SelectTrigger className="h-10 border" style={inputStyle}>
                      <SelectValue placeholder={availability && !date ? 'Pick a date first' : 'Select time'} />
                    </SelectTrigger>
                    <SelectContent>
                      {dynamicSlots ? (
                        dynamicSlots.length === 0 ? (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">No times available</div>
                        ) : (
                          dynamicSlots.map(s => (
                            <SelectItem key={s.value} value={s.label}>{s.label}</SelectItem>
                          ))
                        )
                      ) : (
                        TIME_SLOTS.map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm flex items-center gap-1.5" style={{ color: withAlpha(fontColor, 0.8) }}>
                  <Globe className="h-3.5 w-3.5" /> Timezone
                </Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger className="h-10 border" style={inputStyle}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMMON_TIMEZONES.map(tz => (
                      <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm" style={{ color: withAlpha(fontColor, 0.8) }}>Message (optional)</Label>
                <Textarea value={message} onChange={e => setMessage(e.target.value)}
                  placeholder="Anything you'd like us to know..."
                  rows={3} className="border resize-none" style={inputStyle} />
              </div>

              <Button
                onClick={handleSubmit}
                disabled={!isValid || submitting}
                className="w-full h-11 font-semibold"
                style={{ backgroundColor: accentColor, color: getContrastText(accentColor) }}
              >
                {submitting ? 'Booking...' : 'Book Appointment'}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
