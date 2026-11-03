import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { logEdgeFunctionError } from '../_shared/error-logger.ts';
import { normalizeTierConfig, tierBonusFor, effectiveLineRate } from '../_shared/metal-offer-tiers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const METAL_SYMBOLS: Record<string, string> = {
  gold: 'XAU',
  silver: 'XAG',
  platinum: 'XPT',
};

const TROY_OZ_TO_GRAMS = 31.1035;

// Purity factors per metal: how much pure metal is in the alloy.
// Namespaced by metal to avoid collisions (e.g. "999" exists for both silver and platinum).
const PURITY_FACTORS: Record<string, Record<string, number>> = {
  gold: {
    '8K': 8 / 24, '9K': 9 / 24, '10K': 10 / 24, '12K': 12 / 24,
    '14K': 14 / 24, '15K': 15 / 24, '16K': 16 / 24, '18K': 18 / 24,
    '20K': 20 / 24, '21K': 21 / 24, '22K': 22 / 24, '24K': 24 / 24,
  },
  silver: {
    '800': 0.800, '835': 0.835, '900': 0.900, '925': 0.925,
    '950': 0.950, '958': 0.958, '999': 0.999,
  },
  platinum: {
    '850': 0.850, '900': 0.900, '950': 0.950, '999': 0.999,
  },
};

// ── Tier C: in-memory spot-price cache (per-isolate, 60s TTL) ──────────────
const SPOT_CACHE_TTL_MS = 60_000;
const QUOTE_VALID_MS = 60_000;
const spotCache = new Map<string, { price: number; fetchedAt: number }>();

// Fixed refining/assay fee per lot (USD-equivalent). Charged once per submission.
const REFINING_FEE_FLAT = 25;
// Small-lot adjustment: tiny lots (< 7g total) carry disproportionate handling cost.
const SMALL_LOT_THRESHOLD_GRAMS = 7;
const SMALL_LOT_BUY_PENALTY = 0.95;
const MAX_ITEMS = 10;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function getSpot(cur: string, symbol: string, apiKey: string): Promise<{ price: number; hit: boolean }> {
  const cacheKey = `${cur}:${symbol}`;
  const cached = spotCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < SPOT_CACHE_TTL_MS) return { price: cached.price, hit: true };
  const priceRes = await fetch(`https://metals-api.com/api/latest?access_key=${apiKey}&base=${cur}&symbols=${symbol}`);
  if (!priceRes.ok) {
    console.error(`Metals-API error: ${priceRes.status} ${await priceRes.text()}`);
    throw new HttpError(502, 'Failed to fetch spot price');
  }
  const priceData = await priceRes.json();
  if (!priceData.success) {
    console.error('Metals-API returned success=false:', JSON.stringify(priceData));
    throw new HttpError(502, 'Failed to fetch spot price');
  }
  const price = priceData.rates?.[`${cur}${symbol}`];
  if (!price) throw new HttpError(502, 'No rate data for requested metal');
  spotCache.set(cacheKey, { price, fetchedAt: Date.now() });
  return { price, hit: false };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { clientId, metal, karat, weightGrams, currency, items: rawItems } = body ?? {};

    if (!clientId || (!metal && !Array.isArray(rawItems))) {
      return json({ error: 'clientId and metal are required' }, 400);
    }

    // Normalise into lines. Single-item requests behave exactly as before.
    type Line = { metal: string; karat: string | null; weightGrams: number | null };
    let lines: Line[];
    const multi = Array.isArray(rawItems) && rawItems.length > 0;
    if (multi) {
      if (rawItems.length > MAX_ITEMS) return json({ error: `Up to ${MAX_ITEMS} pieces per submission` }, 400);
      lines = rawItems.map((it: any) => ({
        metal: String(it?.metal ?? '').toLowerCase(),
        karat: it?.karat ? String(it.karat) : null,
        weightGrams: Number(it?.weightGrams),
      }));
      for (const l of lines) {
        if (!l.karat || !(Number.isFinite(l.weightGrams) && (l.weightGrams as number) > 0 && (l.weightGrams as number) < 100000)) {
          return json({ error: 'Each piece needs a karat and a weight' }, 400);
        }
      }
    } else {
      lines = [{ metal: String(metal).toLowerCase(), karat: karat ?? null, weightGrams: weightGrams ?? null }];
    }

    for (const l of lines) {
      if (!METAL_SYMBOLS[l.metal]) return json({ error: `Unknown metal: ${l.metal}` }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, serviceKey);

    const { data: config, error: configErr } = await sb
      .from('client_metal_buying_config')
      .select('metals_config, refinery_sell_pct, volume_tier_config')
      .eq('client_id', clientId)
      .maybeSingle();

    if (configErr || !config) return json({ error: 'Client config not found' }, 404);

    const tierCfg = normalizeTierConfig((config as any).volume_tier_config);
    const metalsCfg = (config.metals_config as Record<string, any>) ?? {};
    const baseRefinerySellPct = Number(config.refinery_sell_pct ?? 99);

    const apiKey = Deno.env.get('METALS_API_KEY');
    if (!apiKey) return json({ error: 'Metal price API not configured' }, 500);
    const cur = currency || 'USD';

    // Resolve per-line config + spot.
    const resolved = [];
    for (const l of lines) {
      const metalConfig = metalsCfg[l.metal];
      if (!metalConfig?.enabled) return json({ error: `${l.metal} is not enabled for this client` }, 400);
      if (l.weightGrams && l.weightGrams > 0 && !l.karat) {
        return json({ error: 'Karat/purity is required to calculate an offer for a known weight.' }, 400);
      }
      let buyPct = 75;
      let competitorPct = 50;
      if (l.karat && metalConfig.karats?.[l.karat]) {
        buyPct = metalConfig.karats[l.karat].buy_pct ?? 75;
        competitorPct = metalConfig.karats[l.karat].competitor_pct ?? 50;
      } else if (multi) {
        return json({ error: `${l.karat} is not offered for ${l.metal}` }, 400);
      }
      const purityFactor = l.karat ? (PURITY_FACTORS[l.metal]?.[l.karat] ?? 1) : 1;

      // Per-metal refinery yield with legacy fallback (unchanged).
      const LEGACY_FALLBACK: Record<string, number> = {
        gold: baseRefinerySellPct,
        silver: Math.max(80, Math.min(98, baseRefinerySellPct - 7)),
        platinum: Math.max(80, Math.min(98, baseRefinerySellPct - 4)),
      };
      const perMetalRate = Number(metalConfig.refinery_sell_pct);
      const refinerySellPct = Number.isFinite(perMetalRate) && perMetalRate > 0
        ? perMetalRate
        : (LEGACY_FALLBACK[l.metal] ?? baseRefinerySellPct);

      const spot = await getSpot(cur, METAL_SYMBOLS[l.metal], apiKey);
      resolved.push({ ...l, buyPct, competitorPct, purityFactor, refinerySellPct, spotPricePerOz: spot.price, spotCacheHit: spot.hit });
    }

    // Whole submission decides the tier.
    const totalGrams = resolved.reduce((s, l) => s + (l.weightGrams && l.weightGrams > 0 ? l.weightGrams : 0), 0);
    const total24kGrams = resolved
      .filter((l) => l.metal === 'gold' && l.karat === '24K')
      .reduce((s, l) => s + (l.weightGrams && l.weightGrams > 0 ? l.weightGrams : 0), 0);
    const isSmallLot = totalGrams > 0 && totalGrams < SMALL_LOT_THRESHOLD_GRAMS;

    let ourOffer = 0, competitorOffer = 0, refineryPayout = 0;
    const lineResults = resolved.map((l) => {
      const rate = effectiveLineRate(
        { metal: l.metal, karat: l.karat ?? '', baseBuyPct: l.buyPct, refinerySellPct: l.refinerySellPct },
        totalGrams, total24kGrams, tierCfg,
      );
      const spotPerGram = l.spotPricePerOz / TROY_OZ_TO_GRAMS;
      const out: Record<string, any> = {
        metal: l.metal, karat: l.karat, weightGrams: l.weightGrams,
        baseBuyPct: l.buyPct, buyPct: r2(rate.buyPct), competitorPct: l.competitorPct,
        bonusApplied: r2(rate.bonusApplied), bullionApplied: rate.bullionApplied, capped: rate.capped,
        refinerySellPct: l.refinerySellPct, spotPricePerOz: l.spotPricePerOz,
        purityFactor: Math.round(l.purityFactor * 10000) / 10000,
        ratePerGram: r2(spotPerGram * l.purityFactor * (rate.buyPct / 100)),
      };
      if (l.weightGrams && l.weightGrams > 0) {
        const adjusted = isSmallLot ? rate.buyPct * SMALL_LOT_BUY_PENALTY : rate.buyPct;
        const pureValue = l.weightGrams * spotPerGram * l.purityFactor;
        const lineOffer = Math.max(0, pureValue * (adjusted / 100));
        const lineComp = Math.max(0, pureValue * (l.competitorPct / 100));
        ourOffer += lineOffer;
        competitorOffer += lineComp;
        refineryPayout += pureValue * (l.refinerySellPct / 100);
        out.adjustedBuyPct = r2(adjusted);
        out.offer = r2(lineOffer);
        out.competitorOffer = r2(lineComp);
      }
      return out;
    });

    const first = lineResults[0];
    const now = new Date();
    const { bonus: tierBonus, tierIndex } = tierBonusFor(totalGrams, tierCfg);

    // Top-level fields keep their original meaning for single-piece quotes.
    const result: Record<string, any> = {
      spotPricePerOz: first.spotPricePerOz,
      spotPricePerGram: r2(first.spotPricePerOz / TROY_OZ_TO_GRAMS),
      buyPct: first.buyPct,
      competitorPct: first.competitorPct,
      refinerySellPct: first.refinerySellPct,
      refiningFeeFlat: REFINING_FEE_FLAT,
      purityFactor: first.purityFactor,
      spotPriceDate: now.toISOString().split('T')[0],
      validUntil: new Date(now.getTime() + QUOTE_VALID_MS).toISOString(),
      spotCacheHit: resolved.every((l) => l.spotCacheHit),
      ourRatePerGram: first.ratePerGram,
      competitorRatePerGram: r2((first.spotPricePerOz / TROY_OZ_TO_GRAMS) * first.purityFactor * (first.competitorPct / 100)),
    };

    if (totalGrams > 0) {
      result.ourOffer = r2(ourOffer);
      result.competitorOffer = r2(competitorOffer);
      result.estimatedProfit = r2(Math.max(0, refineryPayout - ourOffer - REFINING_FEE_FLAT));
      result.smallLotApplied = isSmallLot;
      result.adjustedBuyPct = first.adjustedBuyPct;
      result.totalWeightGrams = r2(totalGrams);
    }

    if (tierCfg) {
      result.volumeTier = {
        tierIndex,
        bonusPct: tierBonus,
        bullionApplied: lineResults.some((l) => l.bullionApplied),
        capped: lineResults.some((l) => l.capped),
      };
    }
    if (multi) result.items = lineResults;

    return json(result);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error('calculate-metal-offer error:', error);
    await logEdgeFunctionError('calculate-metal-offer', error);
    return json({ error: (error as Error)?.message ?? 'Unknown error' }, 500);
  }
});
