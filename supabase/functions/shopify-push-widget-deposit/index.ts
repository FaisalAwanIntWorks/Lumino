import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function fetchPublicationIds(shopifyDomain: string, adminToken: string) {
  const adminApiUrl = `https://${shopifyDomain}/admin/api/2024-07/graphql.json`;
  let headlessId: string | null = null;
  let onlineStoreId: string | null = null;

  try {
    const pubResponse = await fetch(adminApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': adminToken },
      body: JSON.stringify({
        query: `query { publications(first: 20) { edges { node { id name } } } }`
      })
    });
    const pubData = await pubResponse.json();
    const publications = pubData.data?.publications?.edges || [];
    const headlessChannel = publications.find((p: any) => p.node.name.toLowerCase().includes('headless'));
    const onlineStoreChannel = publications.find((p: any) => p.node.name.toLowerCase() === 'online store');
    if (headlessChannel) headlessId = headlessChannel.node.id;
    if (onlineStoreChannel) onlineStoreId = onlineStoreChannel.node.id;
  } catch (err) {
    console.warn('Failed to fetch publications:', err);
  }
  return { headlessId, onlineStoreId };
}

async function publishProduct(shopifyDomain: string, adminToken: string, productGid: string, publicationId: string, channelName: string) {
  const adminApiUrl = `https://${shopifyDomain}/admin/api/2024-07/graphql.json`;
  try {
    const res = await fetch(adminApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': adminToken },
      body: JSON.stringify({
        query: `mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            publishable { publicationCount }
            userErrors { field message }
          }
        }`,
        variables: { id: productGid, input: [{ publicationId }] }
      })
    });
    const data = await res.json();
    const errors = data.data?.publishablePublish?.userErrors;
    if (errors?.length > 0) {
      console.warn(`Failed to publish to ${channelName}:`, errors);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`Failed to publish to ${channelName}:`, err);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // === Authentication ===
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: userData, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid authentication' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const callerId = userData.user.id;

    const { clientId, depositAmount } = await req.json();

    if (!clientId || typeof depositAmount !== 'number' || !Number.isFinite(depositAmount) || depositAmount < 0) {
      return new Response(JSON.stringify({ error: 'Missing or invalid clientId / depositAmount' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('user_id, shopify_store_url, company_name')
      .eq('id', clientId)
      .maybeSingle();

    if (clientError || !client || !client.shopify_store_url) {
      return new Response(JSON.stringify({ error: 'Client not found or Shopify not connected' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === Authorization: owner OR admin (agency_admin/admin_staff) ===
    if (client.user_id !== callerId) {
      const [{ data: isAgencyAdmin }, { data: isAdminStaff }] = await Promise.all([
        supabase.rpc('has_role', { _user_id: callerId, _role: 'agency_admin' }),
        supabase.rpc('has_role', { _user_id: callerId, _role: 'admin_staff' }),
      ]);
      if (!isAgencyAdmin && !isAdminStaff) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const { data: adminToken, error: tokenError } = await supabase
      .rpc('decrypt_shopify_token', { client_user_id: client.user_id });

    if (tokenError || !adminToken) {
      return new Response(JSON.stringify({ error: 'Shopify admin token not configured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const shopifyDomain = client.shopify_store_url.replace('https://', '').replace('http://', '');
    const productTitle = 'Ring OS Widget Deposit';

    const { headlessId, onlineStoreId } = await fetchPublicationIds(shopifyDomain, adminToken);

    // Look up existing widget deposit IDs
    const { data: existingPrefs } = await supabase
      .from('client_onboarding_preferences')
      .select('widget_shopify_product_id, widget_shopify_variant_id')
      .eq('client_id', clientId)
      .maybeSingle();

    let productId = (existingPrefs as any)?.widget_shopify_product_id;
    let variantId = (existingPrefs as any)?.widget_shopify_variant_id;

    if (productId) {
      const updateRes = await fetch(`https://${shopifyDomain}/admin/api/2024-07/products/${productId}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': adminToken },
        body: JSON.stringify({
          product: {
            id: productId,
            title: productTitle,
            variants: [{ id: variantId, price: depositAmount.toFixed(2) }],
          },
        }),
      });

      if (!updateRes.ok) {
        console.warn('Existing widget deposit product update failed (likely deleted), will recreate');
        productId = null;
        variantId = null;
      } else {
        const productGid = `gid://shopify/Product/${productId}`;
        if (headlessId) await publishProduct(shopifyDomain, adminToken, productGid, headlessId, 'Headless');
        if (onlineStoreId) await publishProduct(shopifyDomain, adminToken, productGid, onlineStoreId, 'Online Store');
      }
    }

    if (!productId) {
      const createRes = await fetch(`https://${shopifyDomain}/admin/api/2024-07/products.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': adminToken },
        body: JSON.stringify({
          product: {
            title: productTitle,
            vendor: client.company_name || 'JewelX',
            product_type: 'Deposit',
            status: 'active',
            tags: 'JewelX_widget_deposit',
            variants: [{
              price: depositAmount.toFixed(2),
              inventory_management: null,
              requires_shipping: false,
            }],
          },
        }),
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        console.error('Shopify create error:', errText);
        return new Response(JSON.stringify({ error: 'Failed to create Shopify product' }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const createData = await createRes.json();
      productId = String(createData.product.id);
      variantId = String(createData.product.variants[0].id);

      const productGid = `gid://shopify/Product/${productId}`;
      if (headlessId) await publishProduct(shopifyDomain, adminToken, productGid, headlessId, 'Headless');
      if (onlineStoreId) await publishProduct(shopifyDomain, adminToken, productGid, onlineStoreId, 'Online Store');
    }

    await supabase.from('client_onboarding_preferences').update({
      widget_shopify_product_id: productId,
      widget_shopify_variant_id: variantId,
    }).eq('client_id', clientId);

    const published = !!(headlessId || onlineStoreId);
    console.log(`Widget deposit product ${productId} saved (published: ${published})`);

    return new Response(JSON.stringify({
      success: true,
      shopify_product_id: productId,
      shopify_variant_id: variantId,
      published,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('shopify-push-widget-deposit error:', err);
    return new Response(JSON.stringify({ error: err?.message || 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
