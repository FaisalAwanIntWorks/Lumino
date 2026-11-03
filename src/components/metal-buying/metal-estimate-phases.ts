import type { Phase } from '@/components/form-wizard/ai-generation-phases';

export function getMetalEstimatePhases(metal: string, karat?: string): Phase[] {
  const metalName = metal.charAt(0).toUpperCase() + metal.slice(1);
  const karatLabel = karat || '';
  
  return [
    {
      title: 'Checking Live Market',
      statements: [
        'Connecting to global metal exchanges...',
        `Pulling real-time spot price for ${metalName}...`,
        karatLabel ? `Verifying ${karatLabel} purity premium...` : 'Analyzing purity factors...',
        'Syncing with latest market data...',
      ],
    },
    {
      title: 'Calculating Your Offer',
      statements: [
        'Applying weight-to-value conversion...',
        'Factoring in current market conditions...',
        'Comparing against competitor rates...',
        'Trying to get you the best price...',
      ],
    },
    {
      title: 'Preparing Your Estimate',
      statements: [
        'Finalizing your personalized offer...',
        'Running profit analysis...',
        'Generating comparison report...',
      ],
    },
  ];
}
