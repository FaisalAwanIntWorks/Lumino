import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Free tier limits
const FREE_TIER_LIMITS = {
  database: 500, // MB
  storage: 1024, // MB (1 GB)
  functions: 500000, // invocations per month
  bandwidth: 2048, // MB (2 GB)
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log('Checking usage alerts...');

    // Get all active clients
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, company_name')
      .eq('status', 'active');

    if (clientsError) throw clientsError;

    const today = new Date().toISOString().split('T')[0];
    const alertsCreated = [];

    for (const client of clients || []) {
      // Get latest snapshot for this client
      const { data: snapshot, error: snapshotError } = await supabase
        .from('usage_snapshots')
        .select('*')
        .eq('client_id', client.id)
        .eq('snapshot_date', today)
        .single();

      if (snapshotError || !snapshot) {
        console.log(`No snapshot found for ${client.company_name}, skipping`);
        continue;
      }

      // Check each metric against thresholds
      const checks = [
        {
          type: 'database',
          current: snapshot.database_size_mb,
          limit: FREE_TIER_LIMITS.database,
          unit: 'MB'
        },
        {
          type: 'storage',
          current: snapshot.storage_size_mb,
          limit: FREE_TIER_LIMITS.storage,
          unit: 'MB'
        },
        {
          type: 'functions',
          current: snapshot.function_invocations,
          limit: FREE_TIER_LIMITS.functions,
          unit: 'invocations'
        }
      ];

      for (const check of checks) {
        const percentage = (check.current / check.limit) * 100;
        
        // Determine which thresholds have been crossed
        const thresholds = [90, 75, 50];
        
        for (const threshold of thresholds) {
          if (percentage >= threshold) {
            // Check if alert already exists for this threshold
            const { data: existingAlert } = await supabase
              .from('usage_alerts')
              .select('id')
              .eq('client_id', client.id)
              .eq('alert_type', check.type)
              .eq('threshold_percentage', threshold)
              .eq('acknowledged', false)
              .maybeSingle();

            if (!existingAlert) {
              // Create new alert
              const severity = threshold >= 90 ? 'critical' : threshold >= 75 ? 'warning' : 'info';
              const message = `${check.type.charAt(0).toUpperCase() + check.type.slice(1)} usage at ${Math.round(percentage)}% (${Math.round(check.current)} / ${check.limit} ${check.unit})`;

              const { error: alertError } = await supabase
                .from('usage_alerts')
                .insert({
                  client_id: client.id,
                  alert_type: check.type,
                  threshold_percentage: threshold,
                  current_usage: check.current,
                  limit_value: check.limit,
                  message,
                  severity
                });

              if (!alertError) {
                alertsCreated.push({
                  client: client.company_name,
                  type: check.type,
                  threshold,
                  severity
                });
                console.log(`Alert created: ${message} for ${client.company_name}`);
              }
            }
            
            // Only trigger the highest threshold
            break;
          }
        }
      }
    }

    console.log('Usage alerts check completed:', alertsCreated);

    return new Response(
      JSON.stringify({ success: true, alerts_created: alertsCreated.length, alerts: alertsCreated }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in usage-alerts-check:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});