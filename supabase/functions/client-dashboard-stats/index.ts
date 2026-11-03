import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Order statuses that void the sale for revenue purposes. Compared
// case-insensitively so a client's own "Cancelled" / "Refunded" tag counts.
const VOID_ORDER_STATUSES = new Set(['refunded', 'canceled', 'cancelled']);
const isVoidOrderStatus = (status: unknown) =>
  VOID_ORDER_STATUSES.has(String(status ?? '').trim().toLowerCase());

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Auth: extract user from JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: { user }, error: authError } = await anonClient.auth.getUser(authHeader.replace('Bearer ', ''));
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    let clientId = body.clientId as string | undefined;
    const startISO = body.startISO as string | undefined;
    const endISO = body.endISO as string | undefined;
    const allClients = body.allClients === true;

    // Check if user is admin
    const { data: roleCheck } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'agency_admin')
      .maybeSingle();

    const isAdmin = !!roleCheck;

    // ─── ALL CLIENTS aggregation mode (admin only) ───
    if (allClients && isAdmin) {
      return await handleAllClientsMode(supabase, startISO, endISO, corsHeaders);
    }

    // Resolve client ID
    if (!clientId) {
      const { data: staffRow } = await supabase
        .from('staff_members')
        .select('client_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (staffRow) {
        clientId = staffRow.client_id;
      } else {
        const { data: client } = await supabase
          .from('clients')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        clientId = client?.id;
      }
    }

    if (!clientId) {
      return new Response(JSON.stringify({ error: 'No client found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Verify access
    if (!isAdmin) {
      const { data: ownerCheck } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!ownerCheck) {
        const { data: staffCheck } = await supabase
          .from('staff_members')
          .select('id')
          .eq('user_id', user.id)
          .eq('client_id', clientId)
          .eq('status', 'active')
          .maybeSingle();

        if (!staffCheck) {
          return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    }

    // Get client info
    const { data: clientInfo } = await supabase
      .from('clients')
      .select('company_name, timezone')
      .eq('id', clientId)
      .single();

    const companyName = clientInfo?.company_name || '';
    const timezone = (clientInfo as any)?.timezone || 'America/New_York';

    // Build date filter helper
    const addDateFilter = (query: any, dateCol: string) => {
      if (startISO) query = query.gte(dateCol, startISO);
      if (endISO) query = query.lte(dateCol, endISO);
      return query;
    };

    // Run all queries in parallel
    const [
      ordersResult,
      savedDesignsResult,
      diamondLeadsResult,
      grillLeadsResult,
      enquiryLeadsResult,
      ringBuilderResult,
      bookingsResult,
      metalLeadsResult,
      aiImageCountResult,
      chatSessionCountResult,
      costEstimatesResult,
      cadRequestsResult,
      viewStatsResult,
      dailyTrafficResult,
      ringCfgResult,
      grillCfgResult,
      enquiryCfgResult,
      upcomingBookingsResult,
      productRevenueResult,
    ] = await Promise.all([
      addDateFilter(
        supabase.from('orders').select('id, total_amount, created_at, status, customer_name, customer_email, order_source').eq('client_id', clientId).order('created_at', { ascending: false }),
        'created_at'
      ),
      addDateFilter(
        supabase.from('saved_designs').select('id, customer_name, customer_email, follow_up_status, created_at, configuration').eq('client_id', clientId).order('created_at', { ascending: false }),
        'created_at'
      ),
      addDateFilter(
        supabase.from('diamond_form_leads').select('id, first_name, email, follow_up_status, created_at, estimated_total').eq('client_id', clientId).order('created_at', { ascending: false }),
        'created_at'
      ),
      addDateFilter(
        supabase.from('grill_form_leads').select('id, customer_name, customer_email, follow_up_status, created_at').eq('client_id', clientId).order('created_at', { ascending: false }),
        'created_at'
      ),
      addDateFilter(
        supabase.from('custom_enquiry_leads').select('id, customer_name, customer_email, follow_up_status, created_at, budget').eq('client_id', clientId).order('created_at', { ascending: false }),
        'created_at'
      ),
      addDateFilter(
        supabase.from('design_requests').select('id, customer_name, customer_email, follow_up_status, created_at, ai_preview_url, budget_range').eq('client_id', clientId).order('created_at', { ascending: false }),
        'created_at'
      ),
      addDateFilter(
        supabase.from('appointment_bookings').select('id, customer_name, customer_email, follow_up_status, created_at, status, ring_configuration').eq('client_id', clientId),
        'created_at'
      ),
      addDateFilter(
        supabase.from('metal_buying_leads').select('id, customer_name, customer_email, status, created_at, estimated_offer, estimated_profit').eq('client_id', clientId).order('created_at', { ascending: false }),
        'created_at'
      ),
      addDateFilter(
        supabase.from('ai_usage_logs').select('id', { count: 'exact', head: true }).eq('client_id', clientId).in('feature', ['ring_preview', 'grillz_preview', 'enquiry_preview']),
        'created_at'
      ),
      addDateFilter(
        supabase.from('ai_chat_sessions').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
        'started_at'
      ),
      supabase.from('lead_cost_estimates').select('lead_id, suggested_retail_low, suggested_retail_high').eq('client_id', clientId),
      supabase.from('cad_requests').select('status').eq('client_id', clientId),
      supabase.rpc('get_widget_view_stats', {
        p_client_id: clientId,
        ...(startISO ? { p_start_date: startISO } : {}),
        ...(endISO ? { p_end_date: endISO } : {}),
      }),
      // Daily widget-view buckets for the Traffic Activity chart. Aggregated in
      // SQL (service role) instead of the browser: the dashboard used to read
      // analytics_events directly, which returns nothing for staff users (no
      // SELECT policy covers them) and was capped at 5000 unordered rows.
      // Buckets use the store's own timezone so a "day" matches the client's
      // business day rather than UTC.
      supabase.rpc('get_widget_view_daily', {
        p_client_id: clientId,
        p_timezone: timezone,
        ...(startISO ? { p_start_date: startISO } : {}),
        ...(endISO ? { p_end_date: endISO } : {}),
      }),
      supabase.from('client_ring_form_config').select('submission_mode').eq('client_id', clientId).maybeSingle(),
      supabase.from('client_grill_config').select('submission_mode').eq('client_id', clientId).maybeSingle(),
      supabase.from('client_custom_enquiry_config').select('submission_mode').eq('client_id', clientId).maybeSingle(),
      // Upcoming bookings (future dates, limit 5)
      supabase.from('appointment_bookings')
        .select('id, customer_name, customer_email, preferred_date, preferred_time, status')
        .eq('client_id', clientId)
        .gte('preferred_date', new Date().toISOString().split('T')[0])
        .order('preferred_date', { ascending: true })
        .limit(5),
      // Revenue per product: line-item price only (no tax / shipping),
      // refunded + cancelled orders excluded, grouped by the Shopify order
      // currency.
      supabase.rpc('get_product_revenue', {
        p_client_id: clientId,
        p_start: startISO ?? null,
        p_end: endISO ?? null,
      }),
    ]);

    const orders = ordersResult.data || [];
    const savedDesigns = savedDesignsResult.data || [];
    const diamondLeads = diamondLeadsResult.data || [];
    const grillLeads = grillLeadsResult.data || [];
    const enquiryLeads = enquiryLeadsResult.data || [];
    const ringBuilderLeads = ringBuilderResult.data || [];
    const bookings = bookingsResult.data || [];
    const metalLeads = metalLeadsResult.data || [];
    const upcomingBookings = upcomingBookingsResult.data || [];

    // Build cost estimate map
    const costEstimateMap: Record<string, number> = {};
    (costEstimatesResult.data || []).forEach((est: any) => {
      const avg = ((est.suggested_retail_low || 0) + (est.suggested_retail_high || 0)) / 2;
      if (avg > 0) costEstimateMap[est.lead_id] = avg;
    });

    const parseBudgetRange = (range: string | null): number => {
      if (!range) return 0;
      const nums = range.match(/[\d,]+/g)?.map((n: string) => parseFloat(n.replace(/,/g, ''))) || [];
      return nums.length > 0 ? nums.reduce((a: number, b: number) => a + b, 0) / nums.length : 0;
    };

    // Split bookings: Metal IQ bookings vs regular bookings
    const metalIQBookings = bookings.filter((b: any) => {
      const cfg = b.ring_configuration;
      if (!cfg) return false;
      if (typeof cfg === 'object' && cfg.source === 'metal_iq') return true;
      return false;
    });
    const regularBookings = bookings.filter((b: any) => {
      const cfg = b.ring_configuration;
      if (!cfg) return true;
      if (typeof cfg === 'object' && cfg.source === 'metal_iq') return false;
      return true;
    });

    // Build all leads
    const allLeads = [
      ...savedDesigns.map((d: any) => ({
        id: d.id, customer_name: d.customer_name, customer_email: d.customer_email,
        follow_up_status: d.follow_up_status, created_at: d.created_at || '',
        source: 'widget',
        estimated_total: costEstimateMap[d.id] || (d.configuration as any)?.estimated_total || 0,
      })),
      ...ringBuilderLeads.map((d: any) => ({
        id: d.id, customer_name: d.customer_name || 'Ring Builder Lead',
        customer_email: d.customer_email || '',
        follow_up_status: d.follow_up_status, created_at: d.created_at || '',
        source: 'ring_builder',
        estimated_total: costEstimateMap[d.id] || parseBudgetRange(d.budget_range) || 0,
      })),
      ...diamondLeads.map((d: any) => ({
        id: d.id, customer_name: d.first_name || 'Diamond Lead',
        customer_email: d.email || '',
        follow_up_status: d.follow_up_status, created_at: d.created_at || '',
        source: 'diamond_form',
        estimated_total: costEstimateMap[d.id] || d.estimated_total || 0,
      })),
      ...grillLeads.map((d: any) => ({
        id: d.id, customer_name: d.customer_name || 'Grillz Lead',
        customer_email: d.customer_email || '',
        follow_up_status: d.follow_up_status, created_at: d.created_at || '',
        source: 'grill_form',
        estimated_total: costEstimateMap[d.id] || 0,
      })),
      ...enquiryLeads.map((d: any) => ({
        id: d.id, customer_name: d.customer_name || 'Enquiry Lead',
        customer_email: d.customer_email || '',
        follow_up_status: d.follow_up_status, created_at: d.created_at || '',
        source: 'custom_enquiry',
        estimated_total: costEstimateMap[d.id] || parseFloat(d.budget) || 0,
      })),
      ...regularBookings.map((b: any) => ({
        id: b.id, customer_name: b.customer_name || 'Booking',
        customer_email: b.customer_email || '',
        follow_up_status: b.follow_up_status || b.status || 'new', created_at: b.created_at || '',
        source: 'booking',
        estimated_total: 0,
      })),
      ...metalLeads.map((m: any) => ({
        id: m.id, customer_name: m.customer_name || 'Metal IQ Lead',
        customer_email: m.customer_email || '',
        follow_up_status: m.status || 'new', created_at: m.created_at || '',
        source: 'metal_iq',
        estimated_total: m.estimated_offer || 0,
        estimated_profit: m.estimated_profit || 0,
      })),
    ].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Lead sources
    const ringOsDeposits = orders.filter((o: any) => o.order_source === 'jewlx-widget').length;

    const leadSources: Record<string, number> = {
      widget: savedDesigns.length,
      deposit: ringOsDeposits,
      ring_builder: ringBuilderLeads.length,
      diamond_form: diamondLeads.length,
      grill_form: grillLeads.length,
      custom_enquiry: enquiryLeads.length,
      booking: regularBookings.length,
      metal_iq: metalLeads.length,
      metal_iq_bookings: metalIQBookings.length,
    };

    // Revenue calculations. Refunded / cancelled orders stay in the list and
    // the status counts but contribute nothing to revenue (same rule as
    // get_product_revenue, which these sums back up when the RPC is missing).
    const revenueOrders = orders.filter((o: any) => !isVoidOrderStatus(o.status));
    const totalRevenue = revenueOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0);
    const ringOsOrders = revenueOrders.filter((o: any) => o.order_source === 'jewlx-widget');
    // One row per product + currency (a store normally has exactly one
    // currency). Tiles show the largest currency; the rest ride along in the
    // *ByCurrency arrays. If the RPC is unavailable, keep the legacy
    // total_amount sums rather than a wrong $0.
    type CurrencyAmount = { currency: string; amount: number; orders: number };
    const formSources = ['ring-builder', 'grillz-builder', 'custom-inquiry'];
    const formOrders = revenueOrders.filter((o: any) => formSources.includes(o.order_source));
    let widgetRevenue = ringOsOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0);
    let widgetRevenueCurrency: string | null = null;
    let widgetRevenueByCurrency: CurrencyAmount[] = [];
    let formsRevenue = formOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0);
    let formsRevenueCurrency: string | null = null;
    let depositCount = formOrders.length;
    let revenueByProduct: { product: string; byCurrency: CurrencyAmount[] }[] | null = null;
    if (productRevenueResult.error) {
      console.error('get_product_revenue failed:', productRevenueResult.error.message);
    } else {
      const rows = ((productRevenueResult.data as any[]) || []).map((r: any) => ({
        product: String(r.product || 'other'),
        currency: r.currency || 'USD',
        amount: Number(r.revenue || 0),
        orders: Number(r.order_count || 0),
      }));
      const sumByCurrency = (list: typeof rows): CurrencyAmount[] => {
        const m: Record<string, CurrencyAmount> = {};
        list.forEach((r) => {
          const c = (m[r.currency] ||= { currency: r.currency, amount: 0, orders: 0 });
          c.amount += r.amount;
          c.orders += r.orders;
        });
        return Object.values(m).sort((a, b) => b.amount - a.amount);
      };
      const formProducts = ['ring_builder', 'grillz_builder', 'custom_enquiry'];
      const formsByCurrency = sumByCurrency(rows.filter((r) => formProducts.includes(r.product)));

      widgetRevenueByCurrency = sumByCurrency(rows.filter((r) => r.product === 'ring_os'));
      widgetRevenue = widgetRevenueByCurrency[0]?.amount ?? 0;
      widgetRevenueCurrency = widgetRevenueByCurrency[0]?.currency ?? null;
      formsRevenue = formsByCurrency[0]?.amount ?? 0;
      formsRevenueCurrency = formsByCurrency[0]?.currency ?? null;
      depositCount = formsByCurrency.reduce((n, c) => n + c.orders, 0);
      revenueByProduct = ['ring_os', ...formProducts].map((product) => ({
        product,
        byCurrency: sumByCurrency(rows.filter((r) => r.product === product)),
      }));
    }
    const totalDeposits = formsRevenue;

    const hasDepositMode =
      ringCfgResult.data?.submission_mode === 'deposit' ||
      grillCfgResult.data?.submission_mode === 'deposit' ||
      enquiryCfgResult.data?.submission_mode === 'deposit';

    // AI configurations
    const designsWithAI = ringBuilderLeads.filter((d: any) => d.ai_preview_url).length;
    const savedWithAI = savedDesigns.filter((d: any) => (d.configuration as any)?.ai_preview_url).length;
    const aiConfigCount = designsWithAI + savedWithAI + (aiImageCountResult.count || 0);

    // Average lead value
    const leadsWithValue = allLeads.filter((l: any) => (l.estimated_total || 0) > 0);
    const avgLeadValue = leadsWithValue.length > 0
      ? leadsWithValue.reduce((sum: number, l: any) => sum + (l.estimated_total || 0), 0) / leadsWithValue.length
      : 0;

    // Tag counts
    const leadTagCounts: Record<string, number> = {};
    allLeads.forEach((l: any) => {
      const status = (l.follow_up_status || 'new').toLowerCase();
      leadTagCounts[status] = (leadTagCounts[status] || 0) + 1;
    });

    const orderTagCounts: Record<string, number> = {};
    orders.forEach((o: any) => {
      const status = (o.status || 'pending').toLowerCase();
      orderTagCounts[status] = (orderTagCounts[status] || 0) + 1;
    });

    const cadStatusCounts: Record<string, number> = {};
    (cadRequestsResult.data || []).forEach((c: any) => {
      const status = (c.status || 'pending').toLowerCase();
      cadStatusCounts[status] = (cadStatusCounts[status] || 0) + 1;
    });

    // Widget views
    if (viewStatsResult.error) {
      console.error('get_widget_view_stats failed:', viewStatsResult.error.message);
    }
    const widgetViewSources = ['jewlx_widget', 'ring_builder', 'grillz_builder', 'custom_enquiry', 'metal_buying'] as const;
    const widgetViews: Record<string, { total: number; unique: number }> = {};
    for (const source of widgetViewSources) {
      const row = (viewStatsResult.data as any[])?.find((r: any) => r.source === source);
      widgetViews[source] = { total: Number(row?.total_count ?? 0), unique: Number(row?.unique_sessions ?? 0) };
    }

    // Daily traffic series for the chart ({ date: 'YYYY-MM-DD', count }).
    if (dailyTrafficResult.error) {
      console.error('get_widget_view_daily failed:', dailyTrafficResult.error.message);
    }
    const dailyTraffic = ((dailyTrafficResult.data as any[]) || []).map((r: any) => ({
      date: typeof r.day === 'string' ? r.day.slice(0, 10) : String(r.day),
      count: Number(r.total_count || 0),
    }));

    const totalInquiries = enquiryLeads.length + grillLeads.length + ringBuilderLeads.length;

    const result = {
      companyName,
      timezone,
      storeVisits: Object.values(widgetViews).reduce((sum, v) => sum + v.total, 0),
      totalLeads: allLeads.length,
      totalBookings: bookings.length,
      totalOrders: orders.length,
      monthlyRevenue: totalRevenue,
      widgetRevenue,
      widgetRevenueCurrency,
      widgetRevenueByCurrency,
      formsRevenueCurrency,
      revenueByProduct,
      formsRevenue,
      totalDeposits,
      depositCount,
      hasDepositMode,
      avgLeadValue,
      totalSavedDesigns: savedDesigns.length + ringBuilderLeads.length,
      totalAIConfigurations: aiConfigCount,
      totalChatSessions: chatSessionCountResult.count || 0,
      totalInquiries,
      recentLeads: allLeads.slice(0, 5),
      recentOrders: orders.slice(0, 5),
      leadSources,
      widgetViews,
      dailyTraffic,
      leadTagCounts,
      orderTagCounts,
      cadStatusCounts,
      allLeads,
      upcomingBookings,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Error in client-dashboard-stats:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

// ─── All Clients Aggregation Mode ────────────────────────────────────
async function handleAllClientsMode(supabase: any, startISO?: string, endISO?: string, corsHeaders?: any) {
  const addDateFilter = (query: any, dateCol: string) => {
    if (startISO) query = query.gte(dateCol, startISO);
    if (endISO) query = query.lte(dateCol, endISO);
    return query;
  };

  const [
    ordersResult,
    savedDesignsResult,
    diamondLeadsResult,
    grillLeadsResult,
    enquiryLeadsResult,
    ringBuilderResult,
    bookingsResult,
    metalLeadsResult,
    aiImageCount,
    chatSessionCount,
    viewStatsResult,
    dailyTrafficResult,
    cadRequestsResult,
    upcomingBookingsResult,
  ] = await Promise.all([
    addDateFilter(supabase.from('orders').select('id, total_amount, created_at, status, customer_name, customer_email, order_source, client_id, clients(company_name)').order('created_at', { ascending: false }), 'created_at'),
    addDateFilter(supabase.from('saved_designs').select('id, customer_name, customer_email, follow_up_status, created_at, configuration').order('created_at', { ascending: false }).limit(500), 'created_at'),
    addDateFilter(supabase.from('diamond_form_leads').select('id, first_name, email, follow_up_status, created_at, estimated_total').order('created_at', { ascending: false }).limit(500), 'created_at'),
    addDateFilter(supabase.from('grill_form_leads').select('id, customer_name, customer_email, follow_up_status, created_at').order('created_at', { ascending: false }).limit(500), 'created_at'),
    addDateFilter(supabase.from('custom_enquiry_leads').select('id, customer_name, customer_email, follow_up_status, created_at, budget').order('created_at', { ascending: false }).limit(500), 'created_at'),
    addDateFilter(supabase.from('design_requests').select('id, customer_name, customer_email, follow_up_status, created_at, budget_range').order('created_at', { ascending: false }).limit(500), 'created_at'),
    addDateFilter(supabase.from('appointment_bookings').select('id, customer_name, customer_email, follow_up_status, created_at, status, ring_configuration').order('created_at', { ascending: false }).limit(500), 'created_at'),
    addDateFilter(supabase.from('metal_buying_leads').select('id, customer_name, customer_email, status, created_at, estimated_offer').order('created_at', { ascending: false }).limit(500), 'created_at'),
    addDateFilter(supabase.from('ai_usage_logs').select('id', { count: 'exact', head: true }).in('feature', ['ring_preview', 'grillz_preview', 'enquiry_preview']), 'created_at'),
    addDateFilter(supabase.from('ai_chat_sessions').select('id', { count: 'exact', head: true }), 'started_at'),
    // Widget view stats aggregated across all clients.
    // Was a dead call (zero-UUID client + `.then(() => null)`), which forced the
    // fallback below to re-scan analytics_events with no date filter at all.
    supabase.rpc('get_widget_view_stats_all', {
      ...(startISO ? { p_start_date: startISO } : {}),
      ...(endISO ? { p_end_date: endISO } : {}),
    }),
    // Daily traffic buckets for the platform chart (UTC days, matching dailyLeads).
    supabase.rpc('get_widget_view_daily', {
      p_client_id: null,
      p_timezone: 'UTC',
      ...(startISO ? { p_start_date: startISO } : {}),
      ...(endISO ? { p_end_date: endISO } : {}),
    }),
    supabase.from('cad_requests').select('status'),
    // Upcoming bookings
    supabase.from('appointment_bookings')
      .select('id, customer_name, customer_email, preferred_date, preferred_time, status')
      .gte('preferred_date', new Date().toISOString().split('T')[0])
      .order('preferred_date', { ascending: true })
      .limit(5),
  ]);

  const orders = ordersResult.data || [];
  const savedDesigns = savedDesignsResult.data || [];
  const diamondLeads = diamondLeadsResult.data || [];
  const grillLeads = grillLeadsResult.data || [];
  const enquiryLeads = enquiryLeadsResult.data || [];
  const ringBuilderLeads = ringBuilderResult.data || [];
  const bookings = bookingsResult.data || [];
  const metalLeads = metalLeadsResult.data || [];
  const upcomingBookings = upcomingBookingsResult.data || [];

  // Refunded / cancelled orders are excluded from every revenue figure.
  const revenueOrders = orders.filter((o: any) => !isVoidOrderStatus(o.status));
  const totalRevenue = revenueOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0);
  const ringOsOrders = revenueOrders.filter((o: any) => o.order_source === 'jewlx-widget');
  const widgetRevenue = ringOsOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0);
  const formSources = ['ring-builder', 'grillz-builder', 'custom-inquiry'];
  const formOrders = revenueOrders.filter((o: any) => formSources.includes(o.order_source));
  const formsRevenue = formOrders.reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0);

  // Split bookings: Metal IQ bookings vs regular bookings
  const metalIQBookings = bookings.filter((b: any) => {
    const cfg = b.ring_configuration;
    return cfg && typeof cfg === 'object' && cfg.source === 'metal_iq';
  });
  const regularBookings = bookings.filter((b: any) => {
    const cfg = b.ring_configuration;
    return !cfg || !(typeof cfg === 'object' && cfg.source === 'metal_iq');
  });

  // Build allLeads array with all lead types
  const allLeads = [
    ...savedDesigns.map((d: any) => ({
      id: d.id, customer_name: d.customer_name, customer_email: d.customer_email,
      follow_up_status: d.follow_up_status, created_at: d.created_at || '',
      source: 'widget', estimated_total: (d.configuration as any)?.estimated_total || 0,
    })),
    ...ringBuilderLeads.map((d: any) => ({
      id: d.id, customer_name: d.customer_name || 'Ring Builder Lead',
      customer_email: d.customer_email || '',
      follow_up_status: d.follow_up_status, created_at: d.created_at || '',
      source: 'ring_builder', estimated_total: 0,
    })),
    ...diamondLeads.map((d: any) => ({
      id: d.id, customer_name: d.first_name || 'Diamond Lead',
      customer_email: d.email || '',
      follow_up_status: d.follow_up_status, created_at: d.created_at || '',
      source: 'diamond_form', estimated_total: d.estimated_total || 0,
    })),
    ...grillLeads.map((d: any) => ({
      id: d.id, customer_name: d.customer_name || 'Grillz Lead',
      customer_email: d.customer_email || '',
      follow_up_status: d.follow_up_status, created_at: d.created_at || '',
      source: 'grill_form', estimated_total: 0,
    })),
    ...enquiryLeads.map((d: any) => ({
      id: d.id, customer_name: d.customer_name || 'Enquiry Lead',
      customer_email: d.customer_email || '',
      follow_up_status: d.follow_up_status, created_at: d.created_at || '',
      source: 'custom_enquiry', estimated_total: parseFloat(d.budget) || 0,
    })),
    ...regularBookings.map((b: any) => ({
      id: b.id, customer_name: b.customer_name || 'Booking',
      customer_email: b.customer_email || '',
      follow_up_status: b.follow_up_status || b.status || 'new', created_at: b.created_at || '',
      source: 'booking', estimated_total: 0,
    })),
    ...metalLeads.map((m: any) => ({
      id: m.id, customer_name: m.customer_name || 'Metal IQ Lead',
      customer_email: m.customer_email || '',
      follow_up_status: m.status || 'new', created_at: m.created_at || '',
      source: 'metal_iq', estimated_total: m.estimated_offer || 0,
    })),
  ].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const totalLeads = allLeads.length;

  const leadSources: Record<string, number> = {
    widget: savedDesigns.length,
    deposit: ringOsOrders.length,
    ring_builder: ringBuilderLeads.length,
    diamond_form: diamondLeads.length,
    grill_form: grillLeads.length,
    custom_enquiry: enquiryLeads.length,
    booking: regularBookings.length,
    metal_iq: metalLeads.length,
    metal_iq_bookings: metalIQBookings.length,
  };

  // Lead tag counts
  const leadTagCounts: Record<string, number> = {};
  allLeads.forEach((l: any) => {
    const status = (l.follow_up_status || 'new').toLowerCase();
    leadTagCounts[status] = (leadTagCounts[status] || 0) + 1;
  });

  // Order tag counts
  const orderTagCounts: Record<string, number> = {};
  orders.forEach((o: any) => {
    const status = (o.status || 'pending').toLowerCase();
    orderTagCounts[status] = (orderTagCounts[status] || 0) + 1;
  });

  // CAD status counts
  const cadStatusCounts: Record<string, number> = {};
  (cadRequestsResult.data || []).forEach((c: any) => {
    const status = (c.status || 'pending').toLowerCase();
    cadStatusCounts[status] = (cadStatusCounts[status] || 0) + 1;
  });

  // Widget views — aggregated in SQL for the selected date range.
  // The previous implementation pulled raw `metadata` rows with no date filter
  // and no limit, so it both ignored the picked range and silently truncated at
  // PostgREST's default max-rows.
  if (viewStatsResult.error) {
    console.error('get_widget_view_stats_all failed:', viewStatsResult.error.message);
  }
  const widgetViewSources = ['jewlx_widget', 'ring_builder', 'grillz_builder', 'custom_enquiry', 'metal_buying'] as const;
  const widgetViews: Record<string, { total: number; unique: number }> = {};
  for (const source of widgetViewSources) {
    const row = (viewStatsResult.data as any[])?.find((r: any) => r.source === source);
    widgetViews[source] = { total: Number(row?.total_count ?? 0), unique: Number(row?.unique_sessions ?? 0) };
  }

  if (dailyTrafficResult.error) {
    console.error('get_widget_view_daily failed:', dailyTrafficResult.error.message);
  }
  const dailyTraffic = ((dailyTrafficResult.data as any[]) || []).map((r: any) => ({
    date: typeof r.day === 'string' ? r.day.slice(0, 10) : String(r.day),
    count: Number(r.total_count || 0),
  }));

  // Average lead value
  const leadsWithValue = allLeads.filter((l: any) => (l.estimated_total || 0) > 0);
  const avgLeadValue = leadsWithValue.length > 0
    ? leadsWithValue.reduce((sum: number, l: any) => sum + (l.estimated_total || 0), 0) / leadsWithValue.length
    : 0;

  const totalInquiries = enquiryLeads.length + grillLeads.length + ringBuilderLeads.length;

  const result = {
    companyName: 'All Clients',
    timezone: 'America/New_York',
    storeVisits: Object.values(widgetViews).reduce((sum: number, v: any) => sum + (v.total || 0), 0),
    totalLeads,
    totalBookings: bookings.length,
    totalOrders: orders.length,
    monthlyRevenue: totalRevenue,
    widgetRevenue,
    formsRevenue,
    totalDeposits: formsRevenue,
    depositCount: formOrders.length,
    hasDepositMode: false,
    avgLeadValue,
    totalSavedDesigns: savedDesigns.length + ringBuilderLeads.length,
    totalAIConfigurations: aiImageCount.count || 0,
    totalChatSessions: chatSessionCount.count || 0,
    totalInquiries,
    recentLeads: allLeads.slice(0, 5),
    recentOrders: (orders).slice(0, 5),
    leadSources,
    widgetViews,
    dailyTraffic,
    leadTagCounts,
    orderTagCounts,
    cadStatusCounts,
    allLeads,
    upcomingBookings,
  };

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
}