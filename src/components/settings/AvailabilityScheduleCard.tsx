import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Calendar as CalendarIcon, Clock, Plus, Trash2, CalendarOff } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  AvailabilitySchedule,
  DEFAULT_SCHEDULE,
  DAY_ORDER,
  DAY_LABEL,
  DayKey,
  SLOT_DURATIONS,
  TIME_OPTIONS_30MIN,
  DateOverride,
  toDateString,
} from '@/lib/availability';

const TIMEZONES = [
  'UTC',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'America/Toronto', 'America/Vancouver',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Karachi', 'Asia/Singapore', 'Asia/Tokyo',
  'Asia/Hong_Kong', 'Asia/Shanghai',
  'Australia/Sydney', 'Australia/Perth',
  'Africa/Lagos', 'Africa/Johannesburg',
];

interface Props {
  clientId: string | null | undefined;
  disabled?: boolean;
}

export function AvailabilityScheduleCard({ clientId, disabled }: Props) {
  const [schedule, setSchedule] = useState<AvailabilitySchedule>(DEFAULT_SCHEDULE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exists, setExists] = useState(false);

  useEffect(() => {
    if (!clientId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('client_availability_schedule')
        .select('*')
        .eq('client_id', clientId)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') {
        console.error(error);
      }
      if (data) {
        setExists(true);
        setSchedule({
          timezone: data.timezone || DEFAULT_SCHEDULE.timezone,
          slot_duration_minutes: data.slot_duration_minutes || 30,
          weekly_hours: (data.weekly_hours as any) || DEFAULT_SCHEDULE.weekly_hours,
          date_overrides: Array.isArray(data.date_overrides) ? (data.date_overrides as any) : [],
        });
      } else {
        setExists(false);
        setSchedule({ ...DEFAULT_SCHEDULE });
      }
      setLoading(false);
    })();
  }, [clientId]);

  const handleSave = async () => {
    if (!clientId) return;
    setSaving(true);
    try {
      const payload = {
        client_id: clientId,
        timezone: schedule.timezone,
        slot_duration_minutes: schedule.slot_duration_minutes,
        weekly_hours: schedule.weekly_hours as any,
        date_overrides: schedule.date_overrides as any,
      };
      const { error } = await supabase
        .from('client_availability_schedule')
        .upsert(payload, { onConflict: 'client_id' });
      if (error) throw error;
      setExists(true);
      toast.success('Availability schedule saved');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to save availability');
    } finally {
      setSaving(false);
    }
  };

  const updateDay = (day: DayKey, patch: Partial<AvailabilitySchedule['weekly_hours'][DayKey]>) => {
    setSchedule(s => ({
      ...s,
      weekly_hours: { ...s.weekly_hours, [day]: { ...s.weekly_hours[day], ...patch } },
    }));
  };

  const addInterval = (day: DayKey) => {
    const intervals = [...(schedule.weekly_hours[day]?.intervals || [])];
    intervals.push({ start: '09:00', end: '17:00' });
    updateDay(day, { intervals, enabled: true });
  };

  const removeInterval = (day: DayKey, idx: number) => {
    const intervals = [...(schedule.weekly_hours[day]?.intervals || [])];
    intervals.splice(idx, 1);
    updateDay(day, { intervals });
  };

  const updateInterval = (day: DayKey, idx: number, field: 'start' | 'end', value: string) => {
    const intervals = [...(schedule.weekly_hours[day]?.intervals || [])];
    intervals[idx] = { ...intervals[idx], [field]: value };
    updateDay(day, { intervals });
  };

  const addBlockedDate = (date: Date | undefined) => {
    if (!date) return;
    const dateStr = toDateString(date);
    if (schedule.date_overrides.some(o => o.date === dateStr)) {
      toast.error('That date is already in overrides');
      return;
    }
    const next: DateOverride = { date: dateStr, enabled: false, intervals: [] };
    setSchedule(s => ({ ...s, date_overrides: [...s.date_overrides, next].sort((a, b) => a.date.localeCompare(b.date)) }));
  };

  const removeOverride = (dateStr: string) => {
    setSchedule(s => ({ ...s, date_overrides: s.date_overrides.filter(o => o.date !== dateStr) }));
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Availability Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-primary mt-0.5" />
            <div>
              <CardTitle className="text-base sm:text-lg">Availability Schedule</CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Set your weekly working hours, slot duration, timezone and date overrides.
                Customers will only see these times in the Ring OS and Metal IQ
                "Book Appointment" dialogs.
              </CardDescription>
            </div>
          </div>
          {exists && (
            <Badge variant="secondary" className="whitespace-nowrap">Active</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Top settings: timezone + slot duration */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Timezone</Label>
            <Select
              value={schedule.timezone}
              onValueChange={(v) => setSchedule(s => ({ ...s, timezone: v }))}
              disabled={disabled}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TIMEZONES.map(tz => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Slot duration</Label>
            <Select
              value={String(schedule.slot_duration_minutes)}
              onValueChange={(v) => setSchedule(s => ({ ...s, slot_duration_minutes: Number(v) }))}
              disabled={disabled}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SLOT_DURATIONS.map(d => (
                  <SelectItem key={d} value={String(d)}>{d} minutes</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Weekly hours */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Weekly hours</Label>
          <div className="space-y-2">
            {DAY_ORDER.map(day => {
              const cfg = schedule.weekly_hours[day] || { enabled: false, intervals: [] };
              return (
                <div key={day} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-[140px]">
                      <Switch
                        checked={cfg.enabled}
                        onCheckedChange={(v) => updateDay(day, { enabled: v, intervals: v && cfg.intervals.length === 0 ? [{ start: '09:00', end: '17:00' }] : cfg.intervals })}
                        disabled={disabled}
                      />
                      <span className="text-sm font-medium">{DAY_LABEL[day]}</span>
                    </div>
                    {cfg.enabled ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => addInterval(day)} disabled={disabled}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add interval
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Off day</span>
                    )}
                  </div>
                  {cfg.enabled && (
                    <div className="mt-3 space-y-2">
                      {cfg.intervals.length === 0 && (
                        <p className="text-xs text-muted-foreground">No intervals — add one to make the day bookable.</p>
                      )}
                      {cfg.intervals.map((iv, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Select
                            value={iv.start}
                            onValueChange={(v) => updateInterval(day, idx, 'start', v)}
                            disabled={disabled}
                          >
                            <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                            <SelectContent className="max-h-64">
                              {TIME_OPTIONS_30MIN.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <span className="text-xs text-muted-foreground">to</span>
                          <Select
                            value={iv.end}
                            onValueChange={(v) => updateInterval(day, idx, 'end', v)}
                            disabled={disabled}
                          >
                            <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                            <SelectContent className="max-h-64">
                              {TIME_OPTIONS_30MIN.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeInterval(day, idx)} disabled={disabled}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Alert>
            <AlertDescription className="text-xs">
              To add a lunch break, set two intervals on a day (e.g. 9:00–12:00 and 13:00–17:00).
            </AlertDescription>
          </Alert>
        </div>

        {/* Date overrides */}
        <div className="space-y-3">
          <Label className="text-sm font-medium flex items-center gap-2">
            <CalendarOff className="h-4 w-4" /> Date overrides
          </Label>
          <p className="text-xs text-muted-foreground">
            Block specific dates (holidays/vacations) or replace the weekly hours for a single day.
          </p>
          <div className="space-y-2">
            {schedule.date_overrides.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No overrides yet.</p>
            )}
            {schedule.date_overrides.map((o, idx) => (
              <div key={o.date} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={o.enabled}
                      onCheckedChange={(v) => {
                        const next = [...schedule.date_overrides];
                        next[idx] = { ...o, enabled: v, intervals: v && o.intervals.length === 0 ? [{ start: '09:00', end: '17:00' }] : o.intervals };
                        setSchedule(s => ({ ...s, date_overrides: next }));
                      }}
                      disabled={disabled}
                    />
                    <span className="text-sm font-medium">{o.date}</span>
                    {!o.enabled && <Badge variant="outline">Blocked</Badge>}
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeOverride(o.date)} disabled={disabled}>
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
                  </Button>
                </div>
                {o.enabled && (
                  <div className="space-y-2">
                    {o.intervals.map((iv, ivIdx) => (
                      <div key={ivIdx} className="flex items-center gap-2">
                        <Select
                          value={iv.start}
                          onValueChange={(v) => {
                            const next = [...schedule.date_overrides];
                            const intervals = [...o.intervals];
                            intervals[ivIdx] = { ...iv, start: v };
                            next[idx] = { ...o, intervals };
                            setSchedule(s => ({ ...s, date_overrides: next }));
                          }}
                          disabled={disabled}
                        >
                          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-64">
                            {TIME_OPTIONS_30MIN.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <span className="text-xs text-muted-foreground">to</span>
                        <Select
                          value={iv.end}
                          onValueChange={(v) => {
                            const next = [...schedule.date_overrides];
                            const intervals = [...o.intervals];
                            intervals[ivIdx] = { ...iv, end: v };
                            next[idx] = { ...o, intervals };
                            setSchedule(s => ({ ...s, date_overrides: next }));
                          }}
                          disabled={disabled}
                        >
                          <SelectTrigger className="h-9 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent className="max-h-64">
                            {TIME_OPTIONS_30MIN.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => {
                            const next = [...schedule.date_overrides];
                            const intervals = [...o.intervals];
                            intervals.splice(ivIdx, 1);
                            next[idx] = { ...o, intervals };
                            setSchedule(s => ({ ...s, date_overrides: next }));
                          }}
                          disabled={disabled}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const next = [...schedule.date_overrides];
                        next[idx] = { ...o, intervals: [...o.intervals, { start: '09:00', end: '17:00' }] };
                        setSchedule(s => ({ ...s, date_overrides: next }));
                      }}
                      disabled={disabled}
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add interval
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" disabled={disabled}>
                <CalendarIcon className="h-3.5 w-3.5 mr-1.5" /> Add date override
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                onSelect={(d) => addBlockedDate(d)}
                disabled={(d) => d < new Date(new Date().setHours(0,0,0,0))}
                initialFocus
                className={cn('p-3 pointer-events-auto')}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={disabled || saving || !clientId}>
            {saving ? 'Saving…' : 'Save schedule'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
