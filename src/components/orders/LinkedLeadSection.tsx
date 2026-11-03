import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { GrillTeethDiagram } from '@/components/leads/GrillTeethDiagram';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Image, Sparkles, FileText, Settings } from 'lucide-react';

interface LinkedLeadSectionProps {
  orderSource: string | null;
  customerEmail: string;
  clientId?: string;
  orderCreatedAt: string;
}

const SectionCard = ({ title, icon: Icon, children, defaultOpen = true }: { title: string; icon?: any; children: React.ReactNode; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="pb-4 border-b border-border/40 last:border-0">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full text-left text-sm font-semibold mb-3 flex items-center gap-2 hover:text-primary transition-colors" type="button">
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
            {title}
            <svg className={`h-3.5 w-3.5 ml-auto text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>{children}</CollapsibleContent>
      </Collapsible>
    </div>
  );
};

const ConfigField = ({ label, value }: { label: string; value: string }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium capitalize">{String(value).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</p>
  </div>
);

export function LinkedLeadSection({ orderSource, customerEmail, clientId, orderCreatedAt }: LinkedLeadSectionProps) {
  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [previewImages, setPreviewImages] = useState<Array<{ image_url: string; feedback: string | null }>>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const isCustomX = orderSource === 'grillz-builder' || orderSource === 'custom-inquiry';

  useEffect(() => {
    if (!isCustomX || !customerEmail || !clientId) {
      setLoading(false);
      return;
    }

    const fetchLinkedLead = async () => {
      try {
        const table = orderSource === 'grillz-builder' ? 'grill_form_leads' : 'custom_enquiry_leads';
        const { data } = await supabase
          .from(table)
          .select('*')
          .eq('customer_email', customerEmail)
          .eq('client_id', clientId)
          .lte('created_at', orderCreatedAt)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (data) {
          setLead(data);
          const leadId = data.id;
          const previewTable = orderSource === 'grillz-builder' ? 'grillz_ai_previews' : 'enquiry_ai_previews';
          const { data: previews } = await (supabase as any)
            .from(previewTable)
            .select('image_url, feedback')
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false });
          if (previews) setPreviewImages(previews as Array<{ image_url: string; feedback: string | null }>);
        }
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };

    fetchLinkedLead();
  }, [orderSource, customerEmail, clientId, orderCreatedAt, isCustomX]);

  if (!isCustomX) return null;
  if (loading) return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
  if (!lead) return null;

  const config = lead.configuration || {};
  const isGrillz = orderSource === 'grillz-builder';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">Original Submission</h3>
        <Badge variant="outline" className="text-[10px]">
          {isGrillz ? 'Grillz Form' : 'Custom Enquiry'}
        </Badge>
      </div>

      {/* Grillz teeth diagram */}
      {isGrillz && (config.top_teeth || config.bottom_teeth) && (
        <SectionCard title="Selected Teeth" icon={Sparkles}>
          <GrillTeethDiagram topTeeth={config.top_teeth || 'none'} bottomTeeth={config.bottom_teeth || 'none'} metalType={config.metal_type} />
        </SectionCard>
      )}

      {/* AI Previews */}
      {previewImages.length > 0 && (
        <SectionCard title="AI Generated Previews" icon={Image}>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {previewImages.map((item, idx) => (
              <img
                key={idx}
                src={item.image_url}
                alt={`AI Preview ${idx + 1}`}
                className="h-32 w-32 sm:h-40 sm:w-40 object-contain rounded-lg border border-border/50 cursor-pointer hover:opacity-80 transition-opacity bg-muted/50 p-1"
                onClick={() => setSelectedImage(item.image_url)}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Uploaded images */}
      {config.uploaded_image_urls?.length > 0 && (
        <SectionCard title="Uploaded Images" icon={Image}>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {config.uploaded_image_urls.map((url: string, idx: number) => (
              <img key={idx} src={url} alt={`Upload ${idx + 1}`} className="h-32 w-32 object-contain rounded-lg border border-border/50 cursor-pointer hover:opacity-80 bg-muted/50 p-1" onClick={() => setSelectedImage(url)} />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Configuration */}
      <SectionCard title="Submission Details" icon={Settings}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {isGrillz ? (
            <>
              {config.grillz_type && <ConfigField label="Grillz Type" value={config.grillz_type} />}
              {config.metal_type && <ConfigField label="Metal Type" value={config.metal_type} />}
              {config.metal_purity && <ConfigField label="Purity" value={config.metal_purity} />}
              {config.top_teeth && config.top_teeth !== 'none' && <ConfigField label="Top Teeth" value={config.top_teeth} />}
              {config.bottom_teeth && config.bottom_teeth !== 'none' && <ConfigField label="Bottom Teeth" value={config.bottom_teeth} />}
              {config.budget && <ConfigField label="Budget" value={config.budget} />}
            </>
          ) : (
            <>
              {config.jewelry_type && <ConfigField label="Jewelry Type" value={config.jewelry_type} />}
              {config.budget && <ConfigField label="Budget" value={config.budget} />}
              {config.gold_color && <ConfigField label="Gold Color" value={config.gold_color} />}
              {config.karat && <ConfigField label="Karat" value={config.karat} />}
              {config.diamond_quality && <ConfigField label="Diamond Quality" value={config.diamond_quality} />}
              {config.diamond_setup && <ConfigField label="Diamond Setup" value={config.diamond_setup} />}
              {config.back_option && <ConfigField label="Back" value={config.back_option} />}
              {config.timeline && <ConfigField label="Timeline" value={config.timeline} />}
            </>
          )}
        </div>
      </SectionCard>

      {/* Description / Notes */}
      {(config.description || lead.notes) && (
        <SectionCard title="Request & Notes" icon={FileText} defaultOpen={false}>
          {config.description && <p className="text-sm text-muted-foreground">{config.description}</p>}
          {lead.notes && lead.notes !== config.description && <p className="text-sm text-muted-foreground mt-2">{lead.notes}</p>}
        </SectionCard>
      )}

      {/* Question Answers */}
      {config.question_answers && Object.keys(config.question_answers).length > 0 && (
        <SectionCard title="Form Answers" icon={FileText} defaultOpen={false}>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {Object.entries(config.question_answers).map(([key, qa]: [string, any]) => {
              const answer = qa?.text || (qa?.answer === true ? 'Yes' : qa?.answer === false ? 'No' : String(qa?.answer ?? '—'));
              return <ConfigField key={key} label={key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())} value={answer} />;
            })}
          </div>
        </SectionCard>
      )}

      <Dialog open={!!selectedImage} onOpenChange={(open) => { if (!open) setSelectedImage(null); }}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-4 flex items-center justify-center">
          {selectedImage && <img src={selectedImage} alt="Preview" className="max-w-full max-h-[80vh] object-contain rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}