import { useState } from 'react';
import { ClaimStep } from '@/components/diamonds-form/ClaimStep';
import { QUOTE_ESTIMATOR_SAMPLE_THEMES } from '@/lib/quote-estimator-sample-themes';
import { buildQuoteEstimatorVars, resolveQuoteEstimatorTheme } from '@/lib/quote-estimator-theme';
import { Button } from '@/components/ui/button';

const SAMPLE_LINE_ITEMS = [
  { label: 'Diamond Type', value: 'Natural', price: 0 },
  { label: 'Diamond Shape', value: 'Round Brilliant', price: 0 },
  { label: 'Diamond Size', value: '1.50ct', price: 6200 },
  { label: 'Diamond Quality', value: 'VS1 · F', price: 900 },
  { label: 'Ring Setting', value: 'Hidden Halo', price: 750 },
  { label: 'Stone Holder', value: 'Four Prong', price: 0 },
  { label: 'Type of Band', value: 'Pavé', price: 600 },
  { label: 'Ring Metal', value: '18k Yellow Gold', price: 0 },
  { label: 'Personalization', value: 'Inside engraving', price: 0 },
  { label: 'Ring Size', value: '6.5', price: null },
  { label: 'Timeline', value: '4 Weeks', price: 0 },
];

/**
 * Internal preview for the Quote Estimator claim step. Switching a theme only
 * changes token values — layout, copy and behaviour stay identical. The
 * estimated-total disclosure is shown collapsed at 390px and expanded at
 * 672px so both states are provable.
 */
export default function QuoteEstimatorThemeLab() {
  const [index, setIndex] = useState(0);
  const sample = QUOTE_ESTIMATOR_SAMPLE_THEMES[index];
  const theme = resolveQuoteEstimatorTheme(null, sample.tokens);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Quote Estimator — Theme Lab</h1>
        <p className="text-sm text-muted-foreground">{sample.description}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {QUOTE_ESTIMATOR_SAMPLE_THEMES.map((t, i) => (
          <Button key={t.id} variant={i === index ? 'default' : 'outline'} size="sm" onClick={() => setIndex(i)}>
            {t.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {[390, 672].map((width) => (
          <div key={width} className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {width}px — total {width === 390 ? 'collapsed' : 'expanded'}
            </p>
            <div
              className="qe-glass overflow-x-hidden border border-border rounded-lg"
              style={{ width, maxWidth: '100%', ...(buildQuoteEstimatorVars(theme) as React.CSSProperties) }}
            >
              <ClaimStep
                key={`${sample.id}-${width}`}
                theme={theme}
                firstName="Alex"
                email="alex@example.com"
                shapeName="Round Brilliant"
                ringLines={['1.50ct · VS1 · F', '18k Yellow Gold · Hidden Halo']}
                total={8450}
                currency="USD"
                lineItems={SAMPLE_LINE_ITEMS}
                defaultBreakdownOpen={width === 672}
                creditAmount={1000}
                creditHoldDays={7}
                storeName="Our team"
                contactTiles={{
                  whatsapp: { enabled: true, value: '+15555550123' },
                  call: { enabled: true, value: '+15555550123' },
                  email: { enabled: true, value: 'hello@example.com' },
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
