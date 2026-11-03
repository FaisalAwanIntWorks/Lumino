import { stickyHeaderTableClass } from "@/components/ui/table";
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAdminImpersonation } from '@/contexts/AdminImpersonationContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Diamond, Search, Trash2, RefreshCw, Mail, Phone, Download, Image } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { LEAD_QUALITY_LABELS, LEAD_QUALITY_REASON_LABELS, type LeadQuality } from '@/lib/lead-quality';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useClientCurrency } from '@/hooks/useClientCurrency';
import { formatCurrency } from '@/lib/pricing-utils';

interface DiamondFormLead {
  id: string;
  first_name: string;
  quote_version?: string | null;
  is_test_preview?: boolean | null;
  email: string;
  country_code: string | null;
  phone_number: string | null;
  sms_consent: boolean;
  marketing_consent: boolean;
  diamond_type: string | null;
  diamond_shape: string | null;
  diamond_size: string | null;
  diamond_quality: string | null;
  diamond_setting: string | null;
  diamond_holder: string | null;
  diamond_band: string | null;
  diamond_band_width: string[] | null;
  diamond_metal: string | null;
  diamond_personalization: string[] | null;
  ring_size: string | null;
  other_details: string | null;
  diamond_timeline: string | null;
  inspiration_image_urls: string[] | null;
  estimated_total: number;
  created_at: string;
  phone_quality: LeadQuality | null;
  phone_quality_reasons: string[] | null;
}

export default function DiamondFormsLeads() {
  const { user, role } = useAuth();
  const { impersonatedClientId, isImpersonating } = useAdminImpersonation();
  const [leads, setLeads] = useState<DiamondFormLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [qualityFilter, setQualityFilter] = useState<'all' | LeadQuality>('all');
  const [effectiveClientId, setEffectiveClientId] = useState<string | null>(null);
  const { currency: clientCurrency, loading: currencyLoading } = useClientCurrency(effectiveClientId);

  useEffect(() => {
    async function getClientId() {
      if (isImpersonating && impersonatedClientId) {
        setEffectiveClientId(impersonatedClientId);
        return;
      }
      if (!user) return;
      const { data } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      setEffectiveClientId(data?.id ?? null);
    }
    getClientId();
  }, [user, isImpersonating, impersonatedClientId]);

  const fetchLeads = async () => {
    if (!effectiveClientId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('diamond_form_leads')
        .select('*')
        .eq('client_id', effectiveClientId)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      setLeads((data as DiamondFormLead[]) || []);
    } catch (err: any) {
      toast.error('Failed to load diamond form leads');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (effectiveClientId) fetchLeads();
  }, [effectiveClientId]);

  // diamond_form_leads is not in the supabase_realtime publication — use polling instead.
  useEffect(() => {
    if (!effectiveClientId) return;
    const id = setInterval(() => fetchLeads(), 45000);
    const onFocus = () => fetchLeads();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [effectiveClientId]);

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this lead?')) return;
    const { error } = await supabase.from('diamond_form_leads').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete lead');
    } else {
      toast.success('Lead deleted');
      setLeads(prev => prev.filter(l => l.id !== id));
    }
  };

  const handleDownloadCSV = () => {
    const headers = ['Customer','Email','Phone','Type','Shape','Size','Quality','Setting','Metal','Band','Band Width','Ring Size','Other Details','Timeline','Estimate','Date'];
    const escCSV = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = filtered.map(l => [
      l.first_name, l.email, l.phone_number ? `${l.country_code || ''}${l.phone_number}` : '',
      formatValue(l.diamond_type), formatValue(l.diamond_shape), formatValue(l.diamond_size),
      formatValue(l.diamond_quality), formatValue(l.diamond_setting), formatValue(l.diamond_metal),
      formatValue(l.diamond_band), formatArray(l.diamond_band_width),
      l.ring_size || '', l.other_details || '',
      formatValue(l.diamond_timeline),
      formatCurrency(Number(l.estimated_total ?? 0), clientCurrency), format(new Date(l.created_at), 'MMM d, yyyy')
    ].map(v => escCSV(String(v))).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `diamond-leads-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
  };

  const filtered = leads.filter(l => {
    if (qualityFilter !== 'all' && l.phone_quality !== qualityFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      l.first_name.toLowerCase().includes(q) ||
      l.email.toLowerCase().includes(q) ||
      (l.phone_number && l.phone_number.includes(q)) ||
      (l.diamond_shape && l.diamond_shape.toLowerCase().includes(q)) ||
      (l.diamond_metal && l.diamond_metal.toLowerCase().includes(q))
    );
  });

  const formatValue = (val: string | number | null | undefined) => {
    if (val == null) return '—';
    return String(val).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  const formatArray = (arr: string[] | null) => {
    if (!arr || arr.length === 0) return '—';
    return arr.map(v => formatValue(v)).join(', ');
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Diamond className="h-6 w-6 text-primary" />
            Diamond Form Leads
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            All diamond ring configurations submitted by customers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search leads..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <Select value={qualityFilter} onValueChange={(v) => setQualityFilter(v as 'all' | LeadQuality)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Quality" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All quality</SelectItem>
              <SelectItem value="high">High quality</SelectItem>
              <SelectItem value="medium">Medium quality</SelectItem>
              <SelectItem value="low">Low quality</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleDownloadCSV} disabled={loading || filtered.length === 0}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="icon" onClick={fetchLeads} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {filtered.length} Lead{filtered.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading || currencyLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Diamond className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No diamond form leads yet</p>
              <p className="text-sm mt-1">Leads will appear here when customers submit the diamond form</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table containerClassName={stickyHeaderTableClass}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Quality</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Shape</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Quality</TableHead>
                    <TableHead>Setting</TableHead>
                    <TableHead>Metal</TableHead>
                    <TableHead>Band</TableHead>
                    <TableHead>Ring Size</TableHead>
                    <TableHead>Other Details</TableHead>
                    <TableHead>Images</TableHead>
                    <TableHead>Timeline</TableHead>
                    <TableHead>Estimate</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(lead => (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <div className="font-medium">{lead.first_name}{lead.quote_version && <span className="ml-2 rounded border px-1.5 text-[10px] text-muted-foreground">{lead.quote_version.toUpperCase()}{lead.is_test_preview ? ' · Test' : ''}</span>}</div>
                      </TableCell>
                      <TableCell>
                        <span className="flex items-center gap-1 text-xs">
                          <Mail className="h-3 w-3" /> {lead.email}
                        </span>
                      </TableCell>
                      <TableCell>
                        {lead.phone_number ? (
                          <span className="flex items-center gap-1 text-xs">
                            <Phone className="h-3 w-3" /> {lead.country_code}{lead.phone_number}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        {lead.phone_quality ? (
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              lead.phone_quality === 'high'
                                ? 'border-primary/40 text-primary'
                                : lead.phone_quality === 'medium'
                                ? 'border-amber-500/40 text-amber-500'
                                : 'border-destructive/40 text-destructive'
                            }`}
                            title={(lead.phone_quality_reasons || [])
                              .map(r => LEAD_QUALITY_REASON_LABELS[r] || r)
                              .join(' • ') || 'No issues detected'}
                          >
                            {LEAD_QUALITY_LABELS[lead.phone_quality]}
                          </Badge>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{formatValue(lead.diamond_type)}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{formatValue(lead.diamond_shape)}</TableCell>
                      <TableCell className="text-sm">{formatValue(lead.diamond_size)}</TableCell>
                      <TableCell className="text-sm">{formatValue(lead.diamond_quality)}</TableCell>
                      <TableCell className="text-sm">{formatValue(lead.diamond_setting)}</TableCell>
                      <TableCell className="text-sm">{formatValue(lead.diamond_metal)}</TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <div>{formatValue(lead.diamond_band)}</div>
                          {lead.diamond_band_width && lead.diamond_band_width.length > 0 && (
                            <div className="text-muted-foreground">{formatArray(lead.diamond_band_width)}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{lead.ring_size || '—'}</TableCell>
                      <TableCell className="text-sm max-w-[150px] truncate" title={lead.other_details || ''}>{lead.other_details || '—'}</TableCell>
                      <TableCell>
                        {lead.inspiration_image_urls && lead.inspiration_image_urls.length > 0 ? (
                          <div className="flex items-center gap-1">
                            {lead.inspiration_image_urls.slice(0, 2).map((url, idx) => (
                              <Dialog key={idx}>
                                <DialogTrigger asChild>
                                  <img
                                    src={url}
                                    alt={`Inspiration ${idx + 1}`}
                                    className="w-10 h-10 object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                                  />
                                </DialogTrigger>
                                <DialogContent className="max-w-2xl">
                                  <img src={url} alt={`Inspiration ${idx + 1}`} className="w-full h-auto rounded" />
                                </DialogContent>
                              </Dialog>
                            ))}
                            {lead.inspiration_image_urls.length > 2 && (
                              <span className="text-xs text-muted-foreground">+{lead.inspiration_image_urls.length - 2}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground"><Image className="h-4 w-4 opacity-40" /></span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{formatValue(lead.diamond_timeline)}</TableCell>
                      <TableCell>
                        <span className="font-semibold text-primary">{formatCurrency(Number(lead.estimated_total ?? 0), clientCurrency)}</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(lead.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(lead.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
