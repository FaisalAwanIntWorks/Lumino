import { describe, expect, it } from 'vitest';
import { deriveShortLabel } from './lib/wizard-utils';

describe('Custom X question step names', () => {
  it.each([
    ['What type of settings you want?', 'SETTINGS'],
    ['What cut you want?', 'CUT'],
    ['What kind of cut you want?', 'CUT'],
    ['What is your ring size?', 'RING SIZE'],
    ['Engraving text (optional)', 'ENGRAVING TEXT'],
    ['What?', 'QUESTION'],
    ['', 'QUESTION'],
  ])('derives a useful label for %j', (question, expected) => {
    expect(deriveShortLabel(question)).toBe(expected);
  });
});