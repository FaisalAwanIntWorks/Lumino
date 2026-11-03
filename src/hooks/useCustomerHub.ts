import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CustomerActivity {
  id: string;
  type: 'lead' | 'booking' | 'order' | 'metal_iq' | 'cad';
  source: 'widget' | 'diamond_form' | 'grill_form' | 'custom_enquiry' | 'ring_builder' | 'booking' | 'metal_iq' | 'order' | 'cad_request' | 'cad_resize';
  sourceTable: string;
  status: string;
  created_at: string;
  configuration: any;
  amount?: number;
  productName?: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  notes?: string | null;
  // Order-specific
  orderSource?: string;
  shopifyOrderId?: string;
  shippingStatus?: string;
  trackingNumber?: string;
  // For mapping back to SavedDesign shape
  rawData?: any;
}

export interface CustomerProfile {
  email: string;
  name: string;
  phone: string | null;
  activities: CustomerActivity[];
  overallStatus: string;
  totalValue: number;
  hasDeposit: boolean;
  firstSeen: string;
  lastSeen: string;
  submissionCount: number;
  activityTypes: Set<string>;
}

const buildProductNameFromConfig = (config: any): string | null => {
  if (!config) return null;
  const parts: string[] = [];
  const titleCase = (v: string) => v.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  if (config.style) parts.push(titleCase(config.style));
  if (config.shank) parts.push(titleCase(config.shank));
  if (config.metal) parts.push(titleCase(config.metal));
  if (config.shape) parts.push(titleCase(config.shape));
  if (config.caratRange) parts.push(`${config.caratRange}ct`);
  return parts.length > 0 ? parts.join(' ') : null;
};

export function useCustomerHub(clientId: string | null) {
  const [activities, setActivities] = useState<CustomerActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAll = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);

    try {
      const [widgetRes, diamondRes, grillRes, enquiryRes, ringBuilderRes, bookingRes, metalRes, orderRes, cadRes, cadResizeRes] = await Promise.all([
        supabase.from('saved_designs').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(500),
        supabase.from('diamond_form_leads').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(500),
        supabase.from('grill_form_leads').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(500),
        supabase.from('custom_enquiry_leads').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(500),
        supabase.from('design_requests').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(500),
        supabase.from('appointment_bookings').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(500),
        supabase.from('metal_buying_leads').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(500),
        supabase.from('orders').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(500),
        supabase.from('cad_requests').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(500),
        supabase.from('cad_resize_requests').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(500),
      ]);

      const allActivities: CustomerActivity[] = [];

      // Widget leads
      (widgetRes.data || []).forEach((d: any) => {
        allActivities.push({
          id: d.id, type: 'lead', source: 'widget', sourceTable: 'saved_designs',
          status: d.follow_up_status || 'new', created_at: d.created_at,
          configuration: d.configuration || {},
          productName: d.product_name || buildProductNameFromConfig(d.configuration) || 'Custom Ring',
          customerName: d.customer_name, customerEmail: d.customer_email, customerPhone: d.customer_phone,
          notes: d.notes,
          rawData: d,
        });
      });

      // Quote Estimator (diamond form). Same shape the classic Leads list
      // builds, so the activity detail view renders the ring configuration.
      (diamondRes.data || []).forEach((d: any) => {
        allActivities.push({
          id: d.id, type: 'lead', source: 'diamond_form', sourceTable: 'diamond_form_leads',
          status: d.follow_up_status || 'new', created_at: d.created_at,
          configuration: {
            diamond_type: d.diamond_type, diamond_shape: d.diamond_shape, diamond_size: d.diamond_size,
            diamond_quality: d.diamond_quality, diamond_setting: d.diamond_setting, diamond_holder: d.diamond_holder,
            diamond_band: d.diamond_band, diamond_band_width: d.diamond_band_width, diamond_metal: d.diamond_metal,
            diamond_metal_karat: d.diamond_metal_karat, diamond_two_tone_metals: d.diamond_two_tone_metals,
            diamond_personalization: d.diamond_personalization, ring_size: d.ring_size,
            diamond_timeline: d.diamond_timeline, estimated_total: d.estimated_total,
            inspiration_image_urls: d.inspiration_image_urls, claim_phone: d.claim_phone,
          },
          productName: [d.diamond_type, d.diamond_shape, d.diamond_metal].filter(Boolean).map((v: any) => String(v).replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())).join(' · ') || 'Diamond Ring',
          customerName: d.first_name || 'Quote Estimator Customer', customerEmail: d.email || '',
          customerPhone: d.phone_number ? `${d.country_code || ''}${d.phone_number}` : null,
          notes: d.other_details || null,
          rawData: d,
        });
      });

      // Grillz
      (grillRes.data || []).forEach((g: any) => {
        allActivities.push({
          id: g.id, type: 'lead', source: 'grill_form', sourceTable: 'grill_form_leads',
          status: g.follow_up_status || 'new', created_at: g.created_at,
          configuration: { grillz_type: g.grillz_type, metal_type: g.metal_type, metal_purity: g.metal_purity, top_teeth: g.top_teeth, bottom_teeth: g.bottom_teeth, question_answers: g.question_answers, budget: g.budget, uploaded_image_urls: g.uploaded_image_urls, ai_preview_url: g.ai_preview_url },
          productName: [g.metal_type, g.metal_purity].filter(Boolean).map((v: string) => v.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())).join(' · ') || 'Custom Grillz',
          customerName: g.customer_name || 'Grillz Customer', customerEmail: g.customer_email || '', customerPhone: g.customer_phone,
          notes: g.additional_notes,
          rawData: g,
        });
      });

      // Custom Enquiry
      (enquiryRes.data || []).forEach((e: any) => {
        allActivities.push({
          id: e.id, type: 'lead', source: 'custom_enquiry', sourceTable: 'custom_enquiry_leads',
          status: e.follow_up_status || 'new', created_at: e.created_at,
          configuration: { jewelry_type: e.jewelry_type, budget: e.budget, gold_color: e.gold_color, karat: e.karat, diamond_quality: e.diamond_quality, diamond_setup: e.diamond_setup, back_option: e.back_option, description: e.description, timeline: e.timeline, question_answers: e.question_answers, additional_notes: e.additional_notes, uploaded_image_urls: e.uploaded_image_urls, ai_preview_url: e.ai_preview_url },
          productName: [e.jewelry_type, e.gold_color, e.karat].filter(Boolean).map((v: string) => v.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())).join(' · ') || 'Custom Enquiry',
          customerName: e.customer_name || 'Custom Enquiry Customer', customerEmail: e.customer_email || '', customerPhone: e.customer_phone,
          notes: e.additional_notes || e.description,
          rawData: e,
        });
      });

      // Ring Builder
      (ringBuilderRes.data || []).forEach((r: any) => {
        allActivities.push({
          id: r.id, type: 'lead', source: 'ring_builder', sourceTable: 'design_requests',
          status: r.follow_up_status || 'new', created_at: r.created_at,
          configuration: { request_type: r.request_type, description: r.description, preferred_style: r.preferred_style, preferred_metal: r.preferred_metal, metal_preference: r.metal_preference, preferred_stone: r.preferred_stone, stone_preference: r.stone_preference, budget_range: r.budget_range, timeline: r.timeline, size: r.size, reference_images: r.reference_images, priority: r.priority, status: r.status, admin_notes: r.admin_notes },
          productName: [r.request_type, r.preferred_metal || r.metal_preference].filter(Boolean).map((v: string) => v.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())).join(' · ') || 'Custom Ring Design',
          customerName: r.customer_name || 'Ring Builder Customer', customerEmail: r.customer_email || '', customerPhone: r.customer_phone,
          notes: r.special_requirements,
          rawData: r,
        });
      });

      // Bookings
      ((bookingRes.data || []) as any[]).forEach((b: any) => {
        const rc = b.ring_configuration;
        allActivities.push({
          id: b.id, type: 'booking', source: 'booking', sourceTable: 'appointment_bookings',
          status: b.follow_up_status || b.status || 'new', created_at: b.created_at,
          configuration: { ...(rc || {}), preferred_date: b.preferred_date, preferred_time: b.preferred_time, customer_timezone: b.customer_timezone, booking_status: b.status },
          productName: rc?.source === 'metal_iq' ? 'Metal IQ Booking' : buildProductNameFromConfig(rc) || 'Appointment Booking',
          customerName: b.customer_name || 'Booking Customer', customerEmail: b.customer_email || '', customerPhone: b.customer_phone,
          notes: b.message,
          rawData: b,
        });
      });

      // Metal IQ
      ((metalRes.data || []) as any[]).forEach((m: any) => {
        const PURITY_FACTORS: Record<string, number> = {
          '8k': 0.333, '9k': 0.375, '10k': 0.417, '12k': 0.500,
          '14k': 0.583, '18k': 0.750, '21k': 0.875, '22k': 0.916, '24k': 0.999,
          '800': 0.800, '835': 0.835, '900': 0.900, '925': 0.925, '950': 0.950, '999': 0.999,
          '850': 0.850, '900pt': 0.900, '950pt': 0.950, '999pt': 0.999,
        };
        const karatKey = m.karat?.toLowerCase().replace(/\s/g, '') ?? '';
        const purity = PURITY_FACTORS[karatKey] ?? null;
        const spotPerGram = m.spot_price_at_time ? m.spot_price_at_time / 31.1035 : null;
        const pureValue = m.weight_grams && spotPerGram && purity ? m.weight_grams * spotPerGram * purity : null;
        allActivities.push({
          id: m.id, type: 'metal_iq', source: 'metal_iq', sourceTable: 'metal_buying_leads',
          status: m.status || 'new', created_at: m.created_at,
          configuration: {
            metal_type: m.metal_type, karat: m.karat, weight_grams: m.weight_grams,
            estimated_offer: m.estimated_offer, competitor_offer: m.competitor_offer,
            estimated_profit: m.estimated_profit, spot_price_at_time: m.spot_price_at_time,
            spot_price_date: m.spot_price_date, buy_percentage: m.buy_percentage,
            lead_score: m.lead_score, location: m.location, country_iso: m.country_iso,
            knows_karat: m.knows_karat, knows_weight: m.knows_weight,
            knows_authentic: m.knows_authentic, is_authentic: m.is_authentic,
            photo_urls: m.photo_urls, currency: m.currency || 'USD',
            // Computed
            spot_price_per_gram: spotPerGram ? spotPerGram.toFixed(2) : null,
            pure_metal_value: pureValue ? pureValue.toFixed(2) : null,
            our_offer: m.estimated_offer,
          },
          productName: [m.metal_type?.charAt(0).toUpperCase() + m.metal_type?.slice(1), m.karat, m.weight_grams ? `${m.weight_grams}g` : null].filter(Boolean).join(' · ') || 'Metal Inquiry',
          customerName: m.customer_name || 'Metal IQ Customer', customerEmail: m.customer_email || '', customerPhone: m.customer_phone,
          amount: m.estimated_offer ? Number(m.estimated_offer) : undefined,
          rawData: m,
        });
      });

      // Orders
      (orderRes.data || []).forEach((o: any) => {
        const isDeposit = ['grillz-builder', 'custom-inquiry'].includes(o.order_source);
        allActivities.push({
          id: o.id, type: 'order', source: 'order', sourceTable: 'orders',
          status: o.status || 'pending', created_at: o.created_at,
          configuration: o.configuration || {},
          amount: o.total_amount ? Number(o.total_amount) : undefined,
          productName: isDeposit ? `Deposit — ${o.order_source?.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}` : `Order #${o.shopify_order_id || o.id.slice(0, 8)}`,
          customerName: o.customer_name || 'Customer', customerEmail: o.customer_email || '', customerPhone: null,
          orderSource: o.order_source, shopifyOrderId: o.shopify_order_id,
          shippingStatus: o.shipping_status, trackingNumber: o.tracking_number,
          rawData: o,
        });
      });

      // CAD Requests
      (cadRes.data || []).forEach((c: any) => {
        allActivities.push({
          id: c.id, type: 'cad', source: 'cad_request', sourceTable: 'cad_requests',
          status: c.status || 'pending', created_at: c.created_at || '',
          configuration: {
            jewelry_type: c.jewelry_type, metal_type: c.metal_type, metal_purity: c.metal_purity,
            shape: c.shape, style: c.style, ring_size: c.ring_size, carat_size: c.carat_size,
            setting: c.setting, band: c.band, engraving_text: c.engraving_text,
            grillz_type: c.grillz_type, top_teeth: c.top_teeth, bottom_teeth: c.bottom_teeth,
            budget: c.budget, timeline: c.timeline, priority: c.priority,
            cad_file_urls: c.cad_file_urls, reference_images: c.reference_images,
          },
          productName: c.ring_product_name || c.jewelry_type || 'CAD Request',
          customerName: c.customer_name || 'Customer', customerEmail: c.customer_email || '', customerPhone: null,
          notes: c.client_notes || c.admin_notes,
          rawData: c,
        });
      });

      // CAD Resize Requests — resolve customer from linked order
      const orderMap = new Map<string, any>();
      (orderRes.data || []).forEach((o: any) => orderMap.set(o.id, o));

      (cadResizeRes.data || []).forEach((r: any) => {
        const linkedOrder = orderMap.get(r.order_id);
        allActivities.push({
          id: r.id, type: 'cad', source: 'cad_resize', sourceTable: 'cad_resize_requests',
          status: r.status || 'pending', created_at: r.created_at || '',
          configuration: {
            current_size: r.current_size, requested_size: r.requested_size,
            metal_type: r.metal_type, shape: r.shape, style: r.style,
            product_name: r.product_name,
          },
          productName: `Resize ${r.current_size} → ${r.requested_size}${r.product_name ? ` (${r.product_name})` : ''}`,
          customerName: linkedOrder?.customer_name || 'Customer',
          customerEmail: linkedOrder?.customer_email || '',
          customerPhone: null,
          notes: r.admin_notes,
          rawData: r,
        });
      });

      setActivities(allActivities);
    } catch (err) {
      console.error('Failed to fetch customer hub data:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Debounced fetch: coalesces rapid realtime bursts into a single refetch after 2s.
  const debouncedFetch = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => fetchAll(), 2000);
  }, [fetchAll]);

  // Hybrid live-update strategy (cost-optimized):
  // - Realtime kept only for tables still in `supabase_realtime` publication: orders, cad_requests, cad_resize_requests.
  // - Lead tables (saved_designs, grill/custom/design/appointments/metal) are polled every 45s
  //   and instantly refetched on tab focus to preserve UX without per-write broadcast cost.
  useEffect(() => {
    if (!clientId) return;
    const tables = ['orders', 'cad_requests', 'cad_resize_requests'] as const;
    const channel = supabase.channel(`customer-hub-${clientId}`);
    for (const table of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `client_id=eq.${clientId}` }, () => { debouncedFetch(); });
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [clientId, debouncedFetch]);

  // Background polling for tables no longer broadcast via realtime
  useEffect(() => {
    if (!clientId) return;
    const interval = setInterval(() => { fetchAll(); }, 45000);
    return () => clearInterval(interval);
  }, [clientId, fetchAll]);

  // Instant refresh when user returns to the tab
  useEffect(() => {
    const onFocus = () => { fetchAll(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchAll]);

  const customers = useMemo(() => {
    const map = new Map<string, CustomerProfile>();

    for (const act of activities) {
      const email = act.customerEmail?.toLowerCase().trim();
      if (!email) continue;

      if (!map.has(email)) {
        map.set(email, {
          email,
          name: act.customerName,
          phone: act.customerPhone,
          activities: [],
          overallStatus: 'new',
          totalValue: 0,
          hasDeposit: false,
          firstSeen: act.created_at,
          lastSeen: act.created_at,
          submissionCount: 0,
          activityTypes: new Set(),
        });
      }

      const profile = map.get(email)!;
      profile.activities.push(act);
      if (act.type !== 'cad') {
        profile.submissionCount++;
      }

      // Use latest name/phone (exclude internal CAD actions from lastSeen)
      if (act.type !== 'cad' && new Date(act.created_at) > new Date(profile.lastSeen)) {
        profile.lastSeen = act.created_at;
        if (act.customerName) profile.name = act.customerName;
        if (act.customerPhone) profile.phone = act.customerPhone;
      }
      // Derive overallStatus from the latest lead-type activity regardless of chronological order
      if (act.type === 'lead' || act.type === 'metal_iq') {
        const leadTables = ['saved_designs', 'grill_form_leads', 'custom_enquiry_leads', 'design_requests', 'diamond_form_leads', 'metal_buying_leads', 'appointment_bookings'];
        const existingLeadActivities = profile.activities.filter(a => (a.type === 'lead' || a.type === 'metal_iq') && leadTables.includes(a.sourceTable));
        const latestLeadAct = existingLeadActivities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
        if (latestLeadAct) {
          profile.overallStatus = latestLeadAct.status;
        }
      }
      if (new Date(act.created_at) < new Date(profile.firstSeen)) {
        profile.firstSeen = act.created_at;
      }

      if (act.amount) profile.totalValue += act.amount;
      if (act.type === 'order' && ['grillz-builder', 'custom-inquiry'].includes(act.orderSource || '')) {
        profile.hasDeposit = true;
      }

      // Track activity types
      if (act.type === 'lead') profile.activityTypes.add('lead');
      if (act.type === 'booking') profile.activityTypes.add('booking');
      if (act.type === 'order') profile.activityTypes.add(profile.hasDeposit ? 'deposit' : 'order');
      if (act.type === 'metal_iq') profile.activityTypes.add('metal_iq');
      if (act.type === 'cad') profile.activityTypes.add('cad');
    }

    // Sort activities within each profile (newest first)
    for (const profile of map.values()) {
      profile.activities.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    // Sort customers by lastSeen desc
    return Array.from(map.values()).sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
  }, [activities]);

  return { customers, activities, loading, refetch: fetchAll };
}
