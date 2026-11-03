import { stickyHeaderTableClass } from "@/components/ui/table";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { useClientTimezone, formatDateWithTimezone } from "@/hooks/useClientTimezone";

import { useAuth } from "@/contexts/AuthContext";
import { staffCanSeeLeads } from "@/lib/staff-permissions";
import { AccessDenied } from "@/components/access/AccessDenied";
import { useAdminImpersonation } from "@/contexts/AdminImpersonationContext";
import { supabase } from "@/integrations/supabase/client";
import { getPageCache, setPageCache, resolveOwnClientId } from "@/lib/page-cache";
import type { LeadDeviceInfo } from '@/lib/lead-device';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LeadDetailView } from "@/components/leads/LeadDetailView";
import { RepeatCustomerBadge } from "@/components/leads/RepeatCustomerBadge";
import { useClientCurrency } from "@/hooks/useClientCurrency";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Search, Eye, Plus, Database, ExternalLink, Trash2, Download, Mail, Loader2, Image, Calendar as CalendarIcon, User, Phone, Mail as MailIcon, ThumbsUp, ThumbsDown, Filter, ChevronDown } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePageSearchRegistration } from '@/hooks/usePageSearchRegistration';
import { Separator } from "@/components/ui/separator";
import { QuestionAnswersSection } from "@/components/leads/QuestionAnswersSection";
import { LeadFollowUpSection } from "@/components/leads/LeadFollowUpSection";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { format, subDays, startOfDay } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useClientStatusTags } from "@/hooks/useClientStatusTags";
import { StatusTagSelector } from "@/components/status/StatusTagSelector";

import { CustomerListView } from '@/components/customers/CustomerListView';
import { CustomerDetailView } from '@/components/customers/CustomerDetailView';
import { useCustomerHub, type CustomerProfile, type CustomerActivity } from '@/hooks/useCustomerHub';
import { constructCdnImageUrl } from '@/lib/cdn-utils';

const SANDBOX_CLIENT_ID = 'dcd952fc-783b-4a92-be7f-62751265c650';
interface SavedDesign {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  follow_up_status: string;
  created_at: string;
  product_name: string | null;
  notes: string | null;
  configuration: any;
  source: 'widget' | 'diamond_form' | 'grill_form' | 'custom_enquiry' | 'ring_builder' | 'booking' | 'metal_iq';
  device_info?: LeadDeviceInfo | null;
}

/** Small helper to render a label/value pair in the config grid */
const ConfigField = ({ label, value, raw }: { label: string; value: string; raw?: boolean }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium capitalize">
      {raw ? value : String(value).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
    </p>
  </div>
);

/** Normalise a display name or ID into a lowercase kebab-case slug */
const slugify = (v: string) => v.trim().toLowerCase().replace(/\s+/g, '-');

const getColorFamilyFromMetal = (metal: string | null | undefined): string | null => {
  if (!metal) return null;
  const m = metal.toLowerCase();
  if (m.includes('yellow')) return 'yellow';
  if (m.includes('rose') || m.includes('pink')) return 'rose';
  if (m.includes('white') || m.includes('platinum')) return 'white';
  if (m.includes('gold')) return 'yellow';
  return null;
};

/** Build a descriptive product name from the stored configuration object */
const buildProductNameFromConfig = (config: any): string | null => {
  if (!config) return null;
  const parts: string[] = [];
  // Config may contain display names ("Solitaire") or slugs ("solitaire")
  const titleCase = (v: string) =>
    v.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  if (config.style) parts.push(titleCase(config.style));
  if (config.shank) parts.push(titleCase(config.shank));
  if (config.metal) parts.push(titleCase(config.metal));
  if (config.shape) parts.push(titleCase(config.shape));
  if (config.caratRange) parts.push(`${config.caratRange}ct`);
  return parts.length > 0 ? parts.join(' ') : null;
};

const SavedDesigns = () => {
  const { user, role, staffInfo } = useAuth();
  const { impersonatedClientId, isImpersonating } = useAdminImpersonation();
  // Last loaded leads for this account, shown instantly while a fresh copy loads.
  const leadsCacheKey = isImpersonating
    ? (impersonatedClientId ? `leads:client:${impersonatedClientId}` : null)
    : role === 'staff'
      ? (staffInfo?.clientId ? `leads:staff:${staffInfo.clientId}` : null)
      : (user?.id ? `leads:user:${user.id}` : null);
  const cachedLeads = getPageCache<{ clientId: string; designs: SavedDesign[]; branding: any }>(leadsCacheKey);
  const clientTimezone = useClientTimezone();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [designs, setDesigns] = useState<SavedDesign[]>(() => cachedLeads?.designs ?? []);
  
  const [loading, setLoading] = useState(() => !cachedLeads);
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilters, setSourceFilters] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || "all");
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const isPickingEndRef = useRef(false);
  const [selectedDesign, setSelectedDesign] = useState<SavedDesign | null>(null);
  const [crmDialogOpen, setCrmDialogOpen] = useState(false);
  const [clientId, setClientId] = useState<string | null>(() => cachedLeads?.clientId ?? null);
  const [clientBranding, setClientBranding] = useState<any>(() => cachedLeads?.branding ?? null);
  // Keep the cached copy in step with local edits (status changes, deletes).
  useEffect(() => {
    if (loading || !clientId) return;
    setPageCache(leadsCacheKey, { clientId, designs, branding: clientBranding });
  }, [designs, clientBranding, clientId, loading, leadsCacheKey]);
  const [widgetLeadImages, setWidgetLeadImages] = useState<string[]>([]);
  const [widgetImageLoading, setWidgetImageLoading] = useState(false);
  const [grillPreviewImages, setGrillPreviewImages] = useState<Array<{ image_url: string; feedback: string | null }>>([]);
  const [grillPreviewLoading, setGrillPreviewLoading] = useState(false);
  const [enquiryPreviewImages, setEnquiryPreviewImages] = useState<Array<{ image_url: string; feedback: string | null }>>([]);
  const [enquiryPreviewLoading, setEnquiryPreviewLoading] = useState(false);
  const [ringPreviewImages, setRingPreviewImages] = useState<Array<{ image_url: string; feedback: string | null }>>([]);
  const [ringPreviewLoading, setRingPreviewLoading] = useState(false);
  
  // Status tags
  const { tags: leadStatusTags, addTag: addLeadTag, deleteTag: deleteLeadTag, getTagColor: getLeadTagColor } = useClientStatusTags(clientId, 'leads');
  const { currency } = useClientCurrency(clientId);

  // Customer Hub (sandbox only)
  const isUnifiedHub = clientId === SANDBOX_CLIENT_ID;
  const { customers: hubCustomers, loading: hubLoading, refetch: hubRefetch } = useCustomerHub(isUnifiedHub ? clientId : null);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerProfile | null>(null);
  const [deepLinkActivityId, setDeepLinkActivityId] = useState<string | null>(null);

  const resetLeadPreviewState = useCallback(() => {
    setWidgetLeadImages([]);
    setWidgetImageLoading(false);
    setGrillPreviewImages([]);
    setGrillPreviewLoading(false);
    setEnquiryPreviewImages([]);
    setEnquiryPreviewLoading(false);
    setRingPreviewImages([]);
    setRingPreviewLoading(false);
  }, []);

  const buildSelectedDesignFromActivity = useCallback((activity: CustomerActivity): SavedDesign | null => {
    switch (activity.source) {
      case 'widget':
      case 'grill_form':
      case 'custom_enquiry':
      case 'ring_builder':
      case 'booking':
      case 'metal_iq':
        return {
          id: activity.id,
          customer_name: activity.customerName,
          customer_email: activity.customerEmail,
          customer_phone: activity.customerPhone,
          follow_up_status: activity.status,
          created_at: activity.created_at,
          product_name: activity.productName || null,
          notes: activity.notes || null,
          configuration: activity.configuration || {},
          source: activity.source,
        };
      default:
        return null;
    }
  }, []);

  const handleSelectCustomerActivity = useCallback((activity: CustomerActivity | null) => {
    if (!activity) {
      resetLeadPreviewState();
      setSelectedDesign(null);
      return;
    }

    const mappedDesign = buildSelectedDesignFromActivity(activity);

    if (!mappedDesign) {
      resetLeadPreviewState();
      setSelectedDesign(null);
      return;
    }

    setWidgetLeadImages([]);
    setGrillPreviewImages([]);
    setEnquiryPreviewImages([]);
    setRingPreviewImages([]);
    setWidgetImageLoading(mappedDesign.source === 'widget');
    setGrillPreviewLoading(mappedDesign.source === 'grill_form');
    setEnquiryPreviewLoading(mappedDesign.source === 'custom_enquiry');
    setRingPreviewLoading(mappedDesign.source === 'ring_builder');
    setSelectedDesign(mappedDesign);
  }, [buildSelectedDesignFromActivity, resetLeadPreviewState]);

  const openCustomerProfile = useCallback((customer: CustomerProfile, preferredActivityId?: string | null) => {
    const preferredActivity = preferredActivityId
      ? customer.activities.find(activity => activity.id === preferredActivityId)
      : undefined;
    const initialActivity = preferredActivity || customer.activities[0] || null;

    setDeepLinkActivityId(preferredActivityId || null);
    setSelectedCustomer(customer);
    handleSelectCustomerActivity(initialActivity);
  }, [handleSelectCustomerActivity]);

  // ── Browser-history-backed detail views ──
  // The open lead (?lead=<id>) / hub customer (?customer=<email>) lives in the
  // URL so the browser Back gesture (trackpad two-finger swipe, mouse back
  // button, Alt+←) closes the detail view and lands on the Leads list instead
  // of leaving the page. Entries we push carry `detailPushed` in history state
  // so the in-page Back button pops them rather than stacking new entries.
  const setDetailParam = useCallback((key: 'lead' | 'customer', value: string | null, mode: 'push' | 'replace', drop: string[] = []) => {
    const next = new URLSearchParams(searchParams);
    drop.forEach(k => next.delete(k));
    if (value) next.set(key, value); else next.delete(key);
    const pushed = mode === 'push' || Boolean((location.state as any)?.detailPushed);
    setSearchParams(next, { replace: mode === 'replace', state: value && pushed ? { detailPushed: true } : null });
  }, [searchParams, setSearchParams, location.state]);

  const closeDetailViaHistory = useCallback((key: 'lead' | 'customer') => {
    if ((location.state as any)?.detailPushed) navigate(-1);
    else setDetailParam(key, null, 'replace');
  }, [location.state, navigate, setDetailParam]);

  const openLead = useCallback((design: SavedDesign, mode: 'push' | 'replace' = 'push') => {
    setSelectedDesign(design);
    if (searchParams.get('lead') !== design.id) setDetailParam('lead', design.id, mode);
  }, [searchParams, setDetailParam]);

  // Handle ?email= deep-link for Customer Hub
  useEffect(() => {
    if (!isUnifiedHub || hubLoading || !hubCustomers.length) return;
    const emailParam = searchParams.get('email');
    if (emailParam && !selectedCustomer) {
      const match = hubCustomers.find(c => c.email.toLowerCase() === emailParam.toLowerCase());
      if (match) {
        openCustomerProfile(match);
        setDetailParam('customer', match.email, 'replace', ['email']);
      }
    }
  }, [isUnifiedHub, hubLoading, hubCustomers, searchParams, selectedCustomer, openCustomerProfile, setDetailParam]);

  // Handle ?lead= deep-link for Customer Hub (find the customer who owns that activity)
  useEffect(() => {
    if (!isUnifiedHub || hubLoading || !hubCustomers.length) return;
    const leadId = searchParams.get('lead');
    if (leadId && !selectedCustomer) {
      for (const customer of hubCustomers) {
        const found = customer.activities.find(a => a.id === leadId);
        if (found) {
          openCustomerProfile(customer, leadId);
          setDetailParam('customer', customer.email, 'replace', ['lead']);
          break;
        }
      }
    }
  }, [isUnifiedHub, hubLoading, hubCustomers, searchParams, selectedCustomer, openCustomerProfile, setDetailParam]);

  // Customer Hub: keep the open customer in sync with ?customer= (Back/Forward)
  const customerParam = searchParams.get('customer');
  useEffect(() => {
    if (!isUnifiedHub) return;
    if (!customerParam) {
      if (selectedCustomer && !searchParams.get('email') && !searchParams.get('lead')) {
        setSelectedCustomer(null);
        setDeepLinkActivityId(null);
        handleSelectCustomerActivity(null);
      }
      return;
    }
    if (selectedCustomer?.email.toLowerCase() === customerParam.toLowerCase() || hubLoading) return;
    const match = hubCustomers.find(c => c.email.toLowerCase() === customerParam.toLowerCase());
    if (match) openCustomerProfile(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnifiedHub, customerParam, hubLoading, hubCustomers]);

  // Export functionality state
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Register page search items
  const leadSearchItems = useMemo(() =>
    designs.map(d => ({
      id: d.id,
      label: d.customer_name || d.customer_email,
      description: `${d.customer_email} · ${d.source}`,
      icon: Eye,
      category: d.follow_up_status,
      action: () => openLead(d),
    })),
    [designs]
  );
  usePageSearchRegistration('Leads & Bookings', leadSearchItems);

  // Build email-to-submissions map for repeat customer detection
  const emailSubmissionsMap = useMemo(() => {
    const map: Record<string, Array<{ id: string; source: string; created_at: string; follow_up_status: string; customer_name: string }>> = {};
    for (const d of designs) {
      const email = d.customer_email?.toLowerCase();
      if (!email) continue;
      if (!map[email]) map[email] = [];
      map[email].push({ id: d.id, source: d.source, created_at: d.created_at, follow_up_status: d.follow_up_status, customer_name: d.customer_name });
    }
    return map;
  }, [designs]);

  // Fetch actual CDN image for widget leads when dialog opens
  useEffect(() => {
    if (!selectedDesign || selectedDesign.source !== 'widget' || !selectedDesign.configuration) {
      setWidgetLeadImages([]);
      return;
    }

    const config = selectedDesign.configuration;
    const { style, shank, metal, shape } = config;
    if (!style || !shank || !shape) {
      setWidgetLeadImages([]);
      return;
    }

    let colorFamily = getColorFamilyFromMetal(metal);
    const fetchImage = async () => {
      setWidgetImageLoading(true);
      try {
        if (!colorFamily && metal && clientId) {
          const { data: cmv } = await supabase
            .from('client_metal_variants')
            .select('color_family')
            .eq('client_id', clientId)
            .ilike('variant_name', metal.replace(/-/g, ' '))
            .limit(1)
            .maybeSingle();
          if (cmv?.color_family) colorFamily = cmv.color_family;
        }
        if (!colorFamily) { setWidgetLeadImages([]); return; }

        // Slugify config values — they may be display names ("Castel Pavé") or IDs ("castel-pave")
        const styleSlug = slugify(style);
        const shankSlug = slugify(shank);
        const shapeSlug = slugify(shape);
        const combinationId = `${styleSlug}-${shankSlug}-${colorFamily}-${shapeSlug}`;
        const folderPath = `rings/${styleSlug}/${shankSlug}/${colorFamily}/${shapeSlug}`;

        // Try combination_id first, then folder_path
        let data: any = null;
        const { data: d1 } = await supabase
          .from('my_master_db_data')
          .select('folder_path, image_0_filename, image_1_filename, image_2_filename, image_3_filename, image_url_0')
          .eq('combination_id', combinationId)
          .limit(1)
          .maybeSingle();
        data = d1;
        
        if (!data) {
          const { data: d2 } = await supabase
            .from('my_master_db_data')
            .select('folder_path, image_0_filename, image_1_filename, image_2_filename, image_3_filename, image_url_0')
            .eq('folder_path', folderPath)
            .limit(1)
            .maybeSingle();
          data = d2;
        }

        if (data?.folder_path) {
          const filenames = [data.image_0_filename, data.image_1_filename, data.image_2_filename, data.image_3_filename];
          const urls = filenames
            .filter((f): f is string => Boolean(f))
            .map(f => constructCdnImageUrl(data.folder_path, f))
            .filter((u): u is string => Boolean(u));
          setWidgetLeadImages(urls.length > 0 ? urls : (data as any)?.image_url_0 ? [(data as any).image_url_0] : []);
        } else if ((data as any)?.image_url_0) {
          setWidgetLeadImages([(data as any).image_url_0]);
        } else {
          setWidgetLeadImages([]);
        }
      } catch {
        setWidgetLeadImages([]);
      } finally {
        setWidgetImageLoading(false);
      }
    };

    fetchImage();
  }, [selectedDesign, clientId]);

  // Fetch AI preview images for grill_form leads
  useEffect(() => {
    if (!selectedDesign || selectedDesign.source !== 'grill_form') {
      setGrillPreviewImages([]);
      return;
    }

    const fetchPreviews = async () => {
      setGrillPreviewLoading(true);
      try {
        const { data, error } = await supabase
          .from('grill_preview_images')
          .select('image_url, generation_number, feedback, custom_instruction')
          .eq('lead_id', selectedDesign.id)
          .order('generation_number', { ascending: true });

        if (!error && data && data.length > 0) {
          setGrillPreviewImages(data.map((d: any) => ({ image_url: d.image_url, feedback: d.feedback, custom_instruction: d.custom_instruction })));
        } else {
          const fallback = selectedDesign.configuration?.ai_preview_url;
          setGrillPreviewImages(fallback ? [{ image_url: fallback, feedback: null }] : []);
        }
      } catch {
        setGrillPreviewImages([]);
      } finally {
        setGrillPreviewLoading(false);
      }
    };

    fetchPreviews();
  }, [selectedDesign]);

  // Fetch AI preview images for custom_enquiry leads
  useEffect(() => {
    if (!selectedDesign || selectedDesign.source !== 'custom_enquiry') {
      setEnquiryPreviewImages([]);
      return;
    }

    const fetchPreviews = async () => {
      setEnquiryPreviewLoading(true);
      try {
        const { data, error } = await supabase
          .from('custom_enquiry_preview_images')
          .select('image_url, generation_number, feedback, custom_instruction')
          .eq('lead_id', selectedDesign.id)
          .order('generation_number', { ascending: true });

        if (!error && data && data.length > 0) {
          setEnquiryPreviewImages(data.map((d: any) => ({ image_url: d.image_url, feedback: d.feedback, custom_instruction: d.custom_instruction })));
        } else {
          const fallback = selectedDesign.configuration?.ai_preview_url;
          setEnquiryPreviewImages(fallback ? [{ image_url: fallback, feedback: null }] : []);
        }
      } catch {
        setEnquiryPreviewImages([]);
      } finally {
        setEnquiryPreviewLoading(false);
      }
    };

    fetchPreviews();
  }, [selectedDesign]);

  // Fetch AI preview images for ring_builder leads
  useEffect(() => {
    if (!selectedDesign || selectedDesign.source !== 'ring_builder') {
      setRingPreviewImages([]);
      return;
    }

    const fetchPreviews = async () => {
      setRingPreviewLoading(true);
      try {
        const { data, error } = await (supabase as any)
          .from('ring_preview_images')
          .select('image_url, generation_number, feedback, custom_instruction')
          .eq('lead_id', selectedDesign.id)
          .order('generation_number', { ascending: true });

        if (!error && data && data.length > 0) {
          setRingPreviewImages(data.map((d: any) => ({ image_url: d.image_url, feedback: d.feedback, custom_instruction: d.custom_instruction })));
        } else {
          setRingPreviewImages([]);
        }
      } catch {
        setRingPreviewImages([]);
      } finally {
        setRingPreviewLoading(false);
      }
    };

    fetchPreviews();
  }, [selectedDesign]);

  // Check if user has edit access (clients always have it, staff needs leads_access OR 'edit' catalog access)
  const hasEditAccess = role !== 'staff' || 
    staffInfo?.permissions?.leads_access === true ||
    String(staffInfo?.permissions?.catalog_access).toLowerCase() === 'edit';

  useEffect(() => {
    // In impersonation mode, wait until the impersonated clientId is available
    if (isImpersonating && !impersonatedClientId) return;
    // Staff: wait until the role and staff record (with its client ID) are loaded.
    // Right after login the role can arrive before staffInfo; fetching then finds
    // no client and the list stayed empty ("No leads found") until a refresh.
    if (!isImpersonating && (role === null || (role === 'staff' && !staffInfo?.clientId))) return;
    fetchDesigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, role, staffInfo?.clientId, isImpersonating, impersonatedClientId]);

  // All lead tables (saved_designs, grill_form_leads, etc.) were dropped from the
  // supabase_realtime publication. Use 45s polling + focus refresh instead.
  useEffect(() => {
    if (!clientId) return;
    const id = setInterval(() => fetchDesigns(), 45000);
    const onFocus = () => fetchDesigns();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [clientId]);

  const fetchDesigns = async () => {
    try {
      let effectiveClientId: string | null = null;

      // If impersonating, use the impersonated client ID directly
      if (isImpersonating && impersonatedClientId) {
        effectiveClientId = impersonatedClientId;
      } else if (role === 'staff' && staffInfo?.clientId) {
        // Staff member - use client ID from staffInfo
        effectiveClientId = staffInfo.clientId;
      } else {
        // Otherwise, get client ID for current user
        // Cached per session; not all authenticated users have a client row (e.g. agency admins)
        effectiveClientId = await resolveOwnClientId(user?.id);
      }

      if (!effectiveClientId) return;
      
      setClientId(effectiveClientId);

      // Fetch client branding config for the "Test in New Tab" button (runs alongside the lead queries)
      const brandingPromise = (async () => {
        const { data: clientConfig } = await supabase
          .from("clients")
          .select("company_name, branding_config, widget_theme, email")
          .eq("id", effectiveClientId)
          .maybeSingle();
        if (!clientConfig) return null;
        const branding = {
          companyName: clientConfig.company_name,
          email: clientConfig.email,
          ...((clientConfig.branding_config as any) || {}),
          theme: clientConfig.widget_theme || 'luxury',
        };
        setClientBranding(branding);
        return branding;
      })().catch((brandErr) => { console.error('Failed to fetch client branding:', brandErr); return null; });

      // Staff read every lead table through get-staff-leads (service role, staff +
      // Show Leads checked server-side) so the list doesn't depend on per-table RLS.
      // If that function isn't reachable, fall back to the direct queries below.
      let staffLeadRows: Record<string, any[]> | null = null;
      if (!isImpersonating && role === 'staff') {
        try {
          const { data: res, error: fnErr } = await supabase.functions.invoke('get-staff-leads', {
            body: { clientId: effectiveClientId },
          });
          if (!fnErr && (res as any)?.tables) staffLeadRows = (res as any).tables;
          else console.error('get-staff-leads failed, using direct queries:', fnErr || (res as any)?.error);
        } catch (fnErr) {
          console.error('get-staff-leads failed, using direct queries:', fnErr);
        }
      }
      const loadLeadRows = async (table: string, limit?: number): Promise<{ data: any[] | null; error: any }> => {
        if (staffLeadRows) return { data: staffLeadRows[table] || [], error: null };
        let query = supabase
          .from(table as any)
          .select("*")
          .eq("client_id", effectiveClientId!)
          .order("created_at", { ascending: false });
        if (limit) query = query.limit(limit);
        const { data, error } = await query;
        return { data: data as any[] | null, error };
      };

      // Fetch widget leads
      const widgetLeadsPromise = (async (): Promise<SavedDesign[]> => {
      let widgetLeads: SavedDesign[] = [];
      if (isImpersonating) {
        const { data: res, error: fnErr } = await supabase.functions.invoke('get-client-saved-designs', {
          body: { clientId: effectiveClientId, limit: 500 },
        });
        if (fnErr) throw fnErr;
        widgetLeads = ((res as any)?.designs || []).map((d: any) => ({ ...d, source: 'widget' as const }));
      } else {
        const { data, error } = await loadLeadRows("saved_designs", 500);
        if (error) throw error;
        widgetLeads = (data || []).map((d: any) => ({ ...d, source: 'widget' as const }));
      }
      return widgetLeads;
      })();

      // Fetch Quote Estimator (diamond) form leads for any client that uses the form.
      // Filtered by client_id, so a client only ever sees its own leads (empty if unused).
      const diamondLeadsPromise = (async (): Promise<SavedDesign[]> => {
      let diamondLeads: SavedDesign[] = [];
      if (effectiveClientId) {
        try {
          const { data: dData, error: dError } = await loadLeadRows("diamond_form_leads", 500);
          if (!dError && dData) {
            diamondLeads = dData.map((d: any) => ({
              id: d.id,
              customer_name: d.first_name || 'Unknown',
              customer_email: d.email || '',
              customer_phone: d.phone_number ? `${d.country_code || ''}${d.phone_number}` : null,
              follow_up_status: d.follow_up_status || 'new',
              created_at: d.created_at,
              product_name: [d.diamond_type, d.diamond_shape, d.diamond_metal].filter(Boolean).map((v: any) => String(v).replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())).join(' · ') || 'Diamond Ring',
              notes: d.other_details || null,
              configuration: {
                diamond_type: d.diamond_type,
                diamond_shape: d.diamond_shape,
                diamond_size: d.diamond_size,
                diamond_quality: d.diamond_quality,
                selected_diamond: d.selected_diamond ?? null,
                diamond_setting: d.diamond_setting,
                diamond_holder: d.diamond_holder,
                diamond_band: d.diamond_band,
                diamond_band_width: d.diamond_band_width,
                diamond_metal: d.diamond_metal,
                diamond_personalization: d.diamond_personalization,
                ring_size: d.ring_size,
                diamond_timeline: d.diamond_timeline,
                estimated_total: d.estimated_total,
                inspiration_image_urls: d.inspiration_image_urls,
              },
              device_info: d.device_info ?? null,
              source: 'diamond_form' as const,
            }));
          }
        } catch (dErr) {
          console.error('Failed to fetch diamond form leads:', dErr);
        }
      }
      return diamondLeads;
      })();

      // Fetch grill form leads
      const grillLeadsPromise = (async (): Promise<SavedDesign[]> => {
      let grillLeads: SavedDesign[] = [];
      try {
        const { data: gData, error: gError } = await loadLeadRows("grill_form_leads");
        if (!gError && gData) {
          grillLeads = gData.map((g: any) => ({
            id: g.id,
            customer_name: g.customer_name || 'Grillz Customer',
            customer_email: g.customer_email || '',
            customer_phone: g.customer_phone || null,
            follow_up_status: g.follow_up_status || 'new',
            created_at: g.created_at,
            product_name: [g.metal_type, g.metal_purity, g.top_teeth !== 'none' ? `Top: ${g.top_teeth}` : null, g.bottom_teeth !== 'none' ? `Bottom: ${g.bottom_teeth}` : null].filter(Boolean).map((v: any) => String(v).replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())).join(' · ') || 'Custom Grillz',
            notes: g.additional_notes || null,
            configuration: {
              grillz_type: g.grillz_type,
              metal_type: g.metal_type,
              metal_purity: g.metal_purity,
              top_teeth: g.top_teeth,
              bottom_teeth: g.bottom_teeth,
              question_answers: g.question_answers,
              budget: g.budget,
              engraving_text: g.engraving_text,
              additional_notes: g.additional_notes,
              uploaded_image_urls: g.uploaded_image_urls,
              ai_preview_url: g.ai_preview_url,
            },
            device_info: g.device_info ?? null,
            source: 'grill_form' as const,
          }));
        }
      } catch (gErr) {
        console.error('Failed to fetch grill form leads:', gErr);
      }
      return grillLeads;
      })();

      // Fetch custom enquiry leads
      const enquiryLeadsPromise = (async (): Promise<SavedDesign[]> => {
      let enquiryLeads: SavedDesign[] = [];
      try {
        const { data: eData, error: eError } = await loadLeadRows("custom_enquiry_leads");
        if (!eError && eData) {
          enquiryLeads = eData.map((e: any) => ({
            id: e.id,
            customer_name: e.customer_name || 'Custom Enquiry Customer',
            customer_email: e.customer_email || '',
            customer_phone: e.customer_phone || null,
            follow_up_status: e.follow_up_status || 'new',
            created_at: e.created_at,
            product_name: [e.jewelry_type, e.gold_color, e.karat].filter(Boolean).map((v: any) => String(v).replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())).join(' · ') || 'Custom Enquiry',
            notes: e.additional_notes || e.description || null,
            configuration: {
              jewelry_type: e.jewelry_type,
              budget: e.budget,
              gold_color: e.gold_color,
              karat: e.karat,
              diamond_quality: e.diamond_quality,
              diamond_setup: e.diamond_setup,
              back_option: e.back_option,
              
              description: e.description,
              timeline: e.timeline,
              engraving_text: e.engraving_text,
              question_answers: e.question_answers,
              additional_notes: e.additional_notes,
              uploaded_image_urls: e.uploaded_image_urls,
              ai_preview_url: e.ai_preview_url,
            },
            device_info: e.device_info ?? null,
            source: 'custom_enquiry' as const,
          }));
        }
      } catch (eErr) {
        console.error('Failed to fetch custom enquiry leads:', eErr);
      }
      return enquiryLeads;
      })();

      // Fetch ring builder leads (design_requests)
      const ringBuilderLeadsPromise = (async (): Promise<SavedDesign[]> => {
      let ringBuilderLeads: SavedDesign[] = [];
      try {
        const { data: rbData, error: rbError } = await loadLeadRows("design_requests");
        if (!rbError && rbData) {
          ringBuilderLeads = rbData.map((r: any) => ({
            id: r.id,
            customer_name: r.customer_name || 'Ring Builder Customer',
            customer_email: r.customer_email || '',
            customer_phone: r.customer_phone || null,
            follow_up_status: r.follow_up_status || 'new',
            created_at: r.created_at,
            product_name: [r.request_type, r.preferred_metal || r.metal_preference, r.preferred_stone || r.stone_preference].filter(Boolean).map((v: string) => v.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())).join(' · ') || 'Custom Ring Design',
            notes: r.special_requirements || null,
            configuration: {
              request_type: r.request_type,
              description: r.description,
              preferred_style: r.preferred_style,
              preferred_metal: r.preferred_metal,
              metal_preference: r.metal_preference,
              preferred_stone: r.preferred_stone,
              stone_preference: r.stone_preference,
              budget_range: r.budget_range,
              timeline: r.timeline,
              size: r.size,
              reference_images: r.reference_images,
              priority: r.priority,
              status: r.status,
              admin_notes: r.admin_notes,
            },
            device_info: r.device_info ?? null,
            source: 'ring_builder' as const,
          }));
        }
      } catch (rbErr) {
        console.error('Failed to fetch ring builder leads:', rbErr);
      }
      return ringBuilderLeads;
      })();

      // Fetch appointment bookings
      const bookingLeadsPromise = (async (): Promise<SavedDesign[]> => {
      let bookingLeads: SavedDesign[] = [];
      try {
        const { data: bData, error: bError } = await loadLeadRows("appointment_bookings");
        if (!bError && bData) {
          bookingLeads = (bData as any[]).map((b: any) => ({
            id: b.id,
            customer_name: b.customer_name || 'Booking Customer',
            customer_email: b.customer_email || '',
            customer_phone: b.customer_phone || null,
            follow_up_status: b.follow_up_status || b.status || 'new',
            created_at: b.created_at,
            product_name: (() => {
              const rc = b.ring_configuration;
              const source = rc?.source;
              if (source === 'metal_iq') return 'Metal IQ Booking';
              return buildProductNameFromConfig(rc) || 'Appointment Booking';
            })(),
            notes: b.message || null,
            configuration: {
              ...(b.ring_configuration || {}),
              preferred_date: b.preferred_date,
              preferred_time: b.preferred_time,
              customer_timezone: b.customer_timezone,
              booking_status: b.status,
            },
            device_info: b.device_info ?? null,
            source: 'booking' as const,
          }));
        }
      } catch (bErr) {
        console.error('Failed to fetch booking leads:', bErr);
      }
      return bookingLeads;
      })();

      // Fetch metal buying leads (Metal IQ)
      const metalIQLeadsPromise = (async (): Promise<SavedDesign[]> => {
      let metalIQLeads: SavedDesign[] = [];
      try {
        const { data: mData, error: mError } = await loadLeadRows("metal_buying_leads");
        if (!mError && mData) {
          const PURITY_FACTORS: Record<string, number> = {
            '8k': 0.333, '9k': 0.375, '10k': 0.417, '12k': 0.500,
            '14k': 0.583, '18k': 0.750, '21k': 0.875, '22k': 0.916, '24k': 0.999,
            '800': 0.800, '835': 0.835, '900': 0.900, '925': 0.925, '950': 0.950, '999': 0.999,
            '850': 0.850, '900pt': 0.900, '950pt': 0.950, '999pt': 0.999,
          };
          metalIQLeads = (mData as any[]).map((m: any) => {
            const karatKey = m.karat?.toLowerCase().replace(/\s/g, '') ?? '';
            const purity = PURITY_FACTORS[karatKey] ?? null;
            const spotPerGram = m.spot_price_at_time ? m.spot_price_at_time / 31.1035 : null;
            const pureValue = m.weight_grams && spotPerGram && purity ? m.weight_grams * spotPerGram * purity : null;
            return {
              id: m.id,
              customer_name: m.customer_name || 'Metal IQ Customer',
              customer_email: m.customer_email || '',
              customer_phone: m.customer_phone || null,
              follow_up_status: m.status || 'new',
              created_at: m.created_at,
              product_name: [m.metal_type?.charAt(0).toUpperCase() + m.metal_type?.slice(1), m.karat, m.weight_grams ? `${m.weight_grams}g` : null].filter(Boolean).join(' · ') || 'Metal Inquiry',
              notes: null,
              configuration: {
                metal_type: m.metal_type,
                karat: m.karat,
                weight_grams: m.weight_grams,
                estimated_offer: m.estimated_offer,
                competitor_offer: m.competitor_offer,
                estimated_profit: m.estimated_profit,
                spot_price_at_time: m.spot_price_at_time,
                spot_price_date: m.spot_price_date,
                buy_percentage: m.buy_percentage,
                lead_score: m.lead_score,
                location: m.location,
                country_iso: m.country_iso,
                knows_karat: m.knows_karat,
                knows_weight: m.knows_weight,
                knows_authentic: m.knows_authentic,
                is_authentic: m.is_authentic,
                photo_urls: m.photo_urls,
                currency: m.currency || 'USD',
                // Computed values for LeadDetailView
                spot_price_per_gram: spotPerGram ? spotPerGram.toFixed(2) : null,
                pure_metal_value: pureValue ? pureValue.toFixed(2) : null,
                our_offer: m.estimated_offer,
              },
              device_info: m.device_info ?? null,
              source: 'metal_iq' as const,
            };
          });
        }
      } catch (mErr) {
        console.error('Failed to fetch metal buying leads:', mErr);
      }
      return metalIQLeads;
      })();

      const [widgetLeads, diamondLeads, grillLeads, enquiryLeads, ringBuilderLeads, bookingLeads, metalIQLeads, branding] = await Promise.all([
        widgetLeadsPromise, diamondLeadsPromise, grillLeadsPromise, enquiryLeadsPromise,
        ringBuilderLeadsPromise, bookingLeadsPromise, metalIQLeadsPromise, brandingPromise,
      ]);

      // Merge and sort by date
      const allLeads = [...widgetLeads, ...diamondLeads, ...grillLeads, ...enquiryLeads, ...ringBuilderLeads, ...bookingLeads, ...metalIQLeads].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setDesigns(allLeads);
      setPageCache(leadsCacheKey, { clientId: effectiveClientId, designs: allLeads, branding });
    } catch (error: any) {
      toast.error("Failed to load leads");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Keep the open lead in sync with ?lead= so browser Back/Forward (incl. the
  // trackpad swipe) closes/reopens the detail view. The hub owns its own params.
  const leadParam = searchParams.get('lead');
  useEffect(() => {
    if (isUnifiedHub) return;
    if (!leadParam) {
      if (selectedDesign) setSelectedDesign(null);
      return;
    }
    if (selectedDesign?.id === leadParam) return;
    const found = designs.find(d => d.id === leadParam);
    if (found) setSelectedDesign(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnifiedHub, leadParam, designs]);

  const filteredDesigns = designs.filter((design) => {
    const matchesSearch =
      design.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      design.customer_email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesSource = sourceFilters.size === 0 || sourceFilters.has(design.source);
    const matchesStatus = statusFilter === "all" || design.follow_up_status === statusFilter;

    const matchesDate = !dateRange.from || (() => {
      const d = new Date(design.created_at);
      const from = dateRange.from!;
      const to = dateRange.to || new Date();
      return d >= from && d <= to;
    })();

    return matchesSearch && matchesSource && matchesStatus && matchesDate;
  });

  const getStatusColor = (status: string) => {
    return getLeadTagColor(status);
  };

  const handleStatusChange = async (design: SavedDesign, newStatus: string) => {
    try {
      let error: any = null;
      switch (design.source) {
        case 'widget':
          ({ error } = await supabase.from('saved_designs').update({ follow_up_status: newStatus }).eq('id', design.id));
          break;
        case 'diamond_form':
          ({ error } = await supabase.from('diamond_form_leads').update({ follow_up_status: newStatus } as any).eq('id', design.id));
          break;
        case 'grill_form':
          ({ error } = await supabase.from('grill_form_leads').update({ follow_up_status: newStatus } as any).eq('id', design.id));
          break;
        case 'custom_enquiry':
          ({ error } = await supabase.from('custom_enquiry_leads').update({ follow_up_status: newStatus } as any).eq('id', design.id));
          break;
        case 'ring_builder':
          ({ error } = await supabase.from('design_requests').update({ follow_up_status: newStatus } as any).eq('id', design.id));
          break;
        case 'booking':
          ({ error } = await supabase.from('appointment_bookings').update({ follow_up_status: newStatus } as any).eq('id', design.id));
          break;
        case 'metal_iq':
          ({ error } = await supabase.from('metal_buying_leads').update({ status: newStatus } as any).eq('id', design.id));
          break;
        default:
          return;
      }

      if (error) throw error;

      // Re-fetch to confirm persisted
      setDesigns(prev => prev.map(d => 
        d.id === design.id ? { ...d, follow_up_status: newStatus } : d
      ));
    } catch (err) {
      console.error('Failed to update status:', err);
      toast.error('Failed to update status');
    }
  };

  const handleConnectCRM = () => {
    toast.info("CRM MVMNT integration coming soon!");
    setCrmDialogOpen(false);
  };

  const handleDeleteLead = async (designId: string) => {
    try {
      // Find the design to be deleted (for notification purposes)
      const designToDelete = designs.find((d) => d.id === designId);
      
      // Check if current user is a staff member
      let isStaffMember = false;
      let staffInfo: { name: string; email: string; client_id: string } | null = null;
      
      if (user) {
        const { data: staffData } = await supabase
          .from("staff_members")
          .select("name, email, client_id")
          .eq("user_id", user.id)
          .maybeSingle();
        
        if (staffData) {
          isStaffMember = true;
          staffInfo = staffData;
        }
      }

      // Delete from the correct table based on source
      const designToDeleteSource = designToDelete?.source;
      let deleteTable: string = 'saved_designs';
      if (designToDeleteSource === 'diamond_form') deleteTable = 'diamond_form_leads';
      else if (designToDeleteSource === 'grill_form') deleteTable = 'grill_form_leads';
      else if (designToDeleteSource === 'custom_enquiry') deleteTable = 'custom_enquiry_leads';
      else if (designToDeleteSource === 'ring_builder') deleteTable = 'design_requests';
      else if (designToDeleteSource === 'booking') deleteTable = 'appointment_bookings';
      else if (designToDeleteSource === 'metal_iq') deleteTable = 'metal_buying_leads';

      const { error } = await supabase
        .from(deleteTable as any)
        .delete()
        .eq("id", designId);

      if (error) throw error;

      // Notify about lead deletion (staff or client owner)
      if (designToDelete) {
        try {
          // Determine actor info
          let actorName = "Account Owner";
          let actorEmail = user?.email || "";
          let actorClientId = "";

          if (isStaffMember && staffInfo) {
            actorName = staffInfo.name;
            actorEmail = staffInfo.email;
            actorClientId = staffInfo.client_id;
          } else if (user) {
            // Client owner — get their client record
            const { data: clientData } = await supabase
              .from("clients")
              .select("id, company_name")
              .eq("user_id", user.id)
              .maybeSingle();
            if (clientData) {
              actorClientId = clientData.id;
              actorName = clientData.company_name || "Account Owner";
            }
          }

          if (actorClientId) {
            await supabase.functions.invoke("notify-lead-deleted", {
              body: {
                client_id: actorClientId,
                staff_name: actorName,
                staff_email: actorEmail,
                deleted_lead: {
                  customer_name: designToDelete.customer_name,
                  customer_email: designToDelete.customer_email,
                  customer_phone: designToDelete.customer_phone,
                  product_name: designToDelete.product_name,
                  follow_up_status: designToDelete.follow_up_status,
                  created_at: designToDelete.created_at,
                  notes: designToDelete.notes,
                  configuration: designToDelete.configuration,
                },
              },
            });
          }
        } catch (notifyError) {
          console.error("Failed to send deletion notification:", notifyError);
        }
      }

      setDesigns(designs.filter((d) => d.id !== designId));
      // Clear from selection if selected
      setSelectedLeads((prev) => {
        const next = new Set(prev);
        next.delete(designId);
        return next;
      });
      toast.success("Lead deleted successfully");
    } catch (error: any) {
      toast.error("Failed to delete lead");
      console.error(error);
    }
  };

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedLeads(new Set(filteredDesigns.map((d) => d.id)));
    } else {
      setSelectedLeads(new Set());
    }
  };

  const handleSelectLead = (leadId: string, checked: boolean) => {
    setSelectedLeads((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(leadId);
      } else {
        next.delete(leadId);
      }
      return next;
    });
  };

  const isAllSelected = filteredDesigns.length > 0 && filteredDesigns.every((d) => selectedLeads.has(d.id));
  const isSomeSelected = selectedLeads.size > 0;

  // Export handler
  const handleExportLeads = async (exportAll: boolean) => {
    if (!clientId) {
      toast.error("Client ID not found");
      return;
    }

    const recipientEmail = clientBranding?.email || user?.email;
    if (!recipientEmail) {
      toast.error("No email address found for export");
      return;
    }

    setExporting(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-leads", {
        body: {
          clientId,
          leadIds: exportAll ? undefined : Array.from(selectedLeads),
          exportAll,
          recipientEmail,
          recipientName: clientBranding?.companyName,
        },
      });

      if (error) throw error;

      toast.success(`Export email sent to ${recipientEmail}`, {
        description: `${data.leadsCount} lead${data.leadsCount > 1 ? "s" : ""} exported successfully`,
      });
      setExportDialogOpen(false);
      setSelectedLeads(new Set());
    } catch (error: any) {
      console.error("Export error:", error);
      toast.error("Failed to export leads", {
        description: error.message || "Please try again later",
      });
    } finally {
      setExporting(false);
    }
  };

  // Staff guard: client switched "Show Leads" off for this staff member.
  if (role === 'staff' && !staffCanSeeLeads(staffInfo?.permissions)) {
    return <AccessDenied feature="Leads & Bookings" />;
  }

  if (loading && !isUnifiedHub) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
        <div className="flex justify-between items-center">
          <Skeleton className="h-6 sm:h-8 w-32 sm:w-48" />
        </div>
        <Skeleton className="h-24 sm:h-32" />
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <Skeleton className="h-5 sm:h-6 w-24 sm:w-32" />
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            <div className="space-y-3 sm:space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-20 sm:h-16" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Unified Customer Hub for sandbox client
  if (isUnifiedHub) {
    if (selectedCustomer) {
      return (
        <div className="p-4 sm:p-6 lg:p-8">
          <CustomerDetailView
            defaultExpandActivityId={deepLinkActivityId || undefined}
            customer={selectedCustomer}
            clientId={clientId!}
            onBack={() => {
              setSelectedCustomer(null);
              setDeepLinkActivityId(null);
              handleSelectCustomerActivity(null);
              closeDetailViaHistory('customer');
            }}
            hasEditAccess={hasEditAccess}
            leadStatusTags={leadStatusTags}
            getLeadTagColor={getLeadTagColor}
            addLeadTag={addLeadTag}
            deleteLeadTag={deleteLeadTag}
            onStatusUpdate={() => hubRefetch()}
            widgetLeadImages={widgetLeadImages}
            widgetImageLoading={widgetImageLoading}
            grillPreviewImages={grillPreviewImages}
            grillPreviewLoading={grillPreviewLoading}
            enquiryPreviewImages={enquiryPreviewImages}
            enquiryPreviewLoading={enquiryPreviewLoading}
            ringPreviewImages={ringPreviewImages}
            ringPreviewLoading={ringPreviewLoading}
            currency={currency}
            onSelectActivity={handleSelectCustomerActivity}
          />
        </div>
      );
    }
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <CustomerListView
          customers={hubCustomers}
          loading={hubLoading}
          onSelectCustomer={(customer) => { openCustomerProfile(customer); setDetailParam('customer', customer.email, 'push'); }}
          leadStatusTags={leadStatusTags}
          getLeadTagColor={getLeadTagColor}
        />
      </div>
    );
  }

  // When exactly one source is checked, enable source-specific table columns
  const singleSource = sourceFilters.size === 1 ? Array.from(sourceFilters)[0] : null;

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedLeads);
    if (ids.length === 0) return;

    try {
      // Group leads by source table
      const groups: Record<string, string[]> = {};
      for (const id of ids) {
        const design = designs.find(d => d.id === id);
        if (!design) continue;
        let table = 'saved_designs';
        if (design.source === 'diamond_form') table = 'diamond_form_leads';
        else if (design.source === 'grill_form') table = 'grill_form_leads';
        else if (design.source === 'custom_enquiry') table = 'custom_enquiry_leads';
        else if (design.source === 'ring_builder') table = 'design_requests';
        else if (design.source === 'booking') table = 'appointment_bookings';
        else if (design.source === 'metal_iq') table = 'metal_buying_leads';
        if (!groups[table]) groups[table] = [];
        groups[table].push(id);
      }

      // Delete from each table
      for (const [table, tableIds] of Object.entries(groups)) {
        const { error } = await supabase.from(table as any).delete().in('id', tableIds);
        if (error) throw error;
      }

      setDesigns(prev => prev.filter(d => !ids.includes(d.id)));
      setSelectedLeads(new Set());
      toast.success(`Deleted ${ids.length} lead${ids.length !== 1 ? 's' : ''}`);
    } catch (error: any) {
      toast.error('Failed to delete selected leads');
      console.error(error);
    }
  };

  const handleBulkStatusChange = async (newStatus: string) => {
    const ids = Array.from(selectedLeads);
    if (ids.length === 0) return;
    try {
      const groups: Record<string, string[]> = {};
      for (const id of ids) {
        const design = designs.find(d => d.id === id);
        if (!design) continue;
        let table = 'saved_designs';
        if (design.source === 'diamond_form') table = 'diamond_form_leads';
        else if (design.source === 'grill_form') table = 'grill_form_leads';
        else if (design.source === 'custom_enquiry') table = 'custom_enquiry_leads';
        else if (design.source === 'ring_builder') table = 'design_requests';
        else if (design.source === 'booking') table = 'appointment_bookings';
        else if (design.source === 'metal_iq') table = 'metal_buying_leads';
        if (!groups[table]) groups[table] = [];
        groups[table].push(id);
      }
      let totalUpdated = 0;
      for (const [table, tableIds] of Object.entries(groups)) {
        // metal_buying_leads uses `status` column; all other lead tables use `follow_up_status`
        const statusColumn = table === 'metal_buying_leads' ? 'status' : 'follow_up_status';
        const { data, error } = await supabase
          .from(table as any)
          .update({ [statusColumn]: newStatus } as any)
          .in('id', tableIds)
          .select('id');
        if (error) throw error;
        totalUpdated += (data?.length ?? 0);
      }
      if (totalUpdated === 0) {
        toast.error('Status update failed — no rows were updated. You may not have permission.');
        return;
      }
      setDesigns(prev => prev.map(d => ids.includes(d.id) ? { ...d, follow_up_status: newStatus } : d));
      setSelectedLeads(new Set());
      toast.success(`Updated ${totalUpdated} lead${totalUpdated !== 1 ? 's' : ''} to "${newStatus}"`);
    } catch (error: any) {
      toast.error('Failed to update status');
      console.error(error);
    }
  };


  // If a design is selected, show the inline detail view
  if (selectedDesign) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <LeadDetailView
          design={selectedDesign}
          clientId={clientId!}
          onBack={() => closeDetailViaHistory('lead')}
          onStatusChange={(design, newStatus) => {
            handleStatusChange(design, newStatus);
            setSelectedDesign({ ...design, follow_up_status: newStatus });
          }}
          hasEditAccess={hasEditAccess}
          onFieldUpdate={async (designId, field, value) => {
            const design = designs.find(d => d.id === designId);
            if (!design) return;
            const src = design.source as string;
            let table: string = 'saved_designs';
            if (src === 'diamond_form') table = 'diamond_form_leads';
            else if (src === 'grill_form') table = 'grill_form_leads';
            else if (src === 'custom_enquiry') table = 'custom_enquiry_leads';
            else if (src === 'ring_builder') table = 'design_requests';
            else if (src === 'booking') table = 'appointment_bookings';
            else if (src === 'metal_iq') table = 'metal_buying_leads';
            // Map field names to column names per source
            let column = '';
            if (field === 'name') {
              column = design.source === 'diamond_form' ? 'first_name' : 'customer_name';
            } else if (field === 'email') {
              column = design.source === 'diamond_form' ? 'email' : 'customer_email';
            } else if (field === 'phone') {
              column = design.source === 'diamond_form' ? 'phone_number' : 'customer_phone';
            }

            try {
              // Get current value for history
              const oldValue = field === 'name' ? design.customer_name 
                : field === 'email' ? design.customer_email 
                : design.customer_phone || '';

              // Build edit history entry
              const historyEntry = {
                field,
                old_value: oldValue,
                new_value: value,
                edited_at: new Date().toISOString(),
                edited_by: user?.email || 'unknown',
              };

              // Update field + append to edit_history (for tables that have it)
              const updatePayload: Record<string, any> = { [column]: value };
              
              // Tables with edit_history column
              const tablesWithHistory = ['saved_designs', 'diamond_form_leads', 'grill_form_leads', 'custom_enquiry_leads'];
              if (tablesWithHistory.includes(table)) {
                // Fetch current history
                const { data: currentRow } = await supabase.from(table as any).select('edit_history').eq('id', designId).maybeSingle();
                const currentHistory = (currentRow as any)?.edit_history || [];
                updatePayload.edit_history = [...currentHistory, historyEntry];
              }

              const { error } = await supabase.from(table as any).update(updatePayload as any).eq('id', designId);
              if (error) throw error;
              const updatedField = field === 'name' ? 'customer_name' : field === 'email' ? 'customer_email' : 'customer_phone';
              setDesigns(prev => prev.map(d => d.id === designId ? { ...d, [updatedField]: value } : d));
              setSelectedDesign(prev => prev ? { ...prev, [updatedField]: value } : prev);
              toast.success(`${field.charAt(0).toUpperCase() + field.slice(1)} updated`);
            } catch (err: any) {
              toast.error(`Failed to update ${field}`);
              console.error(err);
            }
          }}
          onConfigUpdate={async (designId, configKey, value) => {
            const design = designs.find(d => d.id === designId);
            if (!design) return;
            const src = design.source as string;
            let table: string = 'saved_designs';
            if (src === 'diamond_form') table = 'diamond_form_leads';
            else if (src === 'grill_form') table = 'grill_form_leads';
            else if (src === 'custom_enquiry') table = 'custom_enquiry_leads';
            else if (src === 'ring_builder') table = 'design_requests';

            try {
              const oldConfig = design.configuration || {};
              const updatedConfig = { ...oldConfig, [configKey]: value };

              const historyEntry = {
                field: `config.${configKey}`,
                old_value: oldConfig[configKey] ?? '',
                new_value: value,
                edited_at: new Date().toISOString(),
                edited_by: user?.email || 'unknown',
              };

              const updatePayload: Record<string, any> = { configuration: updatedConfig };
              const tablesWithHistory = ['saved_designs', 'diamond_form_leads', 'grill_form_leads', 'custom_enquiry_leads'];
              if (tablesWithHistory.includes(table)) {
                const { data: currentRow } = await supabase.from(table as any).select('edit_history').eq('id', designId).maybeSingle();
                const currentHistory = (currentRow as any)?.edit_history || [];
                updatePayload.edit_history = [...currentHistory, historyEntry];
              }

              const { error } = await supabase.from(table as any).update(updatePayload as any).eq('id', designId);
              if (error) throw error;
              setDesigns(prev => prev.map(d => d.id === designId ? { ...d, configuration: updatedConfig } : d));
              setSelectedDesign(prev => prev ? { ...prev, configuration: updatedConfig } : prev);
              toast.success(`${configKey} updated`);
            } catch (err: any) {
              toast.error(`Failed to update ${configKey}`);
              console.error(err);
            }
          }}
          leadStatusTags={leadStatusTags}
          getLeadTagColor={getLeadTagColor}
          addLeadTag={addLeadTag}
          deleteLeadTag={deleteLeadTag}
          widgetLeadImages={widgetLeadImages}
          widgetImageLoading={widgetImageLoading}
          grillPreviewImages={grillPreviewImages}
          grillPreviewLoading={grillPreviewLoading}
          enquiryPreviewImages={enquiryPreviewImages}
          enquiryPreviewLoading={enquiryPreviewLoading}
          ringPreviewImages={ringPreviewImages}
          ringPreviewLoading={ringPreviewLoading}
          currency={currency}
          relatedSubmissions={emailSubmissionsMap[selectedDesign.customer_email?.toLowerCase()] || []}
          onSelectRelatedLead={(sub) => {
            const found = designs.find(d => d.id === sub.id);
            if (found) openLead(found, 'replace');
          }}
        />
      </div>
    );
  }



  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6">
      <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Leads & Bookings</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Manage customer leads, saved designs and appointment bookings
          </p>
      </div>

      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by customer name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Status dropdown */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] h-9 text-sm">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="capitalize text-sm">All Status</SelectItem>
                  {leadStatusTags.map((tag) => (
                    <SelectItem key={tag.id} value={tag.tag_name} className="capitalize text-sm">
                      {tag.tag_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Source multi-select popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm font-normal">
                    <Filter className="h-3.5 w-3.5" />
                    {sourceFilters.size === 0
                      ? 'All Sources'
                      : [...sourceFilters].map(v => ({
                          widget: 'Ring OS',
                          diamond_form: 'Quote Estimator',
                          grill_form: 'Grillz',
                          custom_enquiry: 'Custom Enquiry',
                          ring_builder: 'Ring Builder',
                          booking: 'Booking',
                          metal_iq: 'Metal IQ',
                        }[v] || v)).join(', ')}
                    <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-2" align="start">
                  <div className="space-y-1.5">
                    {[
                      { value: 'widget', label: 'Ring OS' },
                      { value: 'diamond_form', label: 'Quote Estimator' },
                      { value: 'grill_form', label: 'Grillz' },
                      { value: 'custom_enquiry', label: 'Custom' },
                      { value: 'ring_builder', label: 'Ring Builder' },
                      { value: 'booking', label: 'Booking' },
                      { value: 'metal_iq', label: 'Metal IQ' },
                    ].map((opt) => (
                      <div key={opt.value} className="flex items-center gap-2 px-1 py-1 rounded hover:bg-muted/50 cursor-pointer"
                        onClick={() => {
                          setSourceFilters(prev => {
                            const next = new Set(prev);
                            if (next.has(opt.value)) next.delete(opt.value);
                            else next.add(opt.value);
                            return next;
                          });
                        }}
                      >
                        <Checkbox
                          id={`source-${opt.value}`}
                          checked={sourceFilters.has(opt.value)}
                          onCheckedChange={() => {}}
                          className="pointer-events-none"
                        />
                        <Label htmlFor={`source-${opt.value}`} className="text-sm cursor-pointer">{opt.label}</Label>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Date range filter */}
              <Popover open={datePopoverOpen} onOpenChange={(open) => {
                setDatePopoverOpen(open);
                if (!open) isPickingEndRef.current = false;
              }}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 gap-1.5 text-sm font-normal">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    {dateRange.from
                      ? dateRange.to
                        ? `${format(dateRange.from, 'MMM d')} – ${format(dateRange.to, 'MMM d')}`
                        : `From ${format(dateRange.from, 'MMM d')}`
                      : 'All Time'}
                    <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start" onInteractOutside={(e) => {
                  if (isPickingEndRef.current) e.preventDefault();
                }}>
                  <div className="flex gap-1.5 p-3 pb-0">
                    {[
                      { label: '7d', days: 7 },
                      { label: '30d', days: 30 },
                      { label: '90d', days: 90 },
                      { label: 'All', days: null as number | null },
                    ].map((opt) => (
                      <Button
                        key={opt.label}
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        onClick={() => {
                          if (opt.days === null) {
                            setDateRange({ from: undefined, to: undefined });
                          } else {
                            setDateRange({ from: startOfDay(subDays(new Date(), opt.days)), to: new Date() });
                          }
                          isPickingEndRef.current = false;
                          setDatePopoverOpen(false);
                        }}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                  <Calendar
                    mode="range"
                    selected={dateRange}
                    onSelect={(range) => {
                      if (!range) return;
                      if (!isPickingEndRef.current) {
                        // First click — set start date, clear end
                        setDateRange({ from: range.from, to: undefined });
                        isPickingEndRef.current = true;
                      } else {
                        // Second click — set end date and close
                        setDateRange({ from: range.from, to: range.to });
                        isPickingEndRef.current = false;
                        setDatePopoverOpen(false);
                      }
                    }}
                    disabled={(date) => date > new Date()}
                    className={cn("p-3 pointer-events-auto")}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>

              {isSomeSelected && (
                <Select onValueChange={handleBulkStatusChange}>
                  <SelectTrigger className="w-[160px] h-9 text-xs">
                    <SelectValue placeholder="Change status" />
                  </SelectTrigger>
                  <SelectContent>
                    {leadStatusTags.map(tag => (
                      <SelectItem key={tag.id} value={tag.tag_name}>
                        {tag.tag_name.charAt(0).toUpperCase() + tag.tag_name.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Bulk Delete */}
              {isSomeSelected && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      className="gap-2 text-sm ml-auto"
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Delete</span>
                      <Badge variant="secondary" className="ml-1 text-xs bg-destructive-foreground/20 text-destructive-foreground">
                        {selectedLeads.size}
                      </Badge>
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {selectedLeads.size} lead{selectedLeads.size !== 1 ? 's' : ''}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. The selected leads will be permanently removed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {/* Export */}
              <Button 
                variant="outline" 
                onClick={() => setExportDialogOpen(true)}
                disabled={filteredDesigns.length === 0}
                className={`gap-2 text-sm ${!isSomeSelected ? 'ml-auto' : ''}`}
                size="sm"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export Leads</span>
                {isSomeSelected && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {selectedLeads.size}
                  </Badge>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          {filteredDesigns.length === 0 ? (
            <div className="text-center py-8 sm:py-12">
              <p className="text-sm sm:text-base text-muted-foreground">No leads found</p>
            </div>
          ) : (
            <>
              {/* Mobile Card Layout */}
              <div className="space-y-3 md:hidden max-h-[calc(100vh-280px)] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-muted/20 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-thumb]:rounded-full">
                {filteredDesigns.map((design) => (
                  <Card key={design.id} className="p-3 sm:p-4">
                    <div className="flex items-start gap-3 mb-2">
                      <Checkbox
                        checked={selectedLeads.has(design.id)}
                        onCheckedChange={(checked) => handleSelectLead(design.id, checked as boolean)}
                        aria-label={`Select ${design.customer_name}`}
                        className="mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <p className="font-medium text-sm truncate">{design.customer_name}</p>
                              <RepeatCustomerBadge
                                currentLeadId={design.id}
                                submissions={emailSubmissionsMap[design.customer_email?.toLowerCase()] || []}
                                onSelectLead={(sub) => {
                                  const found = designs.find(d => d.id === sub.id);
                                  if (found) openLead(found);
                                }}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground truncate">{design.customer_email}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {singleSource === 'grill_form' && design.source === 'grill_form' ? (
                      <div className="ml-7 space-y-2 mb-2">
                        <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
                          <div>
                            <span className="text-muted-foreground">Metal:</span>
                            <p className="font-medium capitalize">{design.configuration?.metal_type?.replace(/-/g, ' ') || '—'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Purity:</span>
                            <p className="font-medium">{design.configuration?.metal_purity?.replace(/-/g, ' ') || '—'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Top Teeth:</span>
                            <p className="font-medium">{design.configuration?.top_teeth === 'none' ? 'None' : design.configuration?.top_teeth || '—'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Bottom Teeth:</span>
                            <p className="font-medium">{design.configuration?.bottom_teeth === 'none' ? 'None' : design.configuration?.bottom_teeth || '—'}</p>
                          </div>
                        </div>
                        {design.configuration?.question_answers && (
                          <QuestionAnswersSection answers={design.configuration.question_answers} compact />
                        )}
                        {design.notes && (
                          <p className="text-xs text-muted-foreground truncate" title={design.notes}>
                            {design.notes}
                          </p>
                        )}
                      </div>
                    ) : singleSource === 'diamond_form' && design.source === 'diamond_form' ? (
                      <div className="ml-7 space-y-2 mb-2">
                        <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
                          <div>
                            <span className="text-muted-foreground">Type:</span>
                            <p className="font-medium capitalize">{design.configuration?.diamond_type?.replace(/-/g, ' ') || '—'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Shape:</span>
                            <p className="font-medium capitalize">{design.configuration?.diamond_shape?.replace(/-/g, ' ') || '—'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Size:</span>
                            <p className="font-medium capitalize">{design.configuration?.diamond_size?.replace(/-/g, ' ') || '—'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Quality:</span>
                            <p className="font-medium capitalize">{design.configuration?.diamond_quality?.replace(/-/g, ' ') || '—'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Metal:</span>
                            <p className="font-medium capitalize">{design.configuration?.diamond_metal?.replace(/-/g, ' ') || '—'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Setting:</span>
                            <p className="font-medium capitalize">{design.configuration?.diamond_setting?.replace(/-/g, ' ') || '—'}</p>
                          </div>
                        </div>
                        {design.configuration?.estimated_total && (
                          <p className="text-sm font-medium">
                            Estimate: {new Intl.NumberFormat('en-US', { style: 'currency', currency: design.configuration?.currency || 'USD', minimumFractionDigits: 0 }).format(Number(design.configuration.estimated_total))}
                          </p>
                        )}
                        {design.notes && (
                          <p className="text-xs text-muted-foreground truncate" title={design.notes}>
                            {design.notes}
                          </p>
                        )}
                      </div>
                    ) : (
                      <>
                        <div className="ml-7 grid grid-cols-2 gap-2 text-xs sm:text-sm mb-2">
                          <div>
                            <span className="text-muted-foreground">Product:</span>
                            <button
                              className="font-medium truncate text-primary hover:underline cursor-pointer text-left block"
                              onClick={() => openLead(design)}
                            >
                              {design.product_name && design.product_name !== 'Custom Ring' ? design.product_name : buildProductNameFromConfig(design.configuration) || "Custom Ring"}
                            </button>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Phone:</span>
                            <p className="font-medium truncate">{design.customer_phone || "—"}</p>
                          </div>
                        </div>
                        {design.notes && (
                          <p className="ml-7 text-xs text-muted-foreground truncate mb-2" title={design.notes}>
                            {design.notes}
                          </p>
                        )}
                      </>
                    )}
                    
                    <div className="ml-7 flex justify-between items-center pt-2 border-t border-border">
                      <span className="text-xs text-muted-foreground">
                        {formatDateWithTimezone(design.created_at, clientTimezone)}
                      </span>
                        <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openLead(design)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {hasEditAccess && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="max-w-[90vw] sm:max-w-lg">
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Lead</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete this lead from {design.customer_name}? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                                <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteLead(design.id)}
                                  className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Desktop Table Layout */}
              <div className="hidden md:block overflow-auto max-h-[calc(100vh-280px)] rounded-md border border-border/40 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-muted/20 [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/60">
                <Table containerClassName={stickyHeaderTableClass}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={isAllSelected}
                          onCheckedChange={handleSelectAll}
                          aria-label="Select all leads"
                        />
                      </TableHead>
                      {singleSource === 'grill_form' ? (
                        <>
                          <TableHead className="text-xs lg:text-sm">Name</TableHead>
                          <TableHead className="text-xs lg:text-sm">Email</TableHead>
                          <TableHead className="text-xs lg:text-sm">Phone</TableHead>
                          <TableHead className="text-xs lg:text-sm">Metal Type</TableHead>
                          <TableHead className="text-xs lg:text-sm">Purity</TableHead>
                          <TableHead className="text-xs lg:text-sm">Top Teeth</TableHead>
                          <TableHead className="text-xs lg:text-sm">Bottom Teeth</TableHead>
                          <TableHead className="text-xs lg:text-sm">Budget</TableHead>
                          <TableHead className="text-xs lg:text-sm">Extras</TableHead>
                          <TableHead className="text-xs lg:text-sm">Notes</TableHead>
                          <TableHead className="text-xs lg:text-sm">Date</TableHead>
                          <TableHead className="text-xs lg:text-sm text-right">Actions</TableHead>
                        </>
                      ) : singleSource === 'diamond_form' ? (
                        <>
                          <TableHead className="text-xs lg:text-sm">Name</TableHead>
                          <TableHead className="text-xs lg:text-sm">Email</TableHead>
                          <TableHead className="text-xs lg:text-sm">Phone</TableHead>
                          <TableHead className="text-xs lg:text-sm">Type</TableHead>
                          <TableHead className="text-xs lg:text-sm">Shape</TableHead>
                          <TableHead className="text-xs lg:text-sm">Size</TableHead>
                          <TableHead className="text-xs lg:text-sm">Quality</TableHead>
                          <TableHead className="text-xs lg:text-sm">Metal</TableHead>
                          <TableHead className="text-xs lg:text-sm">Setting</TableHead>
                          <TableHead className="text-xs lg:text-sm">Band</TableHead>
                          <TableHead className="text-xs lg:text-sm">Ring Size</TableHead>
                          <TableHead className="text-xs lg:text-sm">Timeline</TableHead>
                          <TableHead className="text-xs lg:text-sm">Estimate</TableHead>
                          <TableHead className="text-xs lg:text-sm">Notes</TableHead>
                          <TableHead className="text-xs lg:text-sm">Date</TableHead>
                          <TableHead className="text-xs lg:text-sm text-right">Actions</TableHead>
                        </>
                      ) : singleSource === 'custom_enquiry' ? (
                        <>
                          <TableHead className="text-xs lg:text-sm">Name</TableHead>
                          <TableHead className="text-xs lg:text-sm">Email</TableHead>
                          <TableHead className="text-xs lg:text-sm">Phone</TableHead>
                          <TableHead className="text-xs lg:text-sm">Jewelry Type</TableHead>
                          <TableHead className="text-xs lg:text-sm">Budget</TableHead>
                          <TableHead className="text-xs lg:text-sm">Gold Color</TableHead>
                          <TableHead className="text-xs lg:text-sm">Karat</TableHead>
                          <TableHead className="text-xs lg:text-sm">Diamonds</TableHead>
                          <TableHead className="text-xs lg:text-sm">Setup</TableHead>
                          <TableHead className="text-xs lg:text-sm">Back</TableHead>
                          <TableHead className="text-xs lg:text-sm">Description</TableHead>
                          <TableHead className="text-xs lg:text-sm">Notes</TableHead>
                          <TableHead className="text-xs lg:text-sm">Date</TableHead>
                          <TableHead className="text-xs lg:text-sm text-right">Actions</TableHead>
                        </>
                      ) : singleSource === 'widget' ? (
                        <>
                          <TableHead className="text-xs lg:text-sm">Name</TableHead>
                          <TableHead className="text-xs lg:text-sm">Email</TableHead>
                          <TableHead className="text-xs lg:text-sm">Phone</TableHead>
                          <TableHead className="text-xs lg:text-sm">Status</TableHead>
                          <TableHead className="text-xs lg:text-sm">Notes</TableHead>
                          <TableHead className="text-xs lg:text-sm">Date</TableHead>
                          <TableHead className="text-xs lg:text-sm text-right">Actions</TableHead>
                        </>
                      ) : (
                        <>
                          <TableHead className="text-xs lg:text-sm">Name</TableHead>
                          <TableHead className="text-xs lg:text-sm">Email</TableHead>
                          <TableHead className="text-xs lg:text-sm">Phone</TableHead>
                          <TableHead className="text-xs lg:text-sm">Source</TableHead>
                          <TableHead className="text-xs lg:text-sm">Status</TableHead>
                          <TableHead className="text-xs lg:text-sm">Notes</TableHead>
                          <TableHead className="text-xs lg:text-sm">Date</TableHead>
                          <TableHead className="text-xs lg:text-sm text-right">Actions</TableHead>
                        </>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDesigns.map((design) => (
                      <TableRow key={design.id} className="cursor-pointer" onClick={() => openLead(design)}>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedLeads.has(design.id)}
                            onCheckedChange={(checked) => handleSelectLead(design.id, checked as boolean)}
                            aria-label={`Select ${design.customer_name}`}
                          />
                        </TableCell>
                        {/* Common: Name, Email, Phone */}
                        <TableCell className="text-sm font-medium">
                          <div className="flex items-center gap-1.5">
                            {design.customer_name}
                            <RepeatCustomerBadge
                              currentLeadId={design.id}
                              submissions={emailSubmissionsMap[design.customer_email?.toLowerCase()] || []}
                              onSelectLead={(sub) => {
                                const found = designs.find(d => d.id === sub.id);
                                if (found) openLead(found);
                              }}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{design.customer_email}</TableCell>
                        <TableCell className="text-sm">{design.customer_phone || '—'}</TableCell>

                        {singleSource === 'grill_form' ? (
                          <>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs capitalize">
                                {design.configuration?.metal_type?.replace(/-/g, ' ') || '—'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">{design.configuration?.metal_purity?.replace(/-/g, ' ') || '—'}</TableCell>
                            <TableCell className="text-sm">{design.configuration?.top_teeth === 'none' ? 'None' : design.configuration?.top_teeth || '—'}</TableCell>
                            <TableCell className="text-sm">{design.configuration?.bottom_teeth === 'none' ? 'None' : design.configuration?.bottom_teeth || '—'}</TableCell>
                            <TableCell className="text-sm">{design.configuration?.budget || '—'}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1 max-w-[200px]">
                                {design.configuration?.question_answers ? (
                                  <QuestionAnswersSection answers={design.configuration.question_answers} compact />
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]">{design.notes || '—'}</TableCell>
                          </>
                        ) : singleSource === 'diamond_form' ? (
                          <>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs capitalize">
                                {design.configuration?.diamond_type?.replace(/-/g, ' ') || '—'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm capitalize">{design.configuration?.diamond_shape?.replace(/-/g, ' ') || '—'}</TableCell>
                            <TableCell className="text-sm capitalize">{design.configuration?.diamond_size?.replace(/-/g, ' ') || '—'}</TableCell>
                            <TableCell className="text-sm capitalize">{design.configuration?.diamond_quality?.replace(/-/g, ' ') || '—'}</TableCell>
                            <TableCell className="text-sm capitalize">{design.configuration?.diamond_metal?.replace(/-/g, ' ') || '—'}</TableCell>
                            <TableCell className="text-sm capitalize">{design.configuration?.diamond_setting?.replace(/-/g, ' ') || '—'}</TableCell>
                            <TableCell className="text-sm capitalize">{design.configuration?.diamond_band?.replace(/-/g, ' ') || '—'}</TableCell>
                            <TableCell className="text-sm">{design.configuration?.ring_size || '—'}</TableCell>
                            <TableCell className="text-sm capitalize">{design.configuration?.diamond_timeline?.replace(/-/g, ' ') || '—'}</TableCell>
                            <TableCell className="text-sm font-medium">
                              {design.configuration?.estimated_total ? new Intl.NumberFormat('en-US', { style: 'currency', currency: design.configuration?.currency || 'USD', minimumFractionDigits: 0 }).format(Number(design.configuration.estimated_total)) : '—'}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]">{design.notes || '—'}</TableCell>
                          </>
                        ) : singleSource === 'custom_enquiry' ? (
                          <>
                            <TableCell className="text-sm capitalize">{design.configuration?.jewelry_type || '—'}</TableCell>
                            <TableCell className="text-sm">{design.configuration?.budget || '—'}</TableCell>
                            <TableCell className="text-sm capitalize">{design.configuration?.gold_color?.replace(/-/g, ' ') || '—'}</TableCell>
                            <TableCell className="text-sm">{design.configuration?.karat || '—'}</TableCell>
                            <TableCell className="text-sm">{design.configuration?.diamond_quality || '—'}</TableCell>
                            <TableCell className="text-sm">{design.configuration?.diamond_setup || '—'}</TableCell>
                            <TableCell className="text-sm">{design.configuration?.back_option || '—'}</TableCell>
                            
                            <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]">{design.configuration?.description || '—'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]">{design.notes || '—'}</TableCell>
                          </>
                        ) : singleSource === 'widget' ? (
                          <>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <StatusTagSelector
                                currentStatus={design.follow_up_status}
                                tags={leadStatusTags}
                                onStatusChange={(newStatus) => handleStatusChange(design, newStatus)}
                                onCreateTag={addLeadTag}
                                onDeleteTag={hasEditAccess ? deleteLeadTag : undefined}
                                getTagColor={getLeadTagColor}
                                disabled={!hasEditAccess}
                              />
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]">{design.notes || '—'}</TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell>
                              {design.source === 'diamond_form' && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-primary/30 text-primary">
                                  Instant Quote
                                </Badge>
                              )}
                              {design.source === 'grill_form' && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-600">
                                  Grillz
                                </Badge>
                              )}
                              {design.source === 'custom_enquiry' && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-600">
                                  Custom
                                </Badge>
                              )}
                              {design.source === 'ring_builder' && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-500/30 text-violet-600">
                                  Ring Builder
                                </Badge>
                              )}
                              {design.source === 'widget' && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-muted-foreground/30 text-muted-foreground">
                                  Ring OS
                                </Badge>
                              )}
                              {design.source === 'booking' && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-blue-500/30 text-blue-600">
                                  Booking
                                </Badge>
                              )}
                              {design.source === 'metal_iq' && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-600">
                                  Metal IQ
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell onClick={(e) => e.stopPropagation()}>
                              <StatusTagSelector
                                currentStatus={design.follow_up_status}
                                tags={leadStatusTags}
                                onStatusChange={(newStatus) => handleStatusChange(design, newStatus)}
                                onCreateTag={addLeadTag}
                                onDeleteTag={hasEditAccess ? deleteLeadTag : undefined}
                                getTagColor={getLeadTagColor}
                                disabled={!hasEditAccess}
                              />
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]">{design.notes || '—'}</TableCell>
                          </>
                        )}

                        {/* Common: Date + Actions */}
                        <TableCell className="text-sm">{formatDateWithTimezone(design.created_at, clientTimezone)}</TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openLead(design)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {hasEditAccess && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Lead</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Are you sure you want to delete this lead from {design.customer_name}? This action cannot be undone.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteLead(design.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
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

      {/* CRM Dialog */}
      <Dialog open={crmDialogOpen} onOpenChange={setCrmDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect CRM Integration</DialogTitle>
            <DialogDescription>
              Choose a CRM platform to sync your leads automatically
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Button
              className="w-full h-auto p-3 sm:p-4 flex items-center justify-between"
              variant="outline"
              onClick={handleConnectCRM}
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <Database className="h-6 w-6 sm:h-8 sm:w-8 text-primary shrink-0" />
                <div className="text-left">
                  <p className="font-semibold text-sm sm:text-base">CRM MVMNT</p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Sync leads with CRM MVMNT
                  </p>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0" />
            </Button>

            <Button
              className="w-full h-auto p-3 sm:p-4 flex items-center justify-between"
              variant="outline"
              disabled
            >
              <div className="flex items-center gap-2 sm:gap-3">
                <Database className="h-6 w-6 sm:h-8 sm:w-8 text-muted-foreground shrink-0" />
                <div className="text-left">
                  <p className="font-semibold text-sm sm:text-base text-muted-foreground">
                    More integrations coming soon
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    HubSpot, Salesforce, and more
                  </p>
                </div>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              Export Leads
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Export your leads data as a CSV file. You'll receive an email with the download link.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 sm:space-y-4 pt-3 sm:pt-4">
            <div className="p-3 sm:p-4 rounded-lg bg-muted/50 border">
              <p className="text-xs sm:text-sm text-muted-foreground mb-1 sm:mb-2">Export will be sent to:</p>
              <p className="font-medium text-sm sm:text-base truncate">{clientBranding?.email || user?.email}</p>
            </div>

            <div className="space-y-2 sm:space-y-3">
              <Button
                className="w-full justify-between text-sm"
                variant="outline"
                size="sm"
                onClick={() => handleExportLeads(false)}
                disabled={selectedLeads.size === 0 || exporting}
              >
                <div className="flex items-center gap-2">
                  <Download className="h-4 w-4" />
                  <span>Export Selected</span>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {selectedLeads.size} selected
                </Badge>
              </Button>

              <Button
                className="w-full justify-between text-sm"
                size="sm"
                onClick={() => handleExportLeads(true)}
                disabled={exporting}
              >
                <div className="flex items-center gap-2">
                  {exporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  <span>Export All</span>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {filteredDesigns.length} leads
                </Badge>
              </Button>
            </div>

            <p className="text-xs text-muted-foreground text-center">
              The CSV file will include customer details, product information, and configuration data.
            </p>
          </div>
        </DialogContent>
      </Dialog>


    </div>
  );
};

export default SavedDesigns;
