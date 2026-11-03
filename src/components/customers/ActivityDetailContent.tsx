import { useState, useEffect, useMemo, useCallback } from 'react';
import { fallbackToPngOnError } from '@/lib/webp-image-fallback';
import { supabase } from '@/integrations/supabase/client';
import { LinkedLeadSection } from '@/components/orders/LinkedLeadSection';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

import { GrillTeethDiagram } from '@/components/leads/GrillTeethDiagram';
import { LeadCostEstimation } from '@/components/leads/LeadCostEstimation';
import { LeadCataloguePrice } from '@/components/leads/LeadCataloguePrice';
import { SendQuoteSection } from '@/components/leads/SendQuoteSection';
import { NewCadRequestDialog } from '@/components/cad-requests/NewCadRequestDialog';
import { useLeadFormQuestions } from '@/hooks/useLeadFormQuestions';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  Image, Sparkles, FileText, DollarSign, Ruler, Calendar,
  Check, Pencil, ThumbsUp, ThumbsDown, AlertTriangle
} from 'lucide-react';
import type { CustomerActivity } from '@/hooks/useCustomerHub';

// ── Shared sub-components (same as LeadDetailView) ──

const ConfigField = ({ label, value, raw }: { label: string; value: string; raw?: boolean }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium capitalize">
      {raw ? value : String(value).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
    </p>
  </div>
);

const SectionCard = ({ title, icon: Icon, children }: { title: string; icon?: any; children: React.ReactNode }) => (
  <div className="pb-4 border-b border-border/40 last:border-0">
    <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      {title}
    </h3>
    {children}
  </div>
);

const ImageGallery = ({ images, loading, title, showFeedback = false, showCustomInstruction = false }: {
  images: Array<{ image_url: string; feedback: string | null; custom_instruction?: string | null }> | string[];
  loading: boolean;
  title: string;
  showFeedback?: boolean;
  showCustomInstruction?: boolean;
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  if (loading) return <div className="flex gap-3 overflow-x-auto pb-1">{[0,1,2].map(i => <Skeleton key={i} className="h-32 w-32 rounded-lg flex-shrink-0" />)}</div>;
  const normalizedImages = images.map(img => typeof img === 'string' ? { image_url: img, feedback: null, custom_instruction: null } : img);
  if (normalizedImages.length === 0) return <p className="text-xs text-muted-foreground italic">No images available</p>;
  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {normalizedImages.map((item, idx) => (
          <div key={idx} className="flex-shrink-0">
            <div className="relative">
              <img src={item.image_url} alt={`${title} ${idx + 1}`} className="h-32 w-32 sm:h-40 sm:w-40 object-contain rounded-lg border border-border/50 cursor-pointer hover:opacity-80 transition-opacity bg-muted/50 p-1" onClick={() => setSelectedImage(item.image_url)} onError={fallbackToPngOnError} />
              {showFeedback && item.feedback && (
                <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center ${item.feedback === 'liked' ? 'bg-emerald-500' : 'bg-red-500'}`}>
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
          {selectedImage && <img src={selectedImage} alt={title} className="max-w-full max-h-[80vh] object-contain rounded-lg" onError={fallbackToPngOnError} />}
        </DialogContent>
      </Dialog>
    </>
  );
};

// ── Main Component ──

interface ActivityDetailContentProps {
  activity: CustomerActivity;
  clientId: string;
  hasEditAccess: boolean;
  widgetLeadImages: string[];
  widgetImageLoading: boolean;
  grillPreviewImages: Array<{ image_url: string; feedback: string | null; custom_instruction?: string | null }>;
  grillPreviewLoading: boolean;
  enquiryPreviewImages: Array<{ image_url: string; feedback: string | null; custom_instruction?: string | null }>;
  enquiryPreviewLoading: boolean;
  ringPreviewImages: Array<{ image_url: string; feedback: string | null; custom_instruction?: string | null }>;
  ringPreviewLoading: boolean;
  currency?: string;
}

export function ActivityDetailContent({
  activity, clientId, hasEditAccess,
  widgetLeadImages, widgetImageLoading,
  grillPreviewImages, grillPreviewLoading,
  enquiryPreviewImages, enquiryPreviewLoading,
  ringPreviewImages, ringPreviewLoading,
  currency = 'USD',
}: ActivityDetailContentProps) {
  const config = activity.configuration || {};
  const source = activity.source;
  const [cadDialogOpen, setCadDialogOpen] = useState(false);
  const [newRingCadDialogOpen, setNewRingCadDialogOpen] = useState(false);
  const [existingCadRequest, setExistingCadRequest] = useState<{ id: string; status: string; created_at: string; cad_file_urls: string[] | null; delivered_at: string | null } | null>(null);
  const [cadFileSignedUrls, setCadFileSignedUrls] = useState<{ name: string; url: string }[]>([]);

  // Map source for useLeadFormQuestions
  const questionSource = useMemo(() => {
    const map: Record<string, string> = { widget: 'widget', diamond_form: 'diamond_form', grill_form: 'grill_form', custom_enquiry: 'custom_enquiry', ring_builder: 'ring_builder' };
    return map[source] || 'widget';
  }, [source]) as 'widget' | 'diamond_form' | 'grill_form' | 'custom_enquiry' | 'ring_builder';

  const { questions: configuredQuestions } = useLeadFormQuestions(clientId, questionSource);

  // Parse ring builder JSON description
  const parsedRingBuilder = useMemo(() => {
    if (source !== 'ring_builder' || !config.description) return null;
    try { if (typeof config.description === 'string') return JSON.parse(config.description); } catch { /* not JSON */ }
    return null;
  }, [source, config.description]);

  const requestDescription = useMemo(() => {
    if (source === 'custom_enquiry') return config.description;
    if (source === 'ring_builder') {
      if (parsedRingBuilder?.otherDetails) return parsedRingBuilder.otherDetails;
      return config.description && !parsedRingBuilder ? config.description : null;
    }
    return null;
  }, [source, config, parsedRingBuilder]);

  const estimatedTotal = config.estimated_total ? Number(config.estimated_total) : null;
  const hasRequest = !!requestDescription || !!config.jewelry_type || !!config.request_type;
  const notesText = activity.notes;
  const additionalNotes = source === 'custom_enquiry' ? config.additional_notes : null;
  const adminNotes = source === 'ring_builder' ? config.admin_notes : null;
  const rbAdditionalNotes = parsedRingBuilder?.additionalNotes;

  const mergedNotes = useMemo(() => {
    const parts: string[] = [];
    if (notesText && notesText !== requestDescription) parts.push(notesText);
    if (additionalNotes && additionalNotes !== requestDescription && additionalNotes !== notesText) parts.push(additionalNotes);
    if (rbAdditionalNotes && rbAdditionalNotes !== requestDescription && rbAdditionalNotes !== notesText) parts.push(rbAdditionalNotes);
    if (adminNotes && adminNotes !== requestDescription && adminNotes !== notesText) parts.push(adminNotes);
    return parts;
  }, [notesText, additionalNotes, adminNotes, rbAdditionalNotes, requestDescription]);
  const showRequestNotes = hasRequest || mergedNotes.length > 0;

  // Check for existing CAD request
  useEffect(() => {
    if (!['widget', 'diamond_form', 'grill_form', 'custom_enquiry', 'ring_builder'].includes(source)) return;
    const checkExisting = async () => {
      const { data } = await (supabase as any)
        .from('cad_requests')
        .select('id, status, created_at, cad_file_urls, delivered_at')
        .eq('lead_id', activity.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setExistingCadRequest(data);
        if (data.cad_file_urls?.length > 0) {
          const urls: { name: string; url: string }[] = [];
          for (const filePath of data.cad_file_urls) {
            const { data: signedData } = await supabase.storage.from('cad-deliveries').createSignedUrl(filePath, 3600);
            if (signedData?.signedUrl) urls.push({ name: filePath.split('/').pop() || 'CAD File', url: signedData.signedUrl });
          }
          setCadFileSignedUrls(urls);
        }
      }
    };
    checkExisting();
  }, [activity.id, source]);

  // ── Orders ──
  if (activity.type === 'order') {
    const orderSource = activity.orderSource || null;
    return (
      <div className="space-y-4 pt-2">
        {/* Linked lead for Custom X orders */}
        <LinkedLeadSection
          orderSource={orderSource}
          customerEmail={activity.customerEmail}
          clientId={clientId}
          orderCreatedAt={activity.created_at}
        />

        {/* Order details */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {orderSource && <ConfigField label="Source" value={orderSource.replace(/-/g, ' ')} />}
          {activity.shopifyOrderId && <ConfigField label="Order #" value={activity.shopifyOrderId} raw />}
          {activity.amount != null && <ConfigField label="Amount" value={`$${activity.amount.toLocaleString()}`} raw />}
          {activity.shippingStatus && <ConfigField label="Shipping" value={activity.shippingStatus} />}
          {activity.trackingNumber && <ConfigField label="Tracking" value={activity.trackingNumber} raw />}
          <ConfigField label="Date" value={format(new Date(activity.created_at), 'MMM d, yyyy · h:mm a')} raw />
        </div>
        {activity.notes && (
          <div className="pt-3 border-t border-border/30">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm">{activity.notes}</p>
          </div>
        )}
      </div>
    );
  }

  // ── CAD requests/resizes ──
  if (activity.type === 'cad') {
    return (
      <div className="space-y-3 pt-2">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {Object.entries(config).map(([key, value]) => {
            if (!value || key === 'cad_file_urls' || key === 'reference_images') return null;
            return <ConfigField key={key} label={key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} value={String(value).replace(/-/g, ' ')} raw />;
          })}
          <ConfigField label="Date" value={format(new Date(activity.created_at), 'MMM d, yyyy · h:mm a')} raw />
        </div>
        {config.cad_file_urls?.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">CAD Files</p>
            <div className="flex flex-wrap gap-2">
              {config.cad_file_urls.map((url: string, i: number) => (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">File {i + 1}</a>
              ))}
            </div>
          </div>
        )}
        {config.reference_images?.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Reference Images</p>
            <div className="flex flex-wrap gap-2">
              {config.reference_images.map((url: string, i: number) => (
                <img key={i} src={url} alt={`Reference ${i + 1}`} className="h-20 w-20 object-cover rounded border" />
              ))}
            </div>
          </div>
        )}
        {activity.notes && (
          <div className="pt-3 border-t border-border/30">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm">{activity.notes}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Leads, Bookings, Metal IQ — full content sections ──
  return (
    <div className="space-y-1 pt-2">
      {/* Booking appointment details */}
      {source === 'booking' && (config.preferred_date || config.preferred_time || config.booking_status) && (
        <SectionCard title="Appointment Details" icon={Calendar}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {config.preferred_date && <ConfigField label="Preferred Date" value={config.preferred_date} raw />}
            {config.preferred_time && <ConfigField label="Preferred Time" value={config.preferred_time} raw />}
            {config.customer_timezone && <ConfigField label="Timezone" value={config.customer_timezone} raw />}
            {config.booking_status && <ConfigField label="Booking Status" value={config.booking_status} />}
          </div>
        </SectionCard>
      )}

      {/* Design Images */}
      {source === 'widget' && (
        <SectionCard title="Selected Design" icon={Image}>
          <ImageGallery images={widgetLeadImages} loading={widgetImageLoading} title="Ring Angle" />
        </SectionCard>
      )}

      {/* Grillz teeth diagram */}
      {source === 'grill_form' && (
        <SectionCard title="Selected Teeth" icon={Sparkles}>
          <GrillTeethDiagram topTeeth={config.top_teeth || 'none'} bottomTeeth={config.bottom_teeth || 'none'} metalType={config.metal_type} />
        </SectionCard>
      )}

      {/* AI Previews */}
      {source === 'grill_form' && (
        <SectionCard title="AI Generated Previews" icon={Image}>
          <ImageGallery images={grillPreviewImages} loading={grillPreviewLoading} title="AI Preview" showFeedback showCustomInstruction />
        </SectionCard>
      )}
      {source === 'custom_enquiry' && (
        <SectionCard title="AI Generated Previews" icon={Image}>
          <ImageGallery images={enquiryPreviewImages} loading={enquiryPreviewLoading} title="AI Preview" showFeedback showCustomInstruction />
        </SectionCard>
      )}
      {source === 'ring_builder' && (
        <SectionCard title="AI Generated Previews" icon={Image}>
          <ImageGallery images={ringPreviewImages} loading={ringPreviewLoading} title="AI Preview" showFeedback showCustomInstruction />
        </SectionCard>
      )}

      {/* Metal IQ Photos */}
      {source === 'metal_iq' && config.photo_urls?.length > 0 && (
        <SectionCard title="Customer Photos" icon={Image}>
          <ImageGallery images={config.photo_urls} loading={false} title="Metal Photo" />
        </SectionCard>
      )}

      {/* Inspiration / Uploaded Images */}
      {source === 'diamond_form' && config.inspiration_image_urls?.length > 0 && (
        <SectionCard title="Inspiration Images" icon={Image}>
          <ImageGallery images={config.inspiration_image_urls} loading={false} title="Inspiration" />
        </SectionCard>
      )}
      {source === 'ring_builder' && config.reference_images?.length > 0 && (
        <SectionCard title="Reference Images" icon={Image}>
          <ImageGallery images={config.reference_images} loading={false} title="Reference" />
        </SectionCard>
      )}
      {source === 'grill_form' && config.uploaded_image_urls?.length > 0 && (
        <SectionCard title="Uploaded Images" icon={Image}>
          <ImageGallery images={config.uploaded_image_urls} loading={false} title="Upload" />
        </SectionCard>
      )}
      {source === 'custom_enquiry' && config.uploaded_image_urls?.length > 0 && (
        <SectionCard title="Uploaded Images" icon={Image}>
          <ImageGallery images={config.uploaded_image_urls} loading={false} title="Upload" />
        </SectionCard>
      )}

      {/* Configuration / Metal Details */}
      <SectionCard title={source === 'metal_iq' ? 'Metal Details' : 'Configuration'}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
          {source === 'widget' && (
            <>
              {config.style && <ConfigField label="Style" value={config.style} />}
              {config.shank && <ConfigField label="Shank" value={config.shank} />}
              {config.metal && <ConfigField label="Metal" value={config.metal} />}
              {config.shape && <ConfigField label="Shape" value={config.shape} />}
              {config.caratRange != null && <ConfigField label="Carat" value={String(config.caratRange)} raw />}
              {config.size && <ConfigField label="Size" value={String(config.size)} raw />}
              {config.visualColor && <ConfigField label="Color" value={config.visualColor} />}
              {config.stone && <ConfigField label="Stone" value={config.stone} />}
              {config.engraving?.enabled && <ConfigField label="Engraving" value={config.engraving.text || 'Enabled'} raw />}
            </>
          )}

          {source === 'diamond_form' && (
            <>
              {config.diamond_type && <ConfigField label="Type" value={config.diamond_type} />}
              {config.diamond_shape && <ConfigField label="Shape" value={config.diamond_shape} />}
              {config.diamond_size && <ConfigField label="Size" value={config.diamond_size} />}
              {config.diamond_quality && <ConfigField label="Quality" value={config.diamond_quality} />}
              {config.diamond_metal && <ConfigField label="Metal" value={config.diamond_metal} />}
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

          {source === 'grill_form' && (
            <>
              {config.grillz_type && <ConfigField label="Grillz Type" value={config.grillz_type} />}
              {config.metal_type && <ConfigField label="Metal Type" value={config.metal_type} />}
              {config.metal_purity && <ConfigField label="Purity" value={config.metal_purity} />}
              <ConfigField label="Top Teeth" value={config.top_teeth === 'none' ? 'None' : config.top_teeth || '—'} raw />
              <ConfigField label="Bottom Teeth" value={config.bottom_teeth === 'none' ? 'None' : config.bottom_teeth || '—'} raw />
              {config.budget && <ConfigField label="Budget" value={config.budget} raw />}
            </>
          )}

          {source === 'custom_enquiry' && (
            <>
              {config.jewelry_type && <ConfigField label="Jewelry Type" value={config.jewelry_type} />}
              {config.budget && <ConfigField label="Budget" value={config.budget} raw />}
              {config.gold_color && <ConfigField label="Gold Color" value={config.gold_color} />}
              {config.karat && <ConfigField label="Karat" value={config.karat} raw />}
              {config.diamond_quality && <ConfigField label="Diamond Quality" value={config.diamond_quality} raw />}
              {config.diamond_setup && <ConfigField label="Diamond Setup" value={config.diamond_setup} raw />}
              {config.back_option && <ConfigField label="Back" value={config.back_option} raw />}
              {config.timeline && <ConfigField label="Timeline" value={config.timeline} raw />}
            </>
          )}

          {source === 'ring_builder' && parsedRingBuilder?.selections && (() => {
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
                {Object.entries(multi).filter(([_, v]) => Array.isArray(v) && (v as any[]).length > 0).map(([key, val]) => (
                  <ConfigField key={key} label={key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} value={(val as string[]).join(', ')} raw />
                ))}
              </>
            );
          })()}

          {source === 'ring_builder' && !parsedRingBuilder && (
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

          {source === 'metal_iq' && (
            <>
              {config.metal_type && <ConfigField label="Metal Type" value={config.metal_type} />}
              {config.karat && <ConfigField label="Karat / Purity" value={config.karat} raw />}
              {config.weight_grams && <ConfigField label="Weight" value={`${config.weight_grams}g`} raw />}
              {config.authenticity && <ConfigField label="Authenticity" value={config.authenticity} />}
              {config.item_type && <ConfigField label="Item Type" value={config.item_type} />}
              {config.condition && <ConfigField label="Condition" value={config.condition} />}
              {config.country && <ConfigField label="Country" value={config.country} raw />}
              {config.city && <ConfigField label="City" value={config.city} raw />}
            </>
          )}

          {/* Custom form questions */}
          {configuredQuestions.length > 0 && configuredQuestions.map((q) => {
            let answer: string = '—';
            const key = q.question_key;
            if (source === 'grill_form' || source === 'custom_enquiry') {
              const qa = config.question_answers?.[key];
              if (qa) {
                if (q.question_type === 'yes_no') answer = qa.answer === true ? 'Yes' : qa.answer === false ? 'No' : '—';
                else if (qa.text) answer = qa.text;
                else if (qa.answer !== null && qa.answer !== undefined) answer = String(qa.answer);
              }
            } else if (source === 'ring_builder') {
              const val = parsedRingBuilder?.questionAnswers?.[key];
              if (val !== null && val !== undefined) answer = typeof val === 'boolean' ? (val ? 'Yes' : 'No') : String(val);
            } else if (source === 'diamond_form') {
              const val = config.custom_answers?.[key];
              if (val !== null && val !== undefined) answer = String(val);
            }
            return <ConfigField key={key} label={q.question_text} value={answer} raw />;
          })}
        </div>
      </SectionCard>

      {/* Request & Notes */}
      {showRequestNotes && (
        <SectionCard title="Request & Notes" icon={FileText}>
          <div className="space-y-3">
            {(config.jewelry_type || config.request_type) && (
              <div>
                <span className="text-xs text-muted-foreground">Item: </span>
                <span className="text-sm font-medium capitalize">{(config.jewelry_type || config.request_type || '').replace(/-|_/g, ' ')}</span>
              </div>
            )}
            {requestDescription && <p className="text-sm text-muted-foreground leading-relaxed">{requestDescription}</p>}
            {mergedNotes.map((note, idx) => <p key={idx} className="text-sm text-muted-foreground leading-relaxed">{note}</p>)}
          </div>
        </SectionCard>
      )}

      {/* Pricing */}
      {source === 'metal_iq' && (config.spot_price_per_gram || config.spot_price_at_time) ? (() => {
        const getCurrencySymbol = (c: string) => {
          const map: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', CAD: 'C$', AUD: 'A$', ZAR: 'R', AED: 'د.إ', SAR: '﷼' };
          return map[c] || '$';
        };
        const cs = getCurrencySymbol(config.currency || currency);
        const spotPerGram = config.spot_price_per_gram ? Number(config.spot_price_per_gram) : (config.spot_price_at_time ? config.spot_price_at_time / 31.1035 : null);
        const pureVal = config.pure_metal_value ? Number(config.pure_metal_value) : null;
        const buyPct = config.buy_percentage ?? (pureVal && config.our_offer ? (Number(config.our_offer) / pureVal) * 100 : null);
        const competitorPct = pureVal && config.competitor_offer ? (Number(config.competitor_offer) / pureVal) * 100 : null;
        return (
          <SectionCard title="Offer Overview" icon={DollarSign}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
      })() : source === 'widget' ? (
        <LeadCataloguePrice clientId={clientId} configuration={config} currency={currency} />
      ) : source !== 'booking' && source !== 'metal_iq' ? (
        <LeadCostEstimation leadId={activity.id} leadSource={source} clientId={clientId} configuration={config} existingEstimate={estimatedTotal} currency={currency} />
      ) : null}

      {/* Send Quote */}
      {source !== 'metal_iq' && source !== 'booking' && (
        <SendQuoteSection leadId={activity.id} leadSource={source} clientId={clientId} customerEmail={activity.customerEmail} customerName={activity.customerName} currency={currency} />
      )}

      {/* CAD Request */}
      {['widget', 'ring_builder', 'grill_form', 'custom_enquiry', 'diamond_form'].includes(source) && (
        <>
          <Separator />
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Ruler className="h-4 w-4 text-muted-foreground" />
              CAD File Request
            </h3>
            {['widget', 'ring_builder', 'diamond_form'].includes(source) && (
              <>
                <p className="text-xs text-muted-foreground mb-3">Standard CAD files are provided at ring size 6 and 3ct carat size.</p>
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

            {existingCadRequest ? (
              <div className="space-y-3">
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-md p-3 text-sm text-emerald-700">
                  <Check className="h-4 w-4 inline mr-1.5" />
                  CAD request submitted
                  <span className="block text-xs text-emerald-600 mt-1">
                    {format(new Date(existingCadRequest.created_at), "MMM d, yyyy 'at' h:mm a")} · Status: <span className="font-medium capitalize">{existingCadRequest.status.replace('_', ' ')}</span>
                  </span>
                </div>
                {cadFileSignedUrls.length > 0 && (
                  <div className="bg-muted/50 rounded-md p-3 space-y-2">
                    <p className="text-xs font-medium text-foreground">📁 Delivered CAD Files</p>
                    {cadFileSignedUrls.map((file, idx) => (
                      <a key={idx} href={file.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs p-2 rounded border bg-background hover:bg-muted transition-colors">
                        <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="truncate flex-1">{file.name}</span>
                        <span className="text-primary text-[10px] font-medium">Download</span>
                      </a>
                    ))}
                    {existingCadRequest.delivered_at && (
                      <p className="text-[10px] text-muted-foreground">Delivered on {format(new Date(existingCadRequest.delivered_at), "MMM d, yyyy 'at' h:mm a")}</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setCadDialogOpen(true)}>
                <Ruler className="h-3.5 w-3.5 mr-1.5" /> Request CAD File
              </Button>
            )}
            {source === 'widget' && (
              <button onClick={() => setNewRingCadDialogOpen(true)} className="text-xs text-primary hover:text-primary/80 underline underline-offset-2 mt-1.5 inline-block">
                Request a CAD for a different ring? Click here
              </button>
            )}
          </div>

          <NewCadRequestDialog
            open={cadDialogOpen}
            onOpenChange={setCadDialogOpen}
            clientId={clientId}
            onCreated={() => {
              setCadDialogOpen(false);
              (async () => {
                const { data } = await (supabase as any).from('cad_requests').select('id, status, created_at, cad_file_urls, delivered_at').eq('lead_id', activity.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
                if (data) setExistingCadRequest(data);
              })();
            }}
            prefill={{
              source: source === 'widget' ? 'ring_os' : source === 'diamond_form' ? 'ring_builder' : source === 'grill_form' ? 'grillz' : source === 'custom_enquiry' ? 'custom_enquiry' : source,
              leadId: activity.id,
              leadTable: source === 'widget' ? 'saved_designs' : source === 'diamond_form' ? 'diamond_form_leads' : source === 'grill_form' ? 'grill_form_leads' : source === 'custom_enquiry' ? 'custom_enquiry_leads' : source === 'ring_builder' ? 'design_requests' : 'saved_designs',
              customerName: activity.customerName || '',
              customerEmail: activity.customerEmail || '',
              ringProductName: config.style || config.productName || activity.productName || '',
              metalType: config.metal || config.metalType || config.metal_type || '',
              style: config.style || '',
              shape: config.shape || config.diamond_shape || '',
              ringSize: config.size || config.ring_size || '',
              caratSize: config.carat || config.caratSize || config.carat_size || '',
              customDescription: '',
              grillzType: config.grillz_type || '',
              topTeeth: config.top_teeth || '',
              bottomTeeth: config.bottom_teeth || '',
              metalPurity: config.metal_purity || config.karat || '',
              jewelryType: config.jewelry_type || '',
              budget: config.budget || '',
              timeline: config.timeline || config.diamond_timeline || '',
              setting: config.diamond_setting || (parsedRingBuilder?.selections?.setting) || '',
              band: config.diamond_band || (parsedRingBuilder?.selections?.band) || '',
            }}
          />
          <NewCadRequestDialog
            open={newRingCadDialogOpen}
            onOpenChange={setNewRingCadDialogOpen}
            clientId={clientId}
            onCreated={() => {
              setNewRingCadDialogOpen(false);
              (async () => {
                const { data } = await (supabase as any).from('cad_requests').select('id, status, created_at, cad_file_urls, delivered_at').eq('lead_id', activity.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
                if (data) setExistingCadRequest(data);
              })();
            }}
            prefill={{
              source: source === 'widget' ? 'ring_os' : source === 'diamond_form' ? 'ring_builder' : source === 'grill_form' ? 'grillz' : source === 'custom_enquiry' ? 'custom_enquiry' : source,
              leadId: activity.id,
              leadTable: source === 'widget' ? 'saved_designs' : source === 'diamond_form' ? 'diamond_form_leads' : source === 'grill_form' ? 'grill_form_leads' : source === 'custom_enquiry' ? 'custom_enquiry_leads' : source === 'ring_builder' ? 'design_requests' : 'saved_designs',
              customerName: activity.customerName || '',
              customerEmail: activity.customerEmail || '',
              ringProductName: config.style || config.productName || activity.productName || '',
              metalType: config.metal || config.metalType || config.metal_type || '',
              style: config.style || '',
              shape: config.shape || config.diamond_shape || '',
              ringSize: config.size || config.ring_size || '',
              caratSize: config.carat || config.caratSize || config.carat_size || '',
              customDescription: '',
              grillzType: config.grillz_type || '',
              topTeeth: config.top_teeth || '',
              bottomTeeth: config.bottom_teeth || '',
              metalPurity: config.metal_purity || config.karat || '',
              jewelryType: config.jewelry_type || '',
              budget: config.budget || '',
              timeline: config.timeline || config.diamond_timeline || '',
              setting: config.diamond_setting || (parsedRingBuilder?.selections?.setting) || '',
              band: config.diamond_band || (parsedRingBuilder?.selections?.band) || '',
            }}
          />
        </>
      )}
    </div>
  );
}
