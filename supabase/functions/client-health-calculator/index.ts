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

    console.log('Starting client health calculation...');

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Get all active clients
    const { data: clients, error: clientsError } = await supabase
      .from('clients')
      .select('id, company_name, created_at')
      .eq('status', 'active');

    if (clientsError) throw clientsError;

    if (!clients || clients.length === 0) {
      console.log('No active clients found');
      return new Response(
        JSON.stringify({ success: true, processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    for (const client of clients) {
      // Calculate activity metrics
      const { data: recentOrders } = await supabase
        .from('orders')
        .select('id, created_at')
        .eq('client_id', client.id)
        .gte('created_at', thirtyDaysAgo.toISOString());

      const { data: recentDesigns } = await supabase
        .from('saved_designs')
        .select('id, created_at')
        .eq('client_id', client.id)
        .gte('created_at', thirtyDaysAgo.toISOString());

      const { data: previousOrders } = await supabase
        .from('orders')
        .select('id')
        .eq('client_id', client.id)
        .gte('created_at', sixtyDaysAgo.toISOString())
        .lt('created_at', thirtyDaysAgo.toISOString());

      const ordersCount30d = recentOrders?.length || 0;
      const designsCount30d = recentDesigns?.length || 0;
      const previousOrdersCount = previousOrders?.length || 0;

      // Calculate growth rate
      const growthRate = previousOrdersCount > 0
        ? ((ordersCount30d - previousOrdersCount) / previousOrdersCount) * 100
        : ordersCount30d > 0 ? 100 : 0;

      // Get last activity date
      const { data: latestActivity } = await supabase
        .from('orders')
        .select('created_at')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const lastActivityDate = latestActivity?.created_at || client.created_at;
      const daysSinceActivity = Math.floor(
        (now.getTime() - new Date(lastActivityDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Calculate activity score (0-100)
      let activityScore = 0;
      if (daysSinceActivity === 0) activityScore = 100;
      else if (daysSinceActivity <= 7) activityScore = 80;
      else if (daysSinceActivity <= 14) activityScore = 60;
      else if (daysSinceActivity <= 30) activityScore = 40;
      else if (daysSinceActivity <= 60) activityScore = 20;
      else activityScore = 0;

      // Calculate churn risk score (0-100, higher = more risk)
      let churnRiskScore = 0;
      if (daysSinceActivity > 60) churnRiskScore = 90;
      else if (daysSinceActivity > 30) churnRiskScore = 70;
      else if (daysSinceActivity > 14) churnRiskScore = 50;
      else if (ordersCount30d === 0 && designsCount30d === 0) churnRiskScore = 30;
      else churnRiskScore = 10;

      // Determine engagement level
      let engagementLevel = 'low';
      if (ordersCount30d >= 5 || designsCount30d >= 10) engagementLevel = 'high';
      else if (ordersCount30d >= 2 || designsCount30d >= 5) engagementLevel = 'medium';

      // Calculate overall health score (0-100)
      const healthScore = Math.round(
        (activityScore * 0.4) + // 40% weight on recency
        (Math.min(ordersCount30d * 10, 100) * 0.3) + // 30% weight on order volume
        (Math.min(designsCount30d * 5, 100) * 0.2) + // 20% weight on design activity
        ((100 - churnRiskScore) * 0.1) // 10% weight on churn risk
      );

      // Calculate usage efficiency (orders per MB of database)
      const { data: usageSnapshot } = await supabase
        .from('usage_snapshots')
        .select('database_size_mb')
        .eq('client_id', client.id)
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .single();

      const dbSize = usageSnapshot?.database_size_mb || 1;
      const usageEfficiency = ordersCount30d / dbSize;

      // Upsert health metrics
      await supabase.from('client_health_metrics').upsert({
        client_id: client.id,
        snapshot_date: now.toISOString().split('T')[0],
        health_score: healthScore,
        activity_score: activityScore,
        growth_rate: growthRate,
        churn_risk_score: churnRiskScore,
        last_activity_date: lastActivityDate,
        orders_count_30d: ordersCount30d,
        designs_count_30d: designsCount30d,
        usage_efficiency: usageEfficiency,
        engagement_level: engagementLevel,
      }, {
        onConflict: 'client_id,snapshot_date',
      });

      console.log(`Calculated health for ${client.company_name}: score=${healthScore}, churn_risk=${churnRiskScore}`);
    }

    console.log('Client health calculation completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        processed: clients.length,
        timestamp: now.toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error calculating client health:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
