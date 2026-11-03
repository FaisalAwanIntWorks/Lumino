// Credit conversion layer
// Internally the database operates in USD. Credits are a display abstraction.
// 1 credit = $0.0005 (anchored to cheapest AI op: 1 chat message)

export const CREDIT_RATE = 0.0005; // 1 credit = $0.0005
export const FREE_MONTHLY_CREDITS = 45_000; // 45,000 credits/month free for every client (actual value set in platform_ai_config.monthly_free_credits_dollars)
export const FREE_MONTHLY_DOLLARS = FREE_MONTHLY_CREDITS * CREDIT_RATE; // $22.50 default

export const dollarsToCredits = (dollars: number): number =>
  Math.round(Math.abs(dollars) / CREDIT_RATE);

export const creditsToDollars = (credits: number): number =>
  credits * CREDIT_RATE;

export const formatCredits = (dollars: number): string =>
  dollarsToCredits(dollars).toLocaleString();

// Credit costs per AI feature (defaults — actual costs fetched from platform_ai_config at runtime)
export const CREDIT_COSTS = {
  chat: 2,         // $0.0009 / $0.0005 = 1.8 cr (rounded to 2 for display; DB debits exact 1.8)
  costEstimate: 2, // same model as chat
  imageRender: 144, // $0.072 / $0.0005 (Nano Banana 2 $0.04 base × 1.8 multiplier)
} as const;

// Credit packs for purchase (client-facing)
export const CREDIT_PACKS = [
  { amount: 25, credits: 50_000, label: '50,000', bonus: 0, popular: false },
  { amount: 50, credits: 110_000, label: '110,000', bonus: 10_000, popular: true },
  { amount: 100, credits: 240_000, label: '240,000', bonus: 40_000, popular: false },
] as const;

// Auto-recharge presets (credit-first, includes smaller options)
export const RECHARGE_PRESETS = [
  { credits: 10_000, dollars: 5, label: '10,000' },
  { credits: 25_000, dollars: 12.5, label: '25,000' },
  ...CREDIT_PACKS.map(p => ({
    credits: p.credits,
    dollars: p.amount,
    label: p.label,
  })),
];

// Threshold presets for auto-recharge trigger
export const THRESHOLD_PRESETS = [
  { credits: 5_000, dollars: 2.5, label: '5,000' },
  { credits: 10_000, dollars: 5, label: '10,000' },
  { credits: 25_000, dollars: 12.5, label: '25,000' },
] as const;

// Map credits from CREDIT_PACKS to their pack dollar amount
export const creditPackDollars: Record<number, number> = Object.fromEntries(
  CREDIT_PACKS.map(p => [p.credits, p.amount])
);

// Format a transaction amount as credits with sign
export const formatTxCredits = (dollarAmount: number): string => {
  const credits = dollarsToCredits(dollarAmount);
  const sign = dollarAmount >= 0 ? '+' : '-';
  return `${sign}${credits.toLocaleString()}`;
};
