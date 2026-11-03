import { supabase } from '@/integrations/supabase/client';
import type { TablesInsert } from '@/integrations/supabase/types';

/**
 * Device the customer used when they submitted a lead form.
 *
 * Read from the browser at submit time (user agent, User-Agent Client Hints,
 * touch + screen size). Nothing is sent to a third party; the result is
 * stored on the lead row's `device_info` JSONB column.
 */
export interface LeadDeviceInfo {
  device_type: 'mobile' | 'tablet' | 'desktop';
  /** iOS, iPadOS, Android, Windows, macOS, ChromeOS, Linux, Unknown */
  os: string;
  os_version: string | null;
  /** Chrome, Safari, Edge, Firefox, Samsung Internet, Instagram app, ... */
  browser: string;
  browser_version: string | null;
  /** iPhone, iPad, or the Android model code (e.g. SM-S918B) when available. */
  model: string | null;
  /** CSS-pixel screen size, e.g. "390x844". */
  screen: string | null;
  touch: boolean;
  user_agent: string;
}

const firstMatch = (ua: string, re: RegExp): string | null => {
  const m = ua.match(re);
  return m?.[1] ? m[1].replace(/_/g, '.') : null;
};

/** Pure user-agent parser — exported for tests. */
export function parseUserAgent(
  ua: string,
  opts: { maxTouchPoints?: number } = {},
): Omit<LeadDeviceInfo, 'screen' | 'touch' | 'user_agent'> {
  const touchPoints = opts.maxTouchPoints ?? 0;
  let os = 'Unknown';
  let osVersion: string | null = null;
  let model: string | null = null;
  let deviceType: LeadDeviceInfo['device_type'] = 'desktop';

  if (/iPhone|iPod/.test(ua)) {
    os = 'iOS';
    osVersion = firstMatch(ua, /OS (\d+[_.\d]*) like Mac OS X/);
    model = /iPod/.test(ua) ? 'iPod' : 'iPhone';
    deviceType = 'mobile';
  } else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) {
    // iPadOS 13+ sends a desktop Mac user agent; touch support gives it away.
    os = 'iPadOS';
    osVersion = firstMatch(ua, /OS (\d+[_.\d]*) like Mac OS X/);
    model = 'iPad';
    deviceType = 'tablet';
  } else if (/Android/.test(ua)) {
    os = 'Android';
    osVersion = firstMatch(ua, /Android (\d+(?:\.\d+)*)/);
    const rawModel = firstMatch(ua, /Android [\d.]+; (?:[a-z]{2}[-_][a-z]{2}; )?([^;)]+?)(?: Build\/[^;)]*)?\)/i);
    // Chrome's reduced UA reports the model as "K".
    model = rawModel && rawModel !== 'K' ? rawModel.trim() : null;
    deviceType = /Mobile/.test(ua) ? 'mobile' : 'tablet';
  } else if (/Windows NT/.test(ua)) {
    os = 'Windows';
    deviceType = /Windows Phone/.test(ua) ? 'mobile' : 'desktop';
  } else if (/CrOS/.test(ua)) {
    os = 'ChromeOS';
  } else if (/Macintosh|Mac OS X/.test(ua)) {
    os = 'macOS';
  } else if (/Linux/.test(ua)) {
    os = 'Linux';
  }

  // In-app browsers first (they wrap Safari/Chrome), then real browsers.
  let browser = 'Unknown';
  let browserVersion: string | null = null;
  const browsers: Array<[string, RegExp]> = [
    ['Instagram app', /Instagram ([\d.]+)/],
    ['Facebook app', /FBAV\/([\d.]+)/],
    ['TikTok app', /(?:musical_ly|BytedanceWebview|TikTok)[_/ ]?([\d.]*)/],
    ['Snapchat app', /Snapchat\/([\d.]+)/],
    ['Pinterest app', /Pinterest\/([\d.]+)/],
    ['Edge', /Edg(?:e|A|iOS)?\/([\d.]+)/],
    ['Opera', /(?:OPR|OPiOS)\/([\d.]+)/],
    ['Samsung Internet', /SamsungBrowser\/([\d.]+)/],
    ['Firefox', /(?:Firefox|FxiOS)\/([\d.]+)/],
    ['Chrome', /(?:Chrome|CriOS)\/([\d.]+)/],
    ['Safari', /Version\/([\d.]+).*Safari/],
  ];
  for (const [name, re] of browsers) {
    const m = ua.match(re);
    if (m) {
      browser = name;
      browserVersion = m[1] ? m[1].split('.').slice(0, 2).join('.') : null;
      break;
    }
  }

  return { device_type: deviceType, os, os_version: osVersion, browser, browser_version: browserVersion, model };
}

type UAData = {
  getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string; platformVersion?: string; platform?: string }>;
};

/** Collect device info from the current browser. Never throws; resolves fast. */
export async function getLeadDeviceInfo(): Promise<LeadDeviceInfo | null> {
  if (typeof navigator === 'undefined') return null;
  try {
    const ua = navigator.userAgent || '';
    const touchPoints = navigator.maxTouchPoints || 0;
    const parsed = parseUserAgent(ua, { maxTouchPoints: touchPoints });

    // Chromium only: Client Hints give the real Android model and Windows 10 vs 11.
    const uaData = (navigator as unknown as { userAgentData?: UAData }).userAgentData;
    if (uaData?.getHighEntropyValues && (parsed.os === 'Android' || parsed.os === 'Windows')) {
      const hints = await Promise.race([
        uaData.getHighEntropyValues(['model', 'platformVersion']).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 400)),
      ]);
      if (hints?.model && !parsed.model) parsed.model = hints.model;
      if (parsed.os === 'Android' && hints?.platformVersion && !parsed.os_version) {
        parsed.os_version = hints.platformVersion;
      }
      if (parsed.os === 'Windows' && hints?.platformVersion) {
        const major = parseInt(hints.platformVersion.split('.')[0] || '0', 10);
        parsed.os_version = major >= 13 ? '11' : major > 0 ? '10' : null;
      }
    }

    const scr = typeof window !== 'undefined' ? window.screen : undefined;
    return {
      ...parsed,
      screen: scr?.width && scr?.height ? `${scr.width}x${scr.height}` : null,
      touch: touchPoints > 0,
      user_agent: ua.slice(0, 500),
    };
  } catch {
    return null;
  }
}

/**
 * The five device buckets the dashboard shows, plus "unknown" for leads
 * submitted before device capture. Mirrors the CASE in the SQL function
 * get_lead_device_breakdown — keep both in step.
 */
export type LeadDeviceCategory = 'android' | 'iphone' | 'ipad' | 'macbook' | 'desktop' | 'unknown';

export const LEAD_DEVICE_CATEGORIES: LeadDeviceCategory[] = ['android', 'iphone', 'ipad', 'macbook', 'desktop', 'unknown'];

export const LEAD_DEVICE_LABELS: Record<LeadDeviceCategory, string> = {
  android: 'Android',
  iphone: 'iPhone',
  ipad: 'iPad',
  macbook: 'MacBook',
  desktop: 'Desktop',
  unknown: 'Not tracked',
};

export function leadDeviceCategory(info: LeadDeviceInfo | null | undefined): LeadDeviceCategory {
  if (!info || typeof info !== 'object') return 'unknown';
  switch (info.os) {
    case 'iOS': return 'iphone';
    case 'iPadOS': return 'ipad';
    case 'Android': return 'android';
    case 'macOS': return 'macbook';
    default: return info.device_type === 'desktop' ? 'desktop' : 'unknown';
  }
}

/** Android / iPhone / iPad / MacBook / Desktop — no versions or models. */
export function formatLeadDevice(info: LeadDeviceInfo | null | undefined): string | null {
  if (!info || typeof info !== 'object') return null;
  const cat = leadDeviceCategory(info);
  return cat === 'unknown' ? null : LEAD_DEVICE_LABELS[cat];
}

export type LeadTable =
  | 'diamond_form_leads'
  | 'grill_form_leads'
  | 'custom_enquiry_leads'
  | 'design_requests'
  | 'metal_buying_leads'
  | 'appointment_bookings'
  | 'saved_designs';

const isMissingDeviceColumn = (error: { code?: string; message?: string } | null) =>
  !!error
  && (error.code === 'PGRST204' || error.code === '42703')
  && /device_info/.test(error.message || '');

/**
 * Insert a public lead row with the submitter's device attached.
 * If the `device_info` column is not live yet, the lead is saved without it —
 * device capture must never cost a lead.
 */
export async function insertLeadRow<T extends LeadTable>(table: T, row: TablesInsert<T>) {
  const device = await getLeadDeviceInfo();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  if (device) {
    const res = await client.from(table).insert({ ...row, device_info: device });
    if (!isMissingDeviceColumn(res.error)) return res as { error: { message: string; code?: string } | null };
  }
  return client.from(table).insert(row) as Promise<{ error: { message: string; code?: string } | null }>;
}
