import { createClient } from 'npm:@supabase/supabase-js@2';
import { dualAuth, checkUnkeyRateLimit, corsHeaders as unkeyCorHeaders } from '../_shared/unkey.ts';
import {
  computeMetalAddOn,
  detectKaratFromName,
  validateVariantCombination,
  REFERENCE_SPOT_PRICES_PER_OZ,
  type ColorFamily,
} from '../_shared/ring-os-metal-pricing.ts';
import { normalizeRingOsCurrency, usesRingOsCurrency } from '../_shared/ring-os-currency.ts';

const corsHeaders = {
  ...unkeyCorHeaders,
};

// Default carat options — Carat is a marketplace FILTER ONLY.
// It never adds to the ring total. Diamond cost comes from the diamond wizard.
// Mirrors src/lib/ring-os-defaults.ts → RING_OS_DEFAULT_CARAT_OPTIONS.
const DEFAULT_CARAT_OPTIONS = [
  { value: 0.5, name: '0.5 Carat', adjustment: 0 },
  { value: 1.0, name: '1 Carat',   adjustment: 0 },
  { value: 1.5, name: '1.5 Carat', adjustment: 0 },
  { value: 2.0, name: '2 Carat',   adjustment: 0 },
  { value: 2.5, name: '2.5 Carat', adjustment: 0 },
  { value: 3.0, name: '3 Carat+',  adjustment: 0 },
];

// Default carat reference images (served from /public/images/carat)
const DEFAULT_CARAT_IMAGES = {
  images_filepath: '/images/carat/',
  image_filename_0: 'carat_0.png',
  image_filename_1: 'carat_1.png',
  image_filename_2: 'carat_2.png',
  image_filename_3: 'carat_3.png',
  image_filename_4: 'carat_4.png',
  image_filename_5: 'carat_5.png',
  image_filename_6: 'carat_6.png',
  image_filename_7: 'carat_7.png',
};

// Default size options
const DEFAULT_SIZE_OPTIONS = [
  '4', '4.5', '5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13', '13.5', '14'
];

// Normalize text to handle accents AND hyphens/spaces (e.g., "pave-rail" matches "pavé rail")
function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-\s]+/g, ' ').trim();
}

// Build a mapping from normalized values to actual database values
// For style_id, also checks style_name as fallback since style_id may be NULL
async function buildNormalizedMapping(supabase: any, column: string, fallbackColumn?: string): Promise<Record<string, string>> {
  const { data } = await supabase
    .from('my_master_db_data')
    .select(fallbackColumn ? `${column},${fallbackColumn}` : column);
  
  const mapping: Record<string, string> = {};
  if (data) {
    data.forEach((row: Record<string, string>) => {
      const primaryVal = row[column];
      const fallbackVal = fallbackColumn ? row[fallbackColumn] : null;
      
      // If primary column has value, use it
      if (primaryVal) {
        mapping[normalizeText(primaryVal)] = primaryVal;
      }
      // If primary is NULL but fallback exists, map normalized fallback to lowercase fallback
      else if (fallbackVal) {
        const normalizedKey = normalizeText(fallbackVal);
        if (!mapping[normalizedKey]) {
          mapping[normalizedKey] = fallbackVal.toLowerCase();
        }
      }
    });
  }
  return mapping;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Dual auth: supports both API key and JWT
    const authResult = await dualAuth(req);
    if (authResult instanceof Response) return authResult;

    // Check Unkey rate limit for API key auth
    const rateLimited = checkUnkeyRateLimit(authResult);
    if (rateLimited) return rateLimited;

    const { clientId: bodyClientId, styles, shanks, selectedColors, metalVariants, shapes, prices, currency: bodyCurrency } = await req.json();
    
    // Use clientId from auth (API key metadata) or from request body
    const clientId = authResult.clientId || bodyClientId;

    // Ring OS catalogue currency (allow-listed accounts only, see
    // _shared/ring-os-currency.ts). Prices arrive already in that currency and
    // are never converted; `price` keeps the live amount and the matching
    // price_<currency> column remembers it so a later switch keeps both sets.
    const ringCurrency = usesRingOsCurrency(clientId) ? normalizeRingOsCurrency(bodyCurrency) : null;
    const ringPriceColumn = ringCurrency ? `price_${ringCurrency.toLowerCase()}` : null;
    type PerCurrencyPrices = { price_usd: number | null; price_gbp: number | null; price_cad: number | null };
    const carriedPrices = (row?: Partial<PerCurrencyPrices> | null): PerCurrencyPrices => ({
      price_usd: row?.price_usd ?? null,
      price_gbp: row?.price_gbp ?? null,
      price_cad: row?.price_cad ?? null,
    });

    console.log('Generating catalog for client:', clientId);
    console.log('Selections:', { styles, shanks, selectedColors, shapes });
    console.log('Metal variants:', metalVariants);
    console.log('Prices:', prices);

    if (!clientId || !styles?.length || !shanks?.length || !shapes?.length) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Track auth context for activity logging
    let isAuthorizedStaff = false;
    let staffData: any = null;
    let authUserEmail = '';
    let authUserId = authResult.userId || '';

    // For API key auth, the key is already scoped to a client — skip user-level access checks
    if (authResult.method === 'jwt' && authResult.userId) {
      // Check if user is an agency admin
      const { data: adminRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', authResult.userId)
        .eq('role', 'agency_admin')
        .maybeSingle();

      // Check if user owns the client
      const { data: clientOwnerData } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('user_id', authResult.userId)
        .maybeSingle();

      // Check if user is a staff member and their permissions
      const { data: staffDataResult } = await supabase
        .from('staff_members')
        .select('id, client_id, permissions')
        .eq('user_id', authResult.userId)
        .maybeSingle();
      staffData = staffDataResult;

      // Staff members can only generate if they have 'edit' catalog access for THIS client
      if (staffData) {
        const permissions = staffData.permissions as { catalog_access?: string | boolean } | null;
        const catalogAccess = String(permissions?.catalog_access ?? '').toLowerCase();
        const hasEditPermission = catalogAccess === 'edit';
        const isSameClient = staffData.client_id === clientId;

        if (!hasEditPermission) {
          console.log('Staff member without edit permission attempted to generate catalog - denied');
          return new Response(
            JSON.stringify({ error: 'Staff members cannot generate catalogs. Contact your administrator.' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!isSameClient) {
          console.log('Staff member attempted to generate catalog for a different client - denied');
          return new Response(
            JSON.stringify({ error: 'You are not authorized to generate this catalog' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        console.log('Staff member with edit permission generating catalog');
        isAuthorizedStaff = true;
      }

      if (!adminRole && !clientOwnerData && !isAuthorizedStaff) {
        console.log('Unauthorized user attempted to generate catalog');
        return new Response(
          JSON.stringify({ error: 'You are not authorized to generate this catalog' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Lookup user email for activity logging
      const { data: { user } } = await supabase.auth.admin.getUserById(authResult.userId);
      authUserEmail = user?.email || '';
      authUserId = authResult.userId;
    }

    // Validate metal configuration - need at least one color with variants
    if (!selectedColors?.length) {
      return new Response(
        JSON.stringify({ error: 'At least one color family must be selected' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get visual colors from selected color families
    const visualColors = selectedColors;

    // Build normalized mappings for columns that might have accent variations
    // For style_id, also check style_name as fallback since style_id may be NULL in some rows
    const styleMapping = await buildNormalizedMapping(supabase, 'style_id', 'style_name');
    const shankMapping = await buildNormalizedMapping(supabase, 'shank_id', 'shank_name');
    const colorMapping = await buildNormalizedMapping(supabase, 'visual_color', 'visual_color_name');
    const shapeMapping = await buildNormalizedMapping(supabase, 'shape_id', 'shape_name');

    // Map user selections to actual database values
    const dbStyles = styles.map((s: string) => styleMapping[normalizeText(s)] || s);
    const dbShanks = shanks.map((s: string) => shankMapping[normalizeText(s)] || s);
    const dbColors = visualColors.map((s: string) => colorMapping[normalizeText(s)] || s);
    const dbShapes = shapes.map((s: string) => shapeMapping[normalizeText(s)] || s);

    console.log('Normalized mappings:', { dbStyles, dbShanks, dbColors, dbShapes });

    // Step 1: Save onboarding preferences
    const { error: prefError } = await supabase
      .from('client_onboarding_preferences')
      .upsert({
        client_id: clientId,
        selected_styles: styles,
        selected_shanks: shanks,
        selected_metals: selectedColors, // Now stores color families
        selected_shapes: shapes,
        onboarding_completed: true,
        completed_at: new Date().toISOString(),
      }, { onConflict: 'client_id' });

    if (prefError) {
      console.error('Error saving preferences:', prefError);
      throw prefError;
    }

    // Step 2: Save option prices (styles, shanks only - metals handled separately)
    if (prices) {
      // Keep the amounts saved for the other currencies (currency accounts only).
      const previousOptionPrices: Record<string, PerCurrencyPrices> = {};
      if (ringCurrency) {
        const { data: prevRows } = await supabase
          .from('client_option_prices')
          .select('option_type, option_id, price_usd, price_gbp, price_cad')
          .eq('client_id', clientId);
        (prevRows || []).forEach((r: any) => {
          previousOptionPrices[`${r.option_type}:${r.option_id}`] = carriedPrices(r);
        });
      }

      // Delete existing prices
      await supabase
        .from('client_option_prices')
        .delete()
        .eq('client_id', clientId);

      // Insert new prices for styles and shanks
      const priceEntries: Array<{
        client_id: string;
        option_type: string;
        option_id: string;
        price: number;
      } & Partial<PerCurrencyPrices>> = [];

      for (const [optionType, optionPrices] of Object.entries(prices)) {
        if (optionType === 'metals') continue; // Skip metals - handled by metal variants
        for (const [optionId, price] of Object.entries(optionPrices as Record<string, number>)) {
          priceEntries.push({
            client_id: clientId,
            option_type: optionType,
            option_id: optionId,
            price: price,
            ...(ringPriceColumn
              ? { ...carriedPrices(previousOptionPrices[`${optionType}:${optionId}`]), [ringPriceColumn]: price }
              : {}),
          });
        }
      }

      if (priceEntries.length > 0) {
        const { error: priceError } = await supabase
          .from('client_option_prices')
          .insert(priceEntries);

        if (priceError) {
          console.error('Error saving prices:', priceError);
          throw priceError;
        }
        console.log(`Saved ${priceEntries.length} price entries`);
      }
    }

    // Step 3: Save metal variants — with server-side validation & price recompute.
    // Source of truth: RingOS-Metal-Pricing-Guide v2.0. Client-supplied prices for
    // platinum/silver karats are recalculated server-side using latest spot prices
    // (from metal_price_snapshots) and rejected if the family/karat combination
    // is incompatible (e.g. a "Platinum" name saved under the Silver family).
    if (metalVariants && Object.keys(metalVariants).length > 0) {
      // Pull latest spot snapshot for this client (fall back to reference spots).
      const { data: spotRow } = await supabase
        .from('metal_price_snapshots')
        .select('gold_price, silver_price, platinum_price')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const spots = {
        gold: Number(spotRow?.gold_price) || REFERENCE_SPOT_PRICES_PER_OZ.gold,
        silver: Number(spotRow?.silver_price) || REFERENCE_SPOT_PRICES_PER_OZ.silver,
        platinum: Number(spotRow?.platinum_price) || REFERENCE_SPOT_PRICES_PER_OZ.platinum,
      };

      // Keep the amounts saved for the other currencies (currency accounts only).
      const previousMetalPrices: Record<string, PerCurrencyPrices> = {};
      if (ringCurrency) {
        const { data: prevMetals } = await supabase
          .from('client_metal_variants')
          .select('variant_name, price_usd, price_gbp, price_cad')
          .eq('client_id', clientId);
        (prevMetals || []).forEach((r: any) => {
          previousMetalPrices[String(r.variant_name).toLowerCase().trim()] = carriedPrices(r);
        });
      }

      // Delete existing metal variants
      await supabase
        .from('client_metal_variants')
        .delete()
        .eq('client_id', clientId);

      const metalEntries: Array<{
        client_id: string;
        color_family: string;
        variant_name: string;
        price: number;
        display_order: number;
      } & Partial<PerCurrencyPrices>> = [];

      const validationErrors: string[] = [];

      for (const [colorFamily, variants] of Object.entries(metalVariants)) {
        if (!Array.isArray(variants)) continue;

        variants.forEach((variant: { name: string; price: number; displayOrder: number }) => {
          if (!variant.name || !variant.name.trim()) return;
          const name = variant.name.trim();

          // 1) Combination validation — blocks bad family/karat pairings.
          const err = validateVariantCombination(colorFamily, name);
          if (err) {
            validationErrors.push(err);
            return;
          }

          // 2) Server-side price recompute for platinum & silver (always authoritative).
          //    Gold-family variants keep the client-supplied price (jeweler markup).
          //    Spot prices are USD, so a GBP / CAD catalogue keeps the typed amount.
          let finalPrice = Number(variant.price) || 0;
          const karat = detectKaratFromName(name);
          const recomputeFromUsdSpot = !ringCurrency || ringCurrency === 'USD';
          if (recomputeFromUsdSpot && (colorFamily === 'platinum' || colorFamily === 'silver' || karat === 'platinum' || karat === 'silver')) {
            finalPrice = computeMetalAddOn({
              karat: karat || colorFamily,
              colorFamily: colorFamily as ColorFamily,
              spotGoldPerOz: spots.gold,
              spotPlatinumPerOz: spots.platinum,
              spotSilverPerOz: spots.silver,
            });
          }

          metalEntries.push({
            client_id: clientId,
            color_family: colorFamily,
            variant_name: name,
            price: finalPrice,
            display_order: variant.displayOrder || 0,
            ...(ringPriceColumn
              ? { ...carriedPrices(previousMetalPrices[name.toLowerCase()]), [ringPriceColumn]: finalPrice }
              : {}),
          });
        });
      }

      if (validationErrors.length > 0) {
        return new Response(
          JSON.stringify({
            error: 'Invalid metal variant configuration',
            details: validationErrors,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      if (metalEntries.length > 0) {
        const { error: metalError } = await supabase
          .from('client_metal_variants')
          .insert(metalEntries);

        if (metalError) {
          console.error('Error saving metal variants:', metalError);
          throw metalError;
        }
        console.log(`Saved ${metalEntries.length} metal variant entries (platinum/silver recomputed server-side)`);
      }
    }

    // The live step prices are now in ringCurrency: record it so Ring OS shows
    // the same currency for the ring and the diamonds.
    if (ringCurrency) {
      const { error: currencyError } = await supabase
        .from('clients')
        .update({ ring_catalog_currency: ringCurrency })
        .eq('id', clientId);
      if (currencyError) {
        console.error('Error saving ring catalogue currency:', currencyError);
        throw currencyError;
      }
    }

    // Step 4: Query master data matching selections from my_master_db_data table
    // Using normalized style_id, shank_id, visual_color, shape_id for matching
    const { data: masterData, error: masterDataError } = await supabase
      .from('my_master_db_data')
      .select('*')
      .in('style_id', dbStyles)
      .in('shank_id', dbShanks)
      .in('visual_color', dbColors)
      .in('shape_id', dbShapes);

    if (masterDataError) {
      console.error('Error fetching master data:', masterDataError);
      throw masterDataError;
    }

    console.log(`Found ${masterData?.length || 0} matching master data entries`);

    // If no matches found, return error with diagnostic info
    if (!masterData || masterData.length === 0) {
      console.log('No matching products found. Debug info:', {
        requestedStyles: styles,
        mappedStyles: dbStyles,
        requestedShanks: shanks,
        mappedShanks: dbShanks,
        requestedColors: visualColors,
        mappedColors: dbColors,
        requestedShapes: shapes,
        mappedShapes: dbShapes,
      });
      
      return new Response(
        JSON.stringify({
          success: false,
          catalogCount: 0,
          error: 'No matching products found. Please verify your selections match available inventory.',
          debug: {
            mappedStyles: dbStyles,
            mappedShanks: dbShanks,
            mappedColors: dbColors,
            mappedShapes: dbShapes,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Step 5: Delete existing catalog entries for this client
    await supabase
      .from('client_ring_catalog')
      .delete()
      .eq('client_id', clientId);

    // Step 6: Insert new catalog entries with calculated custom_price
    if (masterData && masterData.length > 0) {
      // Build price lookup maps from the passed prices object
      const stylePrices: Record<string, number> = prices?.styles || {};
      const shankPrices: Record<string, number> = prices?.shanks || {};
      
      // Build metal variant price lookup: visual_color -> variant_name -> price
      const metalPricesByColor: Record<string, Record<string, number>> = {};
      if (metalVariants) {
        for (const [colorFamily, variants] of Object.entries(metalVariants)) {
          if (Array.isArray(variants)) {
            metalPricesByColor[colorFamily] = {};
            variants.forEach((variant: { name: string; price: number }) => {
              if (variant.name) {
                metalPricesByColor[colorFamily][variant.name.toLowerCase().trim()] = variant.price || 0;
              }
            });
          }
        }
      }

      const catalogEntries = masterData.map(item => {
        // Get client's style price using style_id (client's custom price, NOT master base_price)
        const stylePrice = stylePrices[item.style_id] || 0;
        
        // Get client's shank price using shank_id
        const shankPrice = shankPrices[item.shank_id] || 0;
        
        // Get client's metal "starting at" price using visual_color.
        // Master DB only has rose|white|yellow visual_colors — Platinum & Silver
        // families share the "white" row set (image strategy: reuse white).
        // Use the MIN price across the family's karats so the catalog row reflects
        // the true "starting at" price; widget computes the live total per karat.
        let metalPrice = 0;
        const masterColor = String(item.visual_color || '').toLowerCase();
        const familiesForRow = masterColor === 'white'
          ? ['white', 'platinum', 'silver']
          : [masterColor];
        const candidatePrices: number[] = [];
        for (const fam of familiesForRow) {
          if (metalPricesByColor[fam]) {
            candidatePrices.push(...Object.values(metalPricesByColor[fam]));
          }
        }
        if (candidatePrices.length > 0) {
          metalPrice = Math.min(...candidatePrices);
        }
        
        // Calculate custom price using ONLY client's pricing (style + shank + metal)
        // The base_price from my_master_db_data is shown separately - custom_price is the client's markup
        const customPrice = stylePrice + shankPrice + metalPrice;
        
        return {
          client_id: clientId,
          master_db_id: item.id, // Reference to my_master_db_data.id
          is_enabled: true,
          markup_percentage: 100,
          custom_price: customPrice,
        };
      });

      const { error: catalogError } = await supabase
        .from('client_ring_catalog')
        .insert(catalogEntries);

      if (catalogError) {
        console.error('Error creating catalog:', catalogError);
        throw catalogError;
      }

      console.log(`Created ${catalogEntries.length} catalog entries with custom prices`);
    }

    // Step 7: Create default carat options
    await supabase
      .from('client_carat_options')
      .delete()
      .eq('client_id', clientId);

    const caratEntries = DEFAULT_CARAT_OPTIONS.map(opt => ({
      client_id: clientId,
      carat_value: opt.value,
      display_name: opt.name,
      is_enabled: true,
      price_adjustment: opt.adjustment,
      ...DEFAULT_CARAT_IMAGES,
    }));

    await supabase.from('client_carat_options').insert(caratEntries);

    // Step 8: Create default size options
    await supabase
      .from('client_size_options')
      .delete()
      .eq('client_id', clientId);

    const sizeEntries = DEFAULT_SIZE_OPTIONS.map(size => ({
      client_id: clientId,
      size_value: size,
      is_enabled: true,
      price_adjustment: 0,
    }));

    await supabase.from('client_size_options').insert(sizeEntries);

    // Step 9: Log the activity (only for JWT auth where we have user context)
    if (authResult.method === 'jwt' && authUserId) {
      const userType = isAuthorizedStaff ? 'staff' : 'owner';
      await supabase.from('client_activity_logs').insert({
        client_id: clientId,
        user_id: authUserId,
        user_email: authUserEmail,
        user_name: null,
        user_type: userType,
        action_type: 'catalog_generate',
        action_category: 'catalog',
        description: `Generated catalog with ${masterData?.length || 0} products`,
        metadata: { 
          styles, 
          shanks, 
          shapes, 
          selectedColors,
          product_count: masterData?.length || 0 
        },
      });
    }

    // Step 10: Store metal price snapshot for "Since Catalog" comparisons
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const priceRes = await fetch(`${supabaseUrl}/functions/v1/fetch-metal-prices`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
      });
      const priceData = priceRes.ok ? await priceRes.json() : null;

      const goldPrice = priceData?.prices?.gold?.pricePerOz ?? 2340;
      const silverPrice = priceData?.prices?.silver?.pricePerOz ?? 28.5;
      const platinumPrice = priceData?.prices?.platinum?.pricePerOz ?? 975;
      const source = priceData?.prices?.gold?.pricePerOz ? 'live' : 'demo';

      await supabase.from('metal_price_snapshots').insert({
        client_id: clientId,
        gold_price: goldPrice,
        silver_price: silverPrice,
        platinum_price: platinumPrice,
        source,
      });
    } catch (snapshotErr) {
      console.error('Failed to store metal price snapshot:', snapshotErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        catalogCount: masterData?.length || 0,
        message: `Generated ${masterData?.length || 0} ring products`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    // SECURITY: Log internally but return generic message
    console.error('Error in generate-client-catalog');
    return new Response(
      JSON.stringify({ error: 'Catalog generation failed. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
