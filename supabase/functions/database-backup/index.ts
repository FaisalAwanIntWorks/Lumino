import { createClient } from "npm:@supabase/supabase-js@2";
import { denyReadOnlyAdmin, getAdminAccess } from "../_shared/admin-access.ts";

/**
 * JewlX database backup (weekly cron + admin "Run backup" button).
 *
 * Backs up ONLY the configuration / business tables listed in BACKUP_TABLES.
 * The diamond & gemstone pools (re-uploadable CSV data, ~800k rows), AI preview
 * / render tables and every log, analytics or token table are deliberately
 * excluded: they made the old nightly dump read ~1.6M rows through OFFSET
 * pagination and held the database for 1-2 hours.
 *
 * Auth, in order: service role key, the database trigger secret (what pg_cron
 * sends via trigger_database_backup), or an agency admin session.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-trigger-secret',
};

const BACKUP_BUCKET = 'jewlx-backups';
const RETENTION_DAYS = 30;
const PAGE_SIZE = 1000;

/** Tables included in the backup. Add a table here when it holds configuration or business records. */
const BACKUP_TABLES: string[] = [
  // accounts, staff, access
  'agencies', 'clients', 'client_contacts', 'client_status_tags', 'user_profiles', 'user_roles', 'staff_members',
  'admin_staff_members', 'admin_staff_client_access', 'client_onboarding_preferences', 'client_notification_preferences',
  'client_availability_schedule', 'cron_config', 'platform_health_settings', 'retention_policies',
  // billing, plans, wallets
  'subscription_plans', 'license_products', 'credit_packs', 'client_subscriptions', 'client_wallets', 'wallet_transactions',
  'client_free_credits', 'client_auto_recharge_settings', 'client_low_balance_alerts', 'client_ai_quotas', 'plan_ai_defaults',
  'platform_ai_config', 'ai_usage_monthly_summary', 'admin_billing_events',
  // orders & products
  'orders', 'order_items', 'products', 'product_variations', 'client_products', 'client_ring_catalog',
  // Ring OS / ring builder configuration
  'ring_configured_by_client', 'ring_metal_options', 'ring_setting_options', 'band_type_options', 'band_width_options',
  'diamond_shape_options', 'diamond_size_options', 'diamond_quality_options', 'diamond_nature_options', 'diamond_holder_options',
  'carat_size_images', 'client_carat_options', 'client_size_options', 'client_diamond_step_overrides', 'client_cad_addons',
  'client_diamond_catalog_filter', 'diamond_catalog_config', 'diamond_outlier_config', 'personalization_options',
  'lookup_metals', 'lookup_shanks', 'lookup_shapes', 'lookup_styles', 'lookup_visual_colors',
  // Custom X forms configuration
  'client_dtt_form_config', 'client_option_prices', 'client_metal_variants',
  'client_ring_form_config', 'client_ring_form_questions',
  'client_grill_config', 'client_grill_questions',
  'client_custom_enquiry_config', 'client_custom_enquiry_questions',
  'client_metal_buying_config', 'client_metal_buying_questions',
  'sandbox_quote_v1_config', 'sandbox_quote_v1_overrides', 'sandbox_quote_v3_config', 'sandbox_quote_v3_overrides',
  // leads & customer work
  'diamond_form_leads', 'grill_form_leads', 'custom_enquiry_leads', 'metal_buying_leads', 'marketing_leads',
  'lead_follow_up_notes', 'lead_quote_history', 'lead_cost_estimates', 'appointment_bookings',
  'saved_designs', 'wishlist_items', 'design_requests', 'cad_requests', 'cad_request_messages', 'cad_resize_requests',
  'support_tickets', 'support_ticket_messages',
  // integrations & marketing
  'crm_integrations', 'client_ghl_integrations', 'client_ghl_credentials', 'client_ghl_field_mappings',
  'marketing_campaigns', 'marketing_lists', 'marketing_list_members', 'marketing_templates',
  // AI configuration (not usage/preview data)
  'ai_system_prompts', 'ai_training_examples',
  // misc business data
  'my_master_db_data',
];

interface BackupResult {
  success: boolean;
  tablesBackedUp: string[];
  totalRecords: number;
  filePath?: string;
  fileSizeMb?: number;
  cleanupDeleted?: number;
  error?: string;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// gzip a string -> Uint8Array
async function compressData(data: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const inputStream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(data));
      controller.close();
    },
  });

  const compressedStream = inputStream.pipeThrough(new CompressionStream('gzip'));
  const reader = compressedStream.getReader();
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
  return result;
}

/**
 * Read every row of a table. Tables with an `id` column are walked by keyset
 * (ORDER BY id, id > last) so each page is an index range scan; the few tables
 * without `id` fall back to OFFSET paging (they are all small).
 */
async function fetchAllRows(supabase: any, table: string): Promise<unknown[]> {
  const all: unknown[] = [];

  const first = await supabase.from(table).select('*').order('id', { ascending: true }).limit(PAGE_SIZE);
  if (!first.error) {
    let page: any[] = first.data ?? [];
    all.push(...page);
    while (page.length === PAGE_SIZE) {
      const lastId = page[page.length - 1]?.id;
      if (lastId === undefined || lastId === null) break;
      const next = await supabase.from(table).select('*').order('id', { ascending: true }).gt('id', lastId).limit(PAGE_SIZE);
      if (next.error) {
        console.error(`Error fetching ${table} after id ${lastId}: ${next.error.message}`);
        break;
      }
      page = next.data ?? [];
      all.push(...page);
    }
    return all;
  }

  // No `id` column (or not orderable): offset paging.
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(`Error fetching ${table} (offset ${from}): ${error.message}`);
      break;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

// Delete backup files older than RETENTION_DAYS
async function cleanupOldBackups(supabase: any): Promise<number> {
  const { data: files, error } = await supabase.storage
    .from(BACKUP_BUCKET)
    .list('', { limit: 1000, sortBy: { column: 'created_at', order: 'asc' } });

  if (error || !files) {
    console.error('Cleanup list error:', error?.message);
    return 0;
  }

  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const toDelete = (files as any[])
    .filter((f: any) => {
      // Skip folders (e.g., logs-archive/) — only delete top-level dump files
      if (!f.name || f.name.endsWith('/') || !f.name.includes('.')) return false;
      const created = f.created_at ? new Date(f.created_at).getTime() : Date.now();
      return created < cutoff;
    })
    .map((f: any) => f.name);

  if (toDelete.length === 0) return 0;

  const { error: delError } = await supabase.storage.from(BACKUP_BUCKET).remove(toDelete);
  if (delError) {
    console.error('Cleanup delete error:', delError.message);
    return 0;
  }
  console.log(`Cleanup: deleted ${toDelete.length} old backup file(s)`);
  return toDelete.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, serviceKey);

  // ── Auth: service role, pg_cron trigger secret, or an agency admin ────────
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  let isService = !!token && !!serviceKey && timingSafeEqual(token, serviceKey);
  if (!isService) {
    const triggerSecret = req.headers.get('x-trigger-secret') ?? '';
    if (triggerSecret) {
      const { data } = await supabase.from('cron_config').select('value').eq('key', 'dtt_ghl_trigger_secret').maybeSingle();
      const expected = typeof data?.value === 'string' ? data.value : '';
      isService = expected.length > 0 && timingSafeEqual(triggerSecret, expected);
    }
  }
  if (!isService) {
    // Read-only admin staff must not perform any write operation.
    const readOnlyDenied = await denyReadOnlyAdmin(req, corsHeaders);
    if (readOnlyDenied) return readOnlyDenied;
    const access = await getAdminAccess(req);
    if (!access.isAgencyAdmin) {
      return new Response(JSON.stringify({ success: false, error: 'Admin access required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }
  }

  try {
    const { backupType = 'manual' } = await req.json().catch(() => ({ backupType: 'manual' }));
    console.log(`Starting ${backupType} backup of ${BACKUP_TABLES.length} tables → bucket "${BACKUP_BUCKET}"`);

    // Only back up allowlisted tables that actually exist in this database.
    const { data: tablesList, error: tablesErr } = await supabase.rpc('list_public_tables');
    if (tablesErr) throw new Error(`Failed to list tables: ${tablesErr.message}`);
    const existing = new Set<string>((tablesList || []).map((r: { table_name: string }) => r.table_name));
    const tables = BACKUP_TABLES.filter((t) => existing.has(t));
    const missing = BACKUP_TABLES.filter((t) => !existing.has(t));
    if (missing.length) console.log(`Allowlisted but absent (skipped): ${missing.join(', ')}`);

    const backupData: Record<string, unknown[]> = {};
    const tableStats: Record<string, number> = {};
    let totalRecords = 0;

    for (const table of tables) {
      try {
        const rows = await fetchAllRows(supabase, table);
        backupData[table] = rows;
        tableStats[table] = rows.length;
        totalRecords += rows.length;
        console.log(`  • ${table}: ${rows.length}`);
      } catch (err) {
        console.error(`  ✗ ${table} failed:`, err instanceof Error ? err.message : err);
        tableStats[table] = -1;
      }
    }

    const timestamp = new Date().toISOString();
    const payload = {
      metadata: {
        timestamp,
        backupType,
        tableCount: tables.length,
        totalRecords,
        tableStats,
        excluded: 'diamond/gemstone pools, AI preview tables, logs/analytics/tokens (see BACKUP_TABLES allowlist)',
        version: '3.0',
      },
      data: backupData,
    };

    // Compress
    const compressed = await compressData(JSON.stringify(payload));
    const fileSizeMb = compressed.length / (1024 * 1024);
    const filePath = `${timestamp.replace(/[:.]/g, '-')}.json.gz`;

    // Upload
    const { error: uploadError } = await supabase.storage
      .from(BACKUP_BUCKET)
      .upload(filePath, compressed, {
        contentType: 'application/gzip',
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }
    console.log(`Uploaded ${filePath} (${fileSizeMb.toFixed(2)} MB)`);

    // Cleanup old backups (> RETENTION_DAYS)
    const cleanupDeleted = await cleanupOldBackups(supabase);

    // Log to backup_logs
    const { error: logError } = await supabase.from('backup_logs').insert({
      backup_type: backupType,
      status: 'success',
      tables_backed_up: tables,
      file_path: `${BACKUP_BUCKET}/${filePath}`,
      file_size_mb: fileSizeMb,
      metadata: { ...payload.metadata, cleanupDeleted },
    });
    if (logError) console.error('backup_logs insert error:', logError.message);

    const result: BackupResult = {
      success: true,
      tablesBackedUp: tables,
      totalRecords,
      filePath: `${BACKUP_BUCKET}/${filePath}`,
      fileSizeMb: Number(fileSizeMb.toFixed(2)),
      cleanupDeleted,
    };

    console.log(`✅ Backup complete: ${totalRecords} records across ${tables.length} tables`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Backup failed:', errorMessage);

    // Best-effort failure log
    try {
      await supabase.from('backup_logs').insert({
        backup_type: 'unknown',
        status: 'failed',
        error_message: errorMessage,
      });
    } catch {
      // ignore
    }

    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
