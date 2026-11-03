# Custom X Forms — File Reference

Custom X = the three lead-capture form widgets: **Ring Builder (Custom Ring)**, **Grillz Builder**, and **Custom Enquiry**. All three share a common wizard shell, theming, deposit checkout, AI preview generation, and CAD/lead pipeline.

---

## 1. Public Embed Routes (Widget Entry Points)

| Form | File |
|---|---|
| Ring Builder (Custom Ring) | `src/pages/CustomRingBuilder.tsx` |
| Grillz Builder | `src/pages/EmbedGrillzForm.tsx` |
| Custom Enquiry | `src/pages/EmbedCustomEnquiry.tsx` |
| Domain/subdomain routing | `src/lib/domain-config.ts` |

All embed routes are public (whitelisted) and use `useScreenshotProtection('full')`.

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
| `WizardContactStep.tsx` | Contact info step (name/email/phone) |
| `WizardThankYou.tsx` | Generic Thank You screen |
| `StepHeading.tsx` | Step title + subtitle |
| `SortableStepList.tsx` | Drag-drop step ordering (config side) |
| `OptionImageUpload.tsx` | Per-option custom image uploader |
| `AiVisionTextarea.tsx` | "Describe your vision" textarea |
| `TeethSelector.tsx` | Grillz teeth picker |
| `CardCarousel.tsx` | Carousel for option cards |
| `SelectionSummaryCard.tsx` | Recap of selections |
| `DepositCheckoutButton.tsx` | Stripe/Shopify deposit checkout trigger |
| `AIGenerationTimeline.tsx` + `ai-generation-phases.ts` | Animated AI generation progress |

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
| `src/hooks/useClientGrillConfig.ts` | Grillz config |
| `src/hooks/useClientCustomEnquiryConfig.ts` | Custom Enquiry config |
| `src/hooks/useClientFeatures.ts` | Feature gating (`custom_enquiry`, `grillz_builder`, `ring_builder`) |
| `src/hooks/useClientProductType.ts` | Resolves product type (Custom X / Ring OS) |
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
| `src/pages/client/CustomEnquiryOnboarding.tsx` | Custom Enquiry setup wizard |
| `src/pages/client/GrillOnboarding.tsx` | Grillz setup wizard |
| (Ring Builder onboarding lives inside RingFormOnboarding flow) | |

---

## 5. Embed Helpers / Library Code

| File | Purpose |
|---|---|
| `src/lib/custom-enquiry-embed.ts` | Iframe embed snippet generator (Custom Enquiry) |
| `src/lib/grill-form-embed.ts` | Iframe embed snippet generator (Grillz) |
| `src/lib/custom-enquiry-metals.ts` | Metal/karat option presets |
| `src/lib/trusted-referrer.ts` | Domain whitelisting check |
| `src/lib/meta-pixel.ts` | Meta Pixel + CAPI tracking |
| `src/lib/analytics-utils.ts` | `trackWidgetView()` / event logging |
| `src/lib/apply-theme-colors.ts` | Branding/theme injection |

---

## 6. Database Tables

### Configuration Tables
| Table | Purpose |
|---|---|
| `client_ring_form_config` | Ring Builder per-jeweler config |
| `client_grill_config` | Grillz config (steps, metals, contact fields, colors) |
| `client_custom_enquiry_config` | Enquiry config (steps, jewelry types, qualities, colors) |
| `client_custom_enquiry_questions` | Custom questions for Enquiry form |
| `clients.enabled_features` | Feature toggle JSON (`custom_enquiry`, `grillz_builder`) |
| `client_branding` | Logos, accent colors, allowed_domains, meta_pixel_id |

### Lead Tables
| Table | Purpose |
|---|---|
| `custom_enquiry_leads` | Enquiry submissions |
| `grill_builder_leads` (or `grillz_builder_leads`) | Grillz submissions |
| `ring_builder_leads` / `saved_designs` | Ring submissions |
| `custom_enquiry_preview_images` | AI-generated enquiry preview images |
| `grill_preview_images` | AI-generated grillz preview images |
| `cad_requests` | Linked CAD design requests |
| `appointment_bookings` | "Book Appointment" submissions |
| `analytics_events` | Widget view + interaction tracking |

---

## 7. Edge Functions (Backend Logic)

| Function | Purpose |
|---|---|
| `supabase/functions/generate-ring-preview/` | AI image gen for Ring Builder |
| `supabase/functions/generate-grillz-preview/` | AI image gen for Grillz |
| `supabase/functions/generate-enquiry-preview/` | AI image gen for Custom Enquiry |
| `supabase/functions/notify-customer-confirmation/` | Lead confirmation email to customer |
| `supabase/functions/notify-cad-request/` | CAD request notification |
| `supabase/functions/notify-cad-delivery/` | CAD delivery email |
| `supabase/functions/notify-cad-resize/` | Resize request email |
| `supabase/functions/send-cad-email/` | CAD file email delivery |
| `supabase/functions/purchase-cad-addon/` | Stripe checkout for CAD add-ons |
| `supabase/functions/customer-portal/` | Stripe customer portal session |

---

## 8. CDN / Storage

- **Bucket:** `ring-assets` (Supabase Storage)
- **Base URL:** `https://wcfxtsyhrpephimyrpbx.supabase.co/storage/v1/object/public/ring-assets`
- **Used for:** custom option images, AI preview output, file-question uploads, jeweler reference uploads

Per-form upload paths:
- `custom-enquiry-options/{clientId}/...`
- `grill-options/{clientId}/...`
- `ring-form-options/{clientId}/...`
- AI previews returned as base64 → uploaded to storage in respective `*_preview_images` paths

---

## 9. Lead Management UI

| File | Purpose |
|---|---|
| `src/components/leads/LeadDetailView.tsx` | Unified lead detail (all 3 forms + diamond + ring) |
| `src/components/customers/CustomerDetailView.tsx` | Unified Customer Hub |
| `src/components/customers/ActivityDetailContent.tsx` | Activity timeline |
| `src/components/cad-requests/NewCadRequestDialog.tsx` | Create CAD from a Custom X lead |
| `src/components/cad-requests/CadRequestDetailView.tsx` | Client CAD detail |
| `src/components/cad-requests/AdminCadRequestDetailView.tsx` | Admin CAD detail |

---

## 10. Migrations (Initial Table Creation)

| Table | Migration |
|---|---|
| `client_metal_buying_config` / `client_grill_config` / `client_custom_enquiry_config` (one of) | `supabase/migrations/20260217173545_56ab7877-0208-4846-9005-1ebe870cd30a.sql` |
| Related config table | `supabase/migrations/20260218063650_d8123d67-78e0-4d7d-a627-deb68f3212b4.sql` |
| Related config table | `supabase/migrations/20260403010632_e1f320fe-3ef8-43b6-af22-afda5dcbd594.sql` |

