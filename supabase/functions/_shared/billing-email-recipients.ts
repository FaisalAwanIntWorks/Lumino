// The only team addresses that receive subscription/billing admin emails.
// In-app bell notifications still go to every admin.
export const BILLING_EMAIL_RECIPIENTS: string[] = [
  "gskinot@wavesmvmnt.com",
  "vikramk@wavesmvmnt.com",
];

export const BILLING_ACCESS_EVENT_TYPES = new Set([
  "subscription_status_changed",
  "plan_changed",
  "billing_override_changed",
]);
