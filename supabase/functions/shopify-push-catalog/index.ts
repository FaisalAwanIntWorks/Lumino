import { usesDiamondTypeCheckout } from "../_shared/ring-os-diamond-checkout.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { dualAuth, checkUnkeyRateLimit, corsHeaders as unkeyCorHeaders } from '../_shared/unkey.ts';

const corsHeaders = {
  ...unkeyCorHeaders,
};

interface CatalogItem {
  id: string;
  master_db_id: string;
  is_enabled: boolean;
  custom_price: number | null;
  shopify_product_id: string | null;
  shopify_variant_id: string | null;
  my_master_db_data: {
    id: string;
    combination_id: string;
    style_id: string;
    style_name: string | null;
    shank_id: string;
    shank_name: string | null;
    visual_color: string;
    visual_color_name: string | null;
    shape_id: string;
    shape_name: string | null;
    base_price: number | null;
    image_url_0: string | null;
    image_url_1: string | null;
    image_url_2: string | null;
    image_url_3: string | null;
    folder_path: string | null;
    image_0_filename: string | null;
    image_1_filename: string | null;
    image_2_filename: string | null;
    image_3_filename: string | null;
    product_name: string | null;
  } | null;
}

interface CaratOption {
  carat_value: number;
  display_name: string;
  price_adjustment: number | null;
}

interface MetalVariant {
  variant_name: string;
  color_family: string;
  price: number | null;
}

// Generate product title from combination ID
function formatProductTitle(combinationId: string): string {
  return combinationId
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ') + ' Ring';
}

// Generate product description
function generateProductDescription(item: CatalogItem['my_master_db_data']): string {
  if (!item) return 'Beautiful handcrafted ring from JewelX.';
  
  const style = item.style_name || item.style_id;
  const shank = item.shank_name || item.shank_id;
  const color = item.visual_color_name || item.visual_color;
  const shape = item.shape_name || item.shape_id;
  
  return `Exquisite ${style} ring featuring a ${shank} band design in ${color} gold, crafted to showcase a stunning ${shape} center stone. Handcrafted with precision and care.`;
}

// CloudFront CDN base URL for ring assets (matches frontend cdn-utils.ts)
const CLOUDFRONT_CDN_BASE = 'https://do2z856wqq7wu.cloudfront.net';

// Ring styles whose renders also exist on the CDN as `.webp` at the same path
// (keep in sync with WEBP_RENDER_STYLE_FOLDERS in src/lib/cdn-utils.ts).
const WEBP_RENDER_STYLE_FOLDERS = new Set<string>(['halo', 'solitaire', 'pave-rail', 'three-stone']);

// Swap a CDN render URL to its `.webp` twin when its style folder is WebP-enabled.
function toWebpRenderUrl(url: string): string {
  if (!url.startsWith(`${CLOUDFRONT_CDN_BASE}/`)) return url;
  const styleFolder = url.slice(CLOUDFRONT_CDN_BASE.length + 1).split('/')[0]?.toLowerCase();
  if (!styleFolder || !WEBP_RENDER_STYLE_FOLDERS.has(styleFolder)) return url;
  return url.replace(/\.png(?=$|[?#])/i, '.webp');
}

/**
 * Server-side WebP fallback: there is no <img onError> here, so before handing
 * a `.webp` URL to Shopify we confirm it exists on the CDN and otherwise use
 * the `.png` original (which is what the URL was before the swap).
 */
async function withPngFallback(url: string | null): Promise<string | null> {
  if (!url || !/\.webp(?=$|[?#])/i.test(url)) return url;
  try {
    const head = await fetch(url, { method: 'HEAD' });
    if (head.ok) return url;
  } catch (err) {
    console.warn(`WebP HEAD check failed for ${url}:`, err);
  }
  const png = url.replace(/\.webp(?=$|[?#])/i, '.png');
  console.warn(`WebP not available on CDN, falling back to PNG: ${png}`);
  return png;
}

function getImageUrl(item: CatalogItem['my_master_db_data'], index: number): string | null {
  if (!item) return null;

  // Priority 1: Construct CDN URL from folder_path + filename
  const filenameKey = `image_${index}_filename` as keyof typeof item;
  const filename = item[filenameKey] as string | null;
  if (filename && item.folder_path) {
    let cdnPath = item.folder_path.replace(/^rings\//, '');
    // Capitalize "solitaire" to match CDN bucket structure (matches frontend cdn-utils.ts)
    cdnPath = cdnPath.replace(/^solitaire\//, 'Solitaire/');
    return toWebpRenderUrl(`${CLOUDFRONT_CDN_BASE}/${cdnPath}/${filename}`);
  }

  // Priority 2: Fallback to stored image_url column
  const urlKey = `image_url_${index}` as keyof typeof item;
  if (item[urlKey]) return item[urlKey] as string;

  return null;
}

// Helper to add delay between requests (rate limiting)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Default carat ranges if client hasn't configured any.
// Carat is a marketplace FILTER ONLY — no dollar add-on.
// Mirrors src/lib/ring-os-defaults.ts → RING_OS_DEFAULT_CARAT_OPTIONS.
const DEFAULT_CARAT_OPTIONS: CaratOption[] = [
  { carat_value: 0.5, display_name: '0.50ct', price_adjustment: 0 },
  { carat_value: 1.0, display_name: '1.00ct', price_adjustment: 0 },
  { carat_value: 1.5, display_name: '1.50ct', price_adjustment: 0 },
  { carat_value: 2.0, display_name: '2.00ct', price_adjustment: 0 },
  { carat_value: 2.5, display_name: '2.50ct', price_adjustment: 0 },
  { carat_value: 3.0, display_name: '3.00ct+', price_adjustment: 0 },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Dual auth: supports both API key and JWT
    const authResult = await dualAuth(req);
    if (authResult instanceof Response) return authResult;

    // Check Unkey rate limit for API key auth
    const rateLimited = checkUnkeyRateLimit(authResult);
    if (rateLimited) return rateLimited;

    // Parse request with batch size parameter (default: 15 items per batch)
    // retryFailedOnly: if true, only process items with 'failed' status
    const { clientId: bodyClientId, batchSize = 15, retryFailedOnly = false } = await req.json();
    
    // Use clientId from auth (API key metadata) or from request body
    const clientId = authResult.clientId || bodyClientId;
    console.log(`Pushing catalog to Shopify for client: ${clientId}, batch size: ${batchSize}, retryFailedOnly: ${retryFailedOnly}, auth: ${authResult.method}`);

    if (!clientId) {
      return new Response(
        JSON.stringify({ error: 'Client ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For API key auth, the key is already scoped to a client — skip user-level access checks
    // For JWT auth, verify user has access to this client
    if (authResult.method === 'jwt' && authResult.userId) {
      const { data: adminRole } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', authResult.userId)
        .eq('role', 'agency_admin')
        .single();

      const { data: clientOwner } = await supabase
        .from('clients')
        .select('id')
        .eq('id', clientId)
        .eq('user_id', authResult.userId)
        .single();

      if (!adminRole && !clientOwner) {
        return new Response(
          JSON.stringify({ error: 'Not authorized to push catalog for this client' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
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

    // Get total count of enabled items for progress tracking
    const { count: totalEnabledCount } = await supabase
      .from('client_ring_catalog')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('is_enabled', true);

    // Build query based on mode:
    // - retryFailedOnly: only items with 'failed' status
    // - normal push: items with null OR 'pending' status (never synced)
    let remainingQuery = supabase
      .from('client_ring_catalog')
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

    // Fetch items to process - LIMITED to batchSize
    let catalogQuery = supabase
      .from('client_ring_catalog')
      .select(`
        id,
        master_db_id,
        is_enabled,
        custom_price,
        shopify_product_id,
        shopify_variant_id,
        my_master_db_data (*)
      `)
      .eq('client_id', clientId)
      .eq('is_enabled', true);

    if (retryFailedOnly) {
      catalogQuery = catalogQuery.eq('shopify_sync_status', 'failed');
    } else {
      // Include both null and 'pending' status items
      catalogQuery = catalogQuery.or('shopify_sync_status.is.null,shopify_sync_status.eq.pending');
    }

    const { data: catalogItems, error: catalogError } = await catalogQuery.limit(batchSize);

    if (catalogError) {
      console.error('Error fetching catalog:', catalogError);
      throw catalogError;
    }

    if (!catalogItems || catalogItems.length === 0) {
      // No more items to process - all done!
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
          message: 'All products already synced to Shopify'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing batch of ${catalogItems.length} items (${remainingBeforeBatch} remaining before this batch)`);

    // Get client's metal variants for variant creation
    const { data: metalVariants } = await supabase
      .from('client_metal_variants')
      .select('variant_name, color_family, price')
      .eq('client_id', clientId)
      .order('display_order');

    // Get client's carat options for variant creation
    const { data: clientCaratOptions } = await supabase
      .from('client_carat_options')
      .select('carat_value, display_name, price_adjustment')
      .eq('client_id', clientId)
      .eq('is_enabled', true)
      .order('carat_value');

    // Use client's carat options or fall back to defaults
    const caratOptions: CaratOption[] = clientCaratOptions && clientCaratOptions.length > 0 
      ? clientCaratOptions 
      : DEFAULT_CARAT_OPTIONS;

    // Fetch widget pricing mode (estimates vs custom_pricing)
    const { data: pricingPrefs } = await supabase
      .from('client_onboarding_preferences')
      .select('widget_pricing_mode, widget_deposit_amount')
      .eq('client_id', clientId)
      .maybeSingle();

    // 24k-style accounts push full prices (lab checkout) while keeping Estimates stored.
    const pricingMode = usesDiamondTypeCheckout(clientId)
      ? 'custom_pricing'
      : (pricingPrefs?.widget_pricing_mode || 'estimates');
    const depositAmount = Number(pricingPrefs?.widget_deposit_amount) || 0;
    console.log(`Pricing mode: ${pricingMode}, deposit amount: ${depositAmount}`);

    console.log(`Using ${caratOptions.length} carat options for variant creation`);

    const shopifyDomain = client.shopify_store_url.replace('https://', '').replace('http://', '');
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

    // Process items sequentially with delay to avoid Shopify rate limits
    for (const item of catalogItems as any[]) {
      try {
        if (!item.my_master_db_data) {
          results.failed++;
          results.errors.push(`No master data for item ${item.id}`);
          await supabase
            .from('client_ring_catalog')
            .update({ shopify_sync_status: 'failed' })
            .eq('id', item.id);
          continue;
        }

        const masterData = item.my_master_db_data;
        const productTitle = masterData.product_name || formatProductTitle(masterData.combination_id);
        const productDescription = generateProductDescription(masterData);
        const basePrice = item.custom_price || masterData.base_price || 0;

        // Build Metal × Carat variant matrix
        const colorFamily = masterData.visual_color;
        const relevantMetals = (metalVariants as MetalVariant[] | null)?.filter(m => m.color_family === colorFamily) || [];
        
        // Build variants: each metal × each carat = one variant
        const variants: Array<{
          option1: string;  // Metal
          option2: string;  // Carat
          price: string;
          sku: string;
        }> = [];

        if (relevantMetals.length > 0) {
          for (const metal of relevantMetals) {
            for (const carat of caratOptions) {
              const variantPrice = pricingMode === 'estimates' && depositAmount > 0
                ? depositAmount
                : basePrice + (metal.price || 0) + (carat.price_adjustment || 0);
              const caratLabel = carat.display_name || `${carat.carat_value}ct`;
              
              variants.push({
                option1: metal.variant_name,
                option2: caratLabel,
                price: String(variantPrice),
                sku: `${masterData.combination_id}-${metal.variant_name.toLowerCase().replace(/\s+/g, '-')}-${carat.carat_value}ct`,
              });
            }
          }
        } else {
          // Fallback if no metals configured - still create carat variants
          for (const carat of caratOptions) {
            const variantPrice = pricingMode === 'estimates' && depositAmount > 0
              ? depositAmount
              : basePrice + (carat.price_adjustment || 0);
            variants.push({
              option1: 'Default',
              option2: carat.display_name || `${carat.carat_value}ct`,
              price: String(variantPrice),
              sku: `${masterData.combination_id}-default-${carat.carat_value}ct`,
            });
          }
        }

        console.log(`Product "${productTitle}" will have ${variants.length} variants (${relevantMetals.length} metals × ${caratOptions.length} carats)`);

        // Collect images - only use front-facing image (angle_0)
        const images: string[] = [];
        const frontImageUrl = await withPngFallback(getImageUrl(masterData, 0));
        if (frontImageUrl) {
          images.push(frontImageUrl);
          console.log(`Image URL for product "${productTitle}": ${frontImageUrl}`);
        } else {
          console.warn(`No image found for product "${productTitle}" - folder_path: ${masterData.folder_path}, image_0_filename: ${masterData.image_0_filename}, image_url_0: ${masterData.image_url_0}`);
        }

        const isUpdate = !!item.shopify_product_id;

        if (isUpdate) {
          // Update product info AND variant prices
          // Step 1: Update product title/description
          const updateMutation = `
            mutation productUpdate($input: ProductInput!) {
              productUpdate(input: $input) {
                product {
                  id
                  variants(first: 250) {
                    edges {
                      node {
                        id
                        title
                        selectedOptions { name value }
                      }
                    }
                  }
                }
                userErrors { field message }
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
                  id: item.shopify_product_id,
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

          // Step 2: Update variant prices using the fetched variant list
          const existingVariants = updateData.data?.productUpdate?.product?.variants?.edges || [];
          console.log(`Updating prices for ${existingVariants.length} existing variants on product "${productTitle}"`);

          // Build a lookup: "Metal / Carat" → calculated price
          const priceMap: Record<string, number> = {};
          for (const v of variants) {
            priceMap[`${v.option1} / ${v.option2}`] = Number(v.price);
          }

          let variantUpdateErrors = 0;
          for (const edge of existingVariants) {
            const shopifyVariant = edge.node;
            const opts = shopifyVariant.selectedOptions || [];
            const metalOpt = opts.find((o: any) => o.name === 'Metal')?.value;
            const caratOpt = opts.find((o: any) => o.name === 'Carat')?.value;
            const key = `${metalOpt} / ${caratOpt}`;
            const newPrice = priceMap[key];

            if (newPrice === undefined) {
              console.warn(`No price mapping for variant "${shopifyVariant.title}" (${key})`);
              continue;
            }

            const variantUpdateResp = await fetch(adminApiUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': accessToken,
              },
              body: JSON.stringify({
                query: `mutation productVariantUpdate($input: ProductVariantInput!) {
                  productVariantUpdate(input: $input) {
                    productVariant { id price }
                    userErrors { field message }
                  }
                }`,
                variables: {
                  input: {
                    id: shopifyVariant.id,
                    price: String(newPrice),
                  }
                }
              })
            });

            const variantData = await variantUpdateResp.json();
            if (variantData.data?.productVariantUpdate?.userErrors?.length > 0) {
              console.error(`Failed to update variant ${shopifyVariant.id}:`, variantData.data.productVariantUpdate.userErrors);
              variantUpdateErrors++;
            }

            // Small delay between variant updates to respect rate limits
            await delay(150);
          }

          if (variantUpdateErrors > 0) {
            console.warn(`${variantUpdateErrors} variant price updates failed for "${productTitle}"`);
          }

          // Update variants map in DB (prices may have changed affecting which variants exist)
          const updatedVariantsMap: Record<string, string> = {};
          for (const edge of existingVariants) {
            const opts = edge.node.selectedOptions || [];
            const metalOpt = opts.find((o: any) => o.name === 'Metal')?.value;
            const caratOpt = opts.find((o: any) => o.name === 'Carat')?.value;
            if (metalOpt && caratOpt) {
              updatedVariantsMap[`${metalOpt} / ${caratOpt}`] = edge.node.id;
            }
          }

          await supabase
            .from('client_ring_catalog')
            .update({
              shopify_variants_map: updatedVariantsMap,
              shopify_synced_at: new Date().toISOString(),
              shopify_sync_status: 'synced',
            })
            .eq('id', item.id);

          results.updated++;
        } else {
          // Create new product using REST API with Metal × Carat variants
          const restApiUrl = `https://${shopifyDomain}/admin/api/2024-07/products.json`;
          
          const productPayload = {
            product: {
              title: productTitle,
              body_html: productDescription,
              vendor: client.company_name || 'JewelX',
              product_type: 'Ring Setting',  // Changed to "Ring Setting" for clarity
              status: 'active', // Active but published only to Headless channel (not visible in Online Store)
              tags: ['JewelX', masterData.style_id, masterData.shape_id, masterData.visual_color, 'Ring Setting'].join(', '),
              options: [
                { name: 'Metal' },
                { name: 'Carat' }  // Add Carat as second option
              ],
              variants: variants.map(v => ({
                option1: v.option1,
                option2: v.option2,  // Add carat to variant
                price: v.price,
                sku: v.sku,
                inventory_management: null,  // Not tracked (Be-Jewelled model)
                inventory_policy: 'continue',
              })),
              images: images.map(src => ({ src })),
              metafields: [
                { namespace: 'jewelx', key: 'combination_id', value: masterData.combination_id, type: 'single_line_text_field' },
                { namespace: 'jewelx', key: 'style_id', value: masterData.style_id, type: 'single_line_text_field' },
                { namespace: 'jewelx', key: 'shank_id', value: masterData.shank_id, type: 'single_line_text_field' },
                { namespace: 'jewelx', key: 'visual_color', value: masterData.visual_color, type: 'single_line_text_field' },
                { namespace: 'jewelx', key: 'shape_id', value: masterData.shape_id, type: 'single_line_text_field' },
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

          // Update catalog item with Shopify IDs
          const newShopifyProductGid = `gid://shopify/Product/${shopifyProduct.id}`;
          const newShopifyVariantGid = shopifyProduct.variants?.[0]?.id 
            ? `gid://shopify/ProductVariant/${shopifyProduct.variants[0].id}`
            : null;

          // Build map: "Metal / Carat" → Shopify Variant GID
          // This allows precise variant lookup during add-to-cart
          const variantsMap: Record<string, string> = {};
          shopifyProduct.variants?.forEach((variant: any, index: number) => {
            const metal = variants[index]?.option1;
            const carat = variants[index]?.option2;
            if (metal && carat && variant.id) {
              const key = `${metal} / ${carat}`;
              variantsMap[key] = `gid://shopify/ProductVariant/${variant.id}`;
            }
          });

          console.log(`Created variants map with ${Object.keys(variantsMap).length} entries`);

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
                    id: newShopifyProductGid,
                    input: [{ publicationId: publicationId }]
                  }
                })
              });
              const publishData = await publishResponse.json();
              if (publishData.data?.publishablePublish?.userErrors?.length > 0) {
                console.warn(`Failed to publish product to ${publicationName}:`, publishData.data.publishablePublish.userErrors);
              } else {
                console.log(`Published product ${newShopifyProductGid} to ${publicationName}`);
              }
            } catch (publishError) {
              console.warn(`Failed to publish product to ${publicationName}:`, publishError);
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
                    id: newShopifyProductGid,
                    input: [{ publicationId: onlineStorePublicationId }]
                  }
                })
              });
              const publishOnlineData = await publishOnlineResponse.json();
              if (publishOnlineData.data?.publishablePublish?.userErrors?.length > 0) {
                console.warn(`Failed to publish product to Online Store:`, publishOnlineData.data.publishablePublish.userErrors);
              } else {
                console.log(`Published product ${newShopifyProductGid} to Online Store (cart permalink support)`);
              }
            } catch (publishOnlineError) {
              console.warn(`Failed to publish product to Online Store:`, publishOnlineError);
            }
          }

          await supabase
            .from('client_ring_catalog')
            .update({
              shopify_product_id: newShopifyProductGid,
              shopify_variant_id: newShopifyVariantGid,
              shopify_variants_map: variantsMap,
              shopify_synced_at: new Date().toISOString(),
              shopify_sync_status: 'synced',
            })
            .eq('id', item.id);

          results.created++;
        }

        // Mark as synced
        await supabase
          .from('client_ring_catalog')
          .update({
            shopify_synced_at: new Date().toISOString(),
            shopify_sync_status: 'synced',
          })
          .eq('id', item.id);

      } catch (error: any) {
        console.error(`Error processing item ${item.id}:`, error);
        results.failed++;
        results.errors.push(`${item.my_master_db_data?.combination_id || item.id}: ${error.message}`);

        // Mark as failed
        await supabase
          .from('client_ring_catalog')
          .update({
            shopify_sync_status: 'failed',
          })
          .eq('id', item.id);
      }

      // Add delay between requests to avoid Shopify rate limits (increased to 600ms for safety)
      await delay(600);
    }

    // Calculate remaining items after this batch
    const processedInBatch = results.created + results.updated + results.failed;
    const remainingAfterBatch = Math.max(0, (remainingBeforeBatch || 0) - processedInBatch);
    const hasMore = remainingAfterBatch > 0;

    // Log analytics event (only log once per full push operation, not per batch)
    if (!hasMore) {
      await supabase
        .from('analytics_events')
        .insert({
          client_id: clientId,
          event_type: 'shopify_catalog_push',
          metadata: {
            total_items: totalEnabledCount,
            created: results.created,
            updated: results.updated,
            failed: results.failed,
          }
        });
    }

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
          ? `Processed ${processedInBatch} items, ${remainingAfterBatch} remaining...`
          : `Successfully synced catalog to Shopify. Created: ${results.created}, Updated: ${results.updated}, Failed: ${results.failed}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Shopify push error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Failed to push catalog to Shopify',
        success: false 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
