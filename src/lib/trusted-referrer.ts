/**
 * Internal Aurezo portals that are always trusted as embed referrers.
 * Used by embed pages to allow the "Test in New Tab" flow from
 * studio.aurezotech.com / studioadmin.aurezotech.com without forcing jewelers to add
 * those domains to their public allowed_domains whitelist.
 */
const TRUSTED_HOSTS = [
  'studio.aurezotech.com',
  'studioadmin.aurezotech.com',
  'widget.aurezotech.com',
  'aurezotech.com',
];

/**
 * Returns true when the request comes from the same hostname as the
 * widget OR from one of our internal Aurezo portals.
 * External embeds still go through the allowed_domains whitelist.
 */
export function isTrustedReferrer(referrer: string, currentHostname: string): boolean {
  // E5/G3: Empty referrer is NOT automatically trusted — force the server-side
  // domain-authorization check (client_branding.allowed_domains) instead.
  if (!referrer) return false;
  if (referrer.includes(currentHostname)) return true;
  try {
    const referrerHost = new URL(referrer).hostname;
    return TRUSTED_HOSTS.some(
      (h) => referrerHost === h || referrerHost.endsWith(`.${h}`)
    );
  } catch {
    return false;
  }
}
