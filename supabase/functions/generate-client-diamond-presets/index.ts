import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Shape display names
const SHAPE_NAMES: Record<string, string> = {
  round: 'Round', princess: 'Princess', oval: 'Oval', cushion: 'Cushion',
  emerald: 'Emerald', pear: 'Pear', marquise: 'Marquise', radiant: 'Radiant',
  asscher: 'Asscher', heart: 'Heart',
};

// Pool shape tokens (uppercase) → wizard shape ids
const POOL_SHAPE_MAP: Record<string, string> = {
  'ROUND': 'round',
  'OVAL': 'oval',
  'PEAR': 'pear',
  'EMERALD': 'emerald',
  'CUSHION': 'cushion',
  'CUSHION BRILLIANT': 'cushion',
  'CUSHION MODIFIED': 'cushion',
  'PRINCESS': 'princess',
  'RADIANT': 'radiant',
  'MARQUISE': 'marquise',
  'ASSCHER': 'asscher',
  'HEART': 'heart',
};

function normalizeShape(v: string): string {
  return POOL_SHAPE_MAP[v.trim().toUpperCase()] ?? v.trim().toLowerCase();
}

function getShapeName(id: string): string {
  return SHAPE_NAMES[id] || id.charAt(0).toUpperCase() + id.slice(1);
}

// Apply rounding
function applyRounding(price: number, rounding: string): number {
  if (rounding === 'none' || !rounding) return price;
  const r = parseInt(rounding);
  if (isNaN(r)) return price;
  return Math.round(price / r) * r;
}

// Generate title from template
function generateTitle(template: string, values: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(values)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return result;
}

// Generate carat range label
function getCaratRange(carat: number): string {
  if (carat < 1.00) return '0.50-0.99';
  if (carat < 1.50) return '1.00-1.49';
  if (carat < 2.00) return '1.50-1.99';
  if (carat < 2.50) return '2.00-2.49';
  if (carat < 3.00) return '2.50-2.99';
  if (carat < 3.50) return '3.00-3.49';
  if (carat < 4.00) return '3.50-3.99';
  if (carat < 4.50) return '4.00-4.49';
  if (carat < 5.00) return '4.50-4.99';
  return '5.00+';
}

// Ring OS Master Cheat Sheet (May 2026) — fallback multipliers used when wizardConfig
// doesn't carry per-stone-type maps (older saved states).
const FALLBACK_CLARITY_NATURAL: Record<string, number> = {
  FL: 1.95, IF: 1.75, VVS1: 1.45, VVS2: 1.32, VS1: 1.15, VS2: 1.00,
  SI1: 0.82, SI2: 0.65, I1: 0.45, I2: 0.30, I3: 0.20,
};
const FALLBACK_CLARITY_LAB: Record<string, number> = {
  FL: 1.95, IF: 1.75, VVS1: 1.15, VVS2: 1.08, VS1: 1.04, VS2: 1.00,
  SI1: 0.88, SI2: 0.78, I1: 0.60, I2: 0.45, I3: 0.30,
};
const FALLBACK_COLOR_NATURAL: Record<string, number> = {
  D: 1.35, E: 1.24, F: 1.14, G: 1.00, H: 0.90, I: 0.78, J: 0.66, K: 0.55,
  L: 0.48, M: 0.42,
};
const FALLBACK_COLOR_LAB: Record<string, number> = {
  D: 1.15, E: 1.10, F: 1.05, G: 1.00, H: 0.94, I: 0.85, J: 0.75, K: 0.65,
  L: 0.58, M: 0.52,
};
const FALLBACK_SHAPE_DISCOUNTS: Record<string, number> = {
  round: 1.00, oval: 0.83, pear: 0.78, cushion: 0.75, princess: 0.70,
  radiant: 0.70, marquise: 0.70, emerald: 0.68, asscher: 0.62, heart: 0.75,
};

// Get markup for a carat value from tiers
function getMarkup(carat: number, tiers: any[]): number {
  for (const tier of tiers) {
    const from = tier.caratFrom ?? 0;
    const to = tier.caratTo;
    if (carat >= from && (to === null || carat <= to)) {
      return tier.markup ?? 0;
    }
  }
  return 0;
}

// Get purchasing price for a carat value from tiers
function getPurchasingPrice(carat: number, tiers: any[]): number {
  for (const tier of tiers) {
    const from = tier.caratFrom ?? 0;
    const to = tier.caratTo;
    if (carat >= from && (to === null || carat <= to)) {
      return tier.purchasingPrice ?? 0;
    }
  }
  return 0;
}

// Generate discrete carat values from a range
function generateCaratValues(min: number, max: number): number[] {
  const values: number[] = [];
  // Standard carat points
  const standardCarats = [
    0.50, 1.00, 1.50, 2.00, 2.50, 3.00, 3.50, 4.00, 4.50, 5.00,
  ];
  for (const c of standardCarats) {
    if (c >= min && c <= max) values.push(c);
  }
  return values;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { clientId, wizardConfig } = body;

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: 'Client ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authorization check
    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    const isAgencyAdmin = roleData?.role === 'agency_admin';

    if (!isAgencyAdmin) {
      const { data: clientData } = await supabaseAdmin
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('user_id', user.id)
        .single();

      if (!clientData) {
        const { data: staffData } = await supabaseAdmin
          .from('staff_members')
          .select('permissions')
          .eq('user_id', user.id)
          .eq('client_id', clientId)
          .single();

        const catalogAccess = staffData?.permissions?.catalog_access;
        if (!staffData || (catalogAccess !== 'edit' && catalogAccess !== true)) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    if (!wizardConfig) {
      return new Response(
        JSON.stringify({ error: 'Wizard configuration is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Keep the edge function lightweight: the large catalogue build now runs
    // inside the database, avoiding edge CPU limits while preserving auth checks.
    const { data: generationResult, error: generationError } = await supabaseClient.rpc(
      'generate_client_diamond_presets_db' as any,
      {
        p_client_id: clientId,
        p_wizard_config: wizardConfig,
      }
    );

    if (generationError) {
      console.error('Database generation error:', generationError);
      return new Response(
        JSON.stringify({ error: generationError.message || 'Failed to generate diamond presets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(generationResult ?? { success: true, presetsCount: 0, source: 'database' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

    const { diamondType, shapes, grading, pricing, productSettings } = wizardConfig;

    // Delete existing diamond presets for this client
    await supabaseAdmin
      .from('client_diamond_presets')
      .delete()
      .eq('client_id', clientId);

    // If no types enabled or no shapes selected, we're done
    if ((!diamondType?.naturalEnabled && !diamondType?.labGrownEnabled) || !shapes?.selectedShapes?.length) {
      return new Response(
        JSON.stringify({ success: true, presetsCount: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract configuration
    const selectedShapes: string[] = shapes.selectedShapes || [];
    const colors: string[] = grading?.colors || [];
    const clarities: string[] = grading?.clarities || [];
    const cutGrades: string[] = grading?.cutGrades || ['Excellent'];
    const polishGrades: string[] = grading?.polish || ['Excellent'];
    const symmetryGrades: string[] = grading?.symmetry || ['Excellent'];
    const fluorescenceLevels: string[] = grading?.fluorescence || ['None'];
    const caratRange: [number, number] = grading?.caratRange || [0.50, 5.00];
    const currency = pricing?.currency || 'USD';
    const pricingMethod = pricing?.pricingMethod || 'percentage';
    const priceRounding = pricing?.priceRounding || 'none';
    const titleTemplate = productSettings?.titleTemplate || '{carat}ct {shape} Diamond - {clarity}';
    const skuTemplate = productSettings?.skuTemplate || 'DIA-{shape}-{clarity}-{carat}';
    const certifications: string[] = diamondType?.certifications || ['GIA'];

    // Cheat-sheet multipliers from wizard (jeweler-editable) with fallback to Ring OS defaults
    const clarityNat = pricing?.clarityMultipliersNatural || FALLBACK_CLARITY_NATURAL;
    const clarityLab = pricing?.clarityMultipliersLab || FALLBACK_CLARITY_LAB;
    const colorNat = pricing?.colorMultipliersNatural || FALLBACK_COLOR_NATURAL;
    const colorLab = pricing?.colorMultipliersLab || FALLBACK_COLOR_LAB;
    const shapeDiscounts = pricing?.shapeDiscounts || FALLBACK_SHAPE_DISCOUNTS;

    // Generate carat values from range
    const caratValues = generateCaratValues(caratRange[0], caratRange[1]);

    // Build presets
    const presets: any[] = [];
    const stoneTypes: string[] = [];
    if (diamondType.naturalEnabled) stoneTypes.push('natural');
    if (diamondType.labGrownEnabled) stoneTypes.push('lab');

    // ----- Pre-fetch pool rows. We materialize ONE preset per individual pool row
    // so that e.g. 18 separate 1.50ct stones become 18 distinct presets, each
    // priced from its own `price` column + jeweler markup.
    // Group key: `stoneType|shape|color|clarity`. Value: array of {carat, price}.
    const poolRowsByGroup = new Map<string, Array<{ carat: number; price: number }>>();

    try {
      const caratMin = caratRange[0];
      const caratMax = caratRange[1];
      const colorTargets = Array.from(new Set(colors.map((c) => c.toUpperCase())));
      const clarityTargets = Array.from(new Set(clarities.map((c) => c.toUpperCase())));

      const QUALITY_TO_CODES: Record<string, string[]> = {
        'Excellent': ['EX'], 'Very Good': ['VG'], 'Good': ['G'], 'Fair': ['F'], 'Poor': ['P'],
      };
      const toCodes = (labels: string[]) => Array.from(new Set(
        labels.flatMap((l) => QUALITY_TO_CODES[l] ?? [l.toUpperCase()])
      ));
      const cutCodes = toCodes(cutGrades);
      const polCodes = toCodes(polishGrades);
      const symmCodes = toCodes(symmetryGrades);

      const measMin = grading?.measurementsMinLength;
      const measMax = grading?.measurementsMaxLength;

      const FLUOR_TO_CODES: Record<string, string[]> = {
        'None': ['NON', 'NONE'],
        'Faint': ['FNT'],
        'Very Slight': ['VSL'],
        'Slight': ['SL'],
        'Medium': ['MED'],
        'Strong': ['STG', 'STR'],
        'Very Strong': ['VST'],
      };
      const fluorCodes = Array.from(new Set(
        fluorescenceLevels.flatMap((l) => FLUOR_TO_CODES[l] ?? [l.toUpperCase()])
      ));
      const labTargets: string[] = Array.from(new Set(
        (grading?.labs ?? []).map((l: string) => String(l).trim().toUpperCase())
      ));

      const PAGE = 1000;
      let from = 0;
      while (true) {
        let q = supabaseAdmin
          .from('diamond_inventory_pool')
          .select('shape, col, clar, carats, price, lg, cut, pol, symm, length, flo, lab')
          .gte('carats', caratMin)
          .lte('carats', caratMax)
          .in('col', colorTargets)
          .in('clar', clarityTargets);

        const wantsRound = selectedShapes.includes('round');
        if (cutCodes.length > 0 && wantsRound) {
          q = q.or(`cut.in.(${cutCodes.join(',')}),cut.eq.-`);
        }
        if (polCodes.length > 0) q = q.in('pol', polCodes);
        if (symmCodes.length > 0) q = q.in('symm', symmCodes);
        if (fluorCodes.length > 0) q = q.in('flo', fluorCodes);
        if (labTargets.length > 0) q = q.in('lab', labTargets);
        if (typeof measMin === 'number' && !isNaN(measMin)) q = q.gte('length', measMin);
        if (typeof measMax === 'number' && !isNaN(measMax)) q = q.lte('length', measMax);

        type PoolLookup = { data: Array<Record<string, any>> | null; error: { message: string } | null };
        const poolRes: PoolLookup = (await q.range(from, from + PAGE - 1)) as unknown as PoolLookup;
        const poolErr = poolRes.error;
        if (poolErr != null) {
          console.warn('[generate-client-diamond-presets] pool lookup failed:', (poolErr as { message: string }).message);
          break;
        }
        const poolRows: Array<Record<string, any>> = poolRes.data ?? [];
        if (poolRows.length === 0) break;
        for (const r of poolRows) {
          if (!r.shape || !r.col || !r.clar || r.carats == null) continue;
          const shapeId = normalizeShape(String(r.shape));
          const exact = Number(Number(r.carats).toFixed(2));
          const stoneType = String(r.lg ?? '').toLowerCase() === 'natural' ? 'natural' : 'lab';
          const groupKey = `${stoneType}|${shapeId}|${String(r.col).toUpperCase()}|${String(r.clar).toUpperCase()}`;
          const priceNum = r.price != null && !isNaN(Number(r.price)) ? Number(r.price) : 0;
          const arr = poolRowsByGroup.get(groupKey) ?? [];
          arr.push({ carat: exact, price: priceNum });
          poolRowsByGroup.set(groupKey, arr);
        }
        if (poolRows.length < PAGE) break;
        from += PAGE;
      }
    } catch (e) {
      console.warn('[generate-client-diamond-presets] pool prefetch skipped:', (e as Error)?.message);
    }

    for (const stoneType of stoneTypes) {
      const markupTiers = stoneType === 'natural'
        ? (pricing?.naturalMarkupTiers || [])
        : (pricing?.labMarkupTiers || []);
      const clarityMap = stoneType === 'natural' ? clarityNat : clarityLab;
      const colorMap = stoneType === 'natural' ? colorNat : colorLab;

      for (const shapeId of selectedShapes) {
        const shapeName = getShapeName(shapeId);
        const isRound = shapeId === 'round';
        const shapeMult = shapeDiscounts[shapeId] ?? 1.0;

        // Determine applicable cut grades for metadata
        const applicableCutGrades = isRound ? cutGrades : [];

        for (const color of colors) {
          for (const clarity of clarities) {
            const groupKey = `${stoneType}|${shapeId}|${color.toUpperCase()}|${clarity.toUpperCase()}`;
            const poolRows = poolRowsByGroup.get(groupKey) ?? [];

            // Build per-row entries. When pool has matches, emit ONE preset per
            // individual pool stone (so 18 separate 1.50ct stones → 18 presets,
            // each priced from its own pool `price` + markup). When pool empty,
            // fall back to standard discrete carats with cheat-sheet pricing.
            type RowEntry = { carat: number; basePrice: number; fromPool: boolean };
            const entries: RowEntry[] = poolRows.length > 0
              ? poolRows
                  .filter((r) => r.price > 0)
                  .map((r) => ({ carat: r.carat, basePrice: r.price, fromPool: true }))
              : caratValues.map((c) => {
                  const wholesale = getPurchasingPrice(c, markupTiers);
                  const clarityMult = clarityMap[clarity] ?? 1.0;
                  const colorMult = colorMap[color] ?? 1.0;
                  return { carat: c, basePrice: wholesale * clarityMult * colorMult * shapeMult, fromPool: false };
                });

            for (const entry of entries) {
              const { carat, basePrice, fromPool } = entry;

              let markupPercentage = 0;
              let finalPrice = basePrice;
              if (pricingMethod === 'percentage') {
                markupPercentage = getMarkup(carat, markupTiers);
                finalPrice = basePrice * (1 + markupPercentage / 100);
              } else if (pricingMethod === 'fixed_margin') {
                const margin = getMarkup(carat, markupTiers);
                finalPrice = basePrice + (margin * carat);
                markupPercentage = basePrice > 0 ? ((finalPrice - basePrice) / basePrice) * 100 : 0;
              }

              const templateValues = {
                carat: carat.toFixed(2),
                shape: shapeName,
                color,
                clarity,
                cut: applicableCutGrades[0] || '',
                origin: stoneType === 'natural' ? 'Natural' : 'Lab-Grown',
                lab: certifications[0] || 'GIA',
                report_number: '',
              };

              const productTitle = generateTitle(titleTemplate, templateValues);
              const sku = generateTitle(skuTemplate, templateValues).toUpperCase().replace(/\s+/g, '-');

              presets.push({
                client_id: clientId,
                stone_type: stoneType,
                shape_id: shapeId,
                carat_range: getCaratRange(carat),
                carat_value: carat,
                color,
                clarity,
                base_price: Math.round(basePrice),
                custom_price: Math.round(finalPrice),
                is_enabled: true,
                cut_grade: applicableCutGrades.length > 0 ? applicableCutGrades.join(', ') : null,
                polish: polishGrades.length > 0 ? polishGrades.join(', ') : null,
                symmetry: symmetryGrades.length > 0 ? symmetryGrades.join(', ') : null,
                fluorescence: fluorescenceLevels.length > 0 ? fluorescenceLevels.join(', ') : null,
                certification: certifications[0] || null,
                origin: stoneType,
                sku,
                product_title: productTitle,
                currency,
                markup_percentage: markupPercentage > 0 ? markupPercentage : null,
                compare_at_price: null,
                pool_stock_count: fromPool ? 1 : 0,
              });
            }
          }
        }
      }
    }

    // Insert in batches, running multiple batches in parallel to stay under
    // the edge function CPU time limit when the catalog is large (20K+ rows).
    const BATCH_SIZE = 1000;
    const CONCURRENCY = 5;

    const batches: any[][] = [];
    for (let i = 0; i < presets.length; i += BATCH_SIZE) {
      batches.push(presets.slice(i, i + BATCH_SIZE));
    }

    const runInserts = async () => {
      for (let i = 0; i < batches.length; i += CONCURRENCY) {
        const slice = batches.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          slice.map((batch) =>
            supabaseAdmin.from('client_diamond_presets').insert(batch)
          )
        );
        for (const { error } of results) {
          if (error) console.error('Batch insert error:', error.message);
        }
      }

      await supabaseAdmin.from('client_activity_logs').insert({
        client_id: clientId,
        user_id: user!.id,
        action_type: 'diamond_presets_generated',
        action_category: 'catalog',
        description: `Generated ${presets.length} diamond presets (${selectedShapes.length} shapes, ${colors.length} colors, ${clarities.length} clarities)`,
        metadata: {
          stone_types: stoneTypes,
          shapes_count: selectedShapes.length,
          presets_count: presets.length,
          pricing_method: pricingMethod,
          currency,
        },
      });
    };

    // For large catalogs, run inserts in the background so we don't hit the
    // edge function CPU/wall-clock cap. Client gets success immediately;
    // presets stream into the table over the next few seconds.
    const LARGE_THRESHOLD = 2000;
    const edgeRuntime = (globalThis as any).EdgeRuntime;
    if (presets.length > LARGE_THRESHOLD && typeof edgeRuntime?.waitUntil === 'function') {
      edgeRuntime.waitUntil(runInserts());
      return new Response(
        JSON.stringify({ success: true, presetsCount: presets.length, background: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    await runInserts();

    return new Response(
      JSON.stringify({ success: true, presetsCount: presets.length }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-client-diamond-presets:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
