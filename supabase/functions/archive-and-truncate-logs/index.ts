import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BACKUP_BUCKET = "jewlx-backups";
const ARCHIVE_PREFIX = "logs-archive";
const PAGE_SIZE = 1000;
// ai_usage_logs is deliberately NOT here: it stays in the database as the per-request AI
// usage history and is summarised after 90 days by archive_old_ai_usage_logs().
const TABLES = ["client_activity_logs", "analytics_events"] as const;

async function gzip(text: string): Promise<Uint8Array> {
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(text));
      c.close();
    },
  }).pipeThrough(new CompressionStream("gzip"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

async function fetchAll(
  supabase: ReturnType<typeof createClient>,
  table: string,
): Promise<unknown[]> {
  const all: unknown[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(`fetch ${table} @${from}: ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    console.log("Starting log archive + truncate (30-day cycle)");

    // 1. Snapshot rows for each log table
    const data: Record<string, unknown[]> = {};
    const counts: Record<string, number> = {};
    for (const t of TABLES) {
      const rows = await fetchAll(supabase as any, t);
      data[t] = rows;
      counts[t] = rows.length;
      console.log(`  • ${t}: ${rows.length} rows`);
    }

    const timestamp = new Date().toISOString();
    const payload = {
      metadata: { timestamp, archiveType: "logs-30day", counts, version: "1.0" },
      data,
    };

    // 2. Compress + upload to jewlx-backups/logs-archive/
    const compressed = await gzip(JSON.stringify(payload));
    const sizeMb = compressed.length / (1024 * 1024);
    const filePath = `${ARCHIVE_PREFIX}/${timestamp.replace(/[:.]/g, "-")}.json.gz`;

    const { error: upErr } = await supabase.storage
      .from(BACKUP_BUCKET)
      .upload(filePath, compressed, { contentType: "application/gzip", upsert: false });
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
    console.log(`Uploaded ${filePath} (${sizeMb.toFixed(2)} MB)`);

    // 3. Truncate the snapshotted tables only after successful upload
    const { data: truncResult, error: truncErr } = await supabase.rpc("truncate_log_tables");
    if (truncErr) throw new Error(`Truncate failed: ${truncErr.message}`);
    console.log("Truncated:", truncResult);

    // 4. Log result
    await supabase.from("backup_logs").insert({
      backup_type: "logs-archive-30day",
      status: "success",
      tables_backed_up: [...TABLES],
      file_path: `${BACKUP_BUCKET}/${filePath}`,
      file_size_mb: Number(sizeMb.toFixed(2)),
      metadata: { ...payload.metadata, truncated: truncResult },
    });

    return new Response(
      JSON.stringify({
        success: true,
        archived: counts,
        truncated: truncResult,
        filePath: `${BACKUP_BUCKET}/${filePath}`,
        fileSizeMb: Number(sizeMb.toFixed(2)),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("archive-and-truncate-logs failed:", msg);
    try {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );
      await supabase.from("backup_logs").insert({
        backup_type: "logs-archive-30day",
        status: "failed",
        error_message: msg,
      });
    } catch {
      // ignore
    }
    return new Response(JSON.stringify({ success: false, error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
