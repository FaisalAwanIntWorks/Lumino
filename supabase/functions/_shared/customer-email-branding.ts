// Shared helper for customer-facing email branding (logo, Contact CTA, Powered-by footer).
// Used ONLY for emails that are sent to the client's customers — not for emails
// sent to the client themselves or to JewlX admins.

import { escapeHtml } from "./security-utils.ts";

const JEWLX_DEFAULT_LOGO = "https://vault.jewlx.ai/images/jewelx-email-logo.png";

export interface CustomerBranding {
  logoUrl: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
  companyName: string;
  headerAppearance: "dark" | "light";
  /** Client's own inbox — used as Reply-To so customer replies reach the jeweler, not JewlX. */
  replyTo: string | null;
}

function isSafeCtaUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  return /^(https?:\/\/|mailto:|tel:)/i.test(trimmed);
}

export async function loadCustomerBranding(
  supabase: any,
  clientId: string | null | undefined,
): Promise<CustomerBranding> {
  if (!clientId) {
    return {
      logoUrl: JEWLX_DEFAULT_LOGO,
      ctaLabel: null,
      ctaUrl: null,
      companyName: "",
      headerAppearance: "dark",
      replyTo: null,
    };
  }

  const { data } = await supabase
    .from("clients")
    .select("company_name, email, logo_url, email_logo_url, customer_email_cta_label, customer_email_cta_url, customer_email_header_appearance")
    .eq("id", clientId)
    .maybeSingle();

  const logoUrl = (data?.email_logo_url || data?.logo_url || JEWLX_DEFAULT_LOGO) as string;
  const ctaLabel = (data?.customer_email_cta_label || "").trim() || null;
  const ctaUrlRaw = (data?.customer_email_cta_url || "").trim();
  const ctaUrl = isSafeCtaUrl(ctaUrlRaw) ? ctaUrlRaw : null;
  const replyToRaw = (data?.email || "").trim();
  const replyTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyToRaw) ? replyToRaw : null;

  return {
    logoUrl,
    ctaLabel,
    ctaUrl,
    companyName: data?.company_name || "",
    headerAppearance: data?.customer_email_header_appearance === "light" ? "light" : "dark",
    replyTo,
  };
}

/** Renders the header (logo) row — drop into a <table> cell. */
export function renderEmailHeader(branding: CustomerBranding): string {
  const alt = branding.companyName ? escapeHtml(branding.companyName) : "JewlX";
  const src = escapeHtml(branding.logoUrl);
  const isLight = branding.headerAppearance === "light";
  const className = isLight ? "email-header email-header-light" : "email-header email-header-dark";
  const backgroundColor = isLight ? "#ffffff" : "#000000";
  const border = isLight ? "border-bottom:1px solid #eeeeee;" : "";
  return `<td class="${className}" bgcolor="${backgroundColor}" style="padding:32px 40px 24px;text-align:center;background-color:${backgroundColor};${border}">
    <img src="${src}" alt="${alt}" style="max-height:56px;max-width:240px;display:inline-block;" />
  </td>`;
}

/** Renders a Contact CTA button. Returns empty string if label or url missing. */
export function renderContactCta(branding: CustomerBranding): string {
  if (!branding.ctaLabel || !branding.ctaUrl) return "";
  const label = escapeHtml(branding.ctaLabel);
  const url = escapeHtml(branding.ctaUrl);
  return `<table role="presentation" style="width:100%;border-collapse:collapse;margin:24px 0 8px;">
    <tr><td align="center">
      <a href="${url}" style="display:inline-block;padding:14px 32px;background-color:#0b6e4f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:6px;">${label}</a>
    </td></tr>
  </table>`;
}

/** Powered-by JewlX footer line — append inside footer cell of customer emails. */
export const POWERED_BY_JEWLX_FOOTER = `<p style="margin:8px 0 0;color:#999;font-size:12px;text-align:center;">Powered by <a href="https://jewlx.ai" style="color:#0b6e4f;text-decoration:none;">JewlX</a></p>`;
