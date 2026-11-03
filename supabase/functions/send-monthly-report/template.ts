// Pure rendering layer for the monthly client report email.
// Kept free of Deno/Supabase imports so it can be rendered and inspected standalone.

const PORTAL_URL = "https://vault.jewlx.ai";
const LOGO_URL = "https://vault.jewlx.ai/images/jewelx-email-logo.png";
export const WIDGET_VIEW_SOURCES = [
  { key: "jewlx_widget", label: "Ring OS widget" },
  { key: "ring_builder", label: "Ring builder form" },
  { key: "grillz_builder", label: "Grillz builder" },
  { key: "custom_enquiry", label: "Custom enquiry" },
  { key: "metal_buying", label: "Metal IQ" },
] as const;

const LEAD_SOURCE_LABELS: Record<string, string> = {
  widget: "Ring OS widget",
  ring_builder: "Ring builder form",
  diamond_form: "Diamond form",
  grill_form: "Grillz builder",
  custom_enquiry: "Custom enquiry",
  booking: "Appointment bookings",
  metal_iq: "Metal IQ",
  metal_iq_bookings: "Metal IQ bookings",
};

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
// ─── Timezone-aware month boundaries ──────────────────────────────────────
/** Offset (ms) of `tz` from UTC at the given instant. */
function tzOffsetMs(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(utcMs))) parts[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUTC - utcMs;
}

/** The UTC instant of local midnight for y-m-d in `tz`. */
function zonedStartOfDay(year: number, monthIdx: number, day: number, tz: string): Date {
  const guess = Date.UTC(year, monthIdx, day, 0, 0, 0);
  const adjusted = guess - tzOffsetMs(guess, tz);
  return new Date(guess - tzOffsetMs(adjusted, tz));
}

export interface Period {
  label: string;       // "July 2026"
  monthLabel: string;  // "July"
  periodMonth: string; // "2026-07-01" (date key for the run log)
  startISO: string;
  endISO: string;
}

export function buildPeriod(year: number, monthIdx: number, tz: string): Period {
  const start = zonedStartOfDay(year, monthIdx, 1, tz);
  const nextYear = monthIdx === 11 ? year + 1 : year;
  const nextMonth = monthIdx === 11 ? 0 : monthIdx + 1;
  const nextStart = zonedStartOfDay(nextYear, nextMonth, 1, tz);
  return {
    label: `${MONTH_NAMES[monthIdx]} ${year}`,
    monthLabel: MONTH_NAMES[monthIdx],
    periodMonth: `${year}-${String(monthIdx + 1).padStart(2, "0")}-01`,
    startISO: start.toISOString(),
    // end is exclusive-by-1ms so it never double-counts the next month's first row
    endISO: new Date(nextStart.getTime() - 1).toISOString(),
  };
}

// ─── Formatting helpers ───────────────────────────────────────────────────
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function fmtInt(n: number): string {
  return new Intl.NumberFormat("en-US").format(Math.round(n || 0));
}

function fmtMoney(n: number, currency: string, decimals = 0): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: (currency || "USD").toUpperCase(),
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n || 0);
  } catch {
    return `$${decimals ? (n || 0).toFixed(decimals) : fmtInt(n)}`;
  }
}

function pct(part: number, whole: number): string {
  if (!whole) return "0%";
  return `${(Math.round((part / whole) * 1000) / 10).toFixed(1)}%`;
}

// ─── Stats ────────────────────────────────────────────────────────────────
export interface Stats {
  views: number;
  uniqueVisitors: number;
  viewsBySource: Record<string, { total: number; unique: number }>;
  leads: number;
  leadSources: Record<string, number>;
  aiGenerations: number;
  aiImages: number;
  aiChats: number;
  bookings: number;
  orders: number;
  revenue: number;
  deposits: number;
  depositCount: number;
  cadRequests: number;
}

export const EMPTY_STATS: Stats = {
  views: 0, uniqueVisitors: 0, viewsBySource: {}, leads: 0, leadSources: {},
  aiGenerations: 0, aiImages: 0, aiChats: 0, bookings: 0, orders: 0,
  revenue: 0, deposits: 0, depositCount: 0, cadRequests: 0,
};
// ─── Email template ───────────────────────────────────────────────────────
export interface TemplateInput {
  companyName: string;
  period: Period;
  stats: Stats;
  previous: Stats;
  currency: string;
  walletBalance: number;
  freeCredits: number;
  upcomingBookings: number;
}

function deltaChip(current: number, previous: number): string {
  if (!previous) {
    if (!current) return `<span style="color:#999;font-size:12px;">no change</span>`;
    return `<span style="color:#0b6e4f;font-size:12px;font-weight:600;">new this month</span>`;
  }
  const change = ((current - previous) / previous) * 100;
  const rounded = Math.round(change);
  if (rounded === 0) return `<span style="color:#999;font-size:12px;">flat vs last month</span>`;
  const up = rounded > 0;
  const color = up ? "#0b6e4f" : "#b4433a";
  return `<span style="color:${color};font-size:12px;font-weight:600;">${up ? "▲" : "▼"} ${Math.abs(rounded)}% vs last month</span>`;
}

function heroCell(label: string, current: number, previous: number): string {
  return `
    <td width="33%" valign="top" style="padding:18px 10px;text-align:center;background-color:#fafafa;border:1px solid #eee;border-radius:6px;">
      <div style="color:#777;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">${esc(label)}</div>
      <div style="color:#1a1a1a;font-size:30px;font-weight:700;line-height:1.2;padding:6px 0 4px;">${fmtInt(current)}</div>
      ${deltaChip(current, previous)}
    </td>`;
}

function breakdownRows(
  entries: Array<{ label: string; value: number }>,
  total: number,
): string {
  const visible = entries.filter((e) => e.value > 0).sort((a, b) => b.value - a.value);
  if (visible.length === 0) {
    return `<tr><td colspan="3" style="padding:10px 0;color:#999;font-size:14px;">No activity recorded this month.</td></tr>`;
  }
  return visible.map((e) => {
    const share = total ? Math.round((e.value / total) * 100) : 0;
    const barWidth = Math.max(share, 2);
    return `
      <tr>
        <td style="padding:8px 0;color:#333;font-size:14px;">${esc(e.label)}</td>
        <td width="120" style="padding:8px 0;">
          <div style="background-color:#eee;border-radius:3px;height:6px;width:100px;">
            <div style="background-color:#0b6e4f;border-radius:3px;height:6px;width:${barWidth}%;"></div>
          </div>
        </td>
        <td width="70" align="right" style="padding:8px 0;color:#1a1a1a;font-size:14px;font-weight:600;white-space:nowrap;">
          ${fmtInt(e.value)} <span style="color:#999;font-weight:400;">(${share}%)</span>
        </td>
      </tr>`;
  }).join("");
}

function secondaryRow(label: string, value: string): string {
  return `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid #f0f0f0;color:#666;font-size:14px;">${esc(label)}</td>
      <td align="right" style="padding:9px 0;border-bottom:1px solid #f0f0f0;color:#1a1a1a;font-size:14px;font-weight:600;">${value}</td>
    </tr>`;
}

export function buildEmailHtml(input: TemplateInput): string {
  const { companyName, period, stats, previous, currency, walletBalance, freeCredits, upcomingBookings } = input;

  // metal_iq_bookings is a subset of appointment bookings — surfaced under Activity,
  // not here, so the percentages add up to 100%.
  const leadEntries = Object.entries(stats.leadSources)
    .filter(([key]) => key !== "metal_iq_bookings")
    .map(([key, value]) => ({ label: LEAD_SOURCE_LABELS[key] ?? key, value }));
  const viewEntries = WIDGET_VIEW_SOURCES.map(({ key, label }) => ({
    label,
    value: stats.viewsBySource[key]?.total ?? 0,
  }));

  const revenueBlock = stats.revenue > 0 || stats.orders > 0
    ? `
      <h3 style="margin:32px 0 8px;color:#1a1a1a;font-size:15px;font-weight:600;">Revenue</h3>
      <table role="presentation" width="100%" style="border-collapse:collapse;">
        ${secondaryRow("Orders placed", fmtInt(stats.orders))}
        ${secondaryRow("Total revenue", fmtMoney(stats.revenue, currency))}
        ${stats.depositCount > 0 ? secondaryRow(`Deposits collected (${fmtInt(stats.depositCount)})`, fmtMoney(stats.deposits, currency)) : ""}
      </table>`
    : "";

  const upcomingBlock = upcomingBookings > 0
    ? `<p style="margin:24px 0 0;padding:14px 16px;background-color:#f3f8f6;border-left:3px solid #0b6e4f;color:#1a5c46;font-size:14px;line-height:1.6;">
         You have <strong>${fmtInt(upcomingBookings)}</strong> upcoming appointment${upcomingBookings === 1 ? "" : "s"} booked in the next 30 days.
       </p>`
    : "";

  const conversion = pct(stats.leads, stats.views);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your ${esc(period.label)} report</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${fmtInt(stats.views)} views, ${fmtInt(stats.leads)} leads and ${fmtInt(stats.aiGenerations)} AI generations in ${esc(period.monthLabel)}.
  </div>
  <table role="presentation" style="width:100%;border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" style="width:100%;max-width:600px;border-collapse:collapse;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
          <!-- Header -->
          <tr>
            <td style="padding:32px 40px 24px;text-align:center;background-color:#000000;">
              <img src="${LOGO_URL}" alt="JewlX" style="height:56px;" />
            </td>
          </tr>
          <!-- Intro -->
          <tr>
            <td style="padding:36px 40px 0;">
              <p style="margin:0 0 6px;color:#0b6e4f;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Monthly report</p>
              <h1 style="margin:0 0 8px;color:#1a1a1a;font-size:24px;font-weight:600;line-height:1.3;">
                Here's what happened in ${esc(period.monthLabel)}
              </h1>
              <p style="margin:0 0 28px;color:#777;font-size:14px;line-height:1.6;">
                ${esc(companyName)} &middot; ${esc(period.label)}
              </p>

              <!-- Hero stats -->
              <table role="presentation" width="100%" style="border-collapse:separate;border-spacing:8px 0;">
                <tr>
                  ${heroCell("Views", stats.views, previous.views)}
                  ${heroCell("Leads", stats.leads, previous.leads)}
                  ${heroCell("AI generations", stats.aiGenerations, previous.aiGenerations)}
                </tr>
              </table>

              <p style="margin:18px 0 0;color:#666;font-size:14px;line-height:1.6;">
                ${fmtInt(stats.uniqueVisitors)} unique visitor${stats.uniqueVisitors === 1 ? "" : "s"} opened your tools and
                <strong style="color:#1a1a1a;">${conversion}</strong> of views turned into a lead.
              </p>

              <!-- Lead sources -->
              <h3 style="margin:32px 0 8px;color:#1a1a1a;font-size:15px;font-weight:600;">Where your leads came from</h3>
              <table role="presentation" width="100%" style="border-collapse:collapse;">
                ${breakdownRows(leadEntries, stats.leads)}
              </table>

              <!-- Views by surface -->
              <h3 style="margin:32px 0 8px;color:#1a1a1a;font-size:15px;font-weight:600;">Views by surface</h3>
              <table role="presentation" width="100%" style="border-collapse:collapse;">
                ${breakdownRows(viewEntries, stats.views)}
              </table>

              <!-- Activity -->
              <h3 style="margin:32px 0 8px;color:#1a1a1a;font-size:15px;font-weight:600;">Activity</h3>
              <table role="presentation" width="100%" style="border-collapse:collapse;">
                ${secondaryRow("AI previews generated", fmtInt(stats.aiImages))}
                ${secondaryRow("AI chat conversations", fmtInt(stats.aiChats))}
                ${secondaryRow("Appointments booked", fmtInt(stats.bookings))}
                ${stats.leadSources.metal_iq_bookings ? secondaryRow("— of which Metal IQ bookings", fmtInt(stats.leadSources.metal_iq_bookings)) : ""}
                ${secondaryRow("CAD requests", fmtInt(stats.cadRequests))}
              </table>

              ${revenueBlock}

              <!-- AI balance -->
              <h3 style="margin:32px 0 8px;color:#1a1a1a;font-size:15px;font-weight:600;">AI balance</h3>
              <table role="presentation" width="100%" style="border-collapse:collapse;">
                ${secondaryRow("Wallet balance", fmtMoney(walletBalance, "USD", 2))}
                ${secondaryRow("Free credits remaining", fmtMoney(freeCredits, "USD", 2))}
              </table>

              ${upcomingBlock}

              <!-- CTA -->
              <table role="presentation" width="100%" style="border-collapse:collapse;">
                <tr>
                  <td align="center" style="padding:32px 0 8px;">
                    <a href="${PORTAL_URL}/dashboard" style="display:inline-block;padding:12px 24px;background-color:#0b6e4f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:6px;">
                      Open your dashboard
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:8px 0 36px;color:#999;font-size:13px;line-height:1.6;text-align:center;">
                Full lead details, follow-ups and exports live in your JewlX dashboard.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;background-color:#fafafa;border-top:1px solid #eee;">
              <p style="margin:0;color:#999;font-size:12px;line-height:1.7;text-align:center;">
                You're receiving this because monthly reports are on for ${esc(companyName)}.<br>
                Turn them off any time under <a href="${PORTAL_URL}/dashboard/settings" style="color:#0b6e4f;text-decoration:none;">Settings &rsaquo; Notifications</a>.<br><br>
                &copy; ${new Date().getFullYear()} JewlX. All rights reserved.<br>
                <a href="https://jewlx.ai" style="color:#0b6e4f;text-decoration:none;font-weight:600;">jewlx.ai</a>
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
