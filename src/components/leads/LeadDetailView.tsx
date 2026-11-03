import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { fallbackToPngOnError } from '@/lib/webp-image-fallback';
import { supabase } from "@/integrations/supabase/client";
import type { LeadDeviceInfo } from '@/lib/lead-device';
import { LeadDeviceLabel } from '@/components/leads/LeadDeviceRow';
import { getCurrencySymbol } from "@/lib/pricing-utils";
import { NewCadRequestDialog } from "@/components/cad-requests/NewCadRequestDialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

import { LeadFollowUpSection } from "@/components/leads/LeadFollowUpSection";
import { LinkedBookingsPanel } from "@/components/leads/LinkedBookingsPanel";
import { GrillTeethDiagram } from "@/components/leads/GrillTeethDiagram";
import { LeadCostEstimation } from "@/components/leads/LeadCostEstimation";
import { LeadCataloguePrice } from "@/components/leads/LeadCataloguePrice";
import { SendQuoteSection } from "@/components/leads/SendQuoteSection";
import { StatusTagSelector } from "@/components/status/StatusTagSelector";
import { useLeadFormQuestions } from "@/hooks/useLeadFormQuestions";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  ArrowLeft, User, Mail, Phone, Calendar, Sparkles,
  Image, ThumbsUp, ThumbsDown, FileText, Clock, DollarSign, Ruler,
  Copy, Check, Pencil, AlertTriangle, Loader2, Repeat2, History
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { StatusTag } from "@/hooks/useClientStatusTags";
import { formatQuoteGemstoneLabel, quoteGemstoneDetailRows, type QuoteSelectedGemstone } from "@/lib/quote-estimator-gemstones";

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

interface RelatedSubmission {
  id: string;
  source: string;
  created_at: string;
  follow_up_status: string;
  customer_name: string;
}

interface LeadDetailViewProps {
  design: SavedDesign;
  clientId: string;
  onBack: () => void;
  onStatusChange: (design: SavedDesign, newStatus: string) => void;
  hasEditAccess: boolean;
  onFieldUpdate?: (designId: string, field: string, value: string) => void;
  onConfigUpdate?: (designId: string, configKey: string, value: string) => void;
  leadStatusTags: StatusTag[];
  getLeadTagColor: (tagName: string) => string;
  addLeadTag: (tagName: string, tagColor: string) => void;
  deleteLeadTag?: (tagId: string) => void;
  widgetLeadImages: string[];
  widgetImageLoading: boolean;
  grillPreviewImages: Array<{ image_url: string; feedback: string | null; custom_instruction?: string | null }>;
  grillPreviewLoading: boolean;
  enquiryPreviewImages: Array<{ image_url: string; feedback: string | null; custom_instruction?: string | null }>;
  enquiryPreviewLoading: boolean;
  ringPreviewImages: Array<{ image_url: string; feedback: string | null; custom_instruction?: string | null }>;
  ringPreviewLoading: boolean;
  currency?: string;
  relatedSubmissions?: RelatedSubmission[];
  onSelectRelatedLead?: (submission: RelatedSubmission) => void;
  hideBackButton?: boolean;
}

const ConfigField = ({ label, value, raw, configKey, onConfigUpdate, editable = false }: { 
  label: string; value: string; raw?: boolean; configKey?: string; onConfigUpdate?: (key: string, value: string) => void; editable?: boolean;
}) => {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);

  if (editable && configKey && onConfigUpdate && editing) {
    return (
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-center gap-1">
          <Input
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            className="h-7 text-sm"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') { onConfigUpdate(configKey, editValue); setEditing(false); }
              if (e.key === 'Escape') { setEditValue(value); setEditing(false); }
            }}
          />
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { onConfigUpdate(configKey, editValue); setEditing(false); }}>
            <Check className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={editable ? 'cursor-pointer group' : ''} onClick={() => editable && setEditing(true)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium capitalize flex items-center gap-1">
        {raw ? value : String(value).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
        {editable && <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />}
      </p>
    </div>
  );
};

const SectionCard = ({ title, icon: Icon, children, asCard = false, defaultOpen = true }: { title: string; icon?: any; children: React.ReactNode; asCard?: boolean; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  const content = (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button className="w-full text-left text-sm font-semibold mb-3 flex items-center gap-2 hover:text-primary transition-colors" type="button">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          {title}
          <svg className={`h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
  if (asCard) return <Card><CardContent className="p-4 sm:p-5">{content}</CardContent></Card>;
  return <div className="pb-5 border-b border-border/40 last:border-0">{content}</div>;
};

const ImageGallery = ({ images, loading, title, showFeedback = false, showCustomInstruction = false }: {
  images: Array<{ image_url: string; feedback: string | null; custom_instruction?: string | null }> | string[];
  loading: boolean;
  title: string;
  showFeedback?: boolean;
  showCustomInstruction?: boolean;
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-1">
        {[0,1,2].map(i => <Skeleton key={i} className="h-32 w-32 rounded-lg flex-shrink-0" />)}
      </div>
    );
  }

  const normalizedImages = images.map(img =>
    typeof img === 'string' ? { image_url: img, feedback: null, custom_instruction: null } : img
  );

  if (normalizedImages.length === 0) {
    return <p className="text-xs text-muted-foreground italic">No images available</p>;
  }

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {normalizedImages.map((item, idx) => (
          <div key={idx} className="flex-shrink-0">
            <div className="relative">
              <img
                src={item.image_url}
                alt={`${title} ${idx + 1}`}
                className="h-32 w-32 sm:h-40 sm:w-40 object-contain rounded-lg border border-border/50 cursor-pointer hover:opacity-80 transition-opacity bg-muted/50 p-1"
                onClick={() => setSelectedImage(item.image_url)}
                onError={fallbackToPngOnError}
              />
              {showFeedback && item.feedback && (
                <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center ${
                  item.feedback === 'liked' ? 'bg-emerald-500' : 'bg-red-500'
                }`}>
                  {item.feedback === 'liked'
                    ? <ThumbsUp className="w-3 h-3 text-white" />
                    : <ThumbsDown className="w-3 h-3 text-white" />
                  }
                </div>
              )}
            </div>
            {showCustomInstruction && item.custom_instruction && (
              <p className="mt-1.5 text-xs text-muted-foreground italic max-w-[8rem] sm:max-w-[10rem] line-clamp-3" title={item.custom_instruction}>
                "{item.custom_instruction}"
              </p>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!selectedImage} onOpenChange={(open) => { if (!open) setSelectedImage(null); }}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-4 sm:p-6 flex items-center justify-center">
          {selectedImage && (
            <img
              src={selectedImage}
              alt={title}
              onError={fallbackToPngOnError}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

const getSourceBadge = (source: string) => {
  switch (source) {
    case 'diamond_form':
      return <Badge variant="outline" className="text-xs border-primary/30 text-primary">Instant Quote</Badge>;
    case 'grill_form':
      return <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-600">Grillz</Badge>;
    case 'custom_enquiry':
      return <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-600">Custom Enquiry</Badge>;
    case 'ring_builder':
      return <Badge variant="outline" className="text-xs border-violet-500/30 text-violet-600">Ring Builder</Badge>;
    case 'booking':
      return <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-600">Booking</Badge>;
    case 'metal_iq':
      return <Badge variant="outline" className="text-xs border-orange-500/30 text-orange-600">Metal IQ</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">Ring OS</Badge>;
  }
};

export const LeadDetailView = ({
  design, clientId, onBack, onStatusChange, hasEditAccess, onFieldUpdate, onConfigUpdate,
  leadStatusTags, getLeadTagColor, addLeadTag, deleteLeadTag,
  widgetLeadImages, widgetImageLoading,
  grillPreviewImages, grillPreviewLoading,
  enquiryPreviewImages, enquiryPreviewLoading,
  ringPreviewImages, ringPreviewLoading,
  currency = 'USD',
  relatedSubmissions,
  onSelectRelatedLead,
  hideBackButton,
}: LeadDetailViewProps) => {
  const config = design.configuration || {};
  const canEditConfig = hasEditAccess && !!onConfigUpdate;
  const handleConfigEdit = (key: string, value: string) => {
    if (onConfigUpdate) onConfigUpdate(design.id, key, value);
  };
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);
  const [cadRequesting, setCadRequesting] = useState(false);
  const [cadRequested, setCadRequested] = useState(false);
   const [cadDialogOpen, setCadDialogOpen] = useState(false);
   const [newRingCadDialogOpen, setNewRingCadDialogOpen] = useState(false);
  const [existingCadRequest, setExistingCadRequest] = useState<{
    id: string;
    status: string;
    created_at: string;
    cad_file_urls: string[] | null;
    delivered_at: string | null;
  } | null>(null);
  const [cadFileSignedUrls, setCadFileSignedUrls] = useState<{ name: string; url: string }[]>([]);
  const [editHistory, setEditHistory] = useState<Array<{ field: string; old_value: string; new_value: string; edited_at: string; edited_by: string }>>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Check for existing CAD request on mount
  useEffect(() => {
    const checkExisting = async () => {
      const { data } = await (supabase as any)
        .from('cad_requests')
        .select('id, status, created_at, cad_file_urls, delivered_at')
        .eq('lead_id', design.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setExistingCadRequest(data);
        setCadRequested(true);
        // Get signed URLs for delivered files
        if (data.cad_file_urls && data.cad_file_urls.length > 0) {
          const urls: { name: string; url: string }[] = [];
          for (const filePath of data.cad_file_urls) {
            const { data: signedData } = await supabase.storage
              .from('cad-deliveries')
              .createSignedUrl(filePath, 3600);
            if (signedData?.signedUrl) {
              urls.push({ name: filePath.split('/').pop() || 'CAD File', url: signedData.signedUrl });
            }
          }
          setCadFileSignedUrls(urls);
        }
      }
    };
    checkExisting();
  }, [design.id]);
  const { questions: configuredQuestions } = useLeadFormQuestions(clientId, design.source);

  // Fetch edit history
  useEffect(() => {
    const fetchHistory = async () => {
      const tableMap: Record<string, string> = {
        widget: 'saved_designs',
        diamond_form: 'diamond_form_leads',
        grill_form: 'grill_form_leads',
        custom_enquiry: 'custom_enquiry_leads',
      };
      const table = tableMap[design.source];
      if (!table) return;
      try {
        const { data } = await (supabase as any).from(table).select('edit_history').eq('id', design.id).maybeSingle();
        if (data?.edit_history) setEditHistory(data.edit_history);
      } catch { /* ignore */ }
    };
    fetchHistory();
  }, [design.id, design.source]);

  const handleCopy = useCallback((value: string, field: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(field);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedField(null), 1500);
  }, []);

  const startEdit = useCallback((field: string, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
    setTimeout(() => editInputRef.current?.focus(), 50);
  }, []);

  const saveEdit = useCallback(() => {
    if (!editingField || !editValue.trim()) {
      setEditingField(null);
      return;
    }
    onFieldUpdate?.(design.id, editingField, editValue.trim());
    setEditingField(null);
  }, [editingField, editValue, design.id, onFieldUpdate]);

  const cancelEdit = useCallback(() => {
    setEditingField(null);
  }, []);

  // Parse ring builder JSON description
  const parsedRingBuilder = useMemo(() => {
    if (design.source !== 'ring_builder' || !config.description) return null;
    try {
      if (typeof config.description === 'string') {
        return JSON.parse(config.description);
      }
    } catch { /* not JSON */ }
    return null;
  }, [design.source, config.description]);

  // Get description/prompt text
  const requestDescription = useMemo(() => {
    if (design.source === 'custom_enquiry') return config.description;
    if (design.source === 'ring_builder') {
      if (parsedRingBuilder?.otherDetails) return parsedRingBuilder.otherDetails;
      return config.description && !parsedRingBuilder ? config.description : null;
    }
    return null;
  }, [design.source, config, parsedRingBuilder]);

  // Estimated total (from diamond form)
  const estimatedTotal = config.estimated_total ? Number(config.estimated_total) : null;

  // Merge request description + notes, deduplicating
  const hasRequest = !!requestDescription || !!config.jewelry_type || !!config.request_type;
  const notesText = design.notes;
  const additionalNotes = design.source === 'custom_enquiry' ? config.additional_notes : null;
  const adminNotes = design.source === 'ring_builder' ? config.admin_notes : null;
  const rbAdditionalNotes = parsedRingBuilder?.additionalNotes;

  // Collect unique notes (dedup against requestDescription)
  const mergedNotes = useMemo(() => {
    const parts: string[] = [];
    if (notesText && notesText !== requestDescription) parts.push(notesText);
    if (additionalNotes && additionalNotes !== requestDescription && additionalNotes !== notesText) parts.push(additionalNotes);
    if (rbAdditionalNotes && rbAdditionalNotes !== requestDescription && rbAdditionalNotes !== notesText) parts.push(rbAdditionalNotes);
    if (adminNotes && adminNotes !== requestDescription && adminNotes !== notesText) parts.push(adminNotes);
    return parts;
  }, [notesText, additionalNotes, adminNotes, rbAdditionalNotes, requestDescription]);

  const showRequestNotes = hasRequest || mergedNotes.length > 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Back Button */}
      {!hideBackButton && (
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 -ml-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Leads
        </Button>
      )}

      {/* Header - simplified */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-xl sm:text-2xl font-bold">{design.customer_name}</h2>
          {getSourceBadge(design.source)}
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <StatusTagSelector
            currentStatus={design.follow_up_status}
            tags={leadStatusTags}
            onStatusChange={(newStatus) => onStatusChange(design, newStatus)}
            onCreateTag={addLeadTag}
            onDeleteTag={hasEditAccess ? deleteLeadTag : undefined}
            getTagColor={getLeadTagColor}
            disabled={!hasEditAccess}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Main Content - Left 2 columns */}
        <div className="lg:col-span-2 space-y-4">

          {/* 0. CUSTOMER INFORMATION */}
          <SectionCard title="Customer Information" icon={User}>
            <div className="space-y-0 divide-y divide-border">
              {/* Name */}
              <div className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">Name</span>
                  {editingField === 'name' ? (
                    <Input
                      ref={editInputRef}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                      className="h-7 text-sm w-48"
                    />
                  ) : (
                    <span className="text-sm font-medium truncate">{design.customer_name}</span>
                  )}
                </div>
                {editingField !== 'name' && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleCopy(design.customer_name, 'name')} className="p-1.5 rounded-md hover:bg-muted transition-colors" title="Copy">
                      {copiedField === 'name' ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    {hasEditAccess && (
                      <button onClick={() => startEdit('name', design.customer_name)} className="p-1.5 rounded-md hover:bg-muted transition-colors" title="Edit">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Email */}
              <div className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">Email</span>
                  {editingField === 'email' ? (
                    <Input
                      ref={editInputRef}
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={saveEdit}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                      className="h-7 text-sm w-48"
                    />
                  ) : (
                    <span className="text-sm text-foreground truncate">{design.customer_email}</span>
                  )}
                </div>
                {editingField !== 'email' && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleCopy(design.customer_email, 'email')} className="p-1.5 rounded-md hover:bg-muted transition-colors" title="Copy">
                      {copiedField === 'email' ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                    </button>
                    {hasEditAccess && (
                      <button onClick={() => startEdit('email', design.customer_email)} className="p-1.5 rounded-md hover:bg-muted transition-colors" title="Edit">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Phone */}
              {design.customer_phone && (
                <div className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">Phone</span>
                    {editingField === 'phone' ? (
                      <Input
                        ref={editInputRef}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={saveEdit}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
                        className="h-7 text-sm w-40"
                      />
                    ) : (
                      <span className="text-sm text-foreground truncate">{design.customer_phone}</span>
                    )}
                  </div>
                  {editingField !== 'phone' && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleCopy(design.customer_phone!, 'phone')} className="p-1.5 rounded-md hover:bg-muted transition-colors" title="Copy">
                        {copiedField === 'phone' ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5 text-muted-foreground" />}
                      </button>
                      {hasEditAccess && (
                        <button onClick={() => startEdit('phone', design.customer_phone!)} className="p-1.5 rounded-md hover:bg-muted transition-colors" title="Edit">
                          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Location */}
              {(config.country || config.city || config.state) && (
                <div className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">Location</span>
                    <span className="text-sm text-foreground truncate">
                      {[config.city, config.state, config.country].filter(Boolean).join(', ')}
                    </span>
                  </div>
                </div>
              )}

              {/* Date */}
              <div className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">Date</span>
                  <span className="text-sm text-foreground">{format(new Date(design.created_at), 'MMM d, yyyy · h:mm a')}</span>
                </div>
              </div>

              {/* Device */}
              {design.device_info && (
                <div className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">Device</span>
                    <LeadDeviceLabel info={design.device_info} className="text-sm text-foreground" />
                  </div>
                </div>
              )}

              {/* Source Summary */}
              {relatedSubmissions && relatedSubmissions.length > 0 && (() => {
                const counts: Record<string, number> = {};
                const sourceLabels: Record<string, string> = {
                  widget: 'Ring OS', diamond_form: 'Instant Quote', grill_form: 'Grillz',
                  custom_enquiry: 'Custom', ring_builder: 'Ring Builder', booking: 'Booking', metal_iq: 'Metal IQ',
                };
                relatedSubmissions.forEach(s => { counts[s.source] = (counts[s.source] || 0) + 1; });
                return (
                  <div className="flex items-center gap-2 py-2.5 flex-wrap">
                    <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">History</span>
                    {Object.entries(counts).map(([src, count]) => (
                      <Badge key={src} variant="outline" className="text-[10px] px-1.5 py-0">
                        {count}× {sourceLabels[src] || src}
                      </Badge>
                    ))}
                  </div>
                );
              })()}

              {/* Previous Submissions */}
              {relatedSubmissions && relatedSubmissions.length > 1 && (
                <div className="pt-2.5 border-t border-border/40">
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Repeat2 className="h-3.5 w-3.5" />
                    {relatedSubmissions.length} submissions from this customer
                  </p>
                  <div className="space-y-1">
                    {relatedSubmissions
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .map((sub) => {
                        const isCurrent = sub.id === design.id;
                        const sourceLabels: Record<string, string> = {
                          widget: 'Ring OS', diamond_form: 'Instant Quote', grill_form: 'Grillz',
                          custom_enquiry: 'Custom Enquiry', ring_builder: 'Ring Builder', booking: 'Booking', metal_iq: 'Metal IQ',
                        };
                        return (
                          <button
                            key={sub.id}
                            disabled={isCurrent}
                            onClick={() => onSelectRelatedLead?.(sub)}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                              isCurrent
                                ? 'bg-primary/10 text-primary font-medium cursor-default'
                                : 'hover:bg-muted cursor-pointer text-foreground'
                            }`}
                          >
                            <span className="flex-1 text-left truncate">{sourceLabels[sub.source] || sub.source}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{sub.follow_up_status}</Badge>
                            <span className="text-muted-foreground shrink-0">{format(new Date(sub.created_at), 'MMM d, yyyy')}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Edit History */}
          {editHistory.length > 0 && (
            <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
              <CollapsibleTrigger asChild>
                <button className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-2">
                  <History className="h-3.5 w-3.5" />
                  {editHistory.length} edit{editHistory.length !== 1 ? 's' : ''} · {historyOpen ? 'Hide' : 'Show'} history
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="space-y-2 pb-4">
                  {[...editHistory].reverse().map((entry, idx) => (
                    <div key={idx} className="flex items-start gap-3 text-xs border-l-2 border-border pl-3 py-1.5">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium capitalize">{entry.field}</span>
                        <span className="text-muted-foreground"> changed from </span>
                        <span className="line-through text-muted-foreground">{entry.old_value || '(empty)'}</span>
                        <span className="text-muted-foreground"> to </span>
                        <span className="font-medium">{entry.new_value}</span>
                      </div>
                      <span className="text-muted-foreground shrink-0">
                        {format(new Date(entry.edited_at), 'MMM d, h:mm a')}
                      </span>
                    </div>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Booking-specific appointment details */}
          {design.source === 'booking' && (config.preferred_date || config.preferred_time || config.booking_status) && (
            <SectionCard title="Appointment Details" icon={Calendar}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {config.preferred_date && <ConfigField label="Preferred Date" value={config.preferred_date} raw />}
                {config.preferred_time && <ConfigField label="Preferred Time" value={config.preferred_time} raw />}
                {config.customer_timezone && <ConfigField label="Timezone" value={config.customer_timezone} raw />}
                {config.booking_status && <ConfigField label="Booking Status" value={config.booking_status} />}
              </div>
            </SectionCard>
          )}
          {design.source === 'widget' && (
            <SectionCard title="Selected Design" icon={Image}>
              <ImageGallery images={widgetLeadImages} loading={widgetImageLoading} title="Ring Angle" />
            </SectionCard>
          )}

          {design.source === 'grill_form' && (
            <SectionCard title="Selected Teeth" icon={Sparkles}>
              <GrillTeethDiagram
                topTeeth={config.top_teeth || 'none'}
                bottomTeeth={config.bottom_teeth || 'none'}
                metalType={config.metal_type}
              />
            </SectionCard>
          )}

          {design.source === 'grill_form' && (
            <SectionCard title="AI Generated Previews" icon={Image}>
              <ImageGallery images={grillPreviewImages} loading={grillPreviewLoading} title="AI Preview" showFeedback showCustomInstruction />
            </SectionCard>
          )}

          {design.source === 'custom_enquiry' && (
            <SectionCard title="AI Generated Previews" icon={Image}>
              <ImageGallery images={enquiryPreviewImages} loading={enquiryPreviewLoading} title="AI Preview" showFeedback showCustomInstruction />
            </SectionCard>
          )}

          {design.source === 'ring_builder' && (
            <SectionCard title="AI Generated Previews" icon={Image}>
              <ImageGallery images={ringPreviewImages} loading={ringPreviewLoading} title="AI Preview" showFeedback showCustomInstruction />
            </SectionCard>
          )}

          {/* Metal IQ Photos */}
          {design.source === 'metal_iq' && config.photo_urls?.length > 0 && (
            <SectionCard title="Customer Photos" icon={Image}>
              <ImageGallery images={config.photo_urls} loading={false} title="Metal Photo" />
            </SectionCard>
          )}
          {/* Inspiration / Uploaded Images */}
          {design.source === 'diamond_form' && config.inspiration_image_urls?.length > 0 && (
            <SectionCard title="Inspiration Images" icon={Image}>
              <ImageGallery images={config.inspiration_image_urls} loading={false} title="Inspiration" />
            </SectionCard>
          )}

          {design.source === 'ring_builder' && config.reference_images?.length > 0 && (
            <SectionCard title="Reference Images" icon={Image}>
              <ImageGallery images={config.reference_images} loading={false} title="Reference" />
            </SectionCard>
          )}

          {design.source === 'grill_form' && config.uploaded_image_urls?.length > 0 && (
            <SectionCard title="Uploaded Images" icon={Image}>
              <ImageGallery images={config.uploaded_image_urls} loading={false} title="Upload" />
            </SectionCard>
          )}

          {design.source === 'custom_enquiry' && config.uploaded_image_urls?.length > 0 && (
            <SectionCard title="Uploaded Images" icon={Image}>
              <ImageGallery images={config.uploaded_image_urls} loading={false} title="Upload" />
            </SectionCard>
          )}

          {/* 2. CONFIGURATION (absorbs old Quote Details fields) */}
          <SectionCard title={design.source === 'metal_iq' ? 'Metal Details' : 'Configuration'}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
              {design.source === 'widget' && (
                <>
                  {config.style && <ConfigField label="Style" value={config.style} editable={canEditConfig} configKey="style" onConfigUpdate={handleConfigEdit} />}
                  {config.shank && <ConfigField label="Shank" value={config.shank} editable={canEditConfig} configKey="shank" onConfigUpdate={handleConfigEdit} />}
                  {config.metal && <ConfigField label="Metal" value={config.metal} editable={canEditConfig} configKey="metal" onConfigUpdate={handleConfigEdit} />}
                  {config.shape && <ConfigField label="Shape" value={config.shape} editable={canEditConfig} configKey="shape" onConfigUpdate={handleConfigEdit} />}
                  {config.caratRange != null && <ConfigField label="Carat" value={String(config.caratRange)} raw editable={canEditConfig} configKey="caratRange" onConfigUpdate={handleConfigEdit} />}
                  {config.size && <ConfigField label="Size" value={String(config.size)} raw editable={canEditConfig} configKey="size" onConfigUpdate={handleConfigEdit} />}
                  {config.visualColor && <ConfigField label="Color" value={config.visualColor} />}
                  {config.stone && <ConfigField label="Stone" value={config.stone} />}
                  {config.engraving?.enabled && <ConfigField label="Engraving" value={config.engraving.text || 'Enabled'} raw />}
                </>
              )}

              {design.source === 'diamond_form' && (
                <>
                  {config.diamond_type && <ConfigField label="Type" value={config.diamond_type} />}
                  {config.diamond_shape && <ConfigField label="Shape" value={config.diamond_shape} />}
                  {config.diamond_size && <ConfigField label="Size" value={config.diamond_size} />}
                  {config.diamond_quality && <ConfigField label="Quality" value={config.diamond_quality} />}
                  {config.selected_gemstone && typeof config.selected_gemstone === 'object' && (() => {
                    // Quote Estimator V3 gemstone picker: the exact stone from the gemstone pool.
                    const sg = config.selected_gemstone as QuoteSelectedGemstone;
                    const rows = quoteGemstoneDetailRows(sg);
                    const image = typeof sg.image === 'string' && /^https?:\/\//i.test(sg.image) ? sg.image : null;
                    const video = typeof sg.video === 'string' && /^https?:\/\//i.test(sg.video) ? sg.video : null;
                    const pdf = typeof sg.pdf === 'string' && /^https?:\/\//i.test(sg.pdf) ? sg.pdf : null;
                    return (
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">Selected Gemstone</p>
                        <div className="flex items-start gap-3 mt-1">
                          {image && <img src={image} alt="" className="w-16 h-16 rounded-md object-cover border border-border shrink-0" loading="lazy" />}
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {formatQuoteGemstoneLabel(sg)}
                              {Number.isFinite(Number(sg.price)) && <span className="ml-2 font-bold text-primary">{new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(Number(sg.price))}</span>}
                            </p>
                            {rows.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                {rows.filter(r => r.label !== 'Gemstone').map(r => `${r.label}: ${r.value}`).join(' · ')}
                              </p>
                            )}
                            {(video || pdf) && (
                              <p className="text-xs text-muted-foreground">
                                {video && <a href={video} target="_blank" rel="noopener noreferrer" className="underline text-primary">View video</a>}
                                {video && pdf && ' · '}
                                {pdf && <a href={pdf} target="_blank" rel="noopener noreferrer" className="underline text-primary">View certificate PDF</a>}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                  {config.selected_diamond && typeof config.selected_diamond === 'object' && (() => {
                    // Quote Estimator diamond picker: the exact stone, mirroring the Ring OS certificate fields.
                    const sd = config.selected_diamond as { carat?: number; color?: string; clarity?: string; price?: number; reportNo?: string | null; lab?: string | null; pdf?: string | null; stoneType?: string };
                    const label = [Number.isFinite(Number(sd.carat)) ? `${Number(Number(sd.carat).toFixed(2))} ct` : '', sd.color ? `${sd.color} Color` : '', sd.clarity || ''].filter(Boolean).join(' ');
                    const cert = [sd.lab, sd.reportNo].filter(Boolean).join(' ');
                    const pdf = typeof sd.pdf === 'string' && /^https?:\/\//i.test(sd.pdf) ? sd.pdf : null;
                    return (
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">Selected Diamond</p>
                        <p className="text-sm font-medium">
                          {label}
                          {Number.isFinite(Number(sd.price)) && <span className="ml-2 font-bold text-primary">{new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(Number(sd.price))}</span>}
                        </p>
                        {(cert || pdf) && (
                          <p className="text-xs text-muted-foreground">
                            {cert && <>Certificate: <span className="text-foreground">{cert}</span></>}
                            {pdf && <> · <a href={pdf} target="_blank" rel="noopener noreferrer" className="underline text-primary">View certificate PDF</a></>}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                  {config.diamond_metal && <ConfigField label="Metal" value={config.diamond_metal} />}
                  {config.diamond_two_tone_metals && <ConfigField label="Two Tone Metals" value={config.diamond_two_tone_metals} />}
                  {config.diamond_metal_karat && <ConfigField label="Metal Karat" value={config.diamond_metal_karat} />}
                  {config.diamond_setting && <ConfigField label="Setting" value={config.diamond_setting} />}
                  {config.diamond_holder && <ConfigField label="Holder" value={config.diamond_holder} />}
                  {config.diamond_band && <ConfigField label="Band" value={config.diamond_band} />}
                  {config.diamond_band_width && <ConfigField label="Band Width" value={config.diamond_band_width} />}
                  {config.diamond_personalization && <ConfigField label="Personalization" value={config.diamond_personalization} />}
                  {config.ring_size && <ConfigField label="Ring Size" value={config.ring_size} raw />}
                  {config.diamond_timeline && <ConfigField label="Timeline" value={config.diamond_timeline} />}
                  {config.budget && <ConfigField label="Budget" value={config.budget} raw />}
                  {estimatedTotal && (
                    <div>
                      <p className="text-xs text-muted-foreground">Estimated Total</p>
                      <p className="text-sm font-bold text-primary">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format(estimatedTotal)}
                      </p>
                    </div>
                  )}
                </>
              )}

              {design.source === 'grill_form' && (
                <>
                  {config.grillz_type && <ConfigField label="Grillz Type" value={config.grillz_type} editable={canEditConfig} configKey="grillz_type" onConfigUpdate={handleConfigEdit} />}
                  {config.metal_type && <ConfigField label="Metal Type" value={config.metal_type} editable={canEditConfig} configKey="metal_type" onConfigUpdate={handleConfigEdit} />}
                  {config.metal_purity && <ConfigField label="Purity" value={config.metal_purity} editable={canEditConfig} configKey="metal_purity" onConfigUpdate={handleConfigEdit} />}
                  <ConfigField label="Top Teeth" value={config.top_teeth === 'none' ? 'None' : config.top_teeth || '—'} raw editable={canEditConfig} configKey="top_teeth" onConfigUpdate={handleConfigEdit} />
                  <ConfigField label="Bottom Teeth" value={config.bottom_teeth === 'none' ? 'None' : config.bottom_teeth || '—'} raw editable={canEditConfig} configKey="bottom_teeth" onConfigUpdate={handleConfigEdit} />
                  {config.budget && <ConfigField label="Budget" value={config.budget} raw />}
                  {config.engraving_text && <ConfigField label="Personalized Inscription" value={config.engraving_text} raw />}
                  {config.additional_notes && <ConfigField label="Vision / Description" value={config.additional_notes} raw />}
                </>
              )}

              {design.source === 'custom_enquiry' && (
                <>
                  {config.jewelry_type && <ConfigField label="Jewelry Type" value={config.jewelry_type} />}
                  {config.budget && <ConfigField label="Budget" value={config.budget} raw />}
                  {config.gold_color && <ConfigField label="Gold Color" value={config.gold_color} />}
                  {config.karat && <ConfigField label="Karat" value={config.karat} raw />}
                  {config.diamond_quality && <ConfigField label="Diamond Quality" value={config.diamond_quality} raw />}
                  {config.diamond_setup && <ConfigField label="Diamond Setup" value={config.diamond_setup} raw />}
                  {config.back_option && <ConfigField label="Back" value={config.back_option} raw />}
                  
                  {config.timeline && <ConfigField label="Timeline" value={config.timeline} raw />}
                  {config.engraving_text && <ConfigField label="Personalized Inscription" value={config.engraving_text} raw />}
                  {config.additional_notes && <ConfigField label="Vision / Description" value={config.additional_notes} raw />}
                </>
              )}

              {design.source === 'ring_builder' && parsedRingBuilder?.selections && (() => {
                const sel = parsedRingBuilder.selections;
                const multi = parsedRingBuilder.multiSelections || {};
                return (
                  <>
                    {sel.nature && <ConfigField label="Diamond Type" value={sel.nature} />}
                    {sel.shape && <ConfigField label="Shape" value={sel.shape} />}
                    {sel.size && <ConfigField label="Size" value={sel.size} />}
                    {sel.quality && <ConfigField label="Quality" value={sel.quality} />}
                    {sel.setting && <ConfigField label="Setting" value={sel.setting} />}
                    {sel.holder && <ConfigField label="Holder" value={sel.holder} />}
                    {sel.band && <ConfigField label="Band" value={sel.band} />}
                    {sel.band_width && <ConfigField label="Band Width" value={sel.band_width} />}
                    {sel.metal && <ConfigField label="Metal" value={sel.metal} />}
                    {sel.personalization && <ConfigField label="Personalization" value={sel.personalization} />}
                    {parsedRingBuilder.ringSize && <ConfigField label="Ring Size" value={parsedRingBuilder.ringSize} raw />}
                    {parsedRingBuilder.budget && <ConfigField label="Budget" value={parsedRingBuilder.budget} raw />}
                    {parsedRingBuilder.timeline && <ConfigField label="Timeline" value={parsedRingBuilder.timeline} raw />}
                    {parsedRingBuilder.engravingText && <ConfigField label="Personalized Inscription" value={parsedRingBuilder.engravingText} raw />}
                    {Object.entries(multi).filter(([_, v]) => Array.isArray(v) && (v as any[]).length > 0).map(([key, val]) => (
                      <ConfigField key={key} label={key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} value={(val as string[]).join(', ')} raw />
                    ))}
                  </>
                );
              })()}

              {design.source === 'ring_builder' && !parsedRingBuilder && (
                <>
                  {config.request_type && <ConfigField label="Request Type" value={String(config.request_type).replace(/_/g, ' ')} raw />}
                  {config.preferred_style && <ConfigField label="Style" value={config.preferred_style} />}
                  {(config.preferred_metal || config.metal_preference) && <ConfigField label="Metal" value={config.preferred_metal || config.metal_preference} />}
                  {(config.preferred_stone || config.stone_preference) && <ConfigField label="Stone" value={config.preferred_stone || config.stone_preference} />}
                  {config.size && <ConfigField label="Size" value={config.size} raw />}
                  {config.budget_range && <ConfigField label="Budget" value={String(config.budget_range).replace(/_/g, ' ')} raw />}
                  {config.timeline && <ConfigField label="Timeline" value={String(config.timeline).replace(/_/g, ' ')} raw />}
                  {config.priority && <ConfigField label="Priority" value={config.priority} raw />}
                </>
              )}

              {design.source === 'metal_iq' && (
                <>
                  {config.metal_type && <ConfigField label="Metal Type" value={config.metal_type} />}
                  {config.karat && <ConfigField label="Karat / Purity" value={config.karat} raw />}
                  {config.weight_grams && <ConfigField label="Weight" value={`${config.weight_grams}g`} raw />}
                  {config.knows_karat !== undefined && <ConfigField label="Knows Karat" value={config.knows_karat ? 'Yes' : 'No'} raw />}
                  {config.knows_weight !== undefined && <ConfigField label="Knows Weight" value={config.knows_weight ? 'Yes' : 'No'} raw />}
                  {config.knows_authentic !== undefined && (
                    <ConfigField
                      label="Authenticity"
                      value={config.knows_authentic ? (config.is_authentic ? 'Verified' : 'Not Authentic') : 'Unsure'}
                      raw
                    />
                  )}
                  {config.location && <ConfigField label="Location" value={config.location} raw />}
                  {config.lead_score && <ConfigField label="Lead Score" value={config.lead_score} />}
                </>
              )}

              {configuredQuestions.length > 0 && configuredQuestions.map((q) => {
                let answer: string = '—';
                const key = q.question_key;

                if (design.source === 'grill_form' || design.source === 'custom_enquiry') {
                  const qa = config.question_answers?.[key];
                  if (qa) {
                    if (q.question_type === 'yes_no') {
                      const a = qa.answer;
                      const isYes = a === true || (typeof a === 'string' && a.toLowerCase() === 'yes');
                      const isNo = a === false || (typeof a === 'string' && a.toLowerCase() === 'no');
                      answer = isYes ? (qa.text ? `Yes — ${qa.text}` : 'Yes') : isNo ? 'No' : '—';
                    } else if (qa.text) {
                      answer = qa.text;
                    } else if (qa.answer !== null && qa.answer !== undefined) {
                      answer = String(qa.answer);
                    }
                  }
                } else if (design.source === 'ring_builder') {
                  const val = parsedRingBuilder?.questionAnswers?.[key];
                  if (val !== null && val !== undefined) {
                    answer = typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val);
                  }
                } else if (design.source === 'diamond_form') {
                  const val = config.custom_answers?.[key];
                  if (val !== null && val !== undefined) {
                    answer = String(val);
                  }
                }

                return <ConfigField key={key} label={q.question_text} value={answer} raw />;
              })}
            </div>
          </SectionCard>

          {/* 3. REQUEST & NOTES (merged, deduplicated) */}
          {showRequestNotes && (
            <SectionCard title="Request & Notes" icon={FileText} defaultOpen={false}>
              <div className="space-y-3">
                {(config.jewelry_type || config.request_type) && (
                  <div>
                    <span className="text-xs text-muted-foreground">Item: </span>
                    <span className="text-sm font-medium capitalize">
                      {(config.jewelry_type || config.request_type || '').replace(/-|_/g, ' ')}
                    </span>
                  </div>
                )}
                {requestDescription && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{requestDescription}</p>
                )}
                {mergedNotes.map((note, idx) => (
                  <p key={idx} className="text-sm text-muted-foreground leading-relaxed">{note}</p>
                ))}
              </div>
            </SectionCard>
          )}

          {/* 4. PRICING */}
          {design.source === 'metal_iq' && (config.spot_price_per_gram || config.spot_price_at_time) ? (() => {
            const cs = getCurrencySymbol(config.currency || currency);
            const spotPerGram = config.spot_price_per_gram ? Number(config.spot_price_per_gram) : (config.spot_price_at_time ? config.spot_price_at_time / 31.1035 : null);
            const pureVal = config.pure_metal_value ? Number(config.pure_metal_value) : null;
            const buyPct = config.buy_percentage ?? (pureVal && config.our_offer ? (Number(config.our_offer) / pureVal) * 100 : null);
            const competitorPct = pureVal && config.competitor_offer ? (Number(config.competitor_offer) / pureVal) * 100 : null;
            return (
            <SectionCard title="Offer Overview" icon={DollarSign} defaultOpen={true}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {config.spot_price_at_time && (
                  <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Spot Price</p>
                    <p className="text-sm font-bold text-foreground">{cs}{Number(config.spot_price_at_time).toLocaleString()}/oz</p>
                    {spotPerGram && <p className="text-[10px] text-muted-foreground">{cs}{spotPerGram.toFixed(2)}/g{config.spot_price_date ? ` · ${config.spot_price_date}` : ''}</p>}
                  </div>
                )}
                {pureVal && (
                  <div className="p-3 rounded-lg bg-muted/50 border border-border/50">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Pure Metal Value</p>
                    <p className="text-sm font-bold text-foreground">{cs}{pureVal.toFixed(2)}</p>
                  </div>
                )}
                {config.our_offer != null && (
                  <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Your Offer{buyPct ? ` (${buyPct.toFixed(0)}%)` : ''}</p>
                    <p className="text-sm font-bold text-primary">{cs}{Number(config.our_offer).toFixed(2)}</p>
                    {config.competitor_offer != null && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">Competitor: {cs}{Number(config.competitor_offer).toFixed(2)}{competitorPct ? ` (${competitorPct.toFixed(0)}%)` : ''}</p>
                    )}
                  </div>
                )}
                {config.estimated_profit != null && (
                  <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Est. Profit</p>
                    <p className="text-sm font-bold text-emerald-600">{cs}{Number(config.estimated_profit).toFixed(2)}</p>
                  </div>
                )}
              </div>
              {config.our_offer != null && config.competitor_offer != null && Number(config.our_offer) > Number(config.competitor_offer) && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-md px-3 py-2 text-xs text-emerald-700 font-medium mt-3">
                  +{cs}{(Number(config.our_offer) - Number(config.competitor_offer)).toFixed(2)} more with us
                </div>
              )}
            </SectionCard>
            );
          })() : design.source === 'widget' ? (
            <LeadCataloguePrice
              clientId={clientId}
              configuration={config}
              currency={currency}
            />
          ) : design.source !== 'booking' && design.source !== 'metal_iq' ? (
            <LeadCostEstimation
              leadId={design.id}
              leadSource={design.source}
              clientId={clientId}
              configuration={config}
              existingEstimate={estimatedTotal}
              currency={currency}
            />
          ) : null}

          {/* 5. SEND QUOTE - hide for metal_iq and booking */}
          {design.source !== 'metal_iq' && design.source !== 'booking' && (
            <SendQuoteSection
              leadId={design.id}
              leadSource={design.source}
              clientId={clientId}
              customerEmail={design.customer_email}
              customerName={design.customer_name}
              currency={currency}
            />
          )}

          {/* 6. CAD REQUEST - All lead sources */}
          {(design.source === 'widget' || design.source === 'ring_builder' || design.source === 'grill_form' || design.source === 'custom_enquiry' || design.source === 'diamond_form') && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Ruler className="h-4 w-4 text-muted-foreground" />
                  CAD File Request
                </h3>
                {(design.source === 'widget' || design.source === 'ring_builder' || design.source === 'diamond_form') && (
                  <>
                    <p className="text-xs text-muted-foreground mb-3">
                      Standard CAD files are provided at ring size 6 and 3ct carat size. Request a CAD file for this lead's configuration.
                    </p>
                    {config.size && (
                      <div className="flex items-center gap-2 mb-3 text-sm">
                        <span className="text-muted-foreground">Ring Size:</span>
                        <span className="font-medium">{config.size}</span>
                        {config.size !== '6' && (
                          <Badge variant="outline" className="text-[10px] border-amber-500/30 text-amber-600">
                            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Non-standard size
                          </Badge>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Persistent acknowledgment from DB */}
                {existingCadRequest ? (
                  <div className="space-y-3">
                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-md p-3 text-sm text-emerald-700">
                      <Check className="h-4 w-4 inline mr-1.5" />
                      CAD request submitted successfully
                      <span className="block text-xs text-emerald-600 mt-1">
                        Requested on {format(new Date(existingCadRequest.created_at), "MMM d, yyyy 'at' h:mm a")}
                        {' · '}Status: <span className="font-medium capitalize">{existingCadRequest.status.replace('_', ' ')}</span>
                      </span>
                    </div>

                    {/* Show delivered CAD files */}
                    {cadFileSignedUrls.length > 0 && (
                      <div className="bg-muted/50 rounded-md p-3 space-y-2">
                        <p className="text-xs font-medium text-foreground">📁 Delivered CAD Files</p>
                        {cadFileSignedUrls.map((file, idx) => (
                          <a
                            key={idx}
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-xs p-2 rounded border bg-background hover:bg-muted transition-colors"
                          >
                            <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="truncate flex-1">{file.name}</span>
                            <span className="text-primary text-[10px] font-medium">Download</span>
                          </a>
                        ))}
                        {existingCadRequest.delivered_at && (
                          <p className="text-[10px] text-muted-foreground">
                            Delivered on {format(new Date(existingCadRequest.delivered_at), "MMM d, yyyy 'at' h:mm a")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCadDialogOpen(true)}
                  >
                    <Ruler className="h-3.5 w-3.5 mr-1.5" /> Request CAD File
                  </Button>
                )}
                {design.source === 'widget' && (
                  <button
                    onClick={() => setNewRingCadDialogOpen(true)}
                    className="text-xs text-primary hover:text-primary/80 underline underline-offset-2 mt-1.5 inline-block"
                  >
                    Request a CAD for a different ring? Click here
                  </button>
                )}
              </div>

              {/* CAD Request Dialog */}
              <NewCadRequestDialog
                open={cadDialogOpen}
                onOpenChange={setCadDialogOpen}
                clientId={clientId}
                onCreated={() => {
                  setCadDialogOpen(false);
                  // Re-check existing request
                  (async () => {
                    const { data } = await (supabase as any)
                      .from('cad_requests')
                      .select('id, status, created_at, cad_file_urls, delivered_at')
                      .eq('lead_id', design.id)
                      .order('created_at', { ascending: false })
                      .limit(1)
                      .maybeSingle();
                    if (data) {
                      setExistingCadRequest(data);
                      setCadRequested(true);
                    }
                  })();
                }}
                prefill={{
                  source: design.source === 'widget' ? 'ring_os' : design.source === 'diamond_form' ? 'ring_builder' : design.source === 'grill_form' ? 'grillz' : design.source === 'custom_enquiry' ? 'custom_enquiry' : design.source,
                  leadId: design.id,
                  leadTable: design.source === 'widget' ? 'saved_designs' : design.source === 'diamond_form' ? 'diamond_form_leads' : design.source === 'grill_form' ? 'grill_form_leads' : design.source === 'custom_enquiry' ? 'custom_enquiry_leads' : design.source === 'ring_builder' ? 'design_requests' : 'saved_designs',
                  customerName: design.customer_name || '',
                  customerEmail: design.customer_email || '',
                  ringProductName: config.style || config.productName || design.product_name || '',
                  metalType: config.metal || config.metalType || config.metal_type || '',
                  style: config.style || '',
                  shape: config.shape || config.diamond_shape || '',
                  ringSize: config.size || config.ring_size || '',
                  caratSize: config.carat || config.caratSize || config.carat_size || '',
                  customDescription: '',
                  // Grillz-specific
                  grillzType: config.grillz_type || '',
                  topTeeth: config.top_teeth || '',
                  bottomTeeth: config.bottom_teeth || '',
                  metalPurity: config.metal_purity || config.karat || '',
                  // Custom enquiry-specific
                  jewelryType: config.jewelry_type || '',
                  budget: config.budget || '',
                  timeline: config.timeline || config.diamond_timeline || '',
                  // Ring builder / diamond-specific
                  setting: config.diamond_setting || (parsedRingBuilder?.selections?.setting) || '',
                  band: config.diamond_band || (parsedRingBuilder?.selections?.band) || '',
                }}
              />

              {/* New Ring CAD Request Dialog (no product prefill) */}
              <NewCadRequestDialog
                open={newRingCadDialogOpen}
                onOpenChange={setNewRingCadDialogOpen}
                clientId={clientId}
                onCreated={() => {
                  setNewRingCadDialogOpen(false);
                  (async () => {
                    const { data } = await (supabase as any)
                      .from('cad_requests')
                      .select('id, status, created_at, cad_file_urls, delivered_at')
                      .eq('lead_id', design.id)
                      .order('created_at', { ascending: false })
                      .limit(1)
                      .maybeSingle();
                    if (data) {
                      setExistingCadRequest(data);
                      setCadRequested(true);
                    }
                  })();
                }}
                prefill={{
                  source: design.source === 'widget' ? 'ring_os' : design.source === 'diamond_form' ? 'ring_builder' : design.source === 'grill_form' ? 'grillz' : design.source === 'custom_enquiry' ? 'custom_enquiry' : design.source,
                  leadId: design.id,
                  leadTable: design.source === 'widget' ? 'saved_designs' : design.source === 'diamond_form' ? 'diamond_form_leads' : design.source === 'grill_form' ? 'grill_form_leads' : design.source === 'custom_enquiry' ? 'custom_enquiry_leads' : design.source === 'ring_builder' ? 'design_requests' : 'saved_designs',
                  customerName: design.customer_name || '',
                  customerEmail: design.customer_email || '',
                  customDescription: '',
                }}
              />
            </>
          )}
        </div>

        {/* Right sidebar - Follow-up + Linked Bookings */}
        <div className="lg:col-span-1">
          <div className="sticky top-4 space-y-4">
            <Card>
              <CardContent className="p-4 sm:p-5">
                <LeadFollowUpSection
                  leadId={design.id}
                  leadSource={design.source}
                  clientId={clientId}
                  currentStatus={design.follow_up_status}
                  customerEmail={design.customer_email}
                  customerName={design.customer_name}
                  tags={leadStatusTags}
                  getTagColor={getLeadTagColor}
                  onCreateTag={addLeadTag}
                  onDeleteTag={hasEditAccess ? deleteLeadTag : undefined}
                  onStatusChange={(newStatus) => onStatusChange(design, newStatus)}
                  hasEditAccess={hasEditAccess}
                />
              </CardContent>
            </Card>

            {/* Linked Bookings */}
            <LinkedBookingsPanel customerEmail={design.customer_email} clientId={clientId} />
          </div>
        </div>
      </div>
    </div>
  );
};
