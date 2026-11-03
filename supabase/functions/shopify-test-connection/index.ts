import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // === AUTHENTICATION CHECK ===
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Authentication required' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the JWT token and get user
    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !userData?.user) {
      console.error('Auth error:', authError?.message);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid authentication' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const userId = userData.user.id;

    // === ROLE-BASED ACCESS CONTROL ===
    // Check if user is agency_admin
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    const isAdmin = roleData?.role === 'agency_admin';

    // If not admin, verify user is a client owner
    if (!isAdmin) {
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (clientError || !clientData) {
        console.error('Client lookup error:', clientError?.message);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Only client owners or admins can test Shopify credentials' 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
        );
      }
    }

    // === PROCESS REQUEST ===
    const { storeUrl, accessToken, tokenType = 'storefront' } = await req.json();

    if (!storeUrl || !accessToken) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Store URL and Access Token are required' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const validTokenTypes = ['admin', 'storefront'];
    if (!validTokenTypes.includes(tokenType)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid token type. Use "admin" or "storefront".' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Clean and validate store URL
    const cleanUrl = storeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const storeDomain = cleanUrl.includes('.myshopify.com') 
      ? cleanUrl 
      : `${cleanUrl}.myshopify.com`;

    // Different endpoints and headers based on token type
    if (tokenType === 'admin') {
      // Test Admin API
      const adminApiUrl = `https://${storeDomain}/admin/api/2024-07/graphql.json`;
      
      const adminTestQuery = `
        query {
          shop {
            name
            currencyCode
            primaryDomain {
              host
            }
          }
        }
      `;

      const adminResponse = await fetch(adminApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query: adminTestQuery }),
      });

      const adminResult = await adminResponse.json();

      if (adminResult.errors) {
        console.error('Shopify Admin API errors:', adminResult.errors);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Invalid Admin API credentials or insufficient permissions'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }

      if (adminResult.data?.shop) {
        return new Response(
          JSON.stringify({ 
            success: true,
            tokenType: 'admin',
            shop: {
              name: adminResult.data.shop.name,
              domain: adminResult.data.shop.primaryDomain.host,
              currency: adminResult.data.shop.currencyCode,
            },
            message: 'Admin API connection successful'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      // Test Storefront API
      const storefrontApiUrl = `https://${storeDomain}/api/2024-01/graphql.json`;
      
      const storefrontTestQuery = `
        query {
          shop {
            name
            primaryDomain {
              host
            }
          }
        }
      `;

      const storefrontResponse = await fetch(storefrontApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Storefront-Access-Token': accessToken,
        },
        body: JSON.stringify({ query: storefrontTestQuery }),
      });

      const storefrontResult = await storefrontResponse.json();

      if (storefrontResult.errors) {
        console.error('Shopify Storefront API errors:', storefrontResult.errors);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Invalid Storefront API credentials or insufficient permissions'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }

      if (storefrontResult.data?.shop) {
        return new Response(
          JSON.stringify({ 
            success: true,
            tokenType: 'storefront',
            shop: {
              name: storefrontResult.data.shop.name,
              domain: storefrontResult.data.shop.primaryDomain.host,
            },
            message: 'Storefront API connection successful'
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Unable to verify store connection' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );

  } catch (error) {
    // Log detailed error for debugging but return sanitized message to client
    console.error('Error testing Shopify connection:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Failed to test connection' 
        // Removed: detailed error message that could leak internal info
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
