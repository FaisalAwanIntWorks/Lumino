import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';
import { logEdgeFunctionError } from '../_shared/error-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('METALS_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const symbols = 'XAU,XAG,XPT';
    const metalMap: Record<string, string> = { XAU: 'gold', XAG: 'silver', XPT: 'platinum' };

    // Fetch today's latest prices
    const latestRes = await fetch(
      `https://metals-api.com/api/latest?access_key=${apiKey}&base=USD&symbols=${symbols}`
    );
    if (!latestRes.ok) {
      const text = await latestRes.text();
      console.error(`Metals-API latest error ${latestRes.status}: ${text}`);
      return new Response(JSON.stringify({ error: 'Failed to fetch latest prices' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const latestData = await latestRes.json();
    if (!latestData.success) {
      console.error('Metals-API latest returned success=false:', JSON.stringify(latestData));
      return new Response(JSON.stringify({ error: 'API returned error' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch yesterday's prices for change calculation (fallback baseline only)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().split('T')[0];

    let historicalRates: Record<string, number> | null = null;
    try {
      const histRes = await fetch(
        `https://metals-api.com/api/${yStr}?access_key=${apiKey}&base=USD&symbols=${symbols}`
      );
      if (histRes.ok) {
        const histData = await histRes.json();
        if (histData.success) {
          historicalRates = histData.rates;
        }
      }
    } catch (e) {
      console.warn('Historical prices fetch failed, skipping change calc:', e);
    }

    const now = new Date().toISOString();
    const todayStartISO = `${now.split('T')[0]}T00:00:00.000Z`;

    // Service-role DB client — used to derive a reliable "TODAY" baseline from our
    // own price history (independent of the upstream historical plan) and to persist
    // each reading so the baseline keeps building over time.
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const db = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;

    // Today's change baseline for a metal:
    //   1. yesterday's close  → latest history row recorded before today (UTC)
    //   2. today's open       → earliest history row recorded today (intraday change)
    // Returns null when we have no stored history yet (cold start).
    async function getDbBaseline(metal: string): Promise<number | null> {
      if (!db) return null;
      try {
        const { data: prevClose } = await db
          .from('metal_price_history')
          .select('price_per_oz')
          .eq('metal_type', metal)
          .lt('recorded_at', todayStartISO)
          .order('recorded_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (prevClose?.price_per_oz != null) return Number(prevClose.price_per_oz);

        const { data: todayOpen } = await db
          .from('metal_price_history')
          .select('price_per_oz')
          .eq('metal_type', metal)
          .gte('recorded_at', todayStartISO)
          .order('recorded_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (todayOpen?.price_per_oz != null) return Number(todayOpen.price_per_oz);
      } catch (e) {
        console.warn(`DB baseline lookup failed for ${metal}:`, e);
      }
      return null;
    }

    const prices: Record<string, any> = {};

    for (const [symbol, metal] of Object.entries(metalMap)) {
      const rateKey = `USD${symbol}`;
      const pricePerOz = latestData.rates?.[rateKey];
      if (pricePerOz == null) continue;

      // Prefer our own stored baseline; fall back to the upstream historical rate.
      const dbBaseline = await getDbBaseline(metal);
      const baseline = dbBaseline ?? (historicalRates?.[rateKey] ?? null);

      let previousClose = pricePerOz;
      let change = 0;
      let changePercent = 0;

      if (baseline != null && baseline > 0) {
        previousClose = baseline;
        change = pricePerOz - previousClose;
        changePercent = (change / previousClose) * 100;
      }

      prices[metal] = {
        metal,
        pricePerOz: Math.round(pricePerOz * 100) / 100,
        previousClose: Math.round(previousClose * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        lastUpdated: now,
      };
    }

    if (Object.keys(prices).length === 0) {
      return new Response(JSON.stringify({ error: 'No price data returned' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Persist current readings so the TODAY baseline accumulates across the day.
    // Throttled to avoid flooding the table on every page load.
    if (db) {
      try {
        const { data: lastRow } = await db
          .from('metal_price_history')
          .select('recorded_at')
          .order('recorded_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const lastMs = lastRow?.recorded_at ? new Date(lastRow.recorded_at).getTime() : 0;
        if (Date.now() - lastMs > 5 * 60 * 1000) {
          const rows = Object.values(prices).map((p: any) => ({
            metal_type: p.metal,
            price_per_oz: p.pricePerOz,
            currency: 'USD',
            source: 'api',
            recorded_at: now,
          }));
          await db.from('metal_price_history').insert(rows);
        }
      } catch (e) {
        console.warn('Failed to persist metal price history:', e);
      }
    }

    return new Response(JSON.stringify({ prices, timestamp: now }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('fetch-metal-prices error:', error);
    await logEdgeFunctionError('fetch-metal-prices', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
