/**
 * Shared utilities for the "client uploads custom image for a default option" feature
 * used across Ring Builder, Grill Builder, and Custom Enquiry Custom X forms.
 *
 * Storage column: `option_image_overrides` (JSONB) on each *_config table.
 * Shape: Record<stepKey, Record<optionValue, publicUrl>>.
 *
 * Hard validation: 2MB max, PNG/WEBP/JPEG only.
 */
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type OptionImageOverrides = Record<string, Record<string, string>>;

export const MAX_OVERRIDE_BYTES = 2 * 1024 * 1024; // 2 MB hard cap
export const ACCEPTED_OVERRIDE_TYPES = ['image/png', 'image/webp', 'image/jpeg'] as const;
export const ACCEPTED_OVERRIDE_INPUT_ACCEPT = 'image/png,image/webp,image/jpeg';

export type OverrideScope = 'ring' | 'grill' | 'custom-enquiry';

const SCOPE_PREFIX: Record<OverrideScope, string> = {
  ring: 'ring-form-options',
  grill: 'grill-options',
  'custom-enquiry': 'custom-enquiry-options',
};

/** Returns null + toasts on failure; otherwise returns a public URL. */
export async function uploadOptionOverride(opts: {
  scope: OverrideScope;
  clientId: string;
  stepKey: string;
  optionValue: string;
  file: File;
}): Promise<string | null> {
  const { scope, clientId, stepKey, optionValue, file } = opts;

  if (!(ACCEPTED_OVERRIDE_TYPES as readonly string[]).includes(file.type)) {
    toast.error('Only PNG, WEBP, or JPEG images are allowed.');
    return null;
  }
  if (file.size > MAX_OVERRIDE_BYTES) {
    toast.error('Image must be 2 MB or smaller.');
    return null;
  }

  const ext = (file.name.split('.').pop() || 'png').toLowerCase();
  const safeStep = stepKey.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeValue = optionValue.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'option';
  const path = `${SCOPE_PREFIX[scope]}/${clientId}/${safeStep}/${safeValue}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from('ring-assets')
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type });

  if (error) {
    console.error('[option-image-overrides] upload failed', error);
    toast.error('Failed to upload image. Please try again.');
    return null;
  }

  const { data } = supabase.storage.from('ring-assets').getPublicUrl(path);
  return data?.publicUrl || null;
}

/** Pure helper — returns override URL for a given option, or undefined. */
export function getOverrideUrl(
  overrides: OptionImageOverrides | null | undefined,
  stepKey: string,
  optionValue: string,
): string | undefined {
  if (!overrides) return undefined;
  const stepMap = overrides[stepKey];
  if (!stepMap) return undefined;
  return stepMap[optionValue] || undefined;
}

/** Pure helper — returns a new overrides map with the value set. */
export function setOverride(
  overrides: OptionImageOverrides | null | undefined,
  stepKey: string,
  optionValue: string,
  url: string,
): OptionImageOverrides {
  const base: OptionImageOverrides = { ...(overrides || {}) };
  base[stepKey] = { ...(base[stepKey] || {}), [optionValue]: url };
  return base;
}

/** Pure helper — returns a new overrides map without the given option override. */
export function removeOverride(
  overrides: OptionImageOverrides | null | undefined,
  stepKey: string,
  optionValue: string,
): OptionImageOverrides {
  if (!overrides || !overrides[stepKey]) return overrides ? { ...overrides } : {};
  const stepMap = { ...overrides[stepKey] };
  delete stepMap[optionValue];
  const next: OptionImageOverrides = { ...overrides };
  if (Object.keys(stepMap).length === 0) {
    delete next[stepKey];
  } else {
    next[stepKey] = stepMap;
  }
  return next;
}
