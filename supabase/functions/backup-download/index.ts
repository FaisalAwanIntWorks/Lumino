import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { denyReadOnlyAdmin } from "../_shared/admin-access.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

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

    const { filePath, action = 'download' } = await req.json();

    if (!filePath) {
      return new Response(
        JSON.stringify({ error: 'filePath is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (action === 'signed-url') {
      // Generate a signed URL for direct download
      const { data, error } = await supabaseClient
        .storage
        .from('product-assets')
        .createSignedUrl(filePath, 3600); // 1 hour expiry

      if (error) throw error;

      return new Response(
        JSON.stringify({ signedUrl: data.signedUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'view') {
      // Download, decompress, and return the JSON content
      const { data, error } = await supabaseClient
        .storage
        .from('product-assets')
        .download(filePath);

      if (error) throw error;

      // Decompress gzip data
      const decompressedStream = data.stream().pipeThrough(new DecompressionStream('gzip'));
      const reader = decompressedStream.getReader();
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }

      const decoder = new TextDecoder();
      const jsonString = decoder.decode(result);
      const backupData = JSON.parse(jsonString);

      return new Response(
        JSON.stringify(backupData),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use "view" or "signed-url"' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  } catch (error) {
    console.error('Backup download error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
