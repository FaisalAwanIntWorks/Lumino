import { UsageSnapshot, FREE_TIER_LIMITS } from './usage-utils';

export interface CostProjection {
  service: string;
  currentUsage: number;
  limit: number;
  percentUsed: number;
  growthRate: number; // MB or count per day
  daysUntilLimit: number;
  projectedMonthlyCost: number;
  status: 'safe' | 'warning' | 'critical';
}

export interface UsageProjection {
  projections: CostProjection[];
  totalProjectedCost: number;
  nextServiceToLimit: string;
  daysUntilFirstLimit: number;
  confidenceLevel: 'high' | 'medium' | 'low';
}

const calculateGrowthRate = (snapshots: UsageSnapshot[], field: keyof UsageSnapshot): number => {
  if (snapshots.length < 2) return 0;

  // Get values from snapshots
  const values = snapshots.map(s => Number(s[field]) || 0);
  
  // Calculate daily growth rate using linear regression
  const n = values.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  return Math.max(0, slope); // Ensure non-negative growth
};

const estimateDaysUntilLimit = (currentUsage: number, limit: number, dailyGrowth: number): number => {
  if (dailyGrowth <= 0) return Infinity;
  if (currentUsage >= limit) return 0;
  
  const remaining = limit - currentUsage;
  return Math.round(remaining / dailyGrowth);
};

const getStatusFromDays = (days: number): 'safe' | 'warning' | 'critical' => {
  if (days < 30) return 'critical';
  if (days < 90) return 'warning';
  return 'safe';
};

// Simplified pricing estimates (actual pricing varies)
const ESTIMATED_COSTS = {
  database: 0.125, // per GB per month
  storage: 0.021, // per GB per month
  functions: 2.0, // per 1M invocations
  bandwidth: 0.09, // per GB
};

const calculateProjectedCost = (currentUsage: number, limit: number, growthRate: number, costPerUnit: number): number => {
  // If we exceed free tier, calculate overage cost
  if (currentUsage >= limit) {
    const overage = (currentUsage - limit) / 1000; // Convert to GB if in MB
    return overage * costPerUnit;
  }
  
  // Project 30 days ahead
  const projectedUsage = currentUsage + (growthRate * 30);
  if (projectedUsage > limit) {
    const overage = (projectedUsage - limit) / 1000;
    return overage * costPerUnit;
  }
  
  return 0;
};

export const calculateUsageProjection = (snapshots: UsageSnapshot[]): UsageProjection => {
  if (snapshots.length === 0) {
    return {
      projections: [],
      totalProjectedCost: 0,
      nextServiceToLimit: 'None',
      daysUntilFirstLimit: Infinity,
      confidenceLevel: 'low'
    };
  }

  const latest = snapshots[snapshots.length - 1];

  // Calculate growth rates
  const dbGrowth = calculateGrowthRate(snapshots, 'database_size_mb');
  const storageGrowth = calculateGrowthRate(snapshots, 'storage_size_mb');
  const functionsGrowth = calculateGrowthRate(snapshots, 'function_invocations');

  // Create projections for each service
  const projections: CostProjection[] = [
    {
      service: 'Database Storage',
      currentUsage: latest.database_size_mb || 0,
      limit: FREE_TIER_LIMITS.database,
      percentUsed: ((latest.database_size_mb || 0) / FREE_TIER_LIMITS.database) * 100,
      growthRate: dbGrowth,
      daysUntilLimit: estimateDaysUntilLimit(latest.database_size_mb || 0, FREE_TIER_LIMITS.database, dbGrowth),
      projectedMonthlyCost: calculateProjectedCost(
        latest.database_size_mb || 0,
        FREE_TIER_LIMITS.database,
        dbGrowth,
        ESTIMATED_COSTS.database
      ),
      status: getStatusFromDays(estimateDaysUntilLimit(latest.database_size_mb || 0, FREE_TIER_LIMITS.database, dbGrowth))
    },
    {
      service: 'Storage',
      currentUsage: latest.storage_size_mb || 0,
      limit: FREE_TIER_LIMITS.storage,
      percentUsed: ((latest.storage_size_mb || 0) / FREE_TIER_LIMITS.storage) * 100,
      growthRate: storageGrowth,
      daysUntilLimit: estimateDaysUntilLimit(latest.storage_size_mb || 0, FREE_TIER_LIMITS.storage, storageGrowth),
      projectedMonthlyCost: calculateProjectedCost(
        latest.storage_size_mb || 0,
        FREE_TIER_LIMITS.storage,
        storageGrowth,
        ESTIMATED_COSTS.storage
      ),
      status: getStatusFromDays(estimateDaysUntilLimit(latest.storage_size_mb || 0, FREE_TIER_LIMITS.storage, storageGrowth))
    },
    {
      service: 'Edge Functions',
      currentUsage: latest.function_invocations || 0,
      limit: FREE_TIER_LIMITS.functions,
      percentUsed: ((latest.function_invocations || 0) / FREE_TIER_LIMITS.functions) * 100,
      growthRate: functionsGrowth,
      daysUntilLimit: estimateDaysUntilLimit(latest.function_invocations || 0, FREE_TIER_LIMITS.functions, functionsGrowth),
      projectedMonthlyCost: calculateProjectedCost(
        latest.function_invocations || 0,
        FREE_TIER_LIMITS.functions,
        functionsGrowth,
        ESTIMATED_COSTS.functions / 1000000
      ),
      status: getStatusFromDays(estimateDaysUntilLimit(latest.function_invocations || 0, FREE_TIER_LIMITS.functions, functionsGrowth))
    }
  ];

  // Find service closest to limit
  const sortedByDays = [...projections].sort((a, b) => a.daysUntilLimit - b.daysUntilLimit);
  const nextToLimit = sortedByDays[0];

  // Calculate confidence based on data points
  let confidenceLevel: 'high' | 'medium' | 'low' = 'low';
  if (snapshots.length >= 30) confidenceLevel = 'high';
  else if (snapshots.length >= 14) confidenceLevel = 'medium';

  return {
    projections,
    totalProjectedCost: projections.reduce((sum, p) => sum + p.projectedMonthlyCost, 0),
    nextServiceToLimit: nextToLimit.service,
    daysUntilFirstLimit: nextToLimit.daysUntilLimit,
    confidenceLevel
  };
};

export const formatDaysUntilLimit = (days: number): string => {
  if (days === Infinity) return 'No limit projected';
  if (days === 0) return 'Limit reached';
  if (days < 30) return `${days} days`;
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${Math.round(days / 365)} years`;
};

export const formatCostEstimate = (cost: number): string => {
  if (cost === 0) return '$0 (Free tier)';
  if (cost < 1) return `$${cost.toFixed(2)}/mo`;
  return `$${Math.round(cost)}/mo`;
};