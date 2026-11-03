# AI Wallet & Revenue & Usage — Module Bundle

This bundle contains every file in the project related to two admin modules:

1. **AI Wallet** (`/admin/ai-wallet` → `AiCostCalculator.tsx`) — manages credit balances, plans, platform AI config, per-client quotas, simulator, and the client-side wallet/top-up surface.
2. **Revenue & Usage** (`/admin/revenue-usage` → `RevenueUsage.tsx`) — admin analytics for usage products and subscription products, with KPI strips, filters, drawers, CSV export.

## Layout

```
src/
  components/
    admin/
      ai-cost/                 → AI Wallet admin panels (Plans, Simulator, Platform config, Client quota)
      revenue-usage/           → Revenue & Usage tabs, tables, filters, drawer, export
    client/usage/              → Client-side wallet card, usage metrics, cost estimator, API analytics
    settings/AiUsage*          → AI usage section embedded inside client Settings
  hooks/useAdminRevenueUsage.ts → React Query hooks for the two RPCs
  lib/
    credit-utils.ts            → USD ↔ credits conversion, packs, presets
    usage-utils.ts             → Usage helpers
  pages/
    admin/AiCostCalculator.tsx → AI Wallet page
    admin/RevenueUsage.tsx     → Revenue & Usage page
    admin/Usage.tsx            → Legacy admin usage page
    client/Usage.tsx           → Client AI Credits page
    client/CreditsSuccess.tsx  → Stripe checkout success
supabase/
  functions/                   → Edge functions powering wallet, recharge, Stripe, usage snapshots, alerts
  migrations/                  → All SQL migrations defining wallet_transactions, client_ai_quota,
                                 platform_ai_config, subscription_plans, client_subscriptions,
                                 admin_get_usage_overview RPC, admin_get_subscription_overview RPC, etc.
```

## Edge functions

- `purchase-credits` — Stripe Checkout session for credit packs
- `verify-credit-purchase` — confirms Stripe session, credits wallet
- `process-auto-recharge` — auto top-up when balance hits threshold
- `grant-free-credits` — monthly free-credit allocation cron
- `stripe-webhook` — handles subscription/invoice events, billing
- `reconcile-client-stripe` — reconciles Stripe customer/subscription
- `usage-snapshot` — periodic usage rollups
- `usage-alerts-check` — threshold alert cron
- `ai-intelligence-stats` — aggregated AI usage analytics

## Key DB objects (defined across the included migrations)

- Tables: `wallet_transactions`, `client_ai_quota`, `platform_ai_config`,
  `subscription_plans`, `client_subscriptions`, `purchased_credits`,
  `ai_usage_log`, `stripe_*` webhook tables
- RPCs: `admin_get_usage_overview(p_start, p_end, p_resold_only)`,
  `admin_get_subscription_overview(p_start, p_end)`
- Crons: free credit allocation, usage snapshots, alert checks
