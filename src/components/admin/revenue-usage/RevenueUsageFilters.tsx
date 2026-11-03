import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, RefreshCw, CalendarIcon, Info } from 'lucide-react';
import { format } from 'date-fns';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ClientOption { id: string; name: string }

interface Props {
  clients: ClientOption[];
  selectedClientId: string;
  onClientChange: (id: string) => void;
  productFilter: string;
  onProductChange: (p: string) => void;
  startDate: Date;
  endDate: Date;
  onStartDateChange: (d: Date) => void;
  onEndDateChange: (d: Date) => void;
  resoldOnly: boolean;
  onResoldOnlyChange: (v: boolean) => void;
  includeInternal: boolean;
  onIncludeInternalChange: (v: boolean) => void;
  onRefresh: () => void;
  onExport: () => void;
  showResoldToggle?: boolean;
  showProduct?: boolean;
  showDates?: boolean;
}

export function RevenueUsageFilters({
  clients, selectedClientId, onClientChange,
  productFilter, onProductChange,
  startDate, endDate, onStartDateChange, onEndDateChange,
  resoldOnly, onResoldOnlyChange,
  includeInternal, onIncludeInternalChange,
  onRefresh, onExport,
  showResoldToggle = true, showProduct = true, showDates = true,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedClientId} onValueChange={onClientChange}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Sub-account" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sub-accounts</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {showProduct && (
            <Select value={productFilter} onValueChange={onProductChange}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Product" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Products</SelectItem>
                <SelectItem value="chat">AI Chat</SelectItem>
                <SelectItem value="image">AI Image</SelectItem>
                <SelectItem value="estimate">Cost Estimate</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        {showDates && (
          <div className="flex items-center gap-2">
            <DatePicker label={format(startDate, 'MMM d, yyyy')} value={startDate} onChange={onStartDateChange} />
            <DatePicker label={format(endDate, 'MMM d, yyyy')} value={endDate} onChange={onEndDateChange} />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {showResoldToggle && (
            <div className="flex items-center gap-2">
              <Switch id="resold" checked={resoldOnly} onCheckedChange={onResoldOnlyChange} />
              <Label htmlFor="resold" className="text-sm">Paid top-ups only</Label>
              <InfoTip>
                Revenue counts only Stripe credit-pack purchases and auto-recharges.
                Credits an admin granted by hand are left out. Free monthly credits are never revenue either way.
              </InfoTip>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch id="internal" checked={includeInternal} onCheckedChange={onIncludeInternalChange} />
            <Label htmlFor="internal" className="text-sm">Include internal / test accounts</Label>
            <InfoTip>
              Accounts flagged as internal (JewlX, WAVES MVMNT and other test sub-accounts) are hidden by default,
              the same as on the admin dashboard revenue tiles.
            </InfoTip>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="h-4 w-4 mr-2" /> Export
          </Button>
        </div>
      </div>
    </div>
  );
}

function InfoTip({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="inline-flex" aria-label="More info">
            <Info className="h-4 w-4 text-muted-foreground" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed">{children}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function DatePicker({ label, value, onChange }: { label: string; value: Date; onChange: (d: Date) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="font-normal">
          <CalendarIcon className="h-4 w-4 mr-2" /> {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar mode="single" selected={value} onSelect={(d) => d && onChange(d)} initialFocus />
      </PopoverContent>
    </Popover>
  );
}
