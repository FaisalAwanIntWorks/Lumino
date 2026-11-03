/**
 * AI render delivery channel (CustomX forms: Grillz Builder, Custom Enquiry).
 *
 * Stored per client in the form config table as text column
 * `ai_image_delivery`. The configurator asks "Do you want to show AI
 * Generated Image on Email or Thank You Page?" and the customer receives the
 * render through the chosen channel only.
 */

export type AiImageDelivery = 'thank_you_page' | 'email';

export const DEFAULT_AI_IMAGE_DELIVERY: AiImageDelivery = 'thank_you_page';

export const AI_IMAGE_DELIVERY_OPTIONS: { value: AiImageDelivery; label: string; icon: string; hint: string }[] = [
  {
    value: 'email',
    label: 'Email',
    icon: '📧',
    hint: 'The AI image is emailed to the customer. It is not shown on the thank-you page.',
  },
  {
    value: 'thank_you_page',
    label: 'Thank You Page',
    icon: '🖼️',
    hint: 'The AI image is shown on the thank-you page. It is not emailed to the customer.',
  },
];

/** Normalise whatever came out of the DB column into a safe value. */
export function resolveAiImageDelivery(raw: unknown): AiImageDelivery {
  return raw === 'email' ? 'email' : DEFAULT_AI_IMAGE_DELIVERY;
}

/**
 * The channel actually used for one submission. Email delivery needs an
 * address — when the customer left the email field empty the render falls
 * back to the thank-you page so it is never lost.
 */
export function getEffectiveAiImageDelivery(
  configured: AiImageDelivery | null | undefined,
  customerEmail: string | null | undefined,
): AiImageDelivery {
  return configured === 'email' && !!customerEmail?.trim() ? 'email' : 'thank_you_page';
}
