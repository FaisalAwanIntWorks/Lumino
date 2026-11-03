import { useState, useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { DateRange } from 'react-day-picker';

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const QUICK_RANGES: { label: string; range: () => DateRange }[] = [
  { label: 'Today', range: () => ({ from: startOfDay(new Date()), to: new Date() }) },
  {
    label: 'Yesterday',
    range: () => {
      const d = startOfDay(new Date());
      d.setDate(d.getDate() - 1);
      return { from: d, to: d };
    },
  },
  { label: 'Last 7 days', range: () => lastDays(7) },
  { label: 'Last 30 days', range: () => lastDays(30) },
  { label: 'Last 90 days', range: () => lastDays(90) },
  {
    label: 'This month',
    range: () => {
      const n = new Date();
      return { from: new Date(n.getFullYear(), n.getMonth(), 1), to: n };
    },
  },
  {
    label: 'Last month',
    range: () => {
      const n = new Date();
      return { from: new Date(n.getFullYear(), n.getMonth() - 1, 1), to: new Date(n.getFullYear(), n.getMonth(), 0) };
    },
  },
  {
    label: 'This year',
    range: () => {
      const n = new Date();
      return { from: new Date(n.getFullYear(), 0, 1), to: n };
    },
  },
  { label: 'All time', range: () => ({ from: undefined, to: undefined }) },
];

function lastDays(days: number): DateRange {
  const start = startOfDay(new Date());
  start.setDate(start.getDate() - days);
  return { from: start, to: new Date() };
}

function formatDate(timezone?: string) {
  try {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      timeZone: timezone || 'America/New_York',
    });
  } catch {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  }
}

interface DashboardHeaderProps {
  companyName?: string;
  timezone?: string;
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
}

export function DashboardHeader({ companyName, timezone, dateRange, setDateRange }: DashboardHeaderProps) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const isPickingEndRef = useRef(false);

  const rangeLabel = useMemo(() => {
    if (!dateRange.from && !dateRange.to) return 'all time';
    if (dateRange.from && dateRange.to) {
      return `${format(dateRange.from, 'MMM d')} – ${format(dateRange.to, 'MMM d, yyyy')}`;
    }
    if (dateRange.from) return `from ${format(dateRange.from, 'MMM d, yyyy')}`;
    return 'all time';
  }, [dateRange]);

  const handleQuickRange = (range: DateRange) => {
    isPickingEndRef.current = false;
    setDateRange(range);
    setPopoverOpen(false);
  };

  // Click-by-click: first click anchors the start, second click completes the range.
  const handleDayClick = (day: Date) => {
    const clicked = startOfDay(day);
    const anchor = dateRange.from;
    if (!isPickingEndRef.current || !anchor) {
      setDateRange({ from: clicked, to: undefined });
      isPickingEndRef.current = true;
      return;
    }
    const from = clicked < anchor ? clicked : anchor;
    const to = clicked < anchor ? anchor : clicked;
    setDateRange({ from, to });
    isPickingEndRef.current = false;
    setPopoverOpen(false);
  };

  return (
    <div className="flex items-end justify-between">
      <div>
        <p className="text-[13px] font-medium text-muted-foreground">{formatDate(timezone)}</p>
        <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-foreground mt-1">
          {companyName || 'Dashboard'}
        </h1>
      </div>
      <Popover open={popoverOpen} onOpenChange={(open) => {
        isPickingEndRef.current = false;
        setPopoverOpen(open);
      }}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 px-3 text-xs gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5" />
            {rangeLabel}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-0"
          align="end"
          onInteractOutside={(e) => {
            if (isPickingEndRef.current) e.preventDefault();
          }}
        >
          <div className="flex flex-wrap gap-1.5 p-3 pb-0 max-w-[560px]">
            {QUICK_RANGES.map(opt => (
              <Button
                key={opt.label}
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => handleQuickRange(opt.range())}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          <Calendar
            mode="range"
            selected={dateRange}
            onSelect={() => {}}
            onDayClick={handleDayClick}
            numberOfMonths={2}
            disabled={(date) => date > new Date()}
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
