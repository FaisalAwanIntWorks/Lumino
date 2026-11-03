// Helpers for client availability schedules.
// Used by both Settings UI and the customer-facing Book Appointment dialogs
// (Ring OS + Metal IQ). Keep this file pure (no React, no Supabase).

export type DayKey =
  | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export const DAY_ORDER: DayKey[] = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
];

export const DAY_LABEL: Record<DayKey, string> = {
  monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
  thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday',
};

export interface TimeInterval { start: string; end: string } // "HH:mm"

export interface DaySchedule {
  enabled: boolean;
  intervals: TimeInterval[];
}

export interface DateOverride {
  date: string; // "YYYY-MM-DD"
  enabled: boolean;
  intervals: TimeInterval[];
}

export interface AvailabilitySchedule {
  timezone: string;
  slot_duration_minutes: number;
  weekly_hours: Record<DayKey, DaySchedule>;
  date_overrides: DateOverride[];
}

export const DEFAULT_SCHEDULE: AvailabilitySchedule = {
  timezone: typeof Intl !== 'undefined'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : 'UTC',
  slot_duration_minutes: 30,
  weekly_hours: {
    monday:   { enabled: true,  intervals: [{ start: '09:00', end: '17:00' }] },
    tuesday:  { enabled: true,  intervals: [{ start: '09:00', end: '17:00' }] },
    wednesday:{ enabled: true,  intervals: [{ start: '09:00', end: '17:00' }] },
    thursday: { enabled: true,  intervals: [{ start: '09:00', end: '17:00' }] },
    friday:   { enabled: true,  intervals: [{ start: '09:00', end: '17:00' }] },
    saturday: { enabled: false, intervals: [] },
    sunday:   { enabled: false, intervals: [] },
  },
  date_overrides: [],
};

export const SLOT_DURATIONS = [15, 20, 30, 45, 60, 90, 120] as const;

// Day index Sun=0..Sat=6 (matches JS Date.getDay)
const JS_DAY_TO_KEY: DayKey[] = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

export function getDayKey(date: Date): DayKey {
  return JS_DAY_TO_KEY[date.getDay()];
}

export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Returns the effective DaySchedule for a given calendar date. */
export function getEffectiveDaySchedule(
  schedule: AvailabilitySchedule,
  date: Date,
): DaySchedule {
  const dateStr = toDateString(date);
  const override = schedule.date_overrides.find(o => o.date === dateStr);
  if (override) {
    return { enabled: override.enabled, intervals: override.intervals || [] };
  }
  return schedule.weekly_hours[getDayKey(date)] ?? { enabled: false, intervals: [] };
}

export function isDateAvailable(schedule: AvailabilitySchedule, date: Date): boolean {
  const day = getEffectiveDaySchedule(schedule, date);
  if (!day.enabled) return false;
  return day.intervals.some(i => parseTime(i.end) > parseTime(i.start));
}

function parseTime(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function formatSlot(minutes: number): { value: string; label: string } {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const label = `${h12}:${String(m).padStart(2, '0')} ${period}`;
  const value = `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return { value, label };
}

/** Build the list of available time slots for a calendar date. */
export function generateSlotsForDate(
  schedule: AvailabilitySchedule,
  date: Date,
): { value: string; label: string }[] {
  const day = getEffectiveDaySchedule(schedule, date);
  if (!day.enabled) return [];
  const duration = Math.max(5, schedule.slot_duration_minutes || 30);
  const slots: { value: string; label: string }[] = [];
  for (const iv of day.intervals) {
    const start = parseTime(iv.start);
    const end = parseTime(iv.end);
    for (let t = start; t + duration <= end; t += duration) {
      slots.push(formatSlot(t));
    }
  }
  return slots;
}

/** Hours from 0..23 used in time selects ("HH:mm" half-hour granularity). */
export const TIME_OPTIONS_30MIN: { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      out.push(formatSlot(h * 60 + m));
    }
  }
  return out;
})();
