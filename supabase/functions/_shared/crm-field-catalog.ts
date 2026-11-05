// Canonical CRM MVMNT (GoHighLevel) custom-field names per form answer.
//
// These names are an Aurezo standard: identical in every client's CRM location so
// merge tags like {{contact.what_diamond_shape_would_you_like}} behave the same
// in every account and shared email templates keep working. A client renaming a
// step heading inside Aurezo never renames their CRM field.
//
// Every provisioned field is created as a Single Line text field on the Contact
// object, inside a "Aurezo" folder.
//
// The admin UI mirrors this file in src/lib/crm-field-catalog.ts — keep both in
// sync (src/crm-field-catalog.test.ts fails if they drift).

export interface CrmFieldDef {
  /** question_key as used by client_ghl_field_mappings / the CRM form registry. */
  questionKey: string;
  /** Display name created in the CRM. Drives the merge tag. */
  name: string;
  /**
   * Not part of the default provisioning set — offered as an opt-in extra
   * (consent flags and similar) so we never silently create them.
   */
  optional?: boolean;
}

export const CRM_FIELD_FOLDER = 'Aurezo';

export const CRM_FIELD_CATALOG: Record<string, CrmFieldDef[]> = {
  diamond: [
    { questionKey: 'diamond_type', name: 'Would you like natural or lab diamonds' },
    { questionKey: 'diamond_shape', name: 'What diamond shape would you like' },
    { questionKey: 'diamond_size', name: 'Select your ring diamond size' },
    { questionKey: 'diamond_quality', name: 'Select your lab diamond quality' },
    { questionKey: 'diamond_setting', name: 'Which ring settings appeals to you' },
    { questionKey: 'diamond_holder', name: 'How should the diamonds be held' },
    { questionKey: 'diamond_band', name: 'What type of band do you prefer' },
    { questionKey: 'diamond_band_width', name: 'Which band width do you prefer' },
    { questionKey: 'diamond_metal', name: 'Which type of ring metal do you prefer' },
    { questionKey: 'diamond_metal_karat', name: 'Which karat or purity would you like' },
    { questionKey: 'diamond_two_tone_metals', name: 'Which two metals would you like to combine' },
    { questionKey: 'diamond_personalization', name: 'Any features to personalize your ring' },
    { questionKey: 'inspiration_image_urls', name: 'Upload your inspiration images' },
    { questionKey: 'ring_size', name: 'What is your ring size' },
    { questionKey: 'other_details', name: 'Any other details we should know' },
    { questionKey: 'diamond_timeline', name: 'When do you need this by' },
    { questionKey: 'estimated_total', name: 'Estimate amount' },
    { questionKey: 'sms_consent', name: 'SMS consent', optional: true },
    { questionKey: 'marketing_consent', name: 'Marketing consent', optional: true },
  ],
  ring_request: [
    { questionKey: 'description.selections.nature', name: 'Natural or lab diamond' },
    { questionKey: 'description.selections.shape', name: 'Diamond shape' },
    { questionKey: 'description.selections.size', name: 'Diamond size' },
    { questionKey: 'description.selections.quality', name: 'Diamond quality' },
    { questionKey: 'description.selections.setting', name: 'Ring setting' },
    { questionKey: 'description.selections.holder', name: 'Diamond holder' },
    { questionKey: 'description.selections.band', name: 'Band type' },
    { questionKey: 'description.selections.band_width', name: 'Band width' },
    { questionKey: 'description.selections.metal', name: 'Ring metal' },
    { questionKey: 'description.selections.karat', name: 'Metal karat' },
    { questionKey: 'description.selections.personalization', name: 'Ring personalization' },
    { questionKey: 'description.ringSize', name: 'Ring size' },
    { questionKey: 'description.budget', name: 'Ring budget' },
    { questionKey: 'description.engravingText', name: 'Ring engraving text' },
    { questionKey: 'description.additionalNotes', name: 'Ring additional notes' },
    { questionKey: 'description.selections.timeline', name: 'Ring timeline' },
    { questionKey: 'ai_preview_url', name: 'Ring AI preview image' },
    { questionKey: 'reference_images', name: 'Ring reference images' },
  ],
  grillz: [
    { questionKey: 'grillz_type', name: 'Grillz type' },
    { questionKey: 'metal_type', name: 'Grillz metal' },
    { questionKey: 'metal_purity', name: 'Grillz metal purity' },
    { questionKey: 'budget', name: 'Grillz budget' },
    { questionKey: 'top_teeth', name: 'Grillz top teeth' },
    { questionKey: 'bottom_teeth', name: 'Grillz bottom teeth' },
    { questionKey: 'engraving_text', name: 'Grillz engraving text' },
    { questionKey: 'additional_notes', name: 'Grillz additional notes' },
    { questionKey: 'ai_preview_url', name: 'Grillz AI preview image' },
    { questionKey: 'logo_file_url', name: 'Grillz logo file' },
    { questionKey: 'uploaded_image_urls', name: 'Grillz uploaded images' },
    { questionKey: 'question_answers', name: 'Grillz custom answers' },
  ],
  enquiry: [
    { questionKey: 'jewelry_type', name: 'Jewelry type' },
    { questionKey: 'gold_color', name: 'Enquiry gold color' },
    { questionKey: 'karat', name: 'Enquiry karat' },
    { questionKey: 'budget', name: 'Enquiry budget' },
    { questionKey: 'diamond_quality', name: 'Enquiry diamond quality' },
    { questionKey: 'diamond_setup', name: 'Enquiry diamond setup' },
    { questionKey: 'back_option', name: 'Enquiry back option' },
    { questionKey: 'desired_size', name: 'Enquiry desired size' },
    { questionKey: 'timeline', name: 'Enquiry timeline' },
    { questionKey: 'engraving_text', name: 'Enquiry engraving text' },
    { questionKey: 'description', name: 'Enquiry description' },
    { questionKey: 'additional_notes', name: 'Enquiry additional notes' },
    { questionKey: 'ai_preview_url', name: 'Enquiry AI preview image' },
    { questionKey: 'inspiration_image_url', name: 'Enquiry inspiration image' },
    { questionKey: 'uploaded_image_urls', name: 'Enquiry uploaded images' },
    { questionKey: 'question_answers', name: 'Enquiry custom answers' },
  ],
  metal: [
    { questionKey: 'metal_type', name: 'Metal type to sell' },
    { questionKey: 'karat', name: 'Metal karat to sell' },
    { questionKey: 'weight_grams', name: 'Metal weight in grams' },
    { questionKey: 'condition', name: 'Metal condition' },
    { questionKey: 'estimated_offer', name: 'Metal IQ offer' },
    { questionKey: 'currency', name: 'Metal IQ currency' },
    { questionKey: 'photo_urls', name: 'Metal photos' },
    { questionKey: 'custom_answers', name: 'Metal IQ custom answers' },
    { questionKey: 'spot_price_at_time', name: 'Metal IQ spot price at time of quote', optional: true },
    { questionKey: 'buy_percentage', name: 'Metal IQ buy percentage', optional: true },
    { questionKey: 'competitor_offer', name: 'Metal IQ competitor offer', optional: true },
  ],
  ring_design: [
    { questionKey: 'configuration.style', name: 'Ring OS style' },
    { questionKey: 'configuration.shank', name: 'Ring OS shank' },
    { questionKey: 'configuration.metal', name: 'Ring OS metal' },
    { questionKey: 'configuration.shape', name: 'Ring OS shape' },
    { questionKey: 'configuration.caratRange', name: 'Ring OS carat range' },
    { questionKey: 'configuration.size', name: 'Ring OS ring size' },
    { questionKey: 'configuration.stone.type', name: 'Ring OS stone type' },
    { questionKey: 'configuration.stone.carat', name: 'Ring OS stone carat' },
    { questionKey: 'configuration.stone.color', name: 'Ring OS stone color' },
    { questionKey: 'configuration.stone.clarity', name: 'Ring OS stone clarity' },
    { questionKey: 'configuration.stone.price', name: 'Ring OS stone price' },
    { questionKey: 'configuration.stone.reportNo', name: 'Ring OS certificate number' },
    { questionKey: 'configuration.engraving.text', name: 'Ring OS engraving text' },
    { questionKey: 'configuration.engraving.bandWidth', name: 'Ring OS band width' },
    { questionKey: 'configuration.engraving.otherRequest', name: 'Ring OS other request' },
    { questionKey: 'product_name', name: 'Saved design name' },
    { questionKey: 'notes', name: 'Saved design notes' },
  ],
  appointment: [
    { questionKey: 'preferred_date', name: 'Appointment date' },
    { questionKey: 'preferred_time', name: 'Appointment time' },
    { questionKey: 'customer_timezone', name: 'Appointment timezone' },
    { questionKey: 'message', name: 'Appointment message' },
    { questionKey: 'ring_configuration.style', name: 'Ring OS style' },
    { questionKey: 'ring_configuration.shank', name: 'Ring OS shank' },
    { questionKey: 'ring_configuration.metal', name: 'Ring OS metal' },
    { questionKey: 'ring_configuration.shape', name: 'Ring OS shape' },
    { questionKey: 'ring_configuration.caratRange', name: 'Ring OS carat range' },
    { questionKey: 'ring_configuration.size', name: 'Ring OS ring size' },
    { questionKey: 'ring_configuration.stone.type', name: 'Ring OS stone type' },
    { questionKey: 'ring_configuration.stone.carat', name: 'Ring OS stone carat' },
    { questionKey: 'ring_configuration.stone.color', name: 'Ring OS stone color' },
    { questionKey: 'ring_configuration.stone.clarity', name: 'Ring OS stone clarity' },
    { questionKey: 'ring_configuration.stone.price', name: 'Ring OS stone price' },
    { questionKey: 'ring_configuration.stone.reportNo', name: 'Ring OS certificate number' },
    { questionKey: 'ring_configuration.engraving.text', name: 'Ring OS engraving text' },
    { questionKey: 'ring_configuration.engraving.bandWidth', name: 'Ring OS band width' },
    { questionKey: 'ring_configuration.engraving.otherRequest', name: 'Ring OS other request' },
  ],
  order: [
    { questionKey: 'configuration.shopify_order_number', name: 'Shopify order number' },
    { questionKey: 'total_amount', name: 'Order total' },
    { questionKey: 'configuration.currency', name: 'Order currency' },
    { questionKey: 'configuration.Order Type', name: 'Order type' },
    { questionKey: 'configuration.Deposit Amount', name: 'Deposit amount' },
    { questionKey: 'tracking_number', name: 'Order tracking number' },
    { questionKey: 'estimated_delivery_date', name: 'Estimated delivery date' },
    { questionKey: 'configuration.Style', name: 'Ring OS style' },
    { questionKey: 'configuration.Shank', name: 'Ring OS shank' },
    { questionKey: 'configuration.Metal', name: 'Ring OS metal' },
    { questionKey: 'configuration.Shape', name: 'Ring OS shape' },
    { questionKey: 'configuration.Carat Range', name: 'Ring OS carat range' },
    { questionKey: 'configuration.Size', name: 'Ring OS ring size' },
    { questionKey: 'configuration.Stone Type', name: 'Ring OS stone type' },
    { questionKey: 'configuration.Stone Carat', name: 'Ring OS stone carat' },
    { questionKey: 'configuration.Stone Color', name: 'Ring OS stone color' },
    { questionKey: 'configuration.Stone Clarity', name: 'Ring OS stone clarity' },
    { questionKey: 'configuration.Stone Price', name: 'Ring OS stone price' },
    { questionKey: 'configuration.Diamond Certificate No', name: 'Ring OS certificate number' },
    { questionKey: 'configuration.Personalized Inscription', name: 'Ring OS engraving text' },
    { questionKey: 'configuration.Band Width', name: 'Ring OS band width' },
    { questionKey: 'configuration.specialRequests', name: 'Ring OS other request' },
    { questionKey: 'configuration.Metal Type', name: 'Grillz order metal', optional: true },
    { questionKey: 'configuration.Purity', name: 'Grillz order purity', optional: true },
    { questionKey: 'configuration.Top Teeth', name: 'Grillz order top teeth', optional: true },
    { questionKey: 'configuration.Bottom Teeth', name: 'Grillz order bottom teeth', optional: true },
    { questionKey: 'configuration.Jewelry Type', name: 'Enquiry order jewelry type', optional: true },
    { questionKey: 'configuration.Budget', name: 'Enquiry order budget', optional: true },
    { questionKey: 'configuration.Description', name: 'Enquiry order description', optional: true },
  ],
};

/** Forms that can be auto-provisioned today. */
export function catalogFormTypes(): string[] {
  return Object.keys(CRM_FIELD_CATALOG);
}

export function catalogFor(formType: string): CrmFieldDef[] {
  return CRM_FIELD_CATALOG[formType] ?? [];
}

/**
 * GHL derives a field key from the field name: lowercased, non-alphanumerics
 * collapsed to underscores. We compute the same slug so an existing field can
 * be recognised and reused instead of duplicated.
 */
export function ghlFieldSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** `contact.what_is_your_ring_size` → `what_is_your_ring_size`. */
export function normalizeFieldKey(fieldKey: string | null | undefined): string {
  if (!fieldKey) return '';
  const raw = fieldKey.includes('.') ? fieldKey.split('.').slice(1).join('.') : fieldKey;
  return ghlFieldSlug(raw);
}
