# JewelX — Complete Platform Context (v2)

> This document serves as a comprehensive knowledge base for the JewelX platform. Use it to provide full context for development, design, and integration tasks.

---

## 1. What is JewelX

JewelX is a **B2B2C SaaS marketplace** for the jewelry industry. It connects jewelry manufacturers/agencies (the platform admin) with retail jewelers (clients), who in turn serve end customers through embeddable configurator widgets and lead-generation forms.

### Three-Tier Architecture

```
Agency/Manufacturer (Admin)
  └── Retail Jewelers (Clients)
        └── End Customers (via embedded widgets & forms)
```

- **Admin** manages the master product database, onboards jewelers, tracks manufacturing, and oversees the entire platform.
- **Clients (Jewelers)** customize their catalog, set pricing, integrate with Shopify, configure embeddable widgets and forms, and manage leads from their branded dashboard.
- **End Customers** use the embedded widget to configure rings step-by-step, submit diamond inquiries, build custom grillz, or send custom jewelry enquiries — all through the jeweler's branded experience.

---

## 2. The Three Portals

| Portal | Subdomain | Purpose |
|--------|-----------|---------|
| **Admin Portal** | `admin.jewlx.ai` | Agency/manufacturer management dashboard |
| **Client Portal (Vault)** | `vault.jewlx.ai` | Jeweler's dashboard for catalog, orders, leads, settings |
| **Builder** | `builder.jewlx.ai` | Public-facing embeddable widgets and forms |

- Root domain (`jewlx.ai`) is handled by a **separate marketing website project**.
- Routing is subdomain-based using `SubdomainRouter` component with `getPortalType()` from `domain-config.ts`.
- In development (`localhost`, `*.lovableproject.com`, `*.lovable.app`), all routes are available.

---

## 3. Branding & Design System

### Core Brand Colors

| Color | Hex | Usage |
|-------|-----|-------|
| **Primary (Emerald Green)** | `#50c878` | Primary actions, accents, active states |
| **Secondary (Deep Green)** | `#0b6e4f` | Secondary buttons, hover states |
| **Dark Green** | `#013220` | Headers, dark backgrounds |
| **Light Mint** | `#d1f2eb` | Subtle backgrounds, badges |

### Branding Assets

All brand assets are centralized in `src/assets/branding/`:

| Asset | File | Usage |
|-------|------|-------|
| Favicon / Icon (v2) | `icon-transparent-v2.png` | Browser tab, AI agent avatar |
| Icon on Black BG (v2) | `icon-black-bg-v2.png` | Dark mode contexts |
| Full Logo Dark (v2) | `logo-full-dark-v2.png` | Light backgrounds |
| Full Logo Light (v2) | `logo-full-light-v2.png` | Dark backgrounds |
| Full Logo Black BG (v2) | `logo-full-black-bg-v2.png` | Marketing, splash |
| Full Logo White BG (v2) | `logo-full-white-bg-v2.png` | Print, white backgrounds |
| Email Logo | `jewelx-email-logo.png` | System email templates (white font, transparent bg) |

**v2 series** is the current enforced standard across all subdomains.

### Email Template Standards
- Clean white background
- `jewelx-email-logo.png` header
- No "Jewelry Platform" text
- Professional white-label aesthetic

### AI Agent Formatting Rules
- No asterisks (*) or markdown bold/italics
- Use dashes (-) for lists
- Natural word choice for emphasis

---

## 4. Core Features — Admin Portal

### Client Management
- Onboard new jewelers (create auth user + client record + role assignment)
- View/edit client profiles, status (active/suspended/pending), subscription plans
- **Client impersonation ("View As")** — switch into a jeweler's dashboard via `AdminImpersonationContext`
- Admin staff with granular client-level access (`admin_staff_client_access`)

### Master Product Database
- Central ring database (`my_master_db_data`) with combination IDs, style/shank/shape taxonomy
- CSV import via `import-master-db-data` edge function (also `MasterDBImport.tsx` page)
- Master ring variants (`master_ring_variants`) with metal/color combinations
- CDN-hosted product images (multiple angles: 0-3, transparent versions, carat-specific images)
- 3D GLB models, CAD files, rendered CADs, model photos, videos per product
- **Asset Sheet** (`AssetSheet.tsx`) — visual grid for managing product asset completeness
- **Asset Upload** (`AssetUpload.tsx`) — bulk upload interface for product media

### Manufacturing Pipeline
- Track manufacturing status per order (CAD files, production updates)
- Design request management from clients
- `Manufacturing.tsx` admin page for production oversight

### Sub-Accounts Management
- `SubAccounts.tsx` — manage agency sub-accounts and access levels

### Platform Administration
- Order management across all clients
- Usage tracking and snapshots (`usage_snapshots`, `usage-snapshot` edge function, `Usage.tsx`)
- Custom alert rules and usage alerts
- GDPR compliance: data export (`gdpr-export-user`), user deletion (`gdpr-delete-user`)
- Database backup functionality (`database-backup`, `backup-download`)
- System error tracking (`system_errors`, `log-system-error`, `SystemErrors.tsx`)
- Activity logging and audit trails (`admin_activity_logs`, `admin_logging_information`, `audit_logs`, `Logging.tsx`)
- Subscription plan and billing management (`subscription_plans`, `invoices`)
- Security monitoring (`security-monitor` edge function, `Security.tsx`)
- Data export: `export-table-json` edge function for JSON table exports

### Admin Pages (21 pages)

| Page | File | Purpose |
|------|------|---------|
| Dashboard | `Dashboard.tsx` | Overview metrics and quick actions |
| Clients | `Clients.tsx` | Client list and management |
| Client Detail | `ClientDetail.tsx` | Individual client deep-dive |
| Orders | `Orders.tsx` | Cross-client order management |
| Design Requests | `DesignRequests.tsx` | Custom design request queue |
| Product Management | `ProductManagement.tsx` | Legacy product management |
| Master DB Import | `MasterDBImport.tsx` | CSV import to master database |
| Asset Sheet | `AssetSheet.tsx` | Product asset completeness grid |
| Asset Upload | `AssetUpload.tsx` | Bulk media upload |
| Manufacturing | `Manufacturing.tsx` | Production pipeline tracking |
| Staff | `Staff.tsx` | Admin staff management |
| Sub Accounts | `SubAccounts.tsx` | Agency sub-account management |
| Analytics | `Analytics.tsx` | Platform-wide analytics |
| Usage | `Usage.tsx` | Usage tracking dashboard |
| Alerts | `Alerts.tsx` | Alert rules and notifications |
| AI Configuration | `AIConfiguration.tsx` | Platform AI settings |
| Security | `Security.tsx` | Security monitoring |
| System Errors | `SystemErrors.tsx` | Error tracking |
| Data Governance | `DataGovernance.tsx` | GDPR and data policies |
| Logging | `Logging.tsx` | Activity audit logs |
| Settings | `Settings.tsx` | Platform settings |

---

## 5. Core Features — Client Portal (Vault)

### Onboarding
- Guided onboarding wizard where jewelers select their preferred:
  - Styles, shanks, shapes, metals, diamond types
- Stored in `client_onboarding_preferences`
- Catalog auto-generated from selections via `generate-client-catalog` edge function

### Ring Catalog Management
- Derived from master database based on onboarding selections
- `client_ring_catalog` links to `my_master_db_data` and `master_ring_variants`
- Enable/disable individual catalog items
- Custom pricing per item (markup percentage or fixed price override)

### Pricing Configuration
- **Metal variants** (`client_metal_variants`): custom prices per metal type with color family grouping
- **Carat options** (`client_carat_options`): enable/disable carats, custom price adjustments, carat-specific images
- **Size options** (`client_size_options`): enable/disable sizes, price adjustments
- **Option prices** (`client_option_prices`): generic option-level pricing overrides

### Diamond Management
- **Diamond presets** (`client_diamond_presets`): natural + lab-grown stones with shape, carat, color, clarity, pricing
- **Stone inventory** (`client_stone_inventory`): individual stones with SKUs
- **Diamond step overrides** (`client_diamond_step_overrides`): customize the diamond form wizard per step

### Shopify Integration
- Two-token system: Admin API token + Storefront API token
- Tokens encrypted client-side before storage (4 encrypted fields on `clients` table)
- Connection testing via `shopify-test-connection`
- Catalog sync: `shopify-push-catalog`, `shopify-push-diamond-presets`, `shopify-push-stones`
- **Form product sync**: `shopify-push-form-product` — push deposit products for Grill/Custom Enquiry forms
- **Form checkout**: `shopify-form-checkout` — generate checkout URLs for form deposits
- Cart permalinks for Add to Cart flow via `shopify-add-to-cart`
- Order webhook for real-time sync: `shopify-order-webhook`
- Webhook registration: `register-shopify-webhooks`
- Sync status tracking per catalog item (`shopify_sync_status`, `shopify_product_id`, `shopify_variant_id`)
- Checkout uses Cart Permalinks with Base64-encoded configuration properties
- Safe redirect helper prioritizing `window.top` for iframe-safe navigation
- `_source` marker (e.g., "JewelX Ring Builder") on transactions

### Embeddable Widgets & Forms (4 types)

| Widget | Route (Dev) | Route (Prod) | Purpose |
|--------|-------------|--------------|---------|
| Ring Configurator | `/embed/:clientId` | `builder.jewlx.ai/:clientId` | Step-by-step ring builder |
| Diamonds Form | `/embed-diamonds/:clientId` | `builder.jewlx.ai/diamonds/:clientId` | 14-step diamond lead wizard |
| Grillz Builder | `/embed-grillz/:clientId` | `builder.jewlx.ai/grillz/:clientId` | 5-step grillz configurator |
| Custom Enquiry | `/embed-custom-enquiry/:clientId` | `builder.jewlx.ai/custom-enquiry/:clientId` | 5-step custom jewelry form |

- Embed code generation with domain whitelisting
- Branding customization: primary/secondary colors, company name, logo
- 4 widget themes: luxury, modern, chat, elegant
- Height auto-sync between iframe and host page via `postMessage`
- Per-theme color customization (5 channels)

### Grillz Builder Onboarding (`GrillOnboarding.tsx`)
- Configure enabled metals with purities and colors
- Set top/bottom teeth options
- Configure custom questions (yes/no, text, dropdown, custom options, file)
- Choose submission mode: **Contact** (free lead) or **Deposit** (Shopify checkout)
- Set deposit amount and push deposit product to Shopify
- Form color customization (background, tab border, font, image bg, submit button)

### Custom Enquiry Onboarding (`CustomEnquiryOnboarding.tsx`)
- Configure jewelry types, budget options, gold colors, karat options
- Set diamond qualities, diamond setup options, back options
- Configure custom questions
- Choose submission mode: **Contact** or **Deposit**
- Set deposit amount and push deposit product to Shopify
- Form color customization

### AI Configurator (JewlX Agent)
- **Default FAQ Training**: 20 pre-defined questions with collapsible accordion UI, progress tracking (answered/pending status icons)
- **Custom Questions**: Separate accordion section for user-created question/answer pairs
- FAQ and custom training stored in `ai_training_examples`
- Document upload and parsing (`ai_documents`, `ai_document_chunks`, `parse-pdf`)
- Custom system prompts, model selection, temperature (`ai_configurations`)
- Chat session analytics (`ai_chat_sessions`, `ai_chat_messages`)

### Unified Leads & Saved Designs (`SavedDesigns.tsx`)
- Aggregates leads from **4 sources**:
  - Widget (saved ring designs from `saved_designs`)
  - Diamond Form (from `diamond_form_leads`)
  - Grill Form (from `grill_form_leads`)
  - Custom Enquiry (from `custom_enquiry_leads`)
- Follow-up status tracking per lead
- **Custom status tags** (`client_status_tags`): jewelers create custom color-coded tags with display ordering
- Filter and search across all lead sources

### Other Client Features
- Live metal prices dashboard (`metal-prices-api.ts`, `LivePrices.tsx`)
- Order tracking with real-time updates (`Orders.tsx`)
- Staff management with permission-based access (`Staff.tsx`)
- Manufacturing tracking (`Manufacturing.tsx`)
- Activity logging (`Logging.tsx`, `client_activity_logs`)
- Usage monitoring (`Usage.tsx`)
- Notification preferences (`client_notification_preferences`)
- Settings: profile, notifications, security (`Settings.tsx`)
- Subscription checking via `check-subscription` edge function

### Client Pages (20 pages)

| Page | File | Purpose |
|------|------|---------|
| Dashboard | `Dashboard.tsx` | Overview and quick actions |
| Catalog | `Catalog.tsx` | Ring catalog management |
| Diamonds Form | `DiamondsForm.tsx` | Diamond form configuration |
| Diamond Leads | `DiamondFormsLeads.tsx` | Diamond form lead management |
| Saved Designs / Leads | `SavedDesigns.tsx` | Unified leads from all 4 sources |
| Orders | `Orders.tsx` | Order management |
| Shopify | `Shopify.tsx` | Shopify integration settings |
| Widget Setup | `Embed.tsx` | Embed code and widget configuration |
| AI Configurator | `AIConfigurator.tsx` | AI training and settings |
| Grill Onboarding | `GrillOnboarding.tsx` | Grillz Builder setup wizard |
| Custom Enquiry Onboarding | `CustomEnquiryOnboarding.tsx` | Custom Enquiry setup wizard |
| Live Prices | `LivePrices.tsx` | Live metal price dashboard |
| Manufacturing | `Manufacturing.tsx` | Manufacturing status tracking |
| Design Requests | `DesignRequests.tsx` | Custom design requests |
| Staff | `Staff.tsx` | Staff member management |
| Analytics | `Analytics.tsx` | Widget analytics |
| Onboarding | `Onboarding.tsx` | Initial catalog onboarding wizard |
| Logging | `Logging.tsx` | Activity audit logs |
| Usage | `Usage.tsx` | Usage monitoring |
| Settings | `Settings.tsx` | Profile, notifications, security |

---

## 6. Core Features — Builder Widget (End Customer)

### Ring Configuration Flow
Step-by-step process:
1. **Style** — Select ring style (solitaire, halo, three-stone, etc.)
2. **Shank** — Choose shank type
3. **Metal** — Pick metal variant (grouped by color family)
4. **Shape** — Select diamond shape
5. **Carat** — Choose carat weight (with carat-specific product images)
6. **Stone** — Select diamond (natural or lab-grown, with color/clarity/price)
7. **Size** — Choose ring size
8. **Engraving** — Optional text engraving

### Additional Widget Features
- **AI chat assistant** (`ring-chat` edge function) for guided help during configuration
- **Save designs** for later with comparison capability (`saved_designs`, `comparison_sets`)
- **Book appointment** functionality
- **Add to Cart** via Shopify cart permalinks (two line items: ring setting + diamond)
- Domain whitelisting for iframe security (`allowed_domains` on `clients` table)
- 4 visual themes with jeweler's custom branding
- 3D ring viewer (Three.js / React Three Fiber)
- **Theme-aware dialogs**: Save Design and Book Appointment dialogs style dynamically based on active widget theme

---

## 7. Diamonds Form (Lead Generation)

A separate embeddable 14-step wizard for custom diamond inquiries:

1. Welcome
2. Diamond Type (natural/lab-grown)
3. Shape
4. Size (carat)
5. Quality (color + clarity)
6. Setting style
7. Holder type
8. Band type
9. Band Width
10. Metal
11. Personalization (engraving)
12. Inspiration (image upload)
13. Timeline
14. Contact Information + Price Estimate

### Key Details
- Leads stored in `diamond_form_leads` table
- Options configured in `diamond_form_options` with client-level overrides (`client_diamond_step_overrides`)
- Estimate includes timeline surcharges and itemized breakdown
- Thank You screen with incentive banner and embedded booking calendar
- Admin notification on new leads (`notify-new-lead`)
- Lead export functionality (`export-leads`)
- Embed code generated via `diamond-form-embed.ts`

---

## 8. Grillz Builder Form (Lead Generation / Deposit)

A 5-step dynamic configurator for custom grillz with a **50/50 split layout**:

### Layout
- **Left side**: Sticky product preview that dynamically updates based on metal and "iced out" selections using 8 transparent PNG assets
- **Right side**: Independent form scrolling

### Steps
1. **Metal Selection** — Choose from client-configured metals with purities
2. **Teeth Selection** — Select top and bottom teeth options
3. **Custom Questions** — Dynamic questions (yes/no, text, dropdown, custom options, file upload)
4. **Contact Information** — Name, email, phone
5. **Submission** — Contact mode or Deposit checkout

### Submission Modes
- **Contact Mode**: In-place animated "Thank You" acknowledgment with 3-second auto-reset
- **Deposit Mode**: CTA shows "Continue — ${amount} Deposit", redirects to Shopify checkout via `shopify-form-checkout`

### Configuration
- Stored in `client_grill_config` table (metals, teeth options, submission mode, deposit amount)
- Questions stored in `client_grill_questions` table
- Leads stored in `grill_form_leads` table
- Form color customization via `form_colors` JSON field (background, tabBorder, fontColor, imageBg, submitButtonBg, submitButtonText)
- Embed code generated via `grill-form-embed.ts`
- Shopify deposit product managed via `shopify-push-form-product`

### Configuration Tables
```
client_grill_config:
  - enabled_metals (JSONB): [{value, label, color, purities: [{value, label}]}]
  - top_teeth_options (TEXT[])
  - bottom_teeth_options (TEXT[])
  - submission_mode: 'deposit' | 'contact'
  - deposit_amount: number
  - form_colors (JSONB): {background, tabBorder, fontColor, imageBg, submitButtonBg, submitButtonText}
  - shopify_product_id, shopify_variant_id
  - onboarding_completed: boolean

client_grill_questions:
  - question_text, question_key, question_type
  - is_enabled, display_order
  - has_text_followup, has_file_followup
  - is_default: boolean
  - options (JSONB)
```

---

## 9. Custom Enquiry Form (Lead Generation / Deposit)

A 5-step wizard with a **Shopify-style 50/50 split layout**:

### Layout
- **Left side**: Sticky image preview with manual, swipeable image gallery (touch support for category-specific assets)
- **Right side**: Independent form scrolling

### Steps
1. **Jewelry Type & Budget** — Select type and budget range
2. **Materials** — Gold color, karat, diamond quality, diamond setup, back option
3. **Custom Questions** — Dynamic questions (same types as Grillz)
4. **Details** — Description, size, inspiration image upload
5. **Contact & Submission** — Name, email, phone + submit

### Submission Modes
- **Contact Mode**: In-place animated "Thank You" with 3-second auto-reset
- **Deposit Mode**: CTA shows "Continue — ${amount} Deposit", redirects to Shopify checkout

### Configuration
- Stored in `client_custom_enquiry_config` table
- Questions stored in `client_custom_enquiry_questions` table
- Leads stored in `custom_enquiry_leads` table
- Form color customization via `form_colors` JSON field
- Embed code generated via `custom-enquiry-embed.ts`
- "Green Light Project" removed from budget fallbacks

### Configuration Tables
```
client_custom_enquiry_config:
  - jewelry_types (TEXT[])
  - budget_options (TEXT[])
  - gold_colors (JSONB): [{value, label}]
  - karat_options (TEXT[])
  - diamond_qualities (TEXT[])
  - diamond_setup_options (TEXT[])
  - back_options (TEXT[])
  - submission_mode: 'deposit' | 'contact'
  - deposit_amount: number
  - form_colors (JSONB)
  - shopify_product_id, shopify_variant_id
  - onboarding_completed: boolean

client_custom_enquiry_questions:
  - question_text, question_key, question_type
  - is_enabled, display_order
  - has_text_followup, has_file_followup
  - is_default: boolean
  - options (JSONB)
```

---

## 10. Widget Theme System

### Available Themes
| Theme | Description |
|-------|-------------|
| `luxury` | Rich, dark, gold-accented premium aesthetic |
| `modern` | Clean, minimal, contemporary design |
| `chat` | Conversational, friendly, chat-bubble style |
| `elegant` | Refined, serif typography, classic feel |

### Per-Theme Color Customization
Jewelers can customize **5 color channels** independently per theme:

| Channel | CSS Variable | Purpose |
|---------|-------------|---------|
| Background | `--widget-background` | Widget container background |
| Text | `--widget-text` | Primary text color |
| Accent | `--widget-accent` | Highlights, active states |
| Button Fill | `--widget-button-fill` | Button background color |
| Button Text | `--widget-button-text` | Button text color |

### Architecture
- Color overrides persisted in `branding_config.themeColors` map (JSONB on `clients` table)
- Default colors defined in `theme-color-defaults.ts`
- Runtime CSS variable injection via `apply-theme-colors.ts`
- Overrides injected as inline CSS variables on `[data-theme]` root element using React ref
- This prevents specificity conflicts with global document-level styles
- `WidgetThemeContext` provides theme to all Builder components

### Branding Config Structure
```json
{
  "companyName": "Store Name",
  "primaryColor": "#50c878",
  "secondaryColor": "#0b6e4f",
  "logoUrl": "https://...",
  "themeColors": {
    "luxury": {
      "background": "#1a1a2e",
      "text": "#ffffff",
      "accent": "#c9a84c",
      "buttonFill": "#c9a84c",
      "buttonText": "#1a1a2e"
    },
    "modern": { ... },
    "chat": { ... },
    "elegant": { ... }
  }
}
```

---

## 11. Feature Gating

Features are toggled per client via the `enabled_features` JSON column on the `clients` table:

| Feature Flag | Default | Purpose |
|-------------|---------|---------|
| `diamond_form` | `true` | Diamond inquiry wizard |
| `embed_branding` | `true` | Custom branding on widgets |
| `product_catalogue` | `true` | Ring catalog access |
| `jewlx_agent` | `true` | AI chat assistant |
| `orders` | `true` | Order management |
| `custom_enquiry` | `true` | Custom Enquiry form |
| `grillz_builder` | `true` | Grillz Builder form |

- Managed via `useClientFeatures` hook
- Supports admin impersonation context
- Used by `FeatureGuard` component for conditional rendering
- Checked on embed pages (`EmbedGrillzForm.tsx`, `EmbedCustomEnquiry.tsx`) to deny access if disabled

---

## 12. Architecture & Tech Stack

### Frontend
| Technology | Purpose |
|-----------|---------|
| React 18 | UI framework |
| Vite | Build tool |
| TypeScript | Type safety |
| Tailwind CSS | Styling |
| shadcn/ui (Radix) | Component library |
| Framer Motion | Animations |
| Recharts | Charts and analytics visualizations |
| React Router DOM v6 | Routing (subdomain-based) |
| TanStack Query | Server state management |
| React Context | Client state (Auth, Impersonation, Widget Theme) |

### 3D Rendering
| Technology | Purpose |
|-----------|---------|
| Three.js | 3D engine |
| React Three Fiber | React renderer for Three.js |
| @react-three/drei | Helper components |
| @react-three/postprocessing | Visual effects |
| three-stdlib | Extended Three.js utilities |

### Backend (Lovable Cloud)
- **PostgreSQL** — Primary database with Row-Level Security
- **Auth** — User authentication with email verification
- **Edge Functions** — 60+ serverless functions (Deno runtime)
- **Storage** — File storage for documents, images
- **Realtime** — Real-time subscriptions for live updates

### Deployment
- Multi-subdomain architecture on `jewlx.ai`
- `admin.jewlx.ai`, `vault.jewlx.ai`, `builder.jewlx.ai`
- Root domain handled by separate marketing project

---

## 13. User Roles & Authentication

### Roles
| Role | Description | Session Timeout |
|------|-------------|----------------|
| `agency_admin` | Full platform admin access | 60 minutes |
| `client` | Jeweler with own dashboard | 60 minutes |
| `staff` | Jeweler's employee with permission-based access | 45 minutes |

- **Remember Me**: 7-day session
- **Session warning**: 2 minutes before expiry

### Staff Permissions
Staff members have granular permissions stored in `staff_members`:
- `catalog_access`: `false` / `view` / `edit`
- `leads_access`: boolean
- `orders_access`: boolean
- `settings_access`: boolean
- `analytics_access`: boolean

### Authentication Flow
- Email + password authentication
- Email verification required (`send-verification-email`, `verify-email-token`)
- Account lockout after failed attempts (`account_lockouts`, `account-lockout-check`)
- Password reset flow (`request-password-reset`, `verify-reset-token`)
- Activity logging for all login/logout events
- Role stored in `user_roles` table, fetched via `getUserRole()`

### Admin Staff
- Separate from client staff (`admin_staff_members`)
- Can be assigned access to specific clients (`admin_staff_client_access`)
- Created/deleted via dedicated edge functions

---

## 14. Database Schema

### Auth & Users
| Table | Purpose |
|-------|---------|
| `user_roles` | Maps user_id to role (agency_admin, client, staff) |
| `account_lockouts` | Tracks failed login attempts and lockout status |
| `admin_staff_members` | Admin-level staff accounts |
| `staff_members` | Client-level staff accounts with permissions |
| `failed_login_attempts` | Log of failed authentication attempts |

### Agency & Admin
| Table | Purpose |
|-------|---------|
| `agencies` | Agency/manufacturer profiles with branding |
| `admin_activity_logs` | Admin action audit trail |
| `admin_logging_information` | Detailed admin logging with target client tracking |
| `admin_staff_client_access` | Maps admin staff to authorized clients |
| `impersonation_sessions` | Tracks "View As" sessions |

### Clients
| Table | Purpose |
|-------|---------|
| `clients` | Core client table (company, branding, Shopify tokens, widget config, features, theme) |
| `client_onboarding_preferences` | Onboarding wizard selections |
| `client_notification_preferences` | Email notification toggles |
| `client_health_metrics` | Client engagement scoring |
| `client_activity_logs` | Client-level action logging |
| `client_status_tags` | Custom color-coded status tags for lead management |

### Catalog & Products
| Table | Purpose |
|-------|---------|
| `my_master_db_data` | Master ring product database (images, 3D models, CADs) |
| `master_ring_variants` | Metal/color variants for master products |
| `products` | Legacy/generic product table |
| `product_variations` | Legacy product variations |
| `client_products` | Client-specific product settings |
| `client_ring_catalog` | Client's ring catalog (derived from master, with Shopify sync) |
| `client_metal_variants` | Client's metal pricing |
| `client_option_prices` | Client's option-level pricing |
| `client_carat_options` | Client's carat selections with images |
| `client_size_options` | Client's available ring sizes |
| `client_diamond_presets` | Client's diamond offerings |
| `client_stone_inventory` | Individual stone inventory |
| `client_diamond_step_overrides` | Customizations to diamond form steps |

### Grillz Builder
| Table | Purpose |
|-------|---------|
| `client_grill_config` | Per-client grillz form configuration (metals, teeth, submission mode, colors) |
| `client_grill_questions` | Custom questions for grillz form (type, order, followups) |
| `grill_form_leads` | Captured leads from grillz builder submissions |

### Custom Enquiry
| Table | Purpose |
|-------|---------|
| `client_custom_enquiry_config` | Per-client enquiry form configuration (types, budgets, materials, colors) |
| `client_custom_enquiry_questions` | Custom questions for enquiry form |
| `custom_enquiry_leads` | Captured leads from custom enquiry submissions |

### Lookups
| Table | Purpose |
|-------|---------|
| `lookup_styles` | Ring style definitions |
| `lookup_shanks` | Shank type definitions |
| `lookup_shapes` | Diamond shape definitions |
| `lookup_metals` | Metal type definitions |
| `lookup_visual_colors` | Visual color mappings |
| `band_type_options` | Band type choices for diamond form |
| `band_width_options` | Band width choices for diamond form |

### Commerce
| Table | Purpose |
|-------|---------|
| `orders` | Orders with Shopify sync (`shopify_order_id`) |
| `cart_items` | Shopping cart items with configuration JSON |
| `saved_designs` | End-customer saved ring configurations |
| `comparison_sets` | Design comparison groups |
| `customer_addresses` | Shipping/billing addresses |
| `design_requests` | Custom design requests from clients |

### Diamonds Form
| Table | Purpose |
|-------|---------|
| `diamond_form_leads` | Captured leads from diamond inquiry wizard |
| `diamond_form_options` | Configurable options for each wizard step |

### AI
| Table | Purpose |
|-------|---------|
| `ai_configurations` | Per-client AI settings (model, prompt, temperature) |
| `ai_chat_sessions` | Chat session tracking with analytics |
| `ai_chat_messages` | Individual chat messages with intent classification |
| `ai_documents` | Uploaded knowledge base documents |
| `ai_document_chunks` | Parsed document chunks with embeddings |
| `ai_training_examples` | FAQ question/answer pairs |

### Analytics & Monitoring
| Table | Purpose |
|-------|---------|
| `analytics_events` | Widget interaction events (views, starts, completions) |
| `usage_snapshots` | Periodic platform usage snapshots |
| `usage_alerts` | Triggered usage alerts |
| `custom_alert_rules` | Configurable alert thresholds |

### Security & Audit
| Table | Purpose |
|-------|---------|
| `audit_logs` | Comprehensive audit trail with IP, user agent |
| `data_cleanup_logs` | GDPR data cleanup records |
| `backup_logs` | Database backup history |

### Billing
| Table | Purpose |
|-------|---------|
| `subscription_plans` | Available plans with features/limits |
| `invoices` | Client billing invoices |

### System
| Table | Purpose |
|-------|---------|
| `system_errors` | Application error tracking |
| `data_governance` | GDPR/governance configuration |
| `crm_integrations` | External CRM connection settings |

### Views
| View | Purpose |
|------|---------|
| `client_branding` | Flattened view of client branding configuration |
| `master_products_with_urls` | Master products with computed CDN image URLs |

---

## 15. Edge Functions (60+ Backend Functions)

### Authentication & User Management
| Function | Purpose |
|----------|---------|
| `create-client-user` | Create new jeweler account (auth user + client record + role) |
| `create-staff-user` | Create client staff member |
| `create-admin-staff-user` | Create admin staff member |
| `delete-auth-user` | Delete auth user account |
| `delete-staff-user` | Delete client staff member |
| `delete-admin-staff-user` | Delete admin staff member |
| `send-verification-email` | Send email verification link |
| `verify-email-token` | Validate email verification token |
| `request-password-reset` | Initiate password reset flow |
| `verify-reset-token` | Validate password reset token |
| `sync-client-passwords` | Sync password changes across related accounts |
| `update-staff-password` | Update staff member password |
| `admin-reset-client-password` | Admin-initiated client password reset |
| `account-lockout-check` | Check/manage account lockout status |
| `log-failed-login` | Record failed login attempt |

### Shopify Integration
| Function | Purpose |
|----------|---------|
| `shopify-test-connection` | Verify Shopify API credentials |
| `shopify-push-catalog` | Sync ring catalog to Shopify (batch, rate-limited) |
| `shopify-push-diamond-presets` | Sync diamond presets to Shopify |
| `shopify-push-stones` | Sync stone inventory to Shopify |
| `shopify-push-form-product` | Push deposit product for Grill/Custom Enquiry forms |
| `shopify-form-checkout` | Generate Shopify checkout URL for form deposits |
| `shopify-add-to-cart` | Generate Shopify cart permalink |
| `shopify-order-webhook` | Receive and process Shopify order webhooks |
| `register-shopify-webhooks` | Register webhooks with Shopify |
| `create-checkout` | Generic checkout creation |

### Data Management
| Function | Purpose |
|----------|---------|
| `import-master-db-data` | CSV import to master product database |
| `generate-client-catalog` | Auto-generate client catalog from onboarding preferences |
| `generate-client-diamond-presets` | Auto-generate diamond presets for client |
| `reset-client-catalog` | Reset client catalog to defaults |
| `export-leads` | Export diamond form leads as CSV |
| `export-table-json` | Export any table data as JSON |
| `backup-download` | Download database backups |

### AI
| Function | Purpose |
|----------|---------|
| `ring-chat` | AI chat for end-customer ring configuration assistance |
| `jewelx-help` | AI help for client/admin portal users |
| `parse-pdf` | Parse uploaded PDF documents into chunks for AI knowledge base |

### Notifications
| Function | Purpose |
|----------|---------|
| `send-email` | Generic email sending |
| `send-client-welcome-email` | Welcome email for new jewelers |
| `send-staff-welcome-email` | Welcome email for new staff |
| `notify-admins-new-client` | Alert admins of new client signup |
| `notify-admins-client-status` | Alert admins of client status changes |
| `notify-new-lead` | Alert on new lead (any form type) |
| `notify-lead-deleted` | Alert on lead deletion |
| `notify-order-update` | Order status change notification |
| `notify-staff-activity` | Staff action notification |

### Security & Compliance
| Function | Purpose |
|----------|---------|
| `security-monitor` | Automated security monitoring |
| `rate-limiter` | API rate limiting |
| `gdpr-delete-user` | GDPR-compliant user data deletion |
| `gdpr-export-user` | GDPR-compliant user data export |
| `database-backup` | Database backup creation |

### Analytics & Monitoring
| Function | Purpose |
|----------|---------|
| `usage-snapshot` | Capture periodic usage metrics |
| `usage-alerts-check` | Evaluate alert rules against usage data |
| `client-health-calculator` | Calculate client health/engagement scores |
| `log-system-error` | Record application errors |
| `check-subscription` | Verify client subscription status |

### Data Access (Admin Impersonation Support)
| Function | Purpose |
|----------|---------|
| `get-client-activity-logs` | Fetch client activity logs (for admin view) |
| `get-client-failed-logins` | Fetch client failed login attempts |
| `get-admin-failed-logins` | Fetch admin failed login attempts |
| `get-client-staff-members` | Fetch client's staff list |
| `get-client-saved-designs` | Fetch client's saved designs |
| `migrate-existing-staff` | One-time migration for legacy staff records |

### Utility
| Function | Purpose |
|----------|---------|
| `status` | Health check endpoint |

---

## 16. Shopify Integration — Deep Dive

### Token Architecture
```
clients table:
  shopify_store_url                        — Store URL (e.g., mystore.myshopify.com)
  shopify_admin_access_token_encrypted     — Admin API token (encrypted)
  shopify_storefront_token_encrypted       — Storefront API token (encrypted)
  shopify_access_token_encrypted           — Legacy access token (encrypted)
  shopify_webhook_secret_encrypted         — Webhook verification secret (encrypted)
```

- Tokens are encrypted **client-side** using `encryption-utils.ts` before being stored
- Only the `CLIENT_SAFE_COLUMNS` constant in `auth-utils.ts` is used for client queries, excluding encrypted token fields

### Catalog Sync Flow
1. Client triggers sync from Vault dashboard
2. `shopify-push-catalog` edge function:
   - Fetches client's enabled catalog items with master product data
   - Batch processes with Shopify API rate limiting
   - Creates/updates Shopify products with JewelX tags
   - Uses front-facing image only (angle 0) from CDN
   - Updates sync status fields on `client_ring_catalog`
   - Stores variants mapping in `shopify_variants_map`

### Form Deposit Flow (Grillz / Custom Enquiry)
1. Client configures deposit mode in onboarding wizard
2. `shopify-push-form-product` creates a deposit product in Shopify
3. `shopify_product_id` and `shopify_variant_id` stored on config table
4. End customer submits form and clicks deposit CTA
5. `shopify-form-checkout` generates checkout URL with deposit amount
6. Customer redirected to Shopify checkout via iframe-safe `window.top` navigation

### Add to Cart Flow (Ring Builder)
1. End customer completes ring configuration in Builder widget
2. `shopify-add-to-cart` edge function generates a Shopify cart permalink
3. Ring configuration properties are Base64-encoded in the URL
4. Two line items per order:
   - **Ring setting** (from `client_ring_catalog`)
   - **Diamond** (from `client_diamond_presets` or `client_stone_inventory`)
5. `_source` marker (e.g., "JewelX Ring Builder") identifies the transaction
6. Customer is redirected to Shopify checkout

### Order Sync
- `shopify-order-webhook` receives Shopify order creation events
- Maps Shopify order to JewelX `orders` table via `shopify_order_id`
- Triggers `notify-order-update` for real-time notifications

---

## 17. Embed Widget System

### Widget Types & URLs
| Widget | Dev Route | Production Route | Embed Module |
|--------|-----------|-----------------|--------------|
| Ring Configurator | `/embed/:clientId` | `builder.jewlx.ai/:clientId` | `embed-utils.ts` |
| Diamonds Form | `/embed-diamonds/:clientId` | `builder.jewlx.ai/diamonds/:clientId` | `diamond-form-embed.ts` |
| Grillz Builder | `/embed-grillz/:clientId` | `builder.jewlx.ai/grillz/:clientId` | `grill-form-embed.ts` |
| Custom Enquiry | `/embed-custom-enquiry/:clientId` | `builder.jewlx.ai/custom-enquiry/:clientId` | `custom-enquiry-embed.ts` |

### Embed Code Generation
Each embed module generates:
- Responsive container with `<iframe>`
- CSS with mobile (`100dvh`) and desktop (min/max height) breakpoints
- `postMessage` listener for auto-height synchronization
- Domain origin validation for security

### Security
- **Domain whitelisting**: `allowed_domains` array on `clients` table
- Only authorized domains can load the widget iframe
- Validated on embed page load (`EmbedGrillzForm.tsx`, `EmbedCustomEnquiry.tsx`, etc.)

### Theming
- `widget_theme` field on `clients` table (luxury, modern, chat, elegant)
- `branding_config` JSON with colors, logo URL, theme color overrides
- `WidgetThemeContext` provides theme to all Builder components
- Per-theme color overrides via CSS variables (see Section 10)

### Feature Gating on Embeds
- Each embed page checks `enabled_features` before rendering
- Disabled features show `AccessDenied` page
- Feature checked: `grillz_builder` for Grillz, `custom_enquiry` for Custom Enquiry

---

## 18. Security Architecture

### Database Security
- **Row-Level Security (RLS)** enabled on all public tables
- Policies enforce user-role-based access (admin sees all, client sees own data, staff sees client's data based on permissions)

### Authentication Security
- Email verification required before account activation
- Account lockout after configurable failed login attempts
- Password reset with time-limited tokens
- Session timeouts: Admin 60min, Client 60min, Staff 45min
- Activity logging for all auth events

### Data Protection
- Shopify tokens encrypted client-side before storage
- `CLIENT_SAFE_COLUMNS` prevents token exposure in API queries
- XSS sanitization via `xss-sanitizer.ts`
- GDPR compliance: full data export and deletion capabilities

### API Security
- Rate limiting (client-side + `rate-limiter` edge function)
- Security monitoring via `security-monitor` edge function
- Audit logging with IP address and user agent tracking
- Impersonation sessions tracked in `impersonation_sessions`

### Widget Security
- Domain whitelisting for iframe embeds
- CORS configuration for cross-origin requests
- Origin validation in postMessage handlers

---

## 19. Key Utilities & Libraries

| File | Purpose |
|------|---------|
| `pricing-utils.ts` | Currency formatting, price calculations, markup application |
| `cdn-utils.ts` | CDN image URL construction for ring products (angles, carats, transparent) |
| `embed-utils.ts` | Ring configurator embed code generation, preview URLs, theme test URLs |
| `grill-form-embed.ts` | Grillz Builder embed code generation with responsive iframe |
| `custom-enquiry-embed.ts` | Custom Enquiry embed code generation with responsive iframe |
| `diamond-form-embed.ts` | Diamonds Form embed code generation |
| `diamond-form-cdn.ts` | CDN utilities for diamond form assets |
| `encryption-utils.ts` | Client-side AES encryption for Shopify tokens |
| `audit-utils.ts` | Audit event logging, impersonation session management |
| `activity-logger.ts` | Client-side login/logout/action logging |
| `admin-activity-logger.ts` | Admin-specific action logging |
| `metal-prices-api.ts` | Live metal price fetching from external API |
| `cost-calculator.ts` | Ring cost calculations (base + metal + carat + size + options) |
| `domain-config.ts` | Subdomain routing, portal type detection, session timeouts |
| `tracking-utils.ts` | Ring view and widget analytics tracking |
| `analytics-utils.ts` | Analytics event recording and conversion funnel calculations |
| `auth-utils.ts` | User role fetching, client profile loading, role checks |
| `auth-validation.ts` | Auth form validation utilities |
| `xss-sanitizer.ts` | Input sanitization for XSS prevention |
| `apply-theme-colors.ts` | Runtime CSS variable injection for per-theme widget colors |
| `theme-color-defaults.ts` | Default color palettes for each widget theme |
| `form-validation.ts` | Form input validation utilities |
| `error-logger.ts` | Client-side error logging |
| `health-check.ts` | System health check utilities |
| `image-preload.ts` | Image preloading for performance |
| `lazy-retry.ts` | Lazy loading with retry logic |
| `performance-utils.ts` | Performance monitoring utilities |
| `product-cache.ts` | Product data caching |
| `rate-limit-client.ts` | Client-side rate limiting |
| `secrets-utils.ts` | Secret management utilities |
| `storage-utils.ts` | File storage utilities |
| `usage-utils.ts` | Usage tracking utilities |
| `diamond-shape-icons.ts` | Diamond shape SVG icon mappings |

### Custom Hooks (21 hooks)

| Hook | Purpose |
|------|---------|
| `useCart` | Shopping cart state management |
| `useClientFeatures` | Feature flag access with impersonation support |
| `useClientGrillConfig` | Fetch grillz builder configuration |
| `useClientCustomEnquiryConfig` | Fetch custom enquiry configuration |
| `useClientStatusTags` | Fetch custom lead status tags |
| `useClientCaratOptions` | Fetch client carat options |
| `useClientCatalogOptions` | Fetch client catalog options |
| `useClientDiamondPresets` | Fetch client diamond presets |
| `useClientPricing` | Fetch client pricing configuration |
| `useRingConfiguration` | Ring builder state management |
| `useRingVariantImages` | Ring variant image URL management |
| `useDiamondFormOptions` | Fetch diamond form options |
| `useSessionTimeout` | Session timeout management |
| `useUserProfile` | User profile data |
| `useAdminActivityLogger` | Admin activity logging |
| `useClientActivityLogger` | Client activity logging |
| `useDelayedLoading` | Loading state with minimum delay |
| `usePrefetchImages` | Image prefetching |
| `usePreloadedImage` | Single image preloading |
| `use-mobile` | Mobile viewport detection |
| `use-toast` | Toast notification management |

---

## 20. File Organization

```
src/
├── assets/
│   └── branding/               # Brand assets (v2 series enforced)
│       ├── icon-transparent-v2.png
│       ├── icon-black-bg-v2.png
│       ├── logo-full-dark-v2.png
│       ├── logo-full-light-v2.png
│       ├── logo-full-black-bg-v2.png
│       ├── logo-full-white-bg-v2.png
│       └── ... (legacy v1 assets)
├── pages/
│   ├── admin/                  # 21 admin pages
│   │   ├── Dashboard.tsx
│   │   ├── Clients.tsx
│   │   ├── ClientDetail.tsx
│   │   ├── Orders.tsx
│   │   ├── DesignRequests.tsx
│   │   ├── ProductManagement.tsx
│   │   ├── MasterDBImport.tsx
│   │   ├── AssetSheet.tsx
│   │   ├── AssetUpload.tsx
│   │   ├── Manufacturing.tsx
│   │   ├── Staff.tsx
│   │   ├── SubAccounts.tsx
│   │   ├── Analytics.tsx
│   │   ├── Usage.tsx
│   │   ├── Alerts.tsx
│   │   ├── AIConfiguration.tsx
│   │   ├── Security.tsx
│   │   ├── SystemErrors.tsx
│   │   ├── DataGovernance.tsx
│   │   ├── Logging.tsx
│   │   └── Settings.tsx
│   ├── client/                 # 20 client pages
│   │   ├── Dashboard.tsx
│   │   ├── Catalog.tsx
│   │   ├── DiamondsForm.tsx
│   │   ├── DiamondFormsLeads.tsx
│   │   ├── SavedDesigns.tsx     # Unified leads (4 sources)
│   │   ├── Orders.tsx
│   │   ├── Shopify.tsx
│   │   ├── Embed.tsx
│   │   ├── AIConfigurator.tsx
│   │   ├── GrillOnboarding.tsx
│   │   ├── CustomEnquiryOnboarding.tsx
│   │   ├── LivePrices.tsx
│   │   ├── Manufacturing.tsx
│   │   ├── DesignRequests.tsx
│   │   ├── Staff.tsx
│   │   ├── Analytics.tsx
│   │   ├── Onboarding.tsx
│   │   ├── Logging.tsx
│   │   ├── Usage.tsx
│   │   └── Settings.tsx
│   ├── auth/                   # Auth pages
│   │   ├── Login.tsx
│   │   ├── Signup.tsx
│   │   ├── ForgotPassword.tsx
│   │   ├── ResetPassword.tsx
│   │   └── VerifyEmail.tsx
│   ├── EmbedGrillzForm.tsx     # Public grillz builder embed page
│   ├── EmbedCustomEnquiry.tsx  # Public custom enquiry embed page
│   └── AccessDenied.tsx        # Feature-gated access denied page
├── components/
│   ├── 3d-viewer/              # Three.js ring viewer components
│   ├── account/                # Account management components
│   ├── admin/                  # Admin-specific components
│   ├── ai/                     # AI chat interface components
│   ├── auth/                   # Auth form components
│   ├── catalog/                # Product catalog components
│   ├── client/                 # Client-specific components
│   ├── common/                 # Shared utility components
│   ├── custom-enquiry/         # Custom Enquiry form components
│   ├── diamonds-form/          # 15 step components for diamond wizard
│   ├── grill-builder/          # Grillz Builder form components
│   ├── help/                   # Help system components
│   ├── layout/                 # AdminLayout, ClientLayout, FeatureGuard
│   ├── live-prices/            # Metal price display components
│   ├── media-viewer/           # Media viewing components
│   ├── orders/                 # Order management components
│   ├── product/                # Product display components
│   ├── ring-builder/           # 24+ components for configurator widget
│   ├── routing/                # SubdomainRouter
│   ├── search/                 # Search components
│   ├── settings/               # Settings components
│   ├── status/                 # Status display components
│   └── ui/                     # shadcn/ui base components
├── contexts/
│   ├── AuthContext.tsx          # Authentication state management
│   ├── AdminImpersonationContext.tsx  # "View As" client switching
│   └── WidgetThemeContext.tsx   # Builder widget theming (4 themes)
├── hooks/                      # 21 custom React hooks
├── lib/                        # 34 utility modules
├── types/                      # TypeScript type definitions
└── integrations/
    └── supabase/               # Auto-generated client and types
        ├── client.ts
        └── types.ts

supabase/
├── functions/                  # 60+ edge functions (Deno)
│   ├── _shared/                # Shared utilities (CORS, auth helpers)
│   ├── ring-chat/
│   ├── shopify-push-catalog/
│   ├── shopify-form-checkout/
│   ├── shopify-push-form-product/
│   ├── create-checkout/
│   ├── check-subscription/
│   ├── backup-download/
│   ├── export-table-json/
│   ├── create-client-user/
│   └── ... (50+ more)
└── config.toml                 # Configuration
```

---

## 21. CDN & Image System

### Image URL Structure
Product images are served from a CDN with URLs constructed via `cdn-utils.ts`:

```
Base pattern: {CDN_BASE}/{folder_path}/{filename}

Image types per product:
- image_0 through image_3         — Standard product photos (angle 0 = front-facing)
- transparent_0 through transparent_3 — Transparent background versions
- carot_image_0 through carot_image_7 — Carat-specific detail images
- video                           — Product video
- glb_model                       — 3D GLB model file
- manufacture_cad                 — Manufacturing CAD file
- rendered_cad                    — Rendered CAD visualization
- model_photo                     — Physical model photograph
```

### Upload Status Tracking
Each image type has a corresponding `_status` boolean field in `my_master_db_data`:
- `image_0_status`, `image_1_status`, etc.
- `all_upload_complete` — Master flag for complete asset sets

### Grillz Builder Preview Assets
- 8 transparent PNG assets per metal/style combination
- Dynamically swapped based on metal selection and "iced out" toggle
- Stored in CDN with predictable naming conventions

---

## 22. Conversion Analytics

### Event Types
Tracked via `analytics_events` table:
- `embed_view` — Widget loaded
- `config_started` — User began configuration
- `config_completed` — User completed all steps
- `design_saved` — User saved a design
- Plus custom events via metadata

### Funnel Calculation
```
Views → Started (start rate) → Completed (complete rate) → Saved (save rate)
```
Implemented in `analytics-utils.ts` → `calculateConversionFunnel()`

---

## 23. Important Implementation Notes

### Supabase Client
```typescript
import { supabase } from "@/integrations/supabase/client";
```
- Auto-generated — **never edit** `client.ts` or `types.ts`
- Types reflect current database schema

### Environment Variables
```
VITE_SUPABASE_URL — Supabase project URL
VITE_SUPABASE_PUBLISHABLE_KEY — Anon key
VITE_SUPABASE_PROJECT_ID — Project ID
```

### Edge Function Pattern
All edge functions:
- Deno runtime
- CORS headers included via `_shared/` utilities
- Most have `verify_jwt = false` in `config.toml` (handle auth internally)
- Use Supabase Admin client for privileged operations

### Build Configuration
- Vite with `target: 'esnext'`
- Manual chunks: three, r3f, three-stdlib, recharts, framer-motion, UI libs, supabase, router
- Large project — build optimization is critical

### Form Architecture Pattern
Both Grillz Builder and Custom Enquiry follow a **mirrored three-table architecture**:
1. **Config table** — stores jeweler-defined options (metals, types, budgets) as JSONB/TEXT arrays
2. **Questions table** — manages visibility and configuration for default/custom questions with display ordering
3. **Leads table** — stores unauthenticated customer submissions

This structure allows widgets to dynamically render Yes/No, Text, Dropdown, Custom Options, or File inputs based on the jeweler's onboarding wizard settings.

---

## 24. Summary of Changes from v1 to v2

| Area | v1 | v2 |
|------|----|----|
| Embeddable Widgets | 2 (Ring + Diamonds) | 4 (Ring + Diamonds + Grillz + Custom Enquiry) |
| Widget Themes | 2 (luxury, modern) | 4 (luxury, modern, chat, elegant) |
| Theme Colors | Primary/secondary only | 5 channels per theme (bg, text, accent, buttonFill, buttonText) |
| Lead Sources | 2 (widget, diamond_form) | 4 (widget, diamond_form, grill_form, custom_enquiry) |
| Session Timeouts | Admin 15m, Client 45m, Staff 30m | Admin 60m, Client 60m, Staff 45m |
| Admin Pages | ~15 | 21 |
| Client Pages | ~14 | 20 |
| Edge Functions | ~55 | 60+ |
| Custom Hooks | ~18 | 21 |
| Utility Modules | ~20 | 34 |
| Feature Flags | 5 | 7 (added custom_enquiry, grillz_builder) |
| Form Submission | Contact only | Contact + Deposit (Shopify checkout) |
| Lead Management | Per-source views | Unified with custom status tags |
| AI Training UI | Flat textarea list | Collapsible accordion with FAQ + Custom sections |
| Branding Assets | v1 series | v2 series enforced |
