import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Configuration
const MAX_FAILED_ATTEMPTS = 10; // Lock after 10 failed attempts
const LOCKOUT_WINDOW_MINUTES = 30; // Check attempts within last 30 minutes
const LOCKOUT_DURATION_MINUTES = 30; // Account locked for 30 minutes

interface LockoutCheckRequest {
  email: string;
  action: 'check' | 'increment' | 'unlock';
}

interface LockoutStatus {
  locked: boolean;
  remainingAttempts: number;
  lockedUntil?: string;
  requiresEmailUnlock?: boolean;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { email, action }: LockoutCheckRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const now = new Date();
    const windowStart = new Date(now.getTime() - LOCKOUT_WINDOW_MINUTES * 60 * 1000);

    if (action === 'check' || action === 'increment') {
      // Check if account is explicitly locked
      const { data: lockData } = await supabase
        .from('account_lockouts')
        .select('*')
        .eq('email', normalizedEmail)
        .gt('locked_until', now.toISOString())
        .maybeSingle();

      if (lockData) {
        const status: LockoutStatus = {
          locked: true,
          remainingAttempts: 0,
          lockedUntil: lockData.locked_until,
          requiresEmailUnlock: lockData.requires_email_unlock,
        };
        return new Response(
          JSON.stringify(status),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Count recent failed attempts
      const { count } = await supabase
        .from('failed_login_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('email', normalizedEmail)
        .gte('attempted_at', windowStart.toISOString());

      const failedAttempts = count || 0;

      if (action === 'increment') {
        // If this is the 10th attempt, lock the account
        if (failedAttempts >= MAX_FAILED_ATTEMPTS - 1) {
          const lockedUntil = new Date(now.getTime() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
          
          // Create or update lockout record
          await supabase
            .from('account_lockouts')
            .upsert({
              email: normalizedEmail,
              locked_until: lockedUntil.toISOString(),
              requires_email_unlock: true,
              failed_attempts: failedAttempts + 1,
              created_at: now.toISOString(),
              updated_at: now.toISOString(),
            }, { onConflict: 'email' });

          // Log security event
          await supabase
            .from('security_events')
            .insert({
              event_type: 'account_locked',
              description: `Account locked after ${MAX_FAILED_ATTEMPTS} failed login attempts`,
              severity: 'high',
              metadata: {
                email: normalizedEmail,
                failed_attempts: failedAttempts + 1,
                locked_until: lockedUntil.toISOString(),
              },
            });

          const status: LockoutStatus = {
            locked: true,
            remainingAttempts: 0,
            lockedUntil: lockedUntil.toISOString(),
            requiresEmailUnlock: true,
          };
          return new Response(
            JSON.stringify(status),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      const remainingAttempts = Math.max(0, MAX_FAILED_ATTEMPTS - failedAttempts);
      const status: LockoutStatus = {
        locked: false,
        remainingAttempts,
      };
      return new Response(
        JSON.stringify(status),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'unlock') {
      // Clear lockout (typically called after email verification)
      await supabase
        .from('account_lockouts')
        .delete()
        .eq('email', normalizedEmail);

      // Clear recent failed attempts
      await supabase
        .from('failed_login_attempts')
        .delete()
        .eq('email', normalizedEmail)
        .gte('attempted_at', windowStart.toISOString());

      return new Response(
        JSON.stringify({ success: true, message: 'Account unlocked' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );

  } catch (error) {
    console.error('Error in account-lockout-check:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
