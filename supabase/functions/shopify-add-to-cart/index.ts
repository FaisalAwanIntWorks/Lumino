import { usesDiamondTypeCheckout } from "../_shared/ring-os-diamond-checkout.ts";
import { resolveRingOsCurrency, ringOsCurrencySymbol } from "../_shared/ring-os-currency.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.23.8";

const serve = (handler: (req: Request) => Response | Promise<Response>) => Deno.serve(handler);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Input validation schemas
const EngravingSchema = z.object({
  enabled: z.boolean(),
  text: z.string().max(100).optional(),
  bandWidth: z.string().max(10).optional(),
  otherRequest: z.string().max(500).optional(),
}).optional();

const StoneSchema = z.object({
  id: z.string().max(100).optional(),
  type: z.string().max(50).optional(),
  carat: z.number().min(0).max(100).optional(),
  color: z.string().max(20).optional(),
  clarity: z.string().max(20).optional(),
  price: z.number().min(0).max(10000000).optional(),
  reportNo: z.string().max(100).optional(),
}).nullable().optional();

const RingConfigurationSchema = z.object({
  style: z.string().max(50).nullable().optional(),
  shank: z.string().max(50).nullable().optional(),
  metal: z.string().max(50).nullable().optional(),
  shape: z.string().max(50).nullable().optional(),
  size: z.string().max(10).nullable().optional(),
  caratRange: z.union([z.string(), z.number()]).nullable().optional(),
  engraving: EngravingSchema.nullable(),
  stone: StoneSchema,
});

const RequestSchema = z.object({
  clientId: z.string().uuid(),
  ringConfiguration: RingConfigurationSchema,
  estimatedPrice: z.number().nonnegative().optional(),
  quantity: z.number().int().min(1).max(100).default(1),
});

// Helper to convert carat value to display label matching shopify_variants_map format
function getCaratLabel(caratValue: string | number | undefined): string {
  if (!caratValue) return '1 Carat';
  const value = typeof caratValue === 'string' ? parseFloat(caratValue) : caratValue;
  // Format: "1 Carat", "1.5 Carat", "2 Carat" - matches shopify_variants_map keys
  const formatted = value % 1 === 0 ? value.toString() : value.toFixed(1);
  return `${formatted} Carat`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse and validate input
    const rawBody = await req.json();
    const validationResult = RequestSchema.safeParse(rawBody);
    
    if (!validationResult.success) {
      console.error('Validation failed:', validationResult.error.issues);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid request data',
          details: validationResult.error.issues.map(i => i.message),
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    const { clientId, ringConfiguration, estimatedPrice, quantity } = validationResult.data;

    console.log('Adding to cart for client:', clientId.substring(0, 8) + '...');
    console.log('Ring configuration:', ringConfiguration);

    // Look up client's Shopify credentials
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('user_id, shopify_store_url, shopify_checkout_domain, company_name, shopify_storefront_token_encrypted')
      .eq('id', clientId)
      .maybeSingle();

    if (clientError || !client) {
      throw new Error('Client not found or Shopify not connected');
    }

    if (!client.shopify_store_url) {
      throw new Error('Shopify store URL not configured for this client');
    }

    // Decrypt the Shopify Storefront access token (required for cart creation)
    const { data: storefrontToken, error: storefrontDecryptError } = await supabase
      .rpc('decrypt_storefront_token', { client_user_id: client.user_id });

    if (storefrontDecryptError || !storefrontToken) {
      console.error('Failed to decrypt Shopify storefront token:', storefrontDecryptError);
      // Return 400 with actionable error message instead of 500
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Storefront token missing. Please add your Shopify Storefront API Access Token in Settings → Shopify.',
          code: 'missing_storefront_token',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    // Helper to extract color family from metal slug.
     // Master DB only has rose|white|yellow rows — Platinum & Silver families
     // alias to "white" for catalog row matching (image strategy: reuse white).
    const getColorFamilyFromMetal = (metalId: string): string => {
      const normalized = metalId.toLowerCase();
      if (normalized.includes('rose')) return 'rose';
      if (normalized.includes('yellow')) return 'yellow';
      if (
        normalized.includes('white') ||
        normalized.includes('platinum') ||
        normalized.includes('pt') ||
        normalized.includes('silver') ||
        normalized.includes('sterling')
      ) return 'white';
      return normalized;
    };

    // Convert metal slug to display name
    const getMetalDisplayName = (metalId: string | undefined): string => {
      if (!metalId) return "";
      return metalId.split('-').map((word) => {
        if (/^\d+k$/i.test(word)) {
          return word.toUpperCase();
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      }).join(' ');
    };

    // Normalize function for matching - handles accented characters (é → e)
    const normalize = (str: string | undefined | null): string => {
      if (!str) return '';
      return str
        .toLowerCase()
        .normalize('NFD')                    // Decompose accented chars (é → e + combining accent)
        .replace(/[\u0300-\u036f]/g, '')     // Remove combining diacritical marks
        .replace(/[-_\s]/g, '');             // Remove dashes/underscores/spaces
    };

    // Look up the matching ring catalog item
    const { data: catalogItems, error: catalogError } = await supabase
      .from('client_ring_catalog')
      .select(`
        id,
        shopify_product_id,
        shopify_variant_id,
        shopify_variants_map,
        master_db_id,
        my_master_db_data!inner (
          id,
          combination_id,
          style_name,
          shank_name,
          visual_color,
          visual_color_name,
          shape_name
        )
      `)
      .eq('client_id', clientId)
      .eq('is_enabled', true);

    if (catalogError) {
      console.error('Failed to fetch catalog:', catalogError);
      throw new Error('Failed to fetch catalog items');
    }

    // Type for master data
    type MasterData = {
      id: string;
      combination_id: string;
      style_name: string;
      shank_name: string;
      visual_color: string;
      visual_color_name: string;
      shape_name: string;
    };

    // Extract color family from the metal selected in widget
    const metalColorFamily = getColorFamilyFromMetal(ringConfiguration.metal || '');
    const metalDisplayName = getMetalDisplayName(ringConfiguration.metal ?? undefined);
    // 24k quarter-carat picks (e.g. 0.75) map to their half-carat catalogue bucket.
    const rawCarat = ringConfiguration.caratRange ?? undefined;
    const caratForVariant = usesDiamondTypeCheckout(clientId) && rawCarat != null
      ? Math.floor(Number(rawCarat) * 2) / 2
      : rawCarat;
    const caratLabel = getCaratLabel(caratForVariant);

    // Find matching ring catalog item
    const matchingRing = catalogItems?.find(item => {
      const masterData = Array.isArray(item.my_master_db_data) 
        ? item.my_master_db_data[0] as MasterData
        : item.my_master_db_data as MasterData;
      if (!masterData) return false;

      const styleMatch = normalize(masterData.style_name) === normalize(ringConfiguration.style);
      const shankMatch = normalize(masterData.shank_name) === normalize(ringConfiguration.shank);
      const metalMatch = normalize(masterData.visual_color) === normalize(metalColorFamily);
      const shapeMatch = normalize(masterData.shape_name) === normalize(ringConfiguration.shape);

      console.log('Checking ring match:', {
        style: { db: masterData.style_name, config: ringConfiguration.style, match: styleMatch },
        shank: { db: masterData.shank_name, config: ringConfiguration.shank, match: shankMatch },
        metal: { db: masterData.visual_color, config: metalColorFamily, match: metalMatch },
        shape: { db: masterData.shape_name, config: ringConfiguration.shape, match: shapeMatch },
      });

      return styleMatch && shankMatch && metalMatch && shapeMatch;
    });

    // Fetch widget pricing mode early so we can adjust requirements
    const { data: prefs } = await supabase
      .from('client_onboarding_preferences')
      .select('widget_pricing_mode, widget_deposit_amount, widget_shopify_variant_id')
      .eq('client_id', clientId)
      .maybeSingle();

    // 24k-style accounts: lab diamonds check out at full price; natural diamonds
    // are quote-only and must never reach the cart.
    const diamondTypeCheckout = usesDiamondTypeCheckout(clientId);
    if (diamondTypeCheckout && ringConfiguration?.stone?.type === 'natural') {
      throw new Error('Natural diamond rings are quote-only. Please submit your details to request a quote.');
    }
    const isEstimatesMode = !diamondTypeCheckout && (prefs?.widget_pricing_mode || 'estimates') === 'estimates';
    const depositVariantId = (prefs as any)?.widget_shopify_variant_id as string | undefined;
    const depositAmount = Number((prefs as any)?.widget_deposit_amount) || 0;

    const { data: catalogFilter } = await supabase
      .from('client_diamond_catalog_filter')
      .select('markup_natural, markup_lab')
      .eq('client_id', clientId)
      .eq('is_confirmed', true)
      .maybeSingle();
    const naturalMarkup = Number((catalogFilter as any)?.markup_natural ?? 0);
    const labMarkup = Number((catalogFilter as any)?.markup_lab ?? 0);

    // In estimates mode, the cart uses the deposit variant — the exact ring catalog
    // row is only used for line-item attributes. Don't block checkout when the
    // shopper's 4-tuple (style/shank/metal/shape) isn't represented in the
    // client's curated catalog subset.
    if (!matchingRing && !isEstimatesMode) {
      console.error('No matching catalog item found for configuration:', ringConfiguration);
      throw new Error('This ring configuration is not available in your catalog.');
    }
    if (!matchingRing) {
      console.warn('Estimates mode: no exact ring catalog match — proceeding with deposit variant only', ringConfiguration);
    }

    // Build variant lookup key: "Metal / Carat"
    const variantKey = `${metalDisplayName} / ${caratLabel}`;
    const variantsMap = (matchingRing?.shopify_variants_map ?? null) as Record<string, string> | null;

    let ringVariantId: string;

    if (isEstimatesMode) {
      // Estimates mode: use the deposit variant so checkout total = deposit amount.
      // Full ring/diamond config is passed as line item attributes for the merchant.
      if (!depositVariantId) {
        throw new Error(
          'Deposit product is not yet set up. Please save your widget deposit amount in Catalog settings first.'
        );
      }
      ringVariantId = depositVariantId;
      console.log('Estimates mode: using deposit variant', depositVariantId, 'amount', depositAmount);
    } else {
      // Custom pricing: requires a real synced ring variant
      if (!matchingRing!.shopify_product_id || !matchingRing!.shopify_variant_id) {
        console.error('Catalog item not synced to Shopify:', matchingRing!.id);
        throw new Error('This product has not been synced to Shopify yet. Please push your catalog to Shopify first.');
      }
      ringVariantId = variantsMap?.[variantKey] || matchingRing!.shopify_variant_id;
    }

    console.log('Found matching ring:', matchingRing?.id ?? '(none)', 'variantKey:', variantKey, 'variant:', ringVariantId, 'estimatesMode:', isEstimatesMode);


    // Look up matching diamond from client_diamond_presets for stone details
    let stoneDetails: {
      stone_type: string;
      carat_value: number;
      color: string;
      clarity: string;
      price: number;
      base_price?: number | null;
      markup_percentage?: number | null;
      cut_grade?: string | null;
    } | null = null;

    if (ringConfiguration.stone?.type && ringConfiguration.stone?.color && ringConfiguration.stone?.clarity) {
      const stoneType = ringConfiguration.stone.type.toLowerCase().includes('natural') ? 'natural' : 'lab';
      const caratValue = typeof ringConfiguration.stone?.carat === 'number' && ringConfiguration.stone.carat > 0
        ? ringConfiguration.stone.carat
        : typeof ringConfiguration.caratRange === 'string'
          ? parseFloat(ringConfiguration.caratRange)
          : (ringConfiguration.caratRange || 1);
      const shapeLower = (ringConfiguration.shape || '').toLowerCase();

      let presetQuery = supabase
        .from('client_diamond_presets')
        .select('stone_type, carat_value, color, clarity, custom_price, base_price, cut_grade, shape_id, markup_percentage')
        .eq('client_id', clientId)
        .eq('is_enabled', true)
        .eq('stone_type', stoneType)
        .eq('color', ringConfiguration.stone.color)
        .eq('clarity', ringConfiguration.stone.clarity)
        .eq('carat_value', caratValue);

      if (shapeLower) {
        presetQuery = presetQuery.ilike('shape_id', shapeLower);
      }

      const { data: diamonds } = await presetQuery.limit(500);

      const uiPrice = typeof ringConfiguration.stone?.price === 'number' && ringConfiguration.stone.price > 0
        ? ringConfiguration.stone.price
        : null;

      if (diamonds && diamonds.length > 0) {
        // Each preset is 1:1 with a pool diamond and shares its base_price.
        // Pick the preset whose customer-facing price matches what the user
        // actually saw — that gives us the exact wholesale base_price we need
        // to identify the correct physical stone (and certificate) below.
        let chosen: any = diamonds[0];
        if (uiPrice != null) {
          chosen = diamonds.reduce((best: any, d: any) => {
            const dPrice = d.custom_price ?? d.base_price ?? 0;
            const bPrice = best.custom_price ?? best.base_price ?? 0;
            return Math.abs(dPrice - uiPrice) < Math.abs(bPrice - uiPrice) ? d : best;
          }, diamonds[0]);
        }
        stoneDetails = {
          stone_type: chosen.stone_type,
          carat_value: chosen.carat_value,
          color: chosen.color,
          clarity: chosen.clarity,
          price: uiPrice ?? (chosen.custom_price ?? chosen.base_price),
          base_price: chosen.base_price ?? null,
          markup_percentage: chosen.markup_percentage ?? null,
          cut_grade: chosen.cut_grade,
        };
        console.log('Found matching diamond preset:', stoneDetails);
      } else if (uiPrice) {
        stoneDetails = {
          stone_type: stoneType,
          carat_value: caratValue,
          color: ringConfiguration.stone.color,
          clarity: ringConfiguration.stone.clarity,
          price: uiPrice,
          base_price: null,
          cut_grade: null,
        };
        console.log('No matching preset, using widget-supplied stone price:', uiPrice);
      } else {
        console.log('No matching diamond preset found, using ring config stone info');
      }
    }

    // Look up matching physical diamond from diamond_inventory_pool to fetch
    // the certificate / report number (and lab) for the order.
    let inventoryDiamond: {
      report_no: string | null;
      lab: string | null;
      cut: string | null;
      pol: string | null;
      symm: string | null;
      flo: string | null;
      pdf?: string | null;
      price?: number | null;
      carats?: number | null;
      col?: string | null;
      clar?: string | null;
    } | null = null;

    const selectedDiamondId = ringConfiguration.stone?.id;
    const selectedReportNo = ringConfiguration.stone?.reportNo;

    // Step 1 – exact lookup by report_no (most reliable — 1-to-1 cert key)
    if (selectedReportNo) {
      try {
        const { data: exactDiamond, error: exactErr } = await supabase
          .from('diamond_inventory_pool')
          .select('report_no, lab, cut, pol, symm, flo, pdf, price, carats, col, clar')
          .eq('report_no', selectedReportNo)
          .maybeSingle();

        if (exactErr) {
          console.warn('[cert_lookup] report_no lookup error:', exactErr.message);
        } else if (exactDiamond) {
          inventoryDiamond = exactDiamond;
          console.log('[cert_lookup] path=exact_by_report_no matched_report_no:', inventoryDiamond?.report_no);
        } else {
          // report_no was supplied but not found — do NOT fall back to fuzzy matching.
          // A wrong certificate is worse than no certificate.
          console.warn('[cert_lookup] report_no supplied but not found in pool — skipping fuzzy fallback to avoid wrong cert:', selectedReportNo);
        }
      } catch (exactLookupErr) {
        console.warn('[cert_lookup] report_no lookup threw:', exactLookupErr);
      }
    }

    // Step 2 – exact lookup by pool UUID (works when id IS a diamond_inventory_pool.id)
    if (!inventoryDiamond && !selectedReportNo && selectedDiamondId) {
      try {
        const { data: exactDiamond, error: exactErr } = await supabase
          .from('diamond_inventory_pool')
          .select('report_no, lab, cut, pol, symm, flo, pdf, price, carats, col, clar')
          .eq('id', selectedDiamondId)
          .maybeSingle();

        if (exactErr) {
          console.warn('[cert_lookup] id lookup error:', exactErr.message);
        } else if (exactDiamond) {
          inventoryDiamond = exactDiamond;
          console.log('[cert_lookup] path=exact_by_pool_id matched_report_no:', inventoryDiamond?.report_no, 'id:', selectedDiamondId);
        }
      } catch (exactLookupErr) {
        console.warn('[cert_lookup] id lookup threw:', exactLookupErr);
      }
    }

    // Step 3 – fuzzy fallback (only when no report_no was passed — legacy sessions)
    // Skip entirely if reportNo was supplied; a fuzzy match would risk a wrong cert.
    if (
      !inventoryDiamond &&
      !selectedReportNo &&
      ringConfiguration.stone?.type &&
      ringConfiguration.stone?.color &&
      ringConfiguration.stone?.clarity &&
      ringConfiguration.shape
    ) {
      try {
        const stoneTypeLg = ringConfiguration.stone.type.toLowerCase().includes('natural')
          ? 'natural'
          : 'lab';
        const selectedStoneCarat = typeof ringConfiguration.stone?.carat === 'number' && ringConfiguration.stone.carat > 0
          ? ringConfiguration.stone.carat
          : null;
        const caratValueLookup = selectedStoneCarat ?? (typeof ringConfiguration.caratRange === 'string'
          ? parseFloat(ringConfiguration.caratRange)
          : (ringConfiguration.caratRange || (stoneDetails?.carat_value ?? 1)));
        const shapeUpper = String(ringConfiguration.shape).toUpperCase();

        let inventoryQuery = supabase
          .from('diamond_inventory_pool')
          .select('report_no, lab, cut, pol, symm, flo, pdf, price, carats, col, clar')
          .eq('lg', stoneTypeLg)
          .ilike('shape', `%${shapeUpper}%`)
          .eq('col', String(ringConfiguration.stone.color).toUpperCase())
          .eq('clar', String(ringConfiguration.stone.clarity).toUpperCase())
          .not('report_no', 'is', null);

        if (selectedStoneCarat != null) {
          inventoryQuery = inventoryQuery.eq('carats', selectedStoneCarat);
        } else {
          inventoryQuery = inventoryQuery.gte('carats', caratValueLookup).lt('carats', caratValueLookup + 0.5);
        }

        const { data: invRows, error: invErr } = await inventoryQuery.limit(500);

        if (invErr) {
          console.warn('diamond_inventory_pool lookup error:', invErr.message);
        } else if (invRows && invRows.length > 0) {
          // Pick the exact physical pool stone. Confirmed-catalog widget prices
          // are retail-marked prices, while diamond_inventory_pool.price is the
          // wholesale anchor. Reverse the configured markup before scoring so a
          // displayed $7,135.53 correctly matches a $5,285.58 inventory row.
          const targetBase = stoneDetails?.base_price ?? null;
          const targetPrice = stoneDetails?.price ?? null;
          const targetWholesaleFromRetail = targetPrice != null
            ? Number(targetPrice) / (1 + (stoneTypeLg === 'lab' ? labMarkup : naturalMarkup) / 100)
            : null;
          const preferredCut = stoneDetails?.cut_grade
            ? String(stoneDetails.cut_grade).toUpperCase()
            : null;

          const scored = invRows
            .map((r: any) => {
              const poolPrice = r.price != null ? Number(r.price) : null;
              const expectedRetail = poolPrice != null
                ? poolPrice * (1 + (stoneTypeLg === 'lab' ? labMarkup : naturalMarkup) / 100)
                : null;
              // Primary: match the displayed retail price after removing/applying markup.
              const retailMarkupDiff = targetWholesaleFromRetail != null && poolPrice != null
                ? Math.abs(poolPrice - targetWholesaleFromRetail)
                : Number.MAX_SAFE_INTEGER;
              // Secondary: direct match against generated preset base_price when present.
              const baseDiff = targetBase != null && expectedRetail != null
                ? Math.abs(expectedRetail - Number(targetBase))
                : Number.MAX_SAFE_INTEGER;
              // Tertiary: distance from displayed customer price using retail markup.
              const priceDiff = targetPrice != null && expectedRetail != null
                ? Math.abs(expectedRetail - Number(targetPrice))
                : Number.MAX_SAFE_INTEGER;
              const cutMatch = preferredCut && r.cut
                ? String(r.cut).toUpperCase() === preferredCut ? 0 : 1
                : 0;
              return { row: r, retailMarkupDiff, baseDiff, priceDiff, cutMatch };
            })
            .sort((a, b) => {
              if (a.retailMarkupDiff !== b.retailMarkupDiff) return a.retailMarkupDiff - b.retailMarkupDiff;
              if (a.baseDiff !== b.baseDiff) return a.baseDiff - b.baseDiff;
              if (a.cutMatch !== b.cutMatch) return a.cutMatch - b.cutMatch;
              return a.priceDiff - b.priceDiff;
            });

          inventoryDiamond = scored[0].row;
          console.log('[cert_lookup] path=fuzzy_fallback matched_report_no:', inventoryDiamond?.report_no,
            'target base:', targetBase, 'target price:', targetPrice, 'target wholesale:', targetWholesaleFromRetail,
            'matched price:', (inventoryDiamond as any)?.price);
        } else {
          console.log('[cert_lookup] path=fuzzy_fallback no_match', {
            stoneTypeLg, shapeUpper, color: ringConfiguration.stone.color,
            clarity: ringConfiguration.stone.clarity, carats: caratValueLookup,
          });
        }
      } catch (lookupErr) {
        console.warn('Inventory diamond lookup failed:', lookupErr);
      }
    }

    const shopifyDomain = client.shopify_store_url.replace('https://', '').replace('http://', '');
    const checkoutHost = (client as any).shopify_checkout_domain
      ? String((client as any).shopify_checkout_domain).replace(/^https?:\/\//, '').replace(/\/$/, '')
      : null;
    const swapHost = (url: string): string => {
      if (!checkoutHost) return url;
      try { const u = new URL(url); u.host = checkoutHost; return u.toString(); } catch { return url; }
    };

    // Build line items for cart
    const cartLines: Array<{
      merchandiseId: string;
      quantity: number;
      attributes: Array<{ key: string; value: string }>;
    }> = [];

    // Ensure variant IDs are in gid:// format
    const formatVariantId = (variantId: string): string => {
      if (variantId.startsWith('gid://')) {
        return variantId;
      }
      return `gid://shopify/ProductVariant/${variantId}`;
    };

    // Customer-facing amounts are in the Ring OS catalogue currency (Sandbox can
    // pick GBP / CAD; everyone else stays USD). The wholesale pool price below
    // is the USD sheet price and keeps "$".
    const priceSymbol = ringOsCurrencySymbol(await resolveRingOsCurrency(supabase, clientId));

    // Line Item 1: Ring Setting (with stone details embedded as attributes)
    const ringAttributes = [
      { key: "Style", value: ringConfiguration.style?.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || "" },
      { key: "Shank", value: ringConfiguration.shank?.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || "" },
      { key: "Metal", value: metalDisplayName },
      { key: "Shape", value: ringConfiguration.shape?.charAt(0).toUpperCase() + (ringConfiguration.shape?.slice(1) || "") || "" },
      { key: "Size", value: ringConfiguration.size || "" },
      { key: "Carat Range", value: caratLabel },
      // JewelX identification marker
      { key: "_source", value: "JewelX Ring Builder" },
      { key: "_pricing_mode", value: isEstimatesMode ? "estimates_deposit" : "custom_pricing" },
      { key: "_catalog_item_id", value: matchingRing?.id ?? "" },
    ];

    if (isEstimatesMode) {
      ringAttributes.push({ key: "Order Type", value: depositAmount > 0 ? "Deposit (Balance due upon production)" : "Enquiry (No deposit required)" });
      if (typeof estimatedPrice === 'number' && estimatedPrice > 0) {
        ringAttributes.push({ key: "Estimated Ring Price", value: `${priceSymbol}${Math.round(estimatedPrice).toLocaleString()}` });
      }
      ringAttributes.push({ key: "Deposit Amount", value: depositAmount > 0 ? `${priceSymbol}${depositAmount.toLocaleString()}` : 'No deposit' });
    }

    // Add band width if specified
    if (ringConfiguration.engraving?.bandWidth) {
      ringAttributes.push({ key: "Band Width", value: ringConfiguration.engraving.bandWidth });
    }

    // Add engraving if enabled
    if (ringConfiguration.engraving?.enabled && ringConfiguration.engraving?.text) {
      ringAttributes.push({ key: "Personalized Inscription", value: ringConfiguration.engraving.text });
    }

    // Add other request if specified
    if (ringConfiguration.engraving?.otherRequest) {
      ringAttributes.push({ key: "Any Other Request", value: ringConfiguration.engraving.otherRequest });
    }

    // Embed diamond details as attributes on the ring line item
    if (stoneDetails) {
      ringAttributes.push({ key: "Stone Type", value: stoneDetails.stone_type === 'natural' ? 'Natural Diamond' : 'Lab-Created Diamond' });
      ringAttributes.push({ key: "Stone Carat", value: String(stoneDetails.carat_value) });
      ringAttributes.push({ key: "Stone Color", value: stoneDetails.color });
      ringAttributes.push({ key: "Stone Clarity", value: stoneDetails.clarity });
      ringAttributes.push({ key: "Stone Price", value: `${priceSymbol}${stoneDetails.price.toLocaleString()}` });
      if (stoneDetails.cut_grade) {
        ringAttributes.push({ key: "Stone Cut Grade", value: stoneDetails.cut_grade });
      }
    } else if (ringConfiguration.stone?.type) {
      // Stone selected but no preset found - pass raw info
      ringAttributes.push({ key: "Stone Type", value: ringConfiguration.stone.type });
      if (ringConfiguration.stone.color) ringAttributes.push({ key: "Stone Color", value: ringConfiguration.stone.color });
      if (ringConfiguration.stone.clarity) ringAttributes.push({ key: "Stone Clarity", value: ringConfiguration.stone.clarity });
      if (ringConfiguration.stone.price) ringAttributes.push({ key: "Stone Price", value: `${priceSymbol}${ringConfiguration.stone.price.toLocaleString()}` });
    }

    // Append physical diamond certificate / grading details when available
    if (inventoryDiamond) {
      if (inventoryDiamond.report_no) {
        ringAttributes.push({ key: "Diamond Certificate No", value: inventoryDiamond.report_no });
      }
      if (inventoryDiamond.lab) {
        ringAttributes.push({ key: "Diamond Lab", value: inventoryDiamond.lab });
      }
      if (inventoryDiamond.cut && !stoneDetails?.cut_grade) {
        ringAttributes.push({ key: "Stone Cut Grade", value: inventoryDiamond.cut });
      }
      if (inventoryDiamond.pol) {
        ringAttributes.push({ key: "Stone Polish", value: inventoryDiamond.pol });
      }
      if (inventoryDiamond.symm) {
        ringAttributes.push({ key: "Stone Symmetry", value: inventoryDiamond.symm });
      }
      if (inventoryDiamond.flo) {
        ringAttributes.push({ key: "Stone Fluorescence", value: inventoryDiamond.flo });
      }
      if (inventoryDiamond.pdf) {
        ringAttributes.push({ key: "Diamond Certificate PDF", value: inventoryDiamond.pdf });
      }
      // Wholesale price = inventory pool's cost price (before any markup)
      if (inventoryDiamond.price != null && Number(inventoryDiamond.price) > 0) {
        ringAttributes.push({ key: "Wholesale Diamond Price", value: `$${Number(inventoryDiamond.price).toLocaleString()}` });
      }
    }

    // Markup % from catalog filter settings (natural vs lab)
    if (stoneDetails) {
      const stoneMarkup = stoneDetails.stone_type === 'lab' ? labMarkup : naturalMarkup;
      ringAttributes.push({ key: "Markup Price", value: `${stoneMarkup}%` });
    }

    cartLines.push({
      merchandiseId: formatVariantId(ringVariantId),
      quantity: quantity,
      attributes: ringAttributes,
    });

    // Storefront Cart Create mutation
    const cartCreateMutation = `
      mutation cartCreate($input: CartInput!) {
        cartCreate(input: $input) {
          cart {
            id
            checkoutUrl
            lines(first: 10) {
              edges {
                node {
                  id
                  quantity
                  attributes {
                    key
                    value
                  }
                  merchandise {
                    ... on ProductVariant {
                      id
                      title
                      product {
                        title
                      }
                    }
                  }
                }
              }
            }
            cost {
              totalAmount {
                amount
                currencyCode
              }
              subtotalAmount {
                amount
                currencyCode
              }
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Build cart input
    const cartInput = {
      lines: cartLines,
      attributes: [
        { key: "_source", value: "JewelX Ring Builder" },
        { key: "_client_id", value: clientId },
        { key: "_catalog_item_id", value: matchingRing?.id ?? "" },
      ],
      note: `JewelX Ring Builder Order - ${client.company_name}`
    };

    console.log('Creating Shopify cart with', cartLines.length, 'line items...');

    // Use Storefront API for cart creation
    const storefrontApiUrl = `https://${shopifyDomain}/api/2024-01/graphql.json`;

    const shopifyResponse = await fetch(storefrontApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': storefrontToken,
      },
      body: JSON.stringify({
        query: cartCreateMutation,
        variables: { input: cartInput }
      })
    });

    if (!shopifyResponse.ok) {
      const errorText = await shopifyResponse.text();
      console.error('Shopify Storefront API error:', errorText);
      throw new Error(`Shopify API error: ${shopifyResponse.status}`);
    }

    const shopifyData = await shopifyResponse.json();

    if (shopifyData.errors) {
      console.error('GraphQL errors:', shopifyData.errors);
      throw new Error('Shopify cart creation failed');
    }

    if (shopifyData.data?.cartCreate?.userErrors?.length > 0) {
      console.error('Cart creation errors:', shopifyData.data.cartCreate.userErrors);
      throw new Error(`Cart error: ${shopifyData.data.cartCreate.userErrors.map((e: {message: string}) => e.message).join(', ')}`);
    }

    const cart = shopifyData.data?.cartCreate?.cart;
    
    if (!cart || !cart.checkoutUrl) {
      console.error('No cart returned:', shopifyData);
      throw new Error('Failed to create cart - no checkout URL returned');
    }

    console.log('Cart created successfully:', cart.id);
    console.log('Total price:', cart.cost?.totalAmount?.amount);
    console.log('Line items:', cart.lines?.edges?.length);

    const redirectUrl = swapHost(cart.checkoutUrl);

    // Extract raw variant IDs for cart permalink
    const extractVariantId = (gid: string): string => {
      // Convert "gid://shopify/ProductVariant/123456" to "123456"
      const parts = gid.split('/');
      return parts[parts.length - 1];
    };

    // Build cart permalink URL for syncing items to store cart session
    // Format: https://store.com/cart/variant1:qty,variant2:qty?properties=BASE64&storefront=true
    const cartPermalinkParts: string[] = [];
    
    // Add ring variant
    const ringVariantNumericId = extractVariantId(formatVariantId(ringVariantId));
    cartPermalinkParts.push(`${ringVariantNumericId}:${quantity}`);
    
    // Convert ringAttributes array to object for JSON encoding (skip empty values)
    const ringPropertiesObj: Record<string, string> = {};
    for (const attr of ringAttributes) {
      if (attr.value) {
        ringPropertiesObj[attr.key] = attr.value;
      }
    }
    
    // Base64 URL-encode the properties JSON for Shopify cart permalink
    const propertiesJson = JSON.stringify(ringPropertiesObj);
    const propertiesBase64 = btoa(propertiesJson);
    
    // Build cart permalink with properties for the ring (first product)
    const cartPermalinkUrl = `https://${shopifyDomain}/cart/${cartPermalinkParts.join(',')}?properties=${propertiesBase64}&storefront=true`;
    console.log('Cart permalink URL:', cartPermalinkUrl);

    // Track analytics event
    await supabase
      .from('analytics_events')
      .insert({
        client_id: clientId,
        event_type: 'shopify_add_to_cart',
        metadata: {
          cart_id: cart.id,
          ring_variant_id: ringVariantId,
          catalog_item_id: matchingRing?.id ?? null,
          has_stone: !!stoneDetails,
          line_items_count: cartLines.length,
          configuration: ringConfiguration,
          total_price: cart.cost?.totalAmount?.amount,
        }
      });

    const cartPageUrl = `https://${shopifyDomain}/cart`;

    // Parse line items for frontend display - now only ring (diamond info is in attributes)
    const lineItems: Array<{
      type: 'ring';
      name: string;
      price: number;
      imageUrl?: string;
      attributes: Record<string, string>;
    }> = [];

    const cartLineEdges = cart.lines?.edges || [];
    for (const edge of cartLineEdges) {
      const lineNode = edge?.node;
      if (!lineNode) continue;

      const merchandise = lineNode.merchandise;
      const productTitle = merchandise?.product?.title || '';
      const variantTitle = merchandise?.title || '';

      const attrs: Record<string, string> = {};
      for (const attr of lineNode.attributes || []) {
        if (attr.key && attr.value && !attr.key.startsWith('_')) {
          attrs[attr.key] = attr.value;
        }
      }

      const totalPrice = parseFloat(cart.cost?.totalAmount?.amount || '0');

      lineItems.push({
        type: 'ring',
        name: variantTitle !== 'Default Title' 
          ? `${productTitle} - ${variantTitle}` 
          : productTitle,
        price: totalPrice,
        imageUrl: undefined,
        attributes: attrs,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        checkoutUrl: redirectUrl,
        cartPermalinkUrl: cartPermalinkUrl,
        cartUrl: cartPageUrl,
        cartId: cart.id,
        totalPrice: cart.cost?.totalAmount?.amount,
        currency: cart.cost?.totalAmount?.currencyCode,
        lineItemsCount: cartLines.length,
        lineItems,
        hasStone: !!stoneDetails,
        message: stoneDetails 
          ? 'Ring and diamond added to cart successfully'
          : 'Ring added to cart successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    // Log the full error internally for debugging.
    console.error('Error in shopify-add-to-cart:', error instanceof Error ? error.message : error);

    // Operational (non-sensitive) errors that are actionable for the merchant/shopper.
    // These are surfaced verbatim so the toast tells the user exactly what to fix,
    // instead of an opaque "Failed to add to cart" that hides the real cause.
    const actionableSubstrings = [
      'not available in your catalog',
      'not been synced to Shopify',
      'not connected',
      'not configured',
      'Deposit product is not yet set up',
      'Shopify API error',
      'Shopify cart creation failed',
      'Cart error',
      'no checkout URL returned',
      'Failed to fetch catalog',
    ];

    let safeMessage = 'Failed to add to cart. Please try again.';
    let isActionable = false;
    if (error instanceof Error && actionableSubstrings.some((s) => error.message.includes(s))) {
      safeMessage = error.message;
      isActionable = true;
    }

    return new Response(
      JSON.stringify({
        success: false,
        error: safeMessage
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        // 400 for known/actionable config errors, 500 only for genuinely unexpected failures.
        status: isActionable ? 400 : 500
      }
    );
  }
});
