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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log('Starting daily usage snapshot...');

    // Get all active clients
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, company_name')
      .eq('status', 'active');

    if (clientsError) throw clientsError;

    const today = new Date().toISOString().split('T')[0];
    const results = [];

    for (const client of clients || []) {
      console.log(`Processing client: ${client.company_name}`);

      // Calculate database metrics
      const { count: analyticsCount } = await supabase
        .from('analytics_events')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client.id);

      const { count: ordersCount } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client.id);

      const { count: savedDesignsCount } = await supabase
        .from('saved_designs')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client.id);

      const { count: chatSessionsCount } = await supabase
        .from('ai_chat_sessions')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client.id);

      const totalRows = (analyticsCount || 0) + (ordersCount || 0) + 
                       (savedDesignsCount || 0) + (chatSessionsCount || 0);

      // Estimated DB size from row counts (rough per-row coefficients; not actual pg_total_relation_size)
      const estimatedDbSizeMb = (
        (analyticsCount || 0) * 0.001 +
        (ordersCount || 0) * 0.005 +
        (savedDesignsCount || 0) * 0.003 +
        (chatSessionsCount || 0) * 0.002
      );

      // Get storage metrics from product-assets bucket
      const { data: storageFiles, error: storageError } = await supabase
        .storage
        .from('product-assets')
        .list(client.id);

      let storageSizeMb = 0;
      let filesCount = 0;
      if (!storageError && storageFiles) {
        filesCount = storageFiles.length;
        storageSizeMb = storageFiles.reduce((sum, file) => sum + (file.metadata?.size || 0), 0) / (1024 * 1024);
      }

      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Count function invocations (from analytics_events in last 24h)
      const { count: functionInvocations } = await supabase
        .from('analytics_events')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', client.id)
        .gte('created_at', dayAgo);

      // Aggregate real AI token usage from ai_usage_logs for the last 24h
      const { data: aiLogsData } = await supabase
        .from('ai_usage_logs')
        .select('input_tokens, output_tokens')
        .eq('client_id', client.id)
        .gte('created_at', dayAgo);

      const aiTokensUsed = (aiLogsData || []).reduce(
        (sum: number, l: any) => sum + (l.input_tokens || 0) + (l.output_tokens || 0),
        0
      );

      // Insert or update snapshot
      const { error: snapshotError } = await supabase
        .from('usage_snapshots')
        .upsert({
          client_id: client.id,
          snapshot_date: today,
          database_size_mb: Math.round(estimatedDbSizeMb * 100) / 100,
          database_rows: totalRows,
          storage_size_mb: Math.round(storageSizeMb * 100) / 100,
          storage_files_count: filesCount,
          function_invocations: functionInvocations || 0,
          bandwidth_mb: 0, // CDN logs not available
          analytics_events_count: analyticsCount || 0,
          ai_tokens_used: aiTokensUsed,
        }, {
          onConflict: 'client_id,snapshot_date'
        });

      if (snapshotError) {
        console.error(`Error creating snapshot for ${client.company_name}:`, snapshotError);
      } else {
        results.push({ client: client.company_name, success: true });
      }
    }

    console.log('Usage snapshot completed:', results);

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in usage-snapshot:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});