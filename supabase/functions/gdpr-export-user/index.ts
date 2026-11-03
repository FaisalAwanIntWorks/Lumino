import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { denyReadOnlyAdmin } from "../_shared/admin-access.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExportResult {
  success: boolean;
  downloadUrl?: string;
  dataExported: string[];
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
    const { customerEmail, gdprRequestId } = await req.json();

    if (!customerEmail) {
      return new Response(
        JSON.stringify({ success: false, error: 'Customer email is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log(`Starting GDPR data export for: ${customerEmail}`);

    const exportData: Record<string, any> = {
      exportDate: new Date().toISOString(),
      customerEmail,
      data: {},
    };

    const dataExported: string[] = [];

    // Export saved designs
    const { data: savedDesigns } = await supabaseClient
      .from('saved_designs')
      .select('*')
      .eq('customer_email', customerEmail);
    
    if (savedDesigns && savedDesigns.length > 0) {
      exportData.data.savedDesigns = savedDesigns;
      dataExported.push('saved_designs');
      console.log(`Exported ${savedDesigns.length} saved designs`);
    }

    // Export orders
    const { data: orders } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('customer_email', customerEmail);
    
    if (orders && orders.length > 0) {
      exportData.data.orders = orders;
      dataExported.push('orders');
      console.log(`Exported ${orders.length} orders`);
    }

    // Export AI chat history (if tracked by email)
    const { data: chatSessions } = await supabaseClient
      .from('ai_chat_sessions')
      .select(`
        *,
        ai_chat_messages (*)
      `)
      .eq('session_id', customerEmail);
    
    if (chatSessions && chatSessions.length > 0) {
      exportData.data.chatHistory = chatSessions;
      dataExported.push('chat_history');
      console.log(`Exported ${chatSessions.length} chat sessions`);
    }

    // Export analytics events (anonymized)
    const { data: analyticsEvents } = await supabaseClient
      .from('analytics_events')
      .select('event_type, created_at, metadata')
      .eq('metadata->>customer_email', customerEmail)
      .limit(100);
    
    if (analyticsEvents && analyticsEvents.length > 0) {
      exportData.data.analytics = analyticsEvents;
      dataExported.push('analytics');
    }

    // In a real implementation, you would:
    // 1. Create a JSON/CSV file
    // 2. Upload to storage bucket
    // 3. Generate a signed URL (7-day expiry)
    // 4. Store URL in gdpr_requests table
    // 5. Send email notification

    const exportJson = JSON.stringify(exportData, null, 2);
    const exportSizeMB = exportJson.length / (1024 * 1024);

    // Update GDPR request
    if (gdprRequestId) {
      await supabaseClient
        .from('gdpr_requests')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          data_exported_url: `exports/${customerEmail}_${Date.now()}.json`,
          notes: `Exported ${dataExported.length} data categories (${exportSizeMB.toFixed(2)} MB)`,
        })
        .eq('id', gdprRequestId);
    }

    const result: ExportResult = {
      success: true,
      dataExported,
      // In production, return signed URL here
      downloadUrl: `data:application/json;base64,${btoa(exportJson)}`,
    };

    console.log(`GDPR export completed for ${customerEmail}:`, result);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('GDPR export failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
