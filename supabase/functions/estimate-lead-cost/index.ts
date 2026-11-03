import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { gateRequest, logUsage, extractTokens } from '../_shared/ai-quota.ts';
import { tryAICall } from '../_shared/ai-router.ts';
import { logEdgeFunctionError } from '../_shared/error-logger.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Fetch live metal spot prices via Metals-API */
async function fetchMetalSpotPrices(): Promise<string> {
  const apiKey = Deno.env.get('METALS_API_KEY');
  if (!apiKey) return 'Live metal prices unavailable.';

  try {
    const res = await fetch(
      `https://metals-api.com/api/latest?access_key=${apiKey}&base=USD&symbols=XAU,XAG,XPT`
    );
    if (!res.ok) throw new Error(`Metals-API error ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error('Metals-API returned success=false');

    const metalNames: Record<string, string> = { XAU: 'Gold', XAG: 'Silver', XPT: 'Platinum' };
    const lines: string[] = [];
    for (const [symbol, name] of Object.entries(metalNames)) {
      const price = data.rates?.[`USD${symbol}`];
      if (price) {
        lines.push(`${name}: $${price.toFixed(2)}/oz`);
      }
    }
    return lines.length > 0 ? lines.join(', ') : 'Live metal prices unavailable.';
  } catch {
    return 'Live metal prices unavailable.';
  }
}

/** Fetch client's catalog data for grounding */
async function fetchClientCatalogContext(supabase: any, clientId: string): Promise<string> {
  const sections: string[] = [];

  // Metal variants
  const { data: metals } = await supabase
    .from('client_metal_variants')
    .select('variant_name, color_family, price')
    .eq('client_id', clientId)
    .limit(20);
  if (metals?.length) {
    sections.push('Client metal prices: ' + metals.map(
      (m: any) => `${m.variant_name}: $${m.price}`
    ).join(', '));
  }

  // Diamond presets (sample)
  const { data: diamonds } = await supabase
    .from('client_diamond_presets')
    .select('stone_type, carat_value, color, clarity, base_price, custom_price')
    .eq('client_id', clientId)
    .eq('is_enabled', true)
    .limit(20);
  if (diamonds?.length) {
    sections.push('Client diamond catalog (sample): ' + diamonds.map(
      (d: any) => `${d.carat_value}ct ${d.stone_type} ${d.color}/${d.clarity}: $${d.custom_price ?? d.base_price}`
    ).join(', '));
  }

  // Option prices
  const { data: options } = await supabase
    .from('client_option_prices')
    .select('option_type, option_id, price')
    .eq('client_id', clientId)
    .limit(30);
  if (options?.length) {
    sections.push('Client custom option prices: ' + options.map(
      (o: any) => `${o.option_type}/${o.option_id}: $${o.price}`
    ).join(', '));
  }

  return sections.length > 0
    ? sections.join('\n')
    : 'No client-specific catalog data available.';
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { leadId, leadSource, clientId, configuration, currency = 'USD' } = await req.json();

    if (!leadId || !leadSource || !clientId || !configuration) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build a description of the jewelry piece for the AI
    const configDesc = Object.entries(configuration)
      .filter(([k, v]) => v && typeof v !== 'object' && k !== 'ai_preview_url')
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
      .join('\n');

    // Rate limit + quota gate
    const blocked = await gateRequest(clientId, 'cost_estimate', corsHeaders);
    if (blocked) return blocked;

    // Fetch real-world grounding data in parallel
    const [metalSpotPrices, catalogContext] = await Promise.all([
      fetchMetalSpotPrices(),
      fetchClientCatalogContext(supabase, clientId),
    ]);

    const prompt = `You are a jewelry manufacturing cost estimation expert. Based on the following customer selections for a custom jewelry piece, provide a detailed cost estimate.

Source: ${leadSource.replace(/_/g, ' ')}
Currency: ${currency}

Customer Selections:
${configDesc}

REAL MARKET DATA (use these as your pricing basis — do NOT guess prices, use these anchors):
Live Metal Spot Prices: ${metalSpotPrices}

${catalogContext}

INSTRUCTIONS:
1. Use the live metal spot prices above to calculate material costs. For example, a 14K gold ring weighing ~5g uses about 2.9g of pure gold.
2. If the client has specific catalog prices for metals or diamonds, use those exact prices as the basis.
3. For labor, consider the complexity of the piece (setting type, engraving, custom work) and estimate based on industry standards ($50-$300+ depending on complexity).
4. Suggested retail should include a reasonable markup (2x-3x wholesale for fine jewelry).
5. Be specific about your calculations — show how you arrived at the numbers.
6. If information is insufficient for accurate pricing, indicate lower confidence.`;

    // Call AI via multi-provider router with structured output
    const aiResult = await tryAICall({
      model: 'google/gemini-2.5-pro',
      messages: [
        { role: "system", content: "You are a jewelry manufacturing cost estimation expert. Always provide estimates based on the REAL market data provided. Never invent prices — use the metal spot prices and catalog data given to you as anchors for your calculations. Always provide estimates in the specified currency." },
        { role: "user", content: prompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "provide_cost_estimate",
            description: "Provide a structured cost estimate for the jewelry piece",
            parameters: {
              type: "object",
              properties: {
                materialCost: { type: "number", description: "Estimated raw material cost (metals, stones) based on live spot prices and catalog data" },
                laborEstimate: { type: "number", description: "Estimated labor/craftsmanship cost based on complexity" },
                suggestedRetailLow: { type: "number", description: "Low end of suggested retail price" },
                suggestedRetailHigh: { type: "number", description: "High end of suggested retail price" },
                confidence: { type: "string", enum: ["low", "medium", "high"], description: "Confidence level of this estimate" },
                reasoning: { type: "string", description: "Brief explanation of the cost breakdown showing how live prices were used (2-3 sentences max)" },
              },
              required: ["materialCost", "laborEstimate", "suggestedRetailLow", "suggestedRetailHigh", "confidence", "reasoning"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "provide_cost_estimate" } },
    });

    if (!aiResult) {
      return new Response(JSON.stringify({ error: "AI service unavailable. Please try again later." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResult.response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      throw new Error("AI did not return structured output");
    }

    const result = typeof toolCall.function.arguments === 'string' 
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function.arguments;

    // Log AI usage
    const tokens = extractTokens(aiData);
    await logUsage(clientId, 'cost_estimate', aiResult.model, tokens);

    // Cache result in database
    await supabase.from('lead_cost_estimates').insert({
      lead_id: leadId,
      lead_source: leadSource,
      client_id: clientId,
      material_cost: result.materialCost,
      labor_estimate: result.laborEstimate,
      suggested_retail_low: result.suggestedRetailLow,
      suggested_retail_high: result.suggestedRetailHigh,
      confidence: result.confidence,
      reasoning: result.reasoning,
      currency,
    });

    return new Response(JSON.stringify(result), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("estimate-lead-cost error:", error);
    await logEdgeFunctionError('estimate-lead-cost', error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
