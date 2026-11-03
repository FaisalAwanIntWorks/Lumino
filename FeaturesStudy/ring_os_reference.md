# Ring OS Widget — File Reference Map

## 1. Entry / Routing
- `src/App.tsx` — routes: `/embed/:clientId`, `/:clientId` (builder.jewlx.ai), lazy-loads EmbedConfigurator
- `src/pages/EmbedConfigurator.tsx` — main embed page (public widget entry)
- `src/pages/RingBuilder.tsx` — internal/standalone Ring Builder page
- `src/pages/CustomRingBuilder.tsx` — custom variant
- `src/lib/domain-config.ts` — subdomain → portal routing (builder.jewlx.ai)
- `src/lib/trusted-referrer.ts` — embed domain whitelisting

## 2. UI Components — `src/components/ring-builder/`
- `ProductViewer.tsx` — main ring image viewer (left panel)
- `ConfigurationPanel.tsx` — classic config panel (right side)
- `ElegantConfigurationPanel.tsx` — alternate "elegant" theme panel
- `WizardRingBuilder.tsx` — wizard-style flow
- `ChatAssistant.tsx` — AI chat-first configurator
- `StepNavigation.tsx`, `ElegantStepNavigation.tsx` — step nav UI
- `Ring3DViewer.tsx`, `Ring3DViewerDialog.tsx` — 3D model viewer
- `BookAppointmentDialog.tsx`, `SaveDesignDialog.tsx`, `ShareButton.tsx`, `CartDrawer.tsx`, `CompareDialog.tsx`
- Info dialogs: `StyleInfoDialog.tsx`, `ShankInfoDialog.tsx`, `MetalInfoDialog.tsx`, `ShapeInfoDialog.tsx`, `StoneInfoDialog.tsx`, `DiamondDetailInfoDialog.tsx`, `CaratViewerDialog.tsx`, `ExpertTip.tsx`
- Animations: `AICraftingAnimation.tsx`, `RingCompletionCelebration.tsx`, `RingRevealTransition.tsx`, `StreamingMessage.tsx`
- Misc: `ActionButtons.tsx`, `QuickOptionButton.tsx`, `ConfigurationSummaryCard.tsx`
- `steps/` — per-step UI subfolder
- `src/components/common/EmbedConfiguratorSkeleton.tsx` — loading skeleton

## 3. Hooks (state + DB queries)
- `src/hooks/useRingConfiguration.ts` — core ring configuration state + price calc
- `src/hooks/useClientCatalogOptions.ts` — fetches client styles/shanks/metals/shapes
- `src/hooks/useClientDiamondPresets.ts` — fetches diamonds from `client_diamond_presets` (RPC `get_client_diamond_presets`)
- `src/hooks/useClientCaratOptions.ts` — client carat options
- `src/hooks/useCaratSizeImages.ts` — carat-to-image mapping
- `src/hooks/useRingVariantImages.ts` — ring combination images
- `src/hooks/usePrefetchImages.ts`, `usePreloadedImage.ts` — image preloading
- `src/hooks/useClientPricing.ts`, `useClientCurrency.ts` — pricing/currency
- `src/hooks/useClientFeatures.ts` — feature flags
- `src/hooks/useScreenshotProtection.ts` — content protection
- `src/contexts/WidgetThemeContext.tsx` — widget theme provider

## 4. Helpers / Lib
- `src/lib/ring-config-helpers.ts` — diamond resolution, budget matching, step gating
- `src/lib/diamond-shape-icons.ts` — shape icon resolution
- `src/lib/tracking-utils.ts` — `trackRingView` analytics insert
- `src/lib/analytics-utils.ts` — `trackWidgetView` (source: `jewlx_widget`)
- `src/lib/apply-theme-colors.ts` — dynamic theme/branding
- `src/data/ring-builder-mock.ts` — mock metals/carats fallback
- `src/types/ring-builder.ts` — TypeScript types

## 5. Database Tables (DB queries)
### Catalog / Configuration
- `client_ring_catalog` — client's enabled ring combinations
- `ring_combinations` — master ring combination records
- `ring_setting_options`, `ring_metal_options`, `band_type_options`, `band_width_options` — master options
- `diamond_shape_options`, `diamond_size_options`, `diamond_quality_options`, `diamond_nature_options`, `diamond_holder_options`, `personalization_options` — diamond options
- `client_diamond_presets` — client-priced diamond inventory
- `client_carat_options` — client carat config
- `client_diamond_step_overrides` — per-step overrides
- `carat_size_images` — carat → image filename map
- `client_branding`, `clients` — branding/theme/currency

### Lead / Output
- `saved_designs` — Ring OS saved designs (lead source)
- `ai_chat_sessions`, `ai_chat_messages` — chat history
- `appointment_bookings` — booking submissions
- `analytics_events` — `ring_view`, widget views
- `cad_requests` — CAD orders from Ring OS
- `orders` — checkout orders (source: `jewlx-widget`)

## 6. CDN / Storage Retrieval
- **Bucket:** `ring-assets` (Supabase Storage)
- **CDN base URL:** `https://wcfxtsyhrpephimyrpbx.supabase.co/storage/v1/object/public/ring-assets`
- Folder structure:
  - `styles/` — style preview images
  - `shanks/` — shank preview images
  - `metals/` — metal swatches
  - `combinations/` — composed ring images per (style × shank × metal × shape × carat)
  - `ring-form-options/{clientId}/{stepKey}/` — uploaded custom option images
- Reference: `mem://assets/master-catalog-and-cdn-infrastructure`
- Asset upload pages: `src/pages/admin/AssetUpload.tsx`, `src/pages/admin/AssetSheet.tsx`
- Local fallback assets: `src/assets/styles/`, `src/assets/shanks/`, `src/assets/diamonds/` (see `mem://assets/local-asset-filesystem-constraints`)

## 7. Edge Functions (backend)
- `supabase/functions/ring-chat/` — AI chat handler for Ring OS configurator
- `supabase/functions/generate-ring-preview/` — AI ring preview image generation
- `supabase/functions/generate-client-catalog/` — generates client's ring catalog
- `supabase/functions/generate-client-diamond-presets/` — populates diamond presets
- `supabase/functions/reset-client-catalog/` — wipes client catalog
- `supabase/functions/get-client-saved-designs/` — fetches saved designs
- `supabase/functions/notify-appointment-booking/` — booking email
- `supabase/functions/notify-form-lead/` — lead notification
- `supabase/functions/create-checkout/`, `shopify-form-checkout/`, `shopify-add-to-cart/` — checkout/Shopify
- `supabase/functions/estimate-lead-cost/`, `send-quote-estimate/` — quote estimates
- `supabase/functions/save-payment-method/`, `purchase-cad-addon/` — payments

## 8. Admin Configuration UI (jeweler-side)
- `src/pages/client/RingFormOnboarding.tsx` — Ring OS form onboarding/config
- `src/pages/client/Catalog.tsx` — ring catalog & diamond preset management
- `src/components/ring-form-config/RingFormConfigurator.tsx` — config UI (60/40 split)
- `src/components/ring-form-config/ConfiguratorPanel.tsx`
- `src/components/ring-form-config/FlowPreview.tsx`
- `src/components/ring-form-config/QuestionEditor.tsx`
