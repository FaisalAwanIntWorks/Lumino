import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { clientId, formType, attributes } = await req.json();

    if (!clientId || !formType || !attributes) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get client info
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('user_id, shopify_store_url, shopify_checkout_domain, company_name')
      .eq('id', clientId)
      .maybeSingle();

    if (clientError || !client || !client.shopify_store_url) {
      return new Response(JSON.stringify({ error: 'Client not found or Shopify not connected' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get variant ID from config
    const configTable = formType === 'grillz'
      ? 'client_grill_config'
      : formType === 'ring_builder'
        ? 'client_ring_form_config'
        : 'client_custom_enquiry_config';
    const { data: configData } = await supabase
      .from(configTable)
      .select('shopify_product_id, shopify_variant_id, deposit_amount')
      .eq('client_id', clientId)
      .maybeSingle();

    let variantId = (configData as any)?.shopify_variant_id;
    let productId = (configData as any)?.shopify_product_id;
    const depositAmount = (configData as any)?.deposit_amount;

    if (!variantId) {
      return new Response(JSON.stringify({ error: 'Deposit product not pushed to Shopify yet. Please push to Shopify first.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Decrypt tokens
    const [adminTokenResult, storefrontTokenResult] = await Promise.all([
      supabase.rpc('decrypt_shopify_token', { client_user_id: client.user_id }),
      supabase.rpc('decrypt_storefront_token', { client_user_id: client.user_id }),
    ]);

    const adminToken = adminTokenResult.data;
    const storefrontToken = storefrontTokenResult.data;

    if (!storefrontToken) {
      return new Response(JSON.stringify({ error: 'Storefront token not configured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const shopifyDomain = client.shopify_store_url.replace('https://', '').replace('http://', '');
    const checkoutHost = (client as any).shopify_checkout_domain
      ? String((client as any).shopify_checkout_domain).replace(/^https?:\/\//, '').replace(/\/$/, '')
      : null;
    const swapHost = (url: string): string => {
      if (!checkoutHost) return url;
      try { const u = new URL(url); u.host = checkoutHost; return u.toString(); } catch { return url; }
    };

    // Validate the saved variant still exists via Admin API before attempting cart
    if (adminToken && productId) {
      try {
        const checkRes = await fetch(`https://${shopifyDomain}/admin/api/2024-07/products/${productId}.json`, {
          method: 'GET',
          headers: { 'X-Shopify-Access-Token': adminToken },
        });

        if (!checkRes.ok) {
          console.warn(`Saved product ${productId} no longer exists (${checkRes.status}). Attempting auto-recreate...`);
          // Auto-recreate the deposit product
          const recreated = await recreateDepositProduct(
            shopifyDomain, adminToken, client.company_name, formType, depositAmount, supabase, configTable, clientId
          );
          if (recreated) {
            productId = recreated.productId;
            variantId = recreated.variantId;
          } else {
            return new Response(JSON.stringify({ error: 'Deposit product was deleted from Shopify and could not be recreated. Please re-push from settings.' }), {
              status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      } catch (checkErr) {
        console.warn('Could not validate product, proceeding with stored ID:', checkErr);
      }
    }

    // Build line item attributes
    const lineAttributes = Object.entries(attributes).map(([key, value]) => ({
      key, value: String(value),
    }));

    const formatVariantId = (id: string): string => {
      return id.startsWith('gid://') ? id : `gid://shopify/ProductVariant/${id}`;
    };

    const sourceName = formType === 'grillz'
      ? 'Grillz-builder-aurezo'
      : formType === 'ring_builder'
        ? 'Ring-builder-aurezo'
        : 'Custom-inquiry-aurezo';

    const cartCreateMutation = `
      mutation cartCreate($input: CartInput!) {
        cartCreate(input: $input) {
          cart {
            id
            checkoutUrl
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const cartInput = {
      lines: [{
        merchandiseId: formatVariantId(variantId),
        quantity: 1,
        attributes: lineAttributes,
      }],
      attributes: [
        { key: '_source', value: sourceName },
        { key: '_client_id', value: clientId },
      ],
      note: `${sourceName} - Form Deposit Order`,
    };

    const storefrontApiUrl = `https://${shopifyDomain}/api/2024-01/graphql.json`;

    const shopifyResponse = await fetch(storefrontApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': storefrontToken,
      },
      body: JSON.stringify({
        query: cartCreateMutation,
        variables: { input: cartInput },
      }),
    });

    if (!shopifyResponse.ok) {
      const errText = await shopifyResponse.text();
      console.error('Shopify Storefront error:', errText);
      return new Response(JSON.stringify({ error: 'Failed to create Shopify cart' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const shopifyData = await shopifyResponse.json();
    const cart = shopifyData?.data?.cartCreate?.cart;
    const userErrors = shopifyData?.data?.cartCreate?.userErrors;

    if (userErrors?.length > 0) {
      const errMsg = userErrors[0].message;
      console.error('Cart user errors:', userErrors);

      // If merchandise doesn't exist, try auto-recreate once
      if (errMsg.includes('does not exist') && adminToken && depositAmount) {
        console.log('Variant does not exist on storefront. Attempting auto-recreate and retry...');
        const recreated = await recreateDepositProduct(
          shopifyDomain, adminToken, client.company_name, formType, depositAmount, supabase, configTable, clientId
        );
        if (recreated) {
          // Retry cart creation with new variant
          const retryCartInput = {
            ...cartInput,
            lines: [{
              ...cartInput.lines[0],
              merchandiseId: formatVariantId(recreated.variantId),
            }],
          };

          const retryResponse = await fetch(storefrontApiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Storefront-Access-Token': storefrontToken,
            },
            body: JSON.stringify({
              query: cartCreateMutation,
              variables: { input: retryCartInput },
            }),
          });

          if (retryResponse.ok) {
            const retryData = await retryResponse.json();
            const retryCart = retryData?.data?.cartCreate?.cart;
            const retryErrors = retryData?.data?.cartCreate?.userErrors;

            if (retryErrors?.length > 0) {
              console.error('Retry cart errors:', retryErrors);
              return new Response(JSON.stringify({ error: retryErrors[0].message }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            if (retryCart?.checkoutUrl) {
              return new Response(JSON.stringify({ success: true, checkoutUrl: swapHost(retryCart.checkoutUrl) }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
          }
        }
        return new Response(JSON.stringify({ error: 'Deposit product was stale and could not be auto-fixed. Please re-push from settings.' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ error: errMsg }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!cart?.checkoutUrl) {
      console.error('No checkout URL returned:', shopifyData);
      return new Response(JSON.stringify({ error: 'No checkout URL returned from Shopify' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      checkoutUrl: swapHost(cart.checkoutUrl),
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

/** Recreate a deposit product, publish it, and save IDs back to config */
async function recreateDepositProduct(
  shopifyDomain: string,
  adminToken: string,
  companyName: string | null,
  formType: string,
  depositAmount: number | null,
  supabase: any,
  configTable: string,
  clientId: string,
): Promise<{ productId: string; variantId: string } | null> {
  if (!depositAmount) {
    console.error('Cannot recreate deposit product: no deposit amount configured');
    return null;
  }

  const productTitle = formType === 'grillz'
    ? 'Grillz Builder Deposit'
    : formType === 'ring_builder'
      ? 'Ring Builder Deposit'
      : 'Custom Enquiry Deposit';

  try {
    const createRes = await fetch(`https://${shopifyDomain}/admin/api/2024-07/products.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': adminToken },
      body: JSON.stringify({
        product: {
          title: productTitle,
          vendor: companyName || 'Aurezo',
          product_type: 'Deposit',
          status: 'active',
          tags: 'Aurezo_form_deposit',
          variants: [{
            price: depositAmount.toFixed(2),
            inventory_management: null,
            requires_shipping: false,
          }],
        },
      }),
    });

    if (!createRes.ok) {
      console.error('Auto-recreate failed:', await createRes.text());
      return null;
    }

    const createData = await createRes.json();
    const productId = String(createData.product.id);
    const variantId = String(createData.product.variants[0].id);
    const productGid = `gid://shopify/Product/${productId}`;

    // Publish to sales channels
    const adminApiUrl = `https://${shopifyDomain}/admin/api/2024-07/graphql.json`;
    const publishMutation = `mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        publishable { publicationCount }
        userErrors { field message }
      }
    }`;

    // Fetch publication IDs
    try {
      const pubRes = await fetch(adminApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': adminToken },
        body: JSON.stringify({ query: `query { publications(first: 20) { edges { node { id name } } } }` }),
      });
      const pubData = await pubRes.json();
      const pubs = pubData.data?.publications?.edges || [];

      for (const pub of pubs) {
        const name = pub.node.name.toLowerCase();
        if (name.includes('headless') || name === 'online store') {
          await fetch(adminApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': adminToken },
            body: JSON.stringify({
              query: publishMutation,
              variables: { id: productGid, input: [{ publicationId: pub.node.id }] },
            }),
          });
          console.log(`Auto-published recreated deposit to ${pub.node.name}`);
        }
      }
    } catch (pubErr) {
      console.warn('Could not publish recreated product:', pubErr);
    }

    // Save new IDs
    await supabase.from(configTable).update({
      shopify_product_id: productId,
      shopify_variant_id: variantId,
    }).eq('client_id', clientId);

    console.log(`Auto-recreated deposit product ${productId} with variant ${variantId}`);
    return { productId, variantId };
  } catch (err) {
    console.error('recreateDepositProduct error:', err);
    return null;
  }
}
