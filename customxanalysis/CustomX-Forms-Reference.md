# Custom X Forms — File Reference (Updated)

Custom X = the three lead-capture form widgets: **Ring Builder (Custom Ring)**, **Grillz Builder**, and **Custom Enquiry**. All three share a common wizard shell, theming, deposit checkout, AI preview generation, and CAD/lead pipeline.

All three forms follow the standardized **3-step architecture**: Default Steps → Custom Questions → Contact Step.

---

## 1. Public Embed Routes (Widget Entry Points)

| Form | File |
|---|---|
| Ring Builder (Custom Ring) | `src/pages/CustomRingBuilder.tsx` |
| Grillz Builder | `src/pages/EmbedGrillzForm.tsx` |
| Custom Enquiry | `src/pages/EmbedCustomEnquiry.tsx` |
| Domain/subdomain routing | `src/lib/domain-config.ts` |

All embed routes are public (whitelisted via `trusted-referrer.ts`) and use `useScreenshotProtection('full')`.
Embed snippet generators append cache-busting `?v=` params.

---

## 2. Form Widget Components

### Shared Wizard Shell (`src/components/form-wizard/`)
| File | Purpose |
|---|---|
| `FormWizardShell.tsx` | Full-window wizard container with transitions |
| `WizardStepIndicator.tsx` | Progress / step indicator |
| `WizardOptionGrid.tsx` | Tile grid of selectable options |
| `WizardDynamicQuestion.tsx` | Renders custom jeweler-defined questions |
| `WizardSelectField.tsx` | Dropdown/select inputs |
| `WizardContactStep.tsx` | Standardized contact info step (name/email/phone) — glassmorphic card |
| `WizardThankYou.tsx` | Generic Thank You screen |
| `StepHeading.tsx` | Step title + subtitle |
| `SortableStepList.tsx` | Drag-drop step ordering (config side) |
| `OptionImageUpload.tsx` | Per-option custom image uploader |
| `AiVisionTextarea.tsx` | "Describe your vision" textarea |
| `TeethSelector.tsx` | Grillz teeth picker |
| `CardCarousel.tsx` | Carousel for option cards |
| `SelectionSummaryCard.tsx` | Recap of selections |
| `DepositCheckoutButton.tsx` | Stripe/Shopify deposit checkout trigger |
| `AIGenerationTimeline.tsx` + `ai-generation-phases.ts` | Animated AI generation progress (also reused by Metal IQ as `MetalEstimateTimeline`) |

### Ring Builder
| File | Purpose |
|---|---|
| `src/components/ring-builder-wizard/RingBuilderWizardForm.tsx` | Main wizard form |
| `src/components/ring-builder-wizard/RingThankYou.tsx` | Ring-specific thank you |

### Grillz Builder
| File | Purpose |
|---|---|
| `src/components/grill-builder/GrillBuilderForm.tsx` | Main wizard form |
| `src/components/grill-builder/GrillzThankYou.tsx` | Grillz thank you |

### Custom Enquiry
| File | Purpose |
|---|---|
| `src/components/custom-enquiry/CustomEnquiryForm.tsx` | Main wizard form |
| `src/components/custom-enquiry/CustomEnquiryThankYou.tsx` | Enquiry thank you |

---

## 3. Configuration Hooks (Data Layer)

| Hook | Form |
|---|---|
| `src/hooks/useClientRingFormConfig.ts` | Ring Builder config |
| `src/hooks/useClientRingFormQuestions.ts` | Ring Builder custom questions |
| `src/hooks/useClientGrillConfig.ts` | Grillz config |
| `src/hooks/useClientCustomEnquiryConfig.ts` | Custom Enquiry config |
| `src/hooks/useLeadFormQuestions.ts` | Generic question loader (shared) |
| `src/hooks/useClientFeatures.ts` | Feature gating (`custom_enquiry`, `grillz_builder`, `ring_builder`) |
| `src/hooks/useClientProductType.ts` | Resolves product type (Custom X / Ring OS) |
| `src/hooks/useClientPricing.ts` | Pricing-mode resolution (deposit / contact / estimates) |
| `src/hooks/useClientCurrency.ts` | Per-jeweler display currency |
| `src/hooks/useScreenshotProtection.ts` | Screenshot blocking on widgets |

---

## 4. Jeweler-Side Configurators (Admin/Client Portal)

### Ring Builder Configurator (`src/components/ring-form-config/`)
| File | Purpose |
|---|---|
| `RingFormConfigurator.tsx` | Top-level 60/40 split layout |
| `ConfiguratorPanel.tsx` | Left config panel |
| `FlowPreview.tsx` | Right-side flow preview |
| `QuestionEditor.tsx` | Custom question CRUD |

### Grillz Configurator (`src/components/grill-form-config/`)
| File | Purpose |
|---|---|
| `GrillFormConfigurator.tsx` | Top-level layout |
| `GrillConfiguratorPanel.tsx` | Config panel |
| `GrillStepEditor.tsx` | Per-step editor |

### Custom Enquiry Configurator (`src/components/custom-enquiry-config/`)
| File | Purpose |
|---|---|
| `CustomEnquiryFormConfigurator.tsx` | Top-level layout |
| `CustomEnquiryConfiguratorPanel.tsx` | Config panel |
| `CustomEnquiryStepEditor.tsx` | Per-step editor |

### Onboarding Pages
| File | Form |
|---|---|
| `src/pages/client/RingFormOnboarding.tsx` | Ring Builder setup wizard (gated init logic) |
| `src/pages/client/GrillOnboarding.tsx` | Grillz setup wizard |
| `src/pages/client/CustomEnquiryOnboarding.tsx` | Custom Enquiry setup wizard |

---

## 5. Embed Helpers / Library Code

| File | Purpose |
|---|---|
| `src/lib/custom-enquiry-embed.ts` | Iframe embed snippet generator (Custom Enquiry) |
| `src/lib/grill-form-embed.ts` | Iframe embed snippet generator (Grillz) |
| `src/lib/embed-utils.ts` | Shared embed helpers (Ring Builder embed) |
| `src/lib/custom-enquiry-metals.ts` | Metal/karat option presets |
| `src/lib/trusted-referrer.ts` | Domain whitelisting check |
| `src/lib/meta-pixel.ts` | Meta Pixel + CAPI tracking |
| `src/lib/analytics-utils.ts` | `trackWidgetView()` / event logging |
| `src/lib/apply-theme-colors.ts` | Branding/theme injection (derives muted/border tokens) |
| `src/lib/theme-color-defaults.ts` | Default JewlX color palette per form |

---

## 6. Database Tables

### Configuration Tables
| Table | Purpose |
|---|---|
| `client_ring_form_config` | Ring Builder per-jeweler config |
| `client_ring_form_questions` | Ring Builder custom questions |
| `client_grill_config` | Grillz config (steps, metals, contact fields, colors, budget options, deposit amount) |
| `client_grill_questions` | Grillz custom questions |
| `client_custom_enquiry_config` | Enquiry config (steps, jewelry types, qualities, colors, deposit amount) |
| `client_custom_enquiry_questions` | Custom Enquiry custom questions |
| `client_metal_variants` | Per-jeweler metal overrides (used by Ring Builder) |
| `ring_metal_options` | Standardized 6-option ring metal palette (non-DTT) |
| `clients.enabled_features` | Feature toggle JSON (`custom_enquiry`, `grillz_builder`, `ring_builder`) |
| `client_branding` | Logos, accent colors, allowed_domains, meta_pixel_id |

### Lead Tables
| Table | Purpose |
|---|---|
| `custom_enquiry_leads` | Custom Enquiry submissions |
| `grill_form_leads` | Grillz Builder submissions |
| `saved_designs` | Ring Builder / Ring OS submissions ("Saved Designs" in UI) |
| `diamond_form_leads` | Diamond form submissions (sister widget) |
| `custom_enquiry_preview_images` | AI-generated enquiry preview images |
| `grill_preview_images` | AI-generated grillz preview images |
| `cad_requests` | Linked CAD design requests (jeweler-initiated) |
| `cad_request_messages` | Chat messages on CAD requests |
| `appointment_bookings` | "Book Appointment" submissions |
| `analytics_events` | Widget view + interaction tracking |

---

## 7. Edge Functions (Backend Logic)

| Function | Purpose |
|---|---|
| `supabase/functions/generate-ring-preview/` | AI image gen for Ring Builder (Nano Banana Pro → Gemini fallback) |
| `supabase/functions/generate-grillz-preview/` | AI image gen for Grillz |
| `supabase/functions/generate-enquiry-preview/` | AI image gen for Custom Enquiry |
| `supabase/functions/notify-form-lead/` | Unified jeweler-facing lead notification (all 3 forms) |
| `supabase/functions/notify-customer-confirmation/` | Lead confirmation email to customer (server-side, deduplicated) |
| `supabase/functions/notify-new-lead/` | Generic new-lead trigger handler |
| `supabase/functions/notify-cad-request/` | CAD request notification |
| `supabase/functions/notify-cad-delivery/` | CAD delivery email |
| `supabase/functions/notify-cad-resize/` | Resize request email |
| `supabase/functions/send-cad-email/` | CAD file email delivery |
| `supabase/functions/send-ai-render-email/` | AI render email to customer |
| `supabase/functions/send-consolidated-render-email/` | Single email bundling all renders |
| `supabase/functions/send-quote-estimate/` | Quote/estimate email |
| `supabase/functions/shopify-form-checkout/` | Shopify deposit checkout (deposit mode → Storefront API) |
| `supabase/functions/shopify-push-form-product/` | Push form-deposit product to Shopify |
| `supabase/functions/purchase-cad-addon/` | Stripe checkout for CAD add-ons |
| `supabase/functions/customer-portal/` | Stripe customer portal session |
| `supabase/functions/estimate-lead-cost/` | AI-driven cost estimation per lead |
| `supabase/functions/_shared/error-logger.ts` | Centralized edge-function error logging |

---

## 8. CDN / Storage

- **Bucket:** `ring-assets` (Supabase Storage)
- **Base URL:** `https://wcfxtsyhrpephimyrpbx.supabase.co/storage/v1/object/public/ring-assets`
- **Used for:** custom option images, AI preview output, file-question uploads, jeweler reference uploads
- **3D models:** separate `ring-assets` paths for OBJ/GLB uploads

Per-form upload paths:
- `custom-enquiry-options/{clientId}/...`
- `grill-options/{clientId}/...`
- `ring-form-options/{clientId}/...`
- AI previews: returned as base64 → uploaded to storage and persisted in respective `*_preview_images` tables

All file-question uploads use the **immediate-upload** strategy (no draft state) so files survive form re-opens and partial submissions.

---

## 9. Lead Management UI

| File | Purpose |
|---|---|
| `src/components/leads/LeadDetailView.tsx` | Unified lead detail (Ring / Grillz / Custom Enquiry / Diamond / Metal IQ) |
| `src/components/leads/QuestionAnswersSection.tsx` | Renders custom-question answers with file thumbnails |
| `src/components/leads/SendQuoteSection.tsx` | Send quote / estimate to customer |
| `src/components/leads/LeadFollowUpSection.tsx` | Follow-up notes/status |
| `src/components/leads/LeadEmailHistory.tsx` | Email log per lead |
| `src/components/leads/LeadCataloguePrice.tsx` | Catalogue-based pricing display |
| `src/components/leads/LeadCostEstimation.tsx` | AI cost estimation panel |
| `src/components/leads/LinkedBookingsPanel.tsx` | Linked appointment bookings |
| `src/components/leads/RepeatCustomerBadge.tsx` | Repeat-customer indicator |
| `src/components/leads/GrillTeethDiagram.tsx` | Grillz teeth visualization in lead detail |
| `src/components/customers/CustomerDetailView.tsx` | Unified Customer Hub |
| `src/components/customers/CustomerListView.tsx` | Customer list |
| `src/components/customers/ActivityDetailContent.tsx` | Activity timeline (excludes jeweler-initiated CAD/resize actions) |
| `src/components/customers/ActivityTimelineItem.tsx` | Individual timeline row |
| `src/components/cad-requests/CadRequestsTab.tsx` | CAD requests list |
| `src/components/cad-requests/NewCadRequestDialog.tsx` | Create CAD from a Custom X lead |
| `src/components/cad-requests/CadRequestDetailView.tsx` | Client CAD detail |
| `src/components/cad-requests/AdminCadRequestDetailView.tsx` | Admin CAD detail |
| `src/components/cad-requests/AdminResizeRequestDetail.tsx` | Admin resize-request detail |
| `src/components/cad-requests/CadRequestChat.tsx` | Threaded messages on a CAD request |

---

## 10. Migrations (Initial Table Creation)

| Table | Migration |
|---|---|
| `client_metal_buying_config` / `client_grill_config` / `client_custom_enquiry_config` (one of) | `supabase/migrations/20260217173545_56ab7877-0208-4846-9005-1ebe870cd30a.sql` |
| Related config table | `supabase/migrations/20260218063650_d8123d67-78e0-4d7d-a627-deb68f3212b4.sql` |
| Related config table | `supabase/migrations/20260403010632_e1f320fe-3ef8-43b6-af22-afda5dcbd594.sql` |

---

## 11. Standardized Architecture Notes

- **3-step flow** (all forms): Default Steps → Custom Questions → Contact Step
- **Custom questions** render as individual wizard steps by default; can be grouped via `step_groups`
- **Submission modes**: `lead` (default), `deposit` (Stripe/Shopify checkout), `estimates` (Ring OS only)
- **Customer notifications** are server-side only (no client-side duplicates) via `notify-customer-confirmation`
- **Theming**: `apply-theme-colors.ts` derives `--muted`, `--muted-foreground`, `--border` from the jeweler's accent color
- **Domain locking**: Server-side check via `trusted-referrer.ts` against `client_branding.allowed_domains`
- **Asset persistence**: Immediate-upload strategy on all file questions
