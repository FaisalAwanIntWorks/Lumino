/**
 * Centralized staff permission helpers.
 *
 * Permission values stored in `staff_members.permissions` JSON:
 *   - `'edit'`   — full view + edit
 *   - `'view'`   — view-only (no edits, no save)
 *   - `'false'` / `false` / `undefined` — disabled (entire feature hidden)
 *
 * Legacy boolean values are also supported:
 *   - `true`  → treated as `'edit'`
 *   - `false` → treated as disabled
 *
 * Permission keys:
 *   - `catalog_access`       → Ring OS (Catalog, Widget, JewlX Agent)
 *   - `custom_x_access`      → Custom X (Ring Builder, Grillz, Custom Enquiry)
 *   - `metal_buying_access`  → Metal IQ (Widget + Leads)
 *   - `leads_access`         → Leads & Bookings
 *   - `show_leads`           → boolean; `false` hides every leads list (Leads & Bookings,
 *                              Metal IQ Leads, dashboard recent leads). Missing = shown.
 *   - `lead_email_notifications` → boolean; `true` adds the staff email to new-lead
 *                              notification emails. Missing = not sent.
 */

/** Staff may see leads unless the client explicitly switched `show_leads` off. */
export function staffCanSeeLeads(permissions: Record<string, unknown> | null | undefined): boolean {
  const v = permissions?.show_leads;
  return !(v === false || v === 'false');
}

export type StaffPermissionLevel = 'edit' | 'view' | 'disabled';

export type RawPermissionValue = boolean | string | undefined | null;

/**
 * Normalize any stored permission value into a clear level.
 */
export function getPermissionLevel(value: RawPermissionValue): StaffPermissionLevel {
  if (value === undefined || value === null) return 'disabled';
  if (value === true) return 'edit';
  if (value === false) return 'disabled';

  const normalized = String(value).toLowerCase().trim();
  if (normalized === 'edit' || normalized === 'true') return 'edit';
  if (normalized === 'view') return 'view';
  return 'disabled';
}

/**
 * True when the staff member can at least VIEW the feature.
 * Use this to decide whether to render the navigation entry / page at all.
 */
export function canView(value: RawPermissionValue): boolean {
  const level = getPermissionLevel(value);
  return level === 'edit' || level === 'view';
}

/**
 * True when the staff member can EDIT (save changes).
 * Use this to disable Save buttons / form inputs.
 */
export function canEdit(value: RawPermissionValue): boolean {
  return getPermissionLevel(value) === 'edit';
}
