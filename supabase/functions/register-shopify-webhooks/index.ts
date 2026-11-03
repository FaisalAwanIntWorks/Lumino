import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Generate a secure random webhook secret
function generateWebhookSecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user
    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !authData.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = authData.user.id;

    // Get client info and Shopify credentials
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, user_id, shopify_store_url')
      .eq('user_id', userId)
      .maybeSingle();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: 'Client not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!client.shopify_store_url) {
      return new Response(
        JSON.stringify({ error: 'Shopify store not connected' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt Admin API token
    const { data: accessToken, error: tokenError } = await supabase
      .rpc('decrypt_shopify_token', { client_user_id: userId });

    if (tokenError || !accessToken) {
      return new Response(
        JSON.stringify({ error: 'Shopify access token not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const shopifyDomain = client.shopify_store_url.replace('https://', '').replace('http://', '');
    const adminApiUrl = `https://${shopifyDomain}/admin/api/2024-07/graphql.json`;

    // Generate a new webhook secret
    const webhookSecret = generateWebhookSecret();

    // Webhook endpoint URL
    const webhookUrl = `${supabaseUrl}/functions/v1/shopify-order-webhook`;

    // Check for existing webhooks to avoid duplicates
    const listWebhooksQuery = `
      query {
        webhookSubscriptions(first: 50) {
          edges {
            node {
              id
              topic
              endpoint {
                ... on WebhookHttpEndpoint {
                  callbackUrl
                }
              }
            }
          }
        }
      }
    `;

    const listResponse = await fetch(adminApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query: listWebhooksQuery }),
    });

    const listResult = await listResponse.json();
    const existingWebhooks = listResult.data?.webhookSubscriptions?.edges || [];

    // Check if webhook already exists
    const existingWebhook = existingWebhooks.find((edge: any) => {
      return edge.node.topic === 'ORDERS_CREATE' && 
             edge.node.endpoint?.callbackUrl === webhookUrl;
    });

    if (existingWebhook) {
      console.log('Webhook already registered:', existingWebhook.node.id);
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Webhook already registered',
          webhook_id: existingWebhook.node.id,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Register new webhook
    const createWebhookMutation = `
      mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
        webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
          webhookSubscription {
            id
            topic
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const createResponse = await fetch(adminApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({
        query: createWebhookMutation,
        variables: {
          topic: 'ORDERS_CREATE',
          webhookSubscription: {
            callbackUrl: webhookUrl,
            format: 'JSON',
          },
        },
      }),
    });

    const createResult = await createResponse.json();

    if (createResult.errors || createResult.data?.webhookSubscriptionCreate?.userErrors?.length > 0) {
      const errors = createResult.errors || createResult.data.webhookSubscriptionCreate.userErrors;
      console.error('Failed to create webhook:', errors);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to register webhook with Shopify',
          details: errors,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const newWebhook = createResult.data.webhookSubscriptionCreate.webhookSubscription;
    console.log('Webhook registered:', newWebhook.id);

    // Store encrypted webhook secret
    const { error: encryptError } = await supabase
      .rpc('encrypt_webhook_secret', { 
        client_user_id: userId, 
        secret: webhookSecret 
      });

    if (encryptError) {
      console.error('Failed to store webhook secret:', encryptError);
      // Don't fail - webhook is registered, just secret storage failed
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Webhook registered successfully',
        webhook_id: newWebhook.id,
        topic: newWebhook.topic,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Webhook registration error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
