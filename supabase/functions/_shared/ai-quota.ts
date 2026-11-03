import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Shared AI quota enforcement — uses a single gate_ai_request() SQL function
 * for rate limiting, wallet balance, and monthly quota checks in one DB round-trip.
 */

export type AiFeature =
  | 'ring_chat'
  | 'help_chat'
  | 'ring_preview'
  | 'grillz_preview'
  | 'enquiry_preview'
  | 'cost_estimate';

const CHAT_FEATURES: AiFeature[] = ['ring_chat', 'help_chat'];
const IMAGE_FEATURES: AiFeature[] = ['ring_preview', 'grillz_preview', 'enquiry_preview'];

/** Fallback costs — used only when config fetch fails. Reflects current 1.8× multiplier. */
const FALLBACK_COSTS = { chat: 0.0009, image: 0.072, cost_estimate: 0.0009 };

/** Cached effective costs from platform_ai_config (base × multiplier) */
let _cachedCosts: { chat: number; image: number; cost_estimate: number } | null = null;
let _costsCachedAt = 0;
const COST_CACHE_TTL_MS = 60_000; // 1 minute

function getServiceSupabase() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

/** Fetch effective costs (base × multiplier) from platform_ai_config with 1-min cache */
async function getEffectiveCosts(): Promise<{ chat: number; image: number; cost_estimate: number }> {
  const now = Date.now();
  if (_cachedCosts && now - _costsCachedAt < COST_CACHE_TTL_MS) return _cachedCosts;

  try {
    const sb = getServiceSupabase();
    const { data, error } = await sb
      .from('platform_ai_config' as any)
      .select('image_base_cost, image_multiplier, chat_base_cost, chat_multiplier')
      .limit(1)
      .single();

    if (error || !data) {
      console.error('[ai-quota] platform_ai_config fetch failed — falling back to FALLBACK_COSTS:', error);
      throw error ?? new Error('No platform_ai_config row');
    }
    const d = data as any;
    _cachedCosts = {
      chat: (d.chat_base_cost ?? 0.0005) * (d.chat_multiplier ?? 1),
      image: (d.image_base_cost ?? 0.04) * (d.image_multiplier ?? 1),
      cost_estimate: (d.chat_base_cost ?? 0.0005) * (d.chat_multiplier ?? 1),
    };
    console.log(`[ai-quota] Effective costs loaded: chat=$${_cachedCosts.chat} image=$${_cachedCosts.image} cost_estimate=$${_cachedCosts.cost_estimate}`);
    _costsCachedAt = now;
    return _cachedCosts;
  } catch (err) {
    console.error('Failed to fetch platform_ai_config costs, using fallbacks:', err);
    return FALLBACK_COSTS;
  }
}

/** @deprecated Use getEffectiveCosts() instead — kept for backward compat */
export const AI_COST_PER_CALL: Record<string, number> = {
  chat: 0.0009,
  image: 0.072,
  cost_estimate: 0.0009,
};

export interface QuotaResult { allowed: boolean; remaining: number; limit: number; used: number; }
export interface RateLimitResult { allowed: boolean; rpm: number; current: number; retryAfterMs: number; }

async function getFeatureCost(feature: AiFeature): Promise<number> {
  const costs = await getEffectiveCosts();
  if (CHAT_FEATURES.includes(feature)) return costs.chat;
  if (IMAGE_FEATURES.includes(feature)) return costs.image;
  return costs.cost_estimate;
}

/**
 * Gate: single RPC call that checks rate limit → wallet balance → monthly quota.
 * Returns a Response if blocked, or null if allowed.
 */
export async function gateRequest(
  clientId: string, feature: AiFeature, corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const supabase = getServiceSupabase();

  const { data, error } = await supabase.rpc('gate_ai_request', {
    p_client_id: clientId,
    p_feature: feature,
  });

  if (error) {
    console.error('gate_ai_request RPC error:', error);
    return null;
  }

  const result = data as {
    allowed: boolean;
    block_reason: string | null;
    balance?: number;
    required?: number;
    rpm_current?: number;
    rpm_limit?: number;
    retry_after_ms?: number;
    quota_used?: number;
    quota_limit?: number;
    over_quota?: boolean;
  };

  if (result.allowed) {
    // Remember whether this request is running above the plan's monthly
    // allowance so logUsage() can tag it as credit-funded overage.
    rememberOverQuota(clientId, feature, result.over_quota === true);
    if (result.over_quota) {
      console.log(
        `[ai-quota] client=${clientId} feature=${feature} running above plan allowance ` +
        `(${result.quota_used}/${result.quota_limit}) — billed from credits`,
      );
    }
    return null;
  }

  const cost = await getFeatureCost(feature);

  switch (result.block_reason) {
    case 'rate_limit':
      return rateLimitResponse(
        { allowed: false, rpm: result.rpm_limit ?? 0, current: result.rpm_current ?? 0, retryAfterMs: result.retry_after_ms ?? 10000 },
        corsHeaders,
      );
    case 'platform_limit':
      return new Response(JSON.stringify({
        error: "Platform is experiencing high demand. Please try again shortly.",
        retryAfterMs: result.retry_after_ms ?? 15000,
      }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil((result.retry_after_ms ?? 15000) / 1000)), ...corsHeaders },
      });
    case 'insufficient_balance':
    // 'quota_exceeded' is retired — the model is credit-only. Kept for safety
    // in case an older gate function is still deployed somewhere.
    case 'quota_exceeded':
      // The account is out of credit, which is exactly when an enabled
      // auto-recharge must fire. Nothing else reaches this point (logUsage only
      // runs for requests that were allowed), so without this the account would
      // stay stuck. Fire-and-forget: the 402 is returned immediately and the
      // next attempt finds the topped-up balance.
      triggerAutoRechargeIfNeeded(clientId).catch(err =>
        console.error('Auto-recharge trigger error (blocked request):', err)
      );
      return insufficientCreditsResponse(result.balance ?? 0, result.required ?? cost, corsHeaders);

    default:
      console.warn('Unknown block_reason from gate_ai_request:', result.block_reason);
      return null;
  }
}

// ── Overage tagging ────────────────────────────────────────────────────────
// gate_ai_request() tells us whether a request is above the plan allowance.
// Keep that flag around briefly so the matching logUsage() call can persist it.
const _overQuotaFlags = new Map<string, { value: boolean; at: number }>();
const OVER_QUOTA_TTL_MS = 5 * 60_000;

function overQuotaKey(clientId: string, feature: AiFeature): string {
  const category = CHAT_FEATURES.includes(feature)
    ? 'chat'
    : IMAGE_FEATURES.includes(feature)
      ? 'image'
      : 'cost_estimate';
  return `${clientId}:${category}`;
}

function rememberOverQuota(clientId: string, feature: AiFeature, value: boolean): void {
  _overQuotaFlags.set(overQuotaKey(clientId, feature), { value, at: Date.now() });
}

function consumeOverQuota(clientId: string, feature: AiFeature): boolean {
  const key = overQuotaKey(clientId, feature);
  const entry = _overQuotaFlags.get(key);
  if (!entry) return false;
  _overQuotaFlags.delete(key);
  if (Date.now() - entry.at > OVER_QUOTA_TTL_MS) return false;
  return entry.value;
}


// Keep legacy exports for any edge functions that call them directly
export async function checkRateLimit(clientId: string, feature: AiFeature): Promise<RateLimitResult> {
  const supabase = getServiceSupabase();
  const { data } = await supabase.rpc('gate_ai_request', { p_client_id: clientId, p_feature: feature });
  const result = data as any;
  if (!result) return { allowed: true, rpm: 0, current: 0, retryAfterMs: 0 };
  if (result.block_reason === 'rate_limit') {
    return { allowed: false, rpm: result.rpm_limit ?? 0, current: result.rpm_current ?? 0, retryAfterMs: result.retry_after_ms ?? 10000 };
  }
  return { allowed: true, rpm: result.rpm_limit ?? 0, current: result.rpm_current ?? 0, retryAfterMs: 0 };
}

export async function checkQuota(clientId: string, feature: AiFeature): Promise<QuotaResult> {
  const supabase = getServiceSupabase();
  const { data } = await supabase.rpc('gate_ai_request', { p_client_id: clientId, p_feature: feature });
  const result = data as any;
  if (!result) return { allowed: true, remaining: 999, limit: 999, used: 0 };
  // Credit-only model: monthly counts are reporting values, they never deny.
  if (result.block_reason === 'insufficient_balance') {
    return { allowed: false, remaining: 0, limit: result.quota_limit ?? 0, used: result.quota_used ?? 0 };
  }
  return { allowed: true, remaining: Math.max(0, (result.quota_limit ?? 999) - (result.quota_used ?? 0)), limit: result.quota_limit ?? 999, used: result.quota_used ?? 0 };
}

/**
 * Log a successful AI usage event AND debit the wallet.
 */
export async function logUsage(
  clientId: string, feature: AiFeature, model: string,
  tokens?: { input?: number; output?: number }, cached = false,
): Promise<void> {
  try {
    const supabase = getServiceSupabase();
    const overQuota = consumeOverQuota(clientId, feature);
    const { data: logRow } = await supabase.from('ai_usage_logs').insert({
      client_id: clientId, feature, model,
      input_tokens: tokens?.input ?? 0, output_tokens: tokens?.output ?? 0, cached,
      over_quota: overQuota,
    }).select('id').single();

    const cost = await getFeatureCost(feature);
    console.log(`[DEBIT] client=${clientId} feature=${feature} cost=$${cost} model=${model}`);
    if (cost > 0) {
      const { data: debitResult } = await supabase.rpc('debit_wallet', {
        p_client_id: clientId, p_amount: cost,
        p_description: `${feature} (${model})`,
        p_reference_id: logRow?.id ?? null,
        p_metadata: { feature, model, tokens, cached },
      });
      if (debitResult && !debitResult.success) {
        console.warn('Wallet debit failed (post-usage):', debitResult.error);
      }

      // Auto-recharge + low-credit alert (non-blocking).
      // Runs on BOTH outcomes: a failed debit means the account is out of
      // credit, which is precisely when a top-up is needed. Both checks use
      // total spendable credit (wallet + unexpired free credit), not just the
      // wallet, so accounts living on the free monthly grant are judged fairly.
      const available = await getAvailableCredit(clientId);
      triggerAutoRechargeIfNeeded(clientId, available).catch(err =>
        console.error('Auto-recharge trigger error:', err)
      );
      triggerLowBalanceAlertIfNeeded(clientId, available).catch(err =>
        console.error('Low-balance alert trigger error:', err)
      );
    }
  } catch (err) { console.error('AI usage logging error:', err); }
}

/** Total spendable AI credit: purchased wallet balance + unexpired free credit. */
async function getAvailableCredit(clientId: string): Promise<number> {
  const supabase = getServiceSupabase();
  const [{ data: wallet }, { data: free }] = await Promise.all([
    supabase.from('client_wallets').select('balance').eq('client_id', clientId).maybeSingle(),
    supabase
      .from('client_free_credits')
      .select('dollars_remaining, expires_at')
      .eq('client_id', clientId)
      .gt('expires_at', new Date().toISOString()),
  ]);
  const walletBalance = Number(wallet?.balance ?? 0);
  const freeBalance = (free ?? []).reduce(
    (sum: number, row: { dollars_remaining: number | null }) => sum + Number(row.dollars_remaining ?? 0),
    0,
  );
  return walletBalance + freeBalance;
}

/** Back-off between retries after a declined card, so we don't hammer Stripe. */
const RECHARGE_FAILURE_BACKOFF_MS = 60 * 60 * 1000; // 1 hour

/**
 * Non-blocking auto-recharge trigger. `availableCredit` is total spendable
 * credit (wallet + unexpired free credit), so this fires while free credit is
 * running low as well as when the wallet itself is empty. Omit it and the
 * balance is looked up here (used by the blocked-request path).
 */
async function triggerAutoRechargeIfNeeded(clientId: string, availableCredit?: number): Promise<void> {
  const supabase = getServiceSupabase();
  const { data: settings } = await supabase
    .from('client_auto_recharge_settings')
    .select('enabled, threshold_amount, stripe_payment_method_id, last_recharged_at, last_failed_at')
    .eq('client_id', clientId)
    .maybeSingle();

  if (!settings?.enabled || !settings.stripe_payment_method_id) return;

  const currentBalance = availableCredit ?? await getAvailableCredit(clientId);
  if (currentBalance >= settings.threshold_amount) return;

  // Debounce: 5 min between successful recharges
  if (settings.last_recharged_at) {
    const elapsed = Date.now() - new Date(settings.last_recharged_at).getTime();
    if (elapsed < 5 * 60 * 1000) return;
  }

  // Back off after a declined card instead of retrying on every request
  if (settings.last_failed_at) {
    const elapsed = Date.now() - new Date(settings.last_failed_at).getTime();
    if (elapsed < RECHARGE_FAILURE_BACKOFF_MS) return;
  }

  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/process-auto-recharge`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({ client_id: clientId }),
  });
  const result = await res.json();
  if (result.recharged) {
    console.log(`Auto-recharge triggered for client ${clientId}: $${result.amount}`);
  }
}


/** Export for edge functions that need to fetch costs */
export { getEffectiveCosts };

export function extractTokens(aiData: any): { input: number; output: number } {
  const usage = aiData?.usage;
  return { input: usage?.prompt_tokens ?? 0, output: usage?.completion_tokens ?? 0 };
}

export function quotaDeniedResponse(quota: QuotaResult, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({
    error: "Monthly AI usage limit reached. Please contact your administrator to increase your quota.",
    quota: { limit: quota.limit, used: quota.used },
  }), { status: 429, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

export function rateLimitResponse(result: RateLimitResult, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({
    error: "Too many requests. Please wait a moment and try again.",
    retryAfterMs: result.retryAfterMs,
  }), { status: 429, headers: { "Content-Type": "application/json", "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)), ...corsHeaders } });
}

export function insufficientCreditsResponse(balance: number, requiredCost: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({
    error: "Credits Insufficient, please recharge now. If automatic top-up is switched on, wait a moment and try again.",
    balance, required: requiredCost,
  }), { status: 402, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

// =====================================================================
// Low-credit alert system — Resend + bell
// Thresholds are a percentage of the monthly free grant, so warnings land
// while there is still time to top up (not after the account is empty).
// =====================================================================

const CREDIT_RATE = 0.0005; // 1 credit = $0.0005
const WARNING_PCT = 0.20;   // 20% of the monthly grant left
const CRITICAL_PCT = 0.05;  // 5% of the monthly grant left
const FALLBACK_MONTHLY_GRANT = 22.5;
const ALERT_DEBOUNCE_MS = 24 * 60 * 60 * 1000; // 24h

type AlertTier = 'warning' | 'critical';

function dollarsToCredits(d: number): number {
  return Math.max(0, Math.floor(d / CREDIT_RATE));
}

async function getMonthlyGrantDollars(): Promise<number> {
  try {
    const supabase = getServiceSupabase();
    const { data } = await supabase
      .from('platform_ai_config')
      .select('monthly_free_credits_dollars')
      .limit(1)
      .maybeSingle();
    const value = Number(data?.monthly_free_credits_dollars ?? 0);
    return value > 0 ? value : FALLBACK_MONTHLY_GRANT;
  } catch {
    return FALLBACK_MONTHLY_GRANT;
  }
}

async function triggerLowBalanceAlertIfNeeded(clientId: string, currentBalance: number): Promise<void> {
  const grant = await getMonthlyGrantDollars();
  const warningDollars = grant * WARNING_PCT;
  const criticalDollars = grant * CRITICAL_PCT;

  // Determine tier
  let tier: AlertTier | null = null;
  let thresholdDollars = 0;
  if (currentBalance < criticalDollars) {
    tier = 'critical';
    thresholdDollars = criticalDollars;
  } else if (currentBalance < warningDollars) {
    tier = 'warning';
    thresholdDollars = warningDollars;
  } else {
    return; // above all thresholds
  }

  const supabase = getServiceSupabase();

  // Skip if auto-recharge just topped up
  const { data: arSettings } = await supabase
    .from('client_auto_recharge_settings')
    .select('enabled, last_recharged_at')
    .eq('client_id', clientId)
    .maybeSingle();
  if (arSettings?.enabled && arSettings.last_recharged_at) {
    const elapsed = Date.now() - new Date(arSettings.last_recharged_at).getTime();
    if (elapsed < 5 * 60 * 1000) return;
  }

  // Check debounce row
  const { data: existing } = await supabase
    .from('client_low_balance_alerts')
    .select('id, last_alerted_at, last_alerted_balance')
    .eq('client_id', clientId)
    .eq('tier', tier)
    .maybeSingle();

  if (existing) {
    const elapsedMs = Date.now() - new Date(existing.last_alerted_at).getTime();
    const lastBalance = Number(existing.last_alerted_balance);
    const crossedBackAbove = lastBalance >= thresholdDollars;
    if (elapsedMs < ALERT_DEBOUNCE_MS && !crossedBackAbove) {
      return; // recently alerted and they haven't recovered+dropped again
    }
  }

  const balanceCredits = dollarsToCredits(currentBalance);
  const thresholdCredits = dollarsToCredits(thresholdDollars);
  const isCritical = tier === 'critical';
  const title = isCritical ? 'Critical: AI Credits Almost Empty' : 'Low AI Credits';
  const message = `You have ~${balanceCredits.toLocaleString()} credits left. Recharge now to keep AI features running.`;

  // Fetch client info
  const { data: client } = await supabase
    .from('clients')
    .select('id, company_name, email, logo_url')
    .eq('id', clientId)
    .single();

  if (!client) return;

  // Insert in-platform notification (bell icon)
  await supabase.from('client_notifications').insert({
    client_id: clientId,
    category: 'billing',
    title,
    message,
    metadata: {
      tier,
      balance_credits: balanceCredits,
      threshold_credits: thresholdCredits,
      balance_dollars: currentBalance,
    },
  });

  // Resolve recipients: owner + active staff
  const recipients: { email: string; name?: string }[] = [];
  if (client.email) recipients.push({ email: client.email, name: client.company_name ?? undefined });

  const { data: staff } = await supabase
    .from('staff_members')
    .select('email, name')
    .eq('client_id', clientId)
    .eq('status', 'active');

  if (staff) {
    for (const s of staff) {
      if (s.email && !recipients.find(r => r.email.toLowerCase() === s.email.toLowerCase())) {
        recipients.push({ email: s.email, name: s.name ?? undefined });
      }
    }
  }

  // Send Resend emails
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (resendApiKey && recipients.length > 0) {
    const html = buildLowBalanceEmailHtml({
      companyName: client.company_name || 'Your account',
      logoUrl: client.logo_url || '',
      tier,
      balanceCredits,
      thresholdCredits,
    });

    const subject = isCritical
      ? `🚨 Critical: AI credits almost empty — recharge now`
      : `Low AI credits — recharge to keep AI running`;

    for (const r of recipients) {
      try {
        const emailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: 'JewlX <onboarding@resend.dev>',
            to: [r.email],
            subject,
            html,
          }),
        });
        const emailResult = await emailRes.json().catch(() => ({}));

        // Best-effort log
        try {
          await supabase.from('email_logs').insert({
            recipient_email: r.email,
            email_type: 'low_credit_balance',
            subject,
            status: emailRes.ok ? 'sent' : 'failed',
            resend_id: emailResult?.id ?? null,
            error_message: emailRes.ok ? null : (emailResult?.message ?? `HTTP ${emailRes.status}`),
            metadata: {
              client_id: clientId,
              recipient_name: r.name ?? null,
              tier,
              balance_credits: balanceCredits,
              threshold_credits: thresholdCredits,
            },
          });
        } catch (_logErr) { /* best-effort */ }
      } catch (sendErr) {
        console.error(`[low-balance-alert] Failed to send to ${r.email}:`, sendErr);
      }
    }
  }

  // Admin alert — critical tier only: bell notification + email to super admins
  if (isCritical) {
    try {
      // Super admins only — resolved from admin_staff_members.is_super_admin,
      // matching daily-leads-report and platform-health-monitor.
      const { data: adminStaff } = await supabase
        .from('admin_staff_members')
        .select('user_id, email')
        .eq('status', 'active')
        .eq('is_super_admin', true);
      const adminIds: string[] = (adminStaff ?? []).map((r: { user_id: string }) => r.user_id);

      const autoRechargeEnabled = Boolean(arSettings?.enabled);
      const adminTitle = `Critical: AI credits almost empty — ${client.company_name || 'Client'}`;
      const adminMessage = `${client.company_name || 'A client'} has ~${balanceCredits.toLocaleString()} credits left ($${currentBalance.toFixed(2)}). Auto-recharge: ${autoRechargeEnabled ? 'on' : 'off'}.`;

      if (adminIds.length > 0) {
        await supabase.from('admin_notifications').insert(
          adminIds.map((uid) => ({
            user_id: uid,
            category: 'billing',
            title: adminTitle,
            message: adminMessage,
            metadata: {
              client_id: clientId,
              balance_credits: balanceCredits,
              balance_dollars: currentBalance,
              tier: 'critical',
              auto_recharge_enabled: autoRechargeEnabled,
            },
          }))
        );

        const adminEmails: string[] = (adminStaff ?? [])
          .map((r: { email?: string | null }) => r.email)
          .filter((e: unknown): e is string => Boolean(e));

        if (resendApiKey && adminEmails.length > 0) {
          const adminUrl = `https://admin.jewlx.ai/clients/${clientId}`;
          const adminHtml = buildAdminLowBalanceEmailHtml({
            companyName: client.company_name || 'A client',
            balanceCredits,
            balanceDollars: currentBalance,
            autoRechargeEnabled,
            lastRechargedAt: arSettings?.last_recharged_at ?? null,
            adminUrl,
          });
          const adminSubject = `🚨 Client out of AI credits — ${client.company_name || 'Client'}`;
          for (const email of adminEmails) {
            try {
              const emailRes = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${resendApiKey}`,
                },
                body: JSON.stringify({
                  from: 'JewlX <onboarding@resend.dev>',
                  to: [email],
                  subject: adminSubject,
                  html: adminHtml,
                }),
              });
              const emailResult = await emailRes.json().catch(() => ({}));
              try {
                await supabase.from('email_logs').insert({
                  recipient_email: email,
                  email_type: 'admin_low_credit_balance',
                  subject: adminSubject,
                  status: emailRes.ok ? 'sent' : 'failed',
                  resend_id: emailResult?.id ?? null,
                  error_message: emailRes.ok ? null : (emailResult?.message ?? `HTTP ${emailRes.status}`),
                  metadata: { client_id: clientId, tier: 'critical', balance_credits: balanceCredits },
                });
              } catch (_logErr) { /* best-effort */ }
            } catch (sendErr) {
              console.error(`[low-balance-alert] Failed to email admin ${email}:`, sendErr);
            }
          }
        }
      }
    } catch (adminErr) {
      console.error('[low-balance-alert] Admin alert error:', adminErr);
    }
  }

  // Upsert debounce row
  await supabase
    .from('client_low_balance_alerts')
    .upsert({
      client_id: clientId,
      tier,
      last_alerted_at: new Date().toISOString(),
      last_alerted_balance: currentBalance,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id,tier' });
}

function buildLowBalanceEmailHtml(opts: {
  companyName: string;
  logoUrl: string;
  tier: AlertTier;
  balanceCredits: number;
  thresholdCredits: number;
}): string {
  const isCritical = opts.tier === 'critical';
  const headline = isCritical ? 'Your AI credits are almost empty' : 'Your AI credits are running low';
  const subline = isCritical
    ? 'AI features will stop working very soon. Recharge now to avoid service interruption.'
    : 'Recharge soon to keep AI chat, image previews, and cost estimates running smoothly.';
  const accent = '#50C878';
  const billingUrl = 'https://admin.jewlx.ai/client/usage';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <title>${headline}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">

          <!-- Black header -->
          <tr>
            <td style="background-color:#000000;padding:24px 32px;text-align:center;">
              <img src="https://d2lo9ju43icaaa.cloudfront.net/jewlx-logo-white.png" alt="JewlX" height="40" style="height:40px;display:inline-block;" />
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px;">
              ${opts.logoUrl ? `<div style="text-align:center;margin-bottom:20px;"><img src="${opts.logoUrl}" alt="${opts.companyName}" height="40" style="height:40px;max-width:200px;display:inline-block;" /></div>` : ''}

              <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:800;color:#000000;text-align:center;">
                ${headline}
              </h1>
              <p style="margin:0 0 28px 0;font-size:14px;color:#666666;text-align:center;">
                ${opts.companyName}
              </p>

              <!-- Big credit count -->
              <div style="text-align:center;padding:24px;background-color:#fafafa;border:1px solid #eeeeee;border-radius:8px;margin-bottom:24px;">
                <p style="margin:0 0 6px 0;font-size:12px;color:#999999;text-transform:uppercase;letter-spacing:0.5px;">Remaining balance</p>
                <p style="margin:0;font-size:42px;font-weight:800;color:${isCritical ? '#DC2626' : '#000000'};line-height:1;">
                  ~${opts.balanceCredits.toLocaleString()}
                </p>
                <p style="margin:6px 0 0 0;font-size:13px;color:#666666;">credits</p>
              </div>

              <p style="margin:0 0 28px 0;font-size:15px;color:#333333;line-height:1.5;text-align:center;">
                ${subline}
              </p>

              <!-- CTA -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:8px;">
                    <a href="${billingUrl}" style="display:inline-block;background-color:${accent};color:#ffffff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;text-decoration:none;">
                      Buy Credits Now
                    </a>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top:12px;">
                    <a href="${billingUrl}" style="font-size:12px;color:#666666;text-decoration:underline;">
                      Or set up auto-recharge
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #eeeeee;">
              <p style="margin:0;font-size:11px;color:#999999;text-align:center;line-height:1.5;">
                Automated alert from JewlX. You're receiving this because your AI credit balance dropped below ${opts.thresholdCredits.toLocaleString()} credits.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildAdminLowBalanceEmailHtml(opts: {
  companyName: string;
  balanceCredits: number;
  balanceDollars: number;
  autoRechargeEnabled: boolean;
  lastRechargedAt: string | null;
  adminUrl: string;
}): string {
  const lastRecharge = opts.lastRechargedAt
    ? new Date(opts.lastRechargedAt).toUTCString()
    : 'Never';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light only" />
  <title>Client out of AI credits</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="background-color:#000000;padding:24px 32px;text-align:center;">
              <img src="https://d2lo9ju43icaaa.cloudfront.net/jewlx-logo-white.png" alt="JewlX" height="40" style="height:40px;display:inline-block;" />
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px;">
              <h1 style="margin:0 0 8px 0;font-size:22px;font-weight:800;color:#000000;text-align:center;">
                Client AI credits almost empty
              </h1>
              <p style="margin:0 0 28px 0;font-size:14px;color:#666666;text-align:center;">
                ${opts.companyName}
              </p>
              <div style="text-align:center;padding:24px;background-color:#fafafa;border:1px solid #eeeeee;border-radius:8px;margin-bottom:24px;">
                <p style="margin:0 0 6px 0;font-size:12px;color:#999999;text-transform:uppercase;letter-spacing:0.5px;">Remaining balance</p>
                <p style="margin:0;font-size:42px;font-weight:800;color:#DC2626;line-height:1;">
                  ~${opts.balanceCredits.toLocaleString()}
                </p>
                <p style="margin:6px 0 0 0;font-size:13px;color:#666666;">credits ($${opts.balanceDollars.toFixed(2)})</p>
              </div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="padding:8px 0;font-size:14px;color:#666666;">Auto-recharge</td>
                  <td align="right" style="padding:8px 0;font-size:14px;font-weight:700;color:${opts.autoRechargeEnabled ? '#50C878' : '#DC2626'};">${opts.autoRechargeEnabled ? 'Enabled' : 'Disabled'}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;font-size:14px;color:#666666;border-top:1px solid #eeeeee;">Last recharge</td>
                  <td align="right" style="padding:8px 0;font-size:14px;color:#333333;border-top:1px solid #eeeeee;">${lastRecharge}</td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${opts.adminUrl}" style="display:inline-block;background-color:#50C878;color:#ffffff;font-weight:700;font-size:15px;padding:14px 32px;border-radius:8px;text-decoration:none;">
                      Open Client in Admin
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid #eeeeee;">
              <p style="margin:0;font-size:11px;color:#999999;text-align:center;line-height:1.5;">
                Automated admin alert from JewlX. Sent because a client's AI credit balance dropped to the critical tier.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
