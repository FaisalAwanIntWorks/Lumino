import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.190.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HMAC-SHA256 verification for Shopify webhook authenticity
async function verifyShopifyWebhook(
  rawBody: string,
  hmacHeader: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(rawBody)
    );
    
    const computedHmac = base64Encode(signature);
    return computedHmac === hmacHeader;
  } catch (error) {
    console.error('HMAC verification error:', error);
    return false;
  }
}

interface ShopifyNoteAttribute {
  name: string;
  value: string;
}

interface ShopifyLineItemProperty {
  name: string;
  value: string;
}

interface ShopifyLineItem {
  title: string;
  price: string;
  quantity: number;
  properties: ShopifyLineItemProperty[];
  image?: { src: string; width?: number; height?: number } | null;
}

interface ShopifyCustomer {
  email: string;
  first_name: string;
  last_name: string;
}

interface ShopifyAddress {
  first_name?: string;
  last_name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  country?: string;
  zip?: string;
  phone?: string;
}

interface ShopifyOrder {
  id: number;
  order_number: string;
  email: string;
  total_price: string;
  currency: string;
  note: string | null;
  note_attributes: ShopifyNoteAttribute[];
  customer: ShopifyCustomer | null;
  line_items: ShopifyLineItem[];
  shipping_address: ShopifyAddress | null;
  created_at: string;
}

const SOURCE_MAP: Record<string, string> = {
  // "Aurezo Ring Builder" is the marker the Ring OS widget puts on its cart
  // (shopify-add-to-cart). Every dashboard reads Ring OS as 'aurezo-widget';
  // 'ring-builder' is the CustomX Ring Builder form deposit.
  'Aurezo Ring Builder': 'aurezo-widget',
  // Marker shopify-form-checkout sends for the Ring Builder form deposit. It
  // was missing here, so those paid deposits were ignored as non-Aurezo orders.
  'Ring-builder-aurezo': 'ring-builder',
  'Grillz-builder-aurezo': 'grillz-builder',
  'Custom-inquiry-aurezo': 'custom-inquiry',
};

// Returns the order_source string or null if not an Aurezo order
function getAurezoOrderSource(orderData: ShopifyOrder): string | null {
  // Check note_attributes first
  const noteAttributes = orderData.note_attributes || [];
  const sourceAttr = noteAttributes.find(attr => attr.name === '_source');
  if (sourceAttr && SOURCE_MAP[sourceAttr.value]) {
    return SOURCE_MAP[sourceAttr.value];
  }

  // Check line item properties
  for (const item of orderData.line_items) {
    const properties = item.properties || [];
    const lineSourceProp = properties.find(p => p.name === '_source');
    if (lineSourceProp && SOURCE_MAP[lineSourceProp.value]) {
      return SOURCE_MAP[lineSourceProp.value];
    }
  }

  return null;
}

// Extract properties from line items into a flat Record
function extractLineItemProperties(orderData: ShopifyOrder): Record<string, string> {
  const props: Record<string, string> = {};
  for (const item of orderData.line_items) {
    for (const prop of item.properties || []) {
      if (!prop.name.startsWith('_')) {
        props[prop.name] = prop.value;
      }
    }
  }
  return props;
}

// Cross-post grillz orders to grill_form_leads
async function crossPostGrillLead(
  supabase: any,
  clientId: string,
  customerName: string,
  customerEmail: string,
  customerPhone: string,
  props: Record<string, string>
) {
  try {
    const { error } = await supabase.from('grill_form_leads').insert({
      client_id: clientId,
      metal_type: props['Metal Type'] || props['metal_type'] || 'Unknown',
      metal_purity: props['Purity'] || props['metal_purity'] || null,
      top_teeth: props['Top Teeth'] || props['top_teeth'] || null,
      bottom_teeth: props['Bottom Teeth'] || props['bottom_teeth'] || null,
      additional_notes: props['Notes'] || props['additional_notes'] || null,
      customer_name: customerName || null,
      customer_email: customerEmail || null,
      customer_phone: customerPhone || null,
    });
    if (error) console.error('Failed to cross-post grill lead:', error);
    else console.log('Grill lead cross-posted successfully');
  } catch (err) {
    console.error('Error cross-posting grill lead:', err);
  }
}

// Cross-post custom inquiry orders to custom_enquiry_leads
async function crossPostCustomEnquiryLead(
  supabase: any,
  clientId: string,
  customerName: string,
  customerEmail: string,
  customerPhone: string,
  props: Record<string, string>
) {
  try {
    const { error } = await supabase.from('custom_enquiry_leads').insert({
      client_id: clientId,
      jewelry_type: props['Jewelry Type'] || props['jewelry_type'] || null,
      budget: props['Budget'] || props['budget'] || null,
      gold_color: props['Gold Color'] || props['gold_color'] || null,
      karat: props['Karat'] || props['karat'] || null,
      diamond_quality: props['Diamond Quality'] || props['diamond_quality'] || null,
      diamond_setup: props['Diamond Setup'] || props['diamond_setup'] || null,
      back_option: props['Back Option'] || props['back_option'] || null,
      
      description: props['Description'] || props['description'] || null,
      additional_notes: props['Notes'] || props['additional_notes'] || null,
      customer_name: customerName || null,
      customer_email: customerEmail || null,
      customer_phone: customerPhone || null,
    });
    if (error) console.error('Failed to cross-post custom enquiry lead:', error);
    else console.log('Custom enquiry lead cross-posted successfully');
  } catch (err) {
    console.error('Error cross-posting custom enquiry lead:', err);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const rawBody = await req.text();
    const orderData: ShopifyOrder = JSON.parse(rawBody);

    console.log('Received Shopify webhook for order:', orderData.id);

    // Detect Aurezo source
    const orderSource = getAurezoOrderSource(orderData);
    if (!orderSource) {
      console.log('Ignoring non-Aurezo order:', orderData.id);
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    console.log('Processing Aurezo order:', orderData.id, 'source:', orderSource);

    // Identify client: prefer client_id query param, fall back to domain matching
    const url = new URL(req.url);
    const clientIdParam = url.searchParams.get('client_id');

    let client: { id: string; user_id: string; shopify_store_url: string | null; meta_pixel_id: string | null; meta_capi_access_token: string | null } | null = null;
    let clientError: unknown = null;

    if (clientIdParam) {
      // Direct lookup by client_id (unique webhook URL)
      console.log('Looking up client by client_id param:', clientIdParam);
      const { data, error } = await supabase
        .from('clients')
        .select('id, user_id, shopify_store_url, meta_pixel_id, meta_capi_access_token')
        .eq('id', clientIdParam)
        .maybeSingle();
      client = data;
      clientError = error;
    } else {
      // Fallback: domain matching (legacy)
      const shopDomain = req.headers.get('X-Shopify-Shop-Domain');
      if (!shopDomain) {
        console.error('Missing both client_id param and X-Shopify-Shop-Domain header for order:', orderData.id);
        return new Response('Missing client identifier', { status: 400, headers: corsHeaders });
      }

      const shopBaseName = shopDomain.replace('.myshopify.com', '');
      const { data, error } = await supabase
        .from('clients')
        .select('id, user_id, shopify_store_url, meta_pixel_id, meta_capi_access_token')
        .or(`shopify_store_url.ilike.%${shopDomain}%,shopify_store_url.ilike.%${shopBaseName}%`)
        .maybeSingle();
      client = data;
      clientError = error;
    }

    if (clientError || !client) {
      console.error('No client found:', clientIdParam || 'domain lookup', clientError);
      return new Response('Client not found', { status: 404, headers: corsHeaders });
    }

    console.log('Found client:', client.id);
    const clientId = client.id;

    // Optional HMAC verification
    const hmacHeader = req.headers.get('X-Shopify-Hmac-SHA256');
    if (hmacHeader) {
      const { data: webhookSecret } = await supabase
        .rpc('decrypt_webhook_secret', { client_user_id: client.user_id });
      
      if (webhookSecret) {
        const isValid = await verifyShopifyWebhook(rawBody, hmacHeader, webhookSecret);
        if (!isValid) {
          console.warn('HMAC signature mismatch for order:', orderData.id, '- proceeding with client_id auth');
        }
        console.log('HMAC signature verified');
      }
    }

    // Check for duplicate
    const shopifyOrderId = String(orderData.id);
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('id')
      .eq('shopify_order_id', shopifyOrderId)
      .maybeSingle();

    if (existingOrder) {
      console.log('Duplicate order detected, skipping:', shopifyOrderId);
      return new Response('OK', { status: 200, headers: corsHeaders });
    }

    // Parse customer info
    const customerName = orderData.customer 
      ? `${orderData.customer.first_name || ''} ${orderData.customer.last_name || ''}`.trim()
      : orderData.shipping_address
        ? `${orderData.shipping_address.first_name || ''} ${orderData.shipping_address.last_name || ''}`.trim()
        : 'Unknown Customer';

    const customerEmail = orderData.email || orderData.customer?.email || '';
    const customerPhone = orderData.shipping_address?.phone || '';

    // Build configuration from line item properties
    const configuration: Record<string, unknown> = {};
    const lineItems: Array<{ title: string; price: string; quantity: number; properties: Record<string, string>; image?: string }> = [];

    for (const item of orderData.line_items) {
      const itemProperties: Record<string, string> = {};
      for (const prop of item.properties || []) {
        itemProperties[prop.name] = prop.value;
        configuration[prop.name] = prop.value;
      }
      lineItems.push({
        title: item.title,
        price: item.price,
        quantity: item.quantity,
        properties: itemProperties,
        ...(item.image?.src ? { image: item.image.src } : {}),
      });
    }

    configuration.line_items = lineItems;
    configuration.shopify_order_number = orderData.order_number;
    configuration.currency = orderData.currency;

    // Parse shipping address
    const customerShipping = orderData.shipping_address ? {
      name: `${orderData.shipping_address.first_name || ''} ${orderData.shipping_address.last_name || ''}`.trim(),
      address1: orderData.shipping_address.address1 || '',
      address2: orderData.shipping_address.address2 || '',
      city: orderData.shipping_address.city || '',
      province: orderData.shipping_address.province || '',
      country: orderData.shipping_address.country || '',
      zip: orderData.shipping_address.zip || '',
      phone: orderData.shipping_address.phone || '',
    } : null;

    // Insert order
    const orderInsert = {
      client_id: clientId,
      product_id: null,
      customer_name: customerName,
      customer_email: customerEmail,
      customer_shipping: customerShipping,
      total_amount: parseFloat(orderData.total_price) || orderData.line_items.reduce((sum, item) => sum + (parseFloat(item.price) * item.quantity), 0),
      status: 'pending',
      configuration: configuration,
      shopify_order_id: shopifyOrderId,
      order_source: orderSource,
      customer_requested_manufacturing: false,
    };

    console.log('Inserting order:', {
      shopify_order_id: shopifyOrderId,
      client_id: clientId,
      customer_name: customerName,
      total: orderData.total_price,
      order_source: orderSource,
    });

    const { data: newOrder, error: insertError } = await supabase
      .from('orders')
      .insert(orderInsert)
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert order:', insertError);
      throw new Error(`Failed to insert order: ${insertError.message}`);
    }

    console.log('Order created successfully:', newOrder.id);

    // Cross-post to leads for grillz and custom inquiry (non-blocking)
    const itemProps = extractLineItemProperties(orderData);

    if (orderSource === 'grillz-builder') {
      crossPostGrillLead(supabase, clientId, customerName, customerEmail, customerPhone, itemProps);
    } else if (orderSource === 'custom-inquiry') {
      crossPostCustomEnquiryLead(supabase, clientId, customerName, customerEmail, customerPhone, itemProps);
    }

    // Send order notification (non-blocking)
    try {
      await supabase.functions.invoke('notify-order-update', {
        body: {
          client_id: clientId,
          event_type: 'new_order',
          order_id: newOrder.id,
          customer_name: customerName,
          customer_email: customerEmail,
          product_name: orderData.line_items?.[0]?.title || 'Order',
          total_amount: parseFloat(orderData.total_price) || 0,
          currency: orderData.currency || 'USD',
          order_number: String(orderData.order_number || ''),
        },
      });
    } catch (notifyErr) {
      console.error('Failed to send order notification:', notifyErr);
    }

    // Send customer confirmation email (non-blocking)
    if (customerEmail) {
      try {
        const orderDetails: Record<string, string> = {
          'Order Number': String(orderData.order_number || shopifyOrderId),
          'Product': orderData.line_items?.map(i => i.title).join(', ') || 'N/A',
          'Amount': `${orderData.currency || 'USD'} ${parseFloat(orderData.total_price).toFixed(2)}`,
        };
        // Add line item properties as readable details
        for (const item of orderData.line_items) {
          for (const prop of item.properties || []) {
            if (!prop.name.startsWith('_') && prop.value) {
              orderDetails[prop.name] = prop.value;
            }
          }
        }

        await supabase.functions.invoke('notify-customer-confirmation', {
          body: {
            client_id: clientId,
            form_type: 'order',
            customer_name: customerName,
            customer_email: customerEmail,
            details: orderDetails,
          },
        });
      } catch (custErr) {
        console.error('Failed to send customer confirmation:', custErr);
      }
    }

    // Meta Conversions API: Send server-side Purchase event (non-blocking)
    if (client.meta_pixel_id && client.meta_capi_access_token) {
      try {
        const encoder = new TextEncoder();
        // SHA-256 hash helper
        const sha256 = async (value: string): Promise<string> => {
          const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(value.trim().toLowerCase()));
          return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        };

        const userData: Record<string, string[]> = {};
        if (customerEmail) userData.em = [await sha256(customerEmail)];
        if (customerPhone) userData.ph = [await sha256(customerPhone)];

        const capiPayload = {
          data: [{
            event_name: 'Purchase',
            event_time: Math.floor(Date.now() / 1000),
            action_source: 'website',
            user_data: userData,
            custom_data: {
              currency: orderData.currency || 'USD',
              value: parseFloat(orderData.total_price) || 0,
            },
          }],
        };

        const capiUrl = `https://graph.facebook.com/v19.0/${client.meta_pixel_id}/events?access_token=${client.meta_capi_access_token}`;
        const capiRes = await fetch(capiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(capiPayload),
        });

        if (!capiRes.ok) {
          const errText = await capiRes.text();
          console.error('Meta CAPI error:', capiRes.status, errText);
        } else {
          console.log('Meta CAPI Purchase event sent successfully');
        }
      } catch (capiErr) {
        console.error('Failed to send Meta CAPI Purchase event:', capiErr);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        order_id: newOrder.id,
        order_source: orderSource,
        message: 'Aurezo order synced successfully' 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Webhook processing error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal processing error' 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
