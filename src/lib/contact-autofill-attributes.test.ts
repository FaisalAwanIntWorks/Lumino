import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');

describe('desktop autofill: contact fields are labelled', () => {
  it('wizard contact step links labels to name/email/phone fields', () => {
    const s = read('src/components/form-wizard/WizardContactStep.tsx');
    for (const id of ['nameId', 'emailId', 'phoneId']) {
      expect(s).toContain(`htmlFor={${id}}`);
      expect(s).toContain(`id={${id}}`);
    }
  });

  it('shared phone field keeps tel token and an accessible name', () => {
    const s = read('src/components/ui/country-phone-input.tsx');
    expect(s).toContain('autoComplete="tel"');
    expect(s).toContain('aria-label="Phone number"');
    expect(s).toContain('id={id}');
  });

  it('placeholder-only contact forms name their fields', () => {
    expect(read('src/components/diamonds-form/DiamondContactStep.tsx')).toContain('autoComplete="given-name" aria-label="First name"');
    expect(read('src/components/metal-buying/MetalBuyingForm.tsx')).toContain('autoComplete="email" aria-label="Email"');
  });

  it('quote estimator spam trap sits outside the contact form (one-tap group fill)', () => {
    const s = read('src/components/diamonds-form/DiamondContactStep.tsx');
    expect(s.indexOf('name="jx_hp_ref"')).toBeGreaterThan(-1);
    expect(s.indexOf('name="jx_hp_ref"')).toBeLessThan(s.indexOf('<form'));
  });
});
