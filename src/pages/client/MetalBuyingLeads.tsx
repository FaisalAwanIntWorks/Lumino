import { stickyHeaderTableClass } from "@/components/ui/table";
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Coins, Search, Trash2, RefreshCw, Mail, Phone, Download, Image, Flame, ThermometerSun, Snowflake, AlertTriangle, TrendingUp, CalendarDays, Clock, MapPin, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getCurrencySymbol } from '@/lib/pricing-utils';
import { MetalIQLeadDetailView } from '@/components/metal-buying/MetalIQLeadDetailView';

import { useClientStatusTags } from '@/hooks/useClientStatusTags';
import { StatusTagSelector } from '@/components/status/StatusTagSelector';
import { canView, staffCanSeeLeads } from '@/lib/staff-permissions';
import { AccessDenied } from '@/components/access/AccessDenied';

interface MetalBuyingLead {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  location: string | null;
  country_iso: string | null;
  metal_type: string;
  karat: string | null;
  weight_grams: number | null;
  knows_karat: boolean;
  knows_weight: boolean;
  knows_authentic: boolean;
  is_authentic: boolean | null;
  estimated_offer: number | null;
  competitor_offer: number | null;
  estimated_profit: number | null;
  spot_price_at_time: number | null;
  spot_price_date: string | null;
  buy_percentage: number | null;
  lead_score: string;
  status: string;
  photo_urls: string[] | null;
  created_at: string;
  currency?: string | null;
}

const LEAD_SCORE_CONFIG: Record<string, { label: string; icon: any; className: string }> = {
  hot: { label: 'Hot', icon: Flame, className: 'bg-red-500/10 text-red-600 border-red-500/30' },
  warm: { label: 'Warm', icon: ThermometerSun, className: 'bg-orange-500/10 text-orange-600 border-orange-500/30' },
  cold: { label: 'Cold', icon: Snowflake, className: 'bg-blue-500/10 text-blue-600 border-blue-500/30' },
  suspect: { label: 'Suspect', icon: AlertTriangle, className: 'bg-gray-500/10 text-gray-600 border-gray-500/30' },
};

const PURITY_FACTORS: Record<string, number> = {
  '8k': 0.333, '9k': 0.375, '10k': 0.417, '12k': 0.500,
  '14k': 0.583, '18k': 0.750, '21k': 0.875, '22k': 0.916, '24k': 0.999,
  '800': 0.800, '835': 0.835, '900': 0.900, '925': 0.925, '950': 0.950, '999': 0.999,
  '850': 0.850, '900pt': 0.900, '950pt': 0.950, '999pt': 0.999,
};

interface MetalIQBooking {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  customer_timezone: string | null;
  message: string | null;
  ring_configuration: any;
  status: string;
  created_at: string;
}

export default function MetalBuyingLeads() {
  const navigate = useNavigate();
  const { user, role, staffInfo } = useAuth();
  const { impersonatedClientId, isImpersonating } = useAdminImpersonation();
  const [leads, setLeads] = useState<MetalBuyingLead[]>([]);
  const [bookings, setBookings] = useState<MetalIQBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [effectiveClientId, setEffectiveClientId] = useState<string | null>(null);
  
  const [activeTab, setActiveTab] = useState('leads');
  const [selectedLead, setSelectedLead] = useState<MetalBuyingLead | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<MetalIQBooking | null>(null);

  const { tags, addTag, deleteTag, getTagColor } = useClientStatusTags(effectiveClientId, 'metal_buying');

  useEffect(() => {
    async function getClientId() {
      if (isImpersonating && impersonatedClientId) {
        setEffectiveClientId(impersonatedClientId);
        return;
      }
      if (!user) return;
      const { data } = await supabase.from('clients').select('id').eq('user_id', user.id).maybeSingle();
      setEffectiveClientId(data?.id ?? null);
    }
    getClientId();
  }, [user, isImpersonating, impersonatedClientId]);

  const fetchLeads = async () => {
    if (!effectiveClientId) return;
    setLoading(true);
    try {
      const [leadsRes, bookingsRes] = await Promise.all([
        supabase
          .from('metal_buying_leads')
          .select('*')
          .eq('client_id', effectiveClientId)
          .order('created_at', { ascending: false })
          .limit(500),
        supabase
          .from('appointment_bookings')
          .select('*')
          .eq('client_id', effectiveClientId)
          .filter('ring_configuration->>source', 'eq', 'metal_iq')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);
      if (leadsRes.error) throw leadsRes.error;
      setLeads((leadsRes.data as MetalBuyingLead[]) || []);
      setBookings((bookingsRes.data as MetalIQBooking[]) || []);
    } catch {
      toast.error('Failed to load leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (effectiveClientId) fetchLeads();
  }, [effectiveClientId]);

  // metal_buying_leads is not in the supabase_realtime publication — use polling instead.
  useEffect(() => {
    if (!effectiveClientId) return;
    const id = setInterval(() => fetchLeads(), 45000);
    const onFocus = () => fetchLeads();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [effectiveClientId]);

  const handleStatusChange = async (leadId: string, newStatus: string) => {
    const { error } = await supabase.from('metal_buying_leads').update({ status: newStatus }).eq('id', leadId);
    if (error) { toast.error('Failed to update status'); return; }
    setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
    if (selectedLead?.id === leadId) setSelectedLead(prev => prev ? { ...prev, status: newStatus } : null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this lead?')) return;
    const { error } = await supabase.from('metal_buying_leads').delete().eq('id', id);
    if (error) toast.error('Failed to delete');
    else { toast.success('Deleted'); setLeads(prev => prev.filter(l => l.id !== id)); }
  };

  const handleBookingStatusChange = async (bookingId: string, newStatus: string) => {
    const { error } = await supabase.from('appointment_bookings').update({ status: newStatus } as any).eq('id', bookingId);
    if (error) { toast.error('Failed to update status'); return; }
    setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
    toast.success(`Booking status updated to "${newStatus}"`);
  };

  const handleDownloadCSV = () => {
    const headers = ['Customer', 'Email', 'Phone', 'Location', 'Metal', 'Karat', 'Weight(g)', 'Our Offer', 'Competitor', 'Est. Profit', 'Spot Price', 'Spot Date', 'Currency', 'Lead Score', 'Status', 'Date'];
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = filtered.map(l => {
      const sym = getCurrencySymbol(l.currency || 'USD');
      return [
        l.customer_name || '', l.customer_email || '', l.customer_phone || '',
        l.location || '', l.metal_type, l.karat || 'Unknown', l.weight_grams?.toString() || 'Unknown',
        l.estimated_offer ? `${sym}${l.estimated_offer.toFixed(2)}` : 'N/A',
        l.competitor_offer ? `${sym}${l.competitor_offer.toFixed(2)}` : 'N/A',
        l.estimated_profit ? `${sym}${l.estimated_profit.toFixed(2)}` : 'N/A',
        l.spot_price_at_time ? `${sym}${l.spot_price_at_time.toFixed(2)}/oz` : 'N/A',
        l.spot_price_date || '', l.currency || 'USD',
        l.lead_score, l.status, format(new Date(l.created_at), 'MMM d, yyyy'),
      ].map(v => esc(String(v))).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `metal-iq-leads-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
  };

  const filtered = leads.filter(l => {
    if (statusFilter !== 'all' && l.status !== statusFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (l.customer_name?.toLowerCase().includes(q)) ||
      (l.customer_email?.toLowerCase().includes(q)) ||
      l.metal_type.toLowerCase().includes(q) ||
      (l.karat?.toLowerCase().includes(q))
    );
  });

  // Newest leads first — jewelers expect fresh submissions at the top.
  const sorted = [...filtered].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const formatMetal = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);



  if (selectedLead) {
    return (
      <div className="p-4 md:p-6 lg:p-8">
        <MetalIQLeadDetailView
          lead={selectedLead}
          clientId={effectiveClientId!}
          onBack={() => setSelectedLead(null)}
          tags={tags}
          getTagColor={getTagColor}
          onStatusChange={(newStatus) => handleStatusChange(selectedLead.id, newStatus)}
          onCreateTag={addTag}
          onDeleteTag={deleteTag}
          hasEditAccess={true}
          onViewFullLead={() => navigate(`/dashboard/saved-designs?lead=${selectedLead.id}`)}
        />
      </div>
    );
  }

  // Staff guard: Metal IQ access — disabled hides Widget + Leads entirely
  if (role === 'staff' && (!canView(staffInfo?.permissions?.metal_buying_access) || !staffCanSeeLeads(staffInfo?.permissions))) {
    return <AccessDenied feature="Metal IQ Leads" />;
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Coins className="h-6 w-6 text-primary" />
            Metal IQ — Leads
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Track and manage your metal purchase leads</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search leads..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 w-64" />
          </div>
          <Button variant="outline" size="sm" onClick={handleDownloadCSV} disabled={loading || sorted.length === 0}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="icon" onClick={fetchLeads} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="leads">Leads ({sorted.length})</TabsTrigger>
          <TabsTrigger value="bookings">Bookings ({bookings.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="leads">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{sorted.length} Lead{sorted.length !== 1 ? 's' : ''}</CardTitle>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${statusFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                >
                  All
                </button>
                {tags.map(tag => (
                  <button
                    key={tag.id}
                    onClick={() => setStatusFilter(tag.tag_name)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${statusFilter === tag.tag_name ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                  >
                    {tag.tag_name}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : sorted.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Coins className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No Metal IQ leads yet</p>
                  <p className="text-sm mt-1">Leads will appear here when customers submit the Metal IQ form</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table containerClassName={stickyHeaderTableClass}>
                    <TableHeader>
                      <TableRow>
                         <TableHead>Score</TableHead>
                         <TableHead>Status</TableHead>
                         <TableHead>Customer</TableHead>
                         <TableHead>Location</TableHead>
                         <TableHead>Metal</TableHead>
                         <TableHead>Karat</TableHead>
                         <TableHead>Weight</TableHead>
                         <TableHead>Our Offer</TableHead>
                         <TableHead>Competitor</TableHead>
                         <TableHead>Est. Profit</TableHead>
                         <TableHead>Spot Price</TableHead>
                         <TableHead>Photos</TableHead>
                         <TableHead>Date</TableHead>
                         <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sorted.map(lead => {
                        const scoreConfig = LEAD_SCORE_CONFIG[lead.lead_score] || LEAD_SCORE_CONFIG.cold;
                        const ScoreIcon = scoreConfig.icon;
                        return (
                            <TableRow key={lead.id} className="cursor-pointer" onClick={() => setSelectedLead(lead)}>
                            <TableCell>
                              <Badge variant="outline" className={`gap-1 ${scoreConfig.className}`}>
                                <ScoreIcon className="w-3 h-3" />
                                {scoreConfig.label}
                              </Badge>
                            </TableCell>
                            <TableCell onClick={e => e.stopPropagation()}>
                              <StatusTagSelector
                                currentStatus={lead.status}
                                tags={tags}
                                onStatusChange={(newStatus) => handleStatusChange(lead.id, newStatus)}
                                onCreateTag={addTag}
                                onDeleteTag={deleteTag}
                                getTagColor={getTagColor}
                              />
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{lead.customer_name || '—'}</div>
                                {lead.customer_email && (
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Mail className="h-3 w-3" /> {lead.customer_email}
                                  </span>
                                )}
                                {lead.customer_phone && (
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Phone className="h-3 w-3" /> {lead.customer_phone}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {lead.location || '—'}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">{formatMetal(lead.metal_type)}</Badge>
                            </TableCell>
                            <TableCell className="text-sm">{lead.karat || <span className="text-muted-foreground">Unknown</span>}</TableCell>
                            <TableCell className="text-sm">{lead.weight_grams ? `${lead.weight_grams}g` : <span className="text-muted-foreground">Unknown</span>}</TableCell>
                            <TableCell>
                              {lead.estimated_offer ? (
                                <span className="font-semibold text-primary">{getCurrencySymbol(lead.currency || 'USD')}{lead.estimated_offer.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                              ) : '—'}
                            </TableCell>
                            <TableCell>
                              {lead.competitor_offer ? (
                                <span className="text-muted-foreground">{getCurrencySymbol(lead.currency || 'USD')}{lead.competitor_offer.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                              ) : '—'}
                            </TableCell>
                            <TableCell>
                              {lead.estimated_profit ? (
                                <span className="font-semibold text-green-600">{getCurrencySymbol(lead.currency || 'USD')}{lead.estimated_profit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                              ) : '—'}
                            </TableCell>
                            <TableCell>
                              {lead.spot_price_at_time ? (
                                <div className="text-xs">
                                  <span className="flex items-center gap-1 font-medium">
                                    <TrendingUp className="h-3 w-3 text-muted-foreground" />
                                    {getCurrencySymbol(lead.currency || 'USD')}{lead.spot_price_at_time.toLocaleString()}/oz
                                  </span>
                                  {lead.spot_price_date && (
                                    <span className="text-muted-foreground">{lead.spot_price_date}</span>
                                  )}
                                </div>
                              ) : '—'}
                            </TableCell>
                            <TableCell>
                              {lead.photo_urls && lead.photo_urls.length > 0 ? (
                                <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                  {lead.photo_urls.slice(0, 2).map((url, idx) => (
                                    <Dialog key={idx}>
                                      <DialogTrigger asChild>
                                        <img src={url} alt={`Photo ${idx + 1}`} className="w-10 h-10 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity" />
                                      </DialogTrigger>
                                      <DialogContent className="max-w-2xl">
                                        <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-auto rounded" />
                                      </DialogContent>
                                    </Dialog>
                                  ))}
                                  {lead.photo_urls.length > 2 && (
                                    <span className="text-xs text-muted-foreground">+{lead.photo_urls.length - 2}</span>
                                  )}
                                </div>
                              ) : (
                                <Image className="h-4 w-4 opacity-40 text-muted-foreground" />
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(lead.created_at), 'MMM d, yyyy')}
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); handleDelete(lead.id); }} className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bookings">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-primary" />
                {bookings.length} Appointment Booking{bookings.length !== 1 ? 's' : ''}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : bookings.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="font-medium">No Metal IQ bookings yet</p>
                  <p className="text-sm mt-1">Bookings will appear here when customers use the built-in appointment form</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table containerClassName={stickyHeaderTableClass}>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Date & Time</TableHead>
                        <TableHead>Metal Details</TableHead>
                        <TableHead>Message</TableHead>
                        <TableHead>Booked On</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bookings.map(booking => {
                        const config = booking.ring_configuration as any;
                        return (
                          <TableRow key={booking.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedBooking(booking)}>
                            <TableCell onClick={e => e.stopPropagation()}>
                              <select
                                value={booking.status}
                                onChange={e => handleBookingStatusChange(booking.id, e.target.value)}
                                className="text-xs border rounded px-2 py-1 bg-background capitalize"
                              >
                                <option value="pending">Pending</option>
                                <option value="confirmed">Confirmed</option>
                                <option value="completed">Completed</option>
                                <option value="cancelled">Cancelled</option>
                              </select>
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">{booking.customer_name}</div>
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Mail className="h-3 w-3" /> {booking.customer_email}
                                </span>
                                {booking.customer_phone && (
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Phone className="h-3 w-3" /> {booking.customer_phone}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm space-y-0.5">
                                {booking.preferred_date ? (
                                  <span className="flex items-center gap-1">
                                    <CalendarDays className="h-3 w-3 text-muted-foreground" />
                                    {format(new Date(booking.preferred_date), 'MMM d, yyyy')}
                                  </span>
                                ) : <span className="text-muted-foreground">No date</span>}
                                {booking.preferred_time && (
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Clock className="h-3 w-3" /> {booking.preferred_time}
                                  </span>
                                )}
                                {booking.customer_timezone && (
                                  <span className="text-xs text-muted-foreground">{booking.customer_timezone}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm space-y-0.5">
                                {config?.metal && (
                                  <Badge variant="outline" className="text-xs">{formatMetal(config.metal)}</Badge>
                                )}
                                {config?.karat && <span className="text-xs text-muted-foreground ml-1">{config.karat}</span>}
                                {config?.weight && <span className="text-xs text-muted-foreground ml-1">({config.weight}g)</span>}
                                {!config?.metal && <span className="text-muted-foreground text-xs">—</span>}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[200px]">
                              {booking.message ? (
                                <p className="text-sm text-muted-foreground truncate">{booking.message}</p>
                              ) : <span className="text-muted-foreground text-xs">—</span>}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(booking.created_at), 'MMM d, yyyy')}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Booking detail dialog */}
      {selectedBooking && (
        <Dialog open={!!selectedBooking} onOpenChange={(open) => { if (!open) setSelectedBooking(null); }}>
          <DialogContent className="max-w-lg">
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Booking Details</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer</span>
                  <span className="font-medium">{selectedBooking.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email</span>
                  <a href={`mailto:${selectedBooking.customer_email}`} className="text-primary hover:underline">{selectedBooking.customer_email}</a>
                </div>
                {selectedBooking.customer_phone && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Phone</span>
                    <span>{selectedBooking.customer_phone}</span>
                  </div>
                )}
                {selectedBooking.preferred_date && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Preferred Date</span>
                    <span>{format(new Date(selectedBooking.preferred_date), 'MMM d, yyyy')}</span>
                  </div>
                )}
                {selectedBooking.preferred_time && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Preferred Time</span>
                    <span>{selectedBooking.preferred_time}</span>
                  </div>
                )}
                {selectedBooking.customer_timezone && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Timezone</span>
                    <span>{selectedBooking.customer_timezone}</span>
                  </div>
                )}
                {selectedBooking.message && (
                  <div>
                    <span className="text-muted-foreground">Message</span>
                    <p className="mt-1 text-foreground bg-muted/50 rounded p-2">{selectedBooking.message}</p>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2">
                  <span className="text-muted-foreground">Status</span>
                  <select
                    value={selectedBooking.status}
                    onChange={e => {
                      handleBookingStatusChange(selectedBooking.id, e.target.value);
                      setSelectedBooking({ ...selectedBooking, status: e.target.value });
                    }}
                    className="text-xs border rounded px-2 py-1 bg-background capitalize"
                  >
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground pt-2">
                  <span>Booked on</span>
                  <span>{format(new Date(selectedBooking.created_at), 'MMM d, yyyy · h:mm a')}</span>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
