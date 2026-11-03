import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { email, reason, userAgent } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Get IP address from headers (forwarded by proxy)
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                      req.headers.get('x-real-ip') || 
                      'unknown';

    // Log the failed login attempt
    const { error: insertError } = await supabase
      .from('failed_login_attempts')
      .insert({
        email: email.toLowerCase().trim(),
        ip_address: ipAddress,
        user_agent: userAgent || req.headers.get('user-agent') || 'unknown',
        failure_reason: reason || 'unknown',
      });

    if (insertError) {
      console.error('Error logging failed login:', insertError);
      // Don't expose internal errors to client
      return new Response(
        JSON.stringify({ logged: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for potential brute force (more than 5 attempts in 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from('failed_login_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('email', email.toLowerCase().trim())
      .gte('attempted_at', fiveMinutesAgo);

    const potentialBruteForce = (count || 0) >= 5;

    if (potentialBruteForce) {
      console.warn(`Potential brute force detected for email: ${email}, attempts: ${count}`);
      
      // Log to security_events if the table exists
      try {
        await supabase
          .from('security_events')
          .insert({
            event_type: 'brute_force_attempt',
            description: `Multiple failed login attempts detected for ${email}`,
            severity: 'high',
            metadata: {
              email: email.toLowerCase(),
              attempt_count: count,
              ip_address: ipAddress,
            },
          });
      } catch {
        // Ignore if security_events table doesn't exist
      }
    }

    return new Response(
      JSON.stringify({ 
        logged: true, 
        potentialBruteForce,
        attemptCount: count || 1,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in log-failed-login:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
