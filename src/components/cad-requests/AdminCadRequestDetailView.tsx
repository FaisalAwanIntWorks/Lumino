import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft, FileDown, Clock, CheckCircle2, XCircle, Loader2,
  Package, Gem, MessageSquare, Upload, Building2, Image,
  ThumbsUp, ThumbsDown, Sparkles, FileText, RotateCcw, User, Star,
} from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getSignedUrl } from "@/lib/storage-utils";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { GrillTeethDiagram } from "@/components/leads/GrillTeethDiagram";
import { CadRequestChat } from "@/components/cad-requests/CadRequestChat";

interface CadRequest {
  id: string;
  client_id: string;
  requested_by: string;
  source: string;
  order_id: string | null;
  lead_id: string | null;
  lead_table: string | null;
  ring_product_name: string | null;
  is_custom_ring: boolean;
  metal_type: string | null;
  style: string | null;
  shape: string | null;
  ring_size: string | null;
  carat_size: string | null;
  custom_description: string | null;
  client_notes: string | null;
  status: string;
  priority: string;
  admin_notes: string | null;
  cad_file_urls: string[] | null;
  delivered_at: string | null;
  customer_name: string | null;
  customer_email: string | null;
  client_feedback: string | null;
  request_number: number | null;
  created_at: string;
  updated_at: string;
  clients: { company_name: string } | null;
}

const formatRequestNumber = (n: number | null) => n ? `CAD-${String(n).padStart(4, '0')}` : null;
const SEGMENTED_SOURCES = ['grillz', 'custom_enquiry', 'ring_builder'];
const STATUS_OPTIONS = ["pending", "in_progress", "completed", "revision_requested", "rejected"] as const;
const PRIORITY_OPTIONS = ["low", "normal", "high", "urgent"] as const;

const statusConfig: Record<string, { label: string; icon: any; className: string }> = {
  pending: { label: "Pending", icon: Clock, className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
  in_progress: { label: "In Progress", icon: Loader2, className: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
  completed: { label: "Completed", icon: CheckCircle2, className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
  revision_requested: { label: "Revision Requested", icon: RotateCcw, className: "bg-orange-500/15 text-orange-600 border-orange-500/30" },
  rejected: { label: "Rejected", icon: XCircle, className: "bg-red-500/15 text-red-600 border-red-500/30" },
};

const sourceLabels: Record<string, string> = {
  ring_os: "Ring OS", ring_builder: "Ring Builder", grillz: "Grillz", custom_enquiry: "Custom Enquiry", custom: "Custom",
};

const ConfigField = ({ label, value, raw }: { label: string; value: string; raw?: boolean }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium capitalize">{raw ? value : String(value).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</p>
  </div>
);

const ImageGallery = ({ images, loading, title, showFeedback = false, showCustomInstruction = false, selectedRefUrl }: {
  images: Array<{ image_url: string; feedback: string | null; custom_instruction?: string | null }> | string[];
  loading: boolean; title: string; showFeedback?: boolean; showCustomInstruction?: boolean; selectedRefUrl?: string | null;
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  if (loading) return <div className="flex gap-3 overflow-x-auto pb-1">{[0,1,2].map(i => <div key={i} className="h-32 w-32 rounded-lg bg-muted animate-pulse flex-shrink-0" />)}</div>;
  const normalized = images.map(img => typeof img === 'string' ? { image_url: img, feedback: null, custom_instruction: null } : img);
  if (normalized.length === 0) return <p className="text-xs text-muted-foreground italic">No images available</p>;
  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {normalized.map((item, idx) => (
          <div key={idx} className="flex-shrink-0">
            <div className="relative">
              <img src={item.image_url} alt={`${title} ${idx + 1}`}
                className={`h-32 w-32 sm:h-40 sm:w-40 object-contain rounded-lg border cursor-pointer hover:opacity-80 transition-opacity bg-muted/50 p-1 ${
                  selectedRefUrl && selectedRefUrl === item.image_url ? 'border-primary border-2 ring-2 ring-primary/20' : 'border-border/50'
                }`}
                onClick={() => setSelectedImage(item.image_url)} />
              {selectedRefUrl && selectedRefUrl === item.image_url && (
                <div className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                  <Star className="w-2.5 h-2.5" /> CAD Ref
                </div>
              )}
              {showFeedback && item.feedback && (
                <div className={`absolute top-1.5 ${selectedRefUrl && selectedRefUrl === item.image_url ? 'right-12' : 'right-1.5'} w-5 h-5 rounded-full flex items-center justify-center ${item.feedback === 'liked' ? 'bg-emerald-500' : 'bg-red-500'}`}>
                  {item.feedback === 'liked' ? <ThumbsUp className="w-3 h-3 text-white" /> : <ThumbsDown className="w-3 h-3 text-white" />}
                </div>
              )}
            </div>
            {showCustomInstruction && item.custom_instruction && (
              <p className="mt-1.5 text-xs text-muted-foreground italic max-w-[8rem] sm:max-w-[10rem] line-clamp-3" title={item.custom_instruction}>"{item.custom_instruction}"</p>
            )}
          </div>
        ))}
      </div>
      <Dialog open={!!selectedImage} onOpenChange={(open) => { if (!open) setSelectedImage(null); }}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-4 sm:p-6 flex items-center justify-center">
          {selectedImage && <img src={selectedImage} alt={title} className="max-w-full max-h-[80vh] object-contain rounded-lg" />}
        </DialogContent>
      </Dialog>
    </>
  );
};

function getLeadTable(source: string, leadTable: string | null): string | null {
  if (leadTable) return leadTable;
  switch (source) { case 'ring_os': return 'saved_designs'; case 'ring_builder': return 'design_requests'; case 'grillz': return 'grill_form_leads'; case 'custom_enquiry': case 'custom': return 'custom_enquiry_leads'; default: return null; }
}
function getPreviewTable(source: string): string | null {
  switch (source) { case 'grillz': return 'grill_preview_images'; case 'custom_enquiry': case 'custom': return 'custom_enquiry_preview_images'; case 'ring_builder': return 'ring_preview_images'; default: return null; }
}
function cadSourceToLeadSource(source: string): string {
  switch (source) { case 'ring_os': return 'widget'; case 'grillz': return 'grill_form'; case 'custom_enquiry': case 'custom': return 'custom_enquiry'; default: return source; }
}

interface AdminCadRequestDetailViewProps { request: CadRequest; onBack: () => void; }

export function AdminCadRequestDetailView({ request: initialRequest, onBack }: AdminCadRequestDetailViewProps) {
  const qc = useQueryClient();
  const [request, setRequest] = useState(initialRequest);
  const [notesText, setNotesText] = useState(request.admin_notes || "");
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string } | null>(null);

  const [leadData, setLeadData] = useState<any>(null);
  const [leadLoading, setLeadLoading] = useState(false);
  const [previewImages, setPreviewImages] = useState<Array<{ image_url: string; feedback: string | null; custom_instruction?: string | null }>>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [jewelerRefSignedUrls, setJewelerRefSignedUrls] = useState<string[]>([]);

  const isSegmented = SEGMENTED_SOURCES.includes(request.source);
  const jewelerRefSource = (request as any).jeweler_reference_source as string | null;
  const jewelerRefUrls = (request as any).jeweler_reference_urls as string[] | null;
  const selectedRefImages = (request as any).reference_images as string[] | null;
  const selectedRefUrl = selectedRefImages?.[0] || null;

  const sc = statusConfig[request.status] || statusConfig.pending;
  const StatusIcon = sc.icon;

  useEffect(() => {
    const channel = supabase.channel(`admin-cad-request-detail-${initialRequest.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "cad_requests", filter: `id=eq.${initialRequest.id}` },
        (payload) => { setRequest((prev) => ({ ...prev, ...payload.new })); qc.invalidateQueries({ queryKey: ["admin-cad-requests"] }); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [initialRequest.id, qc]);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => { if (data.user) setCurrentUser({ id: data.user.id, email: data.user.email || "Admin" }); }); }, []);

  useEffect(() => {
    if (!request.lead_id) return;
    const table = getLeadTable(request.source, request.lead_table);
    if (!table) return;
    setLeadLoading(true);
    (async () => { try { const { data } = await (supabase as any).from(table).select('*').eq('id', request.lead_id).maybeSingle(); if (data) setLeadData(data); } catch (e) { console.error('Failed to fetch lead data:', e); } finally { setLeadLoading(false); } })();
  }, [request.lead_id, request.source, request.lead_table]);

  useEffect(() => {
    if (!request.lead_id) return;
    const previewTable = getPreviewTable(request.source);
    if (!previewTable) return;
    setPreviewLoading(true);
    (async () => { try { const { data } = await (supabase as any).from(previewTable).select('image_url, generation_number, feedback, custom_instruction').eq('lead_id', request.lead_id).order('generation_number', { ascending: true }); if (data) setPreviewImages(data); } catch (e) { console.error('Failed to fetch preview images:', e); } finally { setPreviewLoading(false); } })();
  }, [request.lead_id, request.source]);

  useEffect(() => {
    if (!jewelerRefUrls?.length) return;
    (async () => { const urls: string[] = []; for (const path of jewelerRefUrls) { if (path.startsWith('http')) { urls.push(path); continue; } const signed = await getSignedUrl('cad-deliveries', path); if (signed) urls.push(signed); } setJewelerRefSignedUrls(urls); })();
  }, [jewelerRefUrls]);

  const config = useMemo(() => { if (!leadData) return {}; if (leadData.configuration) return leadData.configuration; return leadData; }, [leadData]);
  const parsedRingBuilder = useMemo(() => { const ls = cadSourceToLeadSource(request.source); if (ls !== 'ring_builder' || !config.description) return null; try { if (typeof config.description === 'string') return JSON.parse(config.description); } catch {} return null; }, [request.source, config.description]);
  const leadSource = cadSourceToLeadSource(request.source);
  const requestDescription = useMemo(() => { if (leadSource === 'custom_enquiry') return config.additional_notes || config.description; if (leadSource === 'ring_builder') { if (parsedRingBuilder?.otherDetails) return parsedRingBuilder.otherDetails; return null; } return null; }, [leadSource, config, parsedRingBuilder]);
  const referenceImages = useMemo(() => {
    if (leadSource === 'diamond_form' && config.inspiration_image_urls?.length > 0) return { title: 'Inspiration Images', images: config.inspiration_image_urls };
    if (leadSource === 'ring_builder' && config.reference_images?.length > 0) return { title: 'Reference Images', images: config.reference_images };
    if ((leadSource === 'grill_form' || leadSource === 'custom_enquiry') && config.uploaded_image_urls?.length > 0) return { title: 'Uploaded Images', images: config.uploaded_image_urls };
    return null;
  }, [leadSource, config]);

  const hasLeadConfig = leadData && !leadLoading;

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: string; [key: string]: any }) => { const { id, ...update } = payload; const { error } = await supabase.from("cad_requests" as any).update(update as any).eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-cad-requests"] }); toast.success("Request updated"); },
    onError: () => toast.error("Failed to update request"),
  });

  const handleFileUpload = useCallback(async (files: FileList) => {
    setUploading(true);
    try {
      const existingUrls = request.cad_file_urls || [];
      const newUrls: string[] = [];
      for (const file of Array.from(files)) { const filePath = `${request.id}/${Date.now()}-${file.name}`; const { error } = await supabase.storage.from("cad-deliveries").upload(filePath, file); if (error) throw error; newUrls.push(filePath); }
      const allUrls = [...existingUrls, ...newUrls];
      await updateMutation.mutateAsync({ id: request.id, cad_file_urls: allUrls, delivered_at: new Date().toISOString(), status: "completed" });
      setRequest(prev => ({ ...prev, cad_file_urls: allUrls, delivered_at: new Date().toISOString(), status: "completed" }));
      try { await supabase.from("client_notifications").insert({ client_id: request.client_id, category: "lead", title: "CAD Design Delivered", message: `Your CAD design${request.customer_name ? ` for ${request.customer_name}` : ''}${request.ring_product_name ? ` (${request.ring_product_name})` : ''} has been delivered.`, metadata: { lead_id: request.lead_id, table: request.lead_table || 'saved_designs', cad_request_id: request.id } } as any); } catch {}
      try { await supabase.functions.invoke("notify-cad-delivery", { body: { cad_request_id: request.id, client_id: request.client_id, customer_name: request.customer_name || undefined, product_name: request.ring_product_name || undefined } }); } catch {}
      toast.success(`${files.length} file(s) uploaded and delivered`);
    } catch (err) { console.error("Upload error:", err); toast.error("Failed to upload CAD file"); }
    finally { setUploading(false); }
  }, [request, updateMutation]);

  const handleDownload = async (url: string) => {
    setDownloading(url);
    try { if (!url.startsWith("http")) { const signedUrl = await getSignedUrl("cad-deliveries", url); if (signedUrl) window.open(signedUrl, "_blank"); else toast.error("Failed to generate download link"); } else { window.open(url, "_blank"); } }
    catch { toast.error("Failed to download file"); } finally { setDownloading(null); }
  };

  const InfoRow = ({ label, value }: { label: string; value: string | null | undefined }) => {
    if (!value) return null;
    return (<div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0"><span className="text-xs text-muted-foreground">{label}</span><span className="text-sm font-medium">{value}</span></div>);
  };

  const renderLeadConfig = () => {
    if (!hasLeadConfig) return null;
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
        {leadSource === 'widget' && (<>{config.style && <ConfigField label="Style" value={config.style} />}{config.shank && <ConfigField label="Shank" value={config.shank} />}{config.metal && <ConfigField label="Metal" value={config.metal} />}{config.shape && <ConfigField label="Shape" value={config.shape} />}{config.caratRange != null && <ConfigField label="Carat" value={String(config.caratRange)} raw />}{config.size && <ConfigField label="Size" value={String(config.size)} raw />}{config.visualColor && <ConfigField label="Color" value={config.visualColor} />}{config.stone && <ConfigField label="Stone" value={config.stone} />}{config.engraving?.enabled && <ConfigField label="Engraving" value={config.engraving.text || 'Enabled'} raw />}</>)}
        {leadSource === 'diamond_form' && (<>{config.diamond_type && <ConfigField label="Type" value={config.diamond_type} />}{config.diamond_shape && <ConfigField label="Shape" value={config.diamond_shape} />}{config.diamond_size && <ConfigField label="Size" value={config.diamond_size} />}{config.diamond_quality && <ConfigField label="Quality" value={config.diamond_quality} />}{config.diamond_metal && <ConfigField label="Metal" value={config.diamond_metal} />}{config.diamond_setting && <ConfigField label="Setting" value={config.diamond_setting} />}{config.diamond_holder && <ConfigField label="Holder" value={config.diamond_holder} />}{config.diamond_band && <ConfigField label="Band" value={config.diamond_band} />}{config.diamond_band_width && <ConfigField label="Band Width" value={config.diamond_band_width} />}{config.diamond_personalization && <ConfigField label="Personalization" value={config.diamond_personalization} />}{config.ring_size && <ConfigField label="Ring Size" value={config.ring_size} raw />}{config.diamond_timeline && <ConfigField label="Timeline" value={config.diamond_timeline} />}{config.budget && <ConfigField label="Budget" value={config.budget} raw />}</>)}
        {leadSource === 'grill_form' && (<>{config.grillz_type && <ConfigField label="Grillz Type" value={config.grillz_type} />}{config.metal_type && <ConfigField label="Metal Type" value={config.metal_type} />}{config.metal_purity && <ConfigField label="Purity" value={config.metal_purity} />}<ConfigField label="Top Teeth" value={config.top_teeth === 'none' ? 'None' : config.top_teeth || '—'} raw /><ConfigField label="Bottom Teeth" value={config.bottom_teeth === 'none' ? 'None' : config.bottom_teeth || '—'} raw />{config.budget && <ConfigField label="Budget" value={config.budget} raw />}</>)}
        {leadSource === 'custom_enquiry' && (<>{config.jewelry_type && <ConfigField label="Jewelry Type" value={config.jewelry_type} />}{config.budget && <ConfigField label="Budget" value={config.budget} raw />}{config.gold_color && <ConfigField label="Gold Color" value={config.gold_color} />}{config.karat && <ConfigField label="Karat" value={config.karat} raw />}{config.diamond_quality && <ConfigField label="Diamond Quality" value={config.diamond_quality} raw />}{config.diamond_setup && <ConfigField label="Diamond Setup" value={config.diamond_setup} raw />}{config.back_option && <ConfigField label="Back" value={config.back_option} raw />}{config.timeline && <ConfigField label="Timeline" value={config.timeline} raw />}</>)}
        {leadSource === 'ring_builder' && parsedRingBuilder?.selections && (() => { const sel = parsedRingBuilder.selections; const multi = parsedRingBuilder.multiSelections || {}; return (<>{sel.nature && <ConfigField label="Diamond Type" value={sel.nature} />}{sel.shape && <ConfigField label="Shape" value={sel.shape} />}{sel.size && <ConfigField label="Size" value={sel.size} />}{sel.quality && <ConfigField label="Quality" value={sel.quality} />}{sel.setting && <ConfigField label="Setting" value={sel.setting} />}{sel.holder && <ConfigField label="Holder" value={sel.holder} />}{sel.band && <ConfigField label="Band" value={sel.band} />}{sel.band_width && <ConfigField label="Band Width" value={sel.band_width} />}{sel.metal && <ConfigField label="Metal" value={sel.metal} />}{sel.personalization && <ConfigField label="Personalization" value={sel.personalization} />}{parsedRingBuilder.ringSize && <ConfigField label="Ring Size" value={parsedRingBuilder.ringSize} raw />}{parsedRingBuilder.budget && <ConfigField label="Budget" value={parsedRingBuilder.budget} raw />}{parsedRingBuilder.timeline && <ConfigField label="Timeline" value={parsedRingBuilder.timeline} raw />}{Object.entries(multi).filter(([_, v]) => Array.isArray(v) && (v as any[]).length > 0).map(([key, val]) => (<ConfigField key={key} label={key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} value={(val as string[]).join(', ')} raw />))}</>); })()}
        {leadSource === 'ring_builder' && !parsedRingBuilder && (<>{config.request_type && <ConfigField label="Request Type" value={String(config.request_type).replace(/_/g, ' ')} raw />}{config.preferred_style && <ConfigField label="Style" value={config.preferred_style} />}{(config.preferred_metal || config.metal_preference) && <ConfigField label="Metal" value={config.preferred_metal || config.metal_preference} />}{(config.preferred_stone || config.stone_preference) && <ConfigField label="Stone" value={config.preferred_stone || config.stone_preference} />}{config.size && <ConfigField label="Size" value={config.size} raw />}{config.budget_range && <ConfigField label="Budget" value={String(config.budget_range).replace(/_/g, ' ')} raw />}{config.timeline && <ConfigField label="Timeline" value={String(config.timeline).replace(/_/g, ' ')} raw />}</>)}
        {config.question_answers && Object.entries(config.question_answers).map(([key, qa]: [string, any]) => { let answer = '—'; if (qa?.answer === true) answer = 'Yes'; else if (qa?.answer === false) answer = 'No'; else if (qa?.text) answer = qa.text; else if (qa?.answer != null) answer = String(qa.answer); const label = qa?.question || key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()); return <ConfigField key={key} label={label} value={answer} raw />; })}
        {parsedRingBuilder?.questionAnswers && Object.entries(parsedRingBuilder.questionAnswers).map(([key, val]: [string, any]) => { const answer = typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val ?? '—'); return <ConfigField key={key} label={key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())} value={answer} raw />; })}
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 -ml-2"><ArrowLeft className="h-4 w-4" />Back to CAD Requests</Button>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">
            {formatRequestNumber(request.request_number) && <span className="text-muted-foreground font-mono mr-2">{formatRequestNumber(request.request_number)}</span>}
            {request.ring_product_name || request.custom_description?.slice(0, 50) || "CAD Request"}
          </h2>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="outline" className="text-[10px]">{sourceLabels[request.source] || request.source}</Badge>
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Building2 className="h-3 w-3" />{request.clients?.company_name || 'Unknown Client'}</span>
            <span className="text-xs text-muted-foreground">•</span>
            <span className="text-xs text-muted-foreground">{format(new Date(request.created_at), "MMM d, yyyy 'at' h:mm a")}</span>
          </div>
        </div>
        <Badge variant="outline" className={`${sc.className} text-xs`}><StatusIcon className={`h-3 w-3 mr-1 ${request.status === 'in_progress' ? 'animate-spin' : ''}`} />{sc.label}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2 space-y-4">

          {/* Client Info Card - always shown */}
          <Card>
            <CardContent className="p-4 sm:p-5">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" />Requested By (Client)</h4>
              <div className="space-y-0">
                <InfoRow label="Company" value={request.clients?.company_name} />
                <InfoRow label="Source" value={sourceLabels[request.source] || request.source} />
                <InfoRow label="Requested" value={format(new Date(request.created_at), "MMM d, yyyy 'at' h:mm a")} />
                {request.order_id && <InfoRow label="Order ID" value={request.order_id} />}
              </div>
            </CardContent>
          </Card>

          {isSegmented ? (
            <>
              {/* SECTION 1: Customer Information */}
              <Card className="border-blue-500/20">
                <CardContent className="p-4 sm:p-5">
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><User className="h-4 w-4 text-blue-500" />Customer Information</h4>
                  <div className="space-y-0">
                    <InfoRow label="Name" value={request.customer_name} />
                    <InfoRow label="Email" value={request.customer_email} />
                  </div>
                </CardContent>
              </Card>

              {hasLeadConfig && (
                <Card className="border-blue-500/10">
                  <CardContent className="p-4 sm:p-5">
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-blue-500/70" />Customer Selections (from Form)</h4>
                    {leadLoading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div> : renderLeadConfig()}
                  </CardContent>
                </Card>
              )}

              {leadSource === 'grill_form' && hasLeadConfig && (config.top_teeth || config.bottom_teeth) && (
                <Card className="border-blue-500/10"><CardContent className="p-4 sm:p-5"><h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-muted-foreground" />Selected Teeth</h4><GrillTeethDiagram topTeeth={config.top_teeth || 'none'} bottomTeeth={config.bottom_teeth || 'none'} metalType={config.metal_type} /></CardContent></Card>
              )}

              {(previewImages.length > 0 || previewLoading) && (
                <Card className="border-blue-500/10"><CardContent className="p-4 sm:p-5"><h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Image className="h-4 w-4 text-blue-500/70" />AI Generated Previews</h4><ImageGallery images={previewImages} loading={previewLoading} title="AI Preview" showFeedback showCustomInstruction selectedRefUrl={jewelerRefSource === 'ai_preview' ? selectedRefUrl : null} /></CardContent></Card>
              )}

              {referenceImages && (
                <Card className="border-blue-500/10"><CardContent className="p-4 sm:p-5"><h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Image className="h-4 w-4 text-blue-500/70" />{referenceImages.title}</h4><ImageGallery images={referenceImages.images} loading={false} title={referenceImages.title} selectedRefUrl={jewelerRefSource === 'customer_upload' ? selectedRefUrl : null} /></CardContent></Card>
              )}

              {/* SECTION 2: Jeweler's Instructions */}
              <Card className="border-primary/20">
                <CardContent className="p-4 sm:p-5">
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Gem className="h-4 w-4 text-primary" />Jeweler's Instructions for CAD Team</h4>
                  {jewelerRefSource && jewelerRefSource !== 'none' && (
                    <div className="mb-3 p-2 rounded-md bg-primary/5 border border-primary/10 text-xs">
                      <span className="text-muted-foreground">Reference Source: </span>
                      <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">{jewelerRefSource === 'ai_preview' ? 'AI Preview' : jewelerRefSource === 'customer_upload' ? 'Customer Upload' : 'Jeweler Upload'}</Badge>
                    </div>
                  )}
                  {jewelerRefSource === 'jeweler_upload' && jewelerRefSignedUrls.length > 0 && (
                    <div className="mb-3"><p className="text-xs font-medium text-muted-foreground mb-2">Jeweler's Reference Images</p><ImageGallery images={jewelerRefSignedUrls} loading={false} title="Jeweler Reference" /></div>
                  )}
                  <div className="space-y-0">
                    <InfoRow label="Ring Size" value={request.ring_size} />
                    <InfoRow label="Carat Size" value={request.carat_size} />
                    <InfoRow label="Center Stone Specs" value={(request as any).center_stone_specs} />
                    <InfoRow label="Halo / Pavé Layout" value={(request as any).halo_pave_layout} />
                    <InfoRow label="Shank Width" value={(request as any).shank_width} />
                    <InfoRow label="Gallery Comfort" value={(request as any).gallery_comfort?.replace(/_/g, ' ')} />
                    <InfoRow label="Length / Width" value={(request as any).length_width} />
                    <InfoRow label="Clasp / Bail Details" value={(request as any).clasp_bail_details} />
                    <InfoRow label="Chain Link Style" value={(request as any).chain_link_style} />
                    <InfoRow label="Personalized Inscription" value={(request as any).engraving_text} />
                    <InfoRow label="Dental Impressions" value={(request as any).dental_impression_type?.replace(/_/g, ' ')} />
                    <InfoRow label="Tooth Coverage" value={(request as any).tooth_coverage} />
                    <InfoRow label="Pattern Design" value={(request as any).pattern_design} />
                  </div>
                  {(request.custom_description || requestDescription) && (
                    <div className="mt-3 pt-3 border-t border-border/40"><p className="text-xs font-medium text-muted-foreground mb-1">Design Description</p><p className="text-sm text-foreground whitespace-pre-wrap">{request.custom_description && !request.custom_description.startsWith('{') ? request.custom_description : requestDescription || '—'}</p></div>
                  )}
                </CardContent>
              </Card>

              {request.client_notes && (
                <Card className="border-amber-500/20"><CardContent className="p-4 sm:p-5"><h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-amber-700"><MessageSquare className="h-4 w-4" />Client Notes / Instructions</h4><p className="text-sm text-foreground whitespace-pre-wrap">{request.client_notes}</p></CardContent></Card>
              )}
            </>
          ) : (
            /* ORIGINAL FLAT LAYOUT */
            <>
              <Card><CardContent className="p-4 sm:p-5"><h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Gem className="h-4 w-4 text-muted-foreground" />{request.source === 'ring_os' ? 'Ring Details' : 'Details'}</h4><div className="space-y-0"><InfoRow label="Product" value={request.ring_product_name} /><InfoRow label="Style" value={request.style} /><InfoRow label="Shape" value={request.shape} /><InfoRow label="Metal" value={request.metal_type} /><InfoRow label="Metal Purity" value={(request as any).metal_purity} /><InfoRow label="Ring Size" value={request.ring_size} /><InfoRow label="Carat Size" value={request.carat_size} /><InfoRow label="Grillz Type" value={(request as any).grillz_type} /><InfoRow label="Top Teeth" value={(request as any).top_teeth} /><InfoRow label="Bottom Teeth" value={(request as any).bottom_teeth} /><InfoRow label="Jewelry Type" value={(request as any).jewelry_type} /><InfoRow label="Setting" value={(request as any).setting} /><InfoRow label="Band" value={(request as any).band} /><InfoRow label="Budget" value={(request as any).budget} /><InfoRow label="Timeline" value={(request as any).timeline} /><InfoRow label="Center Stone Specs" value={(request as any).center_stone_specs} /><InfoRow label="Halo / Pavé Layout" value={(request as any).halo_pave_layout} /><InfoRow label="Shank Width" value={(request as any).shank_width} /><InfoRow label="Gallery Comfort" value={(request as any).gallery_comfort?.replace(/_/g, ' ')} /><InfoRow label="Length / Width" value={(request as any).length_width} /><InfoRow label="Clasp / Bail Details" value={(request as any).clasp_bail_details} /><InfoRow label="Chain Link Style" value={(request as any).chain_link_style} /><InfoRow label="Personalized Inscription" value={(request as any).engraving_text} /><InfoRow label="Dental Impressions" value={(request as any).dental_impression_type?.replace(/_/g, ' ')} /><InfoRow label="Tooth Coverage" value={(request as any).tooth_coverage} /><InfoRow label="Pattern Design" value={(request as any).pattern_design} />{request.is_custom_ring && <InfoRow label="Type" value="Custom Design" />}</div></CardContent></Card>

              {/* Jeweler Reference Images — shown for non-segmented sources too */}
              {jewelerRefUrls && jewelerRefUrls.length > 0 && (
                <Card className="border-primary/20">
                  <CardContent className="p-4 sm:p-5">
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Image className="h-4 w-4 text-primary" />Reference Images</h4>
                    {jewelerRefSource && (
                      <div className="mb-3 p-2 rounded-md bg-primary/5 border border-primary/10 text-xs">
                        <span className="text-muted-foreground">Source: </span>
                        <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                          {jewelerRefSource === 'ai_preview' ? 'AI Preview' : jewelerRefSource === 'customer_upload' ? 'Customer Upload' : 'Jeweler Upload'}
                        </Badge>
                      </div>
                    )}
                    <ImageGallery images={jewelerRefSignedUrls.length > 0 ? jewelerRefSignedUrls : []} loading={jewelerRefSignedUrls.length === 0} title="Reference" />
                  </CardContent>
                </Card>
              )}

              {hasLeadConfig && (<Card><CardContent className="p-4 sm:p-5"><h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-muted-foreground" />Lead Configuration</h4>{leadLoading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div> : renderLeadConfig()}</CardContent></Card>)}

              {leadSource === 'grill_form' && hasLeadConfig && (config.top_teeth || config.bottom_teeth) && (<Card><CardContent className="p-4 sm:p-5"><h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Sparkles className="h-4 w-4 text-muted-foreground" />Selected Teeth</h4><GrillTeethDiagram topTeeth={config.top_teeth || 'none'} bottomTeeth={config.bottom_teeth || 'none'} metalType={config.metal_type} /></CardContent></Card>)}

              {(request.custom_description || requestDescription) && (<Card><CardContent className="p-4 sm:p-5"><h4 className="text-sm font-semibold mb-2">Description</h4><p className="text-sm text-muted-foreground whitespace-pre-wrap">{requestDescription || request.custom_description}</p></CardContent></Card>)}

              {request.client_notes && (<Card className="border-amber-500/20"><CardContent className="p-4 sm:p-5"><h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-amber-700"><MessageSquare className="h-4 w-4" />Client Notes / Instructions</h4><p className="text-sm text-foreground whitespace-pre-wrap">{request.client_notes}</p></CardContent></Card>)}

              {(previewImages.length > 0 || previewLoading) && (<Card><CardContent className="p-4 sm:p-5"><h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Image className="h-4 w-4 text-muted-foreground" />AI Generated Previews</h4><ImageGallery images={previewImages} loading={previewLoading} title="AI Preview" showFeedback showCustomInstruction /></CardContent></Card>)}

              {referenceImages && (<Card><CardContent className="p-4 sm:p-5"><h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><Image className="h-4 w-4 text-muted-foreground" />{referenceImages.title}</h4><ImageGallery images={referenceImages.images} loading={false} title={referenceImages.title} /></CardContent></Card>)}
            </>
          )}

          {/* CAD Files */}
          <Card>
            <CardContent className="p-4 sm:p-5">
              <h4 className="text-sm font-semibold mb-3 flex items-center gap-2"><FileDown className="h-4 w-4 text-muted-foreground" />CAD Files</h4>
              {request.cad_file_urls && request.cad_file_urls.length > 0 ? (
                <div className="space-y-2">
                  {request.cad_file_urls.map((url, idx) => { const fileName = url.split("/").pop() || `CAD File ${idx + 1}`; return (<div key={idx} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border bg-muted/30"><div className="flex items-center gap-2 min-w-0"><FileDown className="h-4 w-4 text-emerald-500 shrink-0" /><span className="text-sm truncate">{fileName}</span></div><Button size="sm" variant="outline" className="text-xs gap-1.5 shrink-0" onClick={() => handleDownload(url)} disabled={downloading === url}>{downloading === url ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3" />}Download</Button></div>); })}
                  {request.delivered_at && <p className="text-xs text-muted-foreground mt-2">Delivered on {format(new Date(request.delivered_at), "MMM d, yyyy 'at' h:mm a")}</p>}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground"><Package className="h-8 w-8 mx-auto mb-2 opacity-40" /><p className="text-sm">No CAD files delivered yet</p></div>
              )}
              <div className="mt-4 pt-4 border-t border-border/40">
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => { if (e.target.files && e.target.files.length > 0) handleFileUpload(e.target.files); }} />
                <Button variant="outline" size="sm" className="gap-2 w-full" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {uploading ? "Uploading..." : "Upload CAD File"}
                </Button>
                <p className="text-[10px] text-muted-foreground mt-1.5">Uploading a file will automatically mark the request as completed and notify the client.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <Card><CardContent className="p-4 sm:p-5 space-y-4">
            <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Status</label><Select value={request.status} onValueChange={val => { updateMutation.mutate({ id: request.id, status: val }); setRequest(prev => ({ ...prev, status: val })); }}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent>{STATUS_OPTIONS.map(s => (<SelectItem key={s} value={s} className="capitalize text-xs">{s.replace("_", " ")}</SelectItem>))}</SelectContent></Select></div>
            <div><label className="text-xs font-medium text-muted-foreground mb-1.5 block">Priority</label><Select value={request.priority} onValueChange={val => { updateMutation.mutate({ id: request.id, priority: val }); setRequest(prev => ({ ...prev, priority: val })); }}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent>{PRIORITY_OPTIONS.map(p => (<SelectItem key={p} value={p} className="capitalize text-xs">{p}</SelectItem>))}</SelectContent></Select></div>
          </CardContent></Card>

          {request.status === "revision_requested" && request.client_feedback && request.client_feedback !== "approved" && (
            <Card className="border-orange-500/30 bg-orange-500/5"><CardContent className="p-4 sm:p-5"><h4 className="text-sm font-semibold mb-2 flex items-center gap-2 text-orange-600"><RotateCcw className="h-4 w-4" />Client Revision Request</h4><p className="text-sm text-foreground whitespace-pre-wrap">{request.client_feedback}</p></CardContent></Card>
          )}

          {request.client_feedback === "approved" && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span className="text-sm font-medium text-emerald-700">Design Approved by Client</span></div>
          )}

          <Card><CardContent className="p-4 sm:p-5"><h4 className="text-sm font-semibold mb-2 flex items-center gap-2"><MessageSquare className="h-4 w-4 text-muted-foreground" />Admin Notes</h4><Textarea value={notesText} onChange={e => setNotesText(e.target.value)} placeholder="Add notes..." className="min-h-[80px] text-sm" /><Button size="sm" className="mt-2" onClick={() => { updateMutation.mutate({ id: request.id, admin_notes: notesText }); setRequest(prev => ({ ...prev, admin_notes: notesText })); }}>Save Notes</Button></CardContent></Card>

          <div className="lg:col-span-1">
            {currentUser && <CadRequestChat cadRequestId={request.id} currentUserId={currentUser.id} currentUserName={currentUser.email} currentUserRole="admin" clientId={request.client_id} />}
          </div>

          <Card><CardContent className="p-4 sm:p-5"><h4 className="text-sm font-semibold mb-3">Timeline</h4><div className="space-y-3">
            <div className="flex items-center gap-2 text-sm"><div className="w-2 h-2 rounded-full bg-primary" /><span className="text-muted-foreground">Created</span><span className="ml-auto text-xs">{format(new Date(request.created_at), "MMM d")}</span></div>
            {request.status !== "pending" && <div className="flex items-center gap-2 text-sm"><div className="w-2 h-2 rounded-full bg-blue-500" /><span className="text-muted-foreground">In Progress</span>{request.updated_at && <span className="ml-auto text-xs">{format(new Date(request.updated_at), "MMM d")}</span>}</div>}
            {request.delivered_at && <div className="flex items-center gap-2 text-sm"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-muted-foreground">Delivered</span><span className="ml-auto text-xs">{format(new Date(request.delivered_at), "MMM d")}</span></div>}
            {request.status === "revision_requested" && <div className="flex items-center gap-2 text-sm"><div className="w-2 h-2 rounded-full bg-orange-500" /><span className="text-muted-foreground">Revision Requested</span>{request.updated_at && <span className="ml-auto text-xs">{format(new Date(request.updated_at), "MMM d")}</span>}</div>}
            {request.client_feedback === "approved" && <div className="flex items-center gap-2 text-sm"><div className="w-2 h-2 rounded-full bg-emerald-500" /><span className="text-muted-foreground">Approved by Client</span></div>}
          </div></CardContent></Card>
        </div>
      </div>
    </div>
  );
}
