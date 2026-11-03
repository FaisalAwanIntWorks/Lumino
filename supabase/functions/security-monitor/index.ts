import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Starting security monitoring check...');

    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    // Check 1: Multiple failed logins from same IP
    // Note: This would require auth event tracking in security_events table
    // For now, we'll check for suspicious patterns in audit logs

    // Check 2: Unusual admin activity (100+ actions in 1 hour)
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    
    const { data: adminUsers } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'agency_admin');

    if (adminUsers && adminUsers.length > 0) {
      for (const admin of adminUsers) {
        const { data: recentActions, error } = await supabase
          .from('audit_logs')
          .select('id', { count: 'exact' })
          .eq('user_id', admin.user_id)
          .gte('timestamp', oneHourAgo.toISOString());

        if (error) {
          console.error('Error checking admin activity:', error);
          continue;
        }

        const actionCount = recentActions?.length || 0;
        
        if (actionCount > 100) {
          console.log(`Unusual activity detected for admin ${admin.user_id}: ${actionCount} actions in 1 hour`);
          
          // Create security event
          await supabase.from('security_events').insert({
            event_type: 'unusual_admin_activity',
            user_id: admin.user_id,
            details: {
              action_count: actionCount,
              time_window: '1 hour',
            },
            severity: 'warning',
          });
        }
      }
    }

    // Check 3: Multiple unresolved critical alerts
    const { data: criticalAlerts } = await supabase
      .from('usage_alerts')
      .select('client_id')
      .eq('severity', 'critical')
      .eq('acknowledged', false);

    if (criticalAlerts && criticalAlerts.length >= 5) {
      console.log(`${criticalAlerts.length} unresolved critical usage alerts detected`);
      
      await supabase.from('security_events').insert({
        event_type: 'multiple_critical_alerts',
        details: {
          alert_count: criticalAlerts.length,
          clients_affected: criticalAlerts.map(a => a.client_id),
        },
        severity: 'warning',
      });
    }

    // Check 4: Long-running impersonation sessions (>1 hour)
    const { data: longSessions } = await supabase
      .from('impersonation_sessions')
      .select('id, admin_user_id, client_id, started_at')
      .is('ended_at', null)
      .lte('started_at', oneHourAgo.toISOString());

    if (longSessions && longSessions.length > 0) {
      console.log(`${longSessions.length} long-running impersonation sessions detected`);
      
      for (const session of longSessions) {
        await supabase.from('security_events').insert({
          event_type: 'long_impersonation_session',
          user_id: session.admin_user_id,
          details: {
            session_id: session.id,
            client_id: session.client_id,
            started_at: session.started_at,
            duration_hours: Math.floor((now.getTime() - new Date(session.started_at).getTime()) / (1000 * 60 * 60)),
          },
          severity: 'info',
        });
      }
    }

    console.log('Security monitoring check completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        checks_performed: [
          'unusual_admin_activity',
          'multiple_critical_alerts',
          'long_impersonation_sessions',
        ],
        timestamp: now.toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in security monitoring:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
