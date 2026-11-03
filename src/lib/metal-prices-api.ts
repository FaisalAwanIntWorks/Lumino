// Metal Prices API utility
// Fetches live prices from GoldAPI.io via edge function, falls back to demo data

import { supabase } from '@/integrations/supabase/client';

export interface MetalPrice {
  metal: 'gold' | 'silver' | 'platinum';
  pricePerOz: number;
  previousClose: number;
  change: number;
  changePercent: number;
  lastUpdated: Date;
}

export interface MetalPricesResponse {
  prices: MetalPrice[];
  isDemo: boolean;
  lastUpdated: Date;
}

// Demo prices based on realistic market values
const DEMO_PRICES: Record<string, { base: number; volatility: number }> = {
  gold: { base: 2340, volatility: 0.02 },
  silver: { base: 28.50, volatility: 0.03 },
  platinum: { base: 975, volatility: 0.025 },
};

function generateDemoPrice(metal: 'gold' | 'silver' | 'platinum'): MetalPrice {
  const config = DEMO_PRICES[metal];
  const randomFactor = 1 + (Math.random() - 0.5) * config.volatility;
  const currentPrice = config.base * randomFactor;
  const previousClose = config.base * (1 + (Math.random() - 0.5) * config.volatility);
  const change = currentPrice - previousClose;
  const changePercent = (change / previousClose) * 100;

  return {
    metal,
    pricePerOz: Math.round(currentPrice * 100) / 100,
    previousClose: Math.round(previousClose * 100) / 100,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
    lastUpdated: new Date(),
  };
}

function getDemoPrices(): MetalPricesResponse {
  return {
    prices: [
      generateDemoPrice('gold'),
      generateDemoPrice('silver'),
      generateDemoPrice('platinum'),
    ],
    isDemo: true,
    lastUpdated: new Date(),
  };
}

// Get current metal prices — live API first, demo fallback
export async function getCurrentPrices(): Promise<MetalPricesResponse> {
  try {
    const { data, error } = await supabase.functions.invoke('fetch-metal-prices');

    if (error || !data?.prices) {
      console.warn('Live prices unavailable, using demo:', error?.message || 'No data');
      return getDemoPrices();
    }

    const metals: Array<'gold' | 'silver' | 'platinum'> = ['gold', 'silver', 'platinum'];
    const prices: MetalPrice[] = metals
      .filter(m => data.prices[m])
      .map(m => ({
        metal: m,
        pricePerOz: data.prices[m].pricePerOz,
        previousClose: data.prices[m].previousClose,
        change: data.prices[m].change,
        changePercent: data.prices[m].changePercent,
        lastUpdated: new Date(data.prices[m].lastUpdated),
      }));

    if (prices.length === 0) {
      return getDemoPrices();
    }

    return {
      prices,
      isDemo: false,
      lastUpdated: new Date(data.timestamp),
    };
  } catch (err) {
    console.warn('Failed to fetch live prices, using demo:', err);
    return getDemoPrices();
  }
}

// Price alert thresholds
export const ALERT_THRESHOLDS = {
  minor: 5,
  moderate: 10,
  significant: 15,
};

export function getAlertLevel(changePercent: number): 'none' | 'minor' | 'moderate' | 'significant' {
  const absChange = Math.abs(changePercent);
  if (absChange >= ALERT_THRESHOLDS.significant) return 'significant';
  if (absChange >= ALERT_THRESHOLDS.moderate) return 'moderate';
  if (absChange >= ALERT_THRESHOLDS.minor) return 'minor';
  return 'none';
}

// Metal display configuration
export const METAL_CONFIG = {
  gold: {
    name: 'Gold',
    symbol: 'XAU',
    color: '#FFD700',
    bgGradient: 'from-yellow-500/20 to-yellow-600/10',
    iconColor: 'text-yellow-500',
  },
  silver: {
    name: 'Silver',
    symbol: 'XAG',
    color: '#C0C0C0',
    bgGradient: 'from-slate-400/20 to-slate-500/10',
    iconColor: 'text-slate-400',
  },
  platinum: {
    name: 'Platinum',
    symbol: 'XPT',
    color: '#E5E4E2',
    bgGradient: 'from-zinc-300/20 to-zinc-400/10',
    iconColor: 'text-zinc-400',
  },
};
