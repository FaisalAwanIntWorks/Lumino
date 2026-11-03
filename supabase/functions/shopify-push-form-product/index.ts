import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function checkShopAccess(shopifyDomain: string, adminToken: string) {
  const url = `https://${shopifyDomain}/admin/api/2024-07/shop.json`;
  try {
    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': adminToken },
    });
    const bodyText = await res.text();
    let shopName: string | null = null;
    try { shopName = JSON.parse(bodyText)?.shop?.name ?? null; } catch { /* noop */ }
    console.log(`[shop.json] status=${res.status} shopName=${shopName ?? 'null'} body=${bodyText.slice(0, 200)}`);
    return { status: res.status, ok: res.ok, shopName };
  } catch (err) {
    console.error('[shop.json] fetch failed:', err);
    return { status: 0, ok: false, shopName: null };
  }
}

async function fetchPublicationIds(shopifyDomain: string, adminToken: string) {
  const adminApiUrl = `https://${shopifyDomain}/admin/api/2024-07/graphql.json`;
  let headlessId: string | null = null;
  let onlineStoreId: string | null = null;

  try {
    const pubResponse = await fetch(adminApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': adminToken,
      },
      body: JSON.stringify({
        query: `query { publications(first: 20) { edges { node { id name } } } }`
      })
    });
    const pubData = await pubResponse.json();
    if (pubData.errors) {
      console.warn(`[publications] status=${pubResponse.status} errors=${JSON.stringify(pubData.errors)}`);
    }
    const publications = pubData.data?.publications?.edges || [];
    console.log(`[publications] status=${pubResponse.status} names=${JSON.stringify(publications.map((p: any) => p.node.name))}`);

    const headlessChannel = publications.find(
      (p: any) => p.node.name.toLowerCase().includes('headless')
    );
    const onlineStoreChannel = publications.find(
      (p: any) => p.node.name.toLowerCase() === 'online store'
    );

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
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': adminToken,
      },
      body: JSON.stringify({
        query: `mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            publishable { publicationCount }
            userErrors { field message }
          }
        }`,
        variables: {
          id: productGid,
          input: [{ publicationId }]
        }
      })
    });
    const data = await res.json();
    const errors = data.data?.publishablePublish?.userErrors;
    if (errors?.length > 0) {
      console.warn(`Failed to publish to ${channelName}:`, errors);
      return false;
    }
    console.log(`Published ${productGid} to ${channelName}`);
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

    const { clientId, formType, depositAmount } = await req.json();

    if (!clientId || !formType || !depositAmount) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get client info
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

    // Decrypt admin token
    const { data: adminToken, error: tokenError } = await supabase
      .rpc('decrypt_shopify_token', { client_user_id: client.user_id });

    if (tokenError || !adminToken) {
      return new Response(JSON.stringify({ error: 'Shopify admin token not configured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const shopifyDomain = client.shopify_store_url.replace('https://', '').replace('http://', '');
    const productTitle = formType === 'grillz'
      ? 'Grillz Builder Deposit'
      : formType === 'ring_builder'
        ? 'Ring Builder Deposit'
        : 'Custom Enquiry Deposit';
    const configTable = formType === 'grillz'
      ? 'client_grill_config'
      : formType === 'ring_builder'
        ? 'client_ring_form_config'
        : 'client_custom_enquiry_config';

    // Sanity-check token + store BEFORE doing anything else.
    const shopCheck = await checkShopAccess(shopifyDomain, adminToken);
    if (!shopCheck.ok) {
      const msg = shopCheck.status === 401 || shopCheck.status === 403
        ? 'Shopify admin token is invalid or revoked. Please re-paste the custom app Admin API access token in JewlX → Settings → Shopify.'
        : shopCheck.status === 404
          ? `Shopify store "${shopifyDomain}" not reachable (404). Check the store URL is correct.`
          : `Shopify shop.json check failed (status ${shopCheck.status}).`;
      return new Response(JSON.stringify({ error: msg, shopify_status: shopCheck.status }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch publication IDs for publishing to sales channels
    const { headlessId, onlineStoreId } = await fetchPublicationIds(shopifyDomain, adminToken);

    // Check if product already exists
    const { data: existingConfig } = await supabase
      .from(configTable)
      .select('shopify_product_id, shopify_variant_id')
      .eq('client_id', clientId)
      .maybeSingle();

    let productId = (existingConfig as any)?.shopify_product_id;
    let variantId = (existingConfig as any)?.shopify_variant_id;

    if (productId) {
      // Update existing product price
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
        // Product may have been deleted, create new one
        console.warn(`Existing product update failed (status ${updateRes.status}), will recreate`);
        productId = null;
        variantId = null;
      } else {
        // Re-publish existing product to ensure it's on sales channels
        const productGid = `gid://shopify/Product/${productId}`;
        if (headlessId) await publishProduct(shopifyDomain, adminToken, productGid, headlessId, 'Headless');
        if (onlineStoreId) await publishProduct(shopifyDomain, adminToken, productGid, onlineStoreId, 'Online Store');
      }
    }

    if (!productId) {
      // Create new product
      const createRes = await fetch(`https://${shopifyDomain}/admin/api/2024-07/products.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': adminToken },
        body: JSON.stringify({
          product: {
            title: productTitle,
            vendor: client.company_name || 'JewelX',
            product_type: 'Deposit',
            status: 'active',
            tags: 'JewelX_form_deposit',
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
        const callLimit = createRes.headers.get('x-shopify-shop-api-call-limit');
        console.error(`[products.create] status=${createRes.status} callLimit=${callLimit} body=${errText}`);

        // Shopify returns 404 with body {"errors":"Not Found"} when the token lacks write_products scope.
        const scopeLikely = createRes.status === 401 ||
          createRes.status === 403 ||
          (createRes.status === 404 && errText.includes('Not Found'));
        const msg = scopeLikely
          ? 'Shopify token is missing required scopes. Open the custom app in Shopify Admin, enable write_products, read_publications, write_publications, then re-install and paste the new Admin API access token into JewlX → Settings → Shopify.'
          : `Failed to create Shopify product (status ${createRes.status}).`;

        return new Response(JSON.stringify({ error: msg, shopify_status: createRes.status, shopify_body: errText.slice(0, 500) }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const createData = await createRes.json();
      productId = String(createData.product.id);
      variantId = String(createData.product.variants[0].id);

      // Publish newly created product to sales channels
      const productGid = `gid://shopify/Product/${productId}`;
      if (headlessId) await publishProduct(shopifyDomain, adminToken, productGid, headlessId, 'Headless');
      if (onlineStoreId) await publishProduct(shopifyDomain, adminToken, productGid, onlineStoreId, 'Online Store');
    }

    // Save back to config
    await supabase.from(configTable).update({
      shopify_product_id: productId,
      shopify_variant_id: variantId,
    }).eq('client_id', clientId);

    const published = !!(headlessId || onlineStoreId);
    console.log(`Deposit product ${productId} saved. Published to sales channels: ${published}`);

    return new Response(JSON.stringify({
      success: true,
      shopify_product_id: productId,
      shopify_variant_id: variantId,
      published,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
