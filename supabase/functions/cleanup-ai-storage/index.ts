import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: Record<string, any> = {};

    // 1. Delete expired cache rows
    const { count: cacheDeleted, error: cacheErr } = await supabase
      .from("ai_response_cache")
      .delete({ count: "exact" })
      .lt("expires_at", new Date().toISOString());

    results.expiredCacheDeleted = cacheDeleted ?? 0;
    if (cacheErr) console.error("Cache cleanup error:", cacheErr);

    // 2. Archive old ai_usage_logs (>90 days)
    const { data: archiveResult, error: archiveErr } = await supabase
      .rpc("archive_old_ai_usage_logs");

    results.logsArchived = archiveResult ?? 0;
    if (archiveErr) console.error("Archive error:", archiveErr);

    // 3. Delete old preview images from diamond-inspiration bucket (>90 days)
    const prefixes = ["ring-previews/", "grillz-previews/", "enquiry-previews/"];
    let imagesDeleted = 0;
    const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    for (const prefix of prefixes) {
      const { data: files, error: listErr } = await supabase.storage
        .from("diamond-inspiration")
        .list(prefix.replace("/", ""), { limit: 1000 });

      if (listErr) {
        console.error(`List error for ${prefix}:`, listErr);
        continue;
      }

      if (!files || files.length === 0) continue;

      const oldFiles = files.filter((f) => {
        if (!f.created_at) return false;
        const created = new Date(f.created_at);
        return created < cutoffDate;
      });

      if (oldFiles.length === 0) continue;

      const paths = oldFiles.map((f) => `${prefix.replace("/", "")}/${f.name}`);

      // Delete in batches of 100
      for (let i = 0; i < paths.length; i += 100) {
        const batch = paths.slice(i, i + 100);
        const { error: delErr } = await supabase.storage
          .from("diamond-inspiration")
          .remove(batch);

        if (delErr) {
          console.error(`Delete error for ${prefix}:`, delErr);
        } else {
          imagesDeleted += batch.length;
        }
      }
    }

    results.previewImagesDeleted = imagesDeleted;

    console.log("Cleanup completed:", results);

    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Cleanup error:", error);
    return new Response(
      JSON.stringify({ error: "Cleanup failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
