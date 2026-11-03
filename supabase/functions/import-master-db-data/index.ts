import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // SECURITY: Require authentication - only agency admins can import master data
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Check if user is an agency admin
    const { data: adminRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'agency_admin')
      .single();

    if (!adminRole) {
      return new Response(
        JSON.stringify({ success: false, error: 'Access denied' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { csvData } = await req.json();
    
    if (!csvData || typeof csvData !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Valid CSV data is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Limit CSV size to prevent DoS
    if (csvData.length > 10 * 1024 * 1024) { // 10MB limit
      return new Response(
        JSON.stringify({ success: false, error: 'CSV data exceeds maximum size' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse CSV
    const lines = csvData.trim().split('\n');
    const headers = lines[0].split(',');
    
    const records: any[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      // Parse CSV line (handling commas within values)
      const values = line.split(',');
      
      // Map to database columns
      const record = {
        unique_id: values[0] || null,
        combination_id: values[1] || null,
        style_name: values[2] || null,
        shank_id: values[3] || null,
        shank_name: values[4] || null,
        visual_color: values[5] || null,
        visual_color_name: values[6] || null,
        shape_id: values[7] || null,
        shape_name: values[8] || null,
        folder_path: values[9] || null,
        image_0_filename: values[10] || null,
        image_0_status: values[11]?.toUpperCase() === 'TRUE',
        image_1_filename: values[12] || null,
        image_1_status: values[13]?.toUpperCase() === 'TRUE',
        image_2_filename: values[14] || null,
        image_2_status: values[15]?.toUpperCase() === 'TRUE',
        image_3_filename: values[16] || null,
        image_3_status: values[17]?.toUpperCase() === 'TRUE',
        video_filename: values[18] || null,
        video_status: values[19]?.toUpperCase() === 'TRUE',
        glb_model_filename: values[20] || null,
        glb_model_status: values[21]?.toUpperCase() === 'TRUE',
        transparent_0_filename: values[22] || null,
        transparent_0_status: values[23]?.toUpperCase() === 'TRUE',
        transparent_1_filename: values[24] || null,
        transparent_1_status: values[25]?.toUpperCase() === 'TRUE',
        transparent_2_filename: values[26] || null,
        transparent_2_status: values[27]?.toUpperCase() === 'TRUE',
        transparent_3_filename: values[28] || null,
        transparent_3_status: values[29]?.toUpperCase() === 'TRUE',
        model_photo_filename: values[30] || null,
        model_photo_status: values[31]?.toUpperCase() === 'TRUE',
        manufacture_cad_filename: values[32] || null,
        manufacture_cad_status: values[33]?.toUpperCase() === 'TRUE',
        rendered_cad_filename: values[34] || null,
        rendered_cad_status: values[35]?.toUpperCase() === 'TRUE',
        files_uploaded: values[36] || null,
        total_files: values[37] ? parseInt(values[37]) : 13,
        all_upload_complete: values[38]?.toUpperCase() === 'TRUE',
        drive_link: values[39] || null,
        last_updated: values[40] || null,
        notes: values[41] || null,
      };
      
      records.push(record);
    }

    console.log(`Parsed ${records.length} records from CSV`);

    // Insert in batches of 100
    const batchSize = 100;
    let insertedCount = 0;
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from('my_master_db_data')
        .insert(batch);
      
      if (error) {
        console.error(`Error inserting batch ${i / batchSize + 1}:`, error);
        throw error;
      }
      
      insertedCount += batch.length;
      console.log(`Inserted batch ${i / batchSize + 1}: ${batch.length} records`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully inserted ${insertedCount} records`,
        count: insertedCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in import-master-db-data:', error instanceof Error ? error.message : 'Unknown');
    return new Response(
      JSON.stringify({ success: false, error: 'Import failed. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
