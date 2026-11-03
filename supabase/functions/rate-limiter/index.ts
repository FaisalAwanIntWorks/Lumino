import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limit configurations — AUTH & UTILITY flows only
// AI features are handled server-side by gateRequest() in _shared/ai-quota.ts
const RATE_LIMITS: Record<string, { requests: number; windowSeconds: number }> = {
  'login': { requests: 5, windowSeconds: 300 },       // 5 attempts per 5 minutes
  'password_reset': { requests: 3, windowSeconds: 600 }, // 3 attempts per 10 minutes
  'send_email': { requests: 10, windowSeconds: 60 },   // 10 emails per minute
  'gdpr': { requests: 5, windowSeconds: 3600 },        // 5 GDPR requests per hour
  'catalog_generate': { requests: 10, windowSeconds: 60 }, // 10 generations per minute
  'shopify': { requests: 20, windowSeconds: 60 },      // 20 Shopify ops per minute
  'default': { requests: 60, windowSeconds: 60 },      // 60 requests per minute
};

// Sanitize identifier to prevent injection
function sanitizeIdentifier(input: string): string {
  if (!input || typeof input !== 'string') return 'anonymous';
  // Remove any SQL-special characters, limit length
  return input.replace(/[^a-zA-Z0-9:_@.-]/g, '').slice(0, 128);
}

// Sanitize endpoint name
function sanitizeEndpoint(input: string): string {
  if (!input || typeof input !== 'string') return 'default';
  // Only allow alphanumeric and underscores
  const cleaned = input.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 50);
  return RATE_LIMITS[cleaned] ? cleaned : 'default';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const identifier = sanitizeIdentifier(body.identifier);
    const endpoint = sanitizeEndpoint(body.endpoint);

    if (!identifier) {
      return new Response(
        JSON.stringify({ allowed: false, error: 'Invalid request' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get rate limit config for this endpoint
    const config = RATE_LIMITS[endpoint] || RATE_LIMITS.default;
    const windowStart = new Date(Date.now() - config.windowSeconds * 1000);

    // Check current request count within window
    const { data: existingLimit, error: fetchError } = await supabase
      .from('rate_limits')
      .select('id, request_count')
      .eq('identifier', identifier)
      .eq('endpoint', endpoint)
      .gte('window_start', windowStart.toISOString())
      .order('window_start', { ascending: false })
      .limit(1)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // Log error but fail open
      console.error('Rate limit fetch error:', fetchError.message);
      return new Response(
        JSON.stringify({ allowed: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If we have an active window, check and increment counter
    if (existingLimit) {
      if (existingLimit.request_count >= config.requests) {
        // Rate limit exceeded - return 429 with retry info
        return new Response(
          JSON.stringify({
            allowed: false,
            retryAfter: config.windowSeconds,
            remaining: 0,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 429 }
        );
      }

      // Increment count
      await supabase
        .from('rate_limits')
        .update({ request_count: existingLimit.request_count + 1 })
        .eq('id', existingLimit.id);

      return new Response(
        JSON.stringify({
          allowed: true,
          remaining: config.requests - (existingLimit.request_count + 1),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create new rate limit window
    const { error: insertError } = await supabase
      .from('rate_limits')
      .insert({
        identifier,
        endpoint,
        request_count: 1,
        window_start: new Date().toISOString(),
      });

    if (insertError) {
      console.error('Rate limit insert error:', insertError.message);
    }

    // Cleanup old records (async, don't wait)
    supabase.rpc('cleanup_old_rate_limits').then(() => {});

    return new Response(
      JSON.stringify({
        allowed: true,
        remaining: config.requests - 1,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    // Generic error - never leak internal details
    console.error('Rate limiter internal error');
    return new Response(
      JSON.stringify({ allowed: true }), // Fail open
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
