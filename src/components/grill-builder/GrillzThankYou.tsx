import { useMemo } from 'react';
import { AIPreviewThankYou } from '@/components/form-wizard/AIPreviewThankYou';
import type { ThankYouContact } from '@/lib/thank-you-contact';
import type { AiImageDelivery } from '@/lib/ai-image-delivery';
import { GRILLZ_PHASES } from '@/components/form-wizard/ai-generation-phases';

interface GrillzConfig {
  metalType: string;
  metalPurity?: string;
  grillzType: 'basic' | 'iced-out';
  topTeeth: string;
  bottomTeeth: string;
  fangs?: boolean;
  openFaced?: boolean;
  customMessage?: string;
  engraving?: string;
  description?: string;
  inspirationUrl?: string;
  budget?: string;
  questionAnswers?: Record<string, any>;
}

interface GrillzThankYouProps {
  onReset: () => void;
  backgroundColor: string;
  fontColor: string;
  accentColor: string;
  leadId: string;
  clientId: string;
  grillzConfig: GrillzConfig;
  customerName?: string;
  customerEmail?: string;
  depositAmount?: number;
  checkoutAttributes?: Record<string, string>;
  formType?: string;
  submissionDetails?: Record<string, string>;
  currency?: string;
  extraSummaryItems?: { label: string; value: string }[];
  thankYouContact?: ThankYouContact | null;
  delivery?: AiImageDelivery;
}

export function GrillzThankYou({
  onReset,
  backgroundColor,
  fontColor,
  accentColor,
  leadId,
  clientId,
  grillzConfig,
  customerName,
  customerEmail,
  depositAmount,
  checkoutAttributes,
  formType,
  submissionDetails,
  currency,
  extraSummaryItems,
  thankYouContact,
  delivery,
}: GrillzThankYouProps) {
  const summaryItems = useMemo(() => {
    const base = [
      { label: 'Type', value: grillzConfig.grillzType === 'iced-out' ? 'Iced Out' : grillzConfig.grillzType === 'basic' ? 'Plain' : '' },
      { label: 'Metal', value: grillzConfig.metalType || '' },
      { label: 'Purity', value: grillzConfig.metalPurity || '' },
      { label: 'Top Teeth', value: grillzConfig.topTeeth && grillzConfig.topTeeth !== 'none' ? grillzConfig.topTeeth : '' },
      { label: 'Bottom Teeth', value: grillzConfig.bottomTeeth && grillzConfig.bottomTeeth !== 'none' ? grillzConfig.bottomTeeth : '' },
      { label: 'Fangs', value: grillzConfig.fangs ? 'Yes' : '' },
      { label: 'Open Face', value: grillzConfig.openFaced ? 'Yes' : '' },
      { label: 'Budget', value: grillzConfig.budget || '' },
      { label: 'Engraving', value: grillzConfig.engraving || '' },
      { label: 'Vision / Description', value: grillzConfig.description || '' },
      { label: 'Inspiration', value: grillzConfig.inspirationUrl || '' },
    ].filter(i => i.value);
    const seen = new Set(base.map(i => i.label.toLowerCase()));
    const extras = (extraSummaryItems || []).filter(i => i.value && !seen.has(i.label.toLowerCase()));
    return [...base, ...extras];
  }, [grillzConfig, extraSummaryItems]);

  const buildRequestBody = useMemo(() => (genNumber: number, instruction?: string) => {
    const body: Record<string, any> = {
      leadId,
      clientId,
      metalType: grillzConfig.metalType,
      metalPurity: grillzConfig.metalPurity,
      grillzType: grillzConfig.grillzType,
      topTeeth: grillzConfig.topTeeth,
      bottomTeeth: grillzConfig.bottomTeeth,
      fangs: grillzConfig.fangs,
      openFaced: grillzConfig.openFaced,
      customMessage: grillzConfig.customMessage,
      engraving: grillzConfig.engraving,
      generationNumber: genNumber,
      backgroundColor,
      ...(grillzConfig.questionAnswers ? { questionAnswers: grillzConfig.questionAnswers } : {}),
    };
    if (instruction?.trim()) body.customInstruction = instruction.trim();
    return body;
  }, [leadId, clientId, grillzConfig, backgroundColor]);

  return (
    <AIPreviewThankYou
      onReset={onReset}
      backgroundColor={backgroundColor}
      fontColor={fontColor}
      accentColor={accentColor}
      leadId={leadId}
      clientId={clientId}
      customerName={customerName}
      customerEmail={customerEmail}
      depositAmount={depositAmount}
      checkoutAttributes={checkoutAttributes}
      formType={formType}
      submissionDetails={submissionDetails}
      currency={currency}
      summaryItems={summaryItems}
      phases={GRILLZ_PHASES}
      functionName="generate-grillz-preview"
      previewTable="grill_preview_images"
      downloadPrefix="grillz-preview"
      imageAlt="AI-generated grillz preview"
      buildRequestBody={buildRequestBody}
      thankYouContact={thankYouContact}
      delivery={delivery}
    />
  );
}
