// Registry of every lead surface that can sync to CRM MVMNT (GoHighLevel).
//
// This is the single source of truth for "which table does a form_type read,
// which columns hold the customer's identity, and which answers can be mapped
// to a CRM custom field". `sync-crm-lead` reads it at runtime; the admin UI
// mirrors it in src/lib/crm-form-registry.ts so the dropdowns match.
//
// The Diamond Form ('diamond') is listed for completeness — the UI configures
// it through this registry — but it is still synced by the original
// sync-dtt-ghl-lead function and its own trigger, which this file never touches.

import { joinCrmValuesForNote } from "./crm-value-format.ts";

export interface CrmContactColumns {
  /** Column holding the customer's full name (most forms). */
  fullName?: string;
  /** Column holding only a first name (Diamond Form). */
  firstName?: string;
  email: string;
  phone: string;
  /** Optional dialling-code column, used to build an E.164 phone number. */
  countryCode?: string;
}

export interface CrmFormDef {
  formType: string;
  /** Human label shown in the admin UI. */
  label: string;
  /** Short description shown under the tab heading. */
  description: string;
  /** Source table the lead row is read from. */
  table: string;
  contact: CrmContactColumns;
  /** Default value for the GHL contact `source` field. */
  defaultSource: string;
  /** Default opportunity name template. */
  defaultOppTemplate: string;
  /** Title line of the note pushed onto the contact. */
  noteTitle: string;
  /**
   * Numeric columns offered as "Monetary value source" in the UI. `value_source`
   * stores either one of these column names, or the literals 'none' / 'fixed'.
   */
  valueColumns: string[];
  /** Columns that can be mapped to a CRM custom field. */
  questionKeys: string[];
  /**
   * JSONB columns that get flattened into dotted keys (e.g. `configuration.metal`)
   * so nested Ring OS attributes are individually mappable.
   */
  jsonColumns?: string[];
  /**
   * Columns that hold JSON as a **string** rather than JSONB. They are parsed
   * before mapping so their leaves behave exactly like `jsonColumns` ones.
   * `design_requests.description` is TEXT but the Ring Builder wizard writes a
   * JSON blob into it, so every answer lives in there.
   * A column that fails to parse (a hand-typed request from the client portal)
   * is left as the plain string it is.
   */
  jsonTextColumns?: string[];
  /**
   * Dotted keys whose values are catalog slugs (`14k-yellow`, `three-stone`).
   * They are prettified to `14k Yellow` / `Three Stone` before being sent, so
   * CRM shows readable text instead of a slug.
   */
  slugKeys?: string[];
  /**
   * Dotted keys to leave out of the CRM note. Used for leaves that are pure
   * plumbing (Shopify's `_source` / `_client_id` line-item attributes) or that
   * would dump a whole JSON array into the note (`configuration.line_items`,
   * whose every field is already present as a flat `configuration.<Property>`).
   */
  noteSkipKeys?: string[];
}

/** Ring OS configuration attributes, shared by saved designs and bookings. */
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

function ringSlugKeys(root: string): string[] {
  return [`${root}.style`, `${root}.shank`, `${root}.metal`, `${root}.shape`, `${root}.stone.type`];
}

/**
 * Ring Builder (Custom X) answer steps. They live inside the JSON blob the
 * wizard writes to `design_requests.description`, under `selections`, and the
 * stored values are catalog slugs (`round`, `lab-grown`, `14k-yellow-gold`).
 * Mirrors STEP_DEFS in src/components/ring-builder-wizard/ring-builder-constants.ts.
 */
const RING_BUILDER_STEP_KEYS = [
  "nature", "shape", "size", "quality", "setting", "holder",
  "band", "band_width", "metal", "karat", "personalization", "timeline",
];

function ringBuilderSelectionKeys(): string[] {
  return RING_BUILDER_STEP_KEYS.map((k) => `description.selections.${k}`);
}

/**
 * Line-item property names that `shopify-add-to-cart` (and the Grillz /
 * Custom Enquiry widgets) attach to the Shopify cart. `shopify-order-webhook`
 * copies every one of them onto `orders.configuration`, so each becomes a
 * `configuration.<Property Name>` key here — mappable to a CRM custom field
 * exactly like a form answer. Names carry spaces and capitals on purpose: they
 * are the literal Shopify attribute keys, not slugs.
 */
const ORDER_CONFIG_KEYS = [
  // Written by shopify-order-webhook itself.
  "shopify_order_number", "currency",
  // Ring OS builder (supabase/functions/shopify-add-to-cart).
  "Style", "Shank", "Metal", "Shape", "Size", "Carat Range",
  "Order Type", "Estimated Ring Price", "Deposit Amount",
  "Band Width", "Personalized Inscription", "Any Other Request",
  "Stone Type", "Stone Carat", "Stone Color", "Stone Clarity", "Stone Price",
  "Stone Cut Grade", "Stone Polish", "Stone Symmetry", "Stone Fluorescence",
  "Diamond Certificate No", "Diamond Lab", "Diamond Certificate PDF",
  "Wholesale Diamond Price", "Markup Price",
  // Grillz Builder orders.
  "Metal Type", "Purity", "Top Teeth", "Bottom Teeth", "Notes",
  // Custom Enquiry orders.
  "Jewelry Type", "Budget", "Gold Color", "Karat",
  "Diamond Quality", "Diamond Setup", "Back Option", "Description",
  // Free-text request saved by the Ring OS checkout.
  "specialRequests",
];

/** Shipping address leaves, useful as CRM contact/address custom fields. */
const ORDER_SHIPPING_KEYS = [
  "name", "address1", "address2", "city", "province", "country", "zip", "phone",
];

/**
 * Internal plumbing Shopify carries on every line item, plus the raw
 * `line_items` array whose contents are already flattened into
 * `configuration.<Property>` by the webhook.
 */
const ORDER_NOTE_SKIP_KEYS = [
  "configuration.line_items",
  "configuration._source",
  "configuration._client_id",
  "configuration._pricing_mode",
  "configuration._catalog_item_id",
];

export const CRM_FORMS: CrmFormDef[] = [
  {
    formType: "diamond",
    label: "Quote Estimator (Diamond Form)",
    description: "The Diamond / Quote Estimator widget. Synced by sync-dtt-ghl-lead.",
    table: "diamond_form_leads",
    contact: { firstName: "first_name", email: "email", phone: "phone_number", countryCode: "country_code" },
    defaultSource: "Aurezo Diamond Form",
    defaultOppTemplate: "Diamond Form — {customer_name}",
    noteTitle: "Diamond Form submission",
    valueColumns: ["estimated_total"],
    questionKeys: [
      "diamond_type", "diamond_shape", "diamond_size", "diamond_quality",
      "diamond_setting", "diamond_holder", "diamond_band", "diamond_band_width",
      "diamond_metal", "diamond_metal_karat", "diamond_two_tone_metals",
      "diamond_personalization", "ring_size", "other_details",
      "diamond_timeline", "estimated_total", "inspiration_image_urls",
      "sms_consent", "marketing_consent",
    ],
  },

  {
    formType: "grillz",
    label: "Grillz Builder",
    description: "Leads from the Grillz configurator widget.",
    table: "grill_form_leads",
    contact: { fullName: "customer_name", email: "customer_email", phone: "customer_phone" },
    defaultSource: "Aurezo Grillz Builder",
    defaultOppTemplate: "Grillz — {customer_name}",
    noteTitle: "Grillz Builder submission",
    valueColumns: [],
    questionKeys: [
      "grillz_type", "metal_type", "metal_purity", "budget",
      "top_teeth", "bottom_teeth", "engraving_text", "additional_notes",
      "ai_preview_url", "logo_file_url", "uploaded_image_urls", "question_answers",
    ],
  },

  {
    formType: "enquiry",
    label: "Custom Enquiry (CustomX)",
    description: "Leads from the custom jewellery enquiry widget.",
    table: "custom_enquiry_leads",
    contact: { fullName: "customer_name", email: "customer_email", phone: "customer_phone" },
    defaultSource: "Aurezo Custom Enquiry",
    defaultOppTemplate: "Custom Enquiry — {customer_name}",
    noteTitle: "Custom Enquiry submission",
    valueColumns: [],
    questionKeys: [
      "jewelry_type", "gold_color", "karat", "budget",
      "diamond_quality", "diamond_setup", "back_option", "desired_size",
      "timeline", "engraving_text", "description", "additional_notes",
      "ai_preview_url", "inspiration_image_url", "uploaded_image_urls", "question_answers",
    ],
  },

  {
    formType: "metal",
    label: "Metal IQ (Metal Buying)",
    description: "Sell-your-gold leads, including the calculated offer.",
    table: "metal_buying_leads",
    // country_code is stored separately, but customer_phone is already written
    // as `${countryCode}${phone}` — do NOT prefix it again.
    contact: { fullName: "customer_name", email: "customer_email", phone: "customer_phone" },
    defaultSource: "Aurezo Metal IQ",
    defaultOppTemplate: "Metal IQ — {customer_name}",
    noteTitle: "Metal IQ submission",
    valueColumns: ["estimated_offer", "competitor_offer", "estimated_profit"],
    questionKeys: [
      "metal_type", "karat", "weight_grams", "condition", "location",
      "currency", "estimated_offer", "estimated_profit", "competitor_offer",
      "spot_price_at_time", "spot_price_date", "buy_percentage", "lead_score",
      "status", "is_authentic", "knows_authentic", "knows_karat", "knows_weight",
      "photo_urls", "custom_answers", "country_iso",
    ],
  },

  {
    formType: "ring_request",
    label: "Ring Builder",
    description: "Leads from the Custom X Ring Builder wizard.",
    table: "design_requests",
    contact: { fullName: "customer_name", email: "customer_email", phone: "customer_phone" },
    defaultSource: "Aurezo Ring Builder",
    defaultOppTemplate: "Ring Builder — {customer_name}",
    noteTitle: "Ring Builder submission",
    valueColumns: [],
    questionKeys: [
      // Real columns on design_requests.
      "request_type", "preferred_style", "preferred_metal",
      "metal_preference", "preferred_stone", "stone_preference", "budget_range",
      "timeline", "size", "engraving_text", "special_requirements",
      "priority", "status", "ai_preview_url", "reference_images",
      // Every wizard answer, parsed out of the JSON `description` column.
      ...ringBuilderSelectionKeys(),
      "description.ringSize", "description.budget",
      "description.engravingText", "description.additionalNotes",
      "description.otherDetails",
    ],
    jsonTextColumns: ["description"],
    slugKeys: [
      ...ringBuilderSelectionKeys(),
      "preferred_metal", "preferred_stone", "timeline",
    ],
  },

  {
    formType: "ring_design",
    label: "Ring OS — Saved Design",
    description: "A ring configured in the Ring OS builder and saved by the customer.",
    table: "saved_designs",
    contact: { fullName: "customer_name", email: "customer_email", phone: "customer_phone" },
    defaultSource: "Aurezo Ring OS — Saved Design",
    defaultOppTemplate: "Ring OS — {product_name}",
    noteTitle: "Ring OS saved design",
    valueColumns: ["configuration.stone.price"],
    questionKeys: [
      "product_name", "notes", "product_id",
      ...ringConfigKeys("configuration"),
    ],
    jsonColumns: ["configuration"],
    slugKeys: ringSlugKeys("configuration"),
  },

  {
    formType: "appointment",
    label: "Ring OS — Appointment Booking",
    description: "Consultation bookings, including the ring the customer was viewing.",
    table: "appointment_bookings",
    contact: { fullName: "customer_name", email: "customer_email", phone: "customer_phone" },
    defaultSource: "Aurezo Appointment Booking",
    defaultOppTemplate: "Appointment — {customer_name}",
    noteTitle: "Appointment booking",
    valueColumns: ["ring_configuration.stone.price"],
    questionKeys: [
      "preferred_date", "preferred_time", "customer_timezone", "message", "status",
      ...ringConfigKeys("ring_configuration"),
    ],
    jsonColumns: ["ring_configuration"],
    slugKeys: ringSlugKeys("ring_configuration"),
  },

  {
    formType: "order",
    label: "Shopify Order (Add to Cart)",
    description:
      "A completed Shopify checkout that started in an Aurezo widget. Written by shopify-order-webhook.",
    table: "orders",
    // `orders` has no phone column of its own — Shopify puts it on the shipping
    // address, so the contact phone is read from that JSONB leaf.
    contact: {
      fullName: "customer_name",
      email: "customer_email",
      phone: "customer_shipping.phone",
    },
    defaultSource: "Aurezo Shopify Order",
    defaultOppTemplate: "Order {configuration.shopify_order_number} — {customer_name}",
    noteTitle: "Shopify order (Aurezo widget)",
    valueColumns: ["total_amount"],
    questionKeys: [
      // Real columns on orders.
      "order_source", "status", "total_amount", "shopify_order_id",
      "customer_requested_manufacturing", "manufacturing_status",
      "shipping_status", "tracking_number", "estimated_delivery_date",
      ...ORDER_CONFIG_KEYS.map((k) => `configuration.${k}`),
      ...ORDER_SHIPPING_KEYS.map((k) => `customer_shipping.${k}`),
    ],
    jsonColumns: ["configuration", "customer_shipping"],
    noteSkipKeys: ORDER_NOTE_SKIP_KEYS,
  },
];

export const CRM_FORM_BY_TYPE: Record<string, CrmFormDef> = Object.fromEntries(
  CRM_FORMS.map((f) => [f.formType, f]),
);

/**
 * Form types handled by the generic sync-crm-lead function. 'diamond' is
 * excluded — it keeps its dedicated, DTT-hardened sync-dtt-ghl-lead path.
 */
export const GENERIC_FORM_TYPES = CRM_FORMS
  .filter((f) => f.formType !== "diamond")
  .map((f) => f.formType);

/** Read a possibly dotted path (`configuration.stone.carat`) off a lead row. */
export function getLeadValue(lead: Record<string, unknown>, key: string): unknown {
  if (!key.includes(".")) return lead[key];
  let cur: unknown = lead;
  for (const part of key.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * `three-stone` → `Three Stone`, `14k-yellow` → `14k Yellow`,
 * `1-2-weeks` → `1-2 Weeks` (adjacent all-digit parts stay hyphenated so
 * numeric ranges from the Ring Builder timeline step survive readable).
 */
export function prettifySlug(slug: string): string {
  const parts = slug.split(/[-_]+/).filter(Boolean);
  let out = "";
  parts.forEach((w, i) => {
    const word = /^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1);
    if (i === 0) { out = word; return; }
    const bothNumeric = /^\d+$/.test(parts[i - 1]) && /^\d+$/.test(w);
    out += (bothNumeric ? "-" : " ") + word;
  });
  return out;
}

/**
 * Parse this form's JSON-in-TEXT columns so their leaves resolve through the
 * same dotted-key path as real JSONB columns. Returns a shallow copy; a column
 * that isn't valid JSON (or isn't an object) is left exactly as it was.
 */
export function expandJsonTextColumns(
  def: CrmFormDef,
  lead: Record<string, unknown>,
): Record<string, unknown> {
  if (!def.jsonTextColumns?.length) return lead;
  const out = { ...lead };
  for (const col of def.jsonTextColumns) {
    const raw = out[col];
    if (typeof raw !== "string" || !raw.trim().startsWith("{")) continue;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      // The Ring Builder keeps multi-select answers in a sibling
      // `multiSelections` map. Fold them over `selections` so one dotted key
      // (`description.selections.personalization`) covers both shapes.
      const sel = (parsed as Record<string, unknown>).selections;
      const multi = (parsed as Record<string, unknown>).multiSelections;
      if (sel && typeof sel === "object" && multi && typeof multi === "object") {
        const merged: Record<string, unknown> = { ...(sel as Record<string, unknown>) };
        for (const [k, v] of Object.entries(multi as Record<string, unknown>)) {
          if (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== "") merged[k] = v;
        }
        (parsed as Record<string, unknown>).selections = merged;
        delete (parsed as Record<string, unknown>).multiSelections;
      }
      out[col] = parsed;
    } catch {
      // Not JSON — a request typed by hand in the client portal. Keep the text.
    }
  }
  return out;
}

/**
 * Resolve the value that should be pushed for a mapped question key, applying
 * slug prettification for Ring OS catalog attributes.
 */
export function resolveMappedValue(
  def: CrmFormDef,
  lead: Record<string, unknown>,
  key: string,
): unknown {
  const raw = getLeadValue(lead, key);
  if (raw === null || raw === undefined || raw === "") return raw;
  if (!def.slugKeys?.includes(key)) return raw;
  if (Array.isArray(raw)) return raw.map((v) => (typeof v === "string" ? prettifySlug(v) : v));
  return typeof raw === "string" ? prettifySlug(raw) : raw;
}

/** Customer display name for a lead, whichever column the form uses. */
export function resolveCustomerName(def: CrmFormDef, lead: Record<string, unknown>): string {
  const col = def.contact.fullName ?? def.contact.firstName;
  const value = col ? getLeadValue(lead, col) : undefined;
  const name = typeof value === "string" ? value.trim() : "";
  return name || "Lead";
}

/**
 * Flatten a lead row for the CRM note: scalar columns first, then every leaf of
 * the form's JSON columns as a dotted key. Internal columns are skipped.
 */
export function flattenLeadForNote(
  def: CrmFormDef,
  lead: Record<string, unknown>,
): Array<[string, string]> {
  const skip = new Set(["id", "client_id", "created_at", "updated_at", "edit_history"]);
  const skipPaths = new Set(def.noteSkipKeys ?? []);
  const out: Array<[string, string]> = [];

  const push = (key: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return;
    if (skipPaths.has(key)) return;
    if (Array.isArray(value)) {
      if (!value.length) return;
      const joined = joinCrmValuesForNote(
        value.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))),
      );
      if (joined === "") return;
      out.push([key, joined]);
      return;
    }
    out.push([key, String(value)]);
  };

  const walk = (prefix: string, value: unknown) => {
    if (value === null || value === undefined || value === "") return;
    if (skipPaths.has(prefix)) return;
    if (Array.isArray(value) || typeof value !== "object") {
      const isSlug = def.slugKeys?.includes(prefix);
      let pretty: unknown = value;
      if (isSlug && typeof value === "string") pretty = prettifySlug(value);
      // Multi-select answers arrive as an array of slugs — prettify each one.
      else if (isSlug && Array.isArray(value)) {
        pretty = value.map((v) => (typeof v === "string" ? prettifySlug(v) : v));
      }
      push(prefix, pretty);
      return;
    }
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      walk(`${prefix}.${k}`, v);
    }
  };

  // jsonTextColumns are already parsed by expandJsonTextColumns() before we get
  // here, so both kinds of JSON column expand leaf by leaf.
  const nested = new Set([...(def.jsonColumns ?? []), ...(def.jsonTextColumns ?? [])]);

  for (const [k, v] of Object.entries(lead)) {
    if (skip.has(k)) continue;
    if (nested.has(k)) {
      walk(k, v);
    } else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      push(k, JSON.stringify(v));
    } else if (def.slugKeys?.includes(k) && typeof v === "string") {
      push(k, prettifySlug(v));
    } else {
      push(k, v);
    }
  }

  return out;
}
