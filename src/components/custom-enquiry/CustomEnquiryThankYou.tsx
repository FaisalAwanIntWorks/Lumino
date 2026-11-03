import { useMemo } from 'react';
import { AIPreviewThankYou } from '@/components/form-wizard/AIPreviewThankYou';
import type { ThankYouContact } from '@/lib/thank-you-contact';
import type { AiImageDelivery } from '@/lib/ai-image-delivery';
import { ENQUIRY_PHASES } from '@/components/form-wizard/ai-generation-phases';

interface EnquiryConfig {
  jewelryType?: string;
  goldColor?: string;
  karat?: string;
  diamondQuality?: string;
  diamondSetup?: string;
  backOption?: string;
  budget?: string;
  description?: string;
  additionalNotes?: string;
  engravingText?: string;
  questionAnswers?: Record<string, any>;
}

interface CustomEnquiryThankYouProps {
  onReset: () => void;
  backgroundColor: string;
  fontColor: string;
  accentColor: string;
  leadId: string;
  clientId: string;
  enquiryConfig: EnquiryConfig;
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

export function CustomEnquiryThankYou({
  onReset,
  backgroundColor,
  fontColor,
  accentColor,
  leadId,
  clientId,
  enquiryConfig,
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
}: CustomEnquiryThankYouProps) {
  const summaryItems = useMemo(() => {
    const base = [
      { label: 'Type', value: enquiryConfig.jewelryType || '' },
      { label: 'Gold Color', value: enquiryConfig.goldColor || '' },
      { label: 'Karat', value: enquiryConfig.karat || '' },
      { label: 'Diamond', value: enquiryConfig.diamondQuality || '' },
      { label: 'Setup', value: enquiryConfig.diamondSetup || '' },
      { label: 'Back', value: enquiryConfig.backOption || '' },
      { label: 'Budget', value: enquiryConfig.budget || '' },
    ].filter(i => i.value);
    const seen = new Set(base.map(i => i.label.toLowerCase()));
    const extras = (extraSummaryItems || []).filter(i => i.value && !seen.has(i.label.toLowerCase()));
    return [...base, ...extras];
  }, [enquiryConfig, extraSummaryItems]);

  const buildRequestBody = useMemo(() => (genNumber: number, instruction?: string) => {
    const body: Record<string, any> = {
      leadId,
      clientId,
      jewelryType: enquiryConfig.jewelryType,
      goldColor: enquiryConfig.goldColor,
      karat: enquiryConfig.karat,
      diamondQuality: enquiryConfig.diamondQuality,
      diamondSetup: enquiryConfig.diamondSetup,
      backOption: enquiryConfig.backOption,
      budget: enquiryConfig.budget,
      description: enquiryConfig.description,
      additionalNotes: enquiryConfig.additionalNotes,
      engravingText: enquiryConfig.engravingText,
      questionAnswers: enquiryConfig.questionAnswers,
      generationNumber: genNumber,
      backgroundColor,
    };
    if (instruction?.trim()) body.customInstruction = instruction.trim();
    return body;
  }, [leadId, clientId, enquiryConfig, backgroundColor]);

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
      phases={ENQUIRY_PHASES}
      functionName="generate-enquiry-preview"
      previewTable="custom_enquiry_preview_images"
      downloadPrefix="enquiry-preview"
      imageAlt="AI-generated jewelry preview"
      buildRequestBody={buildRequestBody}
      thankYouContact={thankYouContact}
      delivery={delivery}
    />
  );
}
