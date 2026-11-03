/**
 * Marketing email helpers shared by the admin UI and the send functions.
 * Mirrored byte-for-byte at supabase/functions/_shared/marketing-email.ts.
 * Pure TypeScript, no imports.
 */

export type MarketingBlock =
  | { id: string; type: 'heading'; text: string; align?: 'left' | 'center' }
  | { id: string; type: 'text'; text: string; align?: 'left' | 'center' }
  | { id: string; type: 'image'; src: string; alt?: string; href?: string }
  | { id: string; type: 'button'; label: string; href: string }
  | { id: string; type: 'divider' }
  | { id: string; type: 'spacer'; height?: number };

export type LeadVars = Record<string, string | null | undefined>;

export const STANDARD_LEAD_FIELDS = ['email', 'first_name', 'last_name', 'company', 'phone', 'city', 'country'] as const;
export type StandardLeadField = (typeof STANDARD_LEAD_FIELDS)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: unknown): string | null {
  const e = String(raw ?? '').trim().toLowerCase();
  return e.length <= 320 && EMAIL_RE.test(e) ? e : null;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function slugifyKey(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

const HEADER_GUESSES: Record<StandardLeadField, string[]> = {
  email: ['email', 'e_mail', 'email_address', 'mail'],
  first_name: ['first_name', 'firstname', 'first', 'given_name', 'name'],
  last_name: ['last_name', 'lastname', 'last', 'surname', 'family_name'],
  company: ['company', 'company_name', 'business', 'store', 'organization', 'organisation'],
  phone: ['phone', 'phone_number', 'mobile', 'telephone', 'tel'],
  city: ['city', 'town'],
  country: ['country'],
};

/** Map a header to a standard field, or to `custom:<key>`. */
export function guessMapping(headers: string[]): Record<string, string> {
  const used = new Set<string>();
  const out: Record<string, string> = {};
  for (const h of headers) {
    const k = slugifyKey(h);
    const std = (Object.keys(HEADER_GUESSES) as StandardLeadField[]).find(
      (f) => !used.has(f) && HEADER_GUESSES[f].includes(k),
    );
    if (std) {
      used.add(std);
      out[h] = std;
    } else {
      out[h] = k ? `custom:${k}` : 'ignore';
    }
  }
  return out;
}

export interface PreparedLead {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  phone?: string;
  city?: string;
  country?: string;
  custom_fields: Record<string, string>;
}

/** Validate + dedupe rows inside one upload. Later duplicates fill blanks only. */
export function prepareLeads(rows: Record<string, unknown>[], mapping: Record<string, string>) {
  const byEmail = new Map<string, PreparedLead>();
  let invalid = 0;
  let duplicatesInFile = 0;
  for (const row of rows) {
    const lead: PreparedLead = { email: '', custom_fields: {} };
    for (const [header, target] of Object.entries(mapping)) {
      const val = String(row[header] ?? '').trim();
      if (!val || target === 'ignore') continue;
      if (target.startsWith('custom:')) lead.custom_fields[target.slice(7)] = val.slice(0, 500);
      else (lead as any)[target] = val.slice(0, 200);
    }
    const email = normalizeEmail(lead.email);
    if (!email) { invalid++; continue; }
    lead.email = email;
    const existing = byEmail.get(email);
    if (existing) {
      duplicatesInFile++;
      for (const f of STANDARD_LEAD_FIELDS) if (!(existing as any)[f] && (lead as any)[f]) (existing as any)[f] = (lead as any)[f];
      existing.custom_fields = { ...lead.custom_fields, ...existing.custom_fields };
    } else {
      byEmail.set(email, lead);
    }
  }
  return { leads: [...byEmail.values()], invalid, duplicatesInFile };
}

/** Replace {{key}} / {{key|fallback}}; values are HTML-escaped. */
export function applyVariables(input: string, vars: LeadVars, escape = true): string {
  return input.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*(?:\|([^}]*))?\}\}/g, (_m, key: string, fallback?: string) => {
    const v = vars[key];
    const s = v != null && String(v).trim() !== '' ? String(v) : (fallback ?? '').trim();
    return escape ? escapeHtml(s) : s;
  });
}

export function leadToVars(lead: Record<string, any>, extra: LeadVars = {}): LeadVars {
  const vars: LeadVars = {};
  for (const f of STANDARD_LEAD_FIELDS) vars[f] = lead[f] ?? '';
  for (const [k, v] of Object.entries(lead.custom_fields ?? {})) vars[k] = String(v ?? '');
  return { ...vars, ...extra };
}

function safeUrl(u: string): string {
  const t = u.trim();
  return /^(https?:|mailto:|\{\{)/i.test(t) ? t : '#';
}

const BRAND = { ink: '#111111', muted: '#555555', accent: '#0b6e4f', line: '#e5e5e5' };

function renderBlock(b: MarketingBlock): string {
  const align = 'align' in b && b.align === 'center' ? 'center' : 'left';
  switch (b.type) {
    case 'heading':
      return `<tr><td style="padding:8px 32px;text-align:${align};"><h1 style="margin:0;font-size:24px;line-height:1.3;color:${BRAND.ink};font-weight:700;">${escapeHtml(b.text)}</h1></td></tr>`;
    case 'text':
      return `<tr><td style="padding:8px 32px;text-align:${align};font-size:16px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(b.text).replace(/\n/g, '<br>')}</td></tr>`;
    case 'image': {
      const img = `<img src="${escapeHtml(safeUrl(b.src))}" alt="${escapeHtml(b.alt ?? '')}" width="536" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:6px;">`;
      return `<tr><td style="padding:8px 32px;">${b.href ? `<a href="${escapeHtml(safeUrl(b.href))}">${img}</a>` : img}</td></tr>`;
    }
    case 'button':
      return `<tr><td style="padding:16px 32px;" align="center"><a href="${escapeHtml(safeUrl(b.href))}" style="display:inline-block;background:${BRAND.accent};color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:6px;">${escapeHtml(b.label)}</a></td></tr>`;
    case 'divider':
      return `<tr><td style="padding:16px 32px;"><div style="border-top:1px solid ${BRAND.line};font-size:0;line-height:0;">&nbsp;</div></td></tr>`;
    case 'spacer':
      return `<tr><td style="height:${Math.min(Math.max(b.height ?? 24, 4), 120)}px;font-size:0;line-height:0;">&nbsp;</td></tr>`;
  }
}

export function footerHtml(): string {
  return `<tr><td style="padding:24px 32px;border-top:1px solid ${BRAND.line};text-align:center;font-size:12px;line-height:1.6;color:#999999;">You're receiving this because you showed interest in JewlX.<br><a href="{{unsubscribe_url}}" style="color:#999999;text-decoration:underline;">Unsubscribe</a> &middot; <a href="https://jewlx.ai" style="color:${BRAND.accent};text-decoration:none;">jewlx.ai</a></td></tr>`;
}

/** Template (with {{vars}} still in place) → full email HTML. */
export function buildEmailHtml(opts: { mode: 'blocks' | 'html'; blocks: MarketingBlock[]; html: string; previewText?: string }): string {
  const pre = opts.previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.previewText)}</div>`
    : '';
  const body = opts.mode === 'html'
    ? `<tr><td style="padding:0;">${opts.html}</td></tr>`
    : `<tr><td style="padding:28px 32px 12px;text-align:center;background:#000000;"><img src="https://vault.jewlx.ai/images/jewelx-email-logo.png" alt="JewlX" height="40" style="height:40px;border:0;"></td></tr><tr><td style="height:16px;"></td></tr>${opts.blocks.map(renderBlock).join('')}<tr><td style="height:16px;"></td></tr>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"></head><body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">${pre}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">${body}${footerHtml()}</table></td></tr></table></body></html>`;
}

/** Personalise a built email for one recipient. */
export function personalize(html: string, vars: LeadVars): string {
  return applyVariables(html, vars, true);
}

export function extractVariables(text: string): string[] {
  const set = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([a-zA-Z0-9_]+)/g)) set.add(m[1]);
  set.delete('unsubscribe_url');
  return [...set];
}

// ── Scheduling ──────────────────────────────────────────────────────────

export interface CampaignSchedule {
  batch_size: number;
  interval_minutes: number;
  daily_cap: number | null;
  window_start: string | null; // "HH:MM[:SS]"
  window_end: string | null;
  timezone: string;
  start_at: string | null;
  last_batch_at: string | null;
}

function minutesInZone(now: Date, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    return h * 60 + m;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };

export function insideWindow(c: Pick<CampaignSchedule, 'window_start' | 'window_end' | 'timezone'>, now: Date): boolean {
  if (!c.window_start || !c.window_end) return true;
  const cur = minutesInZone(now, c.timezone);
  const s = toMin(c.window_start), e = toMin(c.window_end);
  return s <= e ? cur >= s && cur < e : cur >= s || cur < e;
}

/** How many emails this campaign may send right now (0 = wait). */
export function allowedBatchNow(c: CampaignSchedule, now: Date, sentLast24h: number): number {
  if (c.start_at && new Date(c.start_at) > now) return 0;
  if (c.last_batch_at && now.getTime() - new Date(c.last_batch_at).getTime() < c.interval_minutes * 60_000 - 15_000) return 0;
  if (!insideWindow(c, now)) return 0;
  let n = c.batch_size;
  if (c.daily_cap != null) n = Math.min(n, c.daily_cap - sentLast24h);
  return Math.max(0, n);
}
