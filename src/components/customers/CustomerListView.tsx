import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Eye, Users, ShoppingBag, Calendar as CalendarIcon, Gem, Wallet, Coins, Download, X } from 'lucide-react';
import { formatDistanceToNow, format, subDays, startOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { CustomerProfile } from '@/hooks/useCustomerHub';
import type { StatusTag } from '@/hooks/useClientStatusTags';

interface CustomerListViewProps {
  customers: CustomerProfile[];
  loading: boolean;
  onSelectCustomer: (customer: CustomerProfile) => void;
  leadStatusTags: StatusTag[];
  getLeadTagColor: (tagName: string) => string;
}

const ACTIVITY_BADGES: Record<string, { icon: React.ElementType; label: string; className: string }> = {
  lead: { icon: Gem, label: 'Lead', className: 'border-primary/30 text-primary' },
  booking: { icon: CalendarIcon, label: 'Booking', className: 'border-blue-500/30 text-blue-600' },
  deposit: { icon: Wallet, label: 'Deposit', className: 'border-emerald-500/30 text-emerald-600' },
  order: { icon: ShoppingBag, label: 'Order', className: 'border-violet-500/30 text-violet-600' },
  metal_iq: { icon: Coins, label: 'Metal IQ', className: 'border-amber-500/30 text-amber-600' },
};

const SOURCE_FILTER_OPTIONS = [
  { key: 'lead', label: 'Leads', icon: Gem },
  { key: 'booking', label: 'Bookings', icon: CalendarIcon },
  { key: 'deposit', label: 'Deposits', icon: Wallet },
  { key: 'order', label: 'Orders', icon: ShoppingBag },
  { key: 'metal_iq', label: 'Metal IQ', icon: Coins },
];

const DATE_PRESETS = [
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
  { label: 'All time', days: 0 },
];

export function CustomerListView({ customers, loading, onSelectCustomer, leadStatusTags, getLeadTagColor }: CustomerListViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilters, setSourceFilters] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);

  const toggleSourceFilter = (key: string) => {
    setSourceFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const clearFilters = () => {
    setSourceFilters(new Set());
    setStatusFilter('all');
    setDateRange({ from: undefined, to: undefined });
    setSearchQuery('');
  };

  const hasActiveFilters = sourceFilters.size > 0 || statusFilter !== 'all' || dateRange.from || dateRange.to || searchQuery;

  const filtered = useMemo(() => {
    return customers.filter(c => {
      const q = searchQuery.toLowerCase();
      if (q && !c.name.toLowerCase().includes(q) && !c.email.toLowerCase().includes(q) && !c.phone?.includes(q)) return false;
      
      if (sourceFilters.size > 0) {
        const hasMatchingType = Array.from(sourceFilters).some(f => c.activityTypes.has(f));
        if (!hasMatchingType) return false;
      }

      if (statusFilter !== 'all' && c.overallStatus !== statusFilter) return false;

      if (dateRange.from) {
        const lastSeen = new Date(c.lastSeen);
        if (lastSeen < dateRange.from) return false;
      }
      if (dateRange.to) {
        const lastSeen = new Date(c.lastSeen);
        const endOfDay = new Date(dateRange.to);
        endOfDay.setHours(23, 59, 59, 999);
        if (lastSeen > endOfDay) return false;
      }

      return true;
    });
  }, [customers, searchQuery, sourceFilters, statusFilter, dateRange]);

  const exportCSV = () => {
    const headers = ['Name', 'Email', 'Phone', 'Status', 'Submissions', 'First Seen', 'Last Active', 'Activity Types'];
    const rows = filtered.map(c => [
      c.name, c.email, c.phone || '', c.overallStatus, c.submissionCount,
      format(new Date(c.firstSeen), 'yyyy-MM-dd'), format(new Date(c.lastSeen), 'yyyy-MM-dd'),
      Array.from(c.activityTypes).join(', '),
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customers-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  const DEFAULT_LEAD_STATUSES = ['new', 'contacted', 'qualified', 'converted', 'lost'];

  const filterStatuses = useMemo(() => {
    // Use lead status tags if available, otherwise fall back to defaults
    if (leadStatusTags.length > 0) {
      return leadStatusTags.map(t => t.tag_name);
    }
    return DEFAULT_LEAD_STATUSES;
  }, [leadStatusTags]);

  const applyDatePreset = (days: number) => {
    if (days === 0) {
      setDateRange({ from: undefined, to: undefined });
    } else {
      setDateRange({ from: startOfDay(subDays(new Date(), days)), to: undefined });
    }
    setDatePopoverOpen(false);
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
        <Card><CardContent className="p-6"><div className="space-y-4">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16" />)}</div></CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 sm:h-7 sm:w-7 text-primary" />
            Customers
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {filtered.length} customer{filtered.length !== 1 ? 's' : ''} · Unified view of all leads, bookings, orders and deposits
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2 self-start">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6 space-y-3">
          {/* Search + Status Select row */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email or phone..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[160px] h-11">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {filterStatuses.map(s => (
                  <SelectItem key={s} value={s}>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getLeadTagColor(s) }} />
                      <span className="capitalize">{s}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Source filter pills + Date */}
          <div className="flex flex-wrap items-center gap-2">
            {SOURCE_FILTER_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const active = sourceFilters.has(opt.key);
              return (
                <Button
                  key={opt.key}
                  variant={active ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => toggleSourceFilter(opt.key)}
                >
                  <Icon className="h-3 w-3" />
                  {opt.label}
                </Button>
              );
            })}
            
            <div className="w-px h-5 bg-border mx-1" />

            {/* Date range with presets */}
            <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                  <CalendarIcon className="h-3 w-3" />
                  {dateRange.from ? (
                    dateRange.to ? `${format(dateRange.from, 'MMM d')} – ${format(dateRange.to, 'MMM d')}` : `Since ${format(dateRange.from, 'MMM d')}`
                  ) : 'Date Range'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <div className="flex gap-2 p-3 pb-0 flex-wrap">
                  {DATE_PRESETS.map(preset => (
                    <Button key={preset.days} variant="outline" size="sm" className="h-7 text-xs" onClick={() => applyDatePreset(preset.days)}>
                      {preset.label}
                    </Button>
                  ))}
                </div>
                <Calendar
                  mode="range"
                  selected={dateRange.from ? { from: dateRange.from, to: dateRange.to } : undefined}
                  onSelect={(range) => {
                    setDateRange({ from: range?.from, to: range?.to });
                    if (range?.from && range?.to) setDatePopoverOpen(false);
                  }}
                  numberOfMonths={1}
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={clearFilters}>
                <X className="h-3 w-3" />
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          {filtered.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">No customers found</p>
            </div>
          ) : (
            <>
              {/* Mobile */}
              <div className="space-y-3 md:hidden">
                {filtered.map(customer => (
                  <Card key={customer.email} className="p-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => onSelectCustomer(customer)}>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-sm truncate">{customer.name}</p>
                          {customer.submissionCount > 1 && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-600 shrink-0">
                              {customer.submissionCount}×
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{customer.email}</p>
                      </div>
                      <Badge 
                        variant="outline" 
                        className="text-[10px] px-1.5 py-0 capitalize shrink-0"
                        style={{ borderColor: getLeadTagColor(customer.overallStatus) + '40', color: getLeadTagColor(customer.overallStatus) }}
                      >
                        {customer.overallStatus}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {Array.from(customer.activityTypes).map(type => {
                        const badge = ACTIVITY_BADGES[type];
                        if (!badge) return null;
                        return (
                          <Badge key={type} variant="outline" className={`text-[10px] px-1.5 py-0 ${badge.className}`}>
                            {badge.label}
                          </Badge>
                        );
                      })}
                    </div>
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <span>{formatDistanceToNow(new Date(customer.lastSeen), { addSuffix: true })}</span>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <Table containerClassName="max-h-[calc(100vh-14rem)] overflow-y-auto">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs lg:text-sm bg-card">Customer</TableHead>
                      <TableHead className="text-xs lg:text-sm bg-card">Email</TableHead>
                      <TableHead className="text-xs lg:text-sm bg-card">Phone</TableHead>
                      <TableHead className="text-xs lg:text-sm bg-card">Activities</TableHead>
                      <TableHead className="text-xs lg:text-sm bg-card">Submissions</TableHead>
                      <TableHead className="text-xs lg:text-sm bg-card">Status</TableHead>
                      <TableHead className="text-xs lg:text-sm bg-card">Last Active</TableHead>
                      <TableHead className="text-xs lg:text-sm text-right bg-card">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map(customer => (
                      <TableRow key={customer.email} className="cursor-pointer" onClick={() => onSelectCustomer(customer)}>
                        <TableCell className="text-sm font-medium">
                          <div className="flex items-center gap-1.5">
                            {customer.name}
                            {customer.submissionCount > 1 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-600">
                                {customer.submissionCount}×
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{customer.email}</TableCell>
                        <TableCell className="text-sm">{customer.phone || '—'}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {Array.from(customer.activityTypes).map(type => {
                              const badge = ACTIVITY_BADGES[type];
                              if (!badge) return null;
                              return (
                                <Badge key={type} variant="outline" className={`text-[10px] px-1.5 py-0 ${badge.className}`}>
                                  {badge.label}
                                </Badge>
                              );
                            })}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-center">{customer.submissionCount}</TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className="text-[10px] px-1.5 py-0 capitalize"
                            style={{ borderColor: getLeadTagColor(customer.overallStatus) + '40', color: getLeadTagColor(customer.overallStatus) }}
                          >
                            {customer.overallStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(customer.lastSeen), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" onClick={() => onSelectCustomer(customer)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
