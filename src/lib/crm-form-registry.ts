// UI mirror of supabase/functions/_shared/crm-form-registry.ts.
//
// The edge function owns the runtime behaviour (which table to read, which
// column holds the customer's email, how JSON is flattened). This file carries
// only what the CRM MVMNT settings card needs to render: the tab list, the
// mappable question keys, and the columns offered as a monetary value source.
//
// Keep the two in sync — if you add a form or a question key there, add it here.

export interface CrmFormUiDef {
  formType: string;
  label: string;
  description: string;
  /** Source table, shown to the admin so they know where the data comes from. */
  table: string;
  defaultOppTemplate: string;
  defaultSource: string;
  /** Columns/paths offered as "Monetary value source". */
  valueColumns: string[];
  /** Keys that can be mapped to a CRM MVMNT custom field. */
  questionKeys: string[];
  /**
   * True for the Diamond Form, which is synced by the original
   * sync-dtt-ghl-lead function rather than the generic sync-crm-lead one.
   */
  legacyDiamondPath?: boolean;
}

/**
 * Ring Builder answer steps — mirrors STEP_DEFS in
 * src/components/ring-builder-wizard/ring-builder-constants.ts. The wizard
 * stores them inside the JSON it writes to `design_requests.description`.
 */
const RING_BUILDER_STEP_KEYS = [
  'nature', 'shape', 'size', 'quality', 'setting', 'holder',
  'band', 'band_width', 'metal', 'karat', 'personalization', 'timeline',
];

function ringBuilderSelectionKeys(): string[] {
  return RING_BUILDER_STEP_KEYS.map(k => `description.selections.${k}`);
}

function ringConfigKeys(root: string): string[] {
  return [
    `${root}.style`,
    `${root}.shank`,
    `${root}.metal`,
    `${root}.shape`,
    `${root}.caratRange`,
    `${root}.size`,
    `${root}.stone.type`,
    `${root}.stone.carat`,
    `${root}.stone.color`,
    `${root}.stone.clarity`,
    `${root}.stone.price`,
    `${root}.stone.reportNo`,
    `${root}.engraving.enabled`,
    `${root}.engraving.text`,
    `${root}.engraving.bandWidth`,
    `${root}.engraving.otherRequest`,
  ];
}

/**
 * Shopify line-item property names that end up on `orders.configuration`.
 * Mirrors ORDER_CONFIG_KEYS in the edge-function registry — they are the literal
 * attribute keys shopify-add-to-cart writes, so spaces and capitals are correct.
 */
const ORDER_CONFIG_KEYS = [
  'shopify_order_number', 'currency',
  // Ring OS builder.
  'Style', 'Shank', 'Metal', 'Shape', 'Size', 'Carat Range',
  'Order Type', 'Estimated Ring Price', 'Deposit Amount',
  'Band Width', 'Personalized Inscription', 'Any Other Request',
  'Stone Type', 'Stone Carat', 'Stone Color', 'Stone Clarity', 'Stone Price',
  'Stone Cut Grade', 'Stone Polish', 'Stone Symmetry', 'Stone Fluorescence',
  'Diamond Certificate No', 'Diamond Lab', 'Diamond Certificate PDF',
  'Wholesale Diamond Price', 'Markup Price',
  // Grillz Builder orders.
  'Metal Type', 'Purity', 'Top Teeth', 'Bottom Teeth', 'Notes',
  // Custom Enquiry orders.
  'Jewelry Type', 'Budget', 'Gold Color', 'Karat',
  'Diamond Quality', 'Diamond Setup', 'Back Option', 'Description',
  // Free-text request saved by the Ring OS checkout.
  'specialRequests',
];

const ORDER_SHIPPING_KEYS = [
  'name', 'address1', 'address2', 'city', 'province', 'country', 'zip', 'phone',
];

export const CRM_FORMS: CrmFormUiDef[] = [
  {
    formType: 'diamond',
    label: 'Quote Estimator',
    description: 'Diamond / Quote Estimator widget leads.',
    table: 'diamond_form_leads',
    defaultOppTemplate: 'Diamond Form — {customer_name}',
    defaultSource: 'JewlX Diamond Form',
    valueColumns: ['estimated_total'],
    legacyDiamondPath: true,
    questionKeys: [
      'diamond_type', 'diamond_shape', 'diamond_size', 'diamond_quality',
      'diamond_setting', 'diamond_holder', 'diamond_band', 'diamond_band_width',
      'diamond_metal', 'diamond_metal_karat', 'diamond_two_tone_metals',
      'diamond_personalization', 'ring_size', 'other_details',
      'diamond_timeline', 'estimated_total', 'inspiration_image_urls',
      'sms_consent', 'marketing_consent',
    ],
  },
  {
    formType: 'ring_request',
    label: 'Ring Builder',
    description: 'Leads from the Custom X Ring Builder wizard.',
    table: 'design_requests',
    defaultOppTemplate: 'Ring Builder — {customer_name}',
    defaultSource: 'JewlX Ring Builder',
    valueColumns: [],
    questionKeys: [
      // Real columns on design_requests.
      'request_type', 'preferred_style', 'preferred_metal',
      'metal_preference', 'preferred_stone', 'stone_preference', 'budget_range',
      'timeline', 'size', 'engraving_text', 'special_requirements',
      'priority', 'status', 'ai_preview_url', 'reference_images',
      // Every wizard answer, parsed out of the JSON `description` column.
      ...ringBuilderSelectionKeys(),
      'description.ringSize', 'description.budget',
      'description.engravingText', 'description.additionalNotes',
      'description.otherDetails',
    ],
  },
  {
    formType: 'grillz',
    label: 'Grillz Builder',
    description: 'Leads from the Grillz configurator widget.',
    table: 'grill_form_leads',
    defaultOppTemplate: 'Grillz — {customer_name}',
    defaultSource: 'JewlX Grillz Builder',
    valueColumns: [],
    questionKeys: [
      'grillz_type', 'metal_type', 'metal_purity', 'budget',
      'top_teeth', 'bottom_teeth', 'engraving_text', 'additional_notes',
      'ai_preview_url', 'logo_file_url', 'uploaded_image_urls', 'question_answers',
    ],
  },
  {
    formType: 'enquiry',
    label: 'Custom Enquiry',
    description: 'Leads from the custom jewellery enquiry widget (CustomX).',
    table: 'custom_enquiry_leads',
    defaultOppTemplate: 'Custom Enquiry — {customer_name}',
    defaultSource: 'JewlX Custom Enquiry',
    valueColumns: [],
    questionKeys: [
      'jewelry_type', 'gold_color', 'karat', 'budget',
      'diamond_quality', 'diamond_setup', 'back_option', 'desired_size',
      'timeline', 'engraving_text', 'description', 'additional_notes',
      'ai_preview_url', 'inspiration_image_url', 'uploaded_image_urls', 'question_answers',
    ],
  },
  {
    formType: 'metal',
    label: 'Metal IQ',
    description: 'Sell-your-gold leads, including the calculated offer.',
    table: 'metal_buying_leads',
    defaultOppTemplate: 'Metal IQ — {customer_name}',
    defaultSource: 'JewlX Metal IQ',
    valueColumns: ['estimated_offer', 'competitor_offer', 'estimated_profit'],
    questionKeys: [
      'metal_type', 'karat', 'weight_grams', 'condition', 'location',
      'currency', 'estimated_offer', 'estimated_profit', 'competitor_offer',
      'spot_price_at_time', 'spot_price_date', 'buy_percentage', 'lead_score',
      'status', 'is_authentic', 'knows_authentic', 'knows_karat', 'knows_weight',
      'photo_urls', 'custom_answers', 'country_iso',
    ],
  },
  {
    formType: 'ring_design',
    label: 'Ring OS — Saved Design',
    description: 'A ring configured in the Ring OS builder and saved by the customer.',
    table: 'saved_designs',
    defaultOppTemplate: 'Ring OS — {product_name}',
    defaultSource: 'JewlX Ring OS — Saved Design',
    valueColumns: ['configuration.stone.price'],
    questionKeys: [
      'product_name', 'notes', 'product_id',
      ...ringConfigKeys('configuration'),
    ],
  },
  {
    formType: 'appointment',
    label: 'Ring OS — Appointment',
    description: 'Consultation bookings, including the ring the customer was viewing.',
    table: 'appointment_bookings',
    defaultOppTemplate: 'Appointment — {customer_name}',
    defaultSource: 'JewlX Appointment Booking',
    valueColumns: ['ring_configuration.stone.price'],
    questionKeys: [
      'preferred_date', 'preferred_time', 'customer_timezone', 'message', 'status',
      ...ringConfigKeys('ring_configuration'),
    ],
  },
  {
    formType: 'order',
    label: 'Ring OS — Shopify Order',
    description:
      'Completed Shopify checkouts that started in a JewlX widget — the Ring OS "Add to Cart" flow, Grillz Builder and Custom Enquiry.',
    table: 'orders',
    defaultOppTemplate: 'Order {configuration.shopify_order_number} — {customer_name}',
    defaultSource: 'JewlX Shopify Order',
    valueColumns: ['total_amount'],
    questionKeys: [
      'order_source', 'status', 'total_amount', 'shopify_order_id',
      'customer_requested_manufacturing', 'manufacturing_status',
      'shipping_status', 'tracking_number', 'estimated_delivery_date',
      ...ORDER_CONFIG_KEYS.map(k => `configuration.${k}`),
      ...ORDER_SHIPPING_KEYS.map(k => `customer_shipping.${k}`),
    ],
  },
];

export const CRM_FORM_BY_TYPE: Record<string, CrmFormUiDef> = Object.fromEntries(
  CRM_FORMS.map(f => [f.formType, f]),
);

/**
 * Wrapper segments that only say *where* a value is stored, never what it is.
 * Dropping them keeps the dropdown readable: `description.selections.shape`
 * reads as "Shape", not "Description › Selections › Shape".
 */
const CONTAINER_SEGMENTS = new Set(['configuration', 'ring_configuration', 'description', 'selections']);

/**
 * `configuration.stone.carat` → "Stone › Carat", `metal_type` → "Metal type",
 * `description.selections.shape` → "Shape".
 * Keeps the long Ring OS / Ring Builder paths readable in the mapping dropdown.
 */
export function questionKeyLabel(key: string): string {
  const parts = key.split('.');
  // Never strip everything — a single-segment key like `description` keeps its name.
  let tail = parts;
  while (tail.length > 1 && CONTAINER_SEGMENTS.has(tail[0])) tail = tail.slice(1);
  return tail
    .map(p => p.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_]+/g, ' '))
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' › ');
}
