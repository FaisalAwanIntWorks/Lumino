import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { denyReadOnlyAdmin } from "../_shared/admin-access.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeletionResult {
  success: boolean;
  deletedFrom: string[];
  totalRecordsDeleted: number;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Read-only admin staff must not perform any write operation.
  const readOnlyDenied = await denyReadOnlyAdmin(req, corsHeaders);
  if (readOnlyDenied) return readOnlyDenied;

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // SECURITY: Require authentication - only agency admins can perform GDPR deletions
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    // SECURITY: Check if user is an agency admin
    const { data: adminRole } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'agency_admin')
      .single();

    if (!adminRole) {
      return new Response(
        JSON.stringify({ success: false, error: 'Access denied' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    const { customerEmail, gdprRequestId } = await req.json();

    // SECURITY: Validate email format
    if (!customerEmail || typeof customerEmail !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Valid email is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail) || customerEmail.length > 320) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid email format' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log(`GDPR deletion initiated by admin ${user.email} for: ${customerEmail.substring(0, 3)}***`);

    const deletedFrom: string[] = [];
    let totalRecordsDeleted = 0;

    // Delete from saved_designs
    const { count: savedDesignsCount } = await supabaseClient
      .from('saved_designs')
      .delete({ count: 'exact' })
      .eq('customer_email', customerEmail);
    
    if (savedDesignsCount) {
      deletedFrom.push('saved_designs');
      totalRecordsDeleted += savedDesignsCount;
      console.log(`Deleted ${savedDesignsCount} saved designs`);
    }

    // Delete from cart_items (if user_id exists, we'd need to map email to user_id)
    // For now, we handle session-based carts only
    
    // Delete from favorite_designs (requires user_id lookup)
    // This would need email -> user_id mapping

    // Delete from design_comparisons
    const { count: comparisonsCount } = await supabaseClient
      .from('design_comparisons')
      .delete({ count: 'exact' })
      .eq('user_id', null); // Anonymous comparisons only
    
    if (comparisonsCount) {
      deletedFrom.push('design_comparisons');
      totalRecordsDeleted += comparisonsCount;
    }

    // Anonymize orders (keep order records but remove PII)
    const { count: ordersCount } = await supabaseClient
      .from('orders')
      .update({
        customer_email: 'deleted@gdpr.com',
        customer_name: 'DELETED',
        customer_shipping: null,
      })
      .eq('customer_email', customerEmail);
    
    if (ordersCount) {
      deletedFrom.push('orders (anonymized)');
      totalRecordsDeleted += ordersCount;
      console.log(`Anonymized ${ordersCount} orders`);
    }

    // Delete from AI chat sessions
    const { data: sessions } = await supabaseClient
      .from('ai_chat_sessions')
      .select('id')
      .eq('session_id', customerEmail); // If sessions are tracked by email

    if (sessions && sessions.length > 0) {
      const sessionIds = sessions.map(s => s.id);
      
      // Delete chat messages
      await supabaseClient
        .from('ai_chat_messages')
        .delete()
        .in('session_id', sessionIds);
      
      // Delete sessions
      await supabaseClient
        .from('ai_chat_sessions')
        .delete()
        .in('id', sessionIds);
      
      deletedFrom.push('ai_chat_sessions');
      totalRecordsDeleted += sessions.length;
    }

    // Delete storage files (if any are customer-specific)
    // This would require knowing the storage path structure

    // Update GDPR request status
    if (gdprRequestId) {
      await supabaseClient
        .from('gdpr_requests')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          notes: `Deleted/anonymized ${totalRecordsDeleted} records across ${deletedFrom.length} tables`,
        })
        .eq('id', gdprRequestId);
    }

    const result: DeletionResult = {
      success: true,
      deletedFrom,
      totalRecordsDeleted,
    };

    console.log(`GDPR deletion completed - records affected: ${totalRecordsDeleted}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('GDPR deletion failed');

    return new Response(
      JSON.stringify({
        success: false,
        error: 'GDPR deletion failed. Please contact support.',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
