/**
 * N6: Single source of truth for per-form default option lists.
 * Previously duplicated between the onboarding page and the form component for
 * both Grillz and Custom Enquiry, causing them to drift independently.
 * Ring Builder already exports its defaults from ring-builder-constants.ts.
 */

export const GRILL_DEFAULT_BUDGET_OPTIONS = [
  '$1,000 - $3,000',
  '$3,001 - $6,000',
  '$6,000 - $12,000',
  '$12,001 - $20,000',
  '$20,000+',
] as const;

export const ENQUIRY_DEFAULT_BUDGET_OPTIONS = [
  '$2000-$4000',
  '$4000-$6000',
  '$6000-$15,000',
] as const;

export const ENQUIRY_DEFAULT_TIMELINE_OPTIONS = [
  '1-2 Weeks',
  '2-4 Weeks',
  '1-2 Months',
  '3+ Months',
  'No Rush',
] as const;
