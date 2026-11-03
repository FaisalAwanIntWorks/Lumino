// Metal IQ volume tiers — pure pricing helpers.
// MIRRORED in supabase/functions/_shared/metal-offer-tiers.ts — keep both files identical.

export interface VolumeTier {
  /** Inclusive lower bound of total submission weight (grams). */
  min_grams: number;
  /** Bonus in percentage points added to the karat's buy %. */
  bonus_pct: number;
}

export interface VolumeTierConfig {
  enabled: boolean;
  tiers: VolumeTier[];
  /** Flat buy % for 24K gold when total 24K weight exceeds the bullion threshold. 0/undefined = off. */
  bullion_24k_pct?: number;
  /** Threshold in troy ounces for the 24K bullion rate (strictly greater than). */
  bullion_24k_min_oz?: number;
}

export const TROY_OZ_GRAMS = 31.1035;

export const DEFAULT_VOLUME_TIER_CONFIG: VolumeTierConfig = {
  enabled: false,
  tiers: [
    { min_grams: 0, bonus_pct: 0 },
    { min_grams: 20, bonus_pct: 2 },
    { min_grams: 100, bonus_pct: 5 },
  ],
  bullion_24k_pct: 87.5,
  bullion_24k_min_oz: 5,
};

export function normalizeTierConfig(raw: unknown): VolumeTierConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.enabled !== true) return null;
  const tiers = Array.isArray(r.tiers)
    ? (r.tiers as any[])
        .map((t) => ({ min_grams: Number(t?.min_grams), bonus_pct: Number(t?.bonus_pct) }))
        .filter((t) => Number.isFinite(t.min_grams) && t.min_grams >= 0 && Number.isFinite(t.bonus_pct) && t.bonus_pct >= 0 && t.bonus_pct <= 50)
        .sort((a, b) => a.min_grams - b.min_grams)
    : [];
  const bp = Number(r.bullion_24k_pct);
  const boz = Number(r.bullion_24k_min_oz);
  return {
    enabled: true,
    tiers,
    bullion_24k_pct: Number.isFinite(bp) && bp > 0 && bp <= 100 ? bp : undefined,
    bullion_24k_min_oz: Number.isFinite(boz) && boz > 0 ? boz : 5,
  };
}

/** Bonus points for a total submission weight (whole submission decides the tier). */
export function tierBonusFor(totalGrams: number, cfg: VolumeTierConfig | null): { bonus: number; tierIndex: number } {
  if (!cfg || !cfg.tiers.length || !(totalGrams > 0)) return { bonus: 0, tierIndex: -1 };
  let idx = -1;
  for (let i = 0; i < cfg.tiers.length; i++) {
    if (totalGrams >= cfg.tiers[i].min_grams) idx = i;
  }
  return { bonus: idx >= 0 ? cfg.tiers[idx].bonus_pct : 0, tierIndex: idx };
}

export interface LineRateInput {
  metal: string;
  karat: string;
  baseBuyPct: number;
  refinerySellPct: number;
}

export interface LineRateResult {
  buyPct: number;
  bonusApplied: number;
  bullionApplied: boolean;
  capped: boolean;
}

/**
 * Effective buy % for one line. Never exceeds the metal's refinery sell %.
 * 24K bullion rate replaces base+bonus when it is higher and the 24K total exceeds the threshold.
 */
export function effectiveLineRate(
  line: LineRateInput,
  totalGrams: number,
  total24kGrams: number,
  cfg: VolumeTierConfig | null,
): LineRateResult {
  if (!cfg) return { buyPct: line.baseBuyPct, bonusApplied: 0, bullionApplied: false, capped: false };
  const { bonus } = tierBonusFor(totalGrams, cfg);
  let rate = line.baseBuyPct + bonus;
  let bullionApplied = false;
  if (
    line.metal === 'gold' && line.karat === '24K' && cfg.bullion_24k_pct &&
    total24kGrams > (cfg.bullion_24k_min_oz ?? 5) * TROY_OZ_GRAMS &&
    cfg.bullion_24k_pct > rate
  ) {
    rate = cfg.bullion_24k_pct;
    bullionApplied = true;
  }
  let capped = false;
  // Tiers can never lift the rate above what the refinery pays. Never lower a jeweler's own base rate.
  const ceiling = Math.max(line.baseBuyPct, line.refinerySellPct);
  if (rate > ceiling) { rate = ceiling; capped = true; }
  return { buyPct: rate, bonusApplied: bullionApplied ? 0 : Math.min(bonus, rate - line.baseBuyPct), bullionApplied, capped };
}
