import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Search, Upload, Image, CheckCircle2, X, Gem, FileText } from "lucide-react";

// ── Constants ─────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "application/pdf"];
const ALLOWED_EXTENSIONS_LABEL = "PNG, JPG, WEBP, or PDF";

interface MasterRing {
  id: string;
  combination_id: string;
  product_name: string | null;
  style_name: string | null;
  shank_name: string | null;
  visual_color_name: string | null;
  shape_name: string | null;
}

interface NewCadRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  onCreated: () => void;
  prefill?: {
    source?: string;
    leadId?: string;
    leadTable?: string;
    orderId?: string;
    customerName?: string;
    customerEmail?: string;
    ringProductName?: string;
    metalType?: string;
    style?: string;
    shape?: string;
    ringSize?: string;
    caratSize?: string;
    customDescription?: string;
    grillzType?: string;
    topTeeth?: string;
    bottomTeeth?: string;
    metalPurity?: string;
    jewelryType?: string;
    setting?: string;
    band?: string;
    budget?: string;
    timeline?: string;
    centerStoneSpecs?: string;
    haloPaveLayout?: string;
    shankWidth?: string;
    galleryComfort?: string;
    lengthWidth?: string;
    claspBailDetails?: string;
    chainLinkStyle?: string;
    engravingText?: string;
    dentalImpressionType?: string;
    toothCoverage?: string;
    patternDesign?: string;
  };
}

// Field visibility by source
const FIELD_VISIBILITY: Record<string, Record<string, boolean>> = {
  ring_os:        { productName: true, ringSize: true, caratSize: true, metalType: true, shape: true, style: true, centerStoneSpecs: true, haloPaveLayout: true, shankWidth: true, galleryComfort: true },
  ring_builder:   { productName: true, ringSize: true, caratSize: true, metalType: true, shape: true, style: true, setting: true, band: true, centerStoneSpecs: true, haloPaveLayout: true, shankWidth: true, galleryComfort: true },
  diamond:        { productName: true, ringSize: true, caratSize: true, metalType: true, shape: true, style: true, setting: true, band: true, centerStoneSpecs: true, haloPaveLayout: true, shankWidth: true, galleryComfort: true },
  grillz:         { metalType: true, metalPurity: true, grillzType: true, topTeeth: true, bottomTeeth: true, dentalImpressionType: true, toothCoverage: true, patternDesign: true },
  custom_enquiry: { jewelryType: true, metalType: true, metalPurity: true, style: true, shape: true, ringSize: true, lengthWidth: true, claspBailDetails: true, chainLinkStyle: true, engravingText: true },
  custom:         { productName: true, ringSize: true, caratSize: true, metalType: true, shape: true, style: true, centerStoneSpecs: true, haloPaveLayout: true, shankWidth: true, galleryComfort: true, jewelryType: true, setting: true, band: true, lengthWidth: true, claspBailDetails: true, chainLinkStyle: true, engravingText: true },
};

function isFieldVisible(source: string, field: string): boolean {
  return FIELD_VISIBILITY[source]?.[field] ?? false;
}

const SEGMENTED_SOURCES = ['grillz', 'custom_enquiry', 'ring_builder'];

function getPreviewTable(source: string): string | null {
  switch (source) {
    case 'grillz': return 'grill_preview_images';
    case 'custom_enquiry': return 'custom_enquiry_preview_images';
    case 'ring_builder': return 'ring_preview_images';
    default: return null;
  }
}

function getLeadTable(source: string, leadTable?: string): string | null {
  if (leadTable) return leadTable;
  switch (source) {
    case 'ring_builder': return 'design_requests';
    case 'grillz': return 'grill_form_leads';
    case 'custom_enquiry': return 'custom_enquiry_leads';
    default: return null;
  }
}

function validateFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return `"${file.name}" is not a supported file type. Please upload ${ALLOWED_EXTENSIONS_LABEL}.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `"${file.name}" exceeds the 10 MB size limit.`;
  }
  return null;
}

// ── Component ─────────────────────────────────────────────────

export function NewCadRequestDialog({ open, onOpenChange, clientId, onCreated, prefill }: NewCadRequestDialogProps) {
  const { user } = useAuth();
  // step: 0 = entry point picker, 1 = ring search, 2 = form
  const [step, setStep] = useState(0);
  const [entryType, setEntryType] = useState<'ring_os' | 'custom' | null>(null);
  const [isCustomRing, setIsCustomRing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Ring picker
  const [ringSearch, setRingSearch] = useState("");
  const [masterRings, setMasterRings] = useState<MasterRing[]>([]);
  const [ringsLoading, setRingsLoading] = useState(false);
  const [selectedRing, setSelectedRing] = useState<MasterRing | null>(null);
  const [ringPage, setRingPage] = useState(0);
  const [hasMoreRings, setHasMoreRings] = useState(true);
  const RINGS_PER_PAGE = 50;

  // Form fields
  const [source, setSource] = useState(prefill?.source || "custom");
  const [ringProductName, setRingProductName] = useState(prefill?.ringProductName || "");
  const [metalType, setMetalType] = useState(prefill?.metalType || "");
  const [style, setStyle] = useState(prefill?.style || "");
  const [shape, setShape] = useState(prefill?.shape || "");
  const [ringSize, setRingSize] = useState(prefill?.ringSize || "");
  const [caratSize, setCaratSize] = useState(prefill?.caratSize || "");
  const [customDescription, setCustomDescription] = useState(prefill?.customDescription || "");
  const [clientNotes, setClientNotes] = useState("");
  const [customerName, setCustomerName] = useState(prefill?.customerName || "");
  const [customerEmail, setCustomerEmail] = useState(prefill?.customerEmail || "");

  // Source-specific fields
  const [grillzType, setGrillzType] = useState(prefill?.grillzType || "");
  const [topTeeth, setTopTeeth] = useState(prefill?.topTeeth || "");
  const [bottomTeeth, setBottomTeeth] = useState(prefill?.bottomTeeth || "");
  const [metalPurity, setMetalPurity] = useState(prefill?.metalPurity || "");
  const [jewelryType, setJewelryType] = useState(prefill?.jewelryType || "");
  const [setting, setSetting] = useState(prefill?.setting || "");
  const [band, setBand] = useState(prefill?.band || "");
  const [budget, setBudget] = useState(prefill?.budget || "");
  const [timeline, setTimeline] = useState(prefill?.timeline || "");

  // Ring-specific CAD fields
  const [centerStoneSpecs, setCenterStoneSpecs] = useState(prefill?.centerStoneSpecs || "");
  const [haloPaveLayout, setHaloPaveLayout] = useState(prefill?.haloPaveLayout || "");
  const [shankWidth, setShankWidth] = useState(prefill?.shankWidth || "");
  const [galleryComfort, setGalleryComfort] = useState(prefill?.galleryComfort || "");
  const [lengthWidth, setLengthWidth] = useState(prefill?.lengthWidth || "");
  const [claspBailDetails, setClaspBailDetails] = useState(prefill?.claspBailDetails || "");
  const [chainLinkStyle, setChainLinkStyle] = useState(prefill?.chainLinkStyle || "");
  const [engravingText, setEngravingText] = useState(prefill?.engravingText || "");
  const [dentalImpressionType, setDentalImpressionType] = useState(prefill?.dentalImpressionType || "");
  const [toothCoverage, setToothCoverage] = useState(prefill?.toothCoverage || "");
  const [patternDesign, setPatternDesign] = useState(prefill?.patternDesign || "");

  // Jeweler reference image state
  const [jewelerReferenceSource, setJewelerReferenceSource] = useState<string>("none");
  const [selectedReferenceUrl, setSelectedReferenceUrl] = useState<string>("");
  const [jewelerUploadedUrls, setJewelerUploadedUrls] = useState<string[]>([]);
  const [jewelerUploadedPreviews, setJewelerUploadedPreviews] = useState<string[]>([]);
  const [jewelerUploading, setJewelerUploading] = useState(false);
  const jewelerFileInputRef = useRef<HTMLInputElement>(null);

  // Available images from lead
  const [aiPreviewImages, setAiPreviewImages] = useState<Array<{ image_url: string; feedback: string | null }>>([]);
  const [customerUploadedImages, setCustomerUploadedImages] = useState<string[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);

  const isSegmented = SEGMENTED_SOURCES.includes(source);

  // Fetch master rings on search
  useEffect(() => {
    if (!open || step !== 1) return;
    const timer = setTimeout(async () => {
      setRingsLoading(true);
      setRingPage(0);
      try {
        let query = supabase
          .from("my_master_db_data" as any)
          .select("id, combination_id, product_name, style_name, shank_name, visual_color_name, shape_name")
          .order("product_name")
          .range(0, RINGS_PER_PAGE - 1);

        if (ringSearch.trim()) {
          query = query.or(`product_name.ilike.%${ringSearch}%,combination_id.ilike.%${ringSearch}%,style_name.ilike.%${ringSearch}%`);
        }

        const { data } = await query;
        const rings = (data || []) as unknown as MasterRing[];
        setMasterRings(rings);
        setHasMoreRings(rings.length === RINGS_PER_PAGE);
      } catch {
        setMasterRings([]);
      } finally {
        setRingsLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [ringSearch, open, step]);

  const loadMoreRings = async () => {
    const nextPage = ringPage + 1;
    const from = nextPage * RINGS_PER_PAGE;
    const to = from + RINGS_PER_PAGE - 1;
    setRingsLoading(true);
    try {
      let query = supabase
        .from("my_master_db_data" as any)
        .select("id, combination_id, product_name, style_name, shank_name, visual_color_name, shape_name")
        .order("product_name")
        .range(from, to);

      if (ringSearch.trim()) {
        query = query.or(`product_name.ilike.%${ringSearch}%,combination_id.ilike.%${ringSearch}%,style_name.ilike.%${ringSearch}%`);
      }

      const { data } = await query;
      const rings = (data || []) as unknown as MasterRing[];
      setMasterRings(prev => [...prev, ...rings]);
      setHasMoreRings(rings.length === RINGS_PER_PAGE);
      setRingPage(nextPage);
    } catch { /* ignore */ } finally {
      setRingsLoading(false);
    }
  };

  // Fetch lead images when segmented source with prefill
  useEffect(() => {
    if (!open || !prefill?.leadId || !isSegmented) return;
    setImagesLoading(true);

    (async () => {
      try {
        const previewTable = getPreviewTable(source);
        if (previewTable) {
          const { data } = await (supabase as any)
            .from(previewTable)
            .select('image_url, feedback')
            .eq('lead_id', prefill.leadId)
            .order('generation_number', { ascending: true });
          if (data) setAiPreviewImages(data);
        }

        const leadTable = getLeadTable(source, prefill.leadTable);
        if (leadTable) {
          const { data: leadData } = await (supabase as any).from(leadTable).select('*').eq('id', prefill.leadId).maybeSingle();
          if (leadData) {
            const config = leadData.configuration || leadData;
            const urls = config.uploaded_image_urls || config.reference_images || config.inspiration_image_urls || [];
            if (urls.length > 0) setCustomerUploadedImages(urls);
          }
        }
      } catch (e) {
        console.error('Error fetching lead images:', e);
      } finally {
        setImagesLoading(false);
      }
    })();
  }, [open, prefill?.leadId, source, isSegmented]);

  // Reset on close / skip to step 2 when prefill is provided
  useEffect(() => {
    if (!open) {
      setStep(0);
      setEntryType(null);
      setIsCustomRing(false);
      setSelectedRing(null);
      setRingSearch("");
      setCustomDescription("");
      setClientNotes("");
      setJewelerReferenceSource("none");
      setSelectedReferenceUrl("");
      setJewelerUploadedUrls([]);
      setJewelerUploadedPreviews([]);
      setAiPreviewImages([]);
      setCustomerUploadedImages([]);
      if (!prefill) {
        setSource("custom");
        setRingProductName("");
        setMetalType("");
        setStyle("");
        setShape("");
        setRingSize("");
        setCaratSize("");
        setCustomerName("");
        setCustomerEmail("");
        setGrillzType("");
        setTopTeeth("");
        setBottomTeeth("");
        setMetalPurity("");
        setJewelryType("");
        setSetting("");
        setBand("");
        setBudget("");
        setTimeline("");
        setCenterStoneSpecs("");
        setHaloPaveLayout("");
        setShankWidth("");
        setGalleryComfort("");
        setLengthWidth("");
        setClaspBailDetails("");
        setChainLinkStyle("");
        setEngravingText("");
        setDentalImpressionType("");
        setToothCoverage("");
        setPatternDesign("");
      }
    } else if (open && prefill) {
      setStep(2);
      setIsCustomRing(true);
    }
  }, [open, prefill]);

  const handleSelectRing = (ring: MasterRing) => {
    setSelectedRing(ring);
    setRingProductName(ring.product_name || ring.combination_id);
    setStyle(ring.style_name || "");
    setShape(ring.shape_name || "");
    setMetalType(ring.visual_color_name || "");
    setSource("ring_os");
    setStep(2);
  };

  const handleJewelerImageUpload = async (files: FileList) => {
    // Validate files first
    for (const file of Array.from(files)) {
      const error = validateFile(file);
      if (error) {
        toast.error(error);
        return;
      }
    }

    setJewelerUploading(true);
    try {
      const newUrls: string[] = [];
      const newPreviews: string[] = [];
      for (const file of Array.from(files)) {
        const filePath = `jeweler-refs/${clientId}/${Date.now()}_${crypto.randomUUID()}_${file.name}`;
        const { error } = await supabase.storage.from("cad-deliveries").upload(filePath, file, { cacheControl: '3600', upsert: false });
        if (error) {
          toast.error(`Failed to upload "${file.name}": ${error.message}`);
          continue;
        }
        newUrls.push(filePath);
        newPreviews.push(URL.createObjectURL(file));
      }
      setJewelerUploadedUrls(prev => [...prev, ...newUrls]);
      setJewelerUploadedPreviews(prev => [...prev, ...newPreviews]);
      if (newUrls.length > 0) {
        setJewelerReferenceSource("jeweler_upload");
        setSelectedReferenceUrl("");
      }
      if (newUrls.length > 0) toast.success(`${newUrls.length} image(s) uploaded`);
    } catch {
      toast.error("Failed to upload image");
    } finally {
      setJewelerUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      let referenceImages: string[] | null = null;
      let jewelerRefSource: string | null = null;
      let jewelerRefUrls: string[] | null = null;

      if (isSegmented) {
        if (jewelerReferenceSource === 'ai_preview' && selectedReferenceUrl) {
          referenceImages = [selectedReferenceUrl];
          jewelerRefSource = 'ai_preview';
        } else if (jewelerReferenceSource === 'customer_upload' && selectedReferenceUrl) {
          referenceImages = [selectedReferenceUrl];
          jewelerRefSource = 'customer_upload';
        } else if (jewelerReferenceSource === 'jeweler_upload' && jewelerUploadedUrls.length > 0) {
          jewelerRefSource = 'jeweler_upload';
          jewelerRefUrls = jewelerUploadedUrls;
        }
      }

      // Also attach uploads for non-segmented sources (e.g. custom "Something Else")
      if (!isSegmented && jewelerUploadedUrls.length > 0) {
        jewelerRefSource = 'jeweler_upload';
        jewelerRefUrls = jewelerUploadedUrls;
      }

      const { data: insertedRows, error } = await supabase.from("cad_requests" as any).insert({
        client_id: clientId,
        requested_by: user.id,
        source,
        order_id: prefill?.orderId || null,
        lead_id: prefill?.leadId || null,
        lead_table: prefill?.leadTable || null,
        ring_combination_id: selectedRing?.combination_id || null,
        ring_product_name: ringProductName || null,
        is_custom_ring: isCustomRing,
        metal_type: metalType || null,
        style: style || null,
        shape: shape || null,
        ring_size: ringSize || null,
        carat_size: caratSize || null,
        custom_description: customDescription || null,
        client_notes: clientNotes || null,
        customer_name: customerName || null,
        customer_email: customerEmail || null,
        grillz_type: grillzType || null,
        top_teeth: topTeeth || null,
        bottom_teeth: bottomTeeth || null,
        metal_purity: metalPurity || null,
        jewelry_type: jewelryType || null,
        setting: setting || null,
        band: band || null,
        budget: budget || null,
        timeline: timeline || null,
        center_stone_specs: centerStoneSpecs || null,
        halo_pave_layout: haloPaveLayout || null,
        shank_width: shankWidth || null,
        gallery_comfort: galleryComfort || null,
        length_width: lengthWidth || null,
        clasp_bail_details: claspBailDetails || null,
        chain_link_style: chainLinkStyle || null,
        engraving_text: engravingText || null,
        dental_impression_type: dentalImpressionType || null,
        tooth_coverage: toothCoverage || null,
        pattern_design: patternDesign || null,
        reference_images: referenceImages,
        jeweler_reference_source: jewelerRefSource,
        jeweler_reference_urls: jewelerRefUrls,
        status: "pending",
        priority: "normal",
      } as any).select("id").single();

      if (error) throw error;
      const newCadRequestId = (insertedRows as any)?.id as string | undefined;

      // Consume a CAD add-on if the client has any (priority: new_cad → cad_render).
      // cad_tweak is reserved for revisions, not new requests.
      if (newCadRequestId) {
        try {
          await (supabase as any).rpc("consume_cad_addon", {
            p_client_id: clientId,
            p_addon_kind: "new_cad",
            p_cad_request_id: newCadRequestId,
            p_fallback_kinds: ["cad_render"],
          });
        } catch (consumeErr) {
          console.warn("consume_cad_addon failed (non-blocking):", consumeErr);
        }
      }

      // Notify admins via edge function (email)
      try {
        const { data: clientData } = await supabase
          .from("clients")
          .select("company_name")
          .eq("id", clientId)
          .single();

        await supabase.functions.invoke("notify-cad-request", {
          body: {
            client_company: clientData?.company_name || "Unknown",
            product_name: ringProductName || jewelryType || grillzType || "Custom Request",
            source,
            metal_type: metalType || undefined,
            style: style || undefined,
            shape: shape || undefined,
            ring_size: ringSize || undefined,
            carat_size: caratSize || undefined,
            customer_name: customerName || undefined,
            is_custom: isCustomRing,
            client_notes: clientNotes || undefined,
            custom_description: customDescription || undefined,
            grillz_type: grillzType || undefined,
            top_teeth: topTeeth || undefined,
            bottom_teeth: bottomTeeth || undefined,
            metal_purity: metalPurity || undefined,
            jewelry_type: jewelryType || undefined,
            setting: setting || undefined,
            band: band || undefined,
            budget: budget || undefined,
            timeline: timeline || undefined,
          },
        });
      } catch {
        // Non-critical
      }

      toast.success("CAD request submitted successfully");
      onCreated();
    } catch (err) {
      console.error("Error creating CAD request:", err);
      toast.error("Failed to submit CAD request");
    } finally {
      setSubmitting(false);
    }
  };

  const isGrillz = source === 'grillz';
  const isCustomEnquiry = source === 'custom_enquiry';

  const getHeaderLabel = () => {
    if (isGrillz) return 'Grillz Details';
    if (isCustomEnquiry) return 'Custom Jewelry Details';
    return 'Ring / Jewelry Details';
  };

  // ── Render helpers ──────────────────────────────────────────

  const renderCustomerInfoSection = () => (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Customer Information</h4>
      </div>
      {isCustomEnquiry ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <InfoField label="Customer Name" value={customerName || '—'} />
            <InfoField label="Customer Email" value={customerEmail || '—'} />
          </div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pt-1">Original Request Details</p>
          {jewelryType && <InfoField label="Jewelry Type" value={jewelryType} />}
          {metalType && <InfoField label="Metal Type" value={metalType} />}
          {metalPurity && <InfoField label="Metal Purity" value={metalPurity} />}
          {style && <InfoField label="Style" value={style} />}
          {shape && <InfoField label="Shape" value={shape} />}
          {setting && <InfoField label="Setting" value={setting} />}
          {band && <InfoField label="Band" value={band} />}
          {caratSize && <InfoField label="Carat Size" value={caratSize} />}
          {centerStoneSpecs && <InfoField label="Center Stone" value={centerStoneSpecs} />}
          {ringSize && <InfoField label="Dimensions" value={ringSize} />}
          {lengthWidth && <InfoField label="Length / Width" value={lengthWidth} />}
          {chainLinkStyle && <InfoField label="Chain Link Style" value={chainLinkStyle} />}
          {claspBailDetails && <InfoField label="Clasp / Bail" value={claspBailDetails} />}
          {engravingText && <InfoField label="Engraving" value={engravingText} />}
          {budget && <InfoField label="Budget" value={budget} />}
          {timeline && <InfoField label="Timeline" value={timeline} />}
          {prefill?.customDescription && <InfoField label="Customer Description" value={prefill.customDescription} />}
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Customer Name</Label>
              <Input value={customerName} onChange={e => setCustomerName(e.target.value)} className="mt-1 h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Customer Email</Label>
              <Input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} className="mt-1 h-8 text-sm" />
            </div>
          </div>
          {isGrillz && (
            <>
              {grillzType && <InfoField label="Grillz Type" value={grillzType} />}
              {topTeeth && <InfoField label="Top Teeth" value={topTeeth} />}
              {bottomTeeth && <InfoField label="Bottom Teeth" value={bottomTeeth} />}
              {metalType && <InfoField label="Metal Type" value={metalType} />}
              {metalPurity && <InfoField label="Metal Purity" value={metalPurity} />}
            </>
          )}
          {source === 'ring_builder' && (
            <>
              {ringProductName && <InfoField label="Product" value={ringProductName} />}
              {shape && <InfoField label="Shape" value={shape} />}
              {style && <InfoField label="Style" value={style} />}
              {metalType && <InfoField label="Metal" value={metalType} />}
              {setting && <InfoField label="Setting" value={setting} />}
              {band && <InfoField label="Band" value={band} />}
            </>
          )}
          {budget && <InfoField label="Budget" value={budget} />}
          {timeline && <InfoField label="Timeline" value={timeline} />}
        </>
      )}
    </div>
  );

  const renderJewelerSection = () => (
    <>
      {/* Section 2: Reference Images */}
      <div className="space-y-3 rounded-lg border border-border/60 bg-muted/20 p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reference Images</h4>
        </div>
        {renderReferenceImagePicker()}
      </div>

      {/* Section 3: Jeweler's CAD Specifications */}
      <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-primary" />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-primary/80">Jeweler's Instructions for CAD Team</h4>
        </div>
        {isCustomEnquiry ? (
          <>
            <div>
              <Label className="text-xs">Jewelry Type</Label>
              <Select value={jewelryType} onValueChange={setJewelryType}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Select type..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ring">Ring</SelectItem>
                  <SelectItem value="Pendant">Pendant</SelectItem>
                  <SelectItem value="Bracelet">Bracelet</SelectItem>
                  <SelectItem value="Chain">Chain</SelectItem>
                  <SelectItem value="Earrings">Earrings</SelectItem>
                  <SelectItem value="Grillz">Grillz</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Describe What You Need</Label>
              <Textarea placeholder="Describe what the CAD team should design..." value={customDescription} onChange={e => setCustomDescription(e.target.value)} className="mt-1.5 min-h-[70px] placeholder:text-muted-foreground text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Metal Type</Label>
                <Input placeholder="e.g., Gold, Platinum" value={metalType} onChange={e => setMetalType(e.target.value)} className="mt-1 h-8 text-sm placeholder:text-muted-foreground" />
              </div>
              <div>
                <Label className="text-xs">Metal Purity</Label>
                <Input placeholder="e.g., 14K, 18K, 950" value={metalPurity} onChange={e => setMetalPurity(e.target.value)} className="mt-1 h-8 text-sm placeholder:text-muted-foreground" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Style</Label>
                <Input placeholder="e.g., Solitaire, Cuban" value={style} onChange={e => setStyle(e.target.value)} className="mt-1 h-8 text-sm placeholder:text-muted-foreground" />
              </div>
              <div>
                <Label className="text-xs">Shape</Label>
                <Input placeholder="e.g., Round, Oval" value={shape} onChange={e => setShape(e.target.value)} className="mt-1 h-8 text-sm placeholder:text-muted-foreground" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Dimensions</Label>
              <Input placeholder="e.g., Size 7, 18 inches, 3mm width" value={ringSize} onChange={e => setRingSize(e.target.value)} className="mt-1 h-8 text-sm placeholder:text-muted-foreground" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Budget</Label>
                <Input placeholder="e.g., $2,000 - $5,000" value={budget} onChange={e => setBudget(e.target.value)} className="mt-1 h-8 text-sm placeholder:text-muted-foreground" />
              </div>
              <div>
                <Label className="text-xs">Timeline</Label>
                <Input placeholder="e.g., 2-4 weeks" value={timeline} onChange={e => setTimeline(e.target.value)} className="mt-1 h-8 text-sm placeholder:text-muted-foreground" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Extra Notes / Instructions for JewlX</Label>
              <Textarea placeholder="Any additional instructions for the CAD team..." value={clientNotes} onChange={e => setClientNotes(e.target.value)} className="mt-1.5 min-h-[50px] placeholder:text-muted-foreground text-sm" />
            </div>
          </>
        ) : (
          <>
            <div>
              <Label className="text-xs">{isGrillz ? 'Grillz Description' : 'Design Description'}</Label>
              <Textarea placeholder="Describe what the CAD team should design..." value={customDescription} onChange={e => setCustomDescription(e.target.value)} className="mt-1.5 min-h-[70px] placeholder:text-muted-foreground text-sm" />
            </div>
            {renderTechnicalSpecs()}
            <div>
              <Label className="text-xs">Extra Notes / Instructions for JewlX</Label>
              <Textarea placeholder="Any additional instructions for the CAD team..." value={clientNotes} onChange={e => setClientNotes(e.target.value)} className="mt-1.5 min-h-[50px] placeholder:text-muted-foreground text-sm" />
            </div>
          </>
        )}
      </div>
    </>
  );

  const renderReferenceImagePicker = () => (
    <div>
      <Label className="text-xs mb-2 block">Reference Image for CAD</Label>
      {imagesLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading available images...
        </div>
      ) : (
        <RadioGroup value={jewelerReferenceSource} onValueChange={(val) => { setJewelerReferenceSource(val); if (val === 'jeweler_upload') setSelectedReferenceUrl(""); }}>
          {aiPreviewImages.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase">AI Generated Previews</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {aiPreviewImages.map((img, idx) => (
                  <label
                    key={idx}
                    className={`flex-shrink-0 cursor-pointer rounded-lg border-2 transition-all ${jewelerReferenceSource === 'ai_preview' && selectedReferenceUrl === img.image_url ? 'border-primary ring-2 ring-primary/20' : 'border-border/40 hover:border-border'}`}
                    onClick={() => { setJewelerReferenceSource('ai_preview'); setSelectedReferenceUrl(img.image_url); }}
                  >
                    <img src={img.image_url} alt={`AI Preview ${idx + 1}`} className="h-20 w-20 object-contain rounded-md p-0.5 bg-muted/50" />
                    {jewelerReferenceSource === 'ai_preview' && selectedReferenceUrl === img.image_url && (
                      <div className="flex justify-center py-0.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /></div>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}
          {customerUploadedImages.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase">Customer Uploaded Images</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {customerUploadedImages.map((url, idx) => (
                  <label
                    key={idx}
                    className={`flex-shrink-0 cursor-pointer rounded-lg border-2 transition-all ${jewelerReferenceSource === 'customer_upload' && selectedReferenceUrl === url ? 'border-primary ring-2 ring-primary/20' : 'border-border/40 hover:border-border'}`}
                    onClick={() => { setJewelerReferenceSource('customer_upload'); setSelectedReferenceUrl(url); }}
                  >
                    <img src={url} alt={`Customer Upload ${idx + 1}`} className="h-20 w-20 object-contain rounded-md p-0.5 bg-muted/50" />
                    {jewelerReferenceSource === 'customer_upload' && selectedReferenceUrl === url && (
                      <div className="flex justify-center py-0.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /></div>
                    )}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="jeweler_upload" id="jeweler_upload" />
              <Label htmlFor="jeweler_upload" className="text-xs cursor-pointer">Upload your own reference image</Label>
            </div>
            {jewelerReferenceSource === 'jeweler_upload' && (
              <div className="pl-6 space-y-2">
                <input
                  ref={jewelerFileInputRef}
                  type="file"
                  accept="image/png,image/webp,image/jpeg,application/pdf"
                  multiple
                  className="hidden"
                  onChange={e => { if (e.target.files?.length) handleJewelerImageUpload(e.target.files); if (jewelerFileInputRef.current) jewelerFileInputRef.current.value = ''; }}
                />
                <Button type="button" variant="outline" size="sm" className="gap-2 text-xs" disabled={jewelerUploading} onClick={() => jewelerFileInputRef.current?.click()}>
                  {jewelerUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  {jewelerUploading ? "Uploading..." : "Choose Image(s)"}
                </Button>
                {jewelerUploadedUrls.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {jewelerUploadedUrls.map((url, idx) => (
                      <div key={idx} className="relative">
                        <div className="h-16 w-16 rounded border border-primary/30 bg-muted/50 overflow-hidden">
                          {jewelerUploadedPreviews[idx] ? (
                            <img src={jewelerUploadedPreviews[idx]} alt={`Upload ${idx + 1}`} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center"><Image className="h-5 w-5 text-muted-foreground" /></div>
                          )}
                        </div>
                        <button type="button" onClick={() => { setJewelerUploadedUrls(prev => prev.filter((_, i) => i !== idx)); setJewelerUploadedPreviews(prev => prev.filter((_, i) => i !== idx)); }} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                          <X className="h-2.5 w-2.5" />
                        </button>
                        <p className="text-[9px] text-muted-foreground mt-0.5 max-w-[4rem] truncate">{url.split('/').pop()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <RadioGroupItem value="none" id="no_ref" />
              <Label htmlFor="no_ref" className="text-xs cursor-pointer text-muted-foreground">No reference image</Label>
            </div>
          </div>
        </RadioGroup>
      )}
    </div>
  );

  const renderTechnicalSpecs = () => (
    <>
      {isGrillz && (
        <>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pt-1">Grillz CAD Specifications</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Dental Impressions / 3D Scans</Label>
              <Select value={dentalImpressionType} onValueChange={setDentalImpressionType}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="physical_mold">Physical Mold</SelectItem>
                  <SelectItem value="3d_scan">3D Scan</SelectItem>
                  <SelectItem value="not_provided">Not Provided</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tooth Coverage</Label>
              <Input placeholder="e.g., Full coverage top 6" value={toothCoverage} onChange={e => setToothCoverage(e.target.value)} className="mt-1 h-8 text-sm placeholder:text-gray-400" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Pattern Design</Label>
            <Input placeholder="e.g., Diamond-cut pattern" value={patternDesign} onChange={e => setPatternDesign(e.target.value)} className="mt-1 h-8 text-sm placeholder:text-gray-400" />
          </div>
        </>
      )}
      {source === 'ring_builder' && (
        <>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pt-1">Ring CAD Specifications</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Ring Size</Label>
              <Input placeholder="e.g., 7" value={ringSize} onChange={e => setRingSize(e.target.value)} className="mt-1 h-8 text-sm placeholder:text-gray-400" />
            </div>
            <div>
              <Label className="text-xs">Carat Size</Label>
              <Input placeholder="e.g., 1.5" value={caratSize} onChange={e => setCaratSize(e.target.value)} className="mt-1 h-8 text-sm placeholder:text-gray-400" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Center Stone Specs</Label>
            <Input placeholder="e.g., 1.5ct Round Brilliant, F color, VS1" value={centerStoneSpecs} onChange={e => setCenterStoneSpecs(e.target.value)} className="mt-1 h-8 text-sm placeholder:text-gray-400" />
          </div>
          <div>
            <Label className="text-xs">Halo / Pavé Layout</Label>
            <Input placeholder="e.g., Single halo with micro-pavé" value={haloPaveLayout} onChange={e => setHaloPaveLayout(e.target.value)} className="mt-1 h-8 text-sm placeholder:text-gray-400" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Shank Width</Label>
              <Input placeholder="e.g., 1.8mm" value={shankWidth} onChange={e => setShankWidth(e.target.value)} className="mt-1 h-8 text-sm placeholder:text-gray-400" />
            </div>
            <div>
              <Label className="text-xs">Gallery Comfort</Label>
              <Select value={galleryComfort} onValueChange={setGalleryComfort}>
                <SelectTrigger className="mt-1 h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="comfort_fit">Comfort Fit</SelectItem>
                  <SelectItem value="euro_shank">Euro Shank</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}
    </>
  );

  // ── Main render ─────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New CAD Request</DialogTitle>
          <DialogDescription>
            {step === 0 ? "What type of CAD request would you like to create?" :
             step === 1 ? "Search and select a ring from the Ring OS catalog" :
             `Add ${getHeaderLabel().toLowerCase()} for your CAD request`}
          </DialogDescription>
        </DialogHeader>

        {/* Step 0: Entry Point Picker */}
        {step === 0 && (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => { setEntryType('ring_os'); setSource('ring_os'); setStep(1); }}
              className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-border/60 hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 text-center group"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <Gem className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Ring OS Ring</p>
                <p className="text-xs text-muted-foreground mt-1">Search from the master catalog</p>
              </div>
            </button>

            <button
              onClick={() => { setEntryType('custom'); setSource('custom'); setIsCustomRing(true); setStep(2); }}
              className="flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-border/60 hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 text-center group"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Something Else</p>
                <p className="text-xs text-muted-foreground mt-1">Custom ring, grillz, jewelry, etc.</p>
              </div>
            </button>
          </div>
        )}

        {/* Step 1: Ring Search */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search rings by name, style, or shape..."
                value={ringSearch}
                onChange={e => setRingSearch(e.target.value)}
                className="pl-9 placeholder:text-gray-400"
              />
            </div>

            <div className="max-h-[350px] overflow-y-auto space-y-1 border rounded-lg p-2">
              {ringsLoading && masterRings.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : masterRings.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {ringSearch ? "No rings found" : "Loading rings..."}
                </p>
              ) : (
                <>
                  {masterRings.map(ring => (
                    <button
                      key={ring.id}
                      className="w-full text-left px-3 py-2.5 rounded-md hover:bg-muted/50 transition-colors flex items-center justify-between gap-2"
                      onClick={() => handleSelectRing(ring)}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {ring.product_name || ring.combination_id}
                        </p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          {ring.style_name && <Badge variant="outline" className="text-[10px]">{ring.style_name}</Badge>}
                          {ring.shank_name && <Badge variant="outline" className="text-[10px]">{ring.shank_name}</Badge>}
                          {ring.visual_color_name && <Badge variant="outline" className="text-[10px]">{ring.visual_color_name}</Badge>}
                          {ring.shape_name && <Badge variant="outline" className="text-[10px]">{ring.shape_name}</Badge>}
                        </div>
                      </div>
                    </button>
                  ))}
                  {hasMoreRings && (
                    <Button variant="ghost" size="sm" className="w-full mt-2 text-xs" onClick={loadMoreRings} disabled={ringsLoading}>
                      {ringsLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                      Load more rings
                    </Button>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
            </div>
          </div>
        )}

        {/* Step 2: Details Form */}
        {step === 2 && (
          <div className="space-y-4">
            {selectedRing && !isCustomRing && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <span className="text-muted-foreground">Selected: </span>
                <span className="font-medium">{selectedRing.product_name || selectedRing.combination_id}</span>
                <Button variant="link" size="sm" className="ml-2 text-xs h-auto p-0" onClick={() => { setStep(1); setSelectedRing(null); }}>
                  Change
                </Button>
              </div>
            )}

            {isSegmented && isCustomRing ? (
              <div className="space-y-4">
                {renderCustomerInfoSection()}
                {renderJewelerSection()}
              </div>
            ) : (
              <>
                {/* Custom "Something Else" form — full form with all fields */}
                {isCustomRing && entryType === 'custom' && (
                  <>
                    <div>
                      <Label>What type of jewelry?</Label>
                      <Select value={jewelryType} onValueChange={setJewelryType}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select type..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ring">Ring</SelectItem>
                          <SelectItem value="pendant">Pendant</SelectItem>
                          <SelectItem value="bracelet">Bracelet</SelectItem>
                          <SelectItem value="chain">Chain</SelectItem>
                          <SelectItem value="earrings">Earrings</SelectItem>
                          <SelectItem value="grillz">Grillz</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Describe what you need</Label>
                      <Textarea
                        placeholder="Describe the piece in detail — style, stones, inspiration, etc."
                        value={customDescription}
                        onChange={e => setCustomDescription(e.target.value)}
                        className="mt-1.5 min-h-[80px] placeholder:text-gray-400"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Metal Type</Label>
                        <Input placeholder="e.g., White Gold, Platinum" value={metalType} onChange={e => setMetalType(e.target.value)} className="mt-1.5 placeholder:text-gray-400" />
                      </div>
                      <div>
                        <Label>Metal Purity</Label>
                        <Input placeholder="e.g., 14K, 18K" value={metalPurity} onChange={e => setMetalPurity(e.target.value)} className="mt-1.5 placeholder:text-gray-400" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Style / Shape</Label>
                        <Input placeholder="e.g., Solitaire, Cuban, etc." value={style} onChange={e => setStyle(e.target.value)} className="mt-1.5 placeholder:text-gray-400" />
                      </div>
                      <div>
                        <Label>Dimensions</Label>
                        <Input placeholder="e.g., 7" value={ringSize} onChange={e => setRingSize(e.target.value)} className="mt-1.5 placeholder:text-gray-400" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Budget</Label>
                        <Input placeholder="e.g., $2,000 - $5,000" value={budget} onChange={e => setBudget(e.target.value)} className="mt-1.5 placeholder:text-gray-400" />
                      </div>
                      <div>
                        <Label>Timeline</Label>
                        <Input placeholder="e.g., 2-4 weeks" value={timeline} onChange={e => setTimeline(e.target.value)} className="mt-1.5 placeholder:text-gray-400" />
                      </div>
                    </div>

                    {/* Upload reference images */}
                    <div>
                      <Label className="text-sm mb-2 block">Reference Images</Label>
                      <input
                        ref={jewelerFileInputRef}
                        type="file"
                        accept="image/png,image/webp,image/jpeg,application/pdf"
                        multiple
                        className="hidden"
                        onChange={e => { if (e.target.files?.length) handleJewelerImageUpload(e.target.files); if (jewelerFileInputRef.current) jewelerFileInputRef.current.value = ''; }}
                      />
                      <Button type="button" variant="outline" size="sm" className="gap-2" disabled={jewelerUploading} onClick={() => jewelerFileInputRef.current?.click()}>
                        {jewelerUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                        {jewelerUploading ? "Uploading..." : "Upload Images"}
                      </Button>
                      {jewelerUploadedPreviews.length > 0 && (
                        <div className="flex gap-2 flex-wrap mt-2">
                          {jewelerUploadedPreviews.map((preview, idx) => (
                            <div key={idx} className="relative">
                              <img src={preview} alt={`Upload ${idx + 1}`} className="h-16 w-16 rounded border object-cover" />
                              <button type="button" onClick={() => { setJewelerUploadedUrls(prev => prev.filter((_, i) => i !== idx)); setJewelerUploadedPreviews(prev => prev.filter((_, i) => i !== idx)); }} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Ring OS selected or non-custom-entry forms */}
                {(!isCustomRing || entryType !== 'custom') && (
                  <>
                    {isCustomRing && (
                      <div>
                        <Label>Ring / Jewelry Description</Label>
                        <Textarea placeholder="Describe the jewelry piece you need a CAD for..." value={customDescription} onChange={e => setCustomDescription(e.target.value)} className="mt-1.5 min-h-[80px] placeholder:text-gray-400" />
                      </div>
                    )}

                    {isFieldVisible(source, 'ringSize') && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Ring Size</Label>
                          <Input placeholder="e.g., 7" value={ringSize} onChange={e => setRingSize(e.target.value)} className="mt-1.5 placeholder:text-gray-400" />
                        </div>
                        {isFieldVisible(source, 'caratSize') && (
                          <div>
                            <Label>Carat Size</Label>
                            <Input placeholder="e.g., 1.5" value={caratSize} onChange={e => setCaratSize(e.target.value)} className="mt-1.5 placeholder:text-gray-400" />
                          </div>
                        )}
                      </div>
                    )}

                    {isFieldVisible(source, 'centerStoneSpecs') && (
                      <>
                        <div>
                          <Label>Center Stone Specs</Label>
                          <Input placeholder="e.g., 1.5ct Round Brilliant, F color, VS1" value={centerStoneSpecs} onChange={e => setCenterStoneSpecs(e.target.value)} className="mt-1.5 placeholder:text-gray-400" />
                        </div>
                        <div>
                          <Label>Halo / Pavé Layout</Label>
                          <Input placeholder="e.g., Single halo with micro-pavé" value={haloPaveLayout} onChange={e => setHaloPaveLayout(e.target.value)} className="mt-1.5 placeholder:text-gray-400" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <Label>Shank Width</Label>
                            <Input placeholder="e.g., 1.8mm" value={shankWidth} onChange={e => setShankWidth(e.target.value)} className="mt-1.5 placeholder:text-gray-400" />
                          </div>
                          <div>
                            <Label>Gallery Comfort</Label>
                            <Select value={galleryComfort} onValueChange={setGalleryComfort}>
                              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="standard">Standard</SelectItem>
                                <SelectItem value="comfort_fit">Comfort Fit</SelectItem>
                                <SelectItem value="euro_shank">Euro Shank</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </>
                    )}

                    {!isCustomRing && (
                      <div>
                        <Label>Additional Notes</Label>
                        <Textarea placeholder="Any special requirements or notes..." value={customDescription} onChange={e => setCustomDescription(e.target.value)} className="mt-1.5 min-h-[60px] placeholder:text-gray-400" />
                      </div>
                    )}
                  </>
                )}

                {/* Customer Name + Email — always show for both entry types */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Customer Name</Label>
                    <Input value={customerName} onChange={e => setCustomerName(e.target.value)} className="mt-1.5 placeholder:text-gray-400" />
                  </div>
                  <div>
                    <Label>Customer Email</Label>
                    <Input value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} className="mt-1.5 placeholder:text-gray-400" />
                  </div>
                </div>

                <div>
                  <Label>Extra Notes / Instructions for JewlX</Label>
                  <Textarea placeholder="Any additional instructions for the CAD team..." value={clientNotes} onChange={e => setClientNotes(e.target.value)} className="mt-1.5 min-h-[60px] placeholder:text-gray-400" />
                </div>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => {
                if (prefill) { onOpenChange(false); }
                else if (isSegmented) { setStep(0); }
                else if (isCustomRing && entryType === 'custom') { setIsCustomRing(false); setStep(0); }
                else { setStep(1); setSelectedRing(null); }
              }}>
                Back
              </Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Submitting...</> : "Submit Request"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-xs font-medium">{value}</span>
    </div>
  );
}
