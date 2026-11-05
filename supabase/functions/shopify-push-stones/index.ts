import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Helper to add delay between requests (rate limiting)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const { clientId, batchSize = 15, retryFailedOnly = false } = await req.json();
    console.log(`Pushing stones to Shopify for client: ${clientId}, batch size: ${batchSize}`);

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: 'Client ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user has access to this client
    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'agency_admin')
      .single();

    const { data: clientOwner } = await supabase
      .from('clients')
      .select('id')
      .eq('id', clientId)
      .eq('user_id', user.id)
      .single();

    if (!adminRole && !clientOwner) {
      return new Response(
        JSON.stringify({ error: 'Not authorized to push stones for this client' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get client's Shopify credentials
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('user_id, shopify_store_url, company_name')
      .eq('id', clientId)
      .single();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!client.shopify_store_url) {
      return new Response(
        JSON.stringify({ error: 'Shopify store not connected. Please connect your Shopify store first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt Shopify access token
    const { data: accessToken, error: decryptError } = await supabase
      .rpc('decrypt_shopify_token', { client_user_id: client.user_id });

    if (decryptError || !accessToken) {
      console.error('Failed to decrypt Shopify token:', decryptError);
      return new Response(
        JSON.stringify({ error: 'Shopify credentials not configured properly' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get total count of enabled stones for progress tracking
    const { count: totalEnabledCount } = await supabase
      .from('client_stone_inventory')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('is_enabled', true);

    // Build query for items to sync
    let remainingQuery = supabase
      .from('client_stone_inventory')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('is_enabled', true);

    if (retryFailedOnly) {
      remainingQuery = remainingQuery.eq('shopify_sync_status', 'failed');
    } else {
      // Include both null and 'pending' status items
      remainingQuery = remainingQuery.or('shopify_sync_status.is.null,shopify_sync_status.eq.pending');
    }

    const { count: remainingBeforeBatch } = await remainingQuery;

    // Fetch stones to process
    let stoneQuery = supabase
      .from('client_stone_inventory')
      .select('*')
      .eq('client_id', clientId)
      .eq('is_enabled', true);

    if (retryFailedOnly) {
      stoneQuery = stoneQuery.eq('shopify_sync_status', 'failed');
    } else {
      // Include both null and 'pending' status items
      stoneQuery = stoneQuery.or('shopify_sync_status.is.null,shopify_sync_status.eq.pending');
    }

    const { data: stones, error: stoneError } = await stoneQuery.limit(batchSize);

    if (stoneError) {
      console.error('Error fetching stones:', stoneError);
      throw stoneError;
    }

    if (!stones || stones.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true,
          hasMore: false,
          processed: 0,
          remaining: 0,
          total: totalEnabledCount || 0,
          created: 0,
          updated: 0,
          failed: 0,
          message: 'All stones already synced to Shopify'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing batch of ${stones.length} stones`);

    const shopifyDomain = client.shopify_store_url.replace('https://', '').replace('http://', '');
    const restApiUrl = `https://${shopifyDomain}/admin/api/2024-07/products.json`;
    const adminApiUrl = `https://${shopifyDomain}/admin/api/2024-07/graphql.json`;

    // Fetch publication IDs - publish to both Headless and Online Store for cart permalink support
    let publicationId: string | null = null;
    let publicationName: string = '';
    let onlineStorePublicationId: string | null = null;
    try {
      const pubResponse = await fetch(adminApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          query: `query { publications(first: 20) { edges { node { id name } } } }`
        })
      });
      const pubData = await pubResponse.json();
      const publications = pubData.data?.publications?.edges || [];
      
      // Log all available publications for debugging
      console.log('Available publications:', publications.map((p: any) => p.node.name));
      
      // Try to find Headless channel first
      const headlessChannel = publications.find(
        (p: any) => p.node.name.toLowerCase().includes('headless')
      );
      
      // Capture Online Store ID for publishing (cart permalink support)
      const onlineStoreChannel = publications.find(
        (p: any) => p.node.name.toLowerCase() === 'online store'
      );
      
      if (headlessChannel) {
        publicationId = headlessChannel.node.id;
        publicationName = 'Headless';
      } else {
        // DO NOT fall back to Online Store - products will be active but unlisted
        console.warn('Headless channel not found. Products will be active but not published to any sales channel.');
        publicationId = null;
      }
      
      // Always capture Online Store ID for publishing
      if (onlineStoreChannel) {
        onlineStorePublicationId = onlineStoreChannel.node.id;
      }
      
      console.log(`Publication ID: ${publicationId || 'not found'} (${publicationName})`);
      console.log(`Online Store ID (for cart permalinks): ${onlineStorePublicationId || 'not found'}`);
    } catch (pubError) {
      console.warn('Failed to fetch publications, products will be active but unpublished:', pubError);
    }

    const results = {
      created: 0,
      updated: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const stone of stones) {
      try {
        const stoneTypeName = stone.stone_type === 'natural' ? 'Natural Diamond' : 'Lab-Created Diamond';
        const productTitle = `${stoneTypeName} ${stone.carat}ct ${stone.color} ${stone.clarity}`;
        
        const productDescription = `
          <p><strong>${stone.carat} Carat ${stoneTypeName}</strong></p>
          <ul>
            <li><strong>Color Grade:</strong> ${stone.color}</li>
            <li><strong>Clarity Grade:</strong> ${stone.clarity}</li>
            <li><strong>Type:</strong> ${stone.stone_type === 'natural' ? 'Natural' : 'Lab-Created'}</li>
          </ul>
          <p>This stunning diamond is ready to be set in your perfect ring.</p>
        `;

        const isUpdate = !!stone.shopify_product_id;

        if (isUpdate) {
          // Update existing product using GraphQL
          const adminApiUrl = `https://${shopifyDomain}/admin/api/2024-07/graphql.json`;
          
          const updateMutation = `
            mutation productUpdate($input: ProductInput!) {
              productUpdate(input: $input) {
                product {
                  id
                  variants(first: 1) {
                    edges {
                      node {
                        id
                      }
                    }
                  }
                }
                userErrors {
                  field
                  message
                }
              }
            }
          `;

          const updateResponse = await fetch(adminApiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': accessToken,
            },
            body: JSON.stringify({
              query: updateMutation,
              variables: {
                input: {
                  id: stone.shopify_product_id,
                  title: productTitle,
                  descriptionHtml: productDescription,
                }
              }
            })
          });

          const updateData = await updateResponse.json();
          
          if (updateData.data?.productUpdate?.userErrors?.length > 0) {
            throw new Error(updateData.data.productUpdate.userErrors[0].message);
          }

          results.updated++;
        } else {
          // Create new stone product
          const productPayload = {
            product: {
              title: productTitle,
              body_html: productDescription,
              vendor: client.company_name || 'Aurezo',
              product_type: 'Diamond',
              status: 'active', // Active but published only to Headless channel (not visible in Online Store)
              tags: ['Aurezo', 'Diamond', stone.stone_type, stone.color, stone.clarity].join(', '),
              variants: [{
                price: String(stone.price),
                sku: stone.sku || `${stone.stone_type}-${stone.carat}ct-${stone.color}-${stone.clarity}`,
                inventory_management: null,  // Not tracked (Be-Jewelled model)
                inventory_policy: 'continue',
              }],
              metafields: [
                { namespace: 'aurezo', key: 'stone_type', value: stone.stone_type, type: 'single_line_text_field' },
                { namespace: 'aurezo', key: 'carat', value: String(stone.carat), type: 'number_decimal' },
                { namespace: 'aurezo', key: 'color', value: stone.color, type: 'single_line_text_field' },
                { namespace: 'aurezo', key: 'clarity', value: stone.clarity, type: 'single_line_text_field' },
              ],
            }
          };

          const createResponse = await fetch(restApiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': accessToken,
            },
            body: JSON.stringify(productPayload)
          });

          if (!createResponse.ok) {
            const errorText = await createResponse.text();
            throw new Error(`Shopify API error: ${createResponse.status} - ${errorText}`);
          }

          const createData = await createResponse.json();
          const shopifyProduct = createData.product;

          if (!shopifyProduct) {
            throw new Error('No product returned from Shopify');
          }

          // Update stone with Shopify IDs
          const shopifyProductGid = `gid://shopify/Product/${shopifyProduct.id}`;
          const shopifyVariantGid = shopifyProduct.variants?.[0]?.id 
            ? `gid://shopify/ProductVariant/${shopifyProduct.variants[0].id}`
            : null;

          // Publish product to Headless channel if available
          if (publicationId) {
            try {
              const publishResponse = await fetch(adminApiUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Shopify-Access-Token': accessToken,
                },
                body: JSON.stringify({
                  query: `mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
                    publishablePublish(id: $id, input: $input) {
                      publishable { publicationCount }
                      userErrors { field message }
                    }
                  }`,
                  variables: {
                    id: shopifyProductGid,
                    input: [{ publicationId: publicationId }]
                  }
                })
              });
              const publishData = await publishResponse.json();
              if (publishData.data?.publishablePublish?.userErrors?.length > 0) {
                console.warn(`Failed to publish stone to ${publicationName}:`, publishData.data.publishablePublish.userErrors);
              } else {
                console.log(`Published stone ${shopifyProductGid} to ${publicationName}`);
              }
            } catch (publishError) {
              console.warn(`Failed to publish stone to ${publicationName}:`, publishError);
            }
          }

          // Publish to Online Store for cart permalink support (Be-Jewelled model)
          if (onlineStorePublicationId) {
            try {
              const publishOnlineResponse = await fetch(adminApiUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Shopify-Access-Token': accessToken,
                },
                body: JSON.stringify({
                  query: `mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
                    publishablePublish(id: $id, input: $input) {
                      publishable { publicationCount }
                      userErrors { field message }
                    }
                  }`,
                  variables: {
                    id: shopifyProductGid,
                    input: [{ publicationId: onlineStorePublicationId }]
                  }
                })
              });
              const publishOnlineData = await publishOnlineResponse.json();
              if (publishOnlineData.data?.publishablePublish?.userErrors?.length > 0) {
                console.warn(`Failed to publish stone to Online Store:`, publishOnlineData.data.publishablePublish.userErrors);
              } else {
                console.log(`Published stone ${shopifyProductGid} to Online Store (cart permalink support)`);
              }
            } catch (publishOnlineError) {
              console.warn(`Failed to publish stone to Online Store:`, publishOnlineError);
            }
          }

          await supabase
            .from('client_stone_inventory')
            .update({
              shopify_product_id: shopifyProductGid,
              shopify_variant_id: shopifyVariantGid,
              shopify_sync_status: 'synced',
            })
            .eq('id', stone.id);

          results.created++;
        }

        // Mark as synced
        await supabase
          .from('client_stone_inventory')
          .update({
            shopify_sync_status: 'synced',
          })
          .eq('id', stone.id);

      } catch (error: any) {
        console.error(`Error processing stone ${stone.id}:`, error);
        results.failed++;
        results.errors.push(`${stone.stone_type} ${stone.carat}ct ${stone.color} ${stone.clarity}: ${error.message}`);

        await supabase
          .from('client_stone_inventory')
          .update({
            shopify_sync_status: 'failed',
          })
          .eq('id', stone.id);
      }

      // Rate limit delay
      await delay(600);
    }

    const processedInBatch = results.created + results.updated + results.failed;
    const remainingAfterBatch = Math.max(0, (remainingBeforeBatch || 0) - processedInBatch);
    const hasMore = remainingAfterBatch > 0;

    return new Response(
      JSON.stringify({
        success: true,
        hasMore: hasMore,
        processed: processedInBatch,
        remaining: remainingAfterBatch,
        total: totalEnabledCount || 0,
        created: results.created,
        updated: results.updated,
        failed: results.failed,
        errors: results.errors.length > 0 ? results.errors : undefined,
        message: hasMore 
          ? `Processed ${processedInBatch} stones, ${remainingAfterBatch} remaining...`
          : `Successfully synced stones to Shopify. Created: ${results.created}, Updated: ${results.updated}, Failed: ${results.failed}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Shopify stones push error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to push stones to Shopify',
        success: false 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
