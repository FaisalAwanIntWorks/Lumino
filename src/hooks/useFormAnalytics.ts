/**
 * E3: Centralised form-analytics hook.
 * Owns: Meta Pixel init/ViewContent and form_started/step_advanced events.
 * Abandonment tracking (F8) is handled directly in each form component via refs
 * so it can capture the precise step key from sortedSteps at unmount time.
 */

import { useEffect, useRef, useCallback } from 'react';
import { initMetaPixel, trackMetaEvent } from '@/lib/meta-pixel';
import { trackMetaLead } from '@/lib/meta-lead';
import type { MetaCapiUserData } from '@/lib/meta-capi';
import { trackEmbedEvent } from '@/lib/analytics-utils';

type FormType = 'ring_builder' | 'grillz' | 'custom_enquiry';

interface UseFormAnalyticsOptions {
  clientId: string | null | undefined;
  formType: FormType;
  metaPixelId?: string | null;
  currentStep: number;
  submitted: boolean;
}

export function useFormAnalytics({
  clientId,
  formType,
  metaPixelId,
  currentStep,
  submitted,
}: UseFormAnalyticsOptions) {
  const viewContentFiredRef = useRef(false);
  const hasTrackedStartRef = useRef(false);
  const prevStepRef = useRef(-1);

  // Meta Pixel init + ViewContent — fires once when pixelId becomes available.
  useEffect(() => {
    if (!metaPixelId) return;
    initMetaPixel(metaPixelId);
    if (!viewContentFiredRef.current) {
      viewContentFiredRef.current = true;
      const contentName =
        formType === 'ring_builder' ? 'Ring Builder'
        : formType === 'grillz' ? 'Grillz Builder'
        : 'Custom Enquiry';
      trackMetaEvent('ViewContent', { content_name: contentName, content_category: 'form' });
    }
  }, [metaPixelId, formType]);

  // Track form_started on first step advance.
  useEffect(() => {
    if (!clientId || currentStep === 0 || hasTrackedStartRef.current) return;
    hasTrackedStartRef.current = true;
    // Routed through trackEmbedEvent so a rejected insert is logged instead of
    // being swallowed by an empty error handler.
    void trackEmbedEvent(clientId, 'form_started', {
      form_type: formType,
      step_index: currentStep,
    });
  }, [clientId, currentStep, formType]);

  // Track step advancement (deduped via prevStepRef).
  useEffect(() => {
    if (!clientId || currentStep === 0 || currentStep === prevStepRef.current) return;
    prevStepRef.current = currentStep;
    void trackEmbedEvent(clientId, 'form_step_advanced', {
      form_type: formType,
      step_index: currentStep,
    });
  }, [clientId, currentStep, formType]);

  // Expose a stable callback to fire the Meta Lead event on form submit.
  // User data is hashed server-side by meta-capi-track so Meta can match the
  // lead to a person; the same event is mirrored via the Conversions API.
  const trackLead = useCallback((userData?: MetaCapiUserData, leadId?: string) => {
    const contentName =
      formType === 'ring_builder' ? 'Ring Builder'
      : formType === 'grillz' ? 'Grillz Builder'
      : 'Custom Enquiry';
    trackMetaLead({
      clientId,
      eventId: leadId,
      userData,
      customData: { content_name: contentName, content_category: 'form' },
    });
  }, [clientId, formType]);

  return { trackLead };
}
