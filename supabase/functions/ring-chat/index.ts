import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { 
  getRequiredSecret, 
  sanitizeForLogging, 
  createErrorResponse,
  corsHeaders 
} from '../_shared/secrets-validation.ts';
import { verifyRequestApiKey } from '../_shared/unkey.ts';
import { gateRequest, logUsage, extractTokens } from '../_shared/ai-quota.ts';
import { getChatCache, setChatCache, getCached, setCache, buildCacheKey } from '../_shared/ai-cache.ts';
import { tryAICall } from '../_shared/ai-router.ts';
import { loadPrompt } from '../_shared/prompt-loader.ts';
import { logEdgeFunctionError } from '../_shared/error-logger.ts';

interface CatalogItem {
  id: string;
  style: string;
  shank: string;
  shape: string;
  visual_color: string;
  product_name: string;
  base_price: number;
  custom_price: number | null;
}

interface MetalVariant {
  variant_name: string;
  color_family: string;
  price: number;
}

interface OptionPrice {
  option_type: string;
  option_id: string;
  price: number;
}

interface TrainingExample {
  question: string;
  answer: string;
}

async function fetchClientCatalog(supabase: any, clientId: string) {
  // Fetch catalog items with master db data
  const { data: catalogItems, error: catalogError } = await supabase
    .from('client_ring_catalog')
    .select(`
      id,
      custom_price,
      is_enabled,
      master_db_id,
      my_master_db_data (
        style,
        style_name,
        shank_id,
        shank_name,
        shape_id,
        shape_name,
        visual_color,
        visual_color_name,
        product_name,
        base_price
      )
    `)
    .eq('client_id', clientId)
    .eq('is_enabled', true);

  if (catalogError) {
    console.error('Error fetching catalog:', catalogError);
    return null;
  }

  // Fetch metal variants
  const { data: metalVariants, error: metalError } = await supabase
    .from('client_metal_variants')
    .select('variant_name, color_family, price')
    .eq('client_id', clientId);

  if (metalError) {
    console.error('Error fetching metal variants:', metalError);
  }

  // Fetch option prices (styles and shanks)
  const { data: optionPrices, error: pricesError } = await supabase
    .from('client_option_prices')
    .select('option_type, option_id, price')
    .eq('client_id', clientId);

  if (pricesError) {
    console.error('Error fetching option prices:', pricesError);
  }

  // Fetch carat options
  const { data: caratOptions, error: caratError } = await supabase
    .from('client_carat_options')
    .select('display_name, carat_value, price_adjustment')
    .eq('client_id', clientId)
    .eq('is_enabled', true);

  if (caratError) {
    console.error('Error fetching carat options:', caratError);
  }

  // Fetch training examples (Q&A pairs)
  const { data: trainingExamples, error: trainingError } = await supabase
    .from('ai_training_examples')
    .select('question, answer')
    .eq('client_id', clientId);

  if (trainingError) {
    console.error('Error fetching training examples:', trainingError);
  }

  // Fetch diamond presets through the SAME RPC the widget uses (get_diamond_presets_filtered),
  // so the AI agent sees the identical marked-up / filtered / deduped diamonds.
  //   - Pool path (client has a confirmed client_diamond_catalog_filter): diamonds come from
  //     diamond_inventory_pool with markup_natural/markup_lab applied to base_price.
  //   - Legacy path (no confirmed filter): the RPC falls back to client_diamond_presets.
  // Previously this read the raw client_diamond_presets table directly, which for pool-based
  // clients was empty/stale and carried NO markup — causing the agent to quote wrong or missing
  // diamond prices that did not match the widget or checkout.
  const { data: rpcDiamonds, error: diamondError } = await supabase
    .rpc('get_diamond_presets_filtered', {
      p_client_id: clientId,
      p_page_size: 2000,
      p_offset: 0,
    });

  if (diamondError) {
    console.error('Error fetching diamond presets:', diamondError);
  }

  // Mirror the widget's isWithinDeclaredRange filter: keep only presets whose carat_value sits
  // inside its declared 0.5ct range bucket, so the prompt and the widget stay perfectly in sync.
  const rangeStart = (range: string | null | undefined): number | null => {
    const m = String(range ?? '').match(/\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  };
  const diamondPresets = (rpcDiamonds || []).filter((p: any) => {
    const start = rangeStart(p.carat_range);
    if (start === null || Number.isNaN(start)) return true;
    return p.carat_value >= start && p.carat_value < start + 0.5;
  });

  // Fetch the FULL attribute universe of this client's diamond catalog (cut, polish,
  // symmetry, fluorescence, lab/certification, origin, measurements, carat range,
  // markups). The deduped preset list above collapses many of these, so the agent
  // needs this summary to answer "do you have GIA?", "what cuts/fluorescence?", etc.
  const { data: diamondAttributes, error: attrError } = await supabase
    .rpc('get_diamond_catalog_attributes', { p_client_id: clientId });

  if (attrError) {
    console.error('Error fetching diamond catalog attributes:', attrError);
  }

  return {
    catalogItems: catalogItems || [],
    metalVariants: metalVariants || [],
    optionPrices: optionPrices || [],
    caratOptions: caratOptions || [],
    trainingExamples: trainingExamples || [],
    diamondPresets: diamondPresets || [],
    diamondAttributes: diamondAttributes || null
  };
}

function buildTrainingContext(trainingExamples: TrainingExample[]) {
  if (!trainingExamples || trainingExamples.length === 0) {
    return '';
  }

  let context = `\n\n=== CLIENT'S CUSTOM KNOWLEDGE BASE (HIGHEST PRIORITY) ===\n`;
  context += `RULE: If the customer's question closely matches any Q below, you MUST answer using the corresponding A — quote it accurately before adding anything else. Never contradict or ignore these answers.\n\n`;

  trainingExamples.forEach((example, index) => {
    context += `Q${index + 1}: ${example.question}\n`;
    context += `A${index + 1}: ${example.answer}\n\n`;
  });

  return context;
}

// Build a summary of the client's FULL diamond attribute universe so the agent
// can knowledgeably discuss cut, polish, symmetry, fluorescence, certification,
// origin and measurements — attributes that the deduped preset list hides.
function buildDiamondAttributesContext(attrs: any) {
  if (!attrs || typeof attrs !== 'object') return '';

  const arr = (v: any): string[] => (Array.isArray(v) ? v.filter(Boolean) : []);
  const list = (v: any): string => arr(v).join(', ');

  const stoneTypes   = arr(attrs.stoneTypes);
  const shapes       = arr(attrs.shapes);
  const colors       = arr(attrs.colors);
  const clarities    = arr(attrs.clarities);
  const cuts         = arr(attrs.cuts);
  const polish       = arr(attrs.polish);
  const symmetry     = arr(attrs.symmetry);
  const fluorescence = arr(attrs.fluorescence);
  const labs         = arr(attrs.labs);

  // Nothing meaningful to show
  const hasAny = stoneTypes.length || shapes.length || colors.length || clarities.length ||
    cuts.length || polish.length || symmetry.length || fluorescence.length || labs.length ||
    attrs.caratMin != null || attrs.lengthMin != null;
  if (!hasAny) return '';

  let ctx = `\n=== DIAMOND CATALOG ATTRIBUTES (what this store actually offers) ===\n`;
  ctx += `Use these to answer questions about the 4Cs, certification, origin and measurements. Only claim an attribute is available if it appears below.\n`;
  if (stoneTypes.length)   ctx += `STONE TYPES: ${list(stoneTypes)}\n`;
  if (shapes.length)       ctx += `SHAPES: ${list(shapes)}\n`;
  if (attrs.caratMin != null && attrs.caratMax != null)
                           ctx += `CARAT RANGE: ${attrs.caratMin} – ${attrs.caratMax} ct\n`;
  if (colors.length)       ctx += `COLOR GRADES: ${list(colors)}\n`;
  if (clarities.length)    ctx += `CLARITY GRADES: ${list(clarities)}\n`;
  if (cuts.length)         ctx += `CUT GRADES: ${list(cuts)}\n`;
  if (polish.length)       ctx += `POLISH: ${list(polish)}\n`;
  if (symmetry.length)     ctx += `SYMMETRY: ${list(symmetry)}\n`;
  if (fluorescence.length) ctx += `FLUORESCENCE: ${list(fluorescence)}\n`;
  if (labs.length)         ctx += `LAB / CERTIFICATION: ${list(labs)} (every diamond ships with its certificate)\n`;
  else if (attrs.certReports === true)
                           ctx += `CERTIFICATION: Certified diamonds with lab reports available\n`;
  if (attrs.lengthMin != null && attrs.lengthMax != null)
                           ctx += `MEASUREMENTS (length): ${attrs.lengthMin} – ${attrs.lengthMax} mm\n`;
  if (attrs.canadianAvailable === true)
                           ctx += `ORIGIN: Canadian-origin (Canada Mark eligible) diamonds available\n`;
  if (typeof attrs.totalStones === 'number' && attrs.totalStones > 0)
                           ctx += `INVENTORY DEPTH: ~${attrs.totalStones.toLocaleString()} physical diamonds across these attributes\n`;

  return ctx;
}

function buildDiamondContext(diamondPresets: any[]) {
  if (!diamondPresets || diamondPresets.length === 0) {
    return '';
  }

  const stoneTypes = [...new Set(diamondPresets.map((d: any) => d.stone_type).filter(Boolean))];
  const shapes = [...new Set(diamondPresets.map((d: any) => d.shape_id).filter(Boolean))];
  const colors = [...new Set(diamondPresets.map((d: any) => d.color).filter(Boolean))];
  const clarities = [...new Set(diamondPresets.map((d: any) => d.clarity).filter(Boolean))];
  const cutGrades = [...new Set(diamondPresets.map((d: any) => d.cut_grade).filter(Boolean))];
  const fluorescences = [...new Set(diamondPresets.map((d: any) => d.fluorescence).filter(Boolean))];

  const caratValues = diamondPresets.map((d: any) => d.carat_value).filter((v: any) => typeof v === 'number');
  const minCarat = caratValues.length > 0 ? Math.min(...caratValues) : 0;
  const maxCarat = caratValues.length > 0 ? Math.max(...caratValues) : 0;

  let context = `\n=== CLIENT'S DIAMOND CATALOG ===\n`;
  context += `This client has ${diamondPresets.length} diamond presets available.\n\n`;
  context += `STONE TYPES: ${stoneTypes.join(', ')}\n`;
  context += `AVAILABLE SHAPES: ${shapes.join(', ')}\n`;
  context += `CARAT RANGE: ${minCarat} – ${maxCarat} ct\n`;
  context += `COLOR GRADES: ${colors.join(', ')}\n`;
  context += `CLARITY GRADES: ${clarities.join(', ')}\n`;
  if (cutGrades.length > 0) {
    context += `CUT GRADES: ${cutGrades.join(', ')}\n`;
  }
  if (fluorescences.length > 0) {
    context += `FLUORESCENCE: ${fluorescences.join(', ')}\n`;
  }

  // Diamond presets for budget calculations — capped per stone type to prevent prompt bloat.
  // The frontend resolver (resolveDiamondFromPresets) always picks the actual DB row, so the
  // AI only needs enough rows to give accurate budget guidance, not the exhaustive full list.
  const MAX_PRESETS_PER_TYPE = 60;
  context += `\nDIAMOND PRESETS (FOR BUDGET CALCULATIONS — top options by carat):\n`;
  for (const stoneType of stoneTypes) {
    const presets = diamondPresets.filter((d: any) => d.stone_type === stoneType);
    // Sort by carat descending (largest first) so budget-maximization picks the best option
    const sorted = [...presets].sort((a: any, b: any) => b.carat_value - a.carat_value);
    const shown = sorted.slice(0, MAX_PRESETS_PER_TYPE);
    const hidden = sorted.length - shown.length;
    context += `  ${stoneType.toUpperCase()} diamonds (showing ${shown.length} of ${sorted.length}):\n`;
    for (const p of shown) {
      const price = p.custom_price || p.base_price || 0;
      context += `    - ${p.shape_id} ${p.carat_value}ct ${p.color}/${p.clarity}${p.cut_grade ? ' ' + p.cut_grade : ''}: $${price.toLocaleString()}\n`;
    }
    if (hidden > 0) {
      context += `    ... and ${hidden} more (the widget will resolve the exact match automatically)\n`;
    }
  }

  return context;
}

function buildCatalogContext(catalogData: any) {
  if (!catalogData) {
    return '';
  }

  const { catalogItems, metalVariants, optionPrices, caratOptions, trainingExamples, diamondPresets, diamondAttributes } = catalogData;

  // Build training examples context first
  let context = buildTrainingContext(trainingExamples);

  // If no catalog items, still surface diamond catalog + attributes (diamonds can
  // exist independently of ring configurations).
  if (catalogItems.length === 0) {
    context += buildDiamondAttributesContext(diamondAttributes);
    context += buildDiamondContext(diamondPresets);
    return context;
  }

  // Group products by style
  const productsByStyle: Record<string, any[]> = {};
  catalogItems.forEach((item: any) => {
    const masterData = item.my_master_db_data;
    if (!masterData) return;
    
    const styleName = masterData.style_name || masterData.style || 'Unknown';
    if (!productsByStyle[styleName]) {
      productsByStyle[styleName] = [];
    }
    productsByStyle[styleName].push({
      productName: masterData.product_name,
      shank: masterData.shank_name || masterData.shank_id,
      shape: masterData.shape_name || masterData.shape_id,
      color: masterData.visual_color_name || masterData.visual_color,
      basePrice: item.custom_price || masterData.base_price || 0
    });
  });

  // Get unique values
  const styles = [...new Set(catalogItems.map((i: any) => i.my_master_db_data?.style_name).filter(Boolean))];
  const shanks = [...new Set(catalogItems.map((i: any) => i.my_master_db_data?.shank_name).filter(Boolean))];
  const shapes = [...new Set(catalogItems.map((i: any) => i.my_master_db_data?.shape_name).filter(Boolean))];
  const colors = [...new Set(catalogItems.map((i: any) => i.my_master_db_data?.visual_color_name).filter(Boolean))];

  // Build style/shank name maps (id → friendly name) from catalog items
  // so price lines in the prompt use human-readable names, not raw slugs
  const styleIdToName: Record<string, string> = {};
  const shankIdToName: Record<string, string> = {};
  catalogItems.forEach((item: any) => {
    const md = item.my_master_db_data;
    if (!md) return;
    if (md.style && md.style_name) styleIdToName[md.style] = md.style_name;
    if (md.shank_id && md.shank_name) shankIdToName[md.shank_id] = md.shank_name;
  });

  // Build style prices map (keyed by option_id, displayed with friendly name)
  const stylePrices: Record<string, number> = {};
  const shankPrices: Record<string, number> = {};
  optionPrices.forEach((op: OptionPrice) => {
    if (op.option_type === 'style' || op.option_type === 'styles') {
      stylePrices[op.option_id] = op.price;
    } else if (op.option_type === 'shank' || op.option_type === 'shanks') {
      shankPrices[op.option_id] = op.price;
    }
  });

  // Build metal variants summary
  const metalsByColor: Record<string, any[]> = {};
  metalVariants.forEach((mv: MetalVariant) => {
    if (!metalsByColor[mv.color_family]) {
      metalsByColor[mv.color_family] = [];
    }
    metalsByColor[mv.color_family].push({
      name: mv.variant_name,
      price: mv.price
    });
  });

  context += `\n=== CLIENT'S RING CATALOG ===\n`;
  context += `This client has ${catalogItems.length} ring configurations in their catalog.\n\n`;

  context += `AVAILABLE STYLES: ${styles.join(', ')}\n`;
  if (Object.keys(stylePrices).length > 0) {
    // Show "Friendly Name (id): $price" so AI can match both spoken name and slug
    context += `Style prices: ${Object.entries(stylePrices).map(([k, v]) => {
      const name = styleIdToName[k];
      return name ? `${name} (${k}): $${v}` : `${k}: $${v}`;
    }).join(', ')}\n`;
  }

  context += `\nAVAILABLE SHANKS: ${shanks.join(', ')}\n`;
  if (Object.keys(shankPrices).length > 0) {
    context += `Shank prices: ${Object.entries(shankPrices).map(([k, v]) => {
      const name = shankIdToName[k];
      return name ? `${name} (${k}): $${v}` : `${k}: $${v}`;
    }).join(', ')}\n`;
  }

  context += `\nAVAILABLE SHAPES: ${shapes.join(', ')}\n`;
  context += `\nAVAILABLE COLORS: ${colors.join(', ')}\n`;

  if (Object.keys(metalsByColor).length > 0) {
    context += `\nMETAL OPTIONS:\n`;
    Object.entries(metalsByColor).forEach(([color, metals]) => {
      context += `  ${color}: ${metals.map((m: any) => `${m.name} ($${m.price})`).join(', ')}\n`;
    });
  }

  if (caratOptions.length > 0) {
    context += `\nAVAILABLE CARAT SIZES (filter only — NO price adjustment):\n`;
    caratOptions.forEach((co: any) => {
      context += `  ${co.display_name} (${co.carat_value} ct)\n`;
    });
  }

  context += `\nSAMPLE PRODUCTS:\n`;
  let pcount = 0;
  for (const [style, products] of Object.entries(productsByStyle)) {
    if (pcount >= 10) break;
    const sample = (products as any[]).slice(0, 3);
    sample.forEach((p: any) => {
      context += `  - ${p.productName || `${style} ${p.shank} ${p.shape}`}: $${p.basePrice} (${p.color} ${p.shape})\n`;
      pcount++;
    });
  }

  // Add diamond catalog attribute summary (full universe) + preset list
  context += buildDiamondAttributesContext(diamondAttributes);
  context += buildDiamondContext(diamondPresets);

  return context;
}

// Build a "Current Ring State" section from the live widget config
function buildCurrentConfigContext(currentConfig: Record<string, any> | null, catalogData: any): string {
  if (!currentConfig || Object.keys(currentConfig).length === 0) {
    return '\n=== CURRENT RING STATE ===\nNo selections made yet. Start from scratch — begin with Style.\n';
  }

  // Detect default base config (not user-chosen) — treat as fresh start
  // Use explicit flag from client if provided; fall back to pattern matching
  const isDefault = currentConfig.isDefault === true || (
    currentConfig.style && currentConfig.shank && currentConfig.metal && currentConfig.shape
    && !currentConfig.carat && !currentConfig.diamond
    && /solitaire/i.test(currentConfig.style)
    && /high.?polish/i.test(currentConfig.shank)
    && /rose/i.test(currentConfig.metal)
    && /round/i.test(currentConfig.shape)
  );
  if (isDefault) {
    return '\n=== CURRENT RING STATE ===\nThese are DEFAULT values, not user selections. Treat this as a fresh start — begin from Style.\n';
  }

  let ctx = '\n=== CURRENT RING STATE (already selected by the user) ===\n';
  ctx += 'The customer has ALREADY configured these options on the ring viewer. Do NOT re-ask about them unless the customer wants to change something.\n';
  
  if (currentConfig.style) ctx += `  Style: ${currentConfig.style}\n`;
  if (currentConfig.shank) ctx += `  Band/Shank: ${currentConfig.shank}\n`;
  if (currentConfig.metal) ctx += `  Metal: ${currentConfig.metal}\n`;
  if (currentConfig.shape) ctx += `  Shape: ${currentConfig.shape}\n`;
  if (currentConfig.carat) ctx += `  Carat: ${currentConfig.carat}\n`;
  if (currentConfig.diamond) ctx += `  Diamond: ${currentConfig.diamond}\n`;
  if (currentConfig.stoneType) ctx += `  Stone Type Preference: ${currentConfig.stoneType}\n`;
  
  // Determine what's missing
  const missing: string[] = [];
  if (!currentConfig.style) missing.push('style');
  if (!currentConfig.shank) missing.push('band/shank');
  if (!currentConfig.metal) missing.push('metal');
  if (!currentConfig.shape) missing.push('shape');
  if (!currentConfig.carat) missing.push('carat');
  if (!currentConfig.diamond) missing.push('diamond');
  
  if (missing.length === 0) {
    ctx += '\nAll required selections are complete including diamond. Next ask for ring SIZE (optional), then ENGRAVING (optional), then offer checkout.\n';
  } else if (missing.length === 1 && missing[0] === 'diamond') {
    ctx += '\nThe ring base is complete but NO DIAMOND has been selected yet. Ask about natural vs lab-grown.\n';
  } else {
    ctx += `\nStill needed: ${missing.join(', ')}. Ask about the NEXT missing item only.\n`;
  }

  // If the frontend sent confirmed prices (computed from catalog), use those as the locked truth.
  // This avoids the AI recalculating prices from scratch (which causes wrong totals).
  if (currentConfig?.confirmedPrices) {
    const cp = currentConfig.confirmedPrices;
    ctx += '\n=== CONFIRMED PRICES (LOCKED — never recalculate or change these) ===\n';
    if (cp.style  > 0) ctx += `  Style:   $${Number(cp.style).toLocaleString()}\n`;
    if (cp.shank  > 0) ctx += `  Band:    $${Number(cp.shank).toLocaleString()}\n`;
    if (cp.metal  > 0) ctx += `  Metal:   $${Number(cp.metal).toLocaleString()}\n`;
    if (cp.diamond > 0) ctx += `  Diamond: $${Number(cp.diamond).toLocaleString()}\n`;
    ctx += `  TOTAL:   $${Number(cp.total).toLocaleString()}\n`;
    ctx += 'These prices are EXACT from the store catalog. Always quote this total — never recalculate.\n';
    ctx += 'NEVER change the diamond, style, band, or metal already confirmed above unless the user explicitly asks.\n';
  } else if (catalogData) {
    // Fallback: build price reference from raw catalog data (when catalog is not cached)
    ctx += '\n=== PRICE REFERENCE (use these EXACT prices for budget calculations) ===\n';
    const { optionPrices, metalVariants, caratOptions, diamondPresets } = catalogData;

    // Style prices — match both 'style' and 'styles' option_type values
    const styleOptions = (optionPrices || []).filter((p: any) => p.option_type === 'style' || p.option_type === 'styles');
    if (styleOptions.length > 0) {
      ctx += `Styles: ${styleOptions.map((s: any) => `${s.option_id}: $${s.price}`).join(', ')}\n`;
    }

    // Shank prices — match both 'shank' and 'shanks' option_type values
    const shankOptions = (optionPrices || []).filter((p: any) => p.option_type === 'shank' || p.option_type === 'shanks');
    if (shankOptions.length > 0) {
      ctx += `Shanks: ${shankOptions.map((s: any) => `${s.option_id}: $${s.price}`).join(', ')}\n`;
    }

    // Metal prices
    if (metalVariants && metalVariants.length > 0) {
      ctx += `Metals: ${metalVariants.map((m: any) => `${m.variant_name}: $${m.price}`).join(', ')}\n`;
    }

    // Carat sizes (filter only — no price adjustment)
    if (caratOptions && caratOptions.length > 0) {
      ctx += `Available carat sizes: ${caratOptions.map((c: any) => `${c.display_name} (${c.carat_value}ct)`).join(', ')}\n`;
      ctx += `Note: Carat selection only filters diamond options. The diamond price includes the full cost for that carat+color+clarity.\n`;
    }

    // Diamond price summary
    const dPrices = (diamondPresets || []).map((d: any) => d.custom_price || d.base_price).filter((p: number) => p > 0);
    if (dPrices.length > 0) ctx += `Diamond range: $${Math.min(...dPrices).toLocaleString()} – $${Math.max(...dPrices).toLocaleString()}\n`;

    // Total possible range
    const minStyle = styleOptions.length > 0 ? Math.min(...styleOptions.map((s: any) => s.price)) : 0;
    const maxStyle = styleOptions.length > 0 ? Math.max(...styleOptions.map((s: any) => s.price)) : 0;
    const minShank = shankOptions.length > 0 ? Math.min(...shankOptions.map((s: any) => s.price)) : 0;
    const maxShank = shankOptions.length > 0 ? Math.max(...shankOptions.map((s: any) => s.price)) : 0;
    const minMetal = metalVariants?.length > 0 ? Math.min(...metalVariants.map((m: any) => m.price)) : 0;
    const maxMetal = metalVariants?.length > 0 ? Math.max(...metalVariants.map((m: any) => m.price)) : 0;
    const minDiamond = dPrices.length > 0 ? Math.min(...dPrices) : 0;
    const maxDiamond = dPrices.length > 0 ? Math.max(...dPrices) : 0;
    const minTotal = minStyle + minShank + minMetal + minDiamond;
    const maxTotal = maxStyle + maxShank + maxMetal + maxDiamond;
    if (maxTotal > 0) ctx += `Total estimate range: ~$${minTotal.toLocaleString()} – $${maxTotal.toLocaleString()}\n`;

    ctx += '\nBUDGET CALCULATION FORMULA: Total = Style price + Shank price + Metal price + Diamond price\n';
    ctx += 'Carat selection is a FILTER ONLY — it does NOT add any price. The diamond price already includes the full cost for that carat weight.\n';
    ctx += 'When calculating for a budget, sum up each component and pick the BEST diamond that keeps the total within budget.\n';
    ctx += 'DEFAULT RECOMMENDATION: When no budget is specified and you suggest diamonds, target 3.0ct or higher when available.\n';
  }
  
  return ctx;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, clientId, currentConfig, pricingMode } = await req.json();
    
    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: 'Messages array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Optional API key verification for tracking (embeds work without keys)
    try {
      const unkeyResult = await verifyRequestApiKey(req);
      if (unkeyResult) {
        if (!unkeyResult.valid) {
          return new Response(
            JSON.stringify({ error: 'Invalid API key' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        console.log('Request authenticated via API key, remaining:', unkeyResult.remaining);
      }
    } catch {
      // Silently continue if Unkey is not configured
    }

    // SECURITY: Use validated secret getter - never log the value
    let LOVABLE_API_KEY: string;
    try {
      LOVABLE_API_KEY = getRequiredSecret('LOVABLE_API_KEY');
    } catch {
      return createErrorResponse(500, 'LOVABLE_API_KEY not configured', 'AI service not configured');
    }

    // Fetch client catalog if clientId is provided (with 1-hour cache)
    let catalogContext = '';
    let storeName = 'Aurezo';
    let rawCatalogData: any = null;
    if (clientId) {
      const supabaseUrl = getRequiredSecret('SUPABASE_URL');
      const supabaseKey = getRequiredSecret('SUPABASE_SERVICE_ROLE_KEY');
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Fetch company name
      const { data: clientData } = await supabase
        .from('clients')
        .select('company_name')
        .eq('id', clientId)
        .maybeSingle();
      if (clientData?.company_name) {
        storeName = clientData.company_name;
      }

      // Check catalog context cache first
      const catalogCacheKey = await buildCacheKey(clientId, 'catalog_ctx');
      const cachedCatalog = await getCached(catalogCacheKey);

      if (cachedCatalog?.response_data?.catalogContext) {
        catalogContext = cachedCatalog.response_data.catalogContext;
        console.log('Catalog context cache HIT');
      } else {
        const catalogData = await fetchClientCatalog(supabase, clientId);
        if (catalogData) {
          rawCatalogData = catalogData;
          catalogContext = buildCatalogContext(catalogData);
          console.log('Loaded catalog:', sanitizeForLogging({ 
            itemCount: catalogData.catalogItems.length, 
            trainingExampleCount: catalogData.trainingExamples.length,
            diamondPresetCount: catalogData.diamondPresets.length 
          }));
          // Cache catalog context for 1 hour
          await setCache(catalogCacheKey, clientId, 'catalog_ctx', { catalogContext }, 1);
        }
      }
    }

    // Build current config context from the live widget state (with price reference from catalog)
    const configStateContext = buildCurrentConfigContext(currentConfig || null, rawCatalogData);

    // Build dynamic pricing context based on pricing mode
    let pricingContext = '';
    if (pricingMode === 'estimates') {
      pricingContext = `\n=== PRICING & DEPOSIT MODEL ===
All prices shown are ESTIMATED STARTING PRICES — they are not final.
The customer will pay a small deposit at checkout, NOT the full ring price.
After the deposit, a jeweler from ${storeName} will contact them to discuss the design in detail and finalize exact pricing.
When mentioning prices, always say "estimated starting price" or "starting from."
Remind them that the deposit secures their design consultation.\n`;
    } else if (pricingMode === 'no_deposit') {
      pricingContext = `\n=== PRICING & NO-DEPOSIT MODEL ===
All prices shown are ESTIMATED STARTING PRICES — they are not final.
There is NO deposit and NO online checkout. NEVER mention paying a deposit or checking out.
At the end, the customer simply submits a short request form with their contact details.
A jeweler from ${storeName} will then contact them to discuss the design in detail and finalize exact pricing.
When mentioning prices, always say "estimated starting price" or "starting from."\n`;
    }

// Hardcoded fallback for ring_chat prompt (used if DB is unavailable)
const RING_CHAT_FALLBACK = `You are the {{storeName}} Ring Design Concierge — a warm, knowledgeable jewelry expert who talks like a real human friend texting.

=== STRICT TOPIC GUARDRAILS ===
You are a RING-ONLY assistant. You must NEVER discuss anything unrelated to rings, diamonds, metals, gemstones, jewelry, or the ring building process.
If a user asks about ANYTHING off-topic (weather, sports, coding, food, politics, jokes, stories, etc.), respond ONLY with:
"I'm your ring design expert - let's focus on building your perfect ring! What style are you drawn to?"
Do NOT engage in casual conversation, jokes, storytelling, or any non-ring discussion. Stay laser-focused on helping them design their ring.
NEVER use emojis in your responses. No emoji characters at all. No stars, sparkles, hearts, thumbs up, or any unicode emoji. Plain text only.

{{pricingContext}}

{{catalogContext}}

{{currentConfigState}}

=== ABSOLUTE BREVITY RULE ===
Keep EVERY response to 1-2 sentences MAX. Think texting, not email. Never list more than 2-3 options.
When the user says a diamond doesn't fit their budget, suggest ONE alternative or ask ONE follow-up question - do NOT dump the catalog.

=== CORE PERSONALITY ===
- 1-2 sentences per message. Max 3 if you're listing options.
- Use dashes (-) for short lists. CAPS for emphasis. NO asterisks (*) ever.
- NEVER include prices unless the user asks or you're doing a budget breakdown.
- Sound like a friend, not a script.
- NEVER use emojis. Plain text only.

=== CONTEXT AWARENESS ===
ALWAYS check the "CURRENT RING STATE" above. Don't re-ask about fields already set.
If everything including diamond is selected, offer checkout or ask if they want to change anything.

=== BUDGET AWARENESS ===
When the user mentions a budget:
1. Calculate the BEST combination that fits - maximize carat/quality.
2. Show a SHORT breakdown (1-2 lines) + output APPLY_CONFIG.
3. Never default to cheapest when budget allows more.

=== RANDOMIZE BEHAVIOR ===
When user says "Randomize": pick ONE complete ring AND one SPECIFIC diamond preset that EXISTS in the DIAMOND CATALOG listed above.
ONLY pick carat values that appear EXACTLY in the catalog list above — do NOT invent carat values.
You MUST include stoneType, caratRange (exact value from catalog), AND a random ring size (pick one: 5, 5.5, 6, 6.5, 7, 7.5, 8) in APPLY_CONFIG.
Output APPLY_CONFIG with ALL fields. Make it fun - surprise them with something unique!
After presenting the randomized ring, add ONE short follow-up: "Want to tweak the ring size, add engraving, or change anything?"

=== NEW RING / START OVER ===
When the user says "new ring", "start over", "fresh start", or similar, treat it as a COMPLETELY fresh start.
Begin from Style - ask what style they'd like. Do NOT skip steps even if the current state shows defaults.
Follow the full design flow one step at a time.

=== DESIGN FLOW ===
Guide: Style -> Shank -> Metal -> Shape -> Carat -> Diamond -> Size (optional) -> Engraving (optional). Ask about ONE step at a time. Skip fields already set.
After carat, ask about diamond preference (natural vs lab-grown).
Show 2-3 matching diamonds MAX, not the full catalog.
After diamond is confirmed, ask: "What ring size are you? Common sizes: 5 to 9 (or skip if unsure)."
After size (or if skipped), ask: "Want to add engraving? Up to 20 characters, or skip."
Include size and engraving in APPLY_CONFIG whenever the user provides them.

=== CHECKOUT GATING ===
NEVER offer checkout unless a diamond is selected. If user says "checkout" without a diamond, redirect to diamond selection.

=== CONFIGURATION OUTPUT ===
Output APPLY_CONFIG EVERY TIME the user picks or changes ANY field - do NOT wait until the design is complete.
Include ONLY the fields that are now known; a PARTIAL config is expected and correct. This is what live-updates the ring preview image.
Example - user just picked the style, nothing else known yet:
APPLY_CONFIG: {"style": "id"}
Example - user then picked the shank:
APPLY_CONFIG: {"shank": "id"}
When a design is complete or user says Randomize, include ALL fields:
APPLY_CONFIG: {"style": "id", "shank": "id", "metal": "name", "shape": "id", "caratRange": value, "stoneType": "natural", "size": "7", "engraving": "Forever yours"}
The "size" and "engraving" fields are OPTIONAL.
When the user picks natural or lab-grown diamond, ALWAYS include BOTH stoneType AND caratRange in APPLY_CONFIG so the widget can resolve the exact diamond:
APPLY_CONFIG: {"stoneType": "natural", "caratRange": 3}
If the user specifies a diamond color grade (e.g. "E", "F", "G") or clarity grade (e.g. "VVS1", "VS2", "SI1"), include them as "color" and "clarity" fields in APPLY_CONFIG so the widget selects the closest matching diamond:
APPLY_CONFIG: {"stoneType": "natural", "caratRange": 4.5, "color": "E", "clarity": "VVS1"}
For Randomize, stoneType and caratRange are REQUIRED.`;

// Emitting APPLY_CONFIG only at the end of the flow leaves the preview image frozen until the
// last turn. The DB-stored prompt is client-editable and may still say "only when complete", so
// append this rule last to guarantee the live per-attribute preview regardless of the stored text.
const INCREMENTAL_CONFIG_RULE = `

=== LIVE PREVIEW UPDATES (OVERRIDES ANY CONFLICTING RULE ABOVE) ===
The ring preview image ONLY refreshes when you output APPLY_CONFIG. Therefore:
Output APPLY_CONFIG in EVERY reply where the user picked, confirmed or changed ANY field.
NEVER wait for the design to be complete before the first APPLY_CONFIG.
Include ONLY the fields known so far - partial configs are REQUIRED and correct.
Example - only the style is known so far: APPLY_CONFIG: {"style": "id"}`;

// Load prompt template from DB, then inject runtime variables
const promptTemplate = await loadPrompt('ring_chat', RING_CHAT_FALLBACK);
const systemPrompt = (promptTemplate + INCREMENTAL_CONFIG_RULE)
  .replace(/\{\{storeName\}\}/g, storeName)
  .replace(/\{\{catalogContext\}\}/g, catalogContext)
  .replace(/\{\{currentConfigState\}\}/g, configStateContext)
  .replace(/\{\{pricingContext\}\}/g, pricingContext);

    console.log('Sending request to Lovable AI with messages:', messages.length);

    // Rate limit + quota gate
    if (clientId) {
      const blocked = await gateRequest(clientId, 'ring_chat', corsHeaders);
      if (blocked) return blocked;
    }

    // Cache check — only for simple early queries with NO config state
    // Disable caching when config exists (budget, lab/natural, checkout requests need fresh answers)
    const lastUserMsg = messages.filter((m: any) => m.role === 'user').pop()?.content || '';
    const hasConfigState = currentConfig && Object.keys(currentConfig).length > 0;
    const isBudgetQuery = /\$?\d+[kK]|\$\d+,?\d*|budget|under \d|within \d/i.test(lastUserMsg);
    const isStatefulQuery = /lab|natural|checkout|buy|cart|diamond|stone/i.test(lastUserMsg);
    
    if (clientId && lastUserMsg && !hasConfigState && !isBudgetQuery && !isStatefulQuery) {
      const cached = await getChatCache(clientId, 'ring_chat', lastUserMsg, messages.length);
      if (cached) {
        console.log('Chat cache HIT');
        await logUsage(clientId, 'ring_chat', 'google/gemini-2.5-flash', undefined, true);
        return new Response(JSON.stringify(cached.response_data), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const aiResult = await tryAICall({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      temperature: 0.7,
      max_tokens: 800,
    });

    if (!aiResult) {
      return new Response(
        JSON.stringify({ error: 'AI service unavailable. Please try again later.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResult.response.json();
    const assistantMessage = aiData.choices?.[0]?.message?.content || 'I apologize, I could not generate a response.';
    
    // Log usage after successful call
    if (clientId) {
      const tokens = extractTokens(aiData);
      await logUsage(clientId, 'ring_chat', aiResult.model, tokens);
    }

    console.log('AI Response:', assistantMessage);

    // Check if message contains configuration — strip ALL APPLY_CONFIG traces
    let configuration = null;
    let cleanMessage = assistantMessage;
    
    // Merge EVERY APPLY_CONFIG block in the reply (later blocks win) — the model may emit a
    // partial config per attribute plus a fuller one, and taking only the first would drop fields.
    for (const configMatch of assistantMessage.matchAll(/APPLY_CONFIG:\s*(\{[\s\S]*?\})\s*(?:\n|$)/g)) {
      try {
        configuration = { ...(configuration ?? {}), ...JSON.parse(configMatch[1]) };
      } catch (e) {
        console.error('Failed to parse APPLY_CONFIG:', e);
      }
    }
    // Always strip APPLY_CONFIG text even if parsing failed
    cleanMessage = cleanMessage.replace(/APPLY_CONFIG:\s*\{[\s\S]*?\}\s*(?:\n|$)/g, '').replace(/APPLY_CONFIG[:\s]*/gi, '').trim();

    // Strip emojis server-side as a safety net
    cleanMessage = cleanMessage.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B50}\u{2728}\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}\u{2702}-\u{27B0}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, '').trim();

    if (!cleanMessage) cleanMessage = "I've updated your ring!";

    const responsePayload = { 
      message: cleanMessage,
      configuration
    };

    // Only cache simple early queries without config state
    if (clientId && lastUserMsg && messages.length <= 3 && !hasConfigState && !isBudgetQuery && !isStatefulQuery) {
      await setChatCache(clientId, 'ring_chat', lastUserMsg, responsePayload);
    }

    return new Response(
      JSON.stringify(responsePayload),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    // SECURITY: Never leak internal error details
    console.error('Error in ring-chat function');
    await logEdgeFunctionError('ring-chat', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred processing your request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
